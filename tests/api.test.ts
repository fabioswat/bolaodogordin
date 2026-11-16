import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

process.env.BCRYPT_COST = '4';
const { openDatabase } = await import('../src/server/db.ts');
const { buildApp } = await import('../src/server/app.ts');
const { createUser } = await import('../src/server/services/users.ts');

type Json = Record<string, any>;

class Client {
  cookie = '';
  app: FastifyInstance;
  constructor(app: FastifyInstance) { this.app = app; }
  async req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.inject({
      method: method as any, url,
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      payload: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers['set-cookie'];
    const first = Array.isArray(set) ? set[0] : set;
    if (first) this.cookie = first.split(';')[0];
    return { status: res.statusCode, body: (res.body ? JSON.parse(res.body) : null) as Json, headers: res.headers };
  }
}

let app: FastifyInstance;
let db: ReturnType<typeof openDatabase>;
let admin: Client, ana: Client, bia: Client, anon: Client;
let anaId: number, biaId: number, poolId: number;

async function loginAndChange(c: Client, nickname: string, temp: string) {
  let r = await c.req('POST', '/api/auth/login', { nickname, password: temp });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.mustChangePassword, true);
  r = await c.req('POST', '/api/auth/change-password', { currentPassword: temp, newPassword: `${nickname}-senha-nova` });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

before(async () => {
  db = openDatabase(':memory:');
  app = await buildApp({ db });
  admin = new Client(app); ana = new Client(app); bia = new Client(app); anon = new Client(app);
  const a = createUser(db, null, { nickname: 'admin', displayName: 'Admin', role: 'admin' });
  await loginAndChange(admin, 'admin', a.tempPassword);
});

describe('autenticação e usuários', () => {
  test('rejeita senha incorreta e bloqueia após 5 falhas', async () => {
    const c = new Client(app);
    for (let i = 0; i < 5; i++) assert.equal((await c.req('POST', '/api/auth/login', { nickname: 'admin', password: 'errada' })).status, 401);
    assert.equal((await c.req('POST', '/api/auth/login', { nickname: 'admin', password: 'admin-senha-nova' })).status, 429);
  });

  test('admin cria participantes e senha provisória exige troca', async () => {
    let r = await admin.req('POST', '/api/admin/users', { nickname: 'Ana', displayName: 'Ana Souza', role: 'participant' });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.nickname, 'ana');
    anaId = r.body.user.id;
    const anaTemp = r.body.tempPassword;

    await ana.req('POST', '/api/auth/login', { nickname: 'ana', password: anaTemp });
    r = await ana.req('GET', '/api/me/pools');
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'PASSWORD_CHANGE_REQUIRED');
    r = await ana.req('POST', '/api/auth/change-password', { currentPassword: anaTemp, newPassword: 'curta' });
    assert.equal(r.status, 400);
    r = await ana.req('POST', '/api/auth/change-password', { currentPassword: anaTemp, newPassword: 'ana-senha-nova' });
    assert.equal(r.status, 200);
    assert.equal((await ana.req('GET', '/api/me/pools')).status, 200);

    r = await admin.req('POST', '/api/admin/users', { nickname: 'bia', displayName: 'Bia Lima', role: 'participant' });
    biaId = r.body.user.id;
    await loginAndChange(bia, 'bia', r.body.tempPassword);
  });

  test('nick duplicado e nick inválido', async () => {
    assert.equal((await admin.req('POST', '/api/admin/users', { nickname: 'ANA', displayName: 'X', role: 'participant' })).status, 409);
    assert.equal((await admin.req('POST', '/api/admin/users', { nickname: 'a b', displayName: 'X', role: 'participant' })).status, 400);
  });

  test('participante e visitante não acessam a administração', async () => {
    assert.equal((await ana.req('GET', '/api/admin/users')).status, 403);
    assert.equal((await anon.req('GET', '/api/admin/users')).status, 401);
    assert.equal((await anon.req('GET', '/api/me/pools')).status, 401);
  });

  test('requisição de outra origem é recusada', async () => {
    const r = await admin.req('POST', '/api/admin/users', { nickname: 'zzz', displayName: 'Z', role: 'participant' },
      { origin: 'https://site-malicioso.example' });
    assert.equal(r.status, 403);
  });

  test('origem pública configurada é aceita', async () => {
    const app2 = await buildApp({ db, allowedOrigins: ['https://bolao.exemplo.com'] });
    const r = await app2.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin: 'https://bolao.exemplo.com', host: 'localhost:3000' } });
    assert.equal(r.statusCode, 200);
    const bad = await app2.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin: 'https://outro.com', host: 'localhost:3000' } });
    assert.equal(bad.statusCode, 403);
    await app2.close();
  });

  test('admin não pode se desativar', async () => {
    const me = (await admin.req('GET', '/api/auth/me')).body.user;
    const r = await admin.req('PUT', `/api/admin/users/${me.id}`, { displayName: 'Admin', role: 'admin', isActive: false });
    assert.equal(r.status, 400);
  });
});

describe('bolões e jogos', () => {
  test('admin cria bolão e adiciona participantes', async () => {
    let r = await admin.req('POST', '/api/admin/pools', {
      name: 'Mega da Virada 2026', contestNumber: 2955, drawDate: '2026-12-31', priceCents: 600, maxGamesPerParticipant: 2,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    poolId = r.body.id;
    assert.equal(r.body.status, 'open');
    assert.equal((await admin.req('POST', '/api/admin/pools', { name: 'X', contestNumber: 1, drawDate: '2026-02-30', priceCents: 1, maxGamesPerParticipant: 1 })).status, 400);

    assert.equal((await admin.req('POST', `/api/admin/pools/${poolId}/members`, { userId: anaId })).status, 201);
    assert.equal((await admin.req('POST', `/api/admin/pools/${poolId}/members`, { userId: anaId })).status, 409);
  });

  test('não membro não cadastra jogo', async () => {
    const r = await bia.req('POST', `/api/me/pools/${poolId}/games`, { numbers: [1, 2, 3, 4, 5, 6] });
    assert.equal(r.status, 403);
    await admin.req('POST', `/api/admin/pools/${poolId}/members`, { userId: biaId });
  });

  test('validação das dezenas no servidor', async () => {
    for (const numbers of [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 61], [1, 1, 2, 3, 4, 5], 'x']) {
      assert.equal((await ana.req('POST', `/api/me/pools/${poolId}/games`, { numbers })).status, 400);
    }
  });

  test('duplicidade no bolão independe da ordem e do dono; limite por participante', async () => {
    let r = await ana.req('POST', `/api/me/pools/${poolId}/games`, { numbers: [60, 1, 15, 22, 33, 44] });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.numbers, [1, 15, 22, 33, 44, 60]);
    assert.match(r.body.code, /^[A-Z2-9]{6}$/);

    r = await bia.req('POST', `/api/me/pools/${poolId}/games`, { numbers: [44, 33, 22, 15, 1, 60] });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /já foi registrada/);

    assert.equal((await ana.req('POST', `/api/me/pools/${poolId}/games`, { numbers: [2, 3, 4, 5, 6, 7] })).status, 201);
    r = await ana.req('POST', `/api/me/pools/${poolId}/games`, { numbers: [8, 9, 10, 11, 12, 13] });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /Limite/);
  });

  test('excluir libera a combinação e a vaga do limite', async () => {
    const games = (await ana.req('GET', `/api/me/pools/${poolId}/games`)).body as Json[];
    const target = games.find((g) => g.numbers.join() === '1,15,22,33,44,60')!;
    assert.equal((await ana.req('DELETE', `/api/me/games/${target.id}`)).status, 200);
    assert.equal((await bia.req('POST', `/api/me/pools/${poolId}/games`, { numbers: [1, 15, 22, 33, 44, 60] })).status, 201);
    assert.equal((await ana.req('POST', `/api/me/pools/${poolId}/games`, { numbers: [8, 9, 10, 11, 12, 13] })).status, 201);
  });

  test('participante não altera jogo de outro', async () => {
    const biaGame = ((await bia.req('GET', `/api/me/pools/${poolId}/games`)).body as Json[])[0];
    assert.equal((await ana.req('PUT', `/api/me/games/${biaGame.id}`, { numbers: [20, 21, 22, 23, 24, 25] })).status, 404);
    assert.equal((await ana.req('DELETE', `/api/me/games/${biaGame.id}`)).status, 404);
  });

  test('edição não pode gerar duplicidade', async () => {
    const anaGames = (await ana.req('GET', `/api/me/pools/${poolId}/games`)).body as Json[];
    const r = await ana.req('PUT', `/api/me/games/${anaGames[0].id}`, { numbers: [1, 15, 22, 33, 44, 60] });
    assert.equal(r.status, 409);
    assert.equal((await ana.req('PUT', `/api/me/games/${anaGames[0].id}`, { numbers: [2, 3, 4, 5, 6, 59] })).status, 200);
  });

  test('mesma combinação permitida em outro bolão', async () => {
    const r = await admin.req('POST', '/api/admin/pools', { name: 'Outro', contestNumber: 3000, drawDate: '2027-01-10', priceCents: 500, maxGamesPerParticipant: 3 });
    const other = r.body.id;
    await admin.req('POST', `/api/admin/pools/${other}/members`, { userId: anaId });
    assert.equal((await ana.req('POST', `/api/me/pools/${other}/games`, { numbers: [1, 15, 22, 33, 44, 60] })).status, 201);
  });

  test('bloqueio impede participante; admin continua editando e cria jogo próprio', async () => {
    assert.equal((await admin.req('POST', `/api/admin/pools/${poolId}/status`, { status: 'locked' })).status, 200);
    assert.equal((await ana.req('POST', `/api/me/pools/${poolId}/games`, { numbers: [30, 31, 32, 33, 34, 35] })).status, 409);
    const anaGames = (await ana.req('GET', `/api/me/pools/${poolId}/games`)).body as Json[];
    assert.equal((await ana.req('DELETE', `/api/me/games/${anaGames[0].id}`)).status, 409);
    assert.equal((await ana.req('PUT', `/api/me/games/${anaGames[0].id}`, { numbers: [30, 31, 32, 33, 34, 35] })).status, 409);

    const r = await admin.req('PUT', `/api/admin/games/${anaGames[0].id}`, { numbers: [10, 20, 30, 40, 50, 60], reason: 'Correção pedida pela Ana' });
    assert.equal(r.status, 200);
    assert.equal((await admin.req('POST', `/api/me/pools/${poolId}/games`, { numbers: [5, 10, 15, 20, 25, 30] })).status, 201);
    const members = (await admin.req('GET', `/api/admin/pools/${poolId}/members`)).body as Json[];
    assert.ok(members.some((m) => m.nickname === 'admin'));

    const audit = (await admin.req('GET', `/api/admin/pools/${poolId}/audit`)).body as Json[];
    const entry = audit.find((a) => a.action === 'game.updated_by_admin')!;
    assert.equal(entry.reason, 'Correção pedida pela Ana');
    assert.deepEqual(entry.before.numbers, [2, 3, 4, 5, 6, 59]);
  });
});

describe('pagamentos, resultado e página pública', () => {
  test('valor devido por jogo ativo e marcação pago/pendente', async () => {
    let members = (await admin.req('GET', `/api/admin/pools/${poolId}/members`)).body as Json[];
    let anaM = members.find((m) => m.userId === anaId)!;
    assert.equal(anaM.games, 2);
    assert.equal(anaM.dueCents, 1200);
    assert.equal(anaM.paymentStatus, 'pending');

    const r = await admin.req('POST', `/api/admin/pools/${poolId}/members/${anaId}/payment`, { status: 'paid' });
    assert.equal(r.status, 200);
    assert.equal(r.body.paymentStatus, 'paid');
    assert.equal(r.body.paidCents, 1200);

    const me = ((await ana.req('GET', '/api/me/pools')).body as Json[]).find((p) => p.id === poolId)!;
    assert.equal(me.paymentStatus, 'paid');
    assert.equal(me.canEdit, false);

    await admin.req('POST', `/api/admin/pools/${poolId}/status`, { status: 'open' });
    await ana.req('DELETE', `/api/me/games/${((await ana.req('GET', `/api/me/pools/${poolId}/games`)).body as Json[])[1].id}`);
    await ana.req('POST', `/api/me/pools/${poolId}/games`, { numbers: [41, 42, 43, 44, 45, 46] });
    members = (await admin.req('GET', `/api/admin/pools/${poolId}/members`)).body as Json[];
    anaM = members.find((m) => m.userId === anaId)!;
    assert.equal(anaM.paymentStatus, 'paid');

    assert.equal((await admin.req('POST', `/api/admin/pools/${poolId}/members/${biaId}/payment`, { status: 'pending' })).status, 200);
    assert.equal((await ana.req('POST', `/api/admin/pools/${poolId}/members/${anaId}/payment`, { status: 'paid' })).status, 403);
  });

  test('resultado e conferência; participante não altera após resultado', async () => {
    assert.equal((await admin.req('PUT', `/api/admin/pools/${poolId}/result`, { numbers: [1, 2, 3] })).status, 400);
    const r = await admin.req('PUT', `/api/admin/pools/${poolId}/result`, { numbers: [10, 20, 30, 40, 50, 1] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.result, [1, 10, 20, 30, 40, 50]);

    const pub = (await anon.req('GET', `/api/public/pools/${poolId}`)).body;
    assert.equal(pub.tiers.quina, 1); // 10-20-30-40-50-60
    assert.equal(pub.games[0].hits, 5);
    assert.equal(pub.stats.games, 4);
    assert.equal(pub.stats.participants, 3);
    assert.equal(pub.stats.expectedCents, 2400);
    assert.equal(pub.stats.receivedCents, 1200);

    assert.equal((await ana.req('POST', `/api/me/pools/${poolId}/games`, { numbers: [50, 51, 52, 53, 54, 55] })).status, 409);
  });

  test('página pública não expõe donos nem ids internos', async () => {
    const r = await anon.req('GET', `/api/public/pools/${poolId}`);
    const text = JSON.stringify(r.body);
    for (const leak of ['ana', 'Ana Souza', 'bia', 'userId', 'user_id', 'ownerNickname', 'paidCents']) {
      assert.ok(!text.includes(leak), `vazou: ${leak}`);
    }
    assert.deepEqual(Object.keys(r.body.games[0]).sort(), ['code', 'hits', 'numbers', 'tier']);
    const list = (await anon.req('GET', '/api/public/pools')).body as Json[];
    assert.equal(list.length, 2);
  });

  test('remoção de participante exige ausência de jogos ativos', async () => {
    assert.equal((await admin.req('DELETE', `/api/admin/pools/${poolId}/members/${biaId}`)).status, 409);
  });

  test('desativar usuário encerra a sessão; redefinir senha gera nova provisória', async () => {
    await admin.req('PUT', `/api/admin/users/${biaId}`, { displayName: 'Bia Lima', role: 'participant', isActive: false });
    assert.equal((await bia.req('GET', '/api/me/pools')).status, 401);
    await admin.req('PUT', `/api/admin/users/${biaId}`, { displayName: 'Bia Lima', role: 'participant', isActive: true });
    const r = await admin.req('POST', `/api/admin/users/${biaId}/reset-password`);
    assert.equal(r.status, 200);
    const login = await bia.req('POST', '/api/auth/login', { nickname: 'bia', password: r.body.tempPassword });
    assert.equal(login.body.user.mustChangePassword, true);
  });

  test('logout invalida a sessão', async () => {
    await ana.req('POST', '/api/auth/logout');
    assert.equal((await ana.req('GET', '/api/auth/me')).body.user, null);
  });

  test('cabeçalhos de segurança', async () => {
    const r = await anon.req('GET', '/api/health');
    assert.equal(r.headers['x-frame-options'], 'DENY');
    assert.ok(String(r.headers['content-security-policy']).includes("default-src 'self'"));
  });
});

describe('convites e nomes nos jogos', () => {
  let token = '';
  let novo: Client;

  test('admin gera convite; visitante consulta e se cadastra', async () => {
    let r = await admin.req('POST', '/api/admin/invites', { poolId, days: 7, note: 'Caio do RH' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    token = r.body.token;
    assert.equal(r.body.invite.status, 'pending');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM invites WHERE token_hash = ?').get(token)!.n, 0, 'token não fica em texto puro');

    const c = new Client(app);
    r = await c.req('POST', '/api/invites/check', { token });
    assert.equal(r.status, 200);
    assert.ok(r.body.poolName);

    r = await c.req('POST', '/api/invites/accept', { token, nickname: 'caio', displayName: 'Caio', password: 'curta' });
    assert.equal(r.status, 400);
    r = await c.req('POST', '/api/invites/accept', { token, nickname: 'ana', displayName: 'Caio', password: 'senha-do-caio' });
    assert.equal(r.status, 409, 'nick já usado');
    r = await c.req('POST', '/api/invites/accept', { token, nickname: 'Caio', displayName: 'Caio Prado', password: 'senha-do-caio' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.user.nickname, 'caio');
    assert.equal(r.body.user.mustChangePassword, false);
    const pools = (await c.req('GET', '/api/me/pools')).body as Json[];
    assert.ok(pools.some((p) => p.id === poolId), 'entra direto no bolão');
    novo = c;
  });

  test('convite é de uso único e aparece como usado', async () => {
    const r = await anon.req('POST', '/api/invites/accept', { token, nickname: 'outro', displayName: 'Outro', password: 'senha-do-outro' });
    assert.equal(r.status, 410);
    assert.equal((await anon.req('POST', '/api/invites/check', { token })).status, 410);
    const list = (await admin.req('GET', '/api/admin/invites')).body as Json[];
    assert.equal(list[0].status, 'used');
    assert.equal(list[0].usedBy.nickname, 'caio');
  });

  test('convite cancelado, expirado ou inválido não funciona', async () => {
    let r = await admin.req('POST', '/api/admin/invites', { poolId, days: 7 });
    const t2 = r.body.token;
    assert.equal((await admin.req('DELETE', `/api/admin/invites/${r.body.invite.id}`)).status, 200);
    assert.equal((await anon.req('POST', '/api/invites/check', { token: t2 })).status, 410);

    r = await admin.req('POST', '/api/admin/invites', { poolId, days: 7 });
    db.prepare('UPDATE invites SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', r.body.invite.id);
    assert.equal((await anon.req('POST', '/api/invites/check', { token: r.body.token })).status, 410);

    assert.equal((await anon.req('POST', '/api/invites/check', { token: 'x'.repeat(32) })).status, 404);
    assert.equal((await admin.req('POST', '/api/admin/invites', { poolId, days: 999 })).status, 400);
    assert.equal((await novo.req('POST', '/api/admin/invites', { poolId, days: 7 })).status, 403);
  });

  test('nomes nos jogos só para participante logado do bolão', async () => {
    let r = await anon.req('GET', `/api/public/pools/${poolId}`);
    assert.equal(r.body.showOwners, false);
    assert.ok(!JSON.stringify(r.body).includes('Ana Souza'));

    r = await novo.req('GET', `/api/public/pools/${poolId}`);
    assert.equal(r.body.showOwners, true);
    assert.ok((r.body.games as Json[]).some((g) => g.owner === 'Ana Souza'));
    assert.deepEqual(Object.keys(r.body.games[0]).sort(), ['code', 'hits', 'numbers', 'owner', 'tier']);

    r = await admin.req('GET', `/api/public/pools/${poolId}`);
    assert.equal(r.body.showOwners, true);
  });

  test('participante de outro bolão não vê nomes', async () => {
    const r = await admin.req('POST', '/api/admin/users', { nickname: 'dani', displayName: 'Dani', role: 'participant' });
    const dani = new Client(app);
    await loginAndChange(dani, 'dani', r.body.tempPassword);
    assert.equal((await dani.req('GET', `/api/public/pools/${poolId}`)).body.showOwners, false);
  });
});

describe('exclusão de usuário', () => {
  let pool2: number, uid: number;
  const amigo = () => new Client(app);
  let c: Client;
  const jogo = [5, 10, 15, 20, 25, 30];

  async function convidar(nick: string) {
    const inv = await admin.req('POST', '/api/admin/invites', { poolId: pool2, days: 7 });
    const cl = amigo();
    const r = await cl.req('POST', '/api/invites/accept', { token: inv.body.token, nickname: nick, displayName: 'Amigo Teste', password: 'senha-amigo-1' });
    return { cl, r };
  }

  test('prepara: amigo entra por convite e faz jogos', async () => {
    const p = await admin.req('POST', '/api/admin/pools', { name: 'Bolão teste exclusão', contestNumber: 9001, drawDate: '2027-01-01', priceCents: 500, maxGamesPerParticipant: 3 });
    pool2 = p.body.id;
    const { cl, r } = await convidar('amigo');
    assert.equal(r.status, 201);
    uid = r.body.user.id;
    c = cl;
    assert.equal((await c.req('POST', `/api/me/pools/${pool2}/games`, { numbers: jogo })).status, 201);
    assert.equal((await c.req('POST', `/api/me/pools/${pool2}/games`, { numbers: [1, 2, 3, 4, 5, 6] })).status, 201);
    const u = ((await admin.req('GET', '/api/admin/users')).body as Json[]).find((x) => x.id === uid)!;
    assert.equal(u.activeGames, 2);
  });

  test('não exclui com pagamento registrado nem a própria conta', async () => {
    await admin.req('POST', `/api/admin/pools/${pool2}/members/${uid}/payment`, { status: 'paid' });
    assert.equal((await admin.req('DELETE', `/api/admin/users/${uid}`)).status, 409);
    await admin.req('POST', `/api/admin/pools/${pool2}/members/${uid}/payment`, { status: 'pending' });
    const me = (await admin.req('GET', '/api/auth/me')).body.user;
    assert.equal((await admin.req('DELETE', `/api/admin/users/${me.id}`)).status, 400);
    assert.equal((await c.req('DELETE', `/api/admin/users/${uid}`)).status, 403);
  });

  test('exclui: acesso, jogos, participação e nick liberados', async () => {
    const r = await admin.req('DELETE', `/api/admin/users/${uid}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { gamesDeleted: 2, poolsLeft: 1 });
    assert.equal((await c.req('GET', '/api/me/pools')).status, 401, 'sessão encerrada');
    assert.equal((await amigo().req('POST', '/api/auth/login', { nickname: 'amigo', password: 'senha-amigo-1' })).status, 401);
    const pub = await anon.req('GET', `/api/public/pools/${pool2}`);
    assert.equal(pub.body.games.length, 0);
    assert.equal(pub.body.stats.participants, 0);
    const u = ((await admin.req('GET', '/api/admin/users')).body as Json[]).find((x) => x.id === uid)!;
    assert.equal(u.deleted, true);
    assert.equal((await admin.req('DELETE', `/api/admin/users/${uid}`)).status, 404);
    assert.equal((await admin.req('PUT', `/api/admin/users/${uid}`, { displayName: 'X', role: 'participant', isActive: true })).status, 404);
    const audit = (await admin.req('GET', `/api/admin/pools/${pool2}/audit`)).body as Json[];
    assert.ok(audit.some((a) => a.action === 'game.deleted_by_admin' && a.reason === 'Usuário excluído'));
  });

  test('mesmo nick pode se cadastrar de novo e refazer o mesmo jogo', async () => {
    const { cl, r } = await convidar('amigo');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.notEqual(r.body.user.id, uid);
    assert.equal((await cl.req('POST', `/api/me/pools/${pool2}/games`, { numbers: jogo })).status, 201, 'combinação liberada');
  });
});

describe('dezenas por bolão e Pix', () => {
  let pool8: number, c: Client, uid: number;

  test('admin cria bolão de 8 dezenas com Pix; chave inválida é recusada', async () => {
    const base = { name: 'Bolão 8 dezenas', contestNumber: 9100, drawDate: '2027-02-01', priceCents: 600, maxGamesPerParticipant: 3 };
    assert.equal((await admin.req('POST', '/api/admin/pools', { ...base, numbersPerGame: 21 })).status, 400);
    assert.equal((await admin.req('POST', '/api/admin/pools', { ...base, numbersPerGame: 8, pixKey: '11 99999-8888', pixName: 'X', pixCity: 'Y' })).status, 400);
    assert.equal((await admin.req('POST', '/api/admin/pools', { ...base, numbersPerGame: 8, pixKey: 'gordin@exemplo.com' })).status, 400, 'exige nome e cidade');
    const r = await admin.req('POST', '/api/admin/pools', { ...base, numbersPerGame: 8, pixKey: 'Gordin@Exemplo.com', pixName: 'Gordin da Silva', pixCity: 'Campinas', pixBank: 'Mercado Pago' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    pool8 = r.body.id;
    assert.equal(r.body.numbersPerGame, 8);
    assert.equal(r.body.pixKey, 'gordin@exemplo.com');
    const inv = await admin.req('POST', '/api/admin/invites', { poolId: pool8, days: 7 });
    c = new Client(app);
    const acc = await c.req('POST', '/api/invites/accept', { token: inv.body.token, nickname: 'oito', displayName: 'Oito', password: 'senha-oito-123' });
    uid = acc.body.user.id;
  });

  test('jogo precisa ter a quantidade do bolão', async () => {
    assert.equal((await c.req('POST', `/api/me/pools/${pool8}/games`, { numbers: [1, 2, 3, 4, 5, 6] })).status, 400);
    assert.equal((await c.req('POST', `/api/me/pools/${pool8}/games`, { numbers: [1, 2, 3, 4, 5, 6, 7, 8] })).status, 201);
    assert.equal((await c.req('POST', `/api/me/pools/${pool8}/games`, { numbers: [8, 7, 6, 5, 4, 3, 2, 1] })).status, 409, 'duplicado');
    const pub = await anon.req('GET', `/api/public/pools/${pool8}`);
    assert.equal(pub.body.pool.numbersPerGame, 8);
    assert.equal(pub.body.games[0].numbers.length, 8);
  });

  test('Pix do participante tem o valor pendente e some quando pago', async () => {
    let me = ((await c.req('GET', '/api/me/pools')).body as Json[]).find((p) => p.id === pool8)!;
    assert.equal(me.pix.amountCents, 600);
    assert.equal(me.pix.name, 'Gordin da Silva');
    assert.equal(me.pix.bank, 'Mercado Pago');
    assert.ok(me.pix.payload.includes('br.gov.bcb.pix0118gordin@exemplo.com'));
    assert.ok(me.pix.payload.includes('54046.00'));
    assert.ok(me.pix.payload.includes(`BOLAO${pool8}U${uid}`));
    await admin.req('POST', `/api/admin/pools/${pool8}/members/${uid}/payment`, { status: 'paid' });
    me = ((await c.req('GET', '/api/me/pools')).body as Json[]).find((p) => p.id === pool8)!;
    assert.equal(me.pix, null);
    assert.equal(me.pixConfigured, true);
  });

  test('não muda a quantidade de dezenas com jogos; resultado continua com 6', async () => {
    const pool = (await admin.req('GET', `/api/admin/pools/${pool8}`)).body;
    const body = { name: pool.name, contestNumber: pool.contestNumber, drawDate: pool.drawDate, priceCents: pool.priceCents,
      maxGamesPerParticipant: pool.maxGamesPerParticipant, pixKey: pool.pixKey, pixName: pool.pixName, pixCity: pool.pixCity };
    assert.equal((await admin.req('PUT', `/api/admin/pools/${pool8}`, { ...body, numbersPerGame: 10 })).status, 409);
    assert.equal((await admin.req('PUT', `/api/admin/pools/${pool8}`, { ...body, numbersPerGame: 8, pixKey: '' })).status, 200, 'pode remover o Pix');
    assert.equal((await admin.req('PUT', `/api/admin/pools/${pool8}/result`, { numbers: [1, 2, 3, 4, 5, 6, 7, 8] })).status, 400);
    assert.equal((await admin.req('PUT', `/api/admin/pools/${pool8}/result`, { numbers: [1, 2, 3, 4, 5, 9] })).status, 200);
    const pub = await anon.req('GET', `/api/public/pools/${pool8}`);
    assert.equal(pub.body.games[0].hits, 5);
    assert.equal(pub.body.games[0].tier, 'quina');
  });
});

describe('ordem da lista de jogos', () => {
  test('agrupa por participante (nome com acento/maiúscula) e mantém a ordem de criação; igual para visitantes', async () => {
    const p = await admin.req('POST', '/api/admin/pools', { name: 'Ordem', contestNumber: 9200, drawDate: '2027-03-01', priceCents: 100, maxGamesPerParticipant: 3 });
    const poolId = p.body.id;
    const players: Record<string, Client> = {};
    for (const [nick, name] of [['zeca', 'Zeca'], ['alvaro', 'Álvaro'], ['bruna', 'bruna']]) {
      const inv = await admin.req('POST', '/api/admin/invites', { poolId, days: 7 });
      const c = new Client(app);
      await c.req('POST', '/api/invites/accept', { token: inv.body.token, nickname: nick, displayName: name, password: `senha-${nick}-123` });
      players[nick] = c;
    }
    // Jogos intercalados entre as pessoas, para garantir que a ordem não é a de criação geral.
    const plan: [string, number[]][] = [
      ['zeca', [1, 2, 3, 4, 5, 6]], ['alvaro', [50, 51, 52, 53, 54, 55]], ['bruna', [7, 8, 9, 10, 11, 12]],
      ['alvaro', [10, 20, 30, 40, 50, 60]], ['zeca', [13, 14, 15, 16, 17, 18]],
    ];
    const codes: Record<string, string[]> = { zeca: [], alvaro: [], bruna: [] };
    for (const [nick, numbers] of plan) {
      const r = await players[nick].req('POST', `/api/me/pools/${poolId}/games`, { numbers });
      codes[nick].push(r.body.code);
    }
    const logged = (await players.bruna.req('GET', `/api/public/pools/${poolId}`)).body.games as Json[];
    assert.deepEqual(logged.map((g) => g.owner), ['Álvaro', 'Álvaro', 'bruna', 'Zeca', 'Zeca']);
    assert.deepEqual(logged.map((g) => g.code), [...codes.alvaro, ...codes.bruna, ...codes.zeca]);
    const anonGames = (await anon.req('GET', `/api/public/pools/${poolId}`)).body.games as Json[];
    assert.deepEqual(anonGames.map((g) => g.code), logged.map((g) => g.code));
    assert.ok(anonGames.every((g) => g.owner === undefined));
  });
});

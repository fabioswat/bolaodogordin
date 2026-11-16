import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { DB } from './db.ts';
import type { SessionUser } from './auth.ts';
import {
  LoginLimiter, SESSION_COOKIE, SESSION_DAYS, createSession, deleteSession, getSessionUser,
  purgeExpiredSessions, verifyDummy, verifyPassword,
} from './auth.ts';
import { HttpError, asBody, forbidden, idParam, int, isoDate, oneOf, str } from './http.ts';
import { changePassword, createUser, deleteUser, findUserByNickname, listUsers, resetPassword, updateUser } from './services/users.ts';
import type { PoolInput } from './services/pools.ts';
import {
  POOL_STATUSES, addMember, createPool, getPool, isMember, listMembers, listPools, participantCanEdit, poolStats,
  publicPoolView, removeMember, setPayment, setPoolResult, setPoolStatus, updatePool,
} from './services/pools.ts';
import { createGame, deleteGame, listPoolGamesAdmin, listUserGames, updateGame } from './services/games.ts';
import { listPoolAudit } from './services/audit.ts';
import { INVITE_MAX_DAYS, acceptInvite, createInvite, inviteInfo, listInvites, revokeInvite } from './services/invites.ts';
import { MAX_GAME_NUMBERS, MIN_GAME_NUMBERS, paymentStatus } from '../shared/rules.ts';
import { buildPixPayload, normalizePixKey } from '../shared/pix.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export interface AppOptions {
  db: DB;
  logger?: boolean;
  cookieSecure?: boolean;
  trustProxy?: boolean;
  allowedOrigins?: string[];
  webDir?: string | null;
}

const ROLES = ['admin', 'participant'] as const;

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const { db } = opts;
  const app = Fastify({
    logger: opts.logger
      ? { level: 'info', redact: ['req.headers.cookie', 'req.headers.authorization'] }
      : false,
    trustProxy: opts.trustProxy ?? false,
    bodyLimit: 64 * 1024,
  });
  const limiter = new LoginLimiter();

  await app.register(cookie);
  app.decorateRequest('user', null);

  // Cabeçalhos de segurança em todas as respostas.
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  });

  // Proteção CSRF: alterações vindas de outro site são recusadas; sessão carregada pelo cookie.
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin) {
        const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
        let originHost = '';
        try { originHost = new URL(origin).host; } catch { /* inválido */ }
        const allowed = originHost === host || (opts.allowedOrigins ?? []).includes(origin.replace(/\/$/, ''));
        if (!allowed) throw forbidden('Origem da requisição não permitida.');
      }
    }
    req.user = getSessionUser(db, req.cookies[SESSION_COOKIE]);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: err.message, code: err.code });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: 'Requisição inválida.' });
    }
    req.log.error(err);
    return reply.status(500).send({ error: 'Erro interno. Tente novamente.' });
  });

  const requireUser = (req: FastifyRequest, allowPendingPassword = false): SessionUser => {
    if (!req.user) throw new HttpError(401, 'Faça login para continuar.', 'UNAUTHENTICATED');
    if (req.user.mustChangePassword && !allowPendingPassword) {
      throw new HttpError(403, 'Troque sua senha provisória para continuar.', 'PASSWORD_CHANGE_REQUIRED');
    }
    return req.user;
  };
  const requireAdmin = (req: FastifyRequest): SessionUser => {
    const user = requireUser(req);
    if (user.role !== 'admin') throw forbidden('Área restrita ao administrador.');
    return user;
  };

  const setSessionCookie = (reply: FastifyReply, token: string) => {
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/', httpOnly: true, sameSite: 'lax', secure: opts.cookieSecure ?? false, maxAge: SESSION_DAYS * 86_400,
    });
  };

  // ---------- Saúde ----------
  app.get('/api/health', async () => {
    db.prepare('SELECT 1').get();
    return { ok: true };
  });

  // ---------- Público ----------
  app.get('/api/public/pools', async () =>
    listPools(db).map((p) => ({ id: p.id, name: p.name, contestNumber: p.contestNumber, drawDate: p.drawDate, status: p.status })));

  // Quem está logado e participa do bolão (ou é admin) vê o nome de quem cadastrou cada jogo.
  app.get('/api/public/pools/:id', async (req) => {
    const id = idParam((req.params as { id: string }).id);
    const u = req.user;
    const showOwners = !!u && !u.mustChangePassword && (u.role === 'admin' || isMember(db, id, u.id));
    return publicPoolView(db, id, showOwners);
  });

  // ---------- Convites (cadastro pelo próprio participante) ----------
  // O token vai no corpo (e no #fragmento do link), para não aparecer nos logs.
  app.post('/api/invites/check', async (req) => inviteInfo(db, asBody(req.body).token));

  app.post('/api/invites/accept', async (req, reply) => {
    const b = asBody(req.body);
    const userId = acceptInvite(db, b.token, {
      nickname: str(b, 'nickname', 'o nick', { max: 30 }),
      displayName: str(b, 'displayName', 'o nome', { min: 2, max: 40 }),
      password: b.password,
    });
    if (req.cookies[SESSION_COOKIE]) deleteSession(db, req.cookies[SESSION_COOKIE]);
    setSessionCookie(reply, createSession(db, userId));
    return reply.status(201).send({ user: getSessionUserById(userId) });
  });

  // ---------- Autenticação ----------
  app.post('/api/auth/login', async (req, reply) => {
    const body = asBody(req.body);
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const key = `${req.ip}|${nickname}`;
    if (limiter.isBlocked(key)) {
      throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos e tente novamente.');
    }
    const row = nickname ? findUserByNickname(db, nickname) : undefined;
    const ok = row ? verifyPassword(password, String(row.password_hash)) : (verifyDummy(password), false);
    if (!row || !ok || Number(row.is_active) !== 1) {
      limiter.fail(key);
      throw new HttpError(401, 'Nick ou senha incorretos.');
    }
    limiter.reset(key);
    purgeExpiredSessions(db);
    setSessionCookie(reply, createSession(db, Number(row.id)));
    return { user: getSessionUserById(Number(row.id)) };
  });

  const getSessionUserById = (id: number): SessionUser => {
    const r = db.prepare('SELECT id, nickname, display_name, role, must_change_password FROM users WHERE id = ?').get(id)!;
    return {
      id: Number(r.id), nickname: String(r.nickname), displayName: String(r.display_name),
      role: r.role as SessionUser['role'], mustChangePassword: Number(r.must_change_password) === 1,
    };
  };

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) deleteSession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => ({ user: req.user }));

  app.post('/api/auth/change-password', async (req, reply) => {
    const user = requireUser(req, true);
    const body = asBody(req.body);
    changePassword(db, user.id, body.currentPassword, body.newPassword);
    setSessionCookie(reply, createSession(db, user.id));
    return { user: getSessionUserById(user.id) };
  });

  // ---------- Participante ----------
  app.get('/api/me/pools', async (req) => {
    const user = requireUser(req);
    const ids = db.prepare('SELECT pool_id FROM pool_members WHERE user_id = ?').all(user.id).map((r) => Number(r.pool_id));
    return listPools(db).filter((p) => ids.includes(p.id)).map((p) => {
      const m = db.prepare(`SELECT paid_cents,
        (SELECT COUNT(*) FROM games WHERE pool_id = $p AND user_id = $u AND status = 'active') AS games
        FROM pool_members WHERE pool_id = $p AND user_id = $u`).get({ $p: p.id, $u: user.id })!;
      const games = Number(m.games);
      const dueCents = games * p.priceCents;
      const paidCents = Number(m.paid_cents);
      const pendingCents = Math.max(0, dueCents - paidCents);
      // Pix com o valor exato que falta pagar (só quando o admin cadastrou a chave no bolão).
      const pix = p.pixKey && pendingCents > 0
        ? { amountCents: pendingCents, payload: buildPixPayload({
          key: p.pixKey, name: p.pixName ?? '', city: p.pixCity ?? '', amountCents: pendingCents, txid: `BOLAO${p.id}U${user.id}` }) }
        : null;
      return {
        id: p.id, name: p.name, contestNumber: p.contestNumber, drawDate: p.drawDate, status: p.status,
        priceCents: p.priceCents, maxGamesPerParticipant: p.maxGamesPerParticipant, numbersPerGame: p.numbersPerGame,
        result: p.result, games, dueCents, paidCents, paymentStatus: paymentStatus(dueCents, paidCents),
        canEdit: participantCanEdit(p) || user.role === 'admin',
        pixConfigured: !!p.pixKey, pix,
      };
    });
  });

  app.get('/api/me/pools/:id/games', async (req) => {
    const user = requireUser(req);
    const pool = getPool(db, idParam((req.params as { id: string }).id));
    return listUserGames(db, pool, user.id);
  });

  app.post('/api/me/pools/:id/games', async (req, reply) => {
    const user = requireUser(req);
    const game = createGame(db, user, idParam((req.params as { id: string }).id), asBody(req.body).numbers);
    return reply.status(201).send(game);
  });

  app.put('/api/me/games/:id', async (req) => {
    const user = requireUser(req);
    return updateGame(db, user, idParam((req.params as { id: string }).id), asBody(req.body).numbers);
  });

  app.delete('/api/me/games/:id', async (req) => {
    const user = requireUser(req);
    deleteGame(db, user, idParam((req.params as { id: string }).id));
    return { ok: true };
  });

  // ---------- Administração: bolões ----------
  const poolInput = (raw: unknown): PoolInput => {
    const b = asBody(raw);
    const rawKey = str(b, 'pixKey', 'a chave Pix', { optional: true, max: 77 });
    let pixKey: string | null = null;
    let pixName: string | null = null;
    let pixCity: string | null = null;
    if (rawKey) {
      pixKey = normalizePixKey(rawKey);
      if (!pixKey) {
        throw new HttpError(400, 'Chave Pix inválida. Use e-mail, CPF/CNPJ, chave aleatória ou telefone com +55 (ex.: +5511999998888).');
      }
      pixName = str(b, 'pixName', 'o nome de quem recebe o Pix', { max: 25 });
      pixCity = str(b, 'pixCity', 'a cidade de quem recebe o Pix', { max: 15 });
    }
    return {
      name: str(b, 'name', 'o nome do bolão', { max: 80 }),
      contestNumber: int(b, 'contestNumber', 'o número do concurso', 1, 99_999),
      drawDate: isoDate(b, 'drawDate', 'a data do sorteio'),
      priceCents: int(b, 'priceCents', 'o preço por jogo (centavos)', 0, 10_000_000),
      maxGamesPerParticipant: int(b, 'maxGamesPerParticipant', 'o limite de jogos', 1, 1000),
      numbersPerGame: b.numbersPerGame === undefined ? MIN_GAME_NUMBERS
        : int(b, 'numbersPerGame', 'a quantidade de dezenas por jogo', MIN_GAME_NUMBERS, MAX_GAME_NUMBERS),
      pixKey, pixName, pixCity,
    };
  };
  const poolId = (req: FastifyRequest) => idParam((req.params as { id: string }).id);

  app.get('/api/admin/pools', async (req) => {
    requireAdmin(req);
    return listPools(db).map((p) => ({ ...p, stats: poolStats(db, p) }));
  });

  app.post('/api/admin/pools', async (req, reply) => {
    const admin = requireAdmin(req);
    const pool = createPool(db, admin.id, poolInput(req.body));
    return reply.status(201).send(pool);
  });

  app.get('/api/admin/pools/:id', async (req) => {
    requireAdmin(req);
    const pool = getPool(db, poolId(req));
    return { ...pool, stats: poolStats(db, pool) };
  });

  app.put('/api/admin/pools/:id', async (req) => {
    const admin = requireAdmin(req);
    return updatePool(db, admin.id, poolId(req), poolInput(req.body));
  });

  app.post('/api/admin/pools/:id/status', async (req) => {
    const admin = requireAdmin(req);
    return setPoolStatus(db, admin.id, poolId(req), oneOf(asBody(req.body), 'status', 'situação', POOL_STATUSES));
  });

  app.put('/api/admin/pools/:id/result', async (req) => {
    const admin = requireAdmin(req);
    const numbers = asBody(req.body).numbers;
    return setPoolResult(db, admin.id, poolId(req), numbers === undefined ? null : numbers);
  });

  app.get('/api/admin/pools/:id/members', async (req) => {
    requireAdmin(req);
    return listMembers(db, getPool(db, poolId(req)));
  });

  app.post('/api/admin/pools/:id/members', async (req, reply) => {
    const admin = requireAdmin(req);
    const userId = int(asBody(req.body), 'userId', 'o usuário', 1, Number.MAX_SAFE_INTEGER);
    addMember(db, admin.id, poolId(req), userId);
    return reply.status(201).send({ ok: true });
  });

  app.delete('/api/admin/pools/:id/members/:userId', async (req) => {
    const admin = requireAdmin(req);
    removeMember(db, admin.id, poolId(req), idParam((req.params as { userId: string }).userId));
    return { ok: true };
  });

  app.post('/api/admin/pools/:id/members/:userId/payment', async (req) => {
    const admin = requireAdmin(req);
    const status = oneOf(asBody(req.body), 'status', 'situação do pagamento', ['paid', 'pending'] as const);
    return setPayment(db, admin.id, poolId(req), idParam((req.params as { userId: string }).userId), status);
  });

  app.get('/api/admin/pools/:id/games', async (req) => {
    requireAdmin(req);
    return listPoolGamesAdmin(db, getPool(db, poolId(req)));
  });

  app.get('/api/admin/pools/:id/audit', async (req) => {
    requireAdmin(req);
    getPool(db, poolId(req));
    return listPoolAudit(db, poolId(req));
  });

  // ---------- Administração: jogos ----------
  const reasonOf = (raw: unknown) => str(asBody(raw), 'reason', 'o motivo', { optional: true, max: 300 });

  app.put('/api/admin/games/:id', async (req) => {
    const admin = requireAdmin(req);
    return updateGame(db, admin, idParam((req.params as { id: string }).id), asBody(req.body).numbers,
      { asAdmin: true, reason: reasonOf(req.body) });
  });

  app.delete('/api/admin/games/:id', async (req) => {
    const admin = requireAdmin(req);
    deleteGame(db, admin, idParam((req.params as { id: string }).id), { asAdmin: true, reason: reasonOf(req.body) });
    return { ok: true };
  });

  // ---------- Administração: usuários ----------
  app.get('/api/admin/users', async (req) => {
    requireAdmin(req);
    return listUsers(db);
  });

  app.post('/api/admin/users', async (req, reply) => {
    const admin = requireAdmin(req);
    const b = asBody(req.body);
    const result = createUser(db, admin.id, {
      nickname: str(b, 'nickname', 'o nick', { max: 30 }),
      displayName: str(b, 'displayName', 'o nome', { max: 80 }),
      role: oneOf(b, 'role', 'papel', ROLES),
    });
    return reply.status(201).send(result);
  });

  app.put('/api/admin/users/:id', async (req) => {
    const admin = requireAdmin(req);
    const b = asBody(req.body);
    if (typeof b.isActive !== 'boolean') throw new HttpError(400, 'Situação do usuário inválida.');
    return updateUser(db, admin, idParam((req.params as { id: string }).id), {
      displayName: str(b, 'displayName', 'o nome', { max: 80 }),
      role: oneOf(b, 'role', 'papel', ROLES),
      isActive: b.isActive,
    });
  });

  app.delete('/api/admin/users/:id', async (req) => {
    const admin = requireAdmin(req);
    return deleteUser(db, admin, idParam((req.params as { id: string }).id));
  });

  app.post('/api/admin/users/:id/reset-password', async (req) => {
    const admin = requireAdmin(req);
    return resetPassword(db, admin.id, idParam((req.params as { id: string }).id));
  });

  // ---------- Administração: convites ----------
  app.get('/api/admin/invites', async (req) => {
    requireAdmin(req);
    return listInvites(db);
  });

  app.post('/api/admin/invites', async (req, reply) => {
    const admin = requireAdmin(req);
    const b = asBody(req.body);
    const result = createInvite(db, admin.id, {
      poolId: int(b, 'poolId', 'o bolão', 1, Number.MAX_SAFE_INTEGER),
      days: int(b, 'days', 'a validade (dias)', 1, INVITE_MAX_DAYS),
      note: str(b, 'note', 'a anotação', { optional: true, max: 80 }),
    });
    return reply.status(201).send(result);
  });

  app.delete('/api/admin/invites/:id', async (req) => {
    const admin = requireAdmin(req);
    revokeInvite(db, admin.id, idParam((req.params as { id: string }).id));
    return { ok: true };
  });

  // ---------- Interface (build de produção) ----------
  const webDir = opts.webDir;
  if (webDir && existsSync(path.join(webDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webDir,
      // wildcard (padrão) serve arquivos novos do build sem reiniciar; os não encontrados caem no setNotFoundHandler.
      setHeaders: (res, filePath) => {
        res.header('Cache-Control', filePath.includes(`${path.sep}assets${path.sep}`)
          ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }

  app.setNotFoundHandler((req, reply) => {
    const isFile = /\.[a-z0-9]+$/i.test(req.url.split('?')[0]);
    if (req.url.startsWith('/api/') || req.method !== 'GET' || isFile || !webDir || !existsSync(path.join(webDir, 'index.html'))) {
      return reply.status(404).send({ error: 'Não encontrado.' });
    }
    reply.header('Cache-Control', 'no-cache');
    return reply.sendFile('index.html');
  });

  return app;
}

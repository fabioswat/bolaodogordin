import type { DB } from '../db.ts';
import { now, transaction } from '../db.ts';
import type { PoolStatus } from '../../shared/rules.ts';
import { countHits, normalizeNumbers, parseCombination, paymentStatus, prizeTier, validateNumbers } from '../../shared/rules.ts';
import { badRequest, conflict, notFound } from '../http.ts';
import { audit } from './audit.ts';

export const POOL_STATUSES: readonly PoolStatus[] = ['open', 'locked', 'closed'];

export interface PoolInput {
  name: string;
  contestNumber: number;
  drawDate: string;
  priceCents: number;
  maxGamesPerParticipant: number;
  /** Dezenas por jogo (6 a 20). */
  numbersPerGame: number;
  /** Dados do Pix para os participantes pagarem (opcionais). */
  pixKey: string | null;
  pixName: string | null;
  pixCity: string | null;
  /** Instituição de quem recebe (só exibição). */
  pixBank: string | null;
  /** Jogos por página na página inicial; null = padrão (10). */
  gamesPerPage: number | null;
}

export interface Pool extends PoolInput {
  id: number;
  status: PoolStatus;
  result: number[] | null;
  resultRegisteredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapPool(r: Record<string, unknown>): Pool {
  return {
    id: Number(r.id),
    name: String(r.name),
    contestNumber: Number(r.contest_number),
    drawDate: String(r.draw_date),
    priceCents: Number(r.price_cents),
    maxGamesPerParticipant: Number(r.max_games_per_participant),
    numbersPerGame: Number(r.numbers_per_game ?? 6),
    pixKey: r.pix_key ? String(r.pix_key) : null,
    pixName: r.pix_name ? String(r.pix_name) : null,
    pixCity: r.pix_city ? String(r.pix_city) : null,
    pixBank: r.pix_bank ? String(r.pix_bank) : null,
    gamesPerPage: r.games_per_page ? Number(r.games_per_page) : null,
    status: r.status as PoolStatus,
    result: r.result_numbers ? parseCombination(String(r.result_numbers)) : null,
    resultRegisteredAt: r.result_registered_at ? String(r.result_registered_at) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function getPool(db: DB, poolId: number): Pool {
  const row = db.prepare('SELECT * FROM pools WHERE id = ?').get(poolId);
  if (!row) throw notFound('Bolão não encontrado.');
  return mapPool(row);
}

/** Participantes só alteram jogos com o bolão aberto e sem resultado cadastrado. */
export function participantCanEdit(pool: Pool): boolean {
  return pool.status === 'open' && pool.result === null;
}

export function listPools(db: DB): Pool[] {
  return db.prepare('SELECT * FROM pools ORDER BY draw_date DESC, id DESC').all().map(mapPool);
}

export function poolStats(db: DB, pool: Pool) {
  const s = db.prepare(`SELECT
      (SELECT COUNT(*) FROM pool_members WHERE pool_id = $id) AS members,
      (SELECT COUNT(*) FROM games WHERE pool_id = $id AND status = 'active') AS games,
      (SELECT COALESCE(SUM(paid_cents), 0) FROM pool_members WHERE pool_id = $id) AS received`).get({ $id: pool.id })!;
  const games = Number(s.games);
  return {
    participants: Number(s.members),
    games,
    expectedCents: games * pool.priceCents,
    receivedCents: Number(s.received),
  };
}

export function createPool(db: DB, actorId: number, input: PoolInput, status: PoolStatus = 'open'): Pool {
  const t = now();
  return transaction(db, () => {
    const res = db.prepare(`INSERT INTO pools (name, contest_number, draw_date, price_cents, max_games_per_participant,
        numbers_per_game, pix_key, pix_name, pix_city, pix_bank, games_per_page, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(input.name, input.contestNumber, input.drawDate, input.priceCents,
      input.maxGamesPerParticipant, input.numbersPerGame, input.pixKey, input.pixName, input.pixCity, input.pixBank, input.gamesPerPage, status, t, t);
    const pool = getPool(db, Number(res.lastInsertRowid));
    audit(db, { actorId, poolId: pool.id, action: 'pool.created', entityType: 'pool', entityId: pool.id, after: { ...input, status } });
    return pool;
  });
}

export function updatePool(db: DB, actorId: number, poolId: number, input: PoolInput): Pool {
  return transaction(db, () => {
    const before = getPool(db, poolId);
    if (input.numbersPerGame !== before.numbersPerGame) {
      const games = Number(db.prepare("SELECT COUNT(*) AS n FROM games WHERE pool_id = ? AND status = 'active'").get(poolId)!.n);
      if (games > 0) throw conflict('Não é possível mudar a quantidade de dezenas: o bolão já tem jogos cadastrados.');
    }
    db.prepare(`UPDATE pools SET name = ?, contest_number = ?, draw_date = ?, price_cents = ?, max_games_per_participant = ?,
        numbers_per_game = ?, pix_key = ?, pix_name = ?, pix_city = ?, pix_bank = ?, games_per_page = ?, updated_at = ?
      WHERE id = ?`).run(input.name, input.contestNumber, input.drawDate, input.priceCents, input.maxGamesPerParticipant,
      input.numbersPerGame, input.pixKey, input.pixName, input.pixCity, input.pixBank, input.gamesPerPage, now(), poolId);
    const after = getPool(db, poolId);
    audit(db, { actorId, poolId, action: 'pool.updated', entityType: 'pool', entityId: poolId,
      before: pick(before), after: pick(after) });
    return after;
  });
}

function pick(p: Pool): PoolInput {
  return { name: p.name, contestNumber: p.contestNumber, drawDate: p.drawDate, priceCents: p.priceCents,
    maxGamesPerParticipant: p.maxGamesPerParticipant, numbersPerGame: p.numbersPerGame,
    pixKey: p.pixKey, pixName: p.pixName, pixCity: p.pixCity, pixBank: p.pixBank, gamesPerPage: p.gamesPerPage };
}

export function setPoolStatus(db: DB, actorId: number, poolId: number, status: PoolStatus): Pool {
  return transaction(db, () => {
    const before = getPool(db, poolId);
    if (before.status === status) return before;
    db.prepare('UPDATE pools SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), poolId);
    audit(db, { actorId, poolId, action: 'pool.status', entityType: 'pool', entityId: poolId,
      before: { status: before.status }, after: { status } });
    return getPool(db, poolId);
  });
}

export function setPoolResult(db: DB, actorId: number, poolId: number, numbers: unknown): Pool {
  let combination: string | null = null;
  if (numbers !== null) {
    const error = validateNumbers(numbers);
    if (error) throw badRequest(error.replace('O jogo', 'O resultado'));
    combination = normalizeNumbers(numbers as number[]);
  }
  return transaction(db, () => {
    const before = getPool(db, poolId);
    const t = now();
    db.prepare('UPDATE pools SET result_numbers = ?, result_registered_at = ?, updated_at = ? WHERE id = ?')
      .run(combination, combination ? t : null, t, poolId);
    audit(db, { actorId, poolId, action: combination ? 'pool.result_set' : 'pool.result_cleared', entityType: 'pool', entityId: poolId,
      before: { result: before.result }, after: { result: combination ? parseCombination(combination) : null } });
    return getPool(db, poolId);
  });
}

// ---------- Participantes e pagamentos ----------

export function listMembers(db: DB, pool: Pool) {
  return db.prepare(`
    SELECT u.id, u.nickname, u.display_name, u.is_active, m.paid_cents, m.paid_at, m.created_at,
      (SELECT COUNT(*) FROM games g WHERE g.pool_id = m.pool_id AND g.user_id = m.user_id AND g.status = 'active') AS games
    FROM pool_members m JOIN users u ON u.id = m.user_id
    WHERE m.pool_id = ? ORDER BY u.nickname`).all(pool.id).map((r) => {
    const games = Number(r.games);
    const dueCents = games * pool.priceCents;
    const paidCents = Number(r.paid_cents);
    return {
      userId: Number(r.id),
      nickname: String(r.nickname),
      displayName: String(r.display_name),
      isActive: Number(r.is_active) === 1,
      games,
      dueCents,
      paidCents,
      paidAt: r.paid_at ? String(r.paid_at) : null,
      paymentStatus: paymentStatus(dueCents, paidCents),
    };
  });
}

export function isMember(db: DB, poolId: number, userId: number): boolean {
  return !!db.prepare('SELECT 1 FROM pool_members WHERE pool_id = ? AND user_id = ?').get(poolId, userId);
}

/** Insere o participante no bolão. Deve ser chamado dentro de uma transação. */
export function insertMember(db: DB, actorId: number, poolId: number, userId: number): void {
  db.prepare('INSERT INTO pool_members (pool_id, user_id, paid_cents, created_at) VALUES (?, ?, 0, ?)').run(poolId, userId, now());
  audit(db, { actorId, poolId, action: 'member.added', entityType: 'user', entityId: userId });
}

export function addMember(db: DB, actorId: number, poolId: number, userId: number): void {
  transaction(db, () => {
    getPool(db, poolId);
    const user = db.prepare('SELECT is_active FROM users WHERE id = ?').get(userId);
    if (!user) throw notFound('Usuário não encontrado.');
    if (Number(user.is_active) !== 1) throw badRequest('Usuário desativado.');
    if (isMember(db, poolId, userId)) throw conflict('Esse usuário já participa do bolão.');
    insertMember(db, actorId, poolId, userId);
  });
}

export function removeMember(db: DB, actorId: number, poolId: number, userId: number): void {
  transaction(db, () => {
    if (!isMember(db, poolId, userId)) throw notFound('Participante não encontrado neste bolão.');
    const active = db.prepare("SELECT COUNT(*) AS n FROM games WHERE pool_id = ? AND user_id = ? AND status = 'active'").get(poolId, userId)!;
    if (Number(active.n) > 0) throw conflict('O participante possui jogos ativos. Exclua os jogos antes de removê-lo.');
    const member = db.prepare('SELECT paid_cents FROM pool_members WHERE pool_id = ? AND user_id = ?').get(poolId, userId)!;
    if (Number(member.paid_cents) > 0) throw conflict('O participante tem pagamento registrado. Marque como pendente antes de removê-lo.');
    db.prepare('DELETE FROM pool_members WHERE pool_id = ? AND user_id = ?').run(poolId, userId);
    audit(db, { actorId, poolId, action: 'member.removed', entityType: 'user', entityId: userId });
  });
}

export function setPayment(db: DB, actorId: number, poolId: number, userId: number, status: 'paid' | 'pending') {
  return transaction(db, () => {
    const pool = getPool(db, poolId);
    const member = listMembers(db, pool).find((m) => m.userId === userId);
    if (!member) throw notFound('Participante não encontrado neste bolão.');
    if (status === 'paid') {
      if (member.dueCents <= 0) throw badRequest('O participante não tem jogos ativos para pagar.');
      db.prepare('UPDATE pool_members SET paid_cents = ?, paid_at = ? WHERE pool_id = ? AND user_id = ?')
        .run(member.dueCents, now(), poolId, userId);
    } else {
      db.prepare('UPDATE pool_members SET paid_cents = 0, paid_at = NULL WHERE pool_id = ? AND user_id = ?').run(poolId, userId);
    }
    audit(db, { actorId, poolId, action: status === 'paid' ? 'payment.paid' : 'payment.pending', entityType: 'user', entityId: userId,
      before: { paidCents: member.paidCents }, after: { paidCents: status === 'paid' ? member.dueCents : 0 } });
    return listMembers(db, pool).find((m) => m.userId === userId)!;
  });
}

// ---------- Visão pública ----------

/** showOwners: inclui o nome de quem cadastrou cada jogo (só para participantes logados do bolão e admin). */
export function publicPoolView(db: DB, poolId: number, showOwners = false) {
  const pool = getPool(db, poolId);
  // Ordem: nome do participante (com acentos, sem diferenciar maiúsculas) e, dentro dele, a ordem em que os jogos
  // foram feitos — os jogos de cada pessoa ficam juntos, mesmo para visitantes (que não veem o nome).
  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
  const rows = db.prepare(`SELECT g.public_code, g.numbers, g.user_id, u.display_name FROM games g JOIN users u ON u.id = g.user_id
    WHERE g.pool_id = ? AND g.status = 'active' ORDER BY g.created_at, g.id`).all(poolId)
    .sort((a, b) => collator.compare(String(a.display_name), String(b.display_name)) || Number(a.user_id) - Number(b.user_id));
  const tiers = { quadra: 0, quina: 0, sena: 0 };
  const games = rows.map((r) => {
    const numbers = parseCombination(String(r.numbers));
    const hits = pool.result ? countHits(numbers, pool.result) : null;
    const tier = hits === null ? null : prizeTier(hits);
    if (tier) tiers[tier]++;
    const game: { code: string; numbers: number[]; hits: number | null; tier: typeof tier; owner?: string } =
      { code: String(r.public_code), numbers, hits, tier };
    if (showOwners) game.owner = String(r.display_name);
    return game;
  });
  // Com resultado, mais acertos primeiro (a ordenação é estável: o nome continua como desempate).
  if (pool.result) games.sort((a, b) => (b.hits ?? 0) - (a.hits ?? 0));
  return {
    pool: {
      id: pool.id,
      name: pool.name,
      contestNumber: pool.contestNumber,
      drawDate: pool.drawDate,
      priceCents: pool.priceCents,
      maxGamesPerParticipant: pool.maxGamesPerParticipant,
      numbersPerGame: pool.numbersPerGame,
      gamesPerPage: pool.gamesPerPage,
      status: pool.status,
      result: pool.result,
    },
    stats: poolStats(db, pool),
    tiers,
    showOwners,
    games,
  };
}

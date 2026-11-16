import { randomInt } from 'node:crypto';
import type { DB } from '../db.ts';
import { isUniqueViolation, now, transaction } from '../db.ts';
import type { SessionUser } from '../auth.ts';
import { countHits, normalizeNumbers, parseCombination, prizeTier, validateNumbers } from '../../shared/rules.ts';
import { badRequest, conflict, forbidden, notFound } from '../http.ts';
import { audit } from './audit.ts';
import type { Pool } from './pools.ts';
import { getPool, insertMember, isMember, participantCanEdit } from './pools.ts';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DUPLICATE_MESSAGE = 'Essa combinação já foi registrada neste bolão.';
const LOCKED_MESSAGE = 'O bolão não está aberto para alterações.';

function newPublicCode(db: DB): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!db.prepare('SELECT 1 FROM games WHERE public_code = ?').get(code)) return code;
  }
}

function parseInput(numbers: unknown, count: number): string {
  const error = validateNumbers(numbers, count);
  if (error) throw badRequest(error);
  return normalizeNumbers(numbers as number[]);
}

interface GameRow {
  id: number;
  poolId: number;
  userId: number;
  code: string;
  numbers: number[];
  status: 'active' | 'deleted';
  createdAt: string;
  updatedAt: string;
}

function mapGame(r: Record<string, unknown>): GameRow {
  return {
    id: Number(r.id),
    poolId: Number(r.pool_id),
    userId: Number(r.user_id),
    code: String(r.public_code),
    numbers: parseCombination(String(r.numbers)),
    status: r.status as GameRow['status'],
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function getActiveGame(db: DB, gameId: number): GameRow {
  const row = db.prepare("SELECT * FROM games WHERE id = ? AND status = 'active'").get(gameId);
  if (!row) throw notFound('Jogo não encontrado.');
  return mapGame(row);
}

function countActive(db: DB, poolId: number, userId: number): number {
  return Number(db.prepare("SELECT COUNT(*) AS n FROM games WHERE pool_id = ? AND user_id = ? AND status = 'active'").get(poolId, userId)!.n);
}

/** Admin não é barrado pelo bloqueio; participante só altera com o bolão aberto e sem resultado. */
function ensureEditable(pool: Pool, actor: SessionUser): void {
  if (actor.role !== 'admin' && !participantCanEdit(pool)) throw conflict(LOCKED_MESSAGE);
}

export function createGame(db: DB, actor: SessionUser, poolId: number, numbers: unknown) {
  return transaction(db, () => {
    const pool = getPool(db, poolId);
    const combination = parseInput(numbers, pool.numbersPerGame);
    ensureEditable(pool, actor);
    if (!isMember(db, poolId, actor.id)) {
      if (actor.role !== 'admin') throw forbidden('Você não participa deste bolão.');
      insertMember(db, actor.id, poolId, actor.id);
    }
    if (countActive(db, poolId, actor.id) >= pool.maxGamesPerParticipant) {
      throw conflict(`Limite de ${pool.maxGamesPerParticipant} jogo(s) por participante atingido.`);
    }
    const t = now();
    try {
      const res = db.prepare(`INSERT INTO games (pool_id, user_id, public_code, numbers, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?)`).run(poolId, actor.id, newPublicCode(db), combination, t, t);
      const game = getActiveGame(db, Number(res.lastInsertRowid));
      audit(db, { actorId: actor.id, poolId, action: 'game.created', entityType: 'game', entityId: game.id,
        after: { code: game.code, numbers: game.numbers, owner: actor.id } });
      return game;
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict(DUPLICATE_MESSAGE);
      throw err;
    }
  });
}

export interface ChangeOptions {
  /** Ação pela área administrativa: dispensa ser o dono e ignora bloqueio. */
  asAdmin?: boolean;
  reason?: string;
}

function loadForChange(db: DB, actor: SessionUser, gameId: number, opts: ChangeOptions) {
  const game = getActiveGame(db, gameId);
  const pool = getPool(db, game.poolId);
  if (opts.asAdmin) {
    if (actor.role !== 'admin') throw forbidden();
  } else {
    if (game.userId !== actor.id) throw notFound('Jogo não encontrado.');
    ensureEditable(pool, actor);
  }
  return { game, pool };
}

export function updateGame(db: DB, actor: SessionUser, gameId: number, numbers: unknown, opts: ChangeOptions = {}) {
  return transaction(db, () => {
    const { game, pool } = loadForChange(db, actor, gameId, opts);
    const combination = parseInput(numbers, pool.numbersPerGame);
    if (normalizeNumbers(game.numbers) === combination) return game;
    try {
      db.prepare('UPDATE games SET numbers = ?, updated_at = ? WHERE id = ?').run(combination, now(), gameId);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict(DUPLICATE_MESSAGE);
      throw err;
    }
    const after = getActiveGame(db, gameId);
    audit(db, { actorId: actor.id, poolId: game.poolId, action: opts.asAdmin ? 'game.updated_by_admin' : 'game.updated',
      entityType: 'game', entityId: gameId, reason: opts.reason,
      before: { code: game.code, numbers: game.numbers, owner: game.userId },
      after: { code: after.code, numbers: after.numbers, owner: after.userId } });
    return after;
  });
}

export function deleteGame(db: DB, actor: SessionUser, gameId: number, opts: ChangeOptions = {}): void {
  transaction(db, () => {
    const { game } = loadForChange(db, actor, gameId, opts);
    const t = now();
    db.prepare("UPDATE games SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?").run(t, t, gameId);
    audit(db, { actorId: actor.id, poolId: game.poolId, action: opts.asAdmin ? 'game.deleted_by_admin' : 'game.deleted',
      entityType: 'game', entityId: gameId, reason: opts.reason,
      before: { code: game.code, numbers: game.numbers, owner: game.userId } });
  });
}

function withHits(pool: Pool, g: GameRow) {
  const hits = pool.result ? countHits(g.numbers, pool.result) : null;
  return { ...g, hits, tier: hits === null ? null : prizeTier(hits) };
}

export function listUserGames(db: DB, pool: Pool, userId: number) {
  return db.prepare("SELECT * FROM games WHERE pool_id = ? AND user_id = ? AND status = 'active' ORDER BY created_at, id")
    .all(pool.id, userId).map((r) => withHits(pool, mapGame(r)));
}

/** Lista administrativa: inclui dono e, opcionalmente, jogos excluídos. */
export function listPoolGamesAdmin(db: DB, pool: Pool) {
  return db.prepare(`SELECT g.*, u.nickname, u.display_name FROM games g JOIN users u ON u.id = g.user_id
    WHERE g.pool_id = ? ORDER BY g.status, g.numbers`).all(pool.id).map((r) => ({
    ...withHits(pool, mapGame(r)),
    ownerNickname: String(r.nickname),
    ownerName: String(r.display_name),
    deletedAt: r.deleted_at ? String(r.deleted_at) : null,
  }));
}

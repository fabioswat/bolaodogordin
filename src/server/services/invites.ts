import { randomBytes } from 'node:crypto';
import type { DB } from '../db.ts';
import { now, transaction } from '../db.ts';
import { hashPassword, hashToken, validateNewPassword } from '../auth.ts';
import { HttpError, badRequest, notFound } from '../http.ts';
import { audit } from './audit.ts';
import { getPool, insertMember, isMember } from './pools.ts';
import { checkNickname, insertUser } from './users.ts';

export const INVITE_MAX_DAYS = 60;
export type InviteStatus = 'pending' | 'used' | 'expired' | 'revoked';

function statusOf(r: Record<string, unknown>): InviteStatus {
  if (r.used_at) return 'used';
  if (r.revoked_at) return 'revoked';
  if (String(r.expires_at) < now()) return 'expired';
  return 'pending';
}

function mapInvite(r: Record<string, unknown>) {
  return {
    id: Number(r.id),
    poolId: Number(r.pool_id),
    poolName: String(r.pool_name ?? ''),
    note: r.note ? String(r.note) : null,
    createdAt: String(r.created_at),
    expiresAt: String(r.expires_at),
    usedAt: r.used_at ? String(r.used_at) : null,
    usedBy: r.used_by ? { nickname: String(r.used_nickname), displayName: String(r.used_name) } : null,
    status: statusOf(r),
  };
}

const SELECT_INVITES = `SELECT i.*, p.name AS pool_name, u.nickname AS used_nickname, u.display_name AS used_name
  FROM invites i JOIN pools p ON p.id = i.pool_id LEFT JOIN users u ON u.id = i.used_by`;

export function listInvites(db: DB) {
  return db.prepare(`${SELECT_INVITES} ORDER BY i.id DESC`).all().map(mapInvite);
}

/** Cria um convite. O token só é devolvido aqui; o banco guarda apenas o hash. */
export function createInvite(db: DB, actorId: number, input: { poolId: number; days: number; note: string }) {
  return transaction(db, () => {
    getPool(db, input.poolId);
    const token = randomBytes(24).toString('base64url');
    const expires = new Date(Date.now() + input.days * 86_400_000).toISOString();
    const res = db.prepare(`INSERT INTO invites (token_hash, pool_id, note, created_by, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(hashToken(token), input.poolId, input.note || null, actorId, now(), expires);
    const id = Number(res.lastInsertRowid);
    audit(db, { actorId, poolId: input.poolId, action: 'invite.created', entityType: 'invite', entityId: id,
      after: { note: input.note || null, expiresAt: expires } });
    return { invite: mapInvite(db.prepare(`${SELECT_INVITES} WHERE i.id = ?`).get(id)!), token };
  });
}

export function revokeInvite(db: DB, actorId: number, inviteId: number) {
  return transaction(db, () => {
    const row = db.prepare('SELECT * FROM invites WHERE id = ?').get(inviteId);
    if (!row) throw notFound('Convite não encontrado.');
    if (statusOf(row) !== 'pending') throw badRequest('Só é possível cancelar convites pendentes.');
    db.prepare('UPDATE invites SET revoked_at = ? WHERE id = ?').run(now(), inviteId);
    audit(db, { actorId, poolId: Number(row.pool_id), action: 'invite.revoked', entityType: 'invite', entityId: inviteId });
  });
}

/** Busca o convite pelo token e garante que ainda pode ser usado. */
function validInvite(db: DB, token: unknown) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw notFound('Convite inválido.');
  const row = db.prepare(`${SELECT_INVITES} WHERE i.token_hash = ?`).get(hashToken(token));
  if (!row) throw notFound('Convite inválido. Confira se o link foi copiado inteiro.');
  const status = statusOf(row);
  if (status === 'used') throw new HttpError(410, 'Este convite já foi usado. Se a conta é sua, entre com seu nick e senha.');
  if (status === 'revoked') throw new HttpError(410, 'Este convite foi cancelado. Peça um novo ao administrador.');
  if (status === 'expired') throw new HttpError(410, 'Este convite expirou. Peça um novo ao administrador.');
  return row;
}

export function inviteInfo(db: DB, token: unknown) {
  const row = validInvite(db, token);
  const pool = getPool(db, Number(row.pool_id));
  return { poolName: pool.name, contestNumber: pool.contestNumber, drawDate: pool.drawDate, expiresAt: String(row.expires_at) };
}

/** Cria a conta pelo convite, inclui no bolão e marca o convite como usado. Devolve o id do novo usuário. */
export function acceptInvite(db: DB, token: unknown, input: { nickname: string; displayName: string; password: unknown }): number {
  validInvite(db, token);
  checkNickname(input.nickname);
  const error = validateNewPassword(input.password);
  if (error) throw badRequest(error.replace('A nova senha', 'A senha'));
  const hash = hashPassword(input.password as string); // fora da transação: bcrypt é lento
  return transaction(db, () => {
    const row = validInvite(db, token); // confere de novo dentro da transação (uso único)
    const poolId = Number(row.pool_id);
    const user = insertUser(db, null, { nickname: input.nickname, displayName: input.displayName, role: 'participant' }, hash, false);
    if (!isMember(db, poolId, user.id)) insertMember(db, user.id, poolId, user.id);
    db.prepare('UPDATE invites SET used_at = ?, used_by = ? WHERE id = ?').run(now(), user.id, Number(row.id));
    audit(db, { actorId: user.id, poolId, action: 'invite.used', entityType: 'invite', entityId: Number(row.id) });
    return user.id;
  });
}

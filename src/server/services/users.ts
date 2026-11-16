import type { DB } from '../db.ts';
import { isUniqueViolation, now, transaction } from '../db.ts';
import type { Role, SessionUser } from '../auth.ts';
import { deleteUserSessions, generateTempPassword, hashPassword, validateNewPassword, verifyPassword } from '../auth.ts';
import { badRequest, conflict, notFound } from '../http.ts';
import { audit } from './audit.ts';
import { parseCombination } from '../../shared/rules.ts';

export const NICKNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

export function normalizeNickname(value: string): string {
  return value.trim().toLowerCase();
}

function mapUser(r: Record<string, unknown>) {
  return {
    id: Number(r.id),
    nickname: String(r.nickname),
    displayName: String(r.display_name),
    role: r.role as Role,
    isActive: Number(r.is_active) === 1,
    mustChangePassword: Number(r.must_change_password) === 1,
    createdAt: String(r.created_at),
    deleted: !!r.deleted_at,
  };
}

/** Inclui excluídos (marcados com deleted) para o histórico mostrar nomes; a tela de usuários os esconde. */
export function listUsers(db: DB) {
  return db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM games g WHERE g.user_id = u.id AND g.status = 'active') AS active_games
    FROM users u ORDER BY u.nickname`).all().map((r) => ({ ...mapUser(r), activeGames: Number(r.active_games) }));
}

export function findUserByNickname(db: DB, nickname: string) {
  return db.prepare('SELECT * FROM users WHERE nickname = ?').get(normalizeNickname(nickname));
}

export interface NewUser { nickname: string; displayName: string; role: Role }

/** Valida e normaliza o nick; lança erro 400 se inválido. */
export function checkNickname(value: string): string {
  const nickname = normalizeNickname(value);
  if (!NICKNAME_PATTERN.test(nickname)) {
    throw badRequest('O nick deve ter de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.');
  }
  return nickname;
}

/**
 * Insere o usuário com a senha já em hash. Deve ser chamado dentro de uma transação.
 * actorId null = o próprio usuário (cadastro por convite) ou o comando create-admin.
 */
export function insertUser(db: DB, actorId: number | null, input: NewUser, passwordHash: string, mustChangePassword: boolean) {
  const nickname = checkNickname(input.nickname);
  const t = now();
  try {
    const res = db.prepare(`INSERT INTO users (nickname, display_name, password_hash, role, must_change_password, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)`).run(nickname, input.displayName, passwordHash, input.role, mustChangePassword ? 1 : 0, t, t);
    const id = Number(res.lastInsertRowid);
    audit(db, { actorId: actorId ?? id, action: 'user.created', entityType: 'user', entityId: id, after: { nickname, displayName: input.displayName, role: input.role } });
    return mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)!);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('Já existe um usuário com esse nick. Escolha outro.');
    throw err;
  }
}

export function createUser(db: DB, actorId: number | null, input: NewUser, password?: string) {
  checkNickname(input.nickname);
  const tempPassword = password ?? generateTempPassword();
  const hash = hashPassword(tempPassword);
  const user = transaction(db, () => insertUser(db, actorId, input, hash, true));
  return { user, tempPassword };
}

export function updateUser(db: DB, actor: SessionUser, userId: number, input: { displayName: string; role: Role; isActive: boolean }) {
  return transaction(db, () => {
    const row = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(userId);
    if (!row) throw notFound('Usuário não encontrado.');
    const before = mapUser(row);
    if (userId === actor.id && (!input.isActive || input.role !== 'admin')) {
      throw badRequest('Você não pode desativar nem remover o papel de administrador da sua própria conta.');
    }
    db.prepare('UPDATE users SET display_name = ?, role = ?, is_active = ?, updated_at = ? WHERE id = ?')
      .run(input.displayName, input.role, input.isActive ? 1 : 0, now(), userId);
    if (!input.isActive) deleteUserSessions(db, userId);
    const after = mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId)!);
    audit(db, { actorId: actor.id, action: 'user.updated', entityType: 'user', entityId: userId,
      before: { displayName: before.displayName, role: before.role, isActive: before.isActive },
      after: { displayName: after.displayName, role: after.role, isActive: after.isActive } });
    return after;
  });
}

export function resetPassword(db: DB, actorId: number, userId: number) {
  const tempPassword = generateTempPassword();
  return transaction(db, () => {
    const res = db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(hashPassword(tempPassword), now(), userId);
    if (res.changes === 0) throw notFound('Usuário não encontrado.');
    deleteUserSessions(db, userId);
    audit(db, { actorId, action: 'user.password_reset', entityType: 'user', entityId: userId });
    return { tempPassword };
  });
}

export function changePassword(db: DB, userId: number, current: unknown, next: unknown): void {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
  if (!row) throw notFound();
  if (typeof current !== 'string' || !verifyPassword(current, String(row.password_hash))) {
    throw badRequest('Senha atual incorreta.');
  }
  const error = validateNewPassword(next);
  if (error) throw badRequest(error);
  if (next === current) throw badRequest('A nova senha deve ser diferente da atual.');
  transaction(db, () => {
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?')
      .run(hashPassword(next as string), now(), userId);
    deleteUserSessions(db, userId);
    audit(db, { actorId: userId, action: 'user.password_changed', entityType: 'user', entityId: userId });
  });
}

/**
 * Exclui o usuário: encerra o acesso, exclui os jogos ativos (liberando as combinações), tira dos bolões
 * e libera o nick. O registro fica (renomeado) para o histórico continuar mostrando quem fez o quê.
 * Recusa se houver pagamento registrado, para não sumir dinheiro do controle.
 */
export function deleteUser(db: DB, actor: SessionUser, userId: number) {
  return transaction(db, () => {
    if (userId === actor.id) throw badRequest('Você não pode excluir a sua própria conta.');
    const row = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(userId);
    if (!row) throw notFound('Usuário não encontrado.');
    const paid = db.prepare(`SELECT p.name FROM pool_members m JOIN pools p ON p.id = m.pool_id
      WHERE m.user_id = ? AND m.paid_cents > 0`).all(userId);
    if (paid.length) {
      throw conflict(`Há pagamento registrado em: ${paid.map((p) => p.name).join(', ')}. Marque como pendente antes de excluir.`);
    }
    const t = now();
    const reason = 'Usuário excluído';
    const games = db.prepare("SELECT id, pool_id, public_code, numbers FROM games WHERE user_id = ? AND status = 'active'").all(userId);
    for (const g of games) {
      db.prepare("UPDATE games SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?").run(t, t, g.id);
      audit(db, { actorId: actor.id, poolId: Number(g.pool_id), action: 'game.deleted_by_admin', entityType: 'game', entityId: Number(g.id),
        reason, before: { code: String(g.public_code), numbers: parseCombination(String(g.numbers)), owner: userId } });
    }
    const pools = db.prepare('SELECT pool_id FROM pool_members WHERE user_id = ?').all(userId).map((r) => Number(r.pool_id));
    for (const poolId of pools) {
      db.prepare('DELETE FROM pool_members WHERE pool_id = ? AND user_id = ?').run(poolId, userId);
      audit(db, { actorId: actor.id, poolId, action: 'member.removed', entityType: 'user', entityId: userId, reason });
    }
    deleteUserSessions(db, userId);
    const nickname = String(row.nickname);
    // Nome fora do padrão de nick: nunca colide com um cadastro novo e deixa o original livre.
    db.prepare('UPDATE users SET nickname = ?, is_active = 0, deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(`${nickname} (excluído #${userId})`, t, t, userId);
    audit(db, { actorId: actor.id, action: 'user.deleted', entityType: 'user', entityId: userId,
      before: { nickname, displayName: String(row.display_name), games: games.length, pools: pools.length } });
    return { gamesDeleted: games.length, poolsLeft: pools.length };
  });
}

import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { DB } from './db.ts';
import { now } from './db.ts';

export const SESSION_COOKIE = 'bolao_sid';
export const SESSION_DAYS = 14;
// Custo do bcrypt; os testes usam valor menor via variável de ambiente para ficarem rápidos.
const BCRYPT_COST = Number(process.env.BCRYPT_COST || 12);

export type Role = 'admin' | 'participant';

export interface SessionUser {
  id: number;
  nickname: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

// Hash usado quando o usuário não existe, para o tempo de resposta não revelar isso.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);
export function verifyDummy(password: string): void {
  bcrypt.compareSync(password, DUMMY_HASH);
}

const READABLE = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateTempPassword(length = 10): string {
  let out = '';
  for (let i = 0; i < length; i++) out += READABLE[randomInt(READABLE.length)];
  return out;
}

export function validateNewPassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) return 'A nova senha deve ter pelo menos 8 caracteres.';
  if (Buffer.byteLength(password) > 72) return 'A nova senha é longa demais.';
  return null;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(db: DB, userId: number): string {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), userId, now(), expires);
  return token;
}

export function getSessionUser(db: DB, token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.nickname, u.display_name, u.role, u.must_change_password, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND u.is_active = 1`).get(hashToken(token));
  if (!row) return null;
  if (String(row.expires_at) < now()) {
    deleteSession(db, token);
    return null;
  }
  return {
    id: Number(row.id),
    nickname: String(row.nickname),
    displayName: String(row.display_name),
    role: row.role as Role,
    mustChangePassword: Number(row.must_change_password) === 1,
  };
}

export function deleteSession(db: DB, token: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
}

export function deleteUserSessions(db: DB, userId: number): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function purgeExpiredSessions(db: DB): void {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
}

/** Limita tentativas de login por chave (IP + nick), em memória. */
export class LoginLimiter {
  maxFailures: number;
  windowMs: number;
  private entries = new Map<string, { count: number; until: number }>();

  constructor(maxFailures = 5, windowMs = 15 * 60_000) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
  }

  isBlocked(key: string): boolean {
    const e = this.entries.get(key);
    if (!e) return false;
    if (Date.now() > e.until) {
      this.entries.delete(key);
      return false;
    }
    return e.count >= this.maxFailures;
  }

  fail(key: string): void {
    const e = this.entries.get(key);
    if (!e || Date.now() > e.until) this.entries.set(key, { count: 1, until: Date.now() + this.windowMs });
    else e.count++;
  }

  reset(key: string): void {
    this.entries.delete(key);
  }
}

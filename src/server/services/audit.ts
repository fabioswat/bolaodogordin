import type { DB } from '../db.ts';
import { now } from '../db.ts';

export interface AuditEntry {
  actorId: number | null;
  poolId?: number | null;
  action: string;
  entityType: string;
  entityId: number | string;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Registra uma ação no histórico. Nunca passe senhas, hashes ou tokens em before/after. */
export function audit(db: DB, e: AuditEntry): void {
  db.prepare(`INSERT INTO audit_logs
    (actor_id, pool_id, action, entity_type, entity_id, reason, before_json, after_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    e.actorId,
    e.poolId ?? null,
    e.action,
    e.entityType,
    String(e.entityId),
    e.reason || null,
    e.before === undefined ? null : JSON.stringify(e.before),
    e.after === undefined ? null : JSON.stringify(e.after),
    now(),
  );
}

export function listPoolAudit(db: DB, poolId: number) {
  return db.prepare(`
    SELECT a.id, a.action, a.entity_type, a.entity_id, a.reason, a.before_json, a.after_json, a.created_at,
           u.nickname AS actor_nickname
    FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.pool_id = ? ORDER BY a.id DESC LIMIT 500`).all(poolId).map((r) => ({
    id: Number(r.id),
    action: String(r.action),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    reason: r.reason === null ? null : String(r.reason),
    before: r.before_json === null ? null : JSON.parse(String(r.before_json)),
    after: r.after_json === null ? null : JSON.parse(String(r.after_json)),
    createdAt: String(r.created_at),
    actor: r.actor_nickname === null ? null : String(r.actor_nickname),
  }));
}

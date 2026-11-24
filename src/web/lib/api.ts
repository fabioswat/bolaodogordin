import type { PaymentStatus, PoolStatus, PrizeTier } from '../../shared/rules.ts';

export class ApiError extends Error {
  status: number;
  code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Listener = (err: ApiError) => void;
const listeners = new Set<Listener>();
/** Permite que o app reaja globalmente a 401/troca de senha obrigatória. */
export function onApiError(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Não foi possível conectar ao servidor.');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new ApiError(res.status, data?.error || 'Erro inesperado.', data?.code);
    listeners.forEach((fn) => fn(err));
    throw err;
  }
  return data as T;
}

export const get = <T>(url: string) => api<T>('GET', url);
export const post = <T>(url: string, body?: unknown) => api<T>('POST', url, body ?? {});
export const put = <T>(url: string, body?: unknown) => api<T>('PUT', url, body ?? {});
export const del = <T>(url: string, body?: unknown) => api<T>('DELETE', url, body);

// ---------- Tipos das respostas ----------

export interface User {
  id: number;
  nickname: string;
  displayName: string;
  role: 'admin' | 'participant';
  mustChangePassword: boolean;
}

export interface PoolSummary {
  id: number;
  name: string;
  contestNumber: number;
  drawDate: string;
  status: PoolStatus;
}

export interface PoolStats {
  participants: number;
  games: number;
  expectedCents: number;
  receivedCents: number;
}

export interface PublicGame {
  code: string;
  numbers: number[];
  hits: number | null;
  tier: PrizeTier;
  /** Presente só para participantes logados do bolão (e admin). */
  owner?: string;
}

export interface PublicPool {
  pool: PoolSummary & { priceCents: number; maxGamesPerParticipant: number; numbersPerGame: number; gamesPerPage: number | null; result: number[] | null };
  stats: PoolStats;
  tiers: { quadra: number; quina: number; sena: number };
  showOwners: boolean;
  games: PublicGame[];
}

export interface MyPool extends PoolSummary {
  priceCents: number;
  maxGamesPerParticipant: number;
  numbersPerGame: number;
  pixConfigured: boolean;
  /** Pix com o valor pendente; null se não houver chave ou nada a pagar. */
  pix: { amountCents: number; payload: string; name: string | null; bank: string | null } | null;
  result: number[] | null;
  games: number;
  dueCents: number;
  paidCents: number;
  paymentStatus: PaymentStatus;
  canEdit: boolean;
}

export interface MyGame {
  id: number;
  code: string;
  numbers: number[];
  hits: number | null;
  tier: PrizeTier;
  createdAt: string;
}

export interface AdminPool extends PoolSummary {
  priceCents: number;
  maxGamesPerParticipant: number;
  numbersPerGame: number;
  pixKey: string | null;
  pixName: string | null;
  pixCity: string | null;
  pixBank: string | null;
  gamesPerPage: number | null;
  result: number[] | null;
  resultRegisteredAt: string | null;
  stats: PoolStats;
}

export interface Member {
  userId: number;
  nickname: string;
  displayName: string;
  isActive: boolean;
  games: number;
  dueCents: number;
  paidCents: number;
  paidAt: string | null;
  paymentStatus: PaymentStatus;
}

export interface AdminGame extends MyGame {
  userId: number;
  status: 'active' | 'deleted';
  updatedAt: string;
  ownerNickname: string;
  ownerName: string;
  deletedAt: string | null;
}

export interface AdminUser {
  id: number;
  nickname: string;
  displayName: string;
  role: 'admin' | 'participant';
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  deleted: boolean;
  activeGames: number;
}

export interface AuditItem {
  id: number;
  action: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  before: any;
  after: any;
  createdAt: string;
  actor: string | null;
}

export interface Invite {
  id: number;
  poolId: number;
  poolName: string;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedBy: { nickname: string; displayName: string } | null;
  status: 'pending' | 'used' | 'expired' | 'revoked';
}

export interface InviteInfo {
  poolName: string;
  contestNumber: number;
  drawDate: string;
  expiresAt: string;
}

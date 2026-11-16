// Erros HTTP e validação simples de entradas.

export class HttpError extends Error {
  status: number;
  code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const notFound = (msg = 'Registro não encontrado.') => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);
export const forbidden = (msg = 'Acesso negado.') => new HttpError(403, msg);

type Body = Record<string, unknown>;

export function asBody(value: unknown): Body {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Body) : {};
}

export function str(body: Body, key: string, label: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string {
  const raw = body[key];
  if (raw === undefined || raw === null || raw === '') {
    if (opts.optional) return '';
    throw badRequest(`Informe ${label}.`);
  }
  if (typeof raw !== 'string') throw badRequest(`${cap(label)} inválido.`);
  const value = raw.trim();
  const min = opts.min ?? (opts.optional ? 0 : 1);
  if (value.length < min) throw badRequest(`${cap(label)} deve ter pelo menos ${min} caracteres.`);
  if (opts.max !== undefined && value.length > opts.max) throw badRequest(`${cap(label)} deve ter no máximo ${opts.max} caracteres.`);
  return value;
}

export function int(body: Body, key: string, label: string, min: number, max: number): number {
  const raw = body[key];
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw badRequest(`${cap(label)} deve ser um número inteiro entre ${min} e ${max}.`);
  }
  return value;
}

export function oneOf<T extends string>(body: Body, key: string, label: string, values: readonly T[]): T {
  const raw = body[key];
  if (typeof raw !== 'string' || !values.includes(raw as T)) throw badRequest(`${cap(label)} inválido.`);
  return raw as T;
}

export function isoDate(body: Body, key: string, label: string): string {
  const value = str(body, key, label);
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
  if (!ok) throw badRequest(`${cap(label)} inválida.`);
  return value;
}

export function idParam(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

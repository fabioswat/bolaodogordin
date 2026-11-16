// Regras compartilhadas entre servidor e interface.

export const NUMBERS_PER_GAME = 6;
export const MIN_NUMBER = 1;
export const MAX_NUMBER = 60;

export type PoolStatus = 'open' | 'locked' | 'closed';
export type PaymentStatus = 'none' | 'paid' | 'pending' | 'partial';
export type PrizeTier = 'sena' | 'quina' | 'quadra' | null;

export const POOL_STATUS_LABEL: Record<PoolStatus, string> = {
  open: 'Aberto',
  locked: 'Bloqueado',
  closed: 'Encerrado',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  none: 'Sem jogos',
  paid: 'Pago',
  pending: 'Pendente',
  partial: 'Parcial',
};

/** Valida a lista de dezenas. Retorna mensagem de erro ou null. */
export function validateNumbers(input: unknown): string | null {
  if (!Array.isArray(input)) return 'Informe as dezenas do jogo.';
  if (input.length !== NUMBERS_PER_GAME) return `O jogo deve ter exatamente ${NUMBERS_PER_GAME} dezenas.`;
  for (const n of input) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < MIN_NUMBER || n > MAX_NUMBER) {
      return `As dezenas devem ser números inteiros de ${pad(MIN_NUMBER)} a ${MAX_NUMBER}.`;
    }
  }
  if (new Set(input).size !== input.length) return 'O jogo não pode ter dezenas repetidas.';
  return null;
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Ordena e monta a forma canônica, ex.: "01-05-12-23-35-48". Assume dezenas válidas. */
export function normalizeNumbers(numbers: number[]): string {
  return [...numbers].sort((a, b) => a - b).map(pad).join('-');
}

export function parseCombination(combination: string): number[] {
  return combination.split('-').map(Number);
}

export function countHits(game: number[], result: number[]): number {
  const drawn = new Set(result);
  return game.filter((n) => drawn.has(n)).length;
}

export function prizeTier(hits: number): PrizeTier {
  if (hits === 6) return 'sena';
  if (hits === 5) return 'quina';
  if (hits === 4) return 'quadra';
  return null;
}

export function paymentStatus(dueCents: number, paidCents: number): PaymentStatus {
  if (dueCents <= 0) return paidCents > 0 ? 'paid' : 'none';
  if (paidCents >= dueCents) return 'paid';
  if (paidCents <= 0) return 'pending';
  return 'partial';
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Converte "6,00", "6.5", "R$ 1.234,56" em centavos. Retorna null se inválido. */
export function parseMoneyToCents(text: string): number | null {
  const clean = text.replace(/R\$\s?/i, '').trim();
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(clean)) return null;
  let normalized = clean;
  if (clean.includes(',')) normalized = clean.replace(/\./g, '').replace(',', '.');
  const value = Math.round(Number(normalized) * 100);
  return Number.isFinite(value) ? value : null;
}

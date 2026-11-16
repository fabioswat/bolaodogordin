import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { PaymentStatus, PoolStatus, PrizeTier } from '../../shared/rules.ts';
import { PAYMENT_STATUS_LABEL, POOL_STATUS_LABEL, pad } from '../../shared/rules.ts';

export function Ball({ n, variant = 'default', size = 'md' }: { n: number; variant?: 'default' | 'hit' | 'miss' | 'result'; size?: 'sm' | 'md' | 'lg' | 'fluid' }) {
  return <span className={`ball ball-${size} ball-${variant}`}>{pad(n)}</span>;
}

/**
 * Dezenas de um jogo; destaca as acertadas quando houver resultado.
 * highlight: dezena que o mouse está apontando na tabela (acende em todos os jogos).
 */
export function Balls({ numbers, result, size = 'md', highlight = null }: {
  numbers: number[]; result?: number[] | null; size?: 'sm' | 'md'; highlight?: number | null;
}) {
  const drawn = result ? new Set(result) : null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {numbers.map((n) => (
        <span key={n} data-n={n} className={`ball-hoverable ${highlight === n ? 'ball-glow' : ''}`}>
          <Ball n={n} size={size} variant={drawn ? (drawn.has(n) ? 'hit' : 'miss') : 'default'} />
        </span>
      ))}
    </div>
  );
}

/** Ícone ⓘ com balão de ajuda (abre ao passar o mouse ou ao tocar). */
export function InfoTip({ children, label = 'Mais informações' }: { children: ReactNode; label?: string }) {
  return (
    <span className="tip">
      <button type="button" className="tip-btn" aria-label={label}>i</button>
      <span role="tooltip" className="tip-box">{children}</span>
    </span>
  );
}

const POOL_STATUS_STYLE: Record<PoolStatus, string> = {
  open: 'bg-brand-100 text-brand-800',
  locked: 'bg-amber-100 text-amber-800',
  closed: 'bg-slate-200 text-slate-700',
};

export function PoolStatusBadge({ status }: { status: PoolStatus }) {
  const dot = status === 'open' ? 'bg-brand-500' : status === 'locked' ? 'bg-amber-500' : 'bg-slate-500';
  return (
    <span className={`badge ${POOL_STATUS_STYLE[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {POOL_STATUS_LABEL[status]}
    </span>
  );
}

const PAYMENT_STYLE: Record<PaymentStatus, string> = {
  none: 'bg-slate-100 text-slate-600',
  paid: 'bg-brand-100 text-brand-800',
  pending: 'bg-red-100 text-red-700',
  partial: 'bg-amber-100 text-amber-800',
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <span className={`badge ${PAYMENT_STYLE[status]}`}>{PAYMENT_STATUS_LABEL[status]}</span>;
}

const TIER_LABEL = { sena: 'Sena', quina: 'Quina', quadra: 'Quadra' } as const;

export function HitsBadge({ hits, tier }: { hits: number | null; tier: PrizeTier }) {
  if (hits === null) return null;
  if (tier) {
    return <span className="badge bg-gold-300 text-brand-900">★ {TIER_LABEL[tier]} · {hits} acertos</span>;
  }
  return <span className="badge bg-slate-100 text-slate-600">{hits} {hits === 1 ? 'acerto' : 'acertos'}</span>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-brand-800 tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info' | 'warning'; children: ReactNode }) {
  const style = {
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-brand-200 bg-brand-50 text-brand-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  }[kind];
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-3.5 py-2.5 text-sm ${style}`}>{children}</div>;
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
      {label}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-brand-900">{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Mensagem temporária de sucesso. */
export function useFlash(): [string | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg, setMsg];
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-300 px-6 py-10 text-center">
      <div className="font-semibold text-slate-700">{title}</div>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

import type { ReactNode } from 'react';
import type { PrizeTier } from '../../shared/rules.ts';
import { Ball, HitsBadge } from './ui.tsx';

interface TicketProps {
  code: string;
  numbers: number[];
  contestNumber: number;
  poolName: string;
  result?: number[] | null;
  hits?: number | null;
  tier?: PrizeTier;
  actions?: ReactNode;
}

/** Cartão de jogo com visual de canhoto de loteria. */
export function Ticket({ code, numbers, contestNumber, poolName, result, hits = null, tier = null, actions }: TicketProps) {
  return (
    <article className={`ticket ${tier ? 'ring-2 ring-gold-400' : ''}`}>
      <div className="ticket-stub">
        <span className="ticket-stub-label">BOLÃO</span>
        <span className="text-[10px] font-semibold opacity-80">Nº</span>
        <span className="font-mono text-[11px] font-bold tracking-wider [writing-mode:vertical-rl] rotate-180">{code}</span>
      </div>
      <div className="ticket-perforation" aria-hidden="true" />
      <div className="ticket-body">
        <div className="mb-2.5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">{poolName}</div>
            <div className="text-[11px] text-slate-500">Concurso {contestNumber} · 6 dezenas</div>
          </div>
          <span className="shrink-0 rounded-md border border-dashed border-slate-300 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
            {code}
          </span>
        </div>
        <div className="grid max-w-[16rem] grid-cols-6 gap-1.5">
          {numbers.map((n) => (
            <Ball key={n} n={n} size="fluid" variant={result ? (result.includes(n) ? 'hit' : 'miss') : 'default'} />
          ))}
        </div>
        {(hits !== null || actions) && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-slate-300 pt-2.5">
            <HitsBadge hits={hits} tier={tier} />
            {actions && <div className="ml-auto flex gap-1.5">{actions}</div>}
          </div>
        )}
      </div>
    </article>
  );
}

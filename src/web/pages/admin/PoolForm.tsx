import { useState } from 'react';
import type { FormEvent } from 'react';
import { parseMoneyToCents } from '../../../shared/rules.ts';
import { centsToInput } from '../../lib/format.ts';
import { Alert } from '../../components/ui.tsx';

export interface PoolFormValues {
  name: string;
  contestNumber: number;
  drawDate: string;
  priceCents: number;
  maxGamesPerParticipant: number;
}

export function PoolForm({ initial, submitLabel, onSubmit }: {
  initial?: PoolFormValues;
  submitLabel: string;
  onSubmit: (v: PoolFormValues) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [contest, setContest] = useState(initial ? String(initial.contestNumber) : '');
  const [drawDate, setDrawDate] = useState(initial?.drawDate ?? '');
  const [price, setPrice] = useState(initial ? centsToInput(initial.priceCents) : '');
  const [limit, setLimit] = useState(initial ? String(initial.maxGamesPerParticipant) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const priceCents = parseMoneyToCents(price);
    if (priceCents === null) return setError('Preço inválido. Use, por exemplo, 6,00.');
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        name, contestNumber: Number(contest), drawDate, priceCents, maxGamesPerParticipant: Number(limit),
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
      <div className="sm:col-span-2">
        <label className="label" htmlFor="pf-name">Nome do bolão</label>
        <input id="pf-name" className="input" required maxLength={80} placeholder="Mega da Virada 2026" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="pf-contest">Número do concurso</label>
        <input id="pf-contest" className="input" required inputMode="numeric" pattern="\d+" value={contest} onChange={(e) => setContest(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="pf-date">Data do sorteio</label>
        <input id="pf-date" type="date" className="input" required value={drawDate} onChange={(e) => setDrawDate(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="pf-price">Preço por jogo (R$)</label>
        <input id="pf-price" className="input" required inputMode="decimal" placeholder="6,00" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="pf-limit">Limite de jogos por participante</label>
        <input id="pf-limit" type="number" min={1} max={1000} className="input" required value={limit} onChange={(e) => setLimit(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Salvando…' : submitLabel}</button>
      </div>
    </form>
  );
}

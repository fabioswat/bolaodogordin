import { useState } from 'react';
import type { FormEvent } from 'react';
import { MAX_GAME_NUMBERS, MIN_GAME_NUMBERS, parseMoneyToCents } from '../../../shared/rules.ts';
import { centsToInput } from '../../lib/format.ts';
import { Alert } from '../../components/ui.tsx';

export interface PoolFormValues {
  name: string;
  contestNumber: number;
  drawDate: string;
  priceCents: number;
  maxGamesPerParticipant: number;
  numbersPerGame: number;
  pixKey: string | null;
  pixName: string | null;
  pixCity: string | null;
}

/**
 * initial: valores do bolão sendo editado.
 * pixDefaults: ao criar, já preenche o Pix com o do último bolão.
 * lockNumbers: impede mudar a quantidade de dezenas (bolão com jogos).
 */
export function PoolForm({ initial, pixDefaults, lockNumbers, submitLabel, onSubmit }: {
  initial?: PoolFormValues;
  pixDefaults?: Pick<PoolFormValues, 'pixKey' | 'pixName' | 'pixCity'>;
  lockNumbers?: boolean;
  submitLabel: string;
  onSubmit: (v: PoolFormValues) => Promise<void>;
}) {
  const pix = initial ?? pixDefaults;
  const [name, setName] = useState(initial?.name ?? '');
  const [contest, setContest] = useState(initial ? String(initial.contestNumber) : '');
  const [drawDate, setDrawDate] = useState(initial?.drawDate ?? '');
  const [price, setPrice] = useState(initial ? centsToInput(initial.priceCents) : '');
  const [limit, setLimit] = useState(initial ? String(initial.maxGamesPerParticipant) : '');
  const [numbers, setNumbers] = useState(initial?.numbersPerGame ?? MIN_GAME_NUMBERS);
  const [pixKey, setPixKey] = useState(pix?.pixKey ?? '');
  const [pixName, setPixName] = useState(pix?.pixName ?? '');
  const [pixCity, setPixCity] = useState(pix?.pixCity ?? '');
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
        numbersPerGame: numbers,
        pixKey: pixKey.trim() || null, pixName: pixName.trim() || null, pixCity: pixCity.trim() || null,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const hasKey = pixKey.trim() !== '';

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
      <div>
        <label className="label" htmlFor="pf-numbers">Dezenas por jogo</label>
        <select id="pf-numbers" className="input" value={numbers} disabled={lockNumbers} onChange={(e) => setNumbers(Number(e.target.value))}>
          {Array.from({ length: MAX_GAME_NUMBERS - MIN_GAME_NUMBERS + 1 }, (_, i) => MIN_GAME_NUMBERS + i).map((n) => (
            <option key={n} value={n}>{n} dezenas</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          {lockNumbers
            ? 'Não dá para mudar: o bolão já tem jogos.'
            : 'O resultado continua com 6 dezenas. Ajuste o preço por jogo conforme a tabela da Caixa.'}
        </p>
      </div>

      <fieldset className="mt-2 grid gap-3 rounded-xl border border-slate-200 p-3 sm:col-span-2 sm:grid-cols-2">
        <legend className="px-1 text-sm font-bold text-brand-900">Pagamento via Pix (opcional)</legend>
        <p className="text-xs text-slate-500 sm:col-span-2">
          Com a chave preenchida, cada participante vê em "Meus jogos" um QR Code e o Pix copia e cola com o valor exato que falta pagar.
          A confirmação do pagamento continua sendo feita por você.
        </p>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="pf-pixkey">Chave Pix</label>
          <input id="pf-pixkey" className="input" maxLength={77} autoCapitalize="none" placeholder="e-mail, CPF, CNPJ, aleatória ou +5511999998888"
            value={pixKey} onChange={(e) => setPixKey(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">Telefone: use +55 e o DDD (ex.: +5511999998888). Deixe em branco para não mostrar Pix.</p>
        </div>
        <div>
          <label className="label" htmlFor="pf-pixname">Nome de quem recebe</label>
          <input id="pf-pixname" className="input" maxLength={25} required={hasKey} placeholder="Como aparece no banco"
            value={pixName} onChange={(e) => setPixName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="pf-pixcity">Cidade</label>
          <input id="pf-pixcity" className="input" maxLength={15} required={hasKey} placeholder="Ex.: Campinas"
            value={pixCity} onChange={(e) => setPixCity(e.target.value)} />
        </div>
      </fieldset>

      <div className="sm:col-span-2">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Salvando…' : submitLabel}</button>
      </div>
    </form>
  );
}

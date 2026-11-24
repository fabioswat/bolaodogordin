import { useState } from 'react';
import type { FormEvent } from 'react';
import { DEFAULT_GAMES_PER_PAGE, MAX_GAMES_PER_PAGE, MAX_GAME_NUMBERS, MIN_GAME_NUMBERS, parseMoneyToCents } from '../../../shared/rules.ts';
import { centsToInput } from '../../lib/format.ts';
import { Alert } from '../../components/ui.tsx';
import { parsePixPayload } from '../../../shared/pix.ts';

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
  pixBank: string | null;
  gamesPerPage: number | null;
}

/**
 * initial: valores do bolão sendo editado.
 * pixDefaults: ao criar, já preenche o Pix com o do último bolão.
 * lockNumbers: impede mudar a quantidade de dezenas (bolão com jogos).
 */
export function PoolForm({ initial, pixDefaults, lockNumbers, submitLabel, onSubmit }: {
  initial?: PoolFormValues;
  pixDefaults?: Pick<PoolFormValues, 'pixKey' | 'pixName' | 'pixCity' | 'pixBank'>;
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
  const [perPage, setPerPage] = useState(initial?.gamesPerPage ? String(initial.gamesPerPage) : '');
  const [pixKey, setPixKey] = useState(pix?.pixKey ?? '');
  const [pixName, setPixName] = useState(pix?.pixName ?? '');
  const [pixCity, setPixCity] = useState(pix?.pixCity ?? '');
  const [pixBank, setPixBank] = useState(pix?.pixBank ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const priceCents = parseMoneyToCents(price);
    if (priceCents === null) return setError('Preço inválido. Use, por exemplo, 6,00.');
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        name, contestNumber: Number(contest), drawDate, priceCents, maxGamesPerParticipant: Number(limit),
        numbersPerGame: numbers,
        pixKey: pixKey.trim() || null, pixName: pixName.trim() || null, pixCity: pixCity.trim() || null,
        pixBank: pixBank.trim() || null,
        gamesPerPage: perPage.trim() === '' ? null : Number(perPage),
      });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const hasKey = pixKey.trim() !== '';

  // Colou um "Pix copia e cola" no campo da chave: extrai chave, nome e cidade.
  const [pixNote, setPixNote] = useState<{ ok: boolean; text: string } | null>(null);
  const onKeyChange = (value: string) => {
    if (value.trim().startsWith('000201') && value.trim().length > 40) {
      const parsed = parsePixPayload(value);
      if (parsed.ok) {
        setPixKey(parsed.key);
        if (parsed.name) setPixName(parsed.name.slice(0, 25));
        if (parsed.city) setPixCity(parsed.city.slice(0, 15));
        setPixNote({ ok: true, text: 'Dados lidos do Pix copia e cola. Confira e salve.' });
      } else {
        setPixKey('');
        setPixNote({ ok: false, text: parsed.reason });
      }
      return;
    }
    setPixNote(null);
    setPixKey(value);
  };

  return (
    <form onSubmit={submit} onChange={() => setSaved(false)} className="grid gap-3 sm:grid-cols-2">
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
        {lockNumbers ? (
          <>
            <div id="pf-numbers" className="input flex items-center justify-between bg-slate-50 text-slate-600">
              <span>{numbers} dezenas</span>
              <span aria-hidden="true">🔒</span>
            </div>
            <p className="mt-1 text-xs text-amber-700">
              Fixo porque o bolão já tem jogos cadastrados. Para usar outra quantidade, crie um bolão novo.
            </p>
          </>
        ) : (
          <>
            <select id="pf-numbers" className="input" value={numbers} onChange={(e) => setNumbers(Number(e.target.value))}>
              {Array.from({ length: MAX_GAME_NUMBERS - MIN_GAME_NUMBERS + 1 }, (_, i) => MIN_GAME_NUMBERS + i).map((n) => (
                <option key={n} value={n}>{n} dezenas</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">O resultado continua com 6 dezenas. Ajuste o preço por jogo conforme a tabela da Caixa.</p>
          </>
        )}
      </div>

      <div>
        <label className="label" htmlFor="pf-perpage">Jogos por página (página inicial)</label>
        <input id="pf-perpage" type="number" min={1} max={MAX_GAMES_PER_PAGE} className="input" placeholder={String(DEFAULT_GAMES_PER_PAGE)}
          value={perPage} onChange={(e) => setPerPage(e.target.value)} />
        <p className="mt-1 text-xs text-slate-500">
          Em branco: {DEFAULT_GAMES_PER_PAGE}. Use um múltiplo dos jogos por pessoa (ex.: 12 para 3 jogos cada) para não separar os jogos de alguém.
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
          <input id="pf-pixkey" className="input" autoCapitalize="none" placeholder="e-mail, CPF, CNPJ, aleatória, +5511999998888 ou cole um Pix copia e cola"
            value={pixKey} onChange={(e) => onKeyChange(e.target.value)} />
          {pixNote && <p className={`mt-1 text-xs ${pixNote.ok ? 'text-brand-700' : 'text-red-700'}`}>{pixNote.text}</p>}
          <p className="mt-1 text-xs text-slate-500">
            Telefone: use +55 e o DDD (ex.: +5511999998888). Se tiver um Pix copia e cola seu (ex.: gerado no Mercado Pago), pode colar aqui:
            a chave, o nome e a cidade são preenchidos sozinhos. Deixe em branco para não mostrar Pix.
          </p>
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
        <div className="sm:col-span-2">
          <label className="label" htmlFor="pf-pixbank">Instituição (opcional)</label>
          <input id="pf-pixbank" className="input" maxLength={40} placeholder="Ex.: Mercado Pago"
            value={pixBank} onChange={(e) => setPixBank(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">Aparece para o participante junto com o nome de quem recebe.</p>
        </div>
      </fieldset>

      {/* Retorno junto do botão (antes aparecia no topo da página, fora da vista). */}
      {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Salvando…' : submitLabel}</button>
        {saved && <span className="text-sm font-semibold text-brand-700" role="status">✓ Alterações salvas</span>}
      </div>
    </form>
  );
}

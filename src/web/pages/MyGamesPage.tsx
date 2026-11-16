import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MyGame, MyPool, PublicPool } from '../lib/api.ts';
import { del, get, post, put } from '../lib/api.ts';
import { formatCents, formatDate } from '../lib/format.ts';
import { Link, navigate, useLocation } from '../lib/router.tsx';
import { normalizeNumbers, randomGame } from '../../shared/rules.ts';
import { NumberPicker } from '../components/NumberPicker.tsx';
import { PixPayment } from '../components/PixPayment.tsx';
import { Ticket } from '../components/Ticket.tsx';
import { Alert, EmptyState, PaymentBadge, PoolStatusBadge, Spinner, useFlash } from '../components/ui.tsx';

export function MyGamesPage() {
  const { query } = useLocation();
  const [pools, setPools] = useState<MyPool[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPools = useCallback(() => get<MyPool[]>('/api/me/pools').then(setPools).catch((e) => setError(e.message)), []);
  useEffect(() => { loadPools(); }, [loadPools]);

  if (error) return <Alert>{error}</Alert>;
  if (!pools) return <Spinner />;
  if (pools.length === 0) {
    return (
      <EmptyState title="Você ainda não participa de nenhum bolão">
        Peça ao administrador para incluir você em um bolão. Enquanto isso, veja os <Link className="font-semibold text-brand-700 underline" href="/">jogos públicos</Link>.
      </EmptyState>
    );
  }

  const selectedId = Number(query.get('bolao')) || pools[0].id;
  const pool = pools.find((p) => p.id === selectedId) ?? pools[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-900">Meus jogos</h1>
        {pools.length > 1 && (
          <select className="input max-w-xs" value={pool.id} aria-label="Bolão"
            onChange={(e) => navigate(`/meus-jogos?bolao=${e.target.value}`, true)}>
            {pools.map((p) => <option key={p.id} value={p.id}>{p.name} — Concurso {p.contestNumber}</option>)}
          </select>
        )}
      </div>
      <PoolGames key={pool.id} pool={pool} onChanged={loadPools} />
    </div>
  );
}

function PoolGames({ pool, onChanged }: { pool: MyPool; onChanged: () => void }) {
  const [games, setGames] = useState<MyGame[] | null>(null);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<number[]>([]);
  const [editing, setEditing] = useState<MyGame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useFlash();

  const load = useCallback(async () => {
    const [mine, pub] = await Promise.all([
      get<MyGame[]>(`/api/me/pools/${pool.id}/games`),
      get<PublicPool>(`/api/public/pools/${pool.id}`),
    ]);
    setGames(mine);
    setTaken(new Set(pub.games.map((g) => normalizeNumbers(g.numbers))));
  }, [pool.id]);

  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  const remaining = pool.maxGamesPerParticipant - pool.games;
  const canCreate = pool.canEdit && (remaining > 0 || editing !== null);
  const count = pool.numbersPerGame;
  const complete = picked.length === count;

  // Surpresinha: dezenas aleatórias que ainda não existem no bolão (a pessoa confere e registra).
  const surprise = () => {
    const used = new Set(taken);
    if (ownCombination) used.delete(ownCombination);
    const g = randomGame(count, used);
    if (g) { setPicked(g); setError(null); }
    else setError('Não foi possível sortear uma combinação livre. Tente de novo.');
  };
  const combination = complete ? normalizeNumbers(picked) : null;
  const ownCombination = editing ? normalizeNumbers(editing.numbers) : null;
  const duplicate = useMemo(
    () => combination !== null && combination !== ownCombination && taken.has(combination),
    [combination, ownCombination, taken],
  );

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await put(`/api/me/games/${editing.id}`, { numbers: picked });
        setFlash('Jogo atualizado.');
      } else {
        await post(`/api/me/pools/${pool.id}/games`, { numbers: picked });
        setFlash('Jogo cadastrado!');
      }
      setPicked([]);
      setEditing(null);
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (g: MyGame) => {
    if (!window.confirm(`Excluir o jogo ${g.code}? A combinação ficará livre para outros participantes.`)) return;
    setError(null);
    try {
      await del(`/api/me/games/${g.id}`);
      if (editing?.id === g.id) { setEditing(null); setPicked([]); }
      setFlash('Jogo excluído.');
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const startEdit = (g: MyGame) => {
    setEditing(g);
    setPicked(g.numbers);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const lockedReason = pool.result
    ? 'O resultado já foi cadastrado; os jogos não podem mais ser alterados.'
    : pool.status === 'locked'
      ? 'Os cadastros estão bloqueados pelo administrador no momento.'
      : 'Os cadastros deste bolão foram encerrados.';

  return (
    <>
      <section className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-brand-900">{pool.name}</h2>
            <PoolStatusBadge status={pool.status} />
          </div>
          <div className="text-sm text-slate-500">
            Concurso {pool.contestNumber} · sorteio em {formatDate(pool.drawDate)} ·{' '}
            <Link href={`/bolao/${pool.id}`} className="font-semibold text-brand-700 hover:underline">ver todos os jogos</Link>
          </div>
        </div>
        <Info label="Jogos" value={`${pool.games} de ${pool.maxGamesPerParticipant}`} />
        <Info label="Valor devido" value={formatCents(pool.dueCents)} hint={`${formatCents(pool.priceCents)} por jogo`} />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pagamento</div>
          <div className="mt-1"><PaymentBadge status={pool.paymentStatus} /></div>
        </div>
      </section>

      {pool.pix && <PixPayment amountCents={pool.pix.amountCents} payload={pool.pix.payload} name={pool.pix.name} bank={pool.pix.bank} />}
      {!pool.pixConfigured && pool.paymentStatus !== 'paid' && pool.paymentStatus !== 'none' && (
        <Alert kind="info">Combine o pagamento com o administrador do bolão.</Alert>
      )}

      {flash && <Alert kind="success">{flash}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <section className="card h-fit p-4 sm:p-5">
          {!pool.canEdit ? (
            <Alert kind="warning">{lockedReason}</Alert>
          ) : !canCreate ? (
            <Alert kind="info">Você atingiu o limite de {pool.maxGamesPerParticipant} jogo(s). Exclua um jogo para cadastrar outro.</Alert>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold text-brand-900">{editing ? `Editando jogo ${editing.code}` : 'Novo jogo'}</h3>
                {!editing && <span className="text-xs text-slate-500">{remaining} restante(s)</span>}
              </div>
              <NumberPicker value={picked} onChange={setPicked} count={count}
                extra={(
                  <button type="button" className="btn btn-gold btn-sm" onClick={surprise} title="Preenche com dezenas aleatórias que ainda não foram usadas no bolão">
                    🎲 Surpresinha
                  </button>
                )} />
              {duplicate && <div className="mt-3"><Alert kind="warning">Essa combinação já foi registrada neste bolão.</Alert></div>}
              <div className="mt-4 flex gap-2">
                <button className="btn btn-primary flex-1" disabled={!complete || duplicate || busy} onClick={save}>
                  {busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Registrar jogo'}
                </button>
                {editing && (
                  <button className="btn btn-ghost" onClick={() => { setEditing(null); setPicked([]); }}>Cancelar</button>
                )}
              </div>
            </>
          )}
        </section>

        <section>
          {!games ? <Spinner /> : games.length === 0 ? (
            <EmptyState title="Nenhum jogo cadastrado">Escolha {count} dezenas (ou use a Surpresinha) e registre seu primeiro jogo.</EmptyState>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {games.map((g) => (
                <Ticket key={g.id} code={g.code} numbers={g.numbers} contestNumber={pool.contestNumber} poolName={pool.name}
                  result={pool.result} hits={g.hits} tier={g.tier}
                  actions={pool.canEdit && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(g)}>Editar</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(g)}>Excluir</button>
                    </>
                  )} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Info({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-bold text-brand-800 tabular-nums">{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import type { PoolSummary, PublicPool } from '../lib/api.ts';
import { get } from '../lib/api.ts';
import { formatCents, formatDate, pad } from '../lib/format.ts';
import { navigate } from '../lib/router.tsx';
import { useAuth } from '../lib/auth.tsx';
import { Alert, Balls, EmptyState, HitsBadge, InfoTip, PoolStatusBadge, Spinner, Stat } from '../components/ui.tsx';
import { DrawBalls } from '../components/DrawBalls.tsx';

export function PublicPage({ poolId }: { poolId?: number }) {
  const [pools, setPools] = useState<PoolSummary[] | null>(null);
  const [data, setData] = useState<PublicPool | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [hovered, setHovered] = useState<number | null>(null);
  // Os nomes dependem de quem está logado: recarrega ao entrar ou sair.
  const viewerId = useAuth().user?.id ?? null;

  useEffect(() => {
    get<PoolSummary[]>('/api/public/pools').then(setPools).catch((e) => setError(e.message));
  }, []);

  const currentId = poolId ?? pools?.[0]?.id;

  useEffect(() => {
    if (!currentId) return;
    setData(null);
    get<PublicPool>(`/api/public/pools/${currentId}`).then(setData).catch((e) => setError(e.message));
  }, [currentId, viewerId]);

  const filterNumbers = useMemo(
    () => (filter.match(/\d+/g) ?? []).map(Number).filter((n) => n >= 1 && n <= 60),
    [filter],
  );
  const games = useMemo(() => {
    if (!data) return [];
    const term = filter.trim().toUpperCase();
    const plain = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
    return data.games.filter((g) => {
      if (!term) return true;
      if (/[A-Z]/.test(plain(term))) {
        return g.code.includes(term.replace(/\s/g, '')) || (!!g.owner && plain(g.owner).includes(plain(term)));
      }
      return filterNumbers.every((n) => g.numbers.includes(n));
    });
  }, [data, filter, filterNumbers]);

  if (error) return <Alert>{error}</Alert>;
  if (!pools) return <Spinner />;
  if (pools.length === 0) {
    return <EmptyState title="Nenhum bolão cadastrado ainda">Assim que o administrador criar um bolão, ele aparecerá aqui.</EmptyState>;
  }
  if (!data) return <Spinner />;

  const { pool, stats, tiers, showOwners } = data;
  const result = pool.result;

  return (
    <div className="space-y-6">
      <section className="hero overflow-hidden rounded-3xl px-5 py-7 text-white shadow-lg sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <PoolStatusBadge status={pool.status} />
              <span className="text-sm text-white/75">Concurso {pool.contestNumber}</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{pool.name}</h1>
            <p className="mt-1 text-white/80">
              Sorteio em <b className="text-white">{formatDate(pool.drawDate)}</b> · {formatCents(pool.priceCents)} por jogo
            </p>
          </div>
          {pools.length > 1 && (
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/70">Bolão</span>
              <select className="input max-w-[16rem] text-slate-800" value={pool.id}
                onChange={(e) => navigate(`/bolao/${e.target.value}`)}>
                {pools.map((p) => <option key={p.id} value={p.id}>{p.name} — Concurso {p.contestNumber}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="mt-6 rounded-2xl bg-black/20 p-4 backdrop-blur-sm sm:p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-gold-300">
            Resultado do sorteio
            <InfoTip label="Sobre o resultado">
              {result
                ? 'Dezenas sorteadas. Douradas: acertadas pelo melhor jogo do bolão. Vermelhas: as que faltaram para ele.'
                : 'O resultado ainda não foi cadastrado. Após o sorteio, as dezenas e a conferência aparecerão aqui.'}
            </InfoTip>
          </div>
          <DrawBalls result={result} games={data.games} aside={result && (
            <div className="flex gap-2">
              {(['sena', 'quina', 'quadra'] as const).map((t) => (
                <div key={t} className="min-w-[5rem] rounded-xl bg-white/10 px-3 py-2 text-center">
                  <div className="text-2xl font-extrabold tabular-nums">{tiers[t]}</div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/75">{t}</div>
                </div>
              ))}
            </div>
          )} />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Participantes" value={stats.participants} />
        <Stat label="Jogos registrados" value={stats.games} hint={`Limite de ${pool.maxGamesPerParticipant} por participante`} />
        <Stat label="Arrecadação prevista" value={formatCents(stats.expectedCents)} />
        <Stat label="Arrecadado" value={formatCents(stats.receivedCents)}
          hint={stats.expectedCents > 0 ? `${Math.min(100, Math.round((stats.receivedCents / stats.expectedCents) * 100))}% do previsto` : undefined} />
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="font-bold text-brand-900">Jogos do bolão</h2>
            <p className="text-xs text-slate-500">
              {showOwners
                ? 'Os nomes aparecem só para quem participa do bolão e está logado.'
                : 'Os jogos são exibidos sem identificar quem os cadastrou. Participantes logados veem os nomes.'}
            </p>
          </div>
          <input className="input max-w-[16rem]" placeholder={showOwners ? 'Filtrar: dezenas, código ou nome' : 'Filtrar: dezenas (ex.: 7 23) ou código'}
            value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar jogos" />
        </div>
        {games.length === 0 ? (
          <div className="p-6"><EmptyState title={data.games.length ? 'Nenhum jogo corresponde ao filtro' : 'Nenhum jogo registrado ainda'} /></div>
        ) : (
          <div className="table-wrap"
            onPointerOver={(e) => {
              const el = (e.target as HTMLElement).closest('[data-n]');
              setHovered(el ? Number(el.getAttribute('data-n')) : null);
            }}
            onPointerLeave={() => setHovered(null)}>
            <table className="table">
              <thead>
                <tr>
                  <th className="w-12">#</th>
                  <th>Código</th>
                  {showOwners && <th>Participante</th>}
                  <th>Dezenas</th>
                  {result && <th>Conferência</th>}
                </tr>
              </thead>
              <tbody>
                {games.map((g, i) => (
                  <tr key={g.code} className={g.tier ? 'bg-gold-100/60' : undefined}>
                    <td className="text-xs text-slate-400 tabular-nums">{pad(i + 1)}</td>
                    <td className="font-mono text-xs font-semibold text-slate-600">{g.code}</td>
                    {showOwners && <td className="whitespace-nowrap text-sm font-semibold text-brand-900">{g.owner}</td>}
                    <td><Balls numbers={g.numbers} result={result} size="sm" highlight={hovered} /></td>
                    {result && <td><HitsBadge hits={g.hits} tier={g.tier} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          {games.length} de {data.games.length} jogo(s)
        </div>
      </section>
    </div>
  );
}

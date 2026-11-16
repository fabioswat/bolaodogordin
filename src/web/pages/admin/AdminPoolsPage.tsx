import { useEffect, useState } from 'react';
import type { AdminPool } from '../../lib/api.ts';
import { get, post } from '../../lib/api.ts';
import { formatCents, formatDate } from '../../lib/format.ts';
import { Link, navigate } from '../../lib/router.tsx';
import { Alert, EmptyState, PoolStatusBadge, Spinner } from '../../components/ui.tsx';
import { PoolForm } from './PoolForm.tsx';
import { AdminNav } from './AdminNav.tsx';

export function AdminPoolsPage() {
  const [pools, setPools] = useState<AdminPool[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    get<AdminPool[]>('/api/admin/pools').then(setPools).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-5">
      <AdminNav active="pools" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-900">Bolões</h1>
        {!creating && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Novo bolão</button>}
      </div>

      {creating && (
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-brand-900">Novo bolão</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setCreating(false)}>Cancelar</button>
          </div>
          <PoolForm submitLabel="Criar bolão" pixDefaults={pools?.find((p) => p.pixKey) ?? undefined} onSubmit={async (v) => {
            const pool = await post<AdminPool>('/api/admin/pools', v);
            navigate(`/admin/bolao/${pool.id}`);
          }} />
          <p className="mt-3 text-xs text-slate-500">O bolão é criado aberto. Depois, adicione os participantes.</p>
        </section>
      )}

      {error && <Alert>{error}</Alert>}
      {!pools ? <Spinner /> : pools.length === 0 ? (
        <EmptyState title="Nenhum bolão criado">Crie o primeiro bolão para começar.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pools.map((p) => (
            <Link key={p.id} href={`/admin/bolao/${p.id}`} className="card block p-5 transition hover:border-brand-200 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-brand-900">{p.name}</h2>
                  <p className="text-sm text-slate-500">Concurso {p.contestNumber} · {formatDate(p.drawDate)}</p>
                </div>
                <PoolStatusBadge status={p.status} />
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-xs text-slate-500">Participantes</dt><dd className="font-bold tabular-nums">{p.stats.participants}</dd></div>
                <div><dt className="text-xs text-slate-500">Jogos</dt><dd className="font-bold tabular-nums">{p.stats.games}</dd></div>
                <div><dt className="text-xs text-slate-500">Recebido</dt><dd className="font-bold tabular-nums">{formatCents(p.stats.receivedCents)} <span className="font-normal text-slate-400">/ {formatCents(p.stats.expectedCents)}</span></dd></div>
              </dl>
              {p.result && <p className="mt-3 text-xs font-semibold text-gold-700">Resultado cadastrado</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

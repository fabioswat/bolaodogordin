import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminGame, AdminPool, AdminUser, AuditItem, Member } from '../../lib/api.ts';
import { del, get, post, put } from '../../lib/api.ts';
import { formatCents, formatDate, formatDateTime, pad } from '../../lib/format.ts';
import { Link, navigate, useLocation } from '../../lib/router.tsx';
import type { PoolStatus } from '../../../shared/rules.ts';
import { NUMBERS_PER_GAME, POOL_STATUS_LABEL } from '../../../shared/rules.ts';
import { NumberPicker } from '../../components/NumberPicker.tsx';
import { Alert, Ball, Balls, EmptyState, HitsBadge, Modal, PaymentBadge, PoolStatusBadge, Spinner, Stat, useFlash } from '../../components/ui.tsx';
import { PoolForm } from './PoolForm.tsx';
import { AdminNav } from './AdminNav.tsx';

const TABS = [
  ['participantes', 'Participantes e pagamentos'],
  ['jogos', 'Jogos'],
  ['resultado', 'Resultado'],
  ['config', 'Configurações'],
  ['historico', 'Histórico'],
] as const;
type Tab = (typeof TABS)[number][0];

export function AdminPoolPage({ poolId }: { poolId: number }) {
  const { query } = useLocation();
  const tab = (TABS.some(([t]) => t === query.get('aba')) ? query.get('aba') : 'participantes') as Tab;
  const [pool, setPool] = useState<AdminPool | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  const reload = useCallback(() => get<AdminPool>(`/api/admin/pools/${poolId}`).then(setPool).catch((e) => setError(e.message)), [poolId]);
  useEffect(() => { reload(); }, [reload]);

  const changeStatus = async (status: PoolStatus) => {
    try {
      await post(`/api/admin/pools/${poolId}/status`, { status });
      setFlash(`Situação alterada para "${POOL_STATUS_LABEL[status]}".`);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (error && !pool) return <Alert>{error}</Alert>;
  if (!pool) return <Spinner />;

  return (
    <div className="space-y-5">
      <AdminNav active="pools" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm font-semibold text-slate-500 hover:text-brand-700">← Bolões</Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-brand-900">{pool.name}</h1>
            <PoolStatusBadge status={pool.status} />
          </div>
          <p className="text-sm text-slate-500">
            Concurso {pool.contestNumber} · sorteio {formatDate(pool.drawDate)} · {formatCents(pool.priceCents)} por jogo · {pool.numbersPerGame} dezenas · até {pool.maxGamesPerParticipant} jogo(s) por participante
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pool.status !== 'open' && <button className="btn btn-primary" onClick={() => changeStatus('open')}>Abrir cadastros</button>}
          {pool.status !== 'locked' && <button className="btn btn-ghost" onClick={() => changeStatus('locked')}>Bloquear</button>}
          {pool.status !== 'closed' && <button className="btn btn-ghost" onClick={() => changeStatus('closed')}>Encerrar</button>}
          <Link href={`/bolao/${pool.id}`} className="btn btn-ghost">Página pública ↗</Link>
        </div>
      </div>

      {flash && <Alert kind="success">{flash}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Participantes" value={pool.stats.participants} />
        <Stat label="Jogos ativos" value={pool.stats.games} />
        <Stat label="Previsto" value={formatCents(pool.stats.expectedCents)} />
        <Stat label="Recebido" value={formatCents(pool.stats.receivedCents)}
          hint={pool.stats.expectedCents > pool.stats.receivedCents ? `Falta ${formatCents(pool.stats.expectedCents - pool.stats.receivedCents)}` : 'Tudo recebido'} />
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? 'tab-active' : ''}`}
            onClick={() => navigate(`/admin/bolao/${pool.id}?aba=${key}`, true)}>{label}</button>
        ))}
      </nav>

      {tab === 'participantes' && <MembersTab pool={pool} onChanged={reload} />}
      {tab === 'jogos' && <GamesTab pool={pool} onChanged={reload} />}
      {tab === 'resultado' && <ResultTab pool={pool} onChanged={reload} />}
      {tab === 'config' && (
        <section className="card p-5">
          <PoolForm initial={pool} lockNumbers={pool.stats.games > 0} submitLabel="Salvar alterações" onSubmit={async (v) => {
            await put(`/api/admin/pools/${pool.id}`, v);
            setFlash('Bolão atualizado.');
            reload();
          }} />
        </section>
      )}
      {tab === 'historico' && <AuditTab poolId={pool.id} />}
    </div>
  );
}

// ---------------- Participantes e pagamentos ----------------

function MembersTab({ pool, onChanged }: { pool: AdminPool; onChanged: () => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [toAdd, setToAdd] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [m, u] = await Promise.all([
      get<Member[]>(`/api/admin/pools/${pool.id}/members`),
      get<AdminUser[]>('/api/admin/users'),
    ]);
    setMembers(m);
    setUsers(u);
  }, [pool.id]);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const available = users.filter((u) => u.isActive && !members?.some((m) => m.userId === u.id));
  const totals = (members ?? []).reduce((acc, m) => ({ games: acc.games + m.games, due: acc.due + m.dueCents, paid: acc.paid + m.paidCents }), { games: 0, due: 0, paid: 0 });

  return (
    <section className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <div className="card flex flex-wrap items-end gap-2 p-4">
        <div className="min-w-[14rem] flex-1">
          <label className="label" htmlFor="add-member">Adicionar participante</label>
          <select id="add-member" className="input" value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
            <option value="">{available.length ? 'Selecione um usuário…' : 'Todos os usuários ativos já participam'}</option>
            {available.map((u) => <option key={u.id} value={u.id}>{u.nickname} — {u.displayName}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" disabled={!toAdd}
          onClick={() => run(async () => { await post(`/api/admin/pools/${pool.id}/members`, { userId: Number(toAdd) }); setToAdd(''); })}>
          Adicionar
        </button>
        {available.length > 1 && (
          <button className="btn btn-ghost" onClick={() => run(async () => {
            for (const u of available) await post(`/api/admin/pools/${pool.id}/members`, { userId: u.id });
          })}>Adicionar todos ({available.length})</button>
        )}
        <Link href="/admin/usuarios" className="btn btn-ghost">Cadastrar usuário</Link>
      </div>

      {!members ? <Spinner /> : members.length === 0 ? (
        <EmptyState title="Nenhum participante neste bolão">Adicione usuários acima.</EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Participante</th><th className="text-right">Jogos</th><th className="text-right">Devido</th>
                <th className="text-right">Recebido</th><th>Situação</th><th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId}>
                  <td>
                    <div className="font-semibold">{m.nickname}{!m.isActive && <span className="ml-1 text-xs text-red-600">(desativado)</span>}</div>
                    <div className="text-xs text-slate-500">{m.displayName}</div>
                  </td>
                  <td className="text-right tabular-nums">{m.games}</td>
                  <td className="text-right tabular-nums">{formatCents(m.dueCents)}</td>
                  <td className="text-right tabular-nums">
                    {formatCents(m.paidCents)}
                    {m.paidAt && <div className="text-[11px] text-slate-400">{formatDateTime(m.paidAt)}</div>}
                  </td>
                  <td>
                    <PaymentBadge status={m.paymentStatus} />
                    {m.paymentStatus === 'partial' && <div className="text-[11px] text-amber-700">Falta {formatCents(m.dueCents - m.paidCents)}</div>}
                  </td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      {m.dueCents > 0 && m.paymentStatus !== 'paid' && (
                        <button className="btn btn-primary btn-sm" onClick={() => run(() => post(`/api/admin/pools/${pool.id}/members/${m.userId}/payment`, { status: 'paid' }))}>
                          Marcar pago
                        </button>
                      )}
                      {m.paidCents > 0 && (
                        <button className="btn btn-ghost btn-sm" onClick={() => run(() => post(`/api/admin/pools/${pool.id}/members/${m.userId}/payment`, { status: 'pending' }))}>
                          Marcar pendente
                        </button>
                      )}
                      <Link href={`/admin/bolao/${pool.id}?aba=jogos&dono=${m.userId}`} className="btn btn-ghost btn-sm">Jogos</Link>
                      {m.games === 0 && m.paidCents === 0 && (
                        <button className="btn btn-danger btn-sm" onClick={() => {
                          if (window.confirm(`Remover ${m.nickname} deste bolão?`)) run(() => del(`/api/admin/pools/${pool.id}/members/${m.userId}`));
                        }}>Remover</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.games}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCents(totals.due)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCents(totals.paid)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        O valor devido é o preço por jogo × jogos ativos. "Marcar pago" registra o valor devido atual; se o participante cadastrar mais jogos depois, a diferença aparece como pendente.
      </p>
    </section>
  );
}

// ---------------- Jogos ----------------

function GamesTab({ pool, onChanged }: { pool: AdminPool; onChanged: () => void }) {
  const { query } = useLocation();
  const [games, setGames] = useState<AdminGame[] | null>(null);
  const [owner, setOwner] = useState(query.get('dono') ?? '');
  const [search, setSearch] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [editing, setEditing] = useState<AdminGame | null>(null);
  const [deleting, setDeleting] = useState<AdminGame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  const load = useCallback(() => get<AdminGame[]>(`/api/admin/pools/${pool.id}/games`).then(setGames).catch((e) => setError(e.message)), [pool.id]);
  useEffect(() => { load(); }, [load]);

  const owners = useMemo(() => {
    const map = new Map<number, string>();
    games?.forEach((g) => map.set(g.userId, g.ownerNickname));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [games]);

  const filtered = useMemo(() => {
    const nums = (search.match(/\d+/g) ?? []).map(Number);
    const term = search.trim().toUpperCase();
    return (games ?? []).filter((g) =>
      (showDeleted || g.status === 'active')
      && (!owner || g.userId === Number(owner))
      && (!term || (/[A-Z]/.test(term) ? g.code.includes(term) : nums.every((n) => g.numbers.includes(n)))));
  }, [games, owner, search, showDeleted]);

  const done = async (msg: string) => {
    setEditing(null);
    setDeleting(null);
    setFlash(msg);
    await load();
    onChanged();
  };

  return (
    <section className="space-y-4">
      {flash && <Alert kind="success">{flash}</Alert>}
      {error && <Alert>{error}</Alert>}
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[10rem] flex-1">
          <label className="label" htmlFor="g-owner">Participante</label>
          <select id="g-owner" className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Todos</option>
            {owners.map(([id, nick]) => <option key={id} value={id}>{nick}</option>)}
          </select>
        </div>
        <div className="min-w-[10rem] flex-1">
          <label className="label" htmlFor="g-search">Dezenas ou código</label>
          <input id="g-search" className="input" placeholder="ex.: 7 23" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} /> Mostrar excluídos
        </label>
        <Link href={`/meus-jogos?bolao=${pool.id}`} className="btn btn-ghost">Cadastrar jogo meu</Link>
      </div>

      {!games ? <Spinner /> : filtered.length === 0 ? <EmptyState title="Nenhum jogo encontrado" /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr><th>Código</th><th>Dezenas</th><th>Dono</th>{pool.result && <th>Acertos</th>}<th>Atualizado</th><th className="text-right">Ações</th></tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr key={g.id} className={g.status === 'deleted' ? 'opacity-50' : g.tier ? 'bg-gold-100/60' : undefined}>
                  <td className="font-mono text-xs font-semibold">{g.code}</td>
                  <td><Balls numbers={g.numbers} result={pool.result} size="sm" /></td>
                  <td><div className="font-semibold">{g.ownerNickname}</div><div className="text-xs text-slate-500">{g.ownerName}</div></td>
                  {pool.result && <td><HitsBadge hits={g.hits} tier={g.tier} /></td>}
                  <td className="whitespace-nowrap text-xs text-slate-500">
                    {g.status === 'deleted' ? `Excluído ${formatDateTime(g.deletedAt!)}` : formatDateTime(g.updatedAt)}
                  </td>
                  <td>
                    {g.status === 'active' && (
                      <div className="flex justify-end gap-1.5">
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(g)}>Editar</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleting(g)}>Excluir</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 text-xs text-slate-500">{filtered.length} jogo(s)</div>
        </div>
      )}

      {editing && <EditGameModal game={editing} count={pool.numbersPerGame} onClose={() => setEditing(null)} onDone={() => done('Jogo atualizado.')} />}
      {deleting && <DeleteGameModal game={deleting} onClose={() => setDeleting(null)} onDone={() => done('Jogo excluído.')} />}
    </section>
  );
}

function EditGameModal({ game, count, onClose, onDone }: { game: AdminGame; count: number; onClose: () => void; onDone: () => void }) {
  const [numbers, setNumbers] = useState(game.numbers);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await put(`/api/admin/games/${game.id}`, { numbers, reason });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title={`Editar jogo ${game.code} (${game.ownerNickname})`} onClose={onClose}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <NumberPicker value={numbers} onChange={setNumbers} count={count} />
        <div>
          <label className="label" htmlFor="eg-reason">Motivo (opcional, fica no histórico)</label>
          <input id="eg-reason" className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button className="btn btn-primary w-full" disabled={numbers.length !== count || busy} onClick={save}>Salvar</button>
      </div>
    </Modal>
  );
}

function DeleteGameModal({ game, onClose, onDone }: { game: AdminGame; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await del(`/api/admin/games/${game.id}`, { reason });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title={`Excluir jogo ${game.code}`} onClose={onClose}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm">Jogo de <b>{game.ownerNickname}</b>:</p>
        <Balls numbers={game.numbers} />
        <p className="text-sm text-slate-500">A combinação ficará livre neste bolão. O registro continua no histórico.</p>
        <div>
          <label className="label" htmlFor="dg-reason">Motivo (opcional)</label>
          <input id="dg-reason" className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-danger flex-1" disabled={busy} onClick={confirm}>Excluir jogo</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Resultado ----------------

function ResultTab({ pool, onChanged }: { pool: AdminPool; onChanged: () => void }) {
  const [numbers, setNumbers] = useState<number[]>(pool.result ?? []);
  const [winners, setWinners] = useState<AdminGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  useEffect(() => {
    if (!pool.result) return setWinners(null);
    get<AdminGame[]>(`/api/admin/pools/${pool.id}/games`)
      .then((gs) => setWinners(gs.filter((g) => g.status === 'active' && g.tier).sort((a, b) => (b.hits ?? 0) - (a.hits ?? 0))))
      .catch((e) => setError(e.message));
  }, [pool.id, pool.result]);

  const save = async (value: number[] | null) => {
    setError(null);
    try {
      await put(`/api/admin/pools/${pool.id}/result`, value ? { numbers: value } : {});
      setFlash(value ? 'Resultado salvo e jogos conferidos.' : 'Resultado removido.');
      if (!value) setNumbers([]);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <section className="card h-fit space-y-4 p-5">
        <div>
          <h2 className="font-bold text-brand-900">{pool.result ? 'Corrigir resultado' : 'Cadastrar resultado'}</h2>
          <p className="text-sm text-slate-500">Informe as 6 dezenas sorteadas conforme a fonte oficial da Caixa.</p>
        </div>
        {flash && <Alert kind="success">{flash}</Alert>}
        {error && <Alert>{error}</Alert>}
        <NumberPicker value={numbers} onChange={setNumbers} />
        <div className="flex gap-2">
          <button className="btn btn-gold flex-1" disabled={numbers.length !== NUMBERS_PER_GAME}
            onClick={() => window.confirm(`Confirmar resultado ${numbers.map(pad).join(' - ')}?`) && save(numbers)}>
            Salvar resultado
          </button>
          {pool.result && (
            <button className="btn btn-danger" onClick={() => window.confirm('Remover o resultado cadastrado?') && save(null)}>Remover</button>
          )}
        </div>
        {pool.status === 'open' && (
          <Alert kind="info">Com o resultado cadastrado, os participantes não conseguem mais alterar jogos. Considere também encerrar o bolão.</Alert>
        )}
      </section>

      <section className="space-y-4">
        {!pool.result ? <EmptyState title="Resultado ainda não cadastrado" /> : (
          <>
            <div className="card p-5">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                Dezenas sorteadas {pool.resultRegisteredAt && `· cadastrado em ${formatDateTime(pool.resultRegisteredAt)}`}
              </div>
              <div className="flex flex-wrap gap-2">{pool.result.map((n) => <Ball key={n} n={n} variant="result" size="lg" />)}</div>
            </div>
            <div className="card p-5">
              <h3 className="mb-3 font-bold text-brand-900">Jogos premiados</h3>
              {!winners ? <Spinner /> : winners.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum jogo fez quadra, quina ou sena.</p>
              ) : (
                <ul className="space-y-3">
                  {winners.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center gap-3">
                      <HitsBadge hits={g.hits} tier={g.tier} />
                      <span className="font-mono text-xs">{g.code}</span>
                      <Balls numbers={g.numbers} result={pool.result} size="sm" />
                      <span className="text-sm font-semibold">{g.ownerNickname}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ---------------- Histórico ----------------

const ACTION_LABEL: Record<string, string> = {
  'pool.created': 'Bolão criado',
  'pool.updated': 'Bolão editado',
  'pool.status': 'Situação alterada',
  'pool.result_set': 'Resultado cadastrado',
  'pool.result_cleared': 'Resultado removido',
  'member.added': 'Participante adicionado',
  'member.removed': 'Participante removido',
  'payment.paid': 'Marcado como pago',
  'payment.pending': 'Marcado como pendente',
  'game.created': 'Jogo cadastrado',
  'game.updated': 'Jogo editado',
  'game.deleted': 'Jogo excluído',
  'game.updated_by_admin': 'Jogo editado pelo admin',
  'game.deleted_by_admin': 'Jogo excluído pelo admin',
  'invite.created': 'Convite gerado',
  'invite.revoked': 'Convite cancelado',
  'invite.used': 'Convite usado (cadastro)',
};

function describe(a: AuditItem): string {
  const nums = (v: any) => (Array.isArray(v?.numbers) ? v.numbers.map(pad).join('-') : '');
  switch (a.action) {
    case 'game.created': return `${a.after?.code} · ${nums(a.after)}`;
    case 'game.updated':
    case 'game.updated_by_admin': return `${a.before?.code} · ${nums(a.before)} → ${nums(a.after)}`;
    case 'game.deleted':
    case 'game.deleted_by_admin': return `${a.before?.code} · ${nums(a.before)}`;
    case 'pool.status': return `${POOL_STATUS_LABEL[a.before?.status as PoolStatus]} → ${POOL_STATUS_LABEL[a.after?.status as PoolStatus]}`;
    case 'pool.result_set': return (a.after?.result ?? []).map(pad).join('-');
    case 'payment.paid':
    case 'payment.pending': return `${formatCents(a.before?.paidCents ?? 0)} → ${formatCents(a.after?.paidCents ?? 0)}`;
    default: return '';
  }
}

function AuditTab({ poolId }: { poolId: number }) {
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [users, setUsers] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([get<AuditItem[]>(`/api/admin/pools/${poolId}/audit`), get<AdminUser[]>('/api/admin/users')])
      .then(([a, u]) => { setItems(a); setUsers(new Map(u.map((x) => [String(x.id), x.nickname]))); })
      .catch((e) => setError(e.message));
  }, [poolId]);

  if (error) return <Alert>{error}</Alert>;
  if (!items) return <Spinner />;
  if (items.length === 0) return <EmptyState title="Sem registros" />;
  return (
    <div className="card table-wrap">
      <table className="table">
        <thead><tr><th>Data</th><th>Quem</th><th>Ação</th><th>Detalhes</th><th>Motivo</th></tr></thead>
        <tbody>
          {items.map((a) => {
            const ownerId = a.entityType === 'user' ? a.entityId : a.before?.owner ?? a.after?.owner;
            const ownerNick = ownerId !== undefined ? users.get(String(ownerId)) : undefined;
            return (
              <tr key={a.id}>
                <td className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(a.createdAt)}</td>
                <td className="font-semibold">{a.actor ?? '—'}</td>
                <td>{ACTION_LABEL[a.action] ?? a.action}{ownerNick && <span className="text-slate-500"> ({ownerNick})</span>}</td>
                <td className="font-mono text-xs">{describe(a)}</td>
                <td className="text-xs">{a.reason ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

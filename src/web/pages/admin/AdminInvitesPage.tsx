import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { AdminPool, Invite } from '../../lib/api.ts';
import { del, get, post } from '../../lib/api.ts';
import { formatDateTime } from '../../lib/format.ts';
import { Alert, EmptyState, Spinner } from '../../components/ui.tsx';
import { AdminNav } from './AdminNav.tsx';

const STATUS: Record<Invite['status'], { label: string; cls: string }> = {
  pending: { label: 'Pendente', cls: 'bg-amber-100 text-amber-800' },
  used: { label: 'Usado', cls: 'bg-emerald-100 text-emerald-800' },
  expired: { label: 'Expirado', cls: 'bg-slate-100 text-slate-600' },
  revoked: { label: 'Cancelado', cls: 'bg-red-100 text-red-700' },
};

const inviteLink = (token: string) => `${location.origin}/convite#${token}`;

export function AdminInvitesPage() {
  const [pools, setPools] = useState<AdminPool[] | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ link: string; note: string | null; poolName: string } | null>(null);

  const load = useCallback(() => get<Invite[]>('/api/admin/invites').then(setInvites).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
    get<AdminPool[]>('/api/admin/pools').then(setPools).catch((e) => setError(e.message));
  }, [load]);

  const revoke = async (inv: Invite) => {
    if (!window.confirm(`Cancelar o convite${inv.note ? ` de ${inv.note}` : ''}? O link deixará de funcionar.`)) return;
    try {
      await del(`/api/admin/invites/${inv.id}`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <AdminNav active="invites" />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-900">Convites</h1>
        <p className="text-sm text-slate-500">
          Gere um link por pessoa. Ao abrir, ela escolhe nome, nick e senha, e já entra no bolão. Cada link funciona uma única vez.
        </p>
      </div>
      {error && <Alert>{error}</Alert>}

      {created && <CreatedInvite {...created} onClose={() => setCreated(null)} />}

      {!pools ? <Spinner /> : pools.length === 0 ? (
        <EmptyState title="Crie um bolão antes de gerar convites" />
      ) : (
        <CreateInviteForm pools={pools} onCreated={(c) => { setCreated(c); load(); }} />
      )}

      {!invites ? <Spinner /> : invites.length === 0 ? <EmptyState title="Nenhum convite gerado ainda" /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Para</th><th>Bolão</th><th>Situação</th><th>Validade</th><th className="text-right">Ações</th></tr></thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id} className={inv.status === 'pending' || inv.status === 'used' ? undefined : 'opacity-60'}>
                  <td className="font-semibold">{inv.note || <span className="font-normal text-slate-400">—</span>}</td>
                  <td className="text-sm">{inv.poolName}</td>
                  <td>
                    <span className={`badge ${STATUS[inv.status].cls}`}>{STATUS[inv.status].label}</span>
                    {inv.usedBy && <div className="mt-1 text-xs text-slate-600">{inv.usedBy.displayName} ({inv.usedBy.nickname})</div>}
                  </td>
                  <td className="whitespace-nowrap text-xs text-slate-500">
                    {inv.usedAt ? `Usado em ${formatDateTime(inv.usedAt)}` : `Até ${formatDateTime(inv.expiresAt)}`}
                  </td>
                  <td className="text-right">
                    {inv.status === 'pending' && <button className="btn btn-ghost btn-sm" onClick={() => revoke(inv)}>Cancelar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateInviteForm({ pools, onCreated }: { pools: AdminPool[]; onCreated: (c: { link: string; note: string | null; poolName: string }) => void }) {
  const [poolId, setPoolId] = useState(() => (pools.find((p) => p.status === 'open') ?? pools[0]).id);
  const [days, setDays] = useState(7);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ invite: Invite; token: string }>('/api/admin/invites', { poolId, days, note });
      onCreated({ link: inviteLink(r.token), note: r.invite.note, poolName: r.invite.poolName });
      setNote('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h2 className="font-bold text-brand-900">Novo convite</h2>
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[1.4fr_1.4fr_7rem_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="ni-note">Para quem (anotação sua)</label>
          <input id="ni-note" className="input" maxLength={80} placeholder="ex.: João do financeiro" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="ni-pool">Bolão</label>
          <select id="ni-pool" className="input" value={poolId} onChange={(e) => setPoolId(Number(e.target.value))}>
            {pools.map((p) => <option key={p.id} value={p.id}>{p.name} — Concurso {p.contestNumber}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ni-days">Validade (dias)</label>
          <input id="ni-days" type="number" className="input" min={1} max={60} required value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </div>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Gerando…' : 'Gerar convite'}</button>
      </div>
    </form>
  );
}

function CreatedInvite({ link, note, poolName, onClose }: { link: string; note: string | null; poolName: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const message = `Você foi convidado para o bolão "${poolName}"! Crie sua conta por este link (vale uma vez): ${link}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      window.prompt('Copie o link:', link);
    }
  };
  return (
    <div className="card border-gold-300 bg-gold-100 p-4">
      <div className="text-sm">
        Convite{note ? <> para <b>{note}</b></> : ''} gerado. Envie o link agora: <b>ele não será exibido de novo</b>
        {' '}(se perder, cancele e gere outro).
      </div>
      <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 font-mono text-sm">{link}</code>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn btn-primary btn-sm" onClick={copy}>{copied ? 'Copiado!' : 'Copiar link'}</button>
        <a className="btn btn-ghost btn-sm" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
          Enviar pelo WhatsApp
        </a>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}

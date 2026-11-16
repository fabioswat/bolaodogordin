import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { AdminUser } from '../../lib/api.ts';
import { del, get, post, put } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { Alert, EmptyState, Modal, Spinner } from '../../components/ui.tsx';
import { AdminNav } from './AdminNav.tsx';

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ nickname: string; password: string } | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => get<AdminUser[]>('/api/admin/users').then(setUsers).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const resetPassword = async (u: AdminUser) => {
    if (!window.confirm(`Gerar nova senha provisória para ${u.nickname}? A senha atual deixará de funcionar.`)) return;
    try {
      const r = await post<{ tempPassword: string }>(`/api/admin/users/${u.id}/reset-password`);
      setSecret({ nickname: u.nickname, password: r.tempPassword });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (u: AdminUser) => {
    const jogos = u.activeGames === 1 ? '1 jogo' : `${u.activeGames} jogos`;
    const msg = [
      `Excluir ${u.displayName} (${u.nickname})?`,
      '',
      u.activeGames ? `Os ${jogos} dele(a) serão excluídos e as combinações ficarão livres.` : null,
      'A pessoa perde o acesso, sai dos bolões e o nick fica livre para um novo cadastro.',
      'Não dá para desfazer.',
    ].filter((l) => l !== null).join('\n');
    if (!window.confirm(msg)) return;
    setError(null);
    try {
      const r = await del<{ gamesDeleted: number }>(`/api/admin/users/${u.id}`);
      setFlash(`${u.displayName} foi excluído(a)${r.gamesDeleted ? ` com ${r.gamesDeleted} jogo(s)` : ''}. O nick "${u.nickname}" está livre.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleActive = async (u: AdminUser) => {
    try {
      await put(`/api/admin/users/${u.id}`, { displayName: u.displayName, role: u.role, isActive: !u.isActive });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <AdminNav active="users" />
      <h1 className="text-2xl font-extrabold tracking-tight text-brand-900">Usuários</h1>
      {error && <Alert>{error}</Alert>}
      {flash && <Alert kind="success">{flash}</Alert>}
      {secret && (
        <div className="card border-gold-300 bg-gold-100 p-4">
          <div className="text-sm">Senha provisória de <b>{secret.nickname}</b> (anote e entregue pessoalmente; ela não será exibida de novo):</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-white px-3 py-1.5 font-mono text-lg font-bold tracking-wider">{secret.password}</code>
            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(secret.password)}>Copiar</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSecret(null)}>Fechar</button>
          </div>
        </div>
      )}

      <CreateUserForm onCreated={(nickname, password) => { setSecret({ nickname, password }); load(); }} />

      {!users ? <Spinner /> : users.filter((u) => !u.deleted).length === 0 ? <EmptyState title="Nenhum usuário" /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Nick</th><th>Nome</th><th>Papel</th><th>Situação</th><th className="text-right">Ações</th></tr></thead>
            <tbody>
              {users.filter((u) => !u.deleted).map((u) => (
                <tr key={u.id} className={u.isActive ? undefined : 'opacity-60'}>
                  <td className="font-semibold">{u.nickname}</td>
                  <td>{u.displayName}</td>
                  <td>{u.role === 'admin' ? <span className="badge bg-brand-700 text-white">Admin</span> : 'Participante'}</td>
                  <td className="text-xs">
                    {u.isActive ? 'Ativo' : <span className="text-red-700">Desativado</span>}
                    {u.mustChangePassword && <div className="text-amber-700">Senha provisória</div>}
                  </td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(u)}>Editar</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => resetPassword(u)}>Redefinir senha</button>
                      {u.id !== me?.id && (
                        <button className={`btn btn-sm ${u.isActive ? 'btn-ghost' : 'btn-primary'}`} onClick={() => toggleActive(u)}>
                          {u.isActive ? 'Desativar' : 'Reativar'}
                        </button>
                      )}
                      {u.id !== me?.id && (
                        <button className="btn btn-danger btn-sm" onClick={() => remove(u)}>Excluir</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <EditUserModal user={editing} isSelf={editing.id === me?.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function CreateUserForm({ onCreated }: { onCreated: (nickname: string, password: string) => void }) {
  const [nickname, setNickname] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'participant' | 'admin'>('participant');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ user: AdminUser; tempPassword: string }>('/api/admin/users', { nickname, displayName, role });
      onCreated(r.user.nickname, r.tempPassword);
      setNickname('');
      setDisplayName('');
      setRole('participant');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h2 className="font-bold text-brand-900">Novo usuário</h2>
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="nu-nick">Nick (login)</label>
          <input id="nu-nick" className="input" required minLength={3} maxLength={30} autoCapitalize="none" placeholder="ex.: joao.silva"
            value={nickname} onChange={(e) => setNickname(e.target.value.toLowerCase())} />
        </div>
        <div>
          <label className="label" htmlFor="nu-name">Nome (visível aos participantes)</label>
          <input id="nu-name" className="input" required maxLength={80} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="nu-role">Papel</label>
          <select id="nu-role" className="input" value={role} onChange={(e) => setRole(e.target.value as 'participant' | 'admin')}>
            <option value="participant">Participante</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <button className="btn btn-primary" disabled={busy}>Criar</button>
      </div>
      <p className="text-xs text-slate-500">Nick: 3 a 30 caracteres (letras minúsculas, números, ponto, hífen ou sublinhado). Uma senha provisória será gerada.</p>
    </form>
  );
}

function EditUserModal({ user, isSelf, onClose, onSaved }: { user: AdminUser; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState(user.role);
  const [error, setError] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await put(`/api/admin/users/${user.id}`, { displayName, role, isActive: user.isActive });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Modal title={`Editar ${user.nickname}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div>
          <label className="label" htmlFor="eu-name">Nome</label>
          <input id="eu-name" className="input" required maxLength={80} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="eu-role">Papel</label>
          <select id="eu-role" className="input" value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as AdminUser['role'])}>
            <option value="participant">Participante</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <button className="btn btn-primary w-full">Salvar</button>
      </form>
    </Modal>
  );
}

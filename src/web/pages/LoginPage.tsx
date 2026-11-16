import { useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from '../lib/api.ts';
import { post } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { navigate, useLocation } from '../lib/router.tsx';
import { Alert } from '../components/ui.tsx';

function safeReturn(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/meus-jogos';
}

export function LoginPage() {
  const { setUser } = useAuth();
  const { query } = useLocation();
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ user: User }>('/api/auth/login', { nickname, password });
      setUser(r.user);
      navigate(r.user.mustChangePassword ? '/trocar-senha' : safeReturn(query.get('voltar')), true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm pt-6">
      <form onSubmit={submit} className="card space-y-4 p-6">
        <div>
          <h1 className="text-xl font-bold text-brand-900">Entrar</h1>
          <p className="text-sm text-slate-500">Use seu nick e sua senha.</p>
        </div>
        {error && <Alert>{error}</Alert>}
        <div>
          <label className="label" htmlFor="nick">Nick</label>
          <input id="nick" className="input" autoComplete="username" autoCapitalize="none" required
            value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="pass">Senha</label>
          <input id="pass" type="password" className="input" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <p className="text-center text-xs text-slate-500">Esqueceu a senha? Peça ao administrador para redefini-la.</p>
      </form>
    </div>
  );
}

export function ChangePasswordPage() {
  const { user, setUser } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null; // as rotas já redirecionam para o login

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setError('A confirmação não confere com a nova senha.');
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ user: User }>('/api/auth/change-password', { currentPassword: current, newPassword: next });
      setUser(r.user);
      navigate('/meus-jogos', true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm pt-6">
      <form onSubmit={submit} className="card space-y-4 p-6">
        <div>
          <h1 className="text-xl font-bold text-brand-900">Trocar senha</h1>
          {user.mustChangePassword && (
            <p className="text-sm text-slate-500">Para sua segurança, troque a senha provisória antes de continuar.</p>
          )}
        </div>
        {error && <Alert>{error}</Alert>}
        <div>
          <label className="label" htmlFor="cur">Senha atual</label>
          <input id="cur" type="password" className="input" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="new">Nova senha (mínimo 8 caracteres)</label>
          <input id="new" type="password" className="input" autoComplete="new-password" minLength={8} required value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="conf">Confirme a nova senha</label>
          <input id="conf" type="password" className="input" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
        {!user.mustChangePassword && (
          <button type="button" className="btn btn-ghost w-full" onClick={() => history.back()}>Cancelar</button>
        )}
      </form>
    </div>
  );
}

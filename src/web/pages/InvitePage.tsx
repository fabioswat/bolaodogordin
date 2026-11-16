import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { InviteInfo, User } from '../lib/api.ts';
import { post } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { formatDate, formatDateTime } from '../lib/format.ts';
import { Link, navigate } from '../lib/router.tsx';
import { Alert, Spinner } from '../components/ui.tsx';

/** Cadastro pelo link de convite: /convite#TOKEN (o token fica no fragmento e não vai para os logs). */
export function InvitePage() {
  const { user, setUser, logout } = useAuth();
  const [token] = useState(() => decodeURIComponent(location.hash.replace(/^#/, '')).trim());
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [nickname, setNickname] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setLoadError('Link de convite incompleto. Confira se o link foi copiado inteiro.'); return; }
    post<InviteInfo>('/api/invites/check', { token }).then(setInfo).catch((e) => setLoadError(e.message));
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError('A confirmação não confere com a senha.');
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ user: User }>('/api/invites/accept', { token, nickname, displayName, password });
      setUser(r.user);
      history.replaceState(null, '', '/convite'); // tira o token da barra de endereço
      navigate('/meus-jogos', true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-sm space-y-4 pt-6">
        <Alert>{loadError}</Alert>
        <Link href="/entrar" className="btn btn-primary w-full">Ir para o login</Link>
      </div>
    );
  }
  if (!info) return <Spinner />;

  if (user) {
    return (
      <div className="card mx-auto max-w-sm space-y-4 p-6">
        <h1 className="text-xl font-bold text-brand-900">Convite para {info.poolName}</h1>
        <p className="text-sm text-slate-600">
          Você está conectado como <b>{user.displayName}</b> ({user.nickname}). Este convite serve para criar uma conta nova.
          Para usá-lo, saia primeiro e abra o link de novo.
        </p>
        <button className="btn btn-primary w-full" onClick={async () => { const link = `/convite#${token}`; await logout(); navigate(link, true); }}>
          Sair e usar o convite
        </button>
        <Link href="/meus-jogos" className="btn btn-ghost w-full">Continuar como {user.nickname}</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm pt-6">
      <form onSubmit={submit} className="card space-y-4 p-6">
        <div>
          <h1 className="text-xl font-bold text-brand-900">Você foi convidado!</h1>
          <p className="text-sm text-slate-600">
            Crie sua conta para participar do <b>{info.poolName}</b> (concurso {info.contestNumber}, sorteio em {formatDate(info.drawDate)}).
          </p>
          <p className="mt-1 text-xs text-slate-500">Convite válido até {formatDateTime(info.expiresAt)}. Só pode ser usado uma vez.</p>
        </div>
        {error && <Alert>{error}</Alert>}
        <div>
          <label className="label" htmlFor="iv-name">Seu nome</label>
          <input id="iv-name" className="input" required minLength={2} maxLength={40} autoComplete="nickname" placeholder="ex.: João Silva"
            value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">Aparece nos seus jogos para os outros participantes do bolão.</p>
        </div>
        <div>
          <label className="label" htmlFor="iv-nick">Nick (para entrar)</label>
          <input id="iv-nick" className="input" required minLength={3} maxLength={30} autoComplete="username" autoCapitalize="none" placeholder="ex.: joao.silva"
            value={nickname} onChange={(e) => setNickname(e.target.value.toLowerCase().replace(/\s/g, ''))} />
          <p className="mt-1 text-xs text-slate-500">3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.</p>
        </div>
        <div>
          <label className="label" htmlFor="iv-pass">Senha (mínimo 8 caracteres)</label>
          <input id="iv-pass" type="password" className="input" required minLength={8} autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="iv-conf">Confirme a senha</label>
          <input id="iv-conf" type="password" className="input" required minLength={8} autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Criando conta…' : 'Criar conta e entrar'}</button>
        <p className="text-center text-xs text-slate-500">Já tem conta? <Link href="/entrar" className="font-semibold text-brand-700 underline">Entrar</Link></p>
      </form>
    </div>
  );
}

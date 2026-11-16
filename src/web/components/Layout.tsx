import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth.tsx';
import { Link, navigate, useLocation } from '../lib/router.tsx';
import { useTheme } from '../lib/theme.ts';

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const { path } = useLocation();
  const active = href === '/' ? path === '/' || path.startsWith('/bolao/') : path.startsWith(href);
  return (
    <Link href={href}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${active ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
      {children}
    </Link>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/** Botão sol/lua: alterna entre tema claro e escuro (a escolha fica salva no navegador). */
function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const dark = theme === 'dark';
  const label = dark ? 'Usar tema claro' : 'Usar tema escuro';
  return (
    <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} title={label} aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/25 text-white transition hover:bg-white/10">
      {dark ? (
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

/** Menu da conta (engrenagem): nome, trocar senha e sair. */
function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { path } = useLocation();

  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!user) return null;
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-white/25 px-2.5 py-1.5 text-sm font-semibold text-white transition hover:bg-white/10">
        <span className="max-w-[9rem] truncate">{user.displayName}</span>
        <GearIcon />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-700 shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="truncate font-semibold text-brand-900">{user.displayName}</div>
            <div className="truncate text-xs text-slate-500">Login: {user.nickname}</div>
          </div>
          <button type="button" role="menuitem" className="block w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50"
            onClick={() => navigate('/trocar-senha')}>Trocar senha</button>
          <button type="button" role="menuitem" className="block w-full border-t border-slate-100 px-4 py-2.5 text-left text-sm text-red-700 hover:bg-red-50"
            onClick={logout}>Sair</button>
        </div>
      )}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 bg-brand-800 text-white shadow" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-400 text-sm text-brand-900">06</span>
            <span>Bolão do Gordin</span>
          </Link>
          <nav className="order-3 -mx-2 flex w-full flex-wrap items-center gap-1 sm:order-none sm:mx-0 sm:w-auto sm:flex-1">
            <NavLink href="/">Jogos</NavLink>
            {user && <NavLink href="/meus-jogos">Meus jogos</NavLink>}
            {user?.role === 'admin' && <NavLink href="/admin">Administração</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm sm:ml-0">
            <ThemeToggle />
            {user ? (
              <AccountMenu />
            ) : (
              <Link href="/entrar" className="btn btn-gold btn-sm">Entrar</Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-slate-200 px-4 py-5 text-center text-xs text-slate-500" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}>
        Registro interno do bolão. Não substitui o comprovante oficial da aposta nem garante premiação.
      </footer>
    </div>
  );
}

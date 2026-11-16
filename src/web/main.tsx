import './lib/theme.ts'; // aplica o tema antes de desenhar a tela
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { AuthProvider, useAuth } from './lib/auth.tsx';
import { Link, match, navigate, useLocation } from './lib/router.tsx';
import { Layout } from './components/Layout.tsx';
import { EmptyState, Spinner } from './components/ui.tsx';
import { PublicPage } from './pages/PublicPage.tsx';
import { ChangePasswordPage, LoginPage } from './pages/LoginPage.tsx';
import { MyGamesPage } from './pages/MyGamesPage.tsx';
import { AdminPoolsPage } from './pages/admin/AdminPoolsPage.tsx';
import { AdminPoolPage } from './pages/admin/AdminPoolPage.tsx';
import { AdminUsersPage } from './pages/admin/AdminUsersPage.tsx';
import { AdminInvitesPage } from './pages/admin/AdminInvitesPage.tsx';
import { InvitePage } from './pages/InvitePage.tsx';

function Redirect({ to }: { to: string }) {
  queueMicrotask(() => navigate(to, true));
  return null;
}

function Routes() {
  const { path } = useLocation();
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;

  if (path === '/') return <PublicPage />;
  const pub = match('/bolao/:id', path);
  if (pub) return <PublicPage key={pub.id} poolId={Number(pub.id)} />;
  if (path === '/convite') return <InvitePage />;
  if (path === '/entrar') return user && !user.mustChangePassword ? <Redirect to="/meus-jogos" /> : <LoginPage />;

  // Rotas que exigem login
  if (!user) return <Redirect to={`/entrar?voltar=${encodeURIComponent(path + location.search)}`} />;
  if (path === '/trocar-senha') return <ChangePasswordPage />;
  if (user.mustChangePassword) return <Redirect to="/trocar-senha" />;
  if (path === '/meus-jogos') return <MyGamesPage />;

  if (path.startsWith('/admin')) {
    if (user.role !== 'admin') return <EmptyState title="Área restrita ao administrador" />;
    if (path === '/admin') return <AdminPoolsPage />;
    if (path === '/admin/usuarios') return <AdminUsersPage />;
    if (path === '/admin/convites') return <AdminInvitesPage />;
    const adminPool = match('/admin/bolao/:id', path);
    if (adminPool) return <AdminPoolPage key={adminPool.id} poolId={Number(adminPool.id)} />;
  }

  return (
    <EmptyState title="Página não encontrada">
      <Link href="/" className="font-semibold text-brand-700 underline">Voltar ao início</Link>
    </EmptyState>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Layout>
        <Routes />
      </Layout>
    </AuthProvider>
  </StrictMode>,
);

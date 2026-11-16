import { Link } from '../../lib/router.tsx';

export function AdminNav({ active }: { active: 'pools' | 'users' | 'invites' }) {
  return (
    <nav className="flex gap-1 border-b border-slate-200">
      <Link href="/admin" className={`tab ${active === 'pools' ? 'tab-active' : ''}`}>Bolões</Link>
      <Link href="/admin/usuarios" className={`tab ${active === 'users' ? 'tab-active' : ''}`}>Usuários</Link>
      <Link href="/admin/convites" className={`tab ${active === 'invites' ? 'tab-active' : ''}`}>Convites</Link>
    </nav>
  );
}

import { NavLink, useNavigate } from 'react-router-dom'
import { useStore }             from '@/store/useStore'
import { logout }               from '@/lib/auth'
import { toast }                from '@/components/ui/Toast'
import type { UserRole }        from '@/types'
import s                        from './GlobalSidebar.module.css'

// ── Role helpers ──────────────────────────────────────
const ROLE_LEVEL: Record<UserRole, number> = {
  visualizador: 1, operador: 2, supervisor: 3, admin: 4,
}

function hasRole(role: UserRole | undefined, min: UserRole): boolean {
  if (!role) return false
  return ROLE_LEVEL[role] >= ROLE_LEVEL[min]
}

// ── SVG icon set (Heroicons-style, MIT) ───────────────
const Ic = {
  Home: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9,22 9,12 15,12 15,22"/>
    </svg>
  ),
  Chart: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  Clipboard: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    </svg>
  ),
  Cart: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
  ),
  Tag: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  ),
  Wrench: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  Package: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27,6.96 12,12.01 20.73,6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  ),
  Building: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  ),
  Truck: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13"/>
      <polygon points="16,8 20,8 23,11 23,16 16,16 16,8"/>
      <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  ),
  Sparkles: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
    </svg>
  ),
  Users: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  Shield: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  Hammer: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 12l-8.5 8.5a2.12 2.12 0 0 1-3-3L12 9"/>
      <path d="M17.64 15L22 10.64"/>
      <path d="M20.91 11.7l-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91"/>
    </svg>
  ),
  HardHat: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/>
      <path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3"/>
    </svg>
  ),
  Cog: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  Power: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
      <line x1="12" y1="2" x2="12" y2="12"/>
    </svg>
  ),
}

// ── Nav types ─────────────────────────────────────────
interface NavItem  { to: string; icon: React.ReactNode; label: string; end?: boolean }
interface NavGroup { label?: string; minRole?: UserRole; items: NavItem[] }

function getNavGroups(role: UserRole | undefined): NavGroup[] {
  const groups: NavGroup[] = [
    {
      items: [
        { to: '/', icon: <Ic.Home />, label: 'Home', end: true },
        ...(hasRole(role, 'admin')
          ? [{ to: '/dashboard', icon: <Ic.Chart />, label: 'Dashboard' }]
          : []
        ),
      ],
    },
    {
      label: 'Operações',
      minRole: 'operador',
      items: [
        { to: '/os',      icon: <Ic.Clipboard />, label: 'Ordens de Serviço' },
        { to: '/compras', icon: <Ic.Cart />,      label: 'Compras'           },
      ],
    },
    {
      label: 'Patrimônio',
      minRole: 'operador',
      items: [
        { to: '/ativos',              icon: <Ic.Tag />,      label: 'Ativos',       end: true },
        { to: '/ativos/manutencao',   icon: <Ic.Wrench />,   label: 'Manutenções'             },
        { to: '/ativos/inventario',   icon: <Ic.Package />,  label: 'Inventário'              },
        { to: '/ativos/fornecedores', icon: <Ic.Building />, label: 'Fornecedores'            },
      ],
    },
    {
      label: 'Facilities',
      items: [
        { to: '/frota',   icon: <Ic.Truck />,    label: 'Frota'      },
        { to: '/limpeza', icon: <Ic.Sparkles />, label: 'Limpeza 5S' },
      ],
    },
    {
      label: 'Pessoas',
      minRole: 'supervisor',
      items: [
        { to: '/colaboradores', icon: <Ic.Users />,  label: 'Colaboradores', end: true },
        { to: '/seguranca',     icon: <Ic.Shield />, label: 'Segurança',     end: true },
      ],
    },
    {
      label: 'Obras',
      minRole: 'supervisor',
      items: [
        { to: '/obras',        icon: <Ic.Hammer />,  label: 'Obras & Contratos', end: true },
        { to: '/empreiteiras', icon: <Ic.HardHat />, label: 'Empreiteiras'                 },
      ],
    },
  ]

  return groups.filter(g => !g.minRole || hasRole(role, g.minRole))
}

// ── Component ─────────────────────────────────────────
interface Props { mobileOpen: boolean; onMobileClose: () => void }

export default function GlobalSidebar({ mobileOpen, onMobileClose }: Props) {
  const user     = useStore(st => st.user)
  const navigate = useNavigate()

  const firstName = user?.nome?.split(' ')[0] ?? '—'
  const initial   = firstName[0]?.toUpperCase() ?? '?'
  const groups    = getNavGroups(user?.role)

  async function handleLogout() {
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch {
      toast.error('Erro ao sair. Tente novamente.')
    }
  }

  return (
    <aside
      className={`${s.sidebar} ${mobileOpen ? s.mobileOpen : ''}`}
      aria-label="Menu principal"
    >
      {/* ── Logo ── */}
      <div className={s.header}>
        <NavLink to="/" className={s.logo} onClick={onMobileClose}>
          <div className={s.logoMark}>PR</div>
          <div className={s.logoText}>
            <span className={s.logoName}>PRO RAÇA</span>
            <span className={s.logoSub}>Rações · Gestão Industrial</span>
          </div>
        </NavLink>
        <button className={s.mobileCloseBtn} onClick={onMobileClose} aria-label="Fechar menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      {/* ── Main nav ── */}
      <nav className={s.nav}>
        {groups.map((group, gi) => (
          <div key={gi} className={s.navGroup}>
            {group.label && (
              <div className={s.groupLabel} aria-hidden="true">{group.label}</div>
            )}
            {gi > 0 && !group.label && <div className={s.groupDivider} />}

            {group.items.map(({ to, icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `${s.item} ${isActive ? s.active : ''}`}
                data-tip={label}
                onClick={onMobileClose}
              >
                <span className={s.icon}>{icon}</span>
                <span className={s.label}>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* ── Bottom nav ── */}
      <div className={s.bottomNav}>
        <div className={s.groupDivider} />
        {hasRole(user?.role, 'admin') && (
          <NavLink
            to="/admin"
            className={({ isActive }) => `${s.item} ${s.itemSm} ${isActive ? s.active : ''}`}
            data-tip="Administração"
            onClick={onMobileClose}
          >
            <span className={s.icon}><Ic.Cog /></span>
            <span className={s.label}>Administração</span>
          </NavLink>
        )}
      </div>

      {/* ── User footer ── */}
      <div className={s.footer}>
        <div className={s.userRow}>
          <div className={s.avatar}>{initial}</div>
          <div className={s.userMeta}>
            <span className={s.userName}>{user?.nome ?? 'Carregando…'}</span>
            <span className={s.userRole}>{user?.role ?? '—'}</span>
          </div>
          <button
            className={s.logoutBtn}
            onClick={handleLogout}
            aria-label="Sair do sistema"
            title="Sair"
          >
            <Ic.Power />
          </button>
        </div>
      </div>
    </aside>
  )
}

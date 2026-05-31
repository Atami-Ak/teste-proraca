import { useMemo, type CSSProperties } from 'react'
import { Link }         from 'react-router-dom'
import { useStore }     from '@/store/useStore'
import { useAssets, useCategories, useMaintenance } from '@/hooks/useData'
import { MAINT_STATUS_META, MAINT_TYPE_META }        from '@/types'
import { fmtDate }      from '@/lib/db'
import s from './HomePage.module.css'

// ── SVG icon set ──────────────────────────────────────
const Ic = {
  Tag: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  ),
  Wrench: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  Clipboard: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    </svg>
  ),
  Building: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  ),
  Building2: ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
      <path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
    </svg>
  ),
  FileText: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  Cart: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
  ),
  Sparkles: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
    </svg>
  ),
  User: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  Users: ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  Shield: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  Hammer: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 12l-8.5 8.5a2.12 2.12 0 0 1-3-3L12 9"/>
      <path d="M17.64 15L22 10.64"/>
      <path d="M20.91 11.7l-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91"/>
    </svg>
  ),
  HardHat: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/>
      <path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3"/>
    </svg>
  ),
  Chart: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  CheckCircle: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22,4 12,14.01 9,11.01"/>
    </svg>
  ),
  Folder: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  Lock: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  AlertCircle: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  Clock: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12,6 12,12 16,14"/>
    </svg>
  ),
  RefreshCw: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23,4 23,10 17,10"/>
      <polyline points="1,20 1,14 7,14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  ),
  Trophy: ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 13 8 19"/><polyline points="16 13 16 19"/>
      <line x1="5" y1="19" x2="19" y2="19"/>
      <path d="M17 3H7v7a5 5 0 0 0 10 0V3z"/>
      <path d="M7 6H4a1 1 0 0 0-1 1v2a4 4 0 0 0 4 4"/>
      <path d="M17 6h3a1 1 0 0 1 1 1v2a4 4 0 0 1-4 4"/>
    </svg>
  ),
  Cog: ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
}

// ── Module definitions ────────────────────────────────

interface ModuleDef {
  icon:   React.ReactNode
  title:  string
  sub:    string
  to:     string
  accent: string
}

interface ModuleGroup {
  group:   string
  icon:    React.ReactNode
  modules: ModuleDef[]
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    group: 'Patrimônio & Manutenção',
    icon:  <Ic.Building2 />,
    modules: [
      { icon: <Ic.Tag />,       title: 'Ativos',       sub: 'Patrimônio & Inventário', to: '/ativos',              accent: '#166534' },
      { icon: <Ic.Wrench />,    title: 'Manutenções',  sub: 'Preventiva & Corretiva',  to: '/ativos/manutencao',   accent: '#16A34A' },
      { icon: <Ic.Clipboard />, title: 'Inventário',   sub: 'Auditoria de Ativos',     to: '/ativos/inventario',   accent: '#EA580C' },
      { icon: <Ic.Building />,  title: 'Fornecedores', sub: 'Gestão de Fornecedores',  to: '/ativos/fornecedores', accent: '#F97316' },
    ],
  },
  {
    group: 'Operações',
    icon:  <Ic.Cog />,
    modules: [
      { icon: <Ic.FileText />, title: 'Ordens de Serviço', sub: 'Central de O.S.',   to: '/os',      accent: '#166534' },
      { icon: <Ic.Cart />,     title: 'Compras',           sub: 'Pedidos de Compra', to: '/compras', accent: '#EA580C' },
    ],
  },
  {
    group: 'Facilities',
    icon:  <Ic.Sparkles size={18} />,
    modules: [
      { icon: <Ic.Sparkles />, title: 'Limpeza 5S', sub: 'Inspeções & Rankings 5S', to: '/limpeza', accent: '#16A34A' },
    ],
  },
  {
    group: 'Pessoas & Segurança',
    icon:  <Ic.Users />,
    modules: [
      { icon: <Ic.User />,   title: 'Colaboradores',         sub: 'RH, Avaliações & Perfis',    to: '/colaboradores', accent: '#166534' },
      { icon: <Ic.Shield />, title: 'Segurança do Trabalho', sub: 'DDS, EPI, PT & Ocorrências', to: '/seguranca',     accent: '#DC2626' },
    ],
  },
  {
    group: 'Obras & Contratos',
    icon:  <Ic.Hammer size={18} />,
    modules: [
      { icon: <Ic.Hammer />,  title: 'Obras & Contratos', sub: 'Gestão de Projetos',   to: '/obras',        accent: '#F97316' },
      { icon: <Ic.HardHat />, title: 'Empreiteiras',      sub: 'Scoring & Avaliações', to: '/empreiteiras', accent: '#EA580C' },
    ],
  },
  {
    group: 'Analytics & Gestão',
    icon:  <Ic.Chart size={18} />,
    modules: [
      { icon: <Ic.Chart />,       title: 'Dashboard',  sub: 'Visão Executiva Geral',  to: '/dashboard',            accent: '#166534' },
      { icon: <Ic.CheckCircle />, title: 'Aprovações', sub: 'Centro de Aprovações',   to: '/dashboard/aprovacoes', accent: '#16A34A' },
      { icon: <Ic.Folder />,      title: 'Documentos', sub: 'Repositório Central',    to: '/dashboard/documentos', accent: '#475569' },
      { icon: <Ic.Lock />,        title: 'Acesso IAM', sub: 'Controle de Usuários',   to: '/dashboard/acesso',     accent: '#7C3AED' },
    ],
  },
]

// ── Stat card ─────────────────────────────────────────

interface StatProps {
  icon:   React.ReactNode
  value:  number | string
  label:  string
  accent: string
  to?:    string
}

function StatCard({ icon, value, label, accent, to }: StatProps) {
  const inner = (
    <div className={s.statCard} style={{ '--accent': accent } as CSSProperties}>
      <div className={s.statLeft}>
        <div className={s.statIconWrap} style={{ background: `${accent}18`, color: accent }}>
          {icon}
        </div>
        <div>
          <div className={s.statValue}>{value}</div>
          <div className={s.statLabel}>{label}</div>
        </div>
      </div>
      <div className={s.statAccentBar} style={{ background: accent }} />
    </div>
  )
  return to ? <Link to={to} className={s.statLink}>{inner}</Link> : inner
}

// ── Module card ───────────────────────────────────────

function ModuleCard({ mod }: { mod: ModuleDef }) {
  return (
    <Link to={mod.to} className={s.moduleLink}>
      <div className={s.moduleCard} style={{ '--accent': mod.accent } as CSSProperties}>
        <div className={s.moduleIconWrap} style={{ background: `${mod.accent}14`, color: mod.accent }}>
          {mod.icon}
        </div>
        <div className={s.moduleContent}>
          <div className={s.moduleTitle}>{mod.title}</div>
          <div className={s.moduleSub}>{mod.sub}</div>
        </div>
        <svg className={s.moduleChevron} style={{ color: mod.accent }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9,18 15,12 9,6"/>
        </svg>
      </div>
    </Link>
  )
}

// ── Quick link ────────────────────────────────────────

function QuickLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className={s.quickLink}>
      <span className={s.quickLinkIcon}>{icon}</span>
      {label}
    </Link>
  )
}

// ── Activity dot ──────────────────────────────────────

function ActivityDot({ type }: { type: string }) {
  const colors: Record<string, string> = {
    preventiva: '#166534',
    corretiva:  '#DC2626',
    inspecao:   '#EA580C',
  }
  return (
    <div
      className={s.activityDot}
      style={{ background: colors[type] ?? '#D9E1EC' }}
    />
  )
}

// ── HomePage ──────────────────────────────────────────

export default function HomePage() {
  useCategories()
  useAssets()
  useMaintenance()

  const user        = useStore(st => st.user)
  const assets      = useStore(st => st.assets)
  const maintenance = useStore(st => st.maintenance)

  const firstName = user?.nome?.split(' ')[0] ?? 'Usuário'

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  const stats = useMemo(() => ({
    total:         assets.length,
    inMaintenance: assets.filter(a => a.status === 'manutencao').length,
    avariados:     assets.filter(a => a.status === 'avariado').length,
    pendingMaint:  maintenance.filter(m => m.status === 'pendente').length,
    inProgress:    maintenance.filter(m => m.status === 'andamento').length,
  }), [assets, maintenance])

  const recentActivity = useMemo(() => [...maintenance].slice(0, 10), [maintenance])

  const assetMap = useMemo(
    () => Object.fromEntries(assets.map(a => [a.id, a])),
    [assets],
  )

  return (
    <div className={s.page}>

      {/* ── Top band ── */}
      <div className={s.topBand}>
        <div className={s.topBandInner}>
          <div>
            <h1 className={s.greeting}>Olá, {firstName}</h1>
            <p className={s.date}>{today}</p>
          </div>
          <div className={s.headerActions}>
            <Link to="/ativos/novo" className={s.btnPrimary}>+ Novo Ativo</Link>
            <Link to="/dashboard"   className={s.btnGhost}>
              <Ic.Chart size={15} />
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className={s.body}>

        {/* ── Stats row ── */}
        <div className={s.statsGrid}>
          <StatCard icon={<Ic.Tag />}         value={stats.total}         label="Total de Ativos" accent="#166534" to="/ativos" />
          <StatCard icon={<Ic.Wrench />}      value={stats.inMaintenance} label="Em Manutenção"   accent="#F59E0B" to="/ativos/manutencao" />
          <StatCard icon={<Ic.AlertCircle />} value={stats.avariados}     label="Avariados"       accent="#DC2626" to="/ativos" />
          <StatCard icon={<Ic.Clock />}       value={stats.pendingMaint}  label="Pendentes"       accent="#8898AA" to="/ativos/manutencao" />
          <StatCard icon={<Ic.RefreshCw />}   value={stats.inProgress}    label="Em Andamento"    accent="#EA580C" to="/ativos/manutencao" />
        </div>

        {/* ── Two-column layout ── */}
        <div className={s.twoCol}>

          {/* Left: modules */}
          <div className={s.modulesCol}>
            {MODULE_GROUPS.map(group => (
              <div key={group.group} className={s.moduleGroup}>
                <div className={s.groupHeader}>
                  <span className={s.groupIcon}>{group.icon}</span>
                  <span className={s.groupLabel}>{group.group}</span>
                </div>
                <div className={s.moduleGrid}>
                  {group.modules.map(mod => (
                    <ModuleCard key={mod.to as string} mod={mod} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Right: recent activity */}
          <div className={s.activityCol}>
            <div className={s.activityCard}>
              <div className={s.activityHeader}>
                <span className={s.activityTitle}>Atividade Recente</span>
                <Link to="/ativos/manutencao" className={s.viewAll}>Ver todas →</Link>
              </div>

              {recentActivity.length === 0 ? (
                <div className={s.activityEmpty}>
                  <div className={s.emptyIcon}>
                    <Ic.Clipboard size={32} />
                  </div>
                  <p>Nenhuma manutenção registrada ainda.</p>
                </div>
              ) : (
                <div className={s.activityList}>
                  {recentActivity.map(m => {
                    const asset    = assetMap[m.assetId]
                    const typeMeta = MAINT_TYPE_META[m.type]
                    const stMeta   = MAINT_STATUS_META[m.status]
                    return (
                      <div key={m.id} className={s.activityItem}>
                        <ActivityDot type={m.type} />
                        <div className={s.activityBody}>
                          <div className={s.activityDesc}>
                            {typeMeta.icon} {m.description || 'Manutenção'}
                          </div>
                          <div className={s.activityMeta}>
                            {asset && <span className={s.assetCode}>{asset.code}</span>}
                            {asset?.name ?? 'Ativo'}
                            {m.technician ? ` · ${m.technician}` : ''}
                            {m.createdAt ? ` · ${fmtDate(m.createdAt)}` : ''}
                          </div>
                        </div>
                        <span className={s.activityStatus}>
                          {stMeta.icon} {stMeta.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Quick links */}
            <div className={s.quickLinks}>
              <QuickLink to="/os"                   icon={<Ic.FileText size={16} />}    label="Ordens de Serviço" />
              <QuickLink to="/compras"              icon={<Ic.Cart size={16} />}        label="Pedidos de Compra" />
              <QuickLink to="/limpeza/ranking"      icon={<Ic.Trophy />}                label="Rankings 5S"       />
              <QuickLink to="/dashboard/aprovacoes" icon={<Ic.CheckCircle size={16} />} label="Aprovações"        />
              <QuickLink to="/colaboradores"        icon={<Ic.User size={16} />}        label="Colaboradores"     />
              <QuickLink to="/obras"                icon={<Ic.Hammer size={16} />}      label="Obras & Contratos" />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

import { useMemo, type CSSProperties } from 'react'
import { Link }         from 'react-router-dom'
import { useStore }     from '@/store/useStore'
import { useAssets, useCategories, useMaintenance } from '@/hooks/useData'
import { MAINT_STATUS_META, MAINT_TYPE_META }        from '@/types'
import { fmtDate }      from '@/lib/db'
import s from './HomePage.module.css'

// ── Module definitions ────────────────────────────────

interface ModuleDef {
  icon:    string
  title:   string
  sub:     string
  to:      string
  accent:  string
  legacy?: boolean
}

const MODULE_GROUPS: Array<{ group: string; icon: string; modules: ModuleDef[] }> = [
  {
    group: 'Patrimônio & Manutenção',
    icon: '🏭',
    modules: [
      { icon: '🏷️', title: 'Ativos',       sub: 'Patrimônio & Inventário',  to: '/ativos',              accent: '#166534' },
      { icon: '🔧', title: 'Manutenções',  sub: 'Preventiva & Corretiva',   to: '/ativos/manutencao',   accent: '#16A34A' },
      { icon: '📋', title: 'Inventário',   sub: 'Auditoria de Ativos',      to: '/ativos/inventario',   accent: '#EA580C' },
      { icon: '🏢', title: 'Fornecedores', sub: 'Gestão de Fornecedores',   to: '/ativos/fornecedores', accent: '#F97316' },
    ],
  },
  {
    group: 'Operações',
    icon: '⚙️',
    modules: [
      { icon: '📑', title: 'Ordens de Serviço', sub: 'Central de O.S.',   to: '/os',      accent: '#166534' },
      { icon: '🛒', title: 'Compras',           sub: 'Pedidos de Compra', to: '/compras', accent: '#EA580C' },
    ],
  },
  {
    group: 'Facilities & Frota',
    icon: '🚛',
    modules: [
      { icon: '🧹', title: 'Limpeza 5S',     sub: 'Inspeções e Rankings', to: '/limpeza', accent: '#16A34A' },
      { icon: '🚛', title: 'Frota',          sub: 'Gestão de Veículos',   to: '/frota',   accent: '#F97316' },
      { icon: '🏗️', title: 'Infraestrutura', sub: 'Predial & Civil',     to: '/infra',   accent: '#475569', legacy: true },
    ],
  },
]

// ── Stat card ─────────────────────────────────────────

interface StatProps { icon: string; value: number | string; label: string; accent: string; to?: string; trend?: string }

function StatCard({ icon, value, label, accent, to, trend }: StatProps) {
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
      {trend && <div className={s.statTrend}>{trend}</div>}
      <div className={s.statAccentBar} style={{ background: accent }} />
    </div>
  )
  return to ? <Link to={to} className={s.statLink}>{inner}</Link> : inner
}

// ── Module card ───────────────────────────────────────

function ModuleCard({ mod }: { mod: ModuleDef }) {
  const target = mod.legacy ? `/legacy${mod.to}` : mod.to
  return (
    <Link to={target} className={s.moduleLink}>
      <div className={s.moduleCard} style={{ '--accent': mod.accent } as CSSProperties}>
        <div className={s.moduleIconWrap} style={{ background: `${mod.accent}14` }}>
          <span className={s.moduleIcon}>{mod.icon}</span>
        </div>
        <div className={s.moduleContent}>
          <div className={s.moduleTitle}>{mod.title}</div>
          <div className={s.moduleSub}>{mod.sub}</div>
        </div>
        <div className={s.moduleChevron} style={{ color: mod.accent }}>›</div>
      </div>
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
            <Link to="/dashboard"   className={s.btnGhost}>📊 Dashboard</Link>
          </div>
        </div>
      </div>

      <div className={s.body}>

        {/* ── Stats row ── */}
        <div className={s.statsGrid}>
          <StatCard icon="🏷️" value={stats.total}         label="Total de Ativos"       accent="#166534" to="/ativos" />
          <StatCard icon="🔧" value={stats.inMaintenance} label="Em Manutenção"          accent="#F59E0B" to="/ativos/manutencao" />
          <StatCard icon="🔴" value={stats.avariados}     label="Avariados"              accent="#DC2626" to="/ativos" />
          <StatCard icon="⏳" value={stats.pendingMaint}  label="Pendentes"              accent="#8898AA" to="/ativos/manutencao" />
          <StatCard icon="🔄" value={stats.inProgress}    label="Em Andamento"           accent="#EA580C" to="/ativos/manutencao" />
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
                    <ModuleCard key={mod.to + mod.title} mod={mod} />
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
                  <div className={s.emptyIcon}>📭</div>
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
              <Link to="/limpeza/ranking"   className={s.quickLink}>🏆 Rankings 5S</Link>
              <Link to="/limpeza/historico" className={s.quickLink}>📋 Histórico de Inspeções</Link>
              <Link to="/frota"             className={s.quickLink}>🚛 Painel da Frota</Link>
              <Link to="/os"                className={s.quickLink}>📑 Ordens de Serviço</Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

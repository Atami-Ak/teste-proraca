import { useState, useEffect, useMemo, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { getEmployees } from '@/lib/db-employees'
import type { Employee, StatusEmployee, StatusPerformance, TipoVinculo } from '@/types/employee'
import {
  STATUS_PERFORMANCE_META, STATUS_EMPLOYEE_META, TIPO_VINCULO_META,
} from '@/types/employee'
import s from './EmployeeDashboardPage.module.css'

// ── SVG icons ──────────────────────────────────────────
const Ic = {
  Users:    () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Plus:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Search:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  X:        () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Trophy:   () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 13 8 19"/><polyline points="16 13 16 19"/><line x1="5" y1="19" x2="19" y2="19"/><path d="M17 3H7v7a5 5 0 0 0 10 0V3z"/><path d="M7 6H4a1 1 0 0 0-1 1v2a4 4 0 0 0 4 4"/><path d="M17 6h3a1 1 0 0 1 1 1v2a4 4 0 0 1-4 4"/></svg>,
  Chart:    () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Star:     () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>,
  Warning:  () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  UserPlus: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>,
  MapPin:   () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Tag:      () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  Mail:     () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  Phone:    () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.18C1.6 2.1 2.38 1.19 3.46 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.5a16 16 0 0 0 6 6l.81-.81a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  ChevRight:() => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>,
  UserCheck:() => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17,11 19,13 23,9"/></svg>,
  AlertOct: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="7.86,2 16.14,2 22,7.86 22,16.14 16.14,22 7.86,22 2,16.14 2,7.86"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Grid:     () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
}

// ── Score color helper ─────────────────────────────────
function scoreColor(s: number) {
  if (s >= 90) return '#166534'
  if (s >= 75) return '#16a34a'
  if (s >= 60) return '#2563eb'
  if (s >= 40) return '#d97706'
  return '#dc2626'
}

// ── Score Ring (SVG inline) ────────────────────────────
function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const r     = (size - 8) / 2
  const circ  = 2 * Math.PI * r
  const dash  = (score / 100) * circ
  const color = scoreColor(score)
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{
          transform: `rotate(90deg) translate(0, -${size}px) translate(${size/2}px, ${size/2}px)`,
          transformOrigin: `${size/2}px ${size/2}px`,
          fill: color, fontSize: size * 0.22, fontWeight: 700, fontFamily: 'inherit',
        }}>
        {score}
      </text>
    </svg>
  )
}

// ── Employee Card ──────────────────────────────────────
function EmployeeCard({ emp }: { emp: Employee }) {
  const perfMeta = STATUS_PERFORMANCE_META[emp.statusPerformance]
  const statMeta = STATUS_EMPLOYEE_META[emp.status]
  const vincMeta = TIPO_VINCULO_META[emp.tipoVinculo]
  const color    = perfMeta.color
  const initial  = emp.nome?.[0]?.toUpperCase() ?? '?'

  return (
    <Link to={`/colaboradores/${emp.id}`} className={s.card}>
      <div className={s.cardAccent} style={{ background: color }} />

      {/* Card head */}
      <div className={s.cardHead}>
        <div className={s.cardAvatar} style={{ background: color + '18', color, borderColor: color + '44' }}>
          {emp.fotoUrl
            ? <img src={emp.fotoUrl} alt={emp.nome} className={s.avatarImg} />
            : initial
          }
        </div>
        <div className={s.cardHeadMeta}>
          <div className={s.empName}>{emp.nome}</div>
          <div className={s.empCargo}>{emp.cargo}</div>
        </div>
        <ScoreRing score={emp.scorePerformance} size={48} />
      </div>

      {/* Card body */}
      <div className={s.cardBody}>
        <div className={s.metaRow}>
          <span className={s.metaIcon}><Ic.MapPin /></span>
          <span className={s.metaText}>{emp.setor}</span>
          {emp.departamento && emp.departamento !== emp.setor && (
            <span className={s.metaSub}>· {emp.departamento}</span>
          )}
        </div>
        <div className={s.metaRow}>
          <span className={s.metaIcon}><Ic.Tag /></span>
          <span className={s.metaMono}>{emp.matricula}</span>
          {emp.supervisor && (
            <span className={s.metaSub}>· {emp.supervisor}</span>
          )}
        </div>
        {emp.email && (
          <div className={s.metaRow}>
            <span className={s.metaIcon}><Ic.Mail /></span>
            <span className={s.metaText}>{emp.email}</span>
          </div>
        )}
        {emp.telefone && (
          <div className={s.metaRow}>
            <span className={s.metaIcon}><Ic.Phone /></span>
            <span className={s.metaText}>{emp.telefone}</span>
          </div>
        )}
      </div>

      {/* Badges */}
      <div className={s.cardBadges}>
        <span className={s.statusBadge} style={{ color: statMeta.color, background: statMeta.bg }}>
          {statMeta.label}
        </span>
        <span className={s.vincBadge} style={{ color: vincMeta.color, background: vincMeta.color + '14' }}>
          {vincMeta.label}
        </span>
        <span className={s.perfBadge} style={{ color, background: color + '12' }}>
          {perfMeta.label}
        </span>
      </div>

      {/* Score bar */}
      <div className={s.scoreRow}>
        <div className={s.scoreBarWrap}>
          <div className={s.scoreBar}>
            <div className={s.scoreFill}
              style={{ width: `${emp.scorePerformance}%`, background: color }} />
          </div>
          <span className={s.scoreNum} style={{ color }}>{emp.scorePerformance}%</span>
        </div>
        {(emp.totalAvisos > 0 || emp.totalReconhecimentos > 0) && (
          <div className={s.badgesRow}>
            {emp.totalAvisos > 0 && (
              <span className={s.warnBadge}>{emp.totalAvisos} advert.</span>
            )}
            {emp.totalReconhecimentos > 0 && (
              <span className={s.recogBadge}>{emp.totalReconhecimentos} reconh.</span>
            )}
          </div>
        )}
      </div>

      <div className={s.cardFooter}>
        <span className={s.viewBtn}>Ver perfil completo <Ic.ChevRight /></span>
      </div>
    </Link>
  )
}

// ── Quick Action Card ──────────────────────────────────
function QuickAction({ icon, title, sub, to, color, badge }: {
  icon: React.ReactNode; title: string; sub: string
  to: string; color: string; badge?: number
}) {
  return (
    <Link to={to} className={s.quickAction} style={{ '--qa-color': color } as CSSProperties}>
      <div className={s.qaAccent} />
      <div className={s.qaIconWrap} style={{ background: color + '18', color }}>
        {icon}
      </div>
      <div className={s.qaContent}>
        <div className={s.qaTitle}>{title}</div>
        <div className={s.qaSub}>{sub}</div>
      </div>
      {badge !== undefined && badge > 0 && (
        <div className={s.qaBadge} style={{ background: color + '20', color }}>{badge}</div>
      )}
      <Ic.ChevRight />
    </Link>
  )
}

// ══════════════════════════════════════════════════════
// EmployeeDashboardPage — Unified View
// ══════════════════════════════════════════════════════
export default function EmployeeDashboardPage() {
  const [list,    setList]    = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search,        setSearch]        = useState('')
  const [filterStatus,  setFilterStatus]  = useState<StatusEmployee | ''>('')
  const [filterPerf,    setFilterPerf]    = useState<StatusPerformance | ''>('')
  const [filterVinculo, setFilterVinculo] = useState<TipoVinculo | ''>('')
  const [filterSetor,   setFilterSetor]   = useState('')
  const [filterCertAlert, setFilterCertAlert] = useState(false)

  useEffect(() => {
    getEmployees()
      .then(setList)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Derived stats
  const stats = useMemo(() => ({
    total:      list.length,
    ativos:     list.filter(e => e.status === 'ativo').length,
    afastados:  list.filter(e => e.status === 'afastado' || e.status === 'ferias').length,
    criticos:   list.filter(e => e.statusPerformance === 'critico').length,
    excelentes: list.filter(e => e.statusPerformance === 'excelente' || e.statusPerformance === 'muito_bom').length,
    avgScore:   list.length > 0
      ? Math.round(list.reduce((s, e) => s + e.scorePerformance, 0) / list.length)
      : 0,
    totalAvisos: list.reduce((s, e) => s + e.totalAvisos, 0),
    certAlertas: list.reduce((s, e) => s + e.totalCertificacoesVencidas + e.totalCertificacoesAVencer, 0),
    totalSaldoBancoHoras: list.reduce((s, e) => s + (e.saldoBancoHoras ?? 0), 0),
  }), [list])

  // Dynamic setor list for filter
  const setores = useMemo(
    () => [...new Set(list.map(e => e.setor).filter(Boolean))].sort(),
    [list],
  )

  // Search + filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return list.filter(e => {
      if (filterStatus  && e.status           !== filterStatus)  return false
      if (filterPerf    && e.statusPerformance !== filterPerf)    return false
      if (filterVinculo && e.tipoVinculo       !== filterVinculo) return false
      if (filterSetor   && e.setor             !== filterSetor)   return false
      if (filterCertAlert && (e.totalCertificacoesVencidas + e.totalCertificacoesAVencer) === 0) return false
      if (!q) return true
      const vincLabel = TIPO_VINCULO_META[e.tipoVinculo]?.label ?? ''
      const statLabel = STATUS_EMPLOYEE_META[e.status]?.label ?? ''
      return (
        e.nome.toLowerCase().includes(q) ||
        e.matricula.toLowerCase().includes(q) ||
        e.cargo.toLowerCase().includes(q) ||
        e.setor.toLowerCase().includes(q) ||
        e.departamento.toLowerCase().includes(q) ||
        e.supervisor.toLowerCase().includes(q) ||
        (e.email       ?? '').toLowerCase().includes(q) ||
        (e.telefone    ?? '').includes(q) ||
        (e.cpf         ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
        (e.codigoInterno ?? '').toLowerCase().includes(q) ||
        vincLabel.toLowerCase().includes(q) ||
        statLabel.toLowerCase().includes(q)
      )
    })
  }, [list, search, filterStatus, filterPerf, filterVinculo, filterSetor, filterCertAlert])

  const hasFilters = !!(search || filterStatus || filterPerf || filterVinculo || filterSetor || filterCertAlert)

  const clearFilters = () => {
    setSearch(''); setFilterStatus(''); setFilterPerf(''); setFilterVinculo(''); setFilterSetor('')
    setFilterCertAlert(false)
  }

  // Click stat to toggle filter
  const toggleFilter = (key: 'status' | 'perf', val: string) => {
    if (key === 'status') setFilterStatus(p => p === val ? '' : val as StatusEmployee)
    if (key === 'perf')   setFilterPerf(p   => p === val ? '' : val as StatusPerformance)
  }

  const STATS_CONFIG = [
    { label: 'Total',       value: stats.total,      color: '#64748b', onClick: undefined },
    { label: 'Ativos',      value: stats.ativos,     color: '#166534', onClick: () => toggleFilter('status', 'ativo'),    active: filterStatus === 'ativo' },
    { label: 'Afastados',   value: stats.afastados,  color: '#d97706', onClick: () => toggleFilter('status', 'afastado'), active: filterStatus === 'afastado' },
    { label: 'Score Médio', value: `${stats.avgScore}%`, color: '#6366f1', onClick: undefined },
    { label: 'Destaques',   value: stats.excelentes, color: '#16a34a', onClick: () => toggleFilter('perf', 'excelente'),  active: filterPerf === 'excelente' },
    { label: 'Críticos',    value: stats.criticos,   color: '#dc2626', onClick: () => toggleFilter('perf', 'critico'),    active: filterPerf === 'critico' },
    { label: 'Certificações', value: stats.certAlertas, color: '#d97706', onClick: () => setFilterCertAlert(p => !p), active: filterCertAlert },
    { label: 'Saldo BH (h)', value: `${stats.totalSaldoBancoHoras > 0 ? '+' : ''}${stats.totalSaldoBancoHoras}`, color: stats.totalSaldoBancoHoras >= 0 ? '#166534' : '#dc2626', onClick: undefined },
  ]

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.headerIcon}><Ic.Users /></div>
          <div>
            <h1 className={s.pageTitle}>Colaboradores</h1>
            <p className={s.pageSub}>
              {stats.ativos} ativos · {stats.total} cadastrado{stats.total !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className={s.headerActions}>
          <Link to="/colaboradores/ranking" className={s.btnGhost}>
            <Ic.Trophy /> Rankings
          </Link>
          <Link to="/colaboradores/novo" className={s.btnPrimary}>
            <Ic.Plus /> Novo Colaborador
          </Link>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className={s.quickActions}>
        <QuickAction
          icon={<Ic.UserPlus />}
          title="Cadastrar Colaborador"
          sub="Adicionar novo membro"
          to="/colaboradores/novo"
          color="#166534"
        />
        <QuickAction
          icon={<Ic.Trophy />}
          title="Ranking de Desempenho"
          sub="Top performers do período"
          to="/colaboradores/ranking"
          color="#f59e0b"
        />
        <QuickAction
          icon={<Ic.Chart />}
          title="Analytics de RH"
          sub="Dashboard executivo"
          to="/dashboard/colaboradores"
          color="#6366f1"
        />
        <QuickAction
          icon={<Ic.AlertOct />}
          title="Atenção Necessária"
          sub={`${stats.criticos} colaborador${stats.criticos !== 1 ? 'es' : ''} crítico${stats.criticos !== 1 ? 's' : ''}`}
          to="/colaboradores"
          color="#dc2626"
          badge={stats.criticos}
        />
      </div>

      {/* ── KPI Stats ── */}
      <div className={s.statsGrid}>
        {STATS_CONFIG.map(sc => (
          <div
            key={sc.label}
            className={`${s.statCard} ${sc.onClick ? s.statClickable : ''} ${'active' in sc && sc.active ? s.statActive : ''}`}
            style={{ '--stat-color': sc.color } as CSSProperties}
            onClick={sc.onClick}
          >
            <div className={s.statBar} />
            <div className={s.statBody}>
              <div className={s.statValue} style={{ color: sc.color }}>{sc.value}</div>
              <div className={s.statLabel}>{sc.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Search + Filters ── */}
      <div className={s.filtersBar}>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}><Ic.Search /></span>
          <input
            className={s.searchInput}
            placeholder="Buscar por nome, matrícula, cargo, setor, e-mail, telefone, CPF…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className={s.searchClear} onClick={() => setSearch('')}><Ic.X /></button>
          )}
        </div>

        <div className={s.filterRow}>
          <select className={s.filterSelect} value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as StatusEmployee | '')}>
            <option value="">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="afastado">Afastado</option>
            <option value="ferias">Férias</option>
            <option value="inativo">Inativo</option>
            <option value="desligado">Desligado</option>
          </select>

          <select className={s.filterSelect} value={filterPerf}
            onChange={e => setFilterPerf(e.target.value as StatusPerformance | '')}>
            <option value="">Desempenho</option>
            <option value="excelente">Excelente</option>
            <option value="muito_bom">Muito Bom</option>
            <option value="bom">Bom</option>
            <option value="atencao">Atenção</option>
            <option value="critico">Crítico</option>
          </select>

          <select className={s.filterSelect} value={filterVinculo}
            onChange={e => setFilterVinculo(e.target.value as TipoVinculo | '')}>
            <option value="">Vínculo</option>
            <option value="clt">CLT</option>
            <option value="pj">PJ</option>
            <option value="temporario">Temporário</option>
            <option value="terceirizado">Terceirizado</option>
            <option value="estagiario">Estagiário</option>
          </select>

          <select className={s.filterSelect} value={filterSetor}
            onChange={e => setFilterSetor(e.target.value)}>
            <option value="">Setor</option>
            {setores.map(sv => <option key={sv} value={sv}>{sv}</option>)}
          </select>

          <div className={s.filterDivider} />

          <span className={s.resultCount}>{filtered.length} de {list.length}</span>

          {hasFilters && (
            <button className={s.clearBtn} onClick={clearFilters}>
              <Ic.X /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* ── Card Grid ── */}
      {loading ? (
        <div className={s.loadingWrap}>
          <div className={s.spinner} />
          <span>Carregando colaboradores…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}><Ic.Users /></div>
          <h3 className={s.emptyTitle}>
            {list.length === 0 ? 'Nenhum colaborador cadastrado' : 'Nenhum resultado encontrado'}
          </h3>
          <p className={s.emptyDesc}>
            {list.length === 0
              ? 'Cadastre o primeiro colaborador clicando em "+ Novo Colaborador".'
              : 'Tente ajustar os filtros ou a busca.'}
          </p>
          {list.length === 0 && (
            <Link to="/colaboradores/novo" className={s.btnPrimary}>
              <Ic.Plus /> Cadastrar colaborador
            </Link>
          )}
        </div>
      ) : (
        <div className={s.cardGrid}>
          {filtered.map(emp => (
            <EmployeeCard key={emp.id} emp={emp} />
          ))}
        </div>
      )}

    </div>
  )
}

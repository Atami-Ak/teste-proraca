// src/pages/dashboard/seguranca/SafetyAnalyticsPage.tsx
// Safety Analytics — Executive Safety Command Center.
// Read-only data intelligence module. No creation actions exposed.

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ResponsiveContainer,
  Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ComposedChart, Line,
  XAxis, YAxis, Tooltip,
} from 'recharts'

import {
  fetchSafetyAnalytics,
  clearSafetyAnalyticsCache,
} from '@/lib/db-safety-analytics'
import type {
  SafetyPeriod, SafetyAnalyticsData, SectorMetrics,
  EmployeeSafetyProfile, SafetyDimension,
} from '@/types/safety-analytics'
import {
  RISK_COLORS, RISK_BG, RISK_LABELS,
  TREND_ICON, TREND_COLOR,
  EPI_STATUS_COLORS, EPI_STATUS_LABELS,
  scoreColor,
} from '@/types/safety-analytics'

import s from './SafetyAnalyticsPage.module.css'

// ── Period config ─────────────────────────────────────────────

const PERIODS: { value: SafetyPeriod; label: string }[] = [
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: '6m',  label: '6 meses' },
  { value: '1a',  label: '1 ano'   },
]

// ── Sub-components ────────────────────────────────────────────

function KpiCard({
  loading, accent, icon, value, label, sub, unit, invert,
}: {
  loading: boolean
  accent:  string
  icon:    string
  value:   number
  label:   string
  sub?:    string
  unit?:   string
  invert?: boolean
}) {
  if (loading) return <div className={s.kpiCard}><div className={s.kpiSkeleton} /></div>
  return (
    <div className={s.kpiCard}>
      <div className={s.kpiAccent} style={{ background: accent }} />
      <div className={s.kpiIcon}>{icon}</div>
      <div className={s.kpiValue}>
        {value.toLocaleString('pt-BR')}
        {unit && <span className={s.kpiUnit}>{unit}</span>}
      </div>
      <div className={s.kpiLabel}>{label}</div>
      {sub && <div className={s.kpiSub} style={invert ? { color: '#94a3b8' } : undefined}>{sub}</div>}
    </div>
  )
}

function RiskBadge({ level }: { level: string }) {
  const risk = level as keyof typeof RISK_COLORS
  return (
    <span
      className={s.riskBadge}
      style={{ color: RISK_COLORS[risk] ?? '#64748b', background: RISK_BG[risk] ?? '#f8fafc' }}
    >
      {RISK_LABELS[risk] ?? level}
    </span>
  )
}

function TrendChip({ trend, delta }: { trend: string; delta: number }) {
  type T = keyof typeof TREND_ICON
  const icon  = TREND_ICON[trend as T] ?? '—'
  const color = TREND_COLOR[trend as T] ?? '#94a3b8'
  const abs   = Math.abs(delta)
  return (
    <span className={s.trendChip} style={{ color }}>
      {icon}{abs > 0 ? ` ${abs}` : ''}
    </span>
  )
}

function ScoreBar({ score, color }: { score: number; color?: string }) {
  const fill = color ?? scoreColor(score)
  return (
    <div className={s.scoreBar}>
      <div className={s.scoreBarTrack}>
        <div className={s.scoreBarFill} style={{ width: `${score}%`, background: fill }} />
      </div>
      <span className={s.scoreNum} style={{ color: fill }}>{score}</span>
    </div>
  )
}

// ── Chart components ──────────────────────────────────────────

function IncidentTrendChart({ data }: { data: SafetyAnalyticsData['monthlyTrend'] }) {
  if (!data.length) return <div className={s.emptyChart}>Sem dados no período</div>
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#dc2626" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="nmGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#ea580c" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v, name) => [v, String(name) === 'incidents' ? 'Incidentes' : 'Quase-Acid.']}
        />
        <Area type="monotone" dataKey="incidents"  fill="url(#incGrad)" stroke="#dc2626" strokeWidth={2} dot={false} name="incidents" />
        <Line type="monotone" dataKey="nearMisses" stroke="#ea580c"     strokeWidth={2} dot={false} name="nearMisses" strokeDasharray="4 3" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function IncidentTypeChart({ data }: { data: SafetyAnalyticsData['byType'] }) {
  if (!data.length) return <div className={s.emptyChart}>Sem ocorrências no período</div>
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="label" cx="50%" cy="50%"
          innerRadius={48} outerRadius={78} paddingAngle={3}
        >
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v, name) => [v, String(name)]}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

function SeverityChart({ data }: { data: SafetyAnalyticsData['bySeverity'] }) {
  if (!data.length) return <div className={s.emptyChart}>Sem ocorrências no período</div>
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 0 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={72} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v) => [v, 'Ocorrências']}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#64748b' }}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function SafetyRadar({ data }: { data: SafetyDimension[] }) {
  if (!data.length) return <div className={s.emptyChart}>Sem dados</div>
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data} margin={{ top: 12, right: 32, bottom: 12, left: 32 }}>
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#64748b' }} />
        <Radar name="Safety" dataKey="score" stroke="#166534" fill="#166534" fillOpacity={0.2} strokeWidth={2} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v) => [`${v}/100`, 'Score']}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}

function DdsEffectivenessChart({ data }: { data: SafetyAnalyticsData['monthlyTrend'] }) {
  if (!data.length) return <div className={s.emptyChart}>Sem dados no período</div>
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v, name) => [v, String(name) === 'ddsCount' ? 'DDS' : 'DDI']}
        />
        <Bar dataKey="ddsCount" fill="#166534" fillOpacity={0.85} radius={[3, 3, 0, 0]} name="ddsCount" />
        <Bar dataKey="ddiAvgScore" fill="#ea580c" fillOpacity={0.65} radius={[3, 3, 0, 0]} name="ddiAvgScore" />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Sector drill-down panel ────────────────────────────────────

function SectorDrillDown({
  sector,
  onClose,
}: {
  sector: SectorMetrics
  onClose: () => void
}) {
  return (
    <div className={s.drillDown}>
      <div className={s.drillHeader}>
        <div>
          <div className={s.drillTitle}>Setor: {sector.setor}</div>
          <div className={s.drillSub}>Perfil de risco detalhado</div>
        </div>
        <button className={s.drillClose} onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className={s.drillBody}>
        {/* KPI grid */}
        <div className={s.drillKpiGrid}>
          {[
            { label: 'Incidentes',     value: sector.incidents,         color: '#dc2626' },
            { label: 'Quase-Acidentes',value: sector.nearMisses,        color: '#ea580c' },
            { label: 'DDI (média)',     value: sector.avgDdiScore,       color: scoreColor(sector.avgDdiScore), unit: 'pts' },
            { label: 'EPI Irregular',  value: sector.epiNonCompliance,  color: sector.epiNonCompliance > 30 ? '#dc2626' : '#f59e0b', unit: '%' },
            { label: 'DDS realizados', value: sector.ddsCount,          color: '#166534' },
            { label: 'PT Ativas',      value: sector.activePermits,     color: '#3b82f6' },
          ].map(kpi => (
            <div key={kpi.label} className={s.drillKpiItem}>
              <div className={s.drillKpiValue} style={{ color: kpi.color }}>
                {kpi.value}{kpi.unit ?? ''}
              </div>
              <div className={s.drillKpiLabel}>{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Risk score */}
        <div className={s.drillSection}>
          <div className={s.drillSectionTitle}>Pontuação de Risco</div>
          <div className={s.drillRiskRow}>
            <ScoreBar score={sector.riskScore} color={RISK_COLORS[sector.riskLevel]} />
            <RiskBadge level={sector.riskLevel} />
          </div>
        </div>

        {/* Top hazards */}
        {sector.topHazards.length > 0 && (
          <div className={s.drillSection}>
            <div className={s.drillSectionTitle}>Principais Não-Conformidades (DDI)</div>
            <div className={s.hazardList}>
              {sector.topHazards.map((h, i) => (
                <div key={i} className={s.hazardItem}>
                  <span className={s.hazardBullet}>●</span>
                  <span>{h}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trend indicator */}
        <div className={s.drillSection}>
          <div className={s.drillSectionTitle}>Tendência vs Período Anterior</div>
          <div className={s.drillTrendRow}>
            <TrendChip trend={sector.trend} delta={sector.trendDelta} />
            <span className={s.drillTrendLabel}>
              {sector.trendDelta === 0
                ? 'Estável — mesma frequência de incidentes'
                : sector.trendDelta > 0
                  ? `+${sector.trendDelta} incidente(s) em relação ao período anterior`
                  : `${sector.trendDelta} incidente(s) em relação ao período anterior`
              }
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Employee drill-down panel ──────────────────────────────────

function EmployeeDrillDown({
  employee,
  onClose,
}: {
  employee: EmployeeSafetyProfile
  onClose:  () => void
}) {
  return (
    <div className={s.drillDown}>
      <div className={s.drillHeader}>
        <div>
          <div className={s.drillTitle}>{employee.nome}</div>
          <div className={s.drillSub}>{employee.funcao} · {employee.setor} · Mat. {employee.matricula || '—'}</div>
        </div>
        <button className={s.drillClose} onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className={s.drillBody}>
        <div className={s.drillKpiGrid}>
          {[
            { label: 'EPI Status', value: EPI_STATUS_LABELS[employee.epiStatus] ?? employee.epiStatus, color: EPI_STATUS_COLORS[employee.epiStatus] ?? '#64748b', raw: true },
            { label: 'EPIs Vencidos', value: String(employee.epiVencidos), color: employee.epiVencidos > 0 ? '#dc2626' : '#16a34a', raw: true },
            { label: 'EPIs a Vencer', value: String(employee.epiAVencer),  color: employee.epiAVencer > 0 ? '#f59e0b' : '#16a34a', raw: true },
            { label: 'Incidentes', value: String(employee.incidentCount),  color: employee.incidentCount > 0 ? '#dc2626' : '#16a34a', raw: true },
            { label: 'DDS (presente)', value: `${employee.ddsAttended}/${employee.ddsInSector}`, color: '#166534', raw: true },
            { label: 'Taxa DDS', value: `${employee.ddsRate}%`, color: scoreColor(employee.ddsRate), raw: true },
          ].map(kpi => (
            <div key={kpi.label} className={s.drillKpiItem}>
              <div className={s.drillKpiValue} style={{ color: kpi.color }}>{kpi.value}</div>
              <div className={s.drillKpiLabel}>{kpi.label}</div>
            </div>
          ))}
        </div>

        <div className={s.drillSection}>
          <div className={s.drillSectionTitle}>Nível de Risco do Colaborador</div>
          <div className={s.drillRiskRow}>
            <ScoreBar score={employee.riskScore} color={RISK_COLORS[employee.riskLevel]} />
            <RiskBadge level={employee.riskLevel} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function SafetyAnalyticsPage() {
  const [period,   setPeriod]   = useState<SafetyPeriod>('90d')
  const [data,     setData]     = useState<SafetyAnalyticsData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [search,   setSearch]   = useState('')
  const [empSearch, setEmpSearch] = useState('')
  const [selectedSector,   setSelectedSector]   = useState<string | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null)

  const load = useCallback(async (p: SafetyPeriod, force = false) => {
    setLoading(true); setError(null)
    try {
      if (force) clearSafetyAnalyticsCache()
      const result = await fetchSafetyAnalytics(p, force)
      setData(result)
    } catch (e) {
      console.error(e)
      setError('Erro ao carregar dados de segurança. Verifique a conexão e tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setSelectedSector(null)
    setSelectedEmployee(null)
    setSearch('')
    setEmpSearch('')
    void load(period)
  }, [period, load])

  const filteredSectors = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return q ? data.sectors.filter(s => s.setor.toLowerCase().includes(q)) : data.sectors
  }, [data, search])

  const filteredEmployees = useMemo(() => {
    if (!data) return []
    const q = empSearch.trim().toLowerCase()
    const list = q
      ? data.employees.filter(e =>
          e.nome.toLowerCase().includes(q) ||
          e.setor.toLowerCase().includes(q) ||
          e.matricula.toLowerCase().includes(q),
        )
      : data.employees
    return list.slice(0, 12)
  }, [data, empSearch])

  const criticalAlerts = data?.alerts.filter(a => a.severity === 'critical') ?? []
  const allAlerts      = data?.alerts ?? []

  // Accent color for EPI / DDS / DDI KPI cards (dynamic)
  const epiAccent = !data ? '#94a3b8' : data.epiComplianceRate >= 90 ? '#16a34a' : data.epiComplianceRate >= 75 ? '#f59e0b' : '#dc2626'
  const ddiAccent = !data ? '#94a3b8' : data.avgDdiScore       >= 75 ? '#16a34a' : data.avgDdiScore       >= 60 ? '#f59e0b' : '#dc2626'
  const ddsAccent = !data ? '#94a3b8' : data.ddsAttendanceRate >= 80 ? '#16a34a' : data.ddsAttendanceRate >= 60 ? '#f59e0b' : '#dc2626'

  const updatedAt = data
    ? data.computedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  const selectedSectorData   = data?.sectors.find(s => s.setor === selectedSector) ?? null
  const selectedEmployeeData = data?.employees.find(e => e.id === selectedEmployee) ?? null

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerInner}>
          <div className={s.headerLeft}>
            <div className={s.headerBadge}>🛡️</div>
            <div>
              <div className={s.headerTitle}>Segurança Analytics</div>
              <div className={s.headerSub}>Centro de Comando de Segurança do Trabalho</div>
            </div>
          </div>
          <div className={s.headerControls}>
            <div className={s.periodGroup}>
              {PERIODS.map(p => (
                <button
                  key={p.value}
                  className={period === p.value ? `${s.periodBtn} ${s.periodBtnActive}` : s.periodBtn}
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button className={s.refreshBtn} onClick={() => void load(period, true)} title="Atualizar">
              ↺
            </button>
            {updatedAt && <span className={s.lastUpdated}>Atualizado {updatedAt}</span>}
          </div>
        </div>
      </div>

      {/* ── Critical alert banners ── */}
      {!loading && criticalAlerts.slice(0, 2).map((alert, i) => (
        <div key={i} className={s.alertBanner}>
          <span className={s.alertBannerIcon}>⚠</span>
          <span>{alert.message}</span>
        </div>
      ))}

      {/* ── Body ── */}
      <div className={s.body}>

        {/* Error */}
        {error && (
          <div className={s.errorBox}>
            <span>{error}</span>
            <button onClick={() => void load(period, true)}>Tentar novamente</button>
          </div>
        )}

        {/* KPI Strip */}
        <div className={s.kpiStrip}>
          <KpiCard loading={loading} accent="#dc2626" icon="⚠"
            value={data?.totalIncidents ?? 0} label="Incidentes" sub="no período" />
          <KpiCard loading={loading} accent="#ea580c" icon="🔶"
            value={data?.totalNearMisses ?? 0} label="Quase-Acidentes" sub="notificados" />
          <KpiCard loading={loading} accent="#f59e0b" icon="🔓"
            value={data?.openOccurrences ?? 0} label="Ocorrências Abertas" sub="em investigação" />
          <KpiCard loading={loading} accent={ddiAccent} icon="📋"
            value={data?.avgDdiScore ?? 0} label="Média DDI" sub="inspeção de segurança" unit=" pts" />
          <KpiCard loading={loading} accent={epiAccent} icon="🦺"
            value={data?.epiComplianceRate ?? 0} label="Conformidade EPI" sub="colaboradores ativos" unit="%" />
          <KpiCard loading={loading} accent={ddsAccent} icon="👥"
            value={data?.ddsAttendanceRate ?? 0} label="Participação DDS" sub="taxa de presença" unit="%" />
        </div>

        {/* Main row */}
        <div className={s.mainRow}>

          {/* Sector risk ranking */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>Risco por Setor</span>
              {data && <span className={s.panelBadge}>{data.sectors.length}</span>}
            </div>
            <div className={s.searchBar}>
              <input
                className={s.searchInput}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filtrar setor…"
              />
              {search && (
                <span className={s.searchCount}>{filteredSectors.length} resultado(s)</span>
              )}
            </div>
            <div className={s.rankTable}>
              {/* Header */}
              <div className={`${s.rankRow} ${s.rankRowHeader}`}>
                <span className={s.rankNum}>#</span>
                <span className={s.rankName}>Setor</span>
                <span className={s.rankMid}>Incid.</span>
                <span className={s.rankMid}>DDI</span>
                <span className={s.rankMid}>EPI</span>
                <span className={s.rankRight}>Risco</span>
                <span className={s.rankRight}>Tend.</span>
              </div>

              {loading && Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={s.skeletonRow}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <div key={j} className={s.skeletonCell} />
                  ))}
                </div>
              ))}

              {!loading && filteredSectors.length === 0 && (
                <div className={s.emptyState}>
                  <div className={s.emptyIcon}>🏭</div>
                  <div className={s.emptyText}>Nenhum setor com dados no período</div>
                  <div className={s.emptyHint}>Registre DDS, DDI ou ocorrências para visualizar a análise de risco</div>
                </div>
              )}

              {!loading && filteredSectors.map((sec, i) => (
                <div
                  key={sec.setor}
                  className={selectedSector === sec.setor
                    ? `${s.rankRow} ${s.rankRowActive}`
                    : s.rankRow}
                  onClick={() => {
                    setSelectedEmployee(null)
                    setSelectedSector(prev => prev === sec.setor ? null : sec.setor)
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setSelectedSector(prev => prev === sec.setor ? null : sec.setor)}
                >
                  <span className={s.rankNum}>{i + 1}</span>
                  <span className={s.rankName}>{sec.setor}</span>
                  <span className={s.rankMid} style={{ color: sec.incidents > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                    {sec.incidents}
                  </span>
                  <span className={s.rankMid}>
                    <ScoreBar score={sec.avgDdiScore} />
                  </span>
                  <span className={s.rankMid} style={{ fontSize: '0.75rem', color: sec.epiNonCompliance > 30 ? '#dc2626' : '#64748b' }}>
                    {sec.epiNonCompliance}% irreg.
                  </span>
                  <span className={s.rankRight}><RiskBadge level={sec.riskLevel} /></span>
                  <span className={s.rankRight}>
                    <TrendChip trend={sec.trend} delta={sec.trendDelta} />
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right column: radar + alerts */}
          <div className={s.rightCol}>
            <div className={s.panel}>
              <div className={s.panelHeader}>
                <span className={s.panelTitle}>Perfil de Segurança</span>
                {data && (
                  <span className={s.overallBadge} style={{
                    background: RISK_BG[data.overallRiskLevel],
                    color:      RISK_COLORS[data.overallRiskLevel],
                  }}>
                    Risco {RISK_LABELS[data.overallRiskLevel]}
                  </span>
                )}
              </div>
              <div className={s.panelBody}>
                <SafetyRadar data={data?.radarData ?? []} />
              </div>
            </div>

            <div className={s.panel}>
              <div className={s.panelHeader}>
                <span className={s.panelTitle}>Alertas</span>
                {allAlerts.length > 0 && (
                  <span className={s.alertCount} data-critical={criticalAlerts.length > 0}>
                    {allAlerts.length}
                  </span>
                )}
              </div>
              <div className={s.alertList}>
                {loading && Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className={s.skeletonRow}>
                    <div className={s.skeletonCell} style={{ height: 48 }} />
                  </div>
                ))}
                {!loading && allAlerts.length === 0 && (
                  <div className={s.alertEmpty}>
                    <span>✓</span> Nenhum alerta ativo no período
                  </div>
                )}
                {!loading && allAlerts.map((alert, i) => (
                  <div key={i} className={`${s.alertItem} ${alert.severity === 'critical' ? s.alertItemCritical : s.alertItemWarning}`}>
                    <span className={s.alertDot} style={{
                      background: alert.severity === 'critical' ? '#dc2626' : '#f59e0b',
                    }} />
                    <div className={s.alertBody}>
                      <div className={s.alertMsg}>{alert.message}</div>
                      <div className={`${s.alertSev} ${alert.severity === 'critical' ? s.alertSevCritical : s.alertSevWarning}`}>
                        {alert.severity === 'critical' ? 'CRÍTICO' : 'ATENÇÃO'}
                        {alert.setor && ` · ${alert.setor}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sector drill-down */}
        {selectedSectorData && (
          <SectorDrillDown sector={selectedSectorData} onClose={() => setSelectedSector(null)} />
        )}

        {/* Charts row */}
        <div className={s.chartsRow}>
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>Tendência de Incidentes</span>
              <span className={s.chartLegend}>
                <span className={s.legendDot} style={{ background: '#dc2626' }} />Incidentes
                <span className={s.legendDot} style={{ background: '#ea580c', marginLeft: 10 }} />Quase-Acid.
              </span>
            </div>
            <div className={s.panelBody}>
              <IncidentTrendChart data={data?.monthlyTrend ?? []} />
            </div>
          </div>
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>Tipos de Ocorrência</span>
            </div>
            <div className={s.panelBody}>
              <IncidentTypeChart data={data?.byType ?? []} />
              <div className={s.pieLegend}>
                {(data?.byType ?? []).map(t => (
                  <span key={t.type} className={s.pieLegendItem}>
                    <span className={s.legendDot} style={{ background: t.color }} />
                    {t.label} ({t.count})
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>Distribuição por Severidade</span>
            </div>
            <div className={s.panelBody}>
              <SeverityChart data={data?.bySeverity ?? []} />
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className={s.bottomRow}>

          {/* Employee risk ranking */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>Colaboradores em Risco</span>
              {data && <span className={s.panelBadge}>{data.employees.filter(e => e.riskLevel === 'critico' || e.riskLevel === 'alto').length} at. risco</span>}
            </div>
            <div className={s.searchBar}>
              <input
                className={s.searchInput}
                value={empSearch}
                onChange={e => setEmpSearch(e.target.value)}
                placeholder="Buscar colaborador…"
              />
            </div>
            <div className={s.rankTable}>
              <div className={`${s.rankRow} ${s.rankRowHeader}`}>
                <span className={s.rankNum}>#</span>
                <span className={s.rankName}>Colaborador</span>
                <span className={s.rankMid}>EPI</span>
                <span className={s.rankMid}>Incid.</span>
                <span className={s.rankMid}>DDS</span>
                <span className={s.rankRight}>Risco</span>
              </div>

              {loading && Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={s.skeletonRow}>
                  {Array.from({ length: 6 }).map((_, j) => <div key={j} className={s.skeletonCell} />)}
                </div>
              ))}

              {!loading && filteredEmployees.length === 0 && (
                <div className={s.emptyState}>
                  <div className={s.emptyIcon}>👤</div>
                  <div className={s.emptyText}>Nenhum colaborador com ficha de EPI</div>
                </div>
              )}

              {!loading && filteredEmployees.map((emp, i) => (
                <div
                  key={emp.id}
                  className={selectedEmployee === emp.id
                    ? `${s.rankRow} ${s.rankRowActive}`
                    : s.rankRow}
                  onClick={() => {
                    setSelectedSector(null)
                    setSelectedEmployee(prev => prev === emp.id ? null : emp.id)
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setSelectedEmployee(prev => prev === emp.id ? null : emp.id)}
                >
                  <span className={s.rankNum}>{i + 1}</span>
                  <div className={s.rankName}>
                    <span className={s.rankNameMain}>{emp.nome}</span>
                    <span className={s.rankNameSub}>{emp.setor}</span>
                  </div>
                  <span className={s.rankMid} style={{ color: EPI_STATUS_COLORS[emp.epiStatus] ?? '#64748b', fontWeight: 600, fontSize: '0.72rem' }}>
                    {EPI_STATUS_LABELS[emp.epiStatus] ?? emp.epiStatus}
                  </span>
                  <span className={s.rankMid} style={{ color: emp.incidentCount > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                    {emp.incidentCount}
                  </span>
                  <span className={s.rankMid} style={{ fontSize: '0.75rem', color: emp.ddsRate < 60 ? '#ea580c' : '#64748b' }}>
                    {emp.ddsRate}%
                  </span>
                  <span className={s.rankRight}><RiskBadge level={emp.riskLevel} /></span>
                </div>
              ))}
            </div>
          </div>

          {/* DDS / DDI effectiveness */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>Atividade DDS / DDI por Mês</span>
              <span className={s.chartLegend}>
                <span className={s.legendDot} style={{ background: '#166534' }} />DDS
                <span className={s.legendDot} style={{ background: '#ea580c', marginLeft: 10 }} />DDI score médio
              </span>
            </div>
            <div className={s.panelBody}>
              <DdsEffectivenessChart data={data?.monthlyTrend ?? []} />
            </div>
            {data && (
              <div className={s.ddsStats}>
                <div className={s.ddsStatItem}>
                  <span className={s.ddsStatValue}>{data.totalDds}</span>
                  <span className={s.ddsStatLabel}>DDS realizados</span>
                </div>
                <div className={s.ddsStatItem}>
                  <span className={s.ddsStatValue}>{data.totalDdi}</span>
                  <span className={s.ddsStatLabel}>Inspeções DDI</span>
                </div>
                <div className={s.ddsStatItem}>
                  <span className={s.ddsStatValue} style={{ color: ddiAccent }}>{data.avgDdiScore}</span>
                  <span className={s.ddsStatLabel}>Score médio DDI</span>
                </div>
                <div className={s.ddsStatItem}>
                  <span className={s.ddsStatValue} style={{ color: ddsAccent }}>{data.ddsAttendanceRate}%</span>
                  <span className={s.ddsStatLabel}>Taxa presença DDS</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Employee drill-down */}
        {selectedEmployeeData && (
          <EmployeeDrillDown employee={selectedEmployeeData} onClose={() => setSelectedEmployee(null)} />
        )}

      </div>
    </div>
  )
}

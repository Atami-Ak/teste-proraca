// src/pages/dashboard/colaboradores/EmployeesAnalyticsPage.tsx
// Employees Analytics — Performance Intelligence System. Read-only.

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  BarChart, Bar, Cell,
  PieChart, Pie,
  LineChart, Line,
  XAxis, YAxis, Tooltip,
} from 'recharts'

import { fetchEmployeesAnalytics, clearEmployeesAnalyticsCache } from '@/lib/db-employees-analytics'
import type {
  EmployeesPeriod, EmployeesAnalyticsData, EmployeeMetrics, SectorEmployeeMetrics,
} from '@/types/employees-analytics'
import {
  PERFORMANCE_COLORS, PERFORMANCE_BG, PERFORMANCE_LABELS,
  TREND_ICON, TREND_COLOR, CRITERIA_LABELS,
  scoreColorEmp,
} from '@/types/employees-analytics'

import s from './EmployeesAnalyticsPage.module.css'

const PERIODS: { value: EmployeesPeriod; label: string }[] = [
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: '6m',  label: '6 meses' },
  { value: '1a',  label: '1 ano'   },
]

// ── Sub-components ────────────────────────────────────────────

function KpiCard({
  loading, accent, icon, value, label, sub, unit,
}: {
  loading: boolean; accent: string; icon: string
  value: number; label: string; sub?: string; unit?: string
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
      {sub && <div className={s.kpiSub}>{sub}</div>}
    </div>
  )
}

function PerformanceBadge({ level }: { level: string }) {
  const l = level as keyof typeof PERFORMANCE_COLORS
  return (
    <span className={s.perfBadge}
      style={{ color: PERFORMANCE_COLORS[l] ?? '#64748b', background: PERFORMANCE_BG[l] ?? '#f8fafc' }}
    >
      {PERFORMANCE_LABELS[l] ?? level}
    </span>
  )
}

function TrendChip({ trend, delta }: { trend: string; delta: number }) {
  type T = keyof typeof TREND_ICON
  const icon  = TREND_ICON[trend as T] ?? '—'
  const color = TREND_COLOR[trend as T] ?? '#94a3b8'
  return <span className={s.trendChip} style={{ color }}>{icon}{Math.abs(delta) > 0 ? ` ${Math.abs(delta)}` : ''}</span>
}

function ScoreBar({ score, color }: { score: number; color?: string }) {
  const c = color ?? scoreColorEmp(score)
  return (
    <div className={s.scoreBar}>
      <div className={s.scoreBarTrack}>
        <div className={s.scoreBarFill} style={{ width: `${Math.min(score, 100)}%`, background: c }} />
      </div>
      <span className={s.scoreNum} style={{ color: c }}>{score}</span>
    </div>
  )
}

// ── Charts ────────────────────────────────────────────────────

function PerformanceDistChart({ data }: { data: EmployeesAnalyticsData['byPerformanceLevel'] }) {
  if (!data.length) return <div className={s.emptyChart}>Sem dados</div>
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="label" cx="50%" cy="50%"
          innerRadius={52} outerRadius={80} paddingAngle={3}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v, name) => [v, String(name)]} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function TrendChart({ data }: { data: EmployeesAnalyticsData['monthlyTrend'] }) {
  if (!data.length) return <div className={s.emptyChart}>Sem dados no período</div>
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v) => [v, 'Score médio']} />
        <Line type="monotone" dataKey="avgScore" stroke="#166534" strokeWidth={2.5} dot={{ r: 3, fill: '#166534' }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function CriteriaChart({ data }: { data: EmployeesAnalyticsData['criteriaAverages'] }) {
  if (!data.length) return <div className={s.emptyChart}>Sem avaliações no período</div>
  const radarData = data.map(c => ({ subject: CRITERIA_LABELS[c.key] ?? c.key, score: c.avg, fullMark: 100 }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={radarData} margin={{ top: 12, right: 30, bottom: 12, left: 30 }}>
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: '#64748b' }} />
        <Radar name="Média" dataKey="score" stroke="#166534" fill="#166534" fillOpacity={0.18} strokeWidth={2} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v) => [`${v}/100`, 'Média']} />
      </RadarChart>
    </ResponsiveContainer>
  )
}

function SectorChart({ data }: { data: SectorEmployeeMetrics[] }) {
  if (!data.length) return <div className={s.emptyChart}>Sem setores</div>
  const chartData = data.slice(0, 8).map(s => ({ name: s.setor, score: s.avgScore, color: scoreColorEmp(s.avgScore) }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v) => [v, 'Score médio']} />
        <Bar dataKey="score" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#64748b' }}>
          {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Employee drill-down ────────────────────────────────────────

function EmployeeDrillDown({ emp, onClose }: { emp: EmployeeMetrics; onClose: () => void }) {
  const color = scoreColorEmp(emp.scorePerformance)
  return (
    <div className={s.drillDown}>
      <div className={s.drillHeader}>
        <div>
          <div className={s.drillTitle}>{emp.nome}</div>
          <div className={s.drillSub}>{emp.cargo} · {emp.setor} · Mat. {emp.matricula || '—'}</div>
        </div>
        <button className={s.drillClose} onClick={onClose}>✕</button>
      </div>
      <div className={s.drillBody}>
        {/* KPI grid */}
        <div className={s.drillKpiGrid}>
          {[
            { label: 'Performance',  value: emp.scorePerformance, unit: '', color },
            { label: 'Avaliações',   value: emp.totalEvaluacoes,  unit: '', color: '#3b82f6' },
            { label: 'Avisos',       value: emp.totalAvisos,      unit: '', color: emp.totalAvisos > 0 ? '#dc2626' : '#16a34a' },
            { label: 'Reconhec.',    value: emp.totalReconhecimentos, unit: '', color: '#166534' },
            { label: 'Incidentes',   value: emp.totalIncidentesSeg, unit: '', color: emp.totalIncidentesSeg > 0 ? '#ea580c' : '#16a34a' },
            { label: 'Pres. DDS',   value: emp.totalDDSPresencas,  unit: '', color: emp.totalDDSPresencas > 0 ? '#166534' : '#ea580c' },
          ].map(kpi => (
            <div key={kpi.label} className={s.drillKpiItem}>
              <div className={s.drillKpiValue} style={{ color: kpi.color }}>{kpi.value}{kpi.unit}</div>
              <div className={s.drillKpiLabel}>{kpi.label}</div>
            </div>
          ))}
        </div>

        <div className={s.drillSection}>
          <div className={s.drillSectionTitle}>Score de Performance</div>
          <div className={s.drillScoreRow}>
            <ScoreBar score={emp.scorePerformance} color={color} />
            <PerformanceBadge level={emp.performanceLevel} />
          </div>
        </div>

        {emp.trend !== 'no_data' && (
          <div className={s.drillSection}>
            <div className={s.drillSectionTitle}>Tendência no Período</div>
            <div className={s.drillTrendRow}>
              <TrendChip trend={emp.trend} delta={emp.trendDelta} />
              <span className={s.drillTrendLabel}>
                {emp.trendDelta === 0
                  ? 'Estável no período'
                  : emp.trendDelta > 0
                    ? `Score subiu ${emp.trendDelta} pts nas avaliações do período`
                    : `Score caiu ${Math.abs(emp.trendDelta)} pts nas avaliações do período`}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function EmployeesAnalyticsPage() {
  const [period,   setPeriod]   = useState<EmployeesPeriod>('90d')
  const [data,     setData]     = useState<EmployeesAnalyticsData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async (p: EmployeesPeriod, force = false) => {
    setLoading(true); setError(null)
    try {
      if (force) clearEmployeesAnalyticsCache()
      setData(await fetchEmployeesAnalytics(p, force))
    } catch (e) {
      console.error(e)
      setError('Erro ao carregar dados. Verifique a conexão e tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { setSelected(null); setSearch(''); void load(period) }, [period, load])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return q
      ? data.employees.filter(e =>
          e.nome.toLowerCase().includes(q) ||
          e.setor.toLowerCase().includes(q) ||
          e.matricula.toLowerCase().includes(q) ||
          e.cargo.toLowerCase().includes(q),
        )
      : data.employees
  }, [data, search])

  const selectedEmp = data?.employees.find(e => e.id === selected) ?? null
  const critAlerts  = data?.alerts.filter(a => a.severity === 'critical') ?? []

  const scoreAccent = !data ? '#94a3b8' : data.avgPerformanceScore >= 75 ? '#16a34a' : data.avgPerformanceScore >= 60 ? '#f59e0b' : '#dc2626'
  const updatedAt   = data ? data.computedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null

  return (
    <div className={s.page}>

      {/* Header */}
      <div className={s.header}>
        <div className={s.headerInner}>
          <div className={s.headerLeft}>
            <div className={s.headerBadge}>👥</div>
            <div>
              <div className={s.headerTitle}>Colaboradores Analytics</div>
              <div className={s.headerSub}>Sistema de Inteligência de Desempenho</div>
            </div>
          </div>
          <div className={s.headerControls}>
            <div className={s.periodGroup}>
              {PERIODS.map(p => (
                <button key={p.value}
                  className={period === p.value ? `${s.periodBtn} ${s.periodBtnActive}` : s.periodBtn}
                  onClick={() => setPeriod(p.value)}>{p.label}</button>
              ))}
            </div>
            <button className={s.refreshBtn} onClick={() => void load(period, true)}>↺</button>
            {updatedAt && <span className={s.lastUpdated}>Atualizado {updatedAt}</span>}
          </div>
        </div>
      </div>

      {/* Critical alert banners */}
      {!loading && critAlerts.slice(0, 2).map((a, i) => (
        <div key={i} className={s.alertBanner}><span className={s.alertBannerIcon}>⚠</span><span>{a.message}</span></div>
      ))}

      <div className={s.body}>
        {error && (
          <div className={s.errorBox}>
            <span>{error}</span>
            <button onClick={() => void load(period, true)}>Tentar novamente</button>
          </div>
        )}

        {/* KPI Strip */}
        <div className={s.kpiStrip}>
          <KpiCard loading={loading} accent="#166534" icon="👤" value={data?.totalActive ?? 0}    label="Colaboradores Ativos" />
          <KpiCard loading={loading} accent={scoreAccent} icon="⭐" value={data?.avgPerformanceScore ?? 0} label="Score Médio"       unit=" pts" />
          <KpiCard loading={loading} accent="#16a34a"  icon="🏆" value={data?.topPerformersCount ?? 0} label="Alta Performance"   sub="score ≥ 75" />
          <KpiCard loading={loading} accent="#dc2626"  icon="⚠"  value={data?.lowPerformersCount ?? 0} label="Baixa Performance"  sub="score < 60" />
          <KpiCard loading={loading} accent="#ea580c"  icon="📋" value={data?.totalWarningsPeriod ?? 0}    label="Avisos no Período" />
          <KpiCard loading={loading} accent="#f59e0b"  icon="🌟" value={data?.totalRecognitionsPeriod ?? 0} label="Reconhecimentos"   sub="no período" />
        </div>

        {/* Main row */}
        <div className={s.mainRow}>
          {/* Employee ranking */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>Ranking de Colaboradores</span>
              {data && <span className={s.panelBadge}>{data.employees.length}</span>}
            </div>
            <div className={s.searchBar}>
              <input className={s.searchInput} value={search}
                onChange={e => setSearch(e.target.value)} placeholder="Buscar nome, setor, matrícula…" />
              {search && <span className={s.searchCount}>{filtered.length} resultado(s)</span>}
            </div>
            <div className={s.rankTable}>
              <div className={`${s.rankRow} ${s.rankRowHeader}`}>
                <span className={s.rankNum}>#</span>
                <span className={s.rankName}>Colaborador</span>
                <span className={s.rankMid}>Score</span>
                <span className={s.rankMid}>Avisos</span>
                <span className={s.rankMid}>Incid.</span>
                <span className={s.rankRight}>Nível</span>
                <span className={s.rankRight}>Tend.</span>
              </div>

              {loading && Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={s.skeletonRow}>
                  {Array.from({ length: 7 }).map((_, j) => <div key={j} className={s.skeletonCell} />)}
                </div>
              ))}

              {!loading && filtered.length === 0 && (
                <div className={s.emptyState}>
                  <div className={s.emptyIcon}>👤</div>
                  <div className={s.emptyText}>Nenhum colaborador encontrado</div>
                </div>
              )}

              {!loading && filtered.map((emp, i) => (
                <div key={emp.id}
                  className={selected === emp.id ? `${s.rankRow} ${s.rankRowActive}` : s.rankRow}
                  onClick={() => setSelected(p => p === emp.id ? null : emp.id)}
                  role="button" tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setSelected(p => p === emp.id ? null : emp.id)}
                >
                  <span className={s.rankNum}>{i + 1}</span>
                  <div className={s.rankName}>
                    <span className={s.rankNameMain}>{emp.nome}</span>
                    <span className={s.rankNameSub}>{emp.cargo} · {emp.setor}</span>
                  </div>
                  <span className={s.rankMid}><ScoreBar score={emp.scorePerformance} /></span>
                  <span className={s.rankMid} style={{ color: emp.totalAvisos > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                    {emp.totalAvisos}
                  </span>
                  <span className={s.rankMid} style={{ color: emp.totalIncidentesSeg > 0 ? '#ea580c' : '#16a34a', fontWeight: 700 }}>
                    {emp.totalIncidentesSeg}
                  </span>
                  <span className={s.rankRight}><PerformanceBadge level={emp.performanceLevel} /></span>
                  <span className={s.rankRight}><TrendChip trend={emp.trend} delta={emp.trendDelta} /></span>
                </div>
              ))}
            </div>
          </div>

          {/* Right column */}
          <div className={s.rightCol}>
            <div className={s.panel}>
              <div className={s.panelHeader}><span className={s.panelTitle}>Distribuição por Nível</span></div>
              <div className={s.panelBody}>
                <PerformanceDistChart data={data?.byPerformanceLevel ?? []} />
                <div className={s.distLegend}>
                  {(data?.byPerformanceLevel ?? []).map(d => (
                    <span key={d.level} className={s.distItem}>
                      <span className={s.distDot} style={{ background: d.color }} />
                      {d.label} ({d.count})
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className={s.panel}>
              <div className={s.panelHeader}><span className={s.panelTitle}>Alertas</span>
                {(data?.alerts.length ?? 0) > 0 && (
                  <span className={s.alertCount}>{data!.alerts.length}</span>
                )}
              </div>
              <div className={s.alertList}>
                {loading && Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className={s.skeletonRow}><div className={s.skeletonCell} style={{ height: 44 }} /></div>
                ))}
                {!loading && (data?.alerts ?? []).length === 0 && (
                  <div className={s.alertEmpty}>✓ Nenhum alerta no período</div>
                )}
                {!loading && (data?.alerts ?? []).map((a, i) => (
                  <div key={i} className={`${s.alertItem} ${a.severity === 'critical' ? s.alertItemCritical : s.alertItemWarning}`}>
                    <span className={s.alertDot} style={{ background: a.severity === 'critical' ? '#dc2626' : '#f59e0b' }} />
                    <div className={s.alertBody}>
                      <div className={s.alertMsg}>{a.message}</div>
                      <div className={`${s.alertSev} ${a.severity === 'critical' ? s.alertSevCritical : s.alertSevWarning}`}>
                        {a.severity === 'critical' ? 'CRÍTICO' : 'ATENÇÃO'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Employee drill-down */}
        {selectedEmp && <EmployeeDrillDown emp={selectedEmp} onClose={() => setSelected(null)} />}

        {/* Charts row */}
        <div className={s.chartsRow}>
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>Evolução do Score Médio</span>
            </div>
            <div className={s.panelBody}><TrendChart data={data?.monthlyTrend ?? []} /></div>
          </div>
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>Critérios de Avaliação (média)</span>
              <span className={s.panelBadgeSm}>{data?.criteriaAverages[0]?.avg ? 'radar' : 'sem dados'}</span>
            </div>
            <div className={s.panelBody}><CriteriaChart data={data?.criteriaAverages ?? []} /></div>
          </div>
          <div className={s.panel}>
            <div className={s.panelHeader}><span className={s.panelTitle}>Score por Setor</span></div>
            <div className={s.panelBody}><SectorChart data={data?.sectors ?? []} /></div>
          </div>
        </div>

        {/* Sector ranking */}
        <div className={s.panel}>
          <div className={s.panelHeader}>
            <span className={s.panelTitle}>Ranking por Setor</span>
            {data && <span className={s.panelBadge}>{data.sectors.length} setores</span>}
          </div>
          <div className={s.rankTable}>
            <div className={`${s.rankRow} ${s.rankRowHeader} ${s.sectorHeader}`}>
              <span className={s.rankNum}>#</span>
              <span className={s.rankName}>Setor</span>
              <span className={s.rankMid}>Colabor.</span>
              <span className={s.rankMid}>Score Médio</span>
              <span className={s.rankMid}>Top Perf.</span>
              <span className={s.rankMid}>Baixo Perf.</span>
              <span className={s.rankMid}>Avisos</span>
              <span className={s.rankMid}>Incidentes</span>
              <span className={s.rankRight}>Nível</span>
            </div>
            {!loading && (data?.sectors ?? []).map((sec, i) => (
              <div key={sec.setor} className={`${s.rankRow} ${s.sectorRow}`}>
                <span className={s.rankNum}>{i + 1}</span>
                <span className={s.rankName} style={{ fontWeight: 600 }}>{sec.setor}</span>
                <span className={s.rankMid}>{sec.employeeCount}</span>
                <span className={s.rankMid}><ScoreBar score={sec.avgScore} /></span>
                <span className={s.rankMid} style={{ color: '#16a34a', fontWeight: 700 }}>{sec.topPerformers}</span>
                <span className={s.rankMid} style={{ color: sec.lowPerformers > 0 ? '#dc2626' : '#94a3b8', fontWeight: 700 }}>{sec.lowPerformers}</span>
                <span className={s.rankMid} style={{ color: sec.periodWarnings > 0 ? '#ea580c' : '#94a3b8' }}>{sec.periodWarnings}</span>
                <span className={s.rankMid} style={{ color: sec.totalIncidents > 0 ? '#ea580c' : '#94a3b8' }}>{sec.totalIncidents}</span>
                <span className={s.rankRight}><PerformanceBadge level={sec.performanceLevel} /></span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

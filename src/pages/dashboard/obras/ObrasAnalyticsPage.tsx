// src/pages/dashboard/obras/ObrasAnalyticsPage.tsx
// Works & Contractors Analytics — Project & Contractor Control Center. Read-only.

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar, Cell,
  PieChart, Pie,
  LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, Tooltip,
} from 'recharts'

import { fetchObrasAnalytics, clearObrasAnalyticsCache } from '@/lib/db-obras-analytics'
import type {
  ObrasPeriod, ObrasAnalyticsData, ObraMetrics, EmpreiteiraMetrics,
} from '@/types/obras-analytics'
import {
  OBRAS_RISK_COLORS, OBRAS_RISK_BG, OBRAS_RISK_LABELS,
  OBRA_STATUS_LABELS, OBRA_STATUS_COLORS,
  EMPREITEIRA_STATUS_LABELS, EMPREITEIRA_STATUS_COLORS,
  qualityColor,
} from '@/types/obras-analytics'

import s from './ObrasAnalyticsPage.module.css'

const PERIODS: { value: ObrasPeriod; label: string }[] = [
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: '6m',  label: '6 meses' },
  { value: '1a',  label: '1 ano'   },
]

const fmtCurrency = (v: number | undefined) =>
  v == null ? '—'
  : v >= 1_000_000 ? `R$ ${(v / 1_000_000).toFixed(1)}M`
  : v >= 1_000    ? `R$ ${(v / 1_000).toFixed(0)}K`
  : `R$ ${v.toLocaleString('pt-BR')}`

// ── Sub-components ────────────────────────────────────────────

function KpiCard({
  loading, accent, icon, value, label, sub, raw,
}: {
  loading: boolean; accent: string; icon: string
  value: string | number; label: string; sub?: string; raw?: boolean
}) {
  if (loading) return <div className={s.kpiCard}><div className={s.kpiSkeleton} /></div>
  return (
    <div className={s.kpiCard}>
      <div className={s.kpiAccent} style={{ background: accent }} />
      <div className={s.kpiIcon}>{icon}</div>
      <div className={s.kpiValue}>{raw ? value : (typeof value === 'number' ? value.toLocaleString('pt-BR') : value)}</div>
      <div className={s.kpiLabel}>{label}</div>
      {sub && <div className={s.kpiSub}>{sub}</div>}
    </div>
  )
}

function RiskBadge({ level }: { level: string }) {
  const l = level as keyof typeof OBRAS_RISK_COLORS
  return (
    <span className={s.riskBadge}
      style={{ color: OBRAS_RISK_COLORS[l] ?? '#64748b', background: OBRAS_RISK_BG[l] ?? '#f8fafc' }}>
      {OBRAS_RISK_LABELS[l] ?? level}
    </span>
  )
}

function ScoreBar({ score, max = 100, color }: { score: number; max?: number; color?: string }) {
  const c = color ?? qualityColor(score / (max / 10))
  const pct = Math.min((score / max) * 100, 100)
  return (
    <div className={s.scoreBar}>
      <div className={s.scoreBarTrack}>
        <div className={s.scoreBarFill} style={{ width: `${pct}%`, background: c }} />
      </div>
      <span className={s.scoreNum} style={{ color: c }}>{score}</span>
    </div>
  )
}

// ── Charts ────────────────────────────────────────────────────

function StatusPieChart({ data }: { data: ObrasAnalyticsData['byStatus'] }) {
  if (!data.length) return <div className={s.emptyChart}>Sem obras</div>
  return (
    <ResponsiveContainer width="100%" height={190}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="label" cx="50%" cy="50%"
          innerRadius={48} outerRadius={75} paddingAngle={3}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v, name) => [v, String(name)]} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function QualityTrendChart({ data }: { data: ObrasAnalyticsData['monthlyTrend'] }) {
  if (!data.length) return <div className={s.emptyChart}>Sem inspeções no período</div>
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v) => [v, 'Score médio (0–10)']} />
        <Line type="monotone" dataKey="avgQualityScore" stroke="#166534" strokeWidth={2.5}
          dot={{ r: 3, fill: '#166534' }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function ContractorRadar({ emp }: { emp: EmpreiteiraMetrics }) {
  const radarData = [
    { subject: 'Qualidade',    score: emp.avgQuality },
    { subject: 'Prazo',        score: emp.avgPrazo },
    { subject: 'Segurança',    score: emp.avgSeguranca },
    { subject: 'Custo/Ben.',   score: emp.avgCustoBeneficio },
    { subject: 'Pontualidade', score: emp.delayRate > 0 ? Math.max(0, 100 - emp.delayRate) : 80 },
  ]
  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart data={radarData} margin={{ top: 10, right: 28, bottom: 10, left: 28 }}>
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: '#64748b' }} />
        <Radar dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v) => [`${v}/100`, 'Score']} />
      </RadarChart>
    </ResponsiveContainer>
  )
}

function ContractorComparisonChart({ data }: { data: EmpreiteiraMetrics[] }) {
  if (!data.length) return <div className={s.emptyChart}>Sem empreiteiras</div>
  const chartData = data.slice(0, 8).map(e => ({
    name: e.nome.length > 14 ? e.nome.slice(0, 14) + '…' : e.nome,
    score: e.scoreGlobal,
    color: qualityColor(e.scoreGlobal / 10),
  }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v) => [v, 'Score global']} />
        <Bar dataKey="score" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#64748b' }}>
          {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Drill-down panels ─────────────────────────────────────────

function ObraDrillDown({ obra, onClose }: { obra: ObraMetrics; onClose: () => void }) {
  const qc = qualityColor(obra.notaMedia)
  return (
    <div className={s.drillDown}>
      <div className={s.drillHeader}>
        <div>
          <div className={s.drillTitle}>{obra.codigo} — {obra.nome}</div>
          <div className={s.drillSub}>{obra.tipo} · {obra.local}{obra.empreiteiraNome ? ` · ${obra.empreiteiraNome}` : ''}</div>
        </div>
        <button className={s.drillClose} onClick={onClose}>✕</button>
      </div>
      <div className={s.drillBody}>
        <div className={s.drillKpiGrid}>
          {[
            { label: 'Status',     value: OBRA_STATUS_LABELS[obra.status] ?? obra.status, color: OBRA_STATUS_COLORS[obra.status] ?? '#64748b', raw: true },
            { label: 'Conclusão',  value: `${obra.percentualConcluido}%`, color: obra.percentualConcluido >= 80 ? '#16a34a' : '#f59e0b', raw: true },
            { label: 'Atraso',     value: obra.isDelayed ? `+${obra.delayDays}d` : obra.delayDays < 0 ? `${obra.delayDays}d` : 'No prazo', color: obra.isDelayed ? '#dc2626' : '#16a34a', raw: true },
            { label: 'Nota Média', value: obra.notaMedia > 0 ? `${obra.notaMedia}/10` : '—', color: obra.notaMedia > 0 ? qc : '#94a3b8', raw: true },
            { label: 'Inspeções',  value: String(obra.totalInspecoes), color: '#3b82f6', raw: true },
            { label: 'Alertas',    value: String(obra.alertasCriticos), color: obra.alertasCriticos > 0 ? '#dc2626' : '#16a34a', raw: true },
          ].map(kpi => (
            <div key={kpi.label} className={s.drillKpiItem}>
              <div className={s.drillKpiValue} style={{ color: kpi.color }}>{kpi.value}</div>
              <div className={s.drillKpiLabel}>{kpi.label}</div>
            </div>
          ))}
        </div>

        {(obra.valorContrato || obra.valorPago) && (
          <div className={s.drillSection}>
            <div className={s.drillSectionTitle}>Financeiro</div>
            <div className={s.drillFinRow}>
              <div className={s.drillFinItem}>
                <span className={s.drillFinLabel}>Contrato</span>
                <span className={s.drillFinValue}>{fmtCurrency(obra.valorContrato)}</span>
              </div>
              <div className={s.drillFinItem}>
                <span className={s.drillFinLabel}>Pago</span>
                <span className={s.drillFinValue}>{fmtCurrency(obra.valorPago)}</span>
              </div>
              {obra.costVariancePct !== 0 && (
                <div className={s.drillFinItem}>
                  <span className={s.drillFinLabel}>Variação</span>
                  <span className={s.drillFinValue} style={{ color: obra.costVariancePct > 0 ? '#dc2626' : '#16a34a' }}>
                    {obra.costVariancePct > 0 ? '+' : ''}{obra.costVariancePct}%
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className={s.drillSection}>
          <div className={s.drillSectionTitle}>Risco da Obra</div>
          <div className={s.drillRiskRow}>
            <div className={s.scoreBar} style={{ flex: 1 }}>
              <div className={s.scoreBarTrack}>
                <div className={s.scoreBarFill} style={{ width: `${obra.riskScore}%`, background: OBRAS_RISK_COLORS[obra.riskLevel] }} />
              </div>
              <span className={s.scoreNum} style={{ color: OBRAS_RISK_COLORS[obra.riskLevel] }}>{obra.riskScore}</span>
            </div>
            <RiskBadge level={obra.riskLevel} />
          </div>
        </div>
      </div>
    </div>
  )
}

function ContractorDrillDown({ emp, onClose }: { emp: EmpreiteiraMetrics; onClose: () => void }) {
  return (
    <div className={s.drillDown}>
      <div className={s.drillHeader} style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)' }}>
        <div>
          <div className={s.drillTitle}>{emp.nome}</div>
          <div className={s.drillSub}>
            {EMPREITEIRA_STATUS_LABELS[emp.status] ?? emp.status}
            {emp.cnpj ? ` · CNPJ: ${emp.cnpj}` : ''}
          </div>
        </div>
        <button className={s.drillClose} onClick={onClose}>✕</button>
      </div>
      <div className={s.drillBody}>
        <div className={s.drillKpiGrid}>
          {[
            { label: 'Score Global',  value: `${emp.scoreGlobal}/100`, color: qualityColor(emp.scoreGlobal / 10) },
            { label: 'Total Obras',   value: String(emp.totalObras),   color: '#3b82f6' },
            { label: 'Aprovadas',     value: `${emp.approvalRate}%`,   color: emp.approvalRate >= 70 ? '#16a34a' : '#ea580c' },
            { label: 'Ativas',        value: String(emp.obrasAtivas),  color: '#f59e0b' },
            { label: 'Atrasadas',     value: String(emp.obrasAtrasadas), color: emp.obrasAtrasadas > 0 ? '#dc2626' : '#16a34a' },
            { label: 'Taxa Atraso',   value: `${emp.delayRate}%`,      color: emp.delayRate > 20 ? '#dc2626' : emp.delayRate > 0 ? '#ea580c' : '#16a34a' },
          ].map(kpi => (
            <div key={kpi.label} className={s.drillKpiItem}>
              <div className={s.drillKpiValue} style={{ color: kpi.color }}>{kpi.value}</div>
              <div className={s.drillKpiLabel}>{kpi.label}</div>
            </div>
          ))}
        </div>

        {emp.periodAvaliacoes > 0 && (
          <div className={s.drillSection}>
            <div className={s.drillSectionTitle}>Critérios de Avaliação (período)</div>
            <ContractorRadar emp={emp} />
          </div>
        )}

        {emp.especialidades.length > 0 && (
          <div className={s.drillSection}>
            <div className={s.drillSectionTitle}>Especialidades</div>
            <div className={s.specialties}>
              {emp.especialidades.map((e, i) => (
                <span key={i} className={s.specialtyTag}>{e}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function ObrasAnalyticsPage() {
  const [period,          setPeriod]          = useState<ObrasPeriod>('90d')
  const [data,            setData]            = useState<ObrasAnalyticsData | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState<string | null>(null)
  const [obraSearch,      setObraSearch]      = useState('')
  const [contractorSearch,setContractorSearch]= useState('')
  const [selectedObra,      setSelectedObra]      = useState<string | null>(null)
  const [selectedContractor,setSelectedContractor]= useState<string | null>(null)
  const [activeTab,       setActiveTab]       = useState<'obras' | 'contractors'>('obras')

  const load = useCallback(async (p: ObrasPeriod, force = false) => {
    setLoading(true); setError(null)
    try {
      if (force) clearObrasAnalyticsCache()
      setData(await fetchObrasAnalytics(p, force))
    } catch (e) {
      console.error(e)
      setError('Erro ao carregar dados. Verifique a conexão e tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setSelectedObra(null); setSelectedContractor(null)
    setObraSearch(''); setContractorSearch('')
    void load(period)
  }, [period, load])

  const filteredObras = useMemo(() => {
    if (!data) return []
    const q = obraSearch.trim().toLowerCase()
    return q
      ? data.obras.filter(o =>
          o.nome.toLowerCase().includes(q) ||
          o.codigo.toLowerCase().includes(q) ||
          (o.empreiteiraNome ?? '').toLowerCase().includes(q),
        )
      : data.obras
  }, [data, obraSearch])

  const filteredContractors = useMemo(() => {
    if (!data) return []
    const q = contractorSearch.trim().toLowerCase()
    return q
      ? data.empreiteiras.filter(e =>
          e.nome.toLowerCase().includes(q) ||
          (e.cnpj ?? '').includes(q),
        )
      : data.empreiteiras
  }, [data, contractorSearch])

  const critAlerts  = data?.alerts.filter(a => a.severity === 'critical') ?? []
  const selectedObraData        = data?.obras.find(o => o.id === selectedObra) ?? null
  const selectedContractorData  = data?.empreiteiras.find(e => e.id === selectedContractor) ?? null
  const updatedAt   = data ? data.computedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null

  const qualityAccent = !data ? '#94a3b8'
    : data.avgQualityScore >= 75 ? '#16a34a'
    : data.avgQualityScore >= 55 ? '#f59e0b'
    : '#dc2626'

  return (
    <div className={s.page}>

      {/* Header */}
      <div className={s.header}>
        <div className={s.headerInner}>
          <div className={s.headerLeft}>
            <div className={s.headerBadge}>🏗️</div>
            <div>
              <div className={s.headerTitle}>Obras & Empreiteiras</div>
              <div className={s.headerSub}>Central de Controle de Projetos e Contratados</div>
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

      {/* Critical banners */}
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
          <KpiCard loading={loading} accent="#3b82f6" icon="🏗️" value={data?.totalObras ?? 0}     label="Total de Obras" />
          <KpiCard loading={loading} accent="#f59e0b" icon="⚙️" value={data?.emAndamento ?? 0}    label="Em Andamento" />
          <KpiCard loading={loading} accent="#dc2626" icon="⏰" value={data?.atrasadas ?? 0}       label="Obras Atrasadas" />
          <KpiCard loading={loading} accent={qualityAccent} icon="📊" value={data?.avgQualityScore ?? 0} label="Qualidade Média" sub="score 0–100" />
          <KpiCard loading={loading} accent="#166534" icon="💰"
            value={fmtCurrency(data?.totalContrato)} label="Valor Total Contratos" raw />
          <KpiCard loading={loading} accent="#8b5cf6" icon="🤝" value={data?.totalEmpreiteiras ?? 0} label="Empreiteiras Ativas" />
        </div>

        {/* Tab navigation */}
        <div className={s.tabBar}>
          <button className={activeTab === 'obras' ? `${s.tabBtn} ${s.tabBtnActive}` : s.tabBtn}
            onClick={() => setActiveTab('obras')}>🏗️ Obras ({data?.totalObras ?? 0})</button>
          <button className={activeTab === 'contractors' ? `${s.tabBtn} ${s.tabBtnActive}` : s.tabBtn}
            onClick={() => setActiveTab('contractors')}>🤝 Empreiteiras ({data?.totalEmpreiteiras ?? 0})</button>
        </div>

        {/* Obras tab */}
        {activeTab === 'obras' && (
          <>
            <div className={s.mainRow}>
              {/* Obras ranking */}
              <div className={s.panel}>
                <div className={s.panelHeader}>
                  <span className={s.panelTitle}>Ranking de Obras por Risco</span>
                  {data && <span className={s.panelBadge}>{data.obras.length}</span>}
                </div>
                <div className={s.searchBar}>
                  <input className={s.searchInput} value={obraSearch}
                    onChange={e => setObraSearch(e.target.value)}
                    placeholder="Filtrar por nome, código, empreiteira…" />
                  {obraSearch && <span className={s.searchCount}>{filteredObras.length} resultado(s)</span>}
                </div>
                <div className={s.rankTable}>
                  <div className={`${s.rankRow} ${s.rankRowHeader} ${s.obraHeader}`}>
                    <span className={s.rankNum}>#</span>
                    <span className={s.rankName}>Obra</span>
                    <span className={s.rankMid}>Status</span>
                    <span className={s.rankMid}>Avanço</span>
                    <span className={s.rankMid}>Qualidade</span>
                    <span className={s.rankMid}>Atraso</span>
                    <span className={s.rankRight}>Risco</span>
                  </div>

                  {loading && Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={s.skeletonRow}>
                      {Array.from({ length: 7 }).map((_, j) => <div key={j} className={s.skeletonCell} />)}
                    </div>
                  ))}

                  {!loading && filteredObras.length === 0 && (
                    <div className={s.emptyState}>
                      <div className={s.emptyIcon}>🏗️</div>
                      <div className={s.emptyText}>Nenhuma obra encontrada</div>
                    </div>
                  )}

                  {!loading && filteredObras.map((obra, i) => (
                    <div key={obra.id}
                      className={selectedObra === obra.id ? `${s.rankRow} ${s.obraRow} ${s.rankRowActive}` : `${s.rankRow} ${s.obraRow}`}
                      onClick={() => { setSelectedContractor(null); setSelectedObra(p => p === obra.id ? null : obra.id) }}
                      role="button" tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && setSelectedObra(p => p === obra.id ? null : obra.id)}
                    >
                      <span className={s.rankNum}>{i + 1}</span>
                      <div className={s.rankName}>
                        <span className={s.rankNameMain}>{obra.nome}</span>
                        <span className={s.rankNameSub}>{obra.codigo}{obra.empreiteiraNome ? ` · ${obra.empreiteiraNome}` : ''}</span>
                      </div>
                      <span className={s.rankMid} style={{ fontSize: '0.72rem', fontWeight: 700, color: OBRA_STATUS_COLORS[obra.status] ?? '#64748b' }}>
                        {OBRA_STATUS_LABELS[obra.status] ?? obra.status}
                      </span>
                      <span className={s.rankMid} style={{ fontSize: '0.78rem', fontWeight: 700, color: obra.percentualConcluido >= 80 ? '#16a34a' : '#64748b' }}>
                        {obra.percentualConcluido}%
                      </span>
                      <span className={s.rankMid}>
                        {obra.notaMedia > 0
                          ? <span style={{ color: qualityColor(obra.notaMedia), fontWeight: 700, fontSize: '0.8rem' }}>{obra.notaMedia}/10</span>
                          : <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Sem insp.</span>
                        }
                      </span>
                      <span className={s.rankMid}>
                        {obra.isDelayed
                          ? <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.78rem' }}>+{obra.delayDays}d</span>
                          : <span style={{ color: '#16a34a', fontSize: '0.72rem' }}>No prazo</span>
                        }
                      </span>
                      <span className={s.rankRight}><RiskBadge level={obra.riskLevel} /></span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: pie + alerts */}
              <div className={s.rightCol}>
                <div className={s.panel}>
                  <div className={s.panelHeader}><span className={s.panelTitle}>Obras por Status</span></div>
                  <div className={s.panelBody}>
                    <StatusPieChart data={data?.byStatus ?? []} />
                    <div className={s.distLegend}>
                      {(data?.byStatus ?? []).map(d => (
                        <span key={d.status} className={s.distItem}>
                          <span className={s.distDot} style={{ background: d.color }} />
                          {d.label} ({d.count})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className={s.panel}>
                  <div className={s.panelHeader}>
                    <span className={s.panelTitle}>Alertas</span>
                    {(data?.alerts.length ?? 0) > 0 && <span className={s.alertCount}>{data!.alerts.length}</span>}
                  </div>
                  <div className={s.alertList}>
                    {loading && Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className={s.skeletonRow}><div className={s.skeletonCell} style={{ height: 44 }} /></div>
                    ))}
                    {!loading && (data?.alerts ?? []).length === 0 && <div className={s.alertEmpty}>✓ Nenhum alerta</div>}
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

            {/* Obra drill-down */}
            {selectedObraData && <ObraDrillDown obra={selectedObraData} onClose={() => setSelectedObra(null)} />}

            {/* Quality trend chart */}
            <div className={s.panel}>
              <div className={s.panelHeader}><span className={s.panelTitle}>Qualidade das Inspeções — Tendência</span></div>
              <div className={s.panelBody}><QualityTrendChart data={data?.monthlyTrend ?? []} /></div>
            </div>
          </>
        )}

        {/* Contractors tab */}
        {activeTab === 'contractors' && (
          <>
            <div className={s.mainRow}>
              <div className={s.panel}>
                <div className={s.panelHeader}>
                  <span className={s.panelTitle}>Ranking de Empreiteiras</span>
                  {data && <span className={s.panelBadge}>{data.empreiteiras.length}</span>}
                </div>
                <div className={s.searchBar}>
                  <input className={s.searchInput} value={contractorSearch}
                    onChange={e => setContractorSearch(e.target.value)}
                    placeholder="Buscar empreiteira…" />
                  {contractorSearch && <span className={s.searchCount}>{filteredContractors.length} resultado(s)</span>}
                </div>
                <div className={s.rankTable}>
                  <div className={`${s.rankRow} ${s.rankRowHeader} ${s.contractorHeader}`}>
                    <span className={s.rankNum}>#</span>
                    <span className={s.rankName}>Empreiteira</span>
                    <span className={s.rankMid}>Score</span>
                    <span className={s.rankMid}>Obras</span>
                    <span className={s.rankMid}>Aprovação</span>
                    <span className={s.rankMid}>Atraso</span>
                    <span className={s.rankRight}>Status</span>
                  </div>

                  {loading && Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={s.skeletonRow}>
                      {Array.from({ length: 7 }).map((_, j) => <div key={j} className={s.skeletonCell} />)}
                    </div>
                  ))}

                  {!loading && filteredContractors.length === 0 && (
                    <div className={s.emptyState}>
                      <div className={s.emptyIcon}>🤝</div>
                      <div className={s.emptyText}>Nenhuma empreiteira encontrada</div>
                    </div>
                  )}

                  {!loading && filteredContractors.map((emp, i) => (
                    <div key={emp.id}
                      className={selectedContractor === emp.id ? `${s.rankRow} ${s.contractorRow} ${s.rankRowActive}` : `${s.rankRow} ${s.contractorRow}`}
                      onClick={() => { setSelectedObra(null); setSelectedContractor(p => p === emp.id ? null : emp.id) }}
                      role="button" tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && setSelectedContractor(p => p === emp.id ? null : emp.id)}
                    >
                      <span className={s.rankNum}>{i + 1}</span>
                      <div className={s.rankName}>
                        <span className={s.rankNameMain}>{emp.nome}</span>
                        <span className={s.rankNameSub}>{emp.especialidades.slice(0, 2).join(', ')}</span>
                      </div>
                      <span className={s.rankMid}><ScoreBar score={emp.scoreGlobal} max={100} /></span>
                      <span className={s.rankMid} style={{ fontWeight: 700, fontSize: '0.8rem' }}>{emp.totalObras}</span>
                      <span className={s.rankMid} style={{ color: emp.approvalRate >= 70 ? '#16a34a' : '#ea580c', fontWeight: 700, fontSize: '0.78rem' }}>
                        {emp.approvalRate}%
                      </span>
                      <span className={s.rankMid} style={{ color: emp.delayRate > 20 ? '#dc2626' : emp.delayRate > 0 ? '#ea580c' : '#94a3b8', fontSize: '0.78rem', fontWeight: 700 }}>
                        {emp.delayRate}%
                      </span>
                      <span className={s.rankRight}>
                        <span className={s.statusTag}
                          style={{ color: EMPREITEIRA_STATUS_COLORS[emp.status] ?? '#64748b' }}>
                          {EMPREITEIRA_STATUS_LABELS[emp.status] ?? emp.status}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={s.rightCol}>
                <div className={s.panel}>
                  <div className={s.panelHeader}><span className={s.panelTitle}>Comparativo de Scores</span></div>
                  <div className={s.panelBody}><ContractorComparisonChart data={data?.empreiteiras ?? []} /></div>
                </div>
              </div>
            </div>

            {/* Contractor drill-down */}
            {selectedContractorData && (
              <ContractorDrillDown emp={selectedContractorData} onClose={() => setSelectedContractor(null)} />
            )}
          </>
        )}

      </div>
    </div>
  )
}

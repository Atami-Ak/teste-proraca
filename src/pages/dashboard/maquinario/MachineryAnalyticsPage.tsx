// src/pages/dashboard/maquinario/MachineryAnalyticsPage.tsx

import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react'
import {
  ResponsiveContainer, BarChart, Bar,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell,
} from 'recharts'
import { fetchMachineryAnalytics, clearMachineryCache } from '@/lib/db-machinery-analytics'
import type {
  MachineryAnalyticsData, MachineMetrics, MachineRiskLevel, AnalyticsPeriod,
} from '@/types/machinery-analytics'
import s from './MachineryAnalyticsPage.module.css'

// ── Constants ─────────────────────────────────────────────────

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: '6m',  label: '6 meses' },
  { value: '1a',  label: '1 ano'   },
]

const RISK_COLORS: Record<MachineRiskLevel, string> = {
  low:      '#16a34a',
  medium:   '#f59e0b',
  high:     '#ea580c',
  critical: '#dc2626',
}

const RISK_LABELS: Record<MachineRiskLevel, string> = {
  low: 'Baixo', medium: 'Médio', high: 'Alto', critical: 'Crítico',
}

const STATE_COLOR: Record<string, string> = {
  ok: '#16a34a', warning: '#f59e0b', danger: '#dc2626', unknown: '#94a3b8',
}

// ── Formatters ────────────────────────────────────────────────

const brl = (v: number) =>
  v === 0 ? 'R$ 0' :
  v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` :
  `R$ ${v.toFixed(0)}`

const brlFull = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ── KPI strip card ────────────────────────────────────────────

function KpiCard({
  value, label, sub, accent, loading,
}: {
  value: string | number; label: string; sub?: string;
  accent: string; loading: boolean;
}) {
  if (loading) {
    return (
      <div className={s.kpiCard}>
        <div className={s.kpiAccent} style={{ background: accent }} />
        <div className={s.skeletonCell} style={{ height: 32, width: '60%', marginBottom: 8 }} />
        <div className={s.skeletonCell} style={{ height: 10, width: '80%' }} />
      </div>
    )
  }
  return (
    <div className={s.kpiCard}>
      <div className={s.kpiAccent} style={{ background: accent }} />
      <div className={s.kpiValue}>{value}</div>
      <div className={s.kpiLabel}>{label}</div>
      {sub && <div className={s.kpiSub}>{sub}</div>}
    </div>
  )
}

// ── Risk badge ────────────────────────────────────────────────

function RiskBadge({ level }: { level: MachineRiskLevel }) {
  const cls = level === 'critical' ? s.riskCritical :
              level === 'high'     ? s.riskHigh     :
              level === 'medium'   ? s.riskMedium   : s.riskLow
  return <span className={`${s.riskBadge} ${cls}`}>{RISK_LABELS[level]}</span>
}

// ── Score bar ─────────────────────────────────────────────────

function ScoreBar({ score, level }: { score: number; level: MachineRiskLevel }) {
  return (
    <div className={s.scoreBar}>
      <div className={s.scoreBarTrack}>
        <div
          className={s.scoreBarFill}
          style={{ width: `${score}%`, background: RISK_COLORS[level] } as CSSProperties}
        />
      </div>
      <span className={s.scoreNum} style={{ color: RISK_COLORS[level] }}>{score}</span>
    </div>
  )
}

// ── Machine ranking table ─────────────────────────────────────

function MachineRanking({
  machines, query: q, selected, onSelect,
}: {
  machines: MachineMetrics[]
  query:    string
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const filtered = useMemo(() => {
    if (!q.trim()) return machines
    const lower = q.toLowerCase()
    return machines.filter(m =>
      m.name.toLowerCase().includes(lower) ||
      m.code.toLowerCase().includes(lower) ||
      m.location.toLowerCase().includes(lower)
    )
  }, [machines, q])

  if (machines.length === 0) {
    return (
      <div className={s.emptyState}>
        <div className={s.emptyIcon}>⚙️</div>
        <div className={s.emptyText}>Nenhuma máquina encontrada no período.</div>
      </div>
    )
  }

  return (
    <table className={s.rankTable}>
      <thead>
        <tr>
          <th>#</th>
          <th>Máquina</th>
          <th>Status</th>
          <th>Falhas</th>
          <th>OS</th>
          <th>Custo</th>
          <th>Score de Risco</th>
        </tr>
      </thead>
      <tbody>
        {filtered.slice(0, 20).map((m, i) => (
          <tr
            key={m.assetId}
            className={`${s.rankRow} ${selected === m.assetId ? s.rankRowActive : ''}`}
            onClick={() => onSelect(selected === m.assetId ? null : m.assetId)}
          >
            <td><span className={s.rankNum}>{i + 1}</span></td>
            <td>
              <div className={s.rankName}>{m.name}</div>
              <div className={s.rankCode}>{m.code}{m.location ? ` · ${m.location}` : ''}</div>
            </td>
            <td>
              <span className={s.stateDot} style={{ background: STATE_COLOR[m.currentState] }} />
              <RiskBadge level={m.riskLevel} />
            </td>
            <td style={{ textAlign: 'center' }}>
              <span style={{ fontWeight: 700, color: m.corrCount > 0 ? '#dc2626' : '#16a34a' }}>
                {m.corrCount}
              </span>
            </td>
            <td style={{ textAlign: 'center' }}>
              <span style={{ fontWeight: 700 }}>{m.osTotal}</span>
              {m.osOpen > 0 && (
                <span style={{ fontSize: '0.65rem', color: '#ea580c', marginLeft: 4 }}>
                  ({m.osOpen} aberta{m.osOpen > 1 ? 's' : ''})
                </span>
              )}
            </td>
            <td>
              <div className={s.rankCost}>{brl(m.totalCost)}</div>
              {m.overdueCount > 0 && (
                <div className={s.rankCostSub} style={{ color: '#ea580c' }}>
                  {m.overdueCount} atrasada{m.overdueCount > 1 ? 's' : ''}
                </div>
              )}
            </td>
            <td style={{ minWidth: 120 }}>
              <ScoreBar score={m.riskScore} level={m.riskLevel} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Cost trend chart ──────────────────────────────────────────

function CostTrendChart({ data }: { data: MachineryAnalyticsData['globalCostByMonth'] }) {
  if (data.length === 0) {
    return <div className={s.emptyState}><div className={s.emptyText}>Sem dados de custo no período.</div></div>
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#ea580c" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#ea580c" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44}
          tickFormatter={(v: number) => brl(v)} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v) => [brlFull(Number(v)), 'Custo total']}
        />
        <Area type="monotone" dataKey="cost" stroke="#ea580c" fill="url(#costGrad)"
          strokeWidth={2} dot={false} name="Custo" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Maintenance type distribution ─────────────────────────────

function MaintenanceDistribution({ machines }: { machines: MachineMetrics[] }) {
  const prev  = machines.reduce((s, m) => s + m.prevCount, 0)
  const corr  = machines.reduce((s, m) => s + m.corrCount, 0)
  const insp  = machines.reduce((s, m) => s + m.inspCount, 0)
  const total = prev + corr + insp || 1

  const pieData = [
    { name: 'Preventiva', value: prev,  color: '#16a34a' },
    { name: 'Corretiva',  value: corr,  color: '#dc2626' },
    { name: 'Inspeção',   value: insp,  color: '#3b82f6' },
  ].filter(d => d.value > 0)

  const pct = (n: number) => total > 1 ? Math.round((n / total) * 100) : 0

  if (total <= 1) {
    return <div className={s.emptyState} style={{ padding: '32px 20px' }}><div className={s.emptyText}>Sem manutenções registradas.</div></div>
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <PieChart width={120} height={120}>
          <Pie data={pieData} cx={55} cy={55} innerRadius={32} outerRadius={52}
            dataKey="value" strokeWidth={0}>
            {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
          </Pie>
        </PieChart>
        <div style={{ flex: 1 }}>
          {pieData.map(d => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>{d.name}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1B2430' }}>{d.value}</span>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginLeft: 4 }}>{pct(d.value)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#8898AA' }}>Índice corretivo</span>
        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: corr / total > 0.4 ? '#dc2626' : '#16a34a' }}>
          {pct(corr)}%
        </span>
      </div>
    </div>
  )
}

// ── Top failure types ─────────────────────────────────────────

function TopFailures({ machines }: { machines: MachineMetrics[] }) {
  const map = new Map<string, number>()
  machines.forEach(m =>
    m.recurrent.forEach(r => map.set(r.description, (map.get(r.description) ?? 0) + r.count)))
  const top = [...map.entries()].sort(([, a], [, b]) => b - a).slice(0, 8)

  if (top.length === 0) {
    return <div className={s.emptyState} style={{ padding: '32px 20px' }}><div className={s.emptyText}>Nenhuma falha recorrente detectada.</div></div>
  }

  return (
    <div className={s.failureGrid}>
      {top.map(([desc, count]) => (
        <div key={desc} className={s.failurePill}>
          <span className={s.failurePillCount}>{count}×</span>
          <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {desc}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Machine drill-down profile ────────────────────────────────

function MachineDrillDown({
  machine, onClose,
}: {
  machine: MachineMetrics
  onClose: () => void
}) {
  const kpis = [
    { value: brl(machine.totalCost),        label: 'Custo Total',     accent: '#ea580c' },
    { value: machine.corrCount,              label: 'Falhas Corret.',  accent: '#dc2626' },
    { value: machine.maintTotal,             label: 'Manutenções',     accent: '#166534' },
    { value: machine.osTotal,               label: 'OS Total',        accent: '#3b82f6' },
    { value: machine.osOpen,                label: 'OS Abertas',      accent: machine.osOpen > 0 ? '#ea580c' : '#16a34a' },
    { value: machine.mtbf ? `${machine.mtbf}d` : '—', label: 'MTBF', accent: '#7c3aed' },
  ]

  const hasCost = machine.costByMonth.length > 0

  return (
    <div className={s.drillDown}>
      <div className={s.drillHeader}>
        <div>
          <div className={s.drillTitle}>
            <span style={{ background: RISK_COLORS[machine.riskLevel], padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 800 }}>
              {RISK_LABELS[machine.riskLevel].toUpperCase()}
            </span>
            {machine.name}
          </div>
          <div className={s.drillCode}>
            {machine.code && `Cód: ${machine.code}`}
            {machine.location && ` · ${machine.location}`}
            {` · Score de risco: ${machine.riskScore}/100`}
          </div>
        </div>
        <button className={s.drillClose} onClick={onClose}>✕</button>
      </div>

      <div className={s.drillBody}>

        {/* KPI strip */}
        <div className={s.drillKpiGrid}>
          {kpis.map(k => (
            <div key={k.label} className={s.drillKpiItem} style={{ borderLeft: `3px solid ${k.accent}` }}>
              <div className={s.drillKpiValue} style={{ color: k.accent }}>{k.value}</div>
              <div className={s.drillKpiLabel}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Cost evolution */}
        {hasCost && (
          <div className={s.drillChart}>
            <div className={s.drillSectionTitle}>Evolução de Custo</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={machine.costByMonth} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40}
                  tickFormatter={(v: number) => brl(v)} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #EBF0F7' }}
                  formatter={(v) => [brlFull(Number(v)), 'Custo']}
                />
                <Bar dataKey="cost" fill="#ea580c" fillOpacity={0.8} radius={[3, 3, 0, 0]} name="Custo" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Recurring issues */}
        <div className={s.drillSection}>
          <div className={s.drillSectionTitle}>Falhas Recorrentes</div>
          {machine.recurrent.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', padding: '8px 0' }}>
              Nenhuma falha recorrente detectada.
            </div>
          ) : (
            <div className={s.recurrentList}>
              {machine.recurrent.map((r, i) => (
                <div key={i} className={s.recurrentItem}>
                  <span className={s.recurrentDesc}>{r.description}</span>
                  <span className={s.recurrentCount}>{r.count}×</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Maintenance breakdown */}
        <div className={s.drillSection}>
          <div className={s.drillSectionTitle}>Distribuição de Manutenção</div>
          {[
            { label: 'Preventiva', count: machine.prevCount, color: '#16a34a' },
            { label: 'Corretiva',  count: machine.corrCount, color: '#dc2626' },
            { label: 'Inspeção',   count: machine.inspCount, color: '#3b82f6' },
            { label: 'Atrasadas',  count: machine.overdueCount, color: '#ea580c' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: row.color, display: 'inline-block' }} />
                {row.label}
              </span>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: row.count > 0 ? row.color : '#94a3b8' }}>
                {row.count}
              </span>
            </div>
          ))}
          {machine.avgResDays > 0 && (
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 8 }}>
              Tempo médio de resolução: <strong>{machine.avgResDays} dia{machine.avgResDays > 1 ? 's' : ''}</strong>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Alert panel ───────────────────────────────────────────────

function AlertsPanel({ alerts }: { alerts: MachineryAnalyticsData['alerts'] }) {
  if (alerts.length === 0) {
    return (
      <div className={s.emptyState} style={{ padding: '32px 20px' }}>
        <div className={s.emptyIcon}>✓</div>
        <div className={s.emptyText}>Nenhum alerta ativo.</div>
      </div>
    )
  }
  return (
    <div className={s.alertList}>
      {alerts.slice(0, 10).map((a, i) => (
        <div key={i} className={s.alertItem}>
          <div className={s.alertDot}
            style={{ background: a.severity === 'critical' ? '#dc2626' : '#ea580c' }} />
          <div className={s.alertBody}>
            <div className={s.alertMsg}>{a.message}</div>
          </div>
          <span className={`${s.alertSev} ${a.severity === 'critical' ? s.alertSevCritical : s.alertSevWarning}`}>
            {a.severity === 'critical' ? 'Crítico' : 'Atenção'}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function MachineryAnalyticsPage() {
  const [period,   setPeriod]   = useState<AnalyticsPeriod>('90d')
  const [data,     setData]     = useState<MachineryAnalyticsData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async (p: AnalyticsPeriod, force = false) => {
    setLoading(true)
    setError(null)
    try {
      if (force) clearMachineryCache()
      const result = await fetchMachineryAnalytics(p, force)
      setData(result)
    } catch (e) {
      console.error(e)
      setError('Erro ao carregar dados. Verifique a conexão e tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setSelected(null)
    void load(period)
  }, [period, load])

  const selectedMachine = useMemo(
    () => data?.machines.find(m => m.assetId === selected) ?? null,
    [data, selected],
  )

  const topAlertMessage = data?.alerts[0]?.message ?? null
  const criticalAlerts  = data?.alerts.filter(a => a.severity === 'critical') ?? []

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerInner}>
          <div className={s.headerLeft}>
            <h1 className={s.headerTitle}>
              <span className={s.headerTitleIcon}>⚙️</span>
              Analytics de Maquinário
            </h1>
            <p className={s.headerSub}>{today}</p>
          </div>
          <div className={s.headerControls}>
            {PERIODS.map(p => (
              <button
                key={p.value}
                className={`${s.periodBtn} ${period === p.value ? s.periodBtnActive : ''}`}
                onClick={() => setPeriod(p.value)}
                disabled={loading}
              >
                {p.label}
              </button>
            ))}
            <button
              className={s.refreshBtn}
              onClick={() => void load(period, true)}
              disabled={loading}
              title="Forçar recarregamento"
            >
              {loading ? '…' : '↺'}
            </button>
            {data && !loading && (
              <span className={s.lastUpdated}>
                Atualizado {data.computedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Alert banner ── */}
      {!loading && criticalAlerts.length > 0 && (
        <div className={`${s.alertBanner} ${s.alertBannerCritical}`}>
          <span className={s.alertBannerIcon}>🔴</span>
          <span className={s.alertBannerText}>{topAlertMessage}</span>
          <span className={s.alertBannerCount}>{criticalAlerts.length} crítico{criticalAlerts.length > 1 ? 's' : ''}</span>
        </div>
      )}

      <div className={s.body}>

        {/* ── Error ── */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: '0.85rem', color: '#991b1b', fontWeight: 500 }}>{error}</span>
            <button onClick={() => void load(period)} style={{ padding: '7px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
              Tentar novamente
            </button>
          </div>
        )}

        {/* ── KPI strip ── */}
        <div className={s.kpiStrip}>
          <KpiCard value={data?.totalMachines ?? '—'} label="Máquinas Cadastradas" accent="#166534" loading={loading} />
          <KpiCard value={brl(data?.totalCostPeriod ?? 0)} label="Custo Total no Período" accent="#ea580c" loading={loading}
            sub={data ? `${data.machines.filter(m => m.totalCost > 0).length} máquinas com custo` : undefined} />
          <KpiCard value={data?.criticalCount ?? '—'} label="Máquinas Críticas" accent="#dc2626" loading={loading}
            sub={data && data.criticalCount > 0 ? 'requerem atenção imediata' : 'nenhuma em estado crítico'} />
          <KpiCard value={data?.totalOsOpen ?? '—'} label="OS Abertas" accent="#3b82f6" loading={loading} />
          <KpiCard value={data?.totalOverdue ?? '—'} label="Manutenções Atrasadas" accent="#f59e0b" loading={loading} />
          <KpiCard
            value={data?.avgMtbf != null ? `${data.avgMtbf}d` : '—'}
            label="MTBF Médio"
            accent="#7c3aed"
            loading={loading}
            sub="dias entre falhas"
          />
        </div>

        {/* ── Main row: ranking + cost chart ── */}
        <div className={s.mainRow}>

          {/* Ranking table */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>
                🏆 Ranking de Risco — Máquinas
                {data && <span className={s.panelBadge}>{data.machines.length}</span>}
              </span>
            </div>
            <div className={s.searchBar}>
              <input
                className={s.searchInput}
                type="text"
                placeholder="Buscar por nome, código ou local…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <span className={s.searchCount}>
                  {data?.machines.filter(m =>
                    [m.name, m.code, m.location].some(f =>
                      f.toLowerCase().includes(search.toLowerCase()))).length ?? 0} resultados
                </span>
              )}
            </div>
            {loading ? (
              <>
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className={s.skeletonRow}>
                    <div className={s.skeletonCell} style={{ width: 24, height: 14, flexShrink: 0 }} />
                    <div className={s.skeletonCell} style={{ flex: 2 }} />
                    <div className={s.skeletonCell} style={{ flex: 1 }} />
                    <div className={s.skeletonCell} style={{ flex: 1 }} />
                  </div>
                ))}
              </>
            ) : data ? (
              <MachineRanking
                machines={data.machines}
                query={search}
                selected={selected}
                onSelect={setSelected}
              />
            ) : null}
          </div>

          {/* Right column: cost chart + alerts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className={s.panel}>
              <div className={s.panelHeader}>
                <span className={s.panelTitle}>📈 Evolução de Custo</span>
              </div>
              <div className={s.panelBody}>
                {loading ? (
                  <div className={s.skeletonCell} style={{ height: 220, width: '100%' }} />
                ) : data ? (
                  <CostTrendChart data={data.globalCostByMonth} />
                ) : null}
              </div>
            </div>

            <div className={s.panel}>
              <div className={s.panelHeader}>
                <span className={s.panelTitle}>
                  🚨 Alertas
                  {data && data.alerts.length > 0 && (
                    <span className={s.panelBadge}>{data.alerts.length}</span>
                  )}
                </span>
              </div>
              {loading ? (
                <div className={s.panelBody}>
                  <div className={s.skeletonCell} style={{ height: 14, width: '90%', marginBottom: 8 }} />
                  <div className={s.skeletonCell} style={{ height: 14, width: '75%' }} />
                </div>
              ) : data ? (
                <AlertsPanel alerts={data.alerts} />
              ) : null}
            </div>

          </div>
        </div>

        {/* ── Drill-down: selected machine profile ── */}
        {selectedMachine && (
          <MachineDrillDown machine={selectedMachine} onClose={() => setSelected(null)} />
        )}

        {/* ── Second row: distribution + failures + performance ── */}
        <div className={s.wideRow}>

          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>🔧 Tipo de Manutenção</span>
            </div>
            {loading ? (
              <div className={s.panelBody}>
                <div className={s.skeletonCell} style={{ height: 140, width: '100%' }} />
              </div>
            ) : data ? (
              <MaintenanceDistribution machines={data.machines} />
            ) : null}
          </div>

          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>🔄 Falhas Recorrentes</span>
            </div>
            {loading ? (
              <div className={s.panelBody}>
                <div className={s.skeletonCell} style={{ height: 100, width: '100%' }} />
              </div>
            ) : data ? (
              <TopFailures machines={data.machines} />
            ) : null}
          </div>

          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>📊 Performance Global</span>
            </div>
            <div className={s.panelBody}>
              {loading ? (
                <div className={s.skeletonCell} style={{ height: 100, width: '100%' }} />
              ) : data ? (
                <>
                  {[
                    { label: 'Total de manutenções',  value: data.machines.reduce((s, m) => s + m.maintTotal, 0), color: '#166534' },
                    { label: 'Manutenções corretivas', value: data.machines.reduce((s, m) => s + m.corrCount, 0),  color: '#dc2626' },
                    { label: 'Manutenções preventivas',value: data.machines.reduce((s, m) => s + m.prevCount, 0),  color: '#16a34a' },
                    { label: 'Total de OS',            value: data.machines.reduce((s, m) => s + m.osTotal, 0),    color: '#3b82f6' },
                    { label: 'OS em aberto',           value: data.totalOsOpen,                                    color: '#ea580c' },
                    { label: 'Máquinas sem custo',     value: data.machines.filter(m => m.totalCost === 0).length, color: '#94a3b8' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: row.color, display: 'inline-block' }} />
                        {row.label}
                      </span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: row.color }}>{row.value}</span>
                    </div>
                  ))}
                </>
              ) : null}
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}

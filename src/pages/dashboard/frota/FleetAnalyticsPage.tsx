// src/pages/dashboard/frota/FleetAnalyticsPage.tsx

import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { fetchFleetAnalytics, clearFleetCache } from '@/lib/db-fleet-analytics'
import type {
  FleetAnalyticsData, VehicleMetrics, FleetRiskLevel, FleetPeriod, VehicleStatus, VehicleTrend,
} from '@/types/fleet-analytics'
import s from './FleetAnalyticsPage.module.css'

// ── Constants ─────────────────────────────────────────────────

const PERIODS: { value: FleetPeriod; label: string }[] = [
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: '6m',  label: '6 meses' },
  { value: '1a',  label: '1 ano'   },
]

const RISK_COLORS: Record<FleetRiskLevel, string> = {
  low: '#16a34a', medium: '#f59e0b', high: '#ea580c', critical: '#dc2626',
}

const RISK_LABELS: Record<FleetRiskLevel, string> = {
  low: 'Baixo', medium: 'Médio', high: 'Alto', critical: 'Crítico',
}

const STATUS_META: Record<VehicleStatus, { label: string; cls: string }> = {
  operational:    { label: 'Operacional',   cls: s.statusOperational  },
  attention:      { label: 'Atenção',       cls: s.statusAttention    },
  preventive_due: { label: 'Prev. Devida',  cls: s.statusPreventive   },
  in_maintenance: { label: 'Manutenção',    cls: s.statusMaintenance  },
  stopped:        { label: 'Parado',        cls: s.statusStopped      },
  critical:       { label: 'Crítico',       cls: s.statusCritical     },
  unknown:        { label: 'Sem dados',     cls: s.statusUnknown      },
}

const TREND_META: Record<VehicleTrend, { label: string; cls: string; icon: string }> = {
  improving:         { label: 'Melhorando', cls: s.trendImproving, icon: '↓' },
  worsening:         { label: 'Piorando',   cls: s.trendWorsening, icon: '↑' },
  stable:            { label: 'Estável',    cls: s.trendStable,    icon: '→' },
  insufficient_data: { label: '—',          cls: s.trendStable,    icon: '—' },
}

// ── Formatters ────────────────────────────────────────────────

const brl  = (v: number) =>
  v === 0 ? 'R$ 0' : v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : `R$ ${v.toFixed(0)}`

const brlFull = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const hrs = (h: number | null) => h === null ? '—' : `${Math.round(h)}h`

// ── Shared KPI card ───────────────────────────────────────────

function KpiCard({
  value, label, sub, accent, loading,
}: { value: string | number; label: string; sub?: string; accent: string; loading: boolean }) {
  if (loading) {
    return (
      <div className={s.kpiCard}>
        <div className={s.kpiAccent} style={{ background: accent }} />
        <div className={s.skeletonCell} style={{ height: 30, width: '55%', marginBottom: 8 }} />
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

function RiskBadge({ level }: { level: FleetRiskLevel }) {
  const cls = level === 'critical' ? s.riskCritical
            : level === 'high'     ? s.riskHigh
            : level === 'medium'   ? s.riskMedium
            :                        s.riskLow
  return <span className={`${s.riskBadge} ${cls}`}>{RISK_LABELS[level]}</span>
}

// ── Status badge ──────────────────────────────────────────────

function StatusBadge({ status }: { status: VehicleStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.unknown
  return <span className={`${s.statusBadge} ${meta.cls}`}>{meta.label}</span>
}

// ── Score bar ─────────────────────────────────────────────────

function ScoreBar({ score, level }: { score: number; level: FleetRiskLevel }) {
  return (
    <div className={s.scoreBar}>
      <div className={s.scoreBarTrack}>
        <div className={s.scoreBarFill}
          style={{ width: `${score}%`, background: RISK_COLORS[level] } as CSSProperties} />
      </div>
      <span className={s.scoreNum} style={{ color: RISK_COLORS[level] }}>{score}</span>
    </div>
  )
}

// ── Vehicle ranking table ─────────────────────────────────────

function VehicleRanking({
  vehicles, query: q, selected, onSelect,
}: {
  vehicles: VehicleMetrics[]; query: string;
  selected: string | null; onSelect: (id: string | null) => void;
}) {
  const filtered = useMemo(() => {
    if (!q.trim()) return vehicles
    const lower = q.toLowerCase()
    return vehicles.filter(v =>
      v.placa.toLowerCase().includes(lower) ||
      v.modelo.toLowerCase().includes(lower) ||
      v.categoria.toLowerCase().includes(lower) ||
      v.motorista.toLowerCase().includes(lower)
    )
  }, [vehicles, q])

  if (vehicles.length === 0) {
    return (
      <div className={s.emptyState}>
        <div className={s.emptyIcon}>🚛</div>
        <div className={s.emptyText}>Nenhum veículo com dados no período.</div>
      </div>
    )
  }

  return (
    <table className={s.rankTable}>
      <thead>
        <tr>
          <th>#</th>
          <th>Veículo</th>
          <th>Status</th>
          <th>Falhas</th>
          <th>NC</th>
          <th>Paradas</th>
          <th>Custo</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((v, i) => {
          const trendMeta = TREND_META[v.trend]
          return (
            <tr
              key={v.vehicleId}
              className={`${s.rankRow} ${selected === v.vehicleId ? s.rankRowActive : ''}`}
              onClick={() => onSelect(selected === v.vehicleId ? null : v.vehicleId)}
            >
              <td><span className={s.rankNum}>{i + 1}</span></td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '1rem' }}>{v.icone}</span>
                  <div>
                    <div className={s.vehiclePlate}>{v.placa}</div>
                    <div className={s.vehicleModel}>{v.modelo}</div>
                    {v.motorista !== '—' && <div className={s.vehicleDriver}>{v.motorista}</div>}
                  </div>
                </div>
              </td>
              <td>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <StatusBadge status={v.currentStatus} />
                  <RiskBadge level={v.riskLevel} />
                </div>
              </td>
              <td>
                <span style={{ fontWeight: 700, color: v.failureCount > 0 ? '#dc2626' : '#16a34a' }}>
                  {v.failureCount}
                </span>
              </td>
              <td>
                <span style={{ fontWeight: 700, color: v.totalNcCount > 4 ? '#ea580c' : '#374151' }}>
                  {v.totalNcCount}
                </span>
                {v.inspectionCount > 0 && (
                  <div style={{ fontSize: '0.63rem', color: '#94a3b8' }}>
                    {v.inspectionCount} insp.
                  </div>
                )}
              </td>
              <td>
                <span style={{ fontWeight: 600, color: v.downtimeHours > 0 ? '#ea580c' : '#94a3b8' }}>
                  {hrs(v.downtimeHours || null)}
                </span>
              </td>
              <td>
                <div className={s.costCell}>{brl(v.totalCost)}</div>
                {v.costPerKm !== null && (
                  <div className={s.costSub}>{brl(v.costPerKm)}/km</div>
                )}
              </td>
              <td style={{ minWidth: 110 }}>
                <ScoreBar score={v.riskScore} level={v.riskLevel} />
                <div className={`${s.trend} ${trendMeta.cls}`} style={{ fontSize: '0.65rem', marginTop: 2 }}>
                  {trendMeta.icon} {trendMeta.label}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Cost chart ────────────────────────────────────────────────

function FleetCostChart({ data }: { data: FleetAnalyticsData['globalCostByMonth'] }) {
  if (data.length === 0) {
    return <div className={s.emptyState}><div className={s.emptyText}>Sem dados de custo no período.</div></div>
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fleetCostGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#ea580c" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#ea580c" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={42}
          tickFormatter={(v: number) => brl(v)} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v) => [brlFull(Number(v)), 'Custo']}
        />
        <Area type="monotone" dataKey="cost" stroke="#ea580c" fill="url(#fleetCostGrad)"
          strokeWidth={2} dot={false} name="Custo" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Fleet status distribution ─────────────────────────────────

function FleetStatusDistribution({ vehicles }: { vehicles: VehicleMetrics[] }) {
  const counts: Partial<Record<VehicleStatus, number>> = {}
  vehicles.forEach(v => { counts[v.currentStatus] = (counts[v.currentStatus] ?? 0) + 1 })

  const items = Object.entries(STATUS_META)
    .map(([key, meta]) => ({ status: key as VehicleStatus, label: meta.label, count: counts[key as VehicleStatus] ?? 0 }))
    .filter(i => i.count > 0)

  const total = vehicles.length || 1

  const colors: Record<string, string> = {
    operational: '#16a34a', attention: '#f59e0b', preventive_due: '#3b82f6',
    in_maintenance: '#8b5cf6', stopped: '#dc2626', critical: '#7f1d1d', unknown: '#94a3b8',
  }

  const pieData = items.map(i => ({ name: i.label, value: i.count, color: colors[i.status] }))

  return (
    <div style={{ padding: '14px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <PieChart width={110} height={110}>
          <Pie data={pieData} cx={50} cy={50} innerRadius={28} outerRadius={48}
            dataKey="value" strokeWidth={0}>
            {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
          </Pie>
        </PieChart>
        <div style={{ flex: 1 }}>
          {items.map(item => (
            <div key={item.status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: 2, background: colors[item.status] }} />
                <span style={{ fontSize: '0.73rem', fontWeight: 600, color: '#374151' }}>{item.label}</span>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1B2430' }}>{item.count}</span>
                <span style={{ fontSize: '0.65rem', color: '#94a3b8', marginLeft: 4 }}>
                  {Math.round((item.count / total) * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Category cost breakdown ───────────────────────────────────

function CategoryBreakdown({ vehicles }: { vehicles: VehicleMetrics[] }) {
  const catCost = new Map<string, number>()
  vehicles.forEach(v => {
    const key = v.categoria
    catCost.set(key, (catCost.get(key) ?? 0) + v.totalCost)
  })

  const sorted = [...catCost.entries()]
    .sort(([, a], [, b]) => b - a)
    .filter(([, c]) => c > 0)

  if (sorted.length === 0) {
    return <div className={s.emptyState} style={{ padding: '32px 20px' }}><div className={s.emptyText}>Sem custos registrados.</div></div>
  }

  const max = sorted[0][1]
  const COLORS = ['#ea580c', '#166534', '#3b82f6', '#8b5cf6', '#f59e0b', '#16a34a']

  return (
    <div className={s.catBar}>
      {sorted.map(([cat, cost], i) => (
        <div key={cat} className={s.catRow}>
          <span className={s.catLabel} title={cat}>{cat}</span>
          <div className={s.catBarTrack}>
            <div className={s.catBarFill}
              style={{ width: `${(cost / max) * 100}%`, background: COLORS[i % COLORS.length] } as CSSProperties} />
          </div>
          <span className={s.catValue}>{brl(cost)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Alerts panel ──────────────────────────────────────────────

function AlertsPanel({ alerts }: { alerts: FleetAnalyticsData['alerts'] }) {
  if (alerts.length === 0) {
    return (
      <div className={s.emptyState} style={{ padding: '28px 20px' }}>
        <div className={s.emptyIcon}>✓</div>
        <div className={s.emptyText}>Nenhum alerta ativo na frota.</div>
      </div>
    )
  }
  return (
    <div className={s.alertList}>
      {alerts.slice(0, 12).map((a, i) => (
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

// ── Vehicle drill-down ────────────────────────────────────────

function VehicleDrillDown({ vehicle, onClose }: { vehicle: VehicleMetrics; onClose: () => void }) {
  const hasCost = vehicle.costByMonth.length > 0

  const kpiItems = [
    { value: brl(vehicle.totalCost),                 label: 'Custo Total',      accent: '#ea580c' },
    { value: vehicle.failureCount,                    label: 'Falhas',           accent: '#dc2626' },
    { value: vehicle.totalNcCount,                    label: 'Não Conformidades', accent: '#f59e0b' },
    { value: hrs(vehicle.downtimeHours || null),      label: 'Indisponível',     accent: '#8b5cf6' },
    { value: hrs(vehicle.mtbfHours),                  label: 'MTBF',             accent: '#166534' },
    { value: hrs(vehicle.mttrHours),                  label: 'MTTR',             accent: '#3b82f6' },
  ]

  return (
    <div className={s.drillDown}>
      <div className={s.drillHeader}>
        <div className={s.drillTitleArea}>
          <div className={s.drillPlate}>{vehicle.icone} {vehicle.placa}</div>
          <div className={s.drillModel}>{vehicle.modelo} · {vehicle.categoria}</div>
        </div>
        <button className={s.drillClose} onClick={onClose}>✕</button>
      </div>

      {/* Meta strip */}
      <div className={s.drillMeta}>
        <div className={s.drillMetaItem}>
          <span className={s.drillMetaLabel}>Motorista:</span>
          <strong>{vehicle.motorista}</strong>
        </div>
        <div className={s.drillMetaItem}>
          <span className={s.drillMetaLabel}>Status:</span>
          <StatusBadge status={vehicle.currentStatus} />
        </div>
        <div className={s.drillMetaItem}>
          <span className={s.drillMetaLabel}>Risco:</span>
          <RiskBadge level={vehicle.riskLevel} />
          <span style={{ fontSize: '0.72rem', color: RISK_COLORS[vehicle.riskLevel], fontWeight: 700 }}>
            ({vehicle.riskScore}/100)
          </span>
        </div>
        {vehicle.latestMileage !== null && (
          <div className={s.drillMetaItem}>
            <span className={s.drillMetaLabel}>Odômetro:</span>
            <strong>{vehicle.latestMileage.toLocaleString('pt-BR')} km</strong>
          </div>
        )}
        {vehicle.mileageDelta !== null && (
          <div className={s.drillMetaItem}>
            <span className={s.drillMetaLabel}>KM no período:</span>
            <strong>+{vehicle.mileageDelta.toLocaleString('pt-BR')} km</strong>
          </div>
        )}
        {vehicle.costPerKm !== null && (
          <div className={s.drillMetaItem}>
            <span className={s.drillMetaLabel}>Custo/km:</span>
            <strong style={{ color: '#ea580c' }}>{brlFull(vehicle.costPerKm)}</strong>
          </div>
        )}
        {vehicle.lastEventDesc && (
          <div className={s.drillMetaItem}>
            <span className={s.drillMetaLabel}>Último evento:</span>
            <span style={{ fontSize: '0.72rem' }}>{vehicle.lastEventDesc}</span>
          </div>
        )}
      </div>

      <div className={s.drillBody}>

        {/* KPI strip */}
        <div className={s.drillKpiGrid}>
          {kpiItems.map(k => (
            <div key={k.label} className={s.drillKpiItem}
              style={{ borderLeft: `3px solid ${k.accent}` }}>
              <div className={s.drillKpiValue} style={{ color: k.accent }}>{k.value}</div>
              <div className={s.drillKpiLabel}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Cost chart */}
        {hasCost && (
          <div className={s.drillChartFull}>
            <div className={s.drillSectionTitle}>Evolução de Custo</div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={vehicle.costByMonth} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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

        {/* Maintenance breakdown */}
        <div className={s.drillSection}>
          <div className={s.drillSectionTitle}>Ordens de Serviço</div>
          {[
            { label: 'OS Total',         value: vehicle.osTotal,         color: '#3b82f6' },
            { label: 'OS Abertas',       value: vehicle.osOpen,          color: '#ea580c' },
            { label: 'Corretivas',       value: vehicle.correctiveCount, color: '#dc2626' },
            { label: 'Preventivas',      value: vehicle.preventiveCount, color: '#16a34a' },
            { label: 'Inspeções',        value: vehicle.inspectionCount, color: '#8b5cf6' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: row.color, display: 'inline-block' }} />
                {row.label}
              </span>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: row.value > 0 ? row.color : '#94a3b8' }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {/* Performance */}
        <div className={s.drillSection}>
          <div className={s.drillSectionTitle}>Performance</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Tendência', value: `${TREND_META[vehicle.trend].icon} ${TREND_META[vehicle.trend].label}`, color: vehicle.trend === 'improving' ? '#16a34a' : vehicle.trend === 'worsening' ? '#dc2626' : '#94a3b8' },
              { label: 'NC Total', value: `${vehicle.totalNcCount} itens`, color: vehicle.totalNcCount > 5 ? '#ea580c' : '#374151' },
              { label: 'Indisponibilidade', value: `${Math.round(vehicle.downtimeHours)}h`, color: vehicle.downtimeHours > 24 ? '#dc2626' : '#374151' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: '#f8fafc', borderRadius: 6 }}>
                <span style={{ fontSize: '0.73rem', fontWeight: 600, color: '#374151' }}>{row.label}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: row.color }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function FleetAnalyticsPage() {
  const [period,   setPeriod]   = useState<FleetPeriod>('90d')
  const [data,     setData]     = useState<FleetAnalyticsData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async (p: FleetPeriod, force = false) => {
    setLoading(true); setError(null)
    try {
      if (force) clearFleetCache()
      setData(await fetchFleetAnalytics(p, force))
    } catch (e) {
      console.error(e)
      setError('Erro ao carregar dados da frota. Verifique a conexão.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { setSelected(null); void load(period) }, [period, load])

  const selectedVehicle = useMemo(
    () => data?.vehicles.find(v => v.vehicleId === selected) ?? null,
    [data, selected],
  )

  const criticalAlerts = data?.alerts.filter(a => a.severity === 'critical') ?? []
  const topAlert       = data?.alerts[0]?.message ?? null

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  const operationalVehicles = data?.vehicles.filter(v =>
    v.currentStatus === 'operational').length ?? 0

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerInner}>
          <div className={s.headerLeft}>
            <h1 className={s.headerTitle}>🚛 Analytics de Frota</h1>
            <p className={s.headerSub}>{today}</p>
          </div>
          <div className={s.headerControls}>
            {PERIODS.map(p => (
              <button
                key={p.value}
                className={`${s.periodBtn} ${period === p.value ? s.periodBtnActive : ''}`}
                onClick={() => setPeriod(p.value)}
                disabled={loading}
              >{p.label}</button>
            ))}
            <button className={s.refreshBtn} onClick={() => void load(period, true)} disabled={loading}
              title="Forçar recarregamento">
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
          <span>🔴</span>
          <span className={s.alertBannerText}>{topAlert}</span>
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
          <KpiCard value={data?.totalVehicles ?? '—'} label="Veículos na Frota" accent="#166534" loading={loading}
            sub={!loading && data ? `${operationalVehicles} operacionais` : undefined} />
          <KpiCard value={data?.criticalCount ?? '—'} label="Veículos Críticos" accent="#dc2626" loading={loading}
            sub={!loading && data && data.criticalCount === 0 ? 'frota estável' : undefined} />
          <KpiCard value={brl(data?.totalCostPeriod ?? 0)} label="Custo Total" accent="#ea580c" loading={loading}
            sub={!loading && data ? `${data.vehicles.filter(v => v.totalCost > 0).length} veículos com custo` : undefined} />
          <KpiCard value={data?.totalOsOpen ?? '—'} label="OS Abertas" accent="#3b82f6" loading={loading} />
          <KpiCard value={data?.totalNcPeriod ?? '—'} label="Não Conformidades" accent="#f59e0b" loading={loading}
            sub="em inspeções do período" />
          <KpiCard value={hrs(data?.avgMtbfHours ?? null)} label="MTBF Médio" accent="#8b5cf6" loading={loading}
            sub="tempo médio entre falhas" />
          <KpiCard value={hrs(data?.totalDowntimeHours ?? null)} label="Downtime Total" accent="#94a3b8" loading={loading}
            sub="horas de indisponibilidade" />
        </div>

        {/* ── Main row: ranking + charts + alerts ── */}
        <div className={s.mainRow}>

          {/* Ranking */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>
                🏆 Ranking de Risco — Frota
                {data && <span className={s.panelBadge}>{data.totalVehicles}</span>}
              </span>
            </div>
            <div className={s.searchBar}>
              <input
                className={s.searchInput}
                type="text"
                placeholder="Buscar por placa, modelo, motorista ou categoria…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {loading ? (
              <>
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className={s.skeletonRow}>
                    <div className={s.skeletonCell} style={{ width: 20, flexShrink: 0 }} />
                    <div className={s.skeletonCell} style={{ flex: 2 }} />
                    <div className={s.skeletonCell} style={{ flex: 1 }} />
                    <div className={s.skeletonCell} style={{ flex: 1 }} />
                  </div>
                ))}
              </>
            ) : data ? (
              <VehicleRanking
                vehicles={data.vehicles} query={search}
                selected={selected} onSelect={setSelected}
              />
            ) : null}
          </div>

          {/* Right column */}
          <div className={s.rightCol}>
            <div className={s.panel}>
              <div className={s.panelHeader}>
                <span className={s.panelTitle}>📈 Evolução de Custo</span>
              </div>
              <div className={s.panelBody}>
                {loading ? (
                  <div className={s.skeletonCell} style={{ height: 200, width: '100%' }} />
                ) : data ? (
                  <FleetCostChart data={data.globalCostByMonth} />
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
                  <div className={s.skeletonCell} style={{ height: 14, width: '70%' }} />
                </div>
              ) : data ? (
                <AlertsPanel alerts={data.alerts} />
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Drill-down ── */}
        {selectedVehicle && (
          <VehicleDrillDown vehicle={selectedVehicle} onClose={() => setSelected(null)} />
        )}

        {/* ── Wide row: status + category cost + performance ── */}
        <div className={s.wideRow}>

          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>📊 Distribuição de Status</span>
            </div>
            {loading ? (
              <div className={s.panelBody}><div className={s.skeletonCell} style={{ height: 130, width: '100%' }} /></div>
            ) : data ? (
              <FleetStatusDistribution vehicles={data.vehicles} />
            ) : null}
          </div>

          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>💰 Custo por Categoria</span>
            </div>
            {loading ? (
              <div className={s.panelBody}><div className={s.skeletonCell} style={{ height: 130, width: '100%' }} /></div>
            ) : data ? (
              <CategoryBreakdown vehicles={data.vehicles} />
            ) : null}
          </div>

          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>🔧 Resumo Operacional</span>
            </div>
            <div className={s.panelBody}>
              {loading ? (
                <div className={s.skeletonCell} style={{ height: 130, width: '100%' }} />
              ) : data ? (
                <>
                  {[
                    { label: 'Total de inspeções',     value: data.vehicles.reduce((s, v) => s + v.inspectionCount, 0), color: '#3b82f6' },
                    { label: 'Total de OS',            value: data.vehicles.reduce((s, v) => s + v.osTotal, 0),         color: '#166534' },
                    { label: 'OS corretivas',          value: data.vehicles.reduce((s, v) => s + v.correctiveCount, 0), color: '#dc2626' },
                    { label: 'OS preventivas',         value: data.vehicles.reduce((s, v) => s + v.preventiveCount, 0), color: '#16a34a' },
                    { label: 'NC total no período',    value: data.totalNcPeriod,                                        color: '#ea580c' },
                    { label: 'Veículos sem custo',     value: data.vehicles.filter(v => v.totalCost === 0).length,       color: '#94a3b8' },
                    { label: 'Veículos com MTBF',      value: data.vehicles.filter(v => v.mtbfHours !== null).length,   color: '#8b5cf6' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: row.color, display: 'inline-block' }} />
                        {row.label}
                      </span>
                      <span style={{ fontSize: '0.84rem', fontWeight: 800, color: row.color }}>{row.value}</span>
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

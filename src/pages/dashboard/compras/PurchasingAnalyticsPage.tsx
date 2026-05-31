// src/pages/dashboard/compras/PurchasingAnalyticsPage.tsx
// Purchasing & Suppliers Analytics — procurement intelligence module.

import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react'
import {
  ResponsiveContainer, ComposedChart, Area,
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { fetchPurchasingAnalytics, clearPurchasingCache } from '@/lib/db-purchasing-analytics'
import type {
  PurchasingPeriod, PurchasingAnalyticsData,
  SupplierMetrics, SupplierRiskLevel,
} from '@/types/purchasing-analytics'
import {
  RISK_COLORS, RISK_LABELS, SUPPLIER_TYPE_META,
} from '@/types/purchasing-analytics'
import s from './PurchasingAnalyticsPage.module.css'

// ── Constants ─────────────────────────────────────────────────

const PERIODS: { value: PurchasingPeriod; label: string }[] = [
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: '6m',  label: '6 meses' },
  { value: '1a',  label: '1 ano'   },
]

// ── Formatters ────────────────────────────────────────────────

function brl(v: number): string {
  if (v === 0) return 'R$ 0'
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(1)}k`
  return `R$ ${v.toFixed(0)}`
}

function brlFull(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function pct(v: number): string { return `${Math.round(v)}%` }

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  // After JSON cache round-trip, Date objects deserialise as ISO strings
  const date = d instanceof Date ? d : new Date(d as string)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── KPI Card ──────────────────────────────────────────────────

function KpiCard({
  value, label, sub, accent, loading,
}: {
  value: string | number; label: string; sub?: string;
  accent: string; loading: boolean;
}) {
  if (loading) return (
    <div className={s.kpiCard}>
      <div className={s.kpiAccent} style={{ background: accent }} />
      <div className={s.skeletonCell} style={{ height: 32, width: '60%', marginBottom: 8 }} />
      <div className={s.skeletonCell} style={{ height: 10, width: '80%' }} />
    </div>
  )
  return (
    <div className={s.kpiCard}>
      <div className={s.kpiAccent} style={{ background: accent }} />
      <div className={s.kpiValue}>{value}</div>
      <div className={s.kpiLabel}>{label}</div>
      {sub && <div className={s.kpiSub}>{sub}</div>}
    </div>
  )
}

// ── Risk Badge ────────────────────────────────────────────────

// ── Score Bar ─────────────────────────────────────────────────

function ScoreBar({ score, level }: { score: number; level: SupplierRiskLevel }) {
  const color = RISK_COLORS[level]
  return (
    <div className={s.scoreBar}>
      <div className={s.scoreBarTrack}>
        <div className={s.scoreBarFill} style={{ width: `${score}%`, background: color } as CSSProperties} />
      </div>
      <span className={s.scoreNum} style={{ color }}>{score}</span>
    </div>
  )
}

// ── Supplier Ranking ──────────────────────────────────────────

function SupplierRanking({
  suppliers, query: q, selected, onSelect,
}: {
  suppliers:  SupplierMetrics[]
  query:      string
  selected:   string | null
  onSelect:   (id: string | null) => void
}) {
  const filtered = useMemo(() => {
    if (!q.trim()) return suppliers
    const lower = q.toLowerCase()
    return suppliers.filter(s =>
      s.supplierName.toLowerCase().includes(lower) ||
      (s.cnpj ?? '').includes(lower))
  }, [suppliers, q])

  if (suppliers.length === 0) return (
    <div className={s.emptyState}>
      <div className={s.emptyIcon}>🏢</div>
      <div className={s.emptyText}>Nenhum fornecedor com compras no período.</div>
    </div>
  )

  return (
    <table className={s.rankTable}>
      <thead>
        <tr>
          <th>#</th>
          <th>Fornecedor</th>
          <th>Tipo</th>
          <th>Pedidos</th>
          <th>Gasto Total</th>
          <th>Participação</th>
          <th>Score de Risco</th>
        </tr>
      </thead>
      <tbody>
        {filtered.slice(0, 25).map((sm, i) => {
          if (sm.totalOrders === 0 && sm.totalSpend === 0) return null
          const typeMeta = SUPPLIER_TYPE_META[sm.supplierType] ?? SUPPLIER_TYPE_META.unknown
          return (
            <tr
              key={sm.supplierId}
              className={`${s.rankRow} ${selected === sm.supplierId ? s.rankRowActive : ''} ${!sm.active ? s.rankRowInactive : ''}`}
              onClick={() => onSelect(selected === sm.supplierId ? null : sm.supplierId)}
            >
              <td><span className={s.rankNum}>{i + 1}</span></td>
              <td>
                <div className={s.rankName}>{sm.supplierName}</div>
                <div className={s.rankCode}>
                  {!sm.active && <span style={{ color: '#dc2626', marginRight: 4 }}>⛔ inativo</span>}
                  {sm.lastOrderDate ? `último: ${fmtDate(sm.lastOrderDate)}` : 'sem pedidos'}
                </div>
              </td>
              <td>
                <span
                  className={s.typeBadge}
                  style={{ color: typeMeta.color, background: typeMeta.color + '18', borderColor: typeMeta.color + '44' }}
                >
                  {typeMeta.label}
                </span>
              </td>
              <td style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800 }}>{sm.totalOrders}</div>
                {sm.cancelledOrders > 0 && (
                  <div style={{ fontSize: '0.62rem', color: '#dc2626' }}>
                    {sm.cancelledOrders} cancel.
                  </div>
                )}
              </td>
              <td>
                <div className={s.rankCost}>{brl(sm.totalSpend)}</div>
                <div className={s.rankCostSub}>avg {brl(sm.avgOrderValue)}</div>
              </td>
              <td style={{ textAlign: 'center' }}>
                <div className={s.shareBar}>
                  <div
                    className={s.shareBarFill}
                    style={{
                      width: `${Math.min(sm.shareOfTotalSpend, 100)}%`,
                      background: sm.shareOfTotalSpend > 50 ? '#dc2626' : sm.shareOfTotalSpend > 30 ? '#ea580c' : '#16a34a',
                    } as CSSProperties}
                  />
                </div>
                <span style={{ fontSize: '0.68rem', fontWeight: 700 }}>
                  {pct(sm.shareOfTotalSpend)}
                </span>
              </td>
              <td style={{ minWidth: 110 }}>
                <ScoreBar score={sm.riskScore} level={sm.riskLevel} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Cost Trend Chart ──────────────────────────────────────────

function CostTrendChart({ data }: { data: PurchasingAnalyticsData['monthlyTrend'] }) {
  if (data.length === 0) return (
    <div className={s.emptyState} style={{ padding: '40px 20px' }}>
      <div className={s.emptyText}>Sem dados de tendência no período.</div>
    </div>
  )
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#166534" stopOpacity={0.22} />
            <stop offset="95%" stopColor="#166534" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis
          yAxisId="spend" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
          width={44} tickFormatter={(v: number) => brl(v)}
        />
        <YAxis
          yAxisId="count" orientation="right"
          tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={20}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v, name) =>
            name === 'Pedidos' ? [String(v), name] : [brlFull(v as number), name]
          }
        />
        <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        <Area
          yAxisId="spend"
          type="monotone" dataKey="value" name="Gasto Total"
          stroke="#166534" fill="url(#spendGrad)" strokeWidth={2} dot={false}
        />
        <Bar
          yAxisId="count"
          dataKey="count" name="Pedidos"
          fill="#ea580c" fillOpacity={0.6} radius={[2, 2, 0, 0]} maxBarSize={18}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── Status Donut ──────────────────────────────────────────────

function StatusDonut({ data }: { data: PurchasingAnalyticsData['statusDistribution'] }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  if (total === 0) return (
    <div className={s.emptyState} style={{ padding: '28px 20px' }}>
      <div className={s.emptyText}>Sem pedidos no período.</div>
    </div>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}>
      <PieChart width={110} height={110}>
        <Pie
          data={data} cx={50} cy={50} innerRadius={30} outerRadius={50}
          dataKey="count" strokeWidth={0}
        >
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Pie>
      </PieChart>
      <div style={{ flex: 1 }}>
        {data.map(d => (
          <div key={d.status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#374151' }}>{d.label}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1B2430' }}>{d.count}</span>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8', marginLeft: 4 }}>
                {total > 0 ? pct((d.count / total) * 100) : '—'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Type Breakdown Chart ──────────────────────────────────────

function TypeBreakdownChart({ data }: { data: PurchasingAnalyticsData['typeBreakdown'] }) {
  if (data.length === 0) return (
    <div className={s.emptyState} style={{ padding: '28px 20px' }}>
      <div className={s.emptyText}>Sem dados de tipo.</div>
    </div>
  )
  return (
    <div className={s.typeList}>
      {data.map(t => {
        const maxVal = data[0]?.value ?? 1
        const pctWidth = maxVal > 0 ? (t.value / maxVal) * 100 : 0
        return (
          <div key={t.type} className={s.typeRow}>
            <div className={s.typeLabel}>
              <span style={{ color: t.color, fontWeight: 700, fontSize: '0.72rem' }}>{t.label}</span>
              <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{t.count} pedidos</span>
            </div>
            <div className={s.typeBar}>
              <div
                className={s.typeBarFill}
                style={{ width: `${pctWidth}%`, background: t.color } as CSSProperties}
              />
            </div>
            <span className={s.typeValue}>{brl(t.value)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Top Items Panel ───────────────────────────────────────────

function TopItemsPanel({ items }: { items: PurchasingAnalyticsData['topItems'] }) {
  if (items.length === 0) return (
    <div className={s.emptyState} style={{ padding: '28px 20px' }}>
      <div className={s.emptyText}>Nenhum item encontrado.</div>
    </div>
  )
  return (
    <div className={s.itemGrid}>
      {items.slice(0, 12).map((it, i) => (
        <div key={i} className={s.itemPill}>
          <span className={s.itemCount}>{it.count}×</span>
          <span className={s.itemDesc}>{it.description}</span>
          {it.totalValue > 0 && (
            <span className={s.itemValue}>{brl(it.totalValue)}</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Alert Panel ───────────────────────────────────────────────

function AlertsPanel({ alerts }: { alerts: PurchasingAnalyticsData['alerts'] }) {
  if (alerts.length === 0) return (
    <div className={s.emptyState} style={{ padding: '28px 20px' }}>
      <div className={s.emptyIcon} style={{ fontSize: '1.5rem' }}>✓</div>
      <div className={s.emptyText}>Nenhum alerta ativo.</div>
    </div>
  )
  return (
    <div className={s.alertList}>
      {alerts.map((a, i) => (
        <div key={i} className={s.alertItem}>
          <div
            className={s.alertDot}
            style={{ background: a.severity === 'critical' ? '#dc2626' : '#ea580c' }}
          />
          <div className={s.alertBody}>
            <div className={s.alertMsg}>{a.message}</div>
          </div>
          <span className={`${s.alertSev} ${a.severity === 'critical' ? s.alertCritical : s.alertWarning}`}>
            {a.severity === 'critical' ? 'Crítico' : 'Atenção'}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Supplier Drill-Down ───────────────────────────────────────

function SupplierDrillDown({
  sm, onClose,
}: {
  sm:      SupplierMetrics
  onClose: () => void
}) {
  const typeMeta = SUPPLIER_TYPE_META[sm.supplierType] ?? SUPPLIER_TYPE_META.unknown

  const kpis = [
    { value: sm.totalOrders,          label: 'Pedidos',        accent: '#166534' },
    { value: brl(sm.totalSpend),      label: 'Gasto Total',    accent: '#ea580c' },
    { value: brl(sm.avgOrderValue),   label: 'Ticket Médio',   accent: '#2563eb' },
    { value: brl(sm.maxOrderValue),   label: 'Maior Pedido',   accent: '#7c3aed' },
    { value: pct(sm.cancelRate * 100), label: 'Taxa Cancelam.', accent: sm.cancelRate > 0.3 ? '#dc2626' : '#16a34a' },
    { value: pct(sm.shareOfTotalSpend), label: 'Part. no Gasto', accent: sm.shareOfTotalSpend > 40 ? '#dc2626' : '#166534' },
  ]

  const hasMonthly = sm.monthlySpend.length > 0

  return (
    <div className={s.drillDown}>
      <div className={s.drillHeader}>
        <div>
          <div className={s.drillTitle}>
            <span style={{
              background: RISK_COLORS[sm.riskLevel],
              color: '#fff', padding: '2px 8px', borderRadius: 6,
              fontSize: '0.68rem', fontWeight: 800,
            }}>
              {RISK_LABELS[sm.riskLevel].toUpperCase()}
            </span>
            <span
              className={s.typeBadge}
              style={{ color: typeMeta.color, background: typeMeta.color + '18', borderColor: typeMeta.color + '44' }}
            >
              {typeMeta.label}
            </span>
            🏢 {sm.supplierName}
          </div>
          <div className={s.drillCode}>
            {sm.cnpj && `CNPJ: ${sm.cnpj} · `}
            {sm.contact && `Contato: ${sm.contact} · `}
            {sm.active ? '● Ativo' : '⛔ Inativo'}
            {sm.lastOrderDate ? ` · Último pedido: ${fmtDate(sm.lastOrderDate)}` : ''}
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

        {/* Monthly spend */}
        {hasMonthly && (
          <div className={s.drillChart}>
            <div className={s.drillSectionTitle}>Gasto Mensal</div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={sm.monthlySpend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36}
                  tickFormatter={(v: number) => brl(v)} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #EBF0F7' }}
                  formatter={(v) => [brlFull(v as number), 'Gasto']}
                />
                <Bar dataKey="value" fill="#166534" fillOpacity={0.8} radius={[3, 3, 0, 0]} name="Gasto" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top items */}
        <div className={s.drillSection}>
          <div className={s.drillSectionTitle}>Itens mais comprados</div>
          {sm.topItems.length === 0 ? (
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '8px 0' }}>
              Sem dados de itens.
            </div>
          ) : (
            <div className={s.recurrentList}>
              {sm.topItems.map((it, i) => (
                <div key={i} className={s.recurrentItem}>
                  <span className={s.recurrentDesc}>{it.description}</span>
                  <span className={s.recurrentCount}>{it.count}×</span>
                  {it.totalValue > 0 && (
                    <span style={{ fontSize: '0.68rem', color: '#166534', fontWeight: 700 }}>{brl(it.totalValue)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status breakdown */}
        <div className={s.drillSection}>
          <div className={s.drillSectionTitle}>Distribuição de Status</div>
          {[
            { label: 'Aprovados',   count: sm.approvedOrders,  color: '#16a34a' },
            { label: 'Recebidos',   count: sm.receivedOrders,  color: '#10b981' },
            { label: 'Pendentes',   count: sm.pendingOrders,   color: '#3b82f6' },
            { label: 'Cancelados',  count: sm.cancelledOrders, color: '#dc2626' },
            { label: 'Rascunhos',   count: sm.draftOrders,     color: '#94a3b8' },
          ].filter(r => r.count > 0).map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.73rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: row.color, display: 'inline-block' }} />
                {row.label}
              </span>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: row.color }}>{row.count}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────

export default function PurchasingAnalyticsPage() {
  const [period,   setPeriod]   = useState<PurchasingPeriod>('90d')
  const [data,     setData]     = useState<PurchasingAnalyticsData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async (p: PurchasingPeriod, force = false) => {
    setLoading(true)
    setError(null)
    try {
      if (force) clearPurchasingCache()
      const result = await fetchPurchasingAnalytics(p, force)
      setData(result)
    } catch (e) {
      console.error(e)
      setError('Erro ao carregar dados. Verifique a conexão.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setSelected(null)
    void load(period)
  }, [period, load])

  const selectedMetrics = useMemo(
    () => data?.suppliers.find(s => s.supplierId === selected) ?? null,
    [data, selected],
  )

  const criticalAlerts = data?.alerts.filter(a => a.severity === 'critical') ?? []

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
              <span className={s.headerTitleIcon}>🛒</span>
              Analytics de Compras & Fornecedores
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
                {data.computedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Alert banner ── */}
      {!loading && criticalAlerts.length > 0 && (
        <div className={s.alertBanner}>
          <span>🔴</span>
          <span className={s.alertBannerText}>{criticalAlerts[0].message}</span>
          <span className={s.alertBannerCount}>{criticalAlerts.length} crítico{criticalAlerts.length > 1 ? 's' : ''}</span>
        </div>
      )}

      <div className={s.body}>

        {/* Error */}
        {error && (
          <div className={s.errorBox}>
            <span>{error}</span>
            <button onClick={() => void load(period)}>Tentar novamente</button>
          </div>
        )}

        {/* ── KPI Strip ── */}
        <div className={s.kpiStrip}>
          <KpiCard
            value={data ? brlFull(data.totalSpend) : '—'}
            label="Gasto Total no Período"
            accent="#166534"
            loading={loading}
            sub={data ? `${data.totalOrders} pedidos` : undefined}
          />
          <KpiCard
            value={data?.totalOrders ?? '—'}
            label="Pedidos de Compra"
            accent="#2563eb"
            loading={loading}
            sub={data ? `${data.activeSuppliers} fornecedores` : undefined}
          />
          <KpiCard
            value={data ? brl(data.avgOrderValue) : '—'}
            label="Ticket Médio"
            accent="#7c3aed"
            loading={loading}
          />
          <KpiCard
            value={data ? `${data.approvalRate}%` : '—'}
            label="Taxa de Aprovação"
            accent={data && data.approvalRate < 60 ? '#dc2626' : '#16a34a'}
            loading={loading}
            sub={data && data.totalCancelled > 0 ? `${data.totalCancelled} cancelado${data.totalCancelled !== 1 ? 's' : ''}` : undefined}
          />
          <KpiCard
            value={data?.activeSuppliers ?? '—'}
            label="Fornecedores Ativos"
            accent="#ea580c"
            loading={loading}
          />
        </div>

        {/* ── Main row ── */}
        <div className={s.mainRow}>

          {/* Supplier ranking */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>
                🏆 Ranking de Fornecedores
                {data && <span className={s.panelBadge}>{data.suppliers.filter(s => s.totalOrders > 0).length}</span>}
              </span>
            </div>
            <div className={s.searchBar}>
              <input
                className={s.searchInput}
                type="text"
                placeholder="Buscar por nome ou CNPJ…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <span className={s.searchCount}>
                  {data?.suppliers.filter(s =>
                    s.supplierName.toLowerCase().includes(search.toLowerCase())).length ?? 0} resultado{
                    (data?.suppliers.filter(s => s.supplierName.toLowerCase().includes(search.toLowerCase())).length ?? 0) !== 1 ? 's' : ''
                  }
                </span>
              )}
            </div>
            {loading ? (
              [1, 2, 3, 4].map(i => (
                <div key={i} className={s.skeletonRow}>
                  <div className={s.skeletonCell} style={{ width: 24, flexShrink: 0 }} />
                  <div className={s.skeletonCell} style={{ flex: 2 }} />
                  <div className={s.skeletonCell} style={{ flex: 1 }} />
                  <div className={s.skeletonCell} style={{ flex: 1 }} />
                </div>
              ))
            ) : data ? (
              <SupplierRanking
                suppliers={data.suppliers}
                query={search}
                selected={selected}
                onSelect={setSelected}
              />
            ) : null}
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className={s.panel}>
              <div className={s.panelHeader}>
                <span className={s.panelTitle}>📈 Tendência de Gasto</span>
              </div>
              <div className={s.panelBody}>
                {loading
                  ? <div className={s.skeletonCell} style={{ height: 200, width: '100%' }} />
                  : data ? <CostTrendChart data={data.monthlyTrend} /> : null}
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
              {loading
                ? <div className={s.panelBody}><div className={s.skeletonCell} style={{ height: 60, width: '100%' }} /></div>
                : data ? <AlertsPanel alerts={data.alerts} /> : null}
            </div>

          </div>
        </div>

        {/* ── Drill-down ── */}
        {selectedMetrics && (
          <SupplierDrillDown sm={selectedMetrics} onClose={() => setSelected(null)} />
        )}

        {/* ── Analytics row ── */}
        <div className={s.wideRow}>

          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>🔄 Status dos Pedidos</span>
            </div>
            {loading
              ? <div className={s.panelBody}><div className={s.skeletonCell} style={{ height: 140 }} /></div>
              : data ? <StatusDonut data={data.statusDistribution} /> : null}
          </div>

          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>📊 Gasto por Tipo de Fornecedor</span>
            </div>
            {loading
              ? <div className={s.panelBody}><div className={s.skeletonCell} style={{ height: 120 }} /></div>
              : data ? <TypeBreakdownChart data={data.typeBreakdown} /> : null}
          </div>

          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>
                🔄 Itens Mais Comprados
                {data && <span className={s.panelBadge}>{data.topItems.length}</span>}
              </span>
            </div>
            {loading
              ? <div className={s.panelBody}><div className={s.skeletonCell} style={{ height: 100 }} /></div>
              : data ? <TopItemsPanel items={data.topItems} /> : null}
          </div>

        </div>

      </div>
    </div>
  )
}

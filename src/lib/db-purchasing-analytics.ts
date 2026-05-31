// src/lib/db-purchasing-analytics.ts
//
// Data layer for the Purchasing & Suppliers Analytics module.
// Sources: purchase_orders, asset_suppliers, fornecedores (legacy)
// Aggregates client-side — no Cloud Functions needed.
// Results cached in localStorage for 30 minutes per period.

import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { getPeriodRanges } from '@/types/dashboard'
import { calcTotal } from './document-generator'
import type { PurchaseOrder, Supplier } from '@/types'
import type {
  PurchasingPeriod, PurchasingAnalyticsData,
  SupplierMetrics, SupplierRiskLevel,
  MonthlySpend, TypeSpend, StatusCount, TopItem,
  PurchasingAlert,
} from '@/types/purchasing-analytics'
import {
  STATUS_META_PURCHASE, SUPPLIER_TYPE_META,
} from '@/types/purchasing-analytics'

// ── Helpers ───────────────────────────────────────────────────

type DocData = Record<string, unknown>

function tsToDate(ts: unknown): Date | null {
  if (!ts) return null
  if (ts instanceof Date) return ts
  const t = ts as { toDate?: () => Date; seconds?: number }
  if (typeof t.toDate === 'function') return t.toDate()
  if (typeof t.seconds === 'number')  return new Date(t.seconds * 1000)
  if (typeof ts === 'number')         return new Date(ts)
  return null
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`
}

function orderValue(o: PurchaseOrder): number {
  return o.totalValue ?? calcTotal(o.items ?? [])
}

function hydrateOrder(id: string, data: DocData): PurchaseOrder {
  return {
    id,
    title:       (data.title       ?? '')    as string,
    description: (data.description ?? '')    as string,
    status:      (data.status      ?? 'draft') as PurchaseOrder['status'],
    items:       (data.items       ?? [])    as PurchaseOrder['items'],
    totalValue:  (data.totalValue  ?? undefined) as number | undefined,
    supplierId:  (data.supplierId  ?? undefined) as string | undefined,
    requestedBy: (data.requestedBy ?? undefined) as string | undefined,
    approvedBy:  (data.approvedBy  ?? undefined) as string | undefined,
    assetId:     (data.assetId     ?? undefined) as string | undefined,
    notes:       (data.notes       ?? undefined) as string | undefined,
    orderNumber: (data.orderNumber ?? undefined) as string | undefined,
    createdAt:   tsToDate(data.createdAt)    ?? undefined,
    updatedAt:   tsToDate(data.updatedAt)    ?? undefined,
  } as PurchaseOrder
}

function hydrateSupplier(id: string, data: DocData): Supplier {
  return {
    id,
    name:        (data.name       ?? data.nome ?? '') as string,
    type:        (data.type       ?? 'purchase') as Supplier['type'],
    cnpj:        (data.cnpj       ?? undefined)  as string | undefined,
    contact:     (data.contact    ?? undefined)  as string | undefined,
    phone:       (data.phone      ?? undefined)  as string | undefined,
    email:       (data.email      ?? undefined)  as string | undefined,
    notes:       (data.notes      ?? undefined)  as string | undefined,
    active:      (data.active     ?? true)       as boolean,
    categoryIds: (data.categoryIds ?? [])        as string[],
  }
}

// ── Cache ─────────────────────────────────────────────────────

const CACHE_KEY = 'purchasing_analytics_v1'
const CACHE_TTL = 30 * 60 * 1000

interface CacheEntry { data: PurchasingAnalyticsData; ts: number; period: string }

function reviveDate(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Date) return v
  const d = new Date(v as string)
  return isNaN(d.getTime()) ? null : d
}

function readCache(period: string): PurchasingAnalyticsData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (entry.period !== period || Date.now() - entry.ts > CACHE_TTL) return null

    // Restore all Date objects that JSON.stringify serialised as ISO strings
    const d = entry.data
    d.computedAt = new Date(d.computedAt)
    d.suppliers.forEach(s => {
      s.lastOrderDate  = reviveDate(s.lastOrderDate)
      s.firstOrderDate = reviveDate(s.firstOrderDate)
    })
    return d
  } catch { return null }
}

function writeCache(data: PurchasingAnalyticsData, period: string) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now(), period })) }
  catch { /* storage full */ }
}

export function clearPurchasingCache() { localStorage.removeItem(CACHE_KEY) }

// ── Risk score ────────────────────────────────────────────────

function computeRisk(
  cancelRate:         number,
  shareOfTotal:       number,   // 0–100
  daysSinceLastOrder: number | null,
  active:             boolean,
  totalOrders:        number,
): { score: number; level: SupplierRiskLevel } {
  if (totalOrders === 0) return { score: 0, level: 'low' }

  let s = 0
  // High cancellation rate
  s += Math.min(cancelRate * 40, 40)
  // High dependency (concentration)
  s += Math.min((shareOfTotal / 100) * 25, 25)
  // Dormancy (active but no orders recently)
  if (active && daysSinceLastOrder !== null) {
    if (daysSinceLastOrder > 180) s += 20
    else if (daysSinceLastOrder > 90) s += 12
  }
  // Inactive supplier with orders
  if (!active && totalOrders > 0) s += 15

  const score = Math.min(Math.round(s), 100)
  const level: SupplierRiskLevel =
    score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 20 ? 'medium' : 'low'
  return { score, level }
}

// ── Build top items from order item arrays ─────────────────────

function buildTopItems(
  orders:       PurchaseOrder[],
  supplierName: string,
  limit = 8,
): TopItem[] {
  const map = new Map<string, { count: number; value: number; suppliers: Set<string> }>()

  orders.forEach(o => {
    (o.items ?? []).forEach(it => {
      const key = it.description.trim().toLowerCase().slice(0, 60)
      if (!key) return
      const existing = map.get(key)
      const lineValue = it.quantity * (it.unitPrice ?? 0)
      if (existing) {
        existing.count++
        existing.value += lineValue
        existing.suppliers.add(supplierName)
      } else {
        map.set(key, { count: 1, value: lineValue, suppliers: new Set([supplierName]) })
      }
    })
  })

  return [...map.entries()]
    .sort(([, a], [, b]) => b.count - a.count || b.value - a.value)
    .slice(0, limit)
    .map(([description, { count, value, suppliers }]) => ({
      description,
      count,
      totalValue: value,
      suppliers: [...suppliers],
    }))
}

// ── Main fetch ────────────────────────────────────────────────

export async function fetchPurchasingAnalytics(
  period: PurchasingPeriod,
  force  = false,
): Promise<PurchasingAnalyticsData> {

  const cached = force ? null : readCache(period)
  if (cached) return cached

  const { current } = getPeriodRanges(period)
  const fromDate    = current.from
  const now         = new Date()

  // Parallel fetch — single-field range query uses auto-index
  const [poSnap, suppSnap, legacySnap] = await Promise.all([
    getDocs(query(
      collection(db, 'purchase_orders'),
      where('createdAt', '>=', fromDate),
    )),
    getDocs(collection(db, 'asset_suppliers')),
    getDocs(collection(db, 'fornecedores')).catch(() => null),
  ])

  // ── Build supplier map ────────────────────────────────────
  const supplierMap = new Map<string, Supplier>()

  suppSnap.docs.forEach(d =>
    supplierMap.set(d.id, hydrateSupplier(d.id, d.data() as DocData)))

  // Merge legacy fornecedores (lower priority — don't overwrite React-module suppliers)
  if (legacySnap) {
    legacySnap.docs.forEach(d => {
      if (!supplierMap.has(d.id))
        supplierMap.set(d.id, hydrateSupplier(d.id, d.data() as DocData))
    })
  }

  // ── Hydrate orders ────────────────────────────────────────
  const orders: PurchaseOrder[] = poSnap.docs.map(d =>
    hydrateOrder(d.id, d.data() as DocData))

  // ── Group orders by supplier ──────────────────────────────
  const supplierOrders = new Map<string, PurchaseOrder[]>()

  orders.forEach(o => {
    const key = o.supplierId ?? '__unknown__'
    if (!supplierOrders.has(key)) supplierOrders.set(key, [])
    supplierOrders.get(key)!.push(o)
  })

  // Ensure every known supplier appears even with zero orders in period
  supplierMap.forEach((_, sid) => {
    if (!supplierOrders.has(sid)) supplierOrders.set(sid, [])
  })

  // ── Global KPIs ───────────────────────────────────────────
  const totalSpend  = orders.reduce((s, o) => s + orderValue(o), 0)
  const totalOrders = orders.length

  // ── Per-supplier aggregation ──────────────────────────────
  const supplierMetrics: SupplierMetrics[] = []

  supplierOrders.forEach((sOrders, supplierId) => {
    const supplier     = supplierMap.get(supplierId)
    const supplierName = supplier?.name ?? (supplierId === '__unknown__' ? 'Sem fornecedor' : supplierId.slice(0, 12))
    const supplierType = (supplier?.type ?? 'unknown') as SupplierMetrics['supplierType']
    const active       = supplier?.active ?? (supplierId !== '__unknown__')

    // Count by status
    const approved   = sOrders.filter(o => o.status === 'approved').length
    const received   = sOrders.filter(o => o.status === 'received').length
    const cancelled  = sOrders.filter(o => o.status === 'cancelled').length
    const pending    = sOrders.filter(o => o.status === 'pending').length
    const draft      = sOrders.filter(o => o.status === 'draft').length

    const totalSup   = sOrders.length
    const cancelRate = totalSup > 0 ? cancelled / totalSup : 0

    // Spend
    const spendValues = sOrders.map(orderValue)
    const totalSuppSpend  = spendValues.reduce((a, b) => a + b, 0)
    const avgOrderValue   = totalSup > 0 ? totalSuppSpend / totalSup : 0
    const maxOrderValue   = spendValues.length > 0 ? Math.max(...spendValues) : 0
    const shareOfTotal    = totalSpend > 0 ? (totalSuppSpend / totalSpend) * 100 : 0

    // Dates
    const dates = sOrders.map(o => tsToDate(o.createdAt)).filter((d): d is Date => d !== null)
    dates.sort((a, b) => a.getTime() - b.getTime())
    const lastOrderDate  = dates.length > 0 ? dates[dates.length - 1] : null
    const firstOrderDate = dates.length > 0 ? dates[0] : null
    const daysSinceLastOrder = lastOrderDate
      ? Math.floor((now.getTime() - lastOrderDate.getTime()) / 86_400_000)
      : null

    // Monthly trend
    const monthMap = new Map<string, { value: number; count: number }>()
    sOrders.forEach(o => {
      const d = tsToDate(o.createdAt)
      if (!d) return
      const k = monthKey(d)
      const existing = monthMap.get(k)
      const v = orderValue(o)
      if (existing) { existing.value += v; existing.count++ }
      else monthMap.set(k, { value: v, count: 1 })
    })
    const monthlySpend: MonthlySpend[] = [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, { value, count }]) => ({ monthKey: k, label: monthLabel(k), value, count }))

    // Top items
    const topItems = buildTopItems(sOrders, supplierName, 6)

    // Linked assets
    const linkedAssets = [...new Set(sOrders.map(o => o.assetId).filter((a): a is string => !!a))]

    // Risk
    const { score: riskScore, level: riskLevel } = computeRisk(
      cancelRate, shareOfTotal, daysSinceLastOrder, active, totalSup,
    )

    supplierMetrics.push({
      supplierId: supplierId === '__unknown__' ? '_unknown' : supplierId,
      supplierName,
      supplierType,
      active,
      cnpj:    supplier?.cnpj,
      contact: supplier?.contact,

      totalOrders:     totalSup,
      approvedOrders:  approved,
      receivedOrders:  received,
      cancelledOrders: cancelled,
      pendingOrders:   pending,
      draftOrders:     draft,

      totalSpend:        totalSuppSpend,
      avgOrderValue,
      maxOrderValue,
      shareOfTotalSpend: shareOfTotal,
      cancelRate,

      lastOrderDate,
      daysSinceLastOrder,
      firstOrderDate,
      monthlySpend,
      topItems,
      linkedAssets,

      riskScore,
      riskLevel,
    })
  })

  // Sort by total spend descending
  supplierMetrics.sort((a, b) => b.totalSpend - a.totalSpend)

  // ── Active supplier count (has orders OR is active in DB) ──
  const activeSupplierCount = supplierMetrics.filter(s =>
    s.totalOrders > 0 || (s.active && s.supplierId !== '_unknown')).length

  // ── Avg order value ───────────────────────────────────────
  const avgOrderValue = totalOrders > 0 ? totalSpend / totalOrders : 0

  // ── Approval rate ─────────────────────────────────────────
  const actionable = orders.filter(o => o.status !== 'draft').length
  const positive   = orders.filter(o => o.status === 'approved' || o.status === 'received' || o.status === 'ordered').length
  const approvalRate = actionable > 0 ? Math.round((positive / actionable) * 100) : 0
  const totalCancelled = orders.filter(o => o.status === 'cancelled').length

  // ── Monthly global trend ──────────────────────────────────
  const globalMonthMap = new Map<string, { value: number; count: number }>()
  orders.forEach(o => {
    const d = tsToDate(o.createdAt)
    if (!d) return
    const k = monthKey(d)
    const v = orderValue(o)
    const existing = globalMonthMap.get(k)
    if (existing) { existing.value += v; existing.count++ }
    else globalMonthMap.set(k, { value: v, count: 1 })
  })
  const monthlyTrend: MonthlySpend[] = [...globalMonthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, { value, count }]) => ({ monthKey: k, label: monthLabel(k), value, count }))

  // ── Supplier type breakdown ───────────────────────────────
  const typeMap = new Map<string, { value: number; count: number }>()
  supplierMetrics.forEach(sm => {
    if (sm.totalOrders === 0) return
    const t = sm.supplierType
    const ex = typeMap.get(t)
    if (ex) { ex.value += sm.totalSpend; ex.count += sm.totalOrders }
    else typeMap.set(t, { value: sm.totalSpend, count: sm.totalOrders })
  })

  const TYPE_COLORS: Record<string, string> = {
    purchase: '#2563eb', service: '#7c3aed', both: '#0891b2', unknown: '#94a3b8',
  }

  const typeBreakdown: TypeSpend[] = [...typeMap.entries()]
    .sort(([, a], [, b]) => b.value - a.value)
    .map(([type, { value, count }]) => ({
      type,
      label: SUPPLIER_TYPE_META[type]?.label ?? type,
      value, count,
      color: TYPE_COLORS[type] ?? '#94a3b8',
    }))

  // ── Status distribution ───────────────────────────────────
  const statusMap = new Map<string, { count: number; value: number }>()
  orders.forEach(o => {
    const ex = statusMap.get(o.status)
    const v  = orderValue(o)
    if (ex) { ex.count++; ex.value += v }
    else statusMap.set(o.status, { count: 1, value: v })
  })

  const statusDistribution: StatusCount[] = [...statusMap.entries()]
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([status, { count, value }]) => ({
      status,
      label: STATUS_META_PURCHASE[status]?.label ?? status,
      count, value,
      color: STATUS_META_PURCHASE[status]?.color ?? '#94a3b8',
    }))

  // ── Top items globally ────────────────────────────────────
  const globalItemMap = new Map<string, { count: number; value: number; suppliers: Set<string> }>()
  supplierMetrics.forEach(sm => {
    sm.topItems.forEach(it => {
      const key = it.description
      const ex  = globalItemMap.get(key)
      if (ex) {
        ex.count += it.count
        ex.value += it.totalValue
        it.suppliers.forEach(s => ex.suppliers.add(s))
      } else {
        globalItemMap.set(key, {
          count: it.count, value: it.totalValue, suppliers: new Set(it.suppliers),
        })
      }
    })
  })

  const topItems: TopItem[] = [...globalItemMap.entries()]
    .sort(([, a], [, b]) => b.count - a.count || b.value - a.value)
    .slice(0, 15)
    .map(([description, { count, value, suppliers }]) => ({
      description, count, totalValue: value, suppliers: [...suppliers],
    }))

  // ── Alerts ────────────────────────────────────────────────
  const alerts: PurchasingAlert[] = []

  // High concentration
  supplierMetrics.filter(s => s.totalOrders > 0 && s.shareOfTotalSpend > 40).forEach(s => {
    alerts.push({
      type: 'high_concentration',
      supplierId: s.supplierId, supplierName: s.supplierName,
      message: `${s.supplierName} concentra ${Math.round(s.shareOfTotalSpend)}% do gasto total no período`,
      severity: s.shareOfTotalSpend > 60 ? 'critical' : 'warning',
      value: s.shareOfTotalSpend,
    })
  })

  // High cancellation
  supplierMetrics.filter(s => s.totalOrders >= 3 && s.cancelRate > 0.4).forEach(s => {
    alerts.push({
      type: 'high_cancellation',
      supplierId: s.supplierId, supplierName: s.supplierName,
      message: `${s.supplierName}: ${Math.round(s.cancelRate * 100)}% das ordens canceladas (${s.cancelledOrders}/${s.totalOrders})`,
      severity: s.cancelRate > 0.6 ? 'critical' : 'warning',
      value: s.cancelRate,
    })
  })

  // Month-over-month spend spike
  if (monthlyTrend.length >= 2) {
    const last = monthlyTrend[monthlyTrend.length - 1]
    const prev = monthlyTrend[monthlyTrend.length - 2]
    if (prev.value > 0 && last.value / prev.value > 1.5) {
      alerts.push({
        type: 'spend_spike',
        message: `Gasto em ${last.label} foi ${Math.round((last.value / prev.value - 1) * 100)}% acima de ${prev.label}`,
        severity: last.value / prev.value > 2 ? 'critical' : 'warning',
        value: last.value,
      })
    }
  }

  // Dormant active suppliers (active in DB but no orders in period)
  supplierMap.forEach((supplier, sid) => {
    if (!supplier.active) return
    const metrics = supplierMetrics.find(s => s.supplierId === sid)
    if (metrics && metrics.totalOrders === 0) {
      // Only flag if they had orders before (can't know without full history query here)
      // Skip - would need historical data to be reliable
    }
  })

  // High-value pending orders
  const highValuePending = orders.filter(o =>
    o.status === 'pending' && orderValue(o) > 5000)
  if (highValuePending.length > 0) {
    const total = highValuePending.reduce((s, o) => s + orderValue(o), 0)
    alerts.push({
      type: 'pending_high_value',
      message: `${highValuePending.length} pedido${highValuePending.length > 1 ? 's' : ''} de alto valor aguardando aprovação (total: R$${(total / 1000).toFixed(1)}k)`,
      severity: highValuePending.length > 3 ? 'critical' : 'warning',
      value: total,
    })
  }

  // Sort alerts: critical first
  alerts.sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1))

  const result: PurchasingAnalyticsData = {
    period, computedAt: new Date(),
    totalSpend, totalOrders,
    activeSuppliers: activeSupplierCount,
    avgOrderValue, approvalRate, totalCancelled,
    suppliers: supplierMetrics,
    monthlyTrend, typeBreakdown, statusDistribution, topItems,
    alerts,
  }

  writeCache(result, period)
  return result
}

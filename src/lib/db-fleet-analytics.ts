// src/lib/db-fleet-analytics.ts
//
// Data layer for Fleet Analytics module.
// Sources: vehicle_state, checklists_frota, work_orders, purchase_orders
// Vehicle catalog: static FROTA_DB (no Firestore reads needed for vehicle list)
// Cache: localStorage, TTL 30 min

import { collection, getDocs, query, where } from 'firebase/firestore'
import { db }             from './firebase'
import { getPeriodRanges } from '@/types/dashboard'
import { FROTA_DB }       from '@/data/fleet-catalog'
import type { FleetPeriod, FleetRiskLevel, VehicleStatus, VehicleTrend } from '@/types/fleet-analytics'
import type {
  VehicleMetrics, FleetAnalyticsData, FleetCostByMonth, FleetAlert,
} from '@/types/fleet-analytics'

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

function poCost(data: DocData): number {
  const items = (data.items as Array<{ precoTotal?: number }>) ?? []
  return items.reduce((s, i) => s + (i.precoTotal ?? 0), 0)
}

// ── Cache ─────────────────────────────────────────────────────

const CACHE_KEY = 'fleet_analytics_v1'
const CACHE_TTL = 30 * 60 * 1000

interface CacheEntry { data: FleetAnalyticsData; ts: number; period: string }

function readCache(period: string): FleetAnalyticsData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (entry.period !== period || Date.now() - entry.ts > CACHE_TTL) return null
    entry.data.computedAt = new Date(entry.data.computedAt)
    return entry.data
  } catch { return null }
}

function writeCache(data: FleetAnalyticsData, period: string) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now(), period })) }
  catch { /* storage full */ }
}

export function clearFleetCache() { localStorage.removeItem(CACHE_KEY) }

// ── Risk score ────────────────────────────────────────────────

function computeRisk(
  failureCount: number, downtimeHours: number,
  totalNc: number, osOpen: number, status: string,
): { score: number; level: FleetRiskLevel } {
  let s = 0
  s += Math.min(failureCount * 10, 30)
  s += Math.min((downtimeHours / 8) * 4, 20)
  s += Math.min(totalNc * 2, 20)
  s += status === 'critical' || status === 'stopped' ? 20
     : status === 'in_maintenance' ? 12
     : status === 'attention' || status === 'preventive_due' ? 8 : 0
  s += Math.min(osOpen * 5, 10)
  const score = Math.min(Math.round(s), 100)
  const level: FleetRiskLevel =
    score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 20 ? 'medium' : 'low'
  return { score, level }
}

// ── Main fetch ────────────────────────────────────────────────

export async function fetchFleetAnalytics(
  period: FleetPeriod, force = false,
): Promise<FleetAnalyticsData> {

  const cached = force ? null : readCache(period)
  if (cached) return cached

  const { current } = getPeriodRanges(period)
  const fromDate      = current.from
  const fromMs        = fromDate.getTime()

  // Parallel Firestore queries
  const [stateSnap, inspSnap, osSnap, poSnap] = await Promise.all([
    getDocs(collection(db, 'vehicle_state')),
    getDocs(query(collection(db, 'checklists_frota'),
      where('timestampEnvio', '>=', fromMs))),
    getDocs(query(collection(db, 'work_orders'),
      where('createdAt', '>=', fromDate))),
    getDocs(query(collection(db, 'purchase_orders'),
      where('createdAt', '>=', fromDate))),
  ])

  const vehicleIds = new Set(FROTA_DB.map(v => v.id))

  // vehicle_state map: vehicleId → data
  const stateMap = new Map<string, DocData>()
  stateSnap.docs.forEach(d => {
    const data = d.data() as DocData
    const vid  = (data.vehicleId ?? d.id) as string
    if (vehicleIds.has(vid)) stateMap.set(vid, { id: d.id, ...data })
  })

  // inspections map: vehicleId → rows[]
  const inspMap = new Map<string, DocData[]>()
  inspSnap.docs.forEach(d => {
    const data = { id: d.id, ...d.data() } as DocData
    const vid  = data.vehicleId as string | undefined
    if (!vid || !vehicleIds.has(vid)) return
    if (!inspMap.has(vid)) inspMap.set(vid, [])
    inspMap.get(vid)!.push(data)
  })

  // work orders map: vehicleId → rows[]
  const osMap = new Map<string, DocData[]>()
  osSnap.docs.forEach(d => {
    const data = { id: d.id, ...d.data() } as DocData
    const vid  = (data.originId ?? data.vehicleId) as string | undefined
    if (!vid || !vehicleIds.has(vid)) return
    if (!osMap.has(vid)) osMap.set(vid, [])
    osMap.get(vid)!.push(data)
  })

  // purchase orders map: vehicleId → rows[]
  const poMap = new Map<string, DocData[]>()
  poSnap.docs.forEach(d => {
    const data = { id: d.id, ...d.data() } as DocData
    const vid  = data.vehicleId as string | undefined
    if (!vid || !vehicleIds.has(vid)) return
    if (!poMap.has(vid)) poMap.set(vid, [])
    poMap.get(vid)!.push(data)
  })

  // ── Per-vehicle aggregation ───────────────────────────────

  const vehicles: VehicleMetrics[] = FROTA_DB.map(vehicle => {
    const vid   = vehicle.id
    const state = stateMap.get(vid)

    // ── From vehicle_state ──────────────────────────────────
    const currentStatus = ((state?.currentStatus as string) ?? 'unknown') as VehicleStatus
    const failureCount  = (state?.failureCount  as number) ?? 0
    const downtimeHours = (state?.totalDowntimeHours as number) ?? 0
    const mtbfHours     = (state?.mtbfHours    as number) ?? null
    const mttrHours     = (state?.mttrHours    as number) ?? null
    const trend         = ((state?.trend        as string) ?? 'insufficient_data') as VehicleTrend
    const lastEventDesc = (state?.lastEventDesc as string) ?? null

    // ── From inspections ────────────────────────────────────
    const insps        = inspMap.get(vid) ?? []
    const inspCount    = insps.length
    const totalNcCount = insps.reduce((s, i) => s + ((i.nonConformities as number) ?? 0), 0)

    // Mileage: sort by timestampEnvio, get first and last readings
    const mileages = insps
      .map(i => {
        const h = i.header as Record<string, unknown> | undefined
        const km = (h?.mileage ?? i.mileage) as number | undefined
        return typeof km === 'number' && km > 0 ? km : null
      })
      .filter((k): k is number => k !== null)
      .sort((a, b) => a - b)

    const firstMileage  = mileages.length > 0 ? mileages[0] : null
    const latestMileage = mileages.length > 0 ? mileages[mileages.length - 1] : null
    const mileageDelta  = firstMileage !== null && latestMileage !== null && latestMileage > firstMileage
      ? latestMileage - firstMileage : null

    // ── From work orders ────────────────────────────────────
    const orders          = osMap.get(vid) ?? []
    const osTotal         = orders.length
    const osOpen          = orders.filter(o => {
      const s = (o.status as string ?? '')
      return s === 'open' || s === 'in_progress'
    }).length
    const correctiveCount = orders.filter(o => (o.maintenanceType as string) === 'corrective').length
    const preventiveCount = orders.filter(o => (o.maintenanceType as string) === 'preventive').length

    // ── From purchase orders (cost) ─────────────────────────
    const pos           = poMap.get(vid) ?? []
    let totalCost       = 0
    const costMonths    = new Map<string, number>()

    pos.forEach(po => {
      const cost = poCost(po)
      totalCost += cost
      const date = tsToDate(po.createdAt) ?? (po.timestampEnvio ? new Date(po.timestampEnvio as number) : null)
      if (date && cost > 0) {
        const k = monthKey(date)
        costMonths.set(k, (costMonths.get(k) ?? 0) + cost)
      }
    })

    const costByMonth: FleetCostByMonth[] = [...costMonths.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, c]) => ({ monthKey: k, label: monthLabel(k), cost: c }))

    const costPerKm = mileageDelta && mileageDelta > 0 && totalCost > 0
      ? parseFloat((totalCost / mileageDelta).toFixed(2)) : null

    // ── Risk ─────────────────────────────────────────────────
    const { score: riskScore, level: riskLevel } = computeRisk(
      failureCount, downtimeHours, totalNcCount, osOpen, currentStatus,
    )

    return {
      vehicleId: vid,
      placa:     vehicle.placa,
      modelo:    vehicle.modelo,
      categoria: vehicle.categoria,
      icone:     vehicle.icone,
      motorista: vehicle.motoristaPadrao ?? '—',
      currentStatus, failureCount, downtimeHours, mtbfHours, mttrHours, trend, lastEventDesc,
      inspectionCount: inspCount, totalNcCount, latestMileage, firstMileage,
      osTotal, osOpen, correctiveCount, preventiveCount,
      totalCost, costByMonth, mileageDelta, costPerKm,
      riskScore, riskLevel,
    }
  })

  // Sort by risk score descending
  vehicles.sort((a, b) => b.riskScore - a.riskScore)

  // ── Global KPIs ───────────────────────────────────────────

  const criticalCount        = vehicles.filter(v => v.riskLevel === 'critical').length
  const totalCostPeriod      = vehicles.reduce((s, v) => s + v.totalCost, 0)
  const totalOsOpen          = vehicles.reduce((s, v) => s + v.osOpen, 0)
  const totalNcPeriod        = vehicles.reduce((s, v) => s + v.totalNcCount, 0)
  const totalDowntimeHours   = vehicles.reduce((s, v) => s + v.downtimeHours, 0)
  const mtbfValues           = vehicles.map(v => v.mtbfHours).filter((h): h is number => h !== null)
  const avgMtbfHours         = mtbfValues.length
    ? Math.round(mtbfValues.reduce((a, b) => a + b, 0) / mtbfValues.length) : null

  // Global cost by month
  const globalMap = new Map<string, number>()
  vehicles.slice(0, 10).forEach(v =>
    v.costByMonth.forEach(({ monthKey, cost }) =>
      globalMap.set(monthKey, (globalMap.get(monthKey) ?? 0) + cost)))
  const globalCostByMonth: FleetCostByMonth[] = [...globalMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, c]) => ({ monthKey: k, label: monthLabel(k), cost: c }))

  // ── Alerts ────────────────────────────────────────────────

  const alerts: FleetAlert[] = []
  vehicles.forEach(v => {
    if (v.currentStatus === 'critical' || v.currentStatus === 'stopped') {
      alerts.push({
        vehicleId: v.vehicleId, plate: v.placa, vehicleName: v.modelo,
        type: 'critical_state',
        message: `${v.placa} (${v.modelo}) — ${v.currentStatus === 'critical' ? 'estado crítico' : 'veículo parado'}`,
        severity: 'critical',
      })
    }
    if (v.failureCount >= 3) {
      alerts.push({
        vehicleId: v.vehicleId, plate: v.placa, vehicleName: v.modelo,
        type: 'repeated_failures',
        message: `${v.placa}: ${v.failureCount} falhas registradas — risco de parada`,
        severity: v.failureCount >= 5 ? 'critical' : 'warning',
      })
    }
    if (v.downtimeHours >= 24) {
      alerts.push({
        vehicleId: v.vehicleId, plate: v.placa, vehicleName: v.modelo,
        type: 'downtime',
        message: `${v.placa}: ${Math.round(v.downtimeHours)}h de indisponibilidade acumulada`,
        severity: v.downtimeHours >= 72 ? 'critical' : 'warning',
      })
    }
    if (v.totalNcCount >= 5) {
      alerts.push({
        vehicleId: v.vehicleId, plate: v.placa, vehicleName: v.modelo,
        type: 'high_nc',
        message: `${v.placa}: ${v.totalNcCount} não-conformidades em inspeções`,
        severity: v.totalNcCount >= 10 ? 'critical' : 'warning',
      })
    }
    if (v.osOpen >= 3) {
      alerts.push({
        vehicleId: v.vehicleId, plate: v.placa, vehicleName: v.modelo,
        type: 'os_flood',
        message: `${v.placa}: ${v.osOpen} OS abertas simultaneamente`,
        severity: 'warning',
      })
    }
  })
  alerts.sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1))

  const result: FleetAnalyticsData = {
    vehicles, totalVehicles: vehicles.length,
    criticalCount, totalCostPeriod, totalOsOpen, totalNcPeriod,
    avgMtbfHours, totalDowntimeHours,
    globalCostByMonth, alerts,
    computedAt: new Date(), period,
  }

  writeCache(result, period)
  return result
}

// src/lib/db-machinery-analytics.ts
//
// Data layer for the Machinery Analytics module.
// Fetches from: assets, asset_maintenance, work_orders, machine_state
// Aggregates client-side — no Cloud Functions required.
// Results are cached in localStorage for 30 minutes per period.

import {
  collection, getDocs, query, where,
} from 'firebase/firestore'
import { db }            from './firebase'
import { getPeriodRanges } from '@/types/dashboard'
import type { AnalyticsPeriod } from '@/types/machinery-analytics'
import type {
  MachineMetrics, MachineryAnalyticsData,
  CostByMonth, RecurrentIssue, MachineAlert, MachineRiskLevel,
} from '@/types/machinery-analytics'

// ── Helpers ───────────────────────────────────────────────────

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

type DocData = Record<string, unknown>

// ── Cache ─────────────────────────────────────────────────────

const CACHE_KEY = 'mach_analytics_v1'
const CACHE_TTL = 30 * 60 * 1000

interface CacheEntry {
  data: MachineryAnalyticsData
  ts:   number
  period: string
}

function readCache(period: string): MachineryAnalyticsData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (entry.period !== period || Date.now() - entry.ts > CACHE_TTL) return null
    entry.data.computedAt = new Date(entry.data.computedAt)
    return entry.data
  } catch { return null }
}

function writeCache(data: MachineryAnalyticsData, period: string) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now(), period }))
  } catch { /* storage full */ }
}

export function clearMachineryCache() {
  localStorage.removeItem(CACHE_KEY)
}

// ── Risk score ────────────────────────────────────────────────

function riskScore(
  totalCost: number, corrCount: number,
  osOpen: number, overdueCount: number,
  state: string,
): { score: number; level: MachineRiskLevel } {
  let s = 0
  s += Math.min((totalCost / 3000) * 25, 25)
  s += Math.min(corrCount * 7, 30)
  s += Math.min(osOpen * 5, 20)
  s += Math.min(overdueCount * 5, 15)
  s += state === 'danger' ? 10 : state === 'warning' ? 5 : 0
  const score = Math.min(Math.round(s), 100)
  const level: MachineRiskLevel =
    score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 20 ? 'medium' : 'low'
  return { score, level }
}

// ── Main fetch ────────────────────────────────────────────────

export async function fetchMachineryAnalytics(
  period: AnalyticsPeriod,
  force = false,
): Promise<MachineryAnalyticsData> {

  const cached = force ? null : readCache(period)
  if (cached) return cached

  const { current } = getPeriodRanges(period)
  const fromDate = current.from
  const now = new Date()

  // Parallel queries — single-field range, no composite index needed
  const [assetsSnap, maintSnap, osSnap, stateSnap] = await Promise.all([
    getDocs(collection(db, 'assets')),
    getDocs(query(collection(db, 'asset_maintenance'),
      where('createdAt', '>=', fromDate))),
    getDocs(query(collection(db, 'work_orders'),
      where('createdAt', '>=', fromDate))),
    getDocs(collection(db, 'machine_state')),
  ])

  // ── Build lookup maps ─────────────────────────────────────

  // machine_state: docId = assetId
  const stateMap = new Map<string, 'ok' | 'warning' | 'danger'>()
  stateSnap.docs.forEach(d => {
    const s = d.data().status as string
    if (s === 'ok' || s === 'warning' || s === 'danger') stateMap.set(d.id, s)
  })

  // maintenance: assetId → rows[]
  const maintMap = new Map<string, DocData[]>()
  maintSnap.docs.forEach(d => {
    const data = { id: d.id, ...d.data() } as DocData
    const aid  = data.assetId as string | undefined
    if (!aid) return
    if (!maintMap.has(aid)) maintMap.set(aid, [])
    maintMap.get(aid)!.push(data)
  })

  // work orders: assetId → rows[]
  const osMap = new Map<string, DocData[]>()
  osSnap.docs.forEach(d => {
    const data = { id: d.id, ...d.data() } as DocData
    const aid  = data.assetId as string | undefined
    if (!aid) return
    if (!osMap.has(aid)) osMap.set(aid, [])
    osMap.get(aid)!.push(data)
  })

  // ── Per-machine aggregation ───────────────────────────────

  const machines: MachineMetrics[] = []

  assetsSnap.docs.forEach(assetDoc => {
    const a       = assetDoc.data() as DocData
    const assetId = assetDoc.id

    // Basic info
    const name       = (a.name ?? a.nome ?? 'Sem nome') as string
    const code       = (a.code ?? a.codePrefix ?? '') as string
    const categoryId = (a.categoryId ?? '') as string
    const location   = (a.location ?? a.setor ?? '') as string
    const assetStatus = (a.status ?? 'ativo') as string
    const currentState = stateMap.get(assetId) ?? 'unknown'

    // ── Maintenance ──────────────────────────────────────────
    const maints = maintMap.get(assetId) ?? []
    let totalCost = 0
    let prevCount = 0, corrCount = 0, inspCount = 0, overdueCount = 0
    const resDays: number[] = []
    const costMonths = new Map<string, number>()
    const descCount  = new Map<string, number>()
    const corrDates:  Date[] = []

    for (const m of maints) {
      const cost   = (m.cost   as number) ?? 0
      const type   = ((m.type  as string) ?? '').toLowerCase()
      const status = ((m.status as string) ?? '').toLowerCase()
      const sched  = tsToDate(m.scheduledDate)
      const done   = tsToDate(m.completedDate ?? m.completedAt)
      const created = tsToDate(m.createdAt) ?? sched

      totalCost += cost

      if (type.includes('prev')) prevCount++
      else if (type.includes('insp')) inspCount++
      else { corrCount++; if (created) corrDates.push(created) }

      // Overdue: scheduled past now and not done
      if (sched && sched < now &&
          status !== 'concluida' && status !== 'concluido' && status !== 'completed') {
        overdueCount++
      }

      // Resolution time
      if (done && created) {
        const d = (done.getTime() - created.getTime()) / 86_400_000
        if (d >= 0 && d < 365) resDays.push(d)
      }

      // Cost by month
      if (created && cost > 0) {
        const k = monthKey(created)
        costMonths.set(k, (costMonths.get(k) ?? 0) + cost)
      }

      // Recurring descriptions
      const desc = ((m.description as string) ?? '').trim().slice(0, 80)
      if (desc) descCount.set(desc, (descCount.get(desc) ?? 0) + 1)
    }

    // MTBF: mean days between corrective events
    let mtbf: number | null = null
    if (corrDates.length >= 2) {
      corrDates.sort((a, b) => a.getTime() - b.getTime())
      const gaps: number[] = []
      for (let i = 1; i < corrDates.length; i++) {
        gaps.push((corrDates[i].getTime() - corrDates[i - 1].getTime()) / 86_400_000)
      }
      mtbf = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
    }

    const avgResDays = resDays.length
      ? Math.round(resDays.reduce((a, b) => a + b, 0) / resDays.length) : 0

    const costByMonth: CostByMonth[] = [...costMonths.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, c]) => ({ monthKey: k, label: monthLabel(k), cost: c }))

    const recurrent: RecurrentIssue[] = [...descCount.entries()]
      .filter(([, n]) => n >= 2)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([description, count]) => ({ description, count }))

    // ── Work orders ──────────────────────────────────────────
    const orders   = osMap.get(assetId) ?? []
    const osTotal  = orders.length
    const osOpen   = orders.filter(o => {
      const s = (o.status as string ?? '')
      return s === 'open' || s === 'in_progress'
    }).length

    // ── Risk ─────────────────────────────────────────────────
    const { score, level } = riskScore(
      totalCost, corrCount, osOpen, overdueCount, currentState,
    )

    machines.push({
      assetId, name, code, categoryId, location, assetStatus, currentState,
      totalCost, costByMonth,
      maintTotal: maints.length, prevCount, corrCount, inspCount,
      overdueCount, avgResDays, mtbf, recurrent,
      osTotal, osOpen,
      riskScore: score, riskLevel: level,
    })
  })

  // Sort by risk score descending
  machines.sort((a, b) => b.riskScore - a.riskScore)

  // ── Global KPIs ───────────────────────────────────────────

  const totalCostPeriod = machines.reduce((s, m) => s + m.totalCost, 0)
  const criticalCount   = machines.filter(m => m.riskLevel === 'critical').length
  const totalOsOpen     = machines.reduce((s, m) => s + m.osOpen, 0)
  const totalOverdue    = machines.reduce((s, m) => s + m.overdueCount, 0)

  const mtbfValues = machines.map(m => m.mtbf).filter((v): v is number => v !== null)
  const avgMtbf = mtbfValues.length
    ? Math.round(mtbfValues.reduce((a, b) => a + b, 0) / mtbfValues.length) : null

  // ── Global cost by month (top 5 machines only to keep chart readable) ──
  const globalMap = new Map<string, number>()
  machines.slice(0, 10).forEach(m =>
    m.costByMonth.forEach(({ monthKey, cost }) =>
      globalMap.set(monthKey, (globalMap.get(monthKey) ?? 0) + cost)))
  const globalCostByMonth: CostByMonth[] = [...globalMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, c]) => ({ monthKey: k, label: monthLabel(k), cost: c }))

  // ── Alerts ────────────────────────────────────────────────

  const alerts: MachineAlert[] = []
  machines.forEach(m => {
    if (m.riskLevel === 'critical' || m.currentState === 'danger') {
      alerts.push({
        assetId: m.assetId, machineName: m.name,
        type: 'critical_state',
        message: `${m.name} em estado crítico — score de risco ${m.riskScore}`,
        severity: 'critical',
      })
    }
    if (m.corrCount >= 3) {
      alerts.push({
        assetId: m.assetId, machineName: m.name,
        type: 'repeated_failures',
        message: `${m.name}: ${m.corrCount} falhas corretivas no período`,
        severity: m.corrCount >= 5 ? 'critical' : 'warning',
      })
    }
    if (m.overdueCount >= 2) {
      alerts.push({
        assetId: m.assetId, machineName: m.name,
        type: 'overdue',
        message: `${m.name}: ${m.overdueCount} manutenções atrasadas`,
        severity: 'warning',
      })
    }
    if (m.osOpen >= 3) {
      alerts.push({
        assetId: m.assetId, machineName: m.name,
        type: 'os_flood',
        message: `${m.name}: ${m.osOpen} OS abertas simultaneamente`,
        severity: 'warning',
      })
    }
  })
  alerts.sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1))

  const result: MachineryAnalyticsData = {
    machines, totalMachines: machines.length,
    criticalCount, totalCostPeriod, totalOsOpen, totalOverdue, avgMtbf,
    globalCostByMonth, alerts,
    computedAt: new Date(), period,
  }

  writeCache(result, period)
  return result
}

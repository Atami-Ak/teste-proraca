// src/lib/db-cleaning-analytics.ts
//
// Data layer for the 5S Cleaning Analytics module.
// Reads: cleaning_inspections (primary) + auditorias_limpeza (legacy)
// Deduplicates by zone+timestamp key, aggregates client-side.
// Results cached in localStorage for 30 minutes per period.

import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { getPeriodRanges } from '@/types/dashboard'
import { CATALOGO_ZONAS, EQUIPE_LIMPEZA } from '@/data/cleaning-catalog'
import type { SectionScore, Issue, InspectionStatus } from '@/types/cleaning'
import type {
  AnalyticsPeriod,
  CleaningAlert,
  CleaningAnalyticsData,
  CleaningRiskLevel,
  FiveSItem,
  FiveSScore,
  InspectorMetrics,
  IssuePattern,
  MonthlyTrend,
  NonConformityPattern,
  ScorePoint,
  ZoneMetrics,
  ZoneTrend,
} from '@/types/cleaning-analytics'

// ── Internal normalized type ──────────────────────────────────

interface NormalizedInspection {
  id:               string
  zoneId:           string
  zoneName:         string
  score:            number
  sections:         SectionScore[]
  issues:           Issue[]
  hasCriticalIssue: boolean
  timestampEnvio:   number
  employeeId:       string
  employeeName:     string
  status:           InspectionStatus
}

type DocData = Record<string, unknown>

// ── Cache ─────────────────────────────────────────────────────

const CACHE_KEY = 'clean_analytics_v2'
const CACHE_TTL = 30 * 60 * 1000

interface CacheEntry {
  data:   CleaningAnalyticsData
  ts:     number
  period: string
}

function readCache(period: string): CleaningAnalyticsData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (entry.period !== period || Date.now() - entry.ts > CACHE_TTL) return null
    entry.data.computedAt = new Date(entry.data.computedAt)
    return entry.data
  } catch { return null }
}

function writeCache(data: CleaningAnalyticsData, period: string) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now(), period }))
  } catch { /* storage full */ }
}

export function clearCleaningAnalyticsCache() {
  localStorage.removeItem(CACHE_KEY)
}

// ── Helpers ───────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (!nums.length) return 0
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

function monthKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`
}

// Identify which 5S pillar a section belongs to by its ID or name.
function getSectionS(id: string, nome: string = ''): keyof FiveSScore | null {
  const combined = `${id} ${nome}`.toLowerCase()
  if (combined.includes('seiri'))    return 'seiri'
  if (combined.includes('seiton'))   return 'seiton'
  if (combined.includes('seiso'))    return 'seiso'
  if (combined.includes('seiketsu')) return 'seiketsu'
  if (combined.includes('shitsuke')) return 'shitsuke'
  // Fall back to ordinal cues in the section name
  if (combined.includes('s1 —') || combined.includes('utiliza')) return 'seiri'
  if (combined.includes('s2 —') || combined.includes('organiz'))  return 'seiton'
  if (combined.includes('s3 —') || combined.includes('limpeza'))  return 'seiso'
  if (combined.includes('s4 —') || combined.includes('padroniz')) return 'seiketsu'
  if (combined.includes('s5 —') || combined.includes('disciplin')) return 'shitsuke'
  return null
}

// Normalize documents from either collection into a common shape.
function normalizeDoc(data: DocData, docId: string): NormalizedInspection | null {
  const zoneId  = ((data.zoneId  ?? data.zonaId  ?? '') as string).trim()
  const zoneName = ((data.zoneName ?? data.nomeZona ?? '') as string).trim()
  const tsEnvio  = (data.timestampEnvio ?? 0) as number

  // Skip records without zone or timestamp
  if (!zoneId || !tsEnvio) return null

  const rawScore = data.score ?? data.pontuacao ?? 0
  const score    = typeof rawScore === 'number' ? Math.max(0, Math.min(100, rawScore)) : 0

  const rawSections = (data.sections ?? data.secoes ?? []) as unknown[]
  const sections = (Array.isArray(rawSections) ? rawSections : []) as SectionScore[]

  const rawIssues = (data.issues ?? data.irregularidades ?? []) as unknown[]
  const issues = (Array.isArray(rawIssues) ? rawIssues : []) as Issue[]

  const hasCriticalIssue = (data.hasCriticalIssue ?? false) as boolean

  const employeeId   = ((data.employeeId   ?? '') as string).trim()
  const employeeName = ((data.employeeName ?? data.inspetor ?? data.inspectorName ?? '') as string).trim()

  const rawStatus   = (data.status ?? 'attention') as InspectionStatus
  const validStatus = ['excellent','acceptable','attention','critical'].includes(rawStatus)
  const status      = validStatus ? rawStatus : 'attention'

  return {
    id: docId,
    zoneId, zoneName, score, sections, issues,
    hasCriticalIssue, timestampEnvio: tsEnvio,
    employeeId, employeeName, status,
  }
}

// Zone catalog lookup maps
const ZONE_MAP = new Map(CATALOGO_ZONAS.map(z => [z.id, z]))
const EMP_MAP  = new Map(EQUIPE_LIMPEZA.map(e => [e.id, e]))

// ── Zone risk score ───────────────────────────────────────────

function computeRisk(
  avgScore:              number,
  nonConformities:       number,
  criticalIssues:        number,
  daysSince:             number | null,
  trend:                 ZoneTrend,
): { score: number; level: CleaningRiskLevel } {
  let s = 0
  s += (100 - avgScore) * 0.35          // max 35: low score → high risk
  s += Math.min(nonConformities * 3, 25) // max 25: recurring non-conformities
  s += Math.min(criticalIssues * 10, 20) // max 20: critical issues
  if (daysSince !== null) {
    if (daysSince > 30) s += 12
    else if (daysSince > 14) s += 6
  }
  if (trend === 'declining') s += 8      // max 8: declining trend

  const score = Math.min(Math.round(s), 100)
  const level: CleaningRiskLevel =
    score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 20 ? 'medium' : 'low'
  return { score, level }
}

// ── Main fetch ────────────────────────────────────────────────

export async function fetchCleaningAnalytics(
  period: AnalyticsPeriod,
  force  = false,
): Promise<CleaningAnalyticsData> {

  const cached = force ? null : readCache(period)
  if (cached) return cached

  const { current } = getPeriodRanges(period)
  const fromTs = current.from.getTime()
  const now    = Date.now()

  // Fetch both collections in parallel
  const [newSnap, legacySnap] = await Promise.all([
    getDocs(query(
      collection(db, 'cleaning_inspections'),
      where('timestampEnvio', '>=', fromTs),
    )),
    getDocs(query(
      collection(db, 'auditorias_limpeza'),
      where('timestampEnvio', '>=', fromTs),
    )),
  ])

  // Normalize + deduplicate by zoneId+ts key (legacy may mirror new writes)
  const seen = new Set<string>()
  const all: NormalizedInspection[] = []

  for (const snap of [newSnap, legacySnap]) {
    snap.docs.forEach(d => {
      const insp = normalizeDoc({ id: d.id, ...d.data() }, d.id)
      if (!insp) return
      const key = `${insp.zoneId}-${insp.timestampEnvio}`
      if (!seen.has(key)) {
        seen.add(key)
        all.push(insp)
      }
    })
  }

  // ── Build per-zone map ────────────────────────────────────

  const zoneMap = new Map<string, NormalizedInspection[]>()
  all.forEach(insp => {
    if (!zoneMap.has(insp.zoneId)) zoneMap.set(insp.zoneId, [])
    zoneMap.get(insp.zoneId)!.push(insp)
  })

  // Ensure every catalog zone appears even with no data
  CATALOGO_ZONAS.forEach(z => {
    if (!zoneMap.has(z.id)) zoneMap.set(z.id, [])
  })

  // ── Per-zone aggregation ──────────────────────────────────

  const zones: ZoneMetrics[] = []

  zoneMap.forEach((inspections, zoneId) => {
    const catalogZone = ZONE_MAP.get(zoneId)
    const zoneName    = catalogZone?.nome ?? inspections[0]?.zoneName ?? zoneId
    const zoneIcon    = catalogZone?.icone ?? '📋'
    const sector      = catalogZone?.setor ?? ''

    const sorted = [...inspections].sort((a, b) => a.timestampEnvio - b.timestampEnvio)
    const total  = sorted.length

    // ── Scores ────────────────────────────────────────────
    const scores = sorted.map(i => i.score)
    const averageScore  = avg(scores)
    const latestScore   = total > 0 ? sorted[total - 1].score : null
    const latestTs      = total > 0 ? sorted[total - 1].timestampEnvio : null
    const latestInspector = total > 0 ? sorted[total - 1].employeeName : null
    const latestStatus  = total > 0 ? sorted[total - 1].status : 'no_data' as const

    // Score history (last 12 inspections)
    const scoreHistory: ScorePoint[] = sorted.slice(-12).map(i => ({
      ts:    i.timestampEnvio,
      score: i.score,
      label: new Date(i.timestampEnvio).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }),
    }))

    // ── 5S Breakdown ──────────────────────────────────────
    const sBuckets: Record<keyof FiveSScore, number[]> = {
      seiri: [], seiton: [], seiso: [], seiketsu: [], shitsuke: [],
    }

    sorted.forEach(insp => {
      ;(insp.sections ?? []).forEach(sec => {
        const s = getSectionS(sec.id, sec.nome)
        if (s && typeof sec.score === 'number') sBuckets[s].push(sec.score)
      })
    })

    const fiveSScores: FiveSScore = {
      seiri:    avg(sBuckets.seiri),
      seiton:   avg(sBuckets.seiton),
      seiso:    avg(sBuckets.seiso),
      seiketsu: avg(sBuckets.seiketsu),
      shitsuke: avg(sBuckets.shitsuke),
    }

    // If no section data, approximate from overall score
    const hasSection = Object.values(fiveSScores).some(v => v > 0)
    if (!hasSection && averageScore > 0) {
      fiveSScores.seiri    = averageScore
      fiveSScores.seiton   = averageScore
      fiveSScores.seiso    = averageScore
      fiveSScores.seiketsu = averageScore
      fiveSScores.shitsuke = averageScore
    }

    // ── Non-conformities & issues ─────────────────────────
    let nonConformities = 0
    let criticalIssues  = 0
    const issueDescCount = new Map<string, { count: number; severity: string; lastTs: number }>()

    sorted.forEach(insp => {
      const issueList = insp.issues ?? []
      nonConformities += issueList.length
      if (insp.hasCriticalIssue) criticalIssues++
      issueList.forEach(issue => {
        const desc = ((issue.description ?? '') as string).trim().slice(0, 80)
        if (!desc) return
        const existing = issueDescCount.get(desc)
        if (existing) {
          existing.count++
          if (insp.timestampEnvio > existing.lastTs) existing.lastTs = insp.timestampEnvio
        } else {
          issueDescCount.set(desc, {
            count: 1,
            severity: (issue.severity ?? 'low') as string,
            lastTs: insp.timestampEnvio,
          })
        }
      })
    })

    const topIssues: IssuePattern[] = [...issueDescCount.entries()]
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 6)
      .map(([description, { count, severity }]) => ({ description, count, severity }))

    // ── Compliance rate ───────────────────────────────────
    const compliant    = sorted.filter(i => i.score >= 70).length
    const complianceRate = total > 0 ? Math.round((compliant / total) * 100) : 0

    // ── Trend ─────────────────────────────────────────────
    let trend: ZoneTrend = 'no_data'
    let trendDelta = 0

    if (total >= 2) {
      const prev = sorted[total - 2].score
      const last = sorted[total - 1].score
      trendDelta = last - prev

      if (trendDelta >= 8)       trend = 'improving'
      else if (trendDelta <= -8) trend = 'declining'
      else                       trend = 'stable'
    } else if (total === 1) {
      trend = 'stable'
    }

    // ── Days since last inspection ─────────────────────────
    const daysSinceLastInspection = latestTs !== null
      ? Math.floor((now - latestTs) / 86_400_000)
      : null

    // ── Risk score ─────────────────────────────────────────
    const { score: riskScore, level: riskLevel } = computeRisk(
      averageScore, nonConformities, criticalIssues,
      daysSinceLastInspection, trend,
    )

    zones.push({
      zoneId, zoneName, zoneIcon, sector,
      totalInspections: total,
      averageScore, latestScore, latestTs, latestInspector, latestStatus,
      scoreHistory, fiveSScores,
      nonConformities, criticalIssues, complianceRate,
      trend, trendDelta,
      daysSinceLastInspection,
      riskScore, riskLevel,
      topIssues,
    })
  })

  // Sort by riskScore descending
  zones.sort((a, b) => b.riskScore - a.riskScore)

  // ── Global KPIs ───────────────────────────────────────────

  const totalInspections    = all.length
  const avgScore            = avg(all.map(i => i.score))
  const compliantTotal      = all.filter(i => i.score >= 70).length
  const complianceRate      = totalInspections > 0
    ? Math.round((compliantTotal / totalInspections) * 100) : 0
  const criticalZones       = zones.filter(z => z.riskLevel === 'critical').length
  const totalNonConformities = zones.reduce((s, z) => s + z.nonConformities, 0)
  const criticalIssues       = zones.reduce((s, z) => s + z.criticalIssues, 0)

  const mostRecent = all.reduce((mx, i) => Math.max(mx, i.timestampEnvio), 0)
  const daysSinceMostRecentInspection = mostRecent > 0
    ? Math.floor((now - mostRecent) / 86_400_000) : null

  // ── Global 5S items ───────────────────────────────────────

  type SKey = keyof FiveSScore
  const sKeys: SKey[] = ['seiri','seiton','seiso','seiketsu','shitsuke']
  const sMeta: Record<SKey, { number: number; name: string; short: string; description: string; color: string }> = {
    seiri:    { number: 1, name: 'Seiri — Utilização',    short: 'Seiri',    description: 'Eliminar o desnecessário, separar o útil do inútil',          color: '#3b82f6' },
    seiton:   { number: 2, name: 'Seiton — Organização',  short: 'Seiton',   description: 'Um lugar para tudo e tudo em seu lugar',                       color: '#8b5cf6' },
    seiso:    { number: 3, name: 'Seiso — Limpeza',        short: 'Seiso',    description: 'Limpar e inspecionar, identificar e eliminar fontes de sujeira', color: '#16a34a' },
    seiketsu: { number: 4, name: 'Seiketsu — Padronização', short: 'Seiketsu', description: 'Padronizar e manter os três primeiros S de forma consistente', color: '#ea580c' },
    shitsuke: { number: 5, name: 'Shitsuke — Disciplina',  short: 'Shitsuke', description: 'Manter, disciplinar e respeitar as normas estabelecidas',      color: '#dc2626' },
  }

  const fiveSItems: FiveSItem[] = sKeys.map(key => {
    const allScores = zones.flatMap(z => {
      const v = z.fiveSScores[key]
      return v > 0 ? [v] : []
    })
    const globalAvg = avg(allScores)

    const worstZone = [...zones]
      .filter(z => z.fiveSScores[key] > 0)
      .sort((a, b) => a.fiveSScores[key] - b.fiveSScores[key])[0]

    return {
      key,
      ...sMeta[key],
      avgScore:   globalAvg,
      worstZone:  worstZone?.zoneName ?? '—',
      worstScore: worstZone?.fiveSScores[key] ?? 0,
    }
  })

  // ── Monthly trend ─────────────────────────────────────────

  const monthBuckets = new Map<string, number[]>()
  all.forEach(insp => {
    const k = monthKey(insp.timestampEnvio)
    if (!monthBuckets.has(k)) monthBuckets.set(k, [])
    monthBuckets.get(k)!.push(insp.score)
  })

  const monthlyTrend: MonthlyTrend[] = [...monthBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, scores]) => {
      const inspCount  = scores.length
      const avgScoreM  = avg(scores)
      const compliance = Math.round((scores.filter(s => s >= 70).length / inspCount) * 100)
      return {
        monthKey: k, label: monthLabel(k),
        avgScore: avgScoreM, inspections: inspCount, compliance,
      }
    })

  // ── Non-conformity patterns ───────────────────────────────

  const ncMap = new Map<string, {
    count: number; zones: Set<string>;
    severity: 'critical' | 'low'; actionType: string; lastSeen: number
  }>()

  all.forEach(insp => {
    (insp.issues ?? []).forEach(issue => {
      const desc = ((issue.description ?? '') as string).trim().slice(0, 80)
      if (!desc) return
      const existing = ncMap.get(desc)
      if (existing) {
        existing.count++
        existing.zones.add(insp.zoneId)
        if (insp.timestampEnvio > existing.lastSeen) existing.lastSeen = insp.timestampEnvio
        if (issue.severity === 'critical') existing.severity = 'critical'
      } else {
        ncMap.set(desc, {
          count: 1,
          zones: new Set([insp.zoneId]),
          severity: (issue.severity ?? 'low') as 'critical' | 'low',
          actionType: (issue.actionType ?? 'cleaning') as string,
          lastSeen: insp.timestampEnvio,
        })
      }
    })
  })

  const topNonConformities: NonConformityPattern[] = [...ncMap.entries()]
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 15)
    .map(([description, data]) => ({
      description,
      count:      data.count,
      zones:      [...data.zones],
      severity:   data.severity,
      actionType: data.actionType,
      lastSeen:   data.lastSeen,
    }))

  // ── Inspector performance ─────────────────────────────────

  const inspMap = new Map<string, {
    name: string; cargo: string; scores: number[];
    zones: Set<string>; criticalFound: number; issuesFound: number
  }>()

  all.forEach(insp => {
    const id   = insp.employeeId   || insp.employeeName || 'unknown'
    const name = insp.employeeName || 'Desconhecido'
    const catalogEmp = EMP_MAP.get(id)
    const cargo = catalogEmp?.cargo ?? 'Auxiliar de Limpeza'

    const existing = inspMap.get(id)
    if (existing) {
      existing.scores.push(insp.score)
      existing.zones.add(insp.zoneId)
      if (insp.hasCriticalIssue) existing.criticalFound++
      existing.issuesFound += (insp.issues ?? []).length
    } else {
      inspMap.set(id, {
        name, cargo,
        scores:        [insp.score],
        zones:         new Set([insp.zoneId]),
        criticalFound: insp.hasCriticalIssue ? 1 : 0,
        issuesFound:   (insp.issues ?? []).length,
      })
    }
  })

  const inspectors: InspectorMetrics[] = [...inspMap.entries()]
    .map(([employeeId, data]) => ({
      employeeId,
      employeeName:     data.name,
      cargo:            data.cargo,
      totalInspections: data.scores.length,
      avgScore:         avg(data.scores),
      zonesInspected:   [...data.zones],
      criticalFound:    data.criticalFound,
      issuesFound:      data.issuesFound,
    }))
    .sort((a, b) => b.totalInspections - a.totalInspections)

  // ── Alerts ────────────────────────────────────────────────

  const alerts: CleaningAlert[] = []

  zones.forEach(z => {
    // Critical issues still open
    if (z.criticalIssues > 0) {
      alerts.push({
        zoneId: z.zoneId, zoneName: z.zoneName,
        type: 'critical_issue',
        message: `${z.zoneName}: ${z.criticalIssues} inspeção(ões) com ocorrência crítica no período`,
        severity: 'critical',
        value: z.criticalIssues,
      })
    }

    // Score drop >= 15 points
    if (z.trend === 'declining' && Math.abs(z.trendDelta) >= 15) {
      alerts.push({
        zoneId: z.zoneId, zoneName: z.zoneName,
        type: 'score_drop',
        message: `${z.zoneName}: queda de ${Math.abs(z.trendDelta)} pts — score atual ${z.latestScore ?? 0}`,
        severity: Math.abs(z.trendDelta) >= 25 ? 'critical' : 'warning',
        value: z.trendDelta,
      })
    }

    // No inspection in >14 days
    if (z.daysSinceLastInspection !== null && z.daysSinceLastInspection > 14) {
      alerts.push({
        zoneId: z.zoneId, zoneName: z.zoneName,
        type: 'overdue_inspection',
        message: `${z.zoneName}: ${z.daysSinceLastInspection} dias sem inspeção`,
        severity: z.daysSinceLastInspection > 30 ? 'critical' : 'warning',
        value: z.daysSinceLastInspection,
      })
    }

    // Low compliance
    if (z.totalInspections >= 3 && z.complianceRate < 60) {
      alerts.push({
        zoneId: z.zoneId, zoneName: z.zoneName,
        type: 'low_compliance',
        message: `${z.zoneName}: conformidade de apenas ${z.complianceRate}% no período`,
        severity: z.complianceRate < 40 ? 'critical' : 'warning',
        value: z.complianceRate,
      })
    }
  })

  // Repeated non-conformities across zones
  topNonConformities
    .filter(nc => nc.count >= 3)
    .slice(0, 3)
    .forEach(nc => {
      alerts.push({
        zoneId:   nc.zones[0] ?? '',
        zoneName: nc.zones.length > 1 ? `${nc.zones.length} setores` : (ZONE_MAP.get(nc.zones[0] ?? '')?.nome ?? nc.zones[0] ?? ''),
        type:     'repeated_nonconformity',
        message:  `NC recorrente (${nc.count}×): "${nc.description.slice(0, 60)}"`,
        severity: nc.severity === 'critical' ? 'critical' : 'warning',
        value:    nc.count,
      })
    })

  // Sort: critical first, then warning
  alerts.sort((a, b) =>
    (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1))

  const result: CleaningAnalyticsData = {
    period, computedAt: new Date(),
    totalZones:                    zones.length,
    totalInspections,
    avgScore,
    complianceRate,
    criticalZones,
    totalNonConformities,
    criticalIssues,
    daysSinceMostRecentInspection,
    zones,
    fiveSItems,
    monthlyTrend,
    topNonConformities,
    inspectors,
    alerts,
  }

  writeCache(result, period)
  return result
}

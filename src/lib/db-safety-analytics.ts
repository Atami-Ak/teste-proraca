// src/lib/db-safety-analytics.ts
// Data layer for Safety Analytics module.
// Reads safety_dds, safety_ddi, employee_epi, safety_occurrences, work_permits.
// All aggregation is client-side; Firestore reads use a single date-range filter per collection.

import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { getPeriodRanges } from '@/types/dashboard'
import type { Period } from '@/types/dashboard'
import type {
  SafetyPeriod, SafetyAnalyticsData, SafetyRisk,
  SectorMetrics, EmployeeSafetyProfile, SafetyAlert,
  SafetyTrendPoint, SafetyDimension,
  IncidentTypeBreakdown, IncidentSeverityBreakdown,
} from '@/types/safety-analytics'
import {
  riskFromScore,
  INCIDENT_TYPE_LABELS, INCIDENT_TYPE_COLORS,
  SEVERITY_LABELS, SEVERITY_COLORS,
} from '@/types/safety-analytics'

// ── Firestore collection names ────────────────────────────────

const C = {
  dds:     'safety_dds',
  ddi:     'safety_ddi',
  epi:     'employee_epi',
  occ:     'safety_occurrences',
  permits: 'work_permits',
} as const

// ── Cache ─────────────────────────────────────────────────────

const CACHE_KEY = 'safety_analytics_v1'
const CACHE_TTL = 30 * 60 * 1000   // 30 minutes

interface CacheEntry {
  data:   SafetyAnalyticsData
  ts:     number
  period: string
}

function readCache(period: string): SafetyAnalyticsData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (entry.period !== period) return null
    if (Date.now() - entry.ts > CACHE_TTL) return null
    entry.data.computedAt = new Date(entry.data.computedAt)
    return entry.data
  } catch {
    return null
  }
}

function writeCache(data: SafetyAnalyticsData, period: string): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now(), period } satisfies CacheEntry))
  } catch { /* storage full — silent skip */ }
}

export function clearSafetyAnalyticsCache(): void {
  localStorage.removeItem(CACHE_KEY)
}

// ── Date helpers ──────────────────────────────────────────────

function resolveDate(val: unknown): Date | null {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val === 'object' && typeof (val as Record<string, unknown>)['toDate'] === 'function') {
    return (val as { toDate(): Date }).toDate()
  }
  if (typeof val === 'number') return new Date(val)
  if (typeof val === 'string') {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function toMonthKey(dateVal: unknown): string {
  const d = resolveDate(dateVal)
  if (!d) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  if (!key) return ''
  const [year, month] = key.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[Number(month) - 1]}/${String(year).slice(-2)}`
}

// ── Risk score models ─────────────────────────────────────────

function computeSectorRisk(
  incidents:        number,
  nearMisses:       number,
  avgDdiScore:      number,
  epiNonCompliance: number,
): { score: number; level: SafetyRisk } {
  let s = 0
  s += Math.min(incidents / 5, 1) * 0.35                      // 5+ incidents → 35 pts
  s += (1 - Math.min(avgDdiScore, 100) / 100) * 0.25          // DDI quality deficit
  s += (epiNonCompliance / 100) * 0.25                         // EPI non-compliance share
  s += Math.min(nearMisses / 3, 1) * 0.15                     // 3+ near-misses → 15 pts

  const score = Math.min(Math.round(s * 100), 100)
  return { score, level: riskFromScore(score) }
}

function computeEmployeeRisk(
  epiStatus:    string,
  epiVencidos:  number,
  incidentCount: number,
  ddsRate:      number,
): { score: number; level: SafetyRisk } {
  let s = 0
  if (epiStatus === 'vencido')        s += 0.40
  else if (epiStatus === 'irregular') s += 0.30
  else if (epiStatus === 'pendente')  s += 0.15

  s += Math.min(epiVencidos / 3, 1) * 0.15
  s += Math.min(incidentCount / 2, 1) * 0.35
  s += (1 - Math.min(ddsRate, 100) / 100) * 0.10

  const score = Math.min(Math.round(s * 100), 100)
  return { score, level: riskFromScore(score) }
}

// ── Inline document types (avoid polluting global type space) ─

interface DdsDoc {
  data:           unknown
  setor:          string
  status:         string
  totalPresentes: number
  colaboradores:  Array<{ nome: string; matricula?: string }>
}

interface DdiDoc {
  id:                   string
  data:                 unknown
  setor:                string
  status:               string
  scoreGeral:           number
  totalNaoConformes:    number
  totalCriticosAbertos: number
  secoes: Array<{
    itens: Array<{ label?: string; resultado: string | null }>
  }>
}

interface EpiDoc {
  id:                 string
  colaboradorNome:    string
  matricula:          string
  departamento:       string
  setor:              string
  funcao:             string
  statusFicha:        string
  totalEpisVencidos:  number
  totalEpisAVencer:   number
}

interface OccDoc {
  data:            unknown
  setor:           string
  tipo:            string
  severidade:      string
  status:          string
  colaboradorNome: string
  matricula:       string
}

interface PermDoc {
  data:   unknown
  setor:  string
  status: string
}

// ── Main export ───────────────────────────────────────────────

export async function fetchSafetyAnalytics(
  period: SafetyPeriod,
  force  = false,
): Promise<SafetyAnalyticsData> {
  if (!force) {
    const cached = readCache(period)
    if (cached) return cached
  }

  const { current, prev } = getPeriodRanges(period as Period)
  const from = current.from
  const prevFrom = prev.from

  // ── Parallel Firestore reads ────────────────────────────────
  const [ddsSnap, ddiSnap, epiSnap, occSnap, permSnap, prevOccSnap] = await Promise.all([
    getDocs(query(collection(db, C.dds), where('data', '>=', from))),
    getDocs(query(collection(db, C.ddi), where('data', '>=', from))),
    getDocs(query(collection(db, C.epi), where('ativo', '==', true))),
    getDocs(query(collection(db, C.occ), where('data', '>=', from))),
    getDocs(query(collection(db, C.permits), where('data', '>=', from))),
    getDocs(query(collection(db, C.occ), where('data', '>=', prevFrom), where('data', '<', from))),
  ])

  // ── Normalize ───────────────────────────────────────────────

  const ddsRecords: DdsDoc[] = []
  ddsSnap.forEach(doc => {
    const d = doc.data()
    if (d['status'] !== 'concluido') return
    ddsRecords.push({
      data:           d['data'],
      setor:          String(d['setor'] ?? ''),
      status:         String(d['status'] ?? ''),
      totalPresentes: Number(d['totalPresentes'] ?? 0),
      colaboradores:  Array.isArray(d['colaboradores']) ? d['colaboradores'] as DdsDoc['colaboradores'] : [],
    })
  })

  const ddiRecords: DdiDoc[] = []
  ddiSnap.forEach(doc => {
    const d = doc.data()
    if (d['status'] === 'rascunho') return
    ddiRecords.push({
      id:                   doc.id,
      data:                 d['data'],
      setor:                String(d['setor'] ?? ''),
      status:               String(d['status'] ?? ''),
      scoreGeral:           Number(d['scoreGeral'] ?? 0),
      totalNaoConformes:    Number(d['totalNaoConformes'] ?? 0),
      totalCriticosAbertos: Number(d['totalCriticosAbertos'] ?? 0),
      secoes:               Array.isArray(d['secoes']) ? d['secoes'] as DdiDoc['secoes'] : [],
    })
  })

  const epiRecords: EpiDoc[] = []
  epiSnap.forEach(doc => {
    const d = doc.data()
    epiRecords.push({
      id:                doc.id,
      colaboradorNome:   String(d['colaboradorNome'] ?? ''),
      matricula:         String(d['matricula'] ?? ''),
      departamento:      String(d['departamento'] ?? ''),
      setor:             String(d['setor'] ?? ''),
      funcao:            String(d['funcao'] ?? ''),
      statusFicha:       String(d['statusFicha'] ?? 'pendente'),
      totalEpisVencidos: Number(d['totalEpisVencidos'] ?? 0),
      totalEpisAVencer:  Number(d['totalEpisAVencer'] ?? 0),
    })
  })

  const occRecords: OccDoc[] = []
  occSnap.forEach(doc => {
    const d = doc.data()
    occRecords.push({
      data:            d['data'],
      setor:           String(d['setor'] ?? ''),
      tipo:            String(d['tipo'] ?? ''),
      severidade:      String(d['severidade'] ?? 'baixa'),
      status:          String(d['status'] ?? 'aberta'),
      colaboradorNome: String(d['colaboradorNome'] ?? ''),
      matricula:       String(d['matricula'] ?? ''),
    })
  })

  const permRecords: PermDoc[] = []
  permSnap.forEach(doc => {
    const d = doc.data()
    permRecords.push({
      data:   d['data'],
      setor:  String(d['setor'] ?? ''),
      status: String(d['status'] ?? ''),
    })
  })

  const prevOccRecords: OccDoc[] = []
  prevOccSnap.forEach(doc => {
    const d = doc.data()
    prevOccRecords.push({
      data:            d['data'],
      setor:           String(d['setor'] ?? ''),
      tipo:            String(d['tipo'] ?? ''),
      severidade:      String(d['severidade'] ?? 'baixa'),
      status:          String(d['status'] ?? ''),
      colaboradorNome: '',
      matricula:       '',
    })
  })

  // ── Global KPIs ─────────────────────────────────────────────

  const totalIncidents  = occRecords.length
  const totalNearMisses = occRecords.filter(o => o.tipo === 'quase_acidente').length
  const totalDds        = ddsRecords.length
  const totalDdi        = ddiRecords.length
  const openOccurrences = occRecords.filter(o => o.status === 'aberta' || o.status === 'em_investigacao').length
  const activePermits   = permRecords.filter(p => p.status === 'aprovada' || p.status === 'em_execucao').length

  const avgDdiScore = totalDdi > 0
    ? Math.round(ddiRecords.reduce((sum, d) => sum + d.scoreGeral, 0) / totalDdi)
    : 0

  const epiCompliant = epiRecords.filter(e => e.statusFicha === 'conforme').length
  const epiComplianceRate = epiRecords.length > 0
    ? Math.round((epiCompliant / epiRecords.length) * 100)
    : 100

  // DDS attendance: totalPresentes vs benchmark (DDS count × 20 expected employees)
  const totalAttendances = ddsRecords.reduce((sum, d) => sum + d.totalPresentes, 0)
  const ddsAttendanceRate = totalDds > 0
    ? Math.min(Math.round((totalAttendances / (totalDds * 20)) * 100), 100)
    : 0

  // ── Monthly trend ────────────────────────────────────────────

  // Seed all months in the period window
  const periodDays = period === '30d' ? 30 : period === '90d' ? 90 : period === '6m' ? 180 : 365
  const monthSeeds = new Map<string, { incidents: number; nearMisses: number; ddiScores: number[]; ddsCount: number }>()
  for (let i = 0; i <= periodDays; i += 30) {
    const d   = new Date(from.getTime() + i * 86_400_000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!monthSeeds.has(key)) monthSeeds.set(key, { incidents: 0, nearMisses: 0, ddiScores: [], ddsCount: 0 })
  }

  const addMonth = (key: string) => {
    if (key && !monthSeeds.has(key)) monthSeeds.set(key, { incidents: 0, nearMisses: 0, ddiScores: [], ddsCount: 0 })
    return monthSeeds.get(key)
  }

  for (const occ of occRecords) {
    const m = addMonth(toMonthKey(occ.data))
    if (!m) continue
    m.incidents++
    if (occ.tipo === 'quase_acidente') m.nearMisses++
  }
  for (const ddi of ddiRecords) {
    const m = addMonth(toMonthKey(ddi.data))
    if (m) m.ddiScores.push(ddi.scoreGeral)
  }
  for (const dds of ddsRecords) {
    const m = addMonth(toMonthKey(dds.data))
    if (m) m.ddsCount++
  }

  const monthlyTrend: SafetyTrendPoint[] = Array.from(monthSeeds.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, m]) => ({
      monthKey:    key,
      label:       monthLabel(key),
      incidents:   m.incidents,
      nearMisses:  m.nearMisses,
      ddiAvgScore: m.ddiScores.length > 0
        ? Math.round(m.ddiScores.reduce((s, v) => s + v, 0) / m.ddiScores.length)
        : 0,
      ddsCount: m.ddsCount,
    }))

  // ── Per-sector metrics ────────────────────────────────────────

  const allSectors = new Set<string>([
    ...ddsRecords.map(d => d.setor),
    ...ddiRecords.map(d => d.setor),
    ...epiRecords.map(e => e.setor),
    ...occRecords.map(o => o.setor),
    ...permRecords.map(p => p.setor),
  ].filter(Boolean))

  const prevBySetor = new Map<string, number>()
  for (const o of prevOccRecords) {
    if (o.setor) prevBySetor.set(o.setor, (prevBySetor.get(o.setor) ?? 0) + 1)
  }

  // DDI non-conformance items aggregated per sector
  const hazardMap = new Map<string, Map<string, number>>()
  for (const ddi of ddiRecords) {
    for (const sec of ddi.secoes) {
      for (const item of sec.itens) {
        if (item.resultado !== 'nao_conforme' || !item.label) continue
        const sh = hazardMap.get(ddi.setor) ?? new Map<string, number>()
        sh.set(item.label, (sh.get(item.label) ?? 0) + 1)
        hazardMap.set(ddi.setor, sh)
      }
    }
  }

  const sectors: SectorMetrics[] = Array.from(allSectors).map(setor => {
    const sOcc  = occRecords.filter(o => o.setor === setor)
    const sDds  = ddsRecords.filter(d => d.setor === setor)
    const sDdi  = ddiRecords.filter(d => d.setor === setor)
    const sEpi  = epiRecords.filter(e => e.setor === setor)
    const sPerm = permRecords.filter(p => p.setor === setor)

    const incidents   = sOcc.length
    const nearMisses  = sOcc.filter(o => o.tipo === 'quase_acidente').length
    const criticalOcc = sOcc.filter(o => o.severidade === 'critica').length
    const openOcc     = sOcc.filter(o => o.status === 'aberta' || o.status === 'em_investigacao').length
    const ddiCount    = sDdi.length
    const avgDdiScore = ddiCount > 0
      ? Math.round(sDdi.reduce((s, d) => s + d.scoreGeral, 0) / ddiCount)
      : 0
    const epiTotal         = sEpi.length
    const epiNonCompliance = epiTotal > 0
      ? Math.round((sEpi.filter(e => e.statusFicha !== 'conforme').length / epiTotal) * 100)
      : 0
    const activePerm = sPerm.filter(p => p.status === 'aprovada' || p.status === 'em_execucao').length

    const { score: riskScore, level: riskLevel } = computeSectorRisk(incidents, nearMisses, avgDdiScore, epiNonCompliance)

    const prevInc    = prevBySetor.get(setor) ?? 0
    const trendDelta = incidents - prevInc
    const trend      = trendDelta < -1 ? 'improving' : trendDelta > 1 ? 'declining' : 'stable'

    const hazardEntries = hazardMap.get(setor)
    const topHazards = hazardEntries
      ? Array.from(hazardEntries.entries()).sort(([, a], [, b]) => b - a).slice(0, 3).map(([l]) => l)
      : []

    return {
      setor, incidents, nearMisses,
      criticalOccurrences: criticalOcc,
      openOccurrences:     openOcc,
      ddsCount: sDds.length,
      ddiCount, avgDdiScore,
      epiNonCompliance, epiTotal,
      activePermits: activePerm,
      riskScore, riskLevel,
      trend: trend as SectorMetrics['trend'],
      trendDelta, topHazards,
    }
  }).sort((a, b) => b.riskScore - a.riskScore)

  // ── Employee safety profiles ──────────────────────────────────

  const ddsAttendanceMap = new Map<string, number>()   // key: matricula or nome
  const ddsBySectorMap   = new Map<string, number>()

  for (const dds of ddsRecords) {
    ddsBySectorMap.set(dds.setor, (ddsBySectorMap.get(dds.setor) ?? 0) + 1)
    for (const col of dds.colaboradores) {
      const key = col.matricula?.trim() || col.nome?.trim()
      if (key) ddsAttendanceMap.set(key, (ddsAttendanceMap.get(key) ?? 0) + 1)
    }
  }

  const incByEmployeeMap = new Map<string, number>()
  for (const occ of occRecords) {
    const key = occ.matricula?.trim() || occ.colaboradorNome?.trim()
    if (key) incByEmployeeMap.set(key, (incByEmployeeMap.get(key) ?? 0) + 1)
  }

  const employees: EmployeeSafetyProfile[] = epiRecords.map(epi => {
    const lookup      = epi.matricula?.trim() || epi.colaboradorNome?.trim()
    const ddsAttended = ddsAttendanceMap.get(lookup) ?? ddsAttendanceMap.get(epi.colaboradorNome?.trim()) ?? 0
    const ddsInSector = ddsBySectorMap.get(epi.setor) ?? 0
    const ddsRate     = ddsInSector > 0 ? Math.min(Math.round((ddsAttended / ddsInSector) * 100), 100) : 0
    const incidentCount = incByEmployeeMap.get(lookup) ?? incByEmployeeMap.get(epi.colaboradorNome?.trim()) ?? 0

    const { score: riskScore, level: riskLevel } = computeEmployeeRisk(epi.statusFicha, epi.totalEpisVencidos, incidentCount, ddsRate)

    return {
      id: epi.id, nome: epi.colaboradorNome, matricula: epi.matricula,
      setor: epi.setor, departamento: epi.departamento, funcao: epi.funcao,
      epiStatus: epi.statusFicha,
      epiVencidos: epi.totalEpisVencidos,
      epiAVencer: epi.totalEpisAVencer,
      incidentCount, ddsAttended, ddsInSector, ddsRate,
      riskScore, riskLevel,
    }
  }).sort((a, b) => b.riskScore - a.riskScore)

  // ── Incident breakdown ────────────────────────────────────────

  const typeCount = new Map<string, number>()
  const sevCount  = new Map<string, number>()
  for (const occ of occRecords) {
    typeCount.set(occ.tipo, (typeCount.get(occ.tipo) ?? 0) + 1)
    sevCount.set(occ.severidade, (sevCount.get(occ.severidade) ?? 0) + 1)
  }

  const byType: IncidentTypeBreakdown[] = Array.from(typeCount.entries())
    .map(([type, count]) => ({
      type, count,
      label: INCIDENT_TYPE_LABELS[type] ?? type,
      color: INCIDENT_TYPE_COLORS[type] ?? '#94a3b8',
    }))
    .sort((a, b) => b.count - a.count)

  const bySeverity: IncidentSeverityBreakdown[] = ['critica', 'alta', 'media', 'baixa']
    .map(sev => ({
      severity: sev, count: sevCount.get(sev) ?? 0,
      label: SEVERITY_LABELS[sev] ?? sev,
      color: SEVERITY_COLORS[sev] ?? '#94a3b8',
    }))
    .filter(s => s.count > 0)

  // ── Safety radar (5 dimensions — higher = safer) ─────────────

  const incidentScore = Math.max(0, Math.round((1 - Math.min(totalIncidents, 20) / 20) * 100))
  const nmScore       = Math.max(0, Math.round((1 - Math.min(totalNearMisses, 10) / 10) * 100))

  const radarData: SafetyDimension[] = [
    { subject: 'Sem Incidentes', score: incidentScore,       fullMark: 100 },
    { subject: 'Inspeção DDI',   score: avgDdiScore,         fullMark: 100 },
    { subject: 'EPI Conforme',   score: epiComplianceRate,   fullMark: 100 },
    { subject: 'Presença DDS',   score: ddsAttendanceRate,   fullMark: 100 },
    { subject: 'Prevenção',      score: nmScore,             fullMark: 100 },
  ]

  // ── Overall risk ──────────────────────────────────────────────

  const overallRiskScore = Math.round(
    (100 - incidentScore)       * 0.35 +
    (100 - avgDdiScore)         * 0.25 +
    (100 - epiComplianceRate)   * 0.25 +
    (100 - nmScore)             * 0.15,
  )
  const overallRiskLevel = riskFromScore(overallRiskScore)

  // ── Alerts ────────────────────────────────────────────────────

  const alerts: SafetyAlert[] = []

  const criticalOccs = occRecords.filter(o => o.severidade === 'critica' || o.tipo === 'acidente_com_afastamento')
  if (criticalOccs.length > 0) {
    alerts.push({
      type: 'critical_incident', severity: 'critical',
      message: `${criticalOccs.length} ocorrência(s) grave(s) registrada(s) no período — investigação obrigatória`,
      value: criticalOccs.length,
    })
  }

  for (const sec of sectors) {
    if (sec.riskLevel === 'critico') {
      alerts.push({
        type: 'high_risk_sector', severity: 'critical',
        message: `Setor "${sec.setor}" — risco CRÍTICO (${sec.incidents} incid., EPI ${sec.epiNonCompliance}% irregular)`,
        setor: sec.setor, value: sec.riskScore,
      })
    } else if (sec.riskLevel === 'alto' && sec.incidents >= 2) {
      alerts.push({
        type: 'high_risk_sector', severity: 'warning',
        message: `Setor "${sec.setor}" — risco alto com ${sec.incidents} incidentes no período`,
        setor: sec.setor, value: sec.incidents,
      })
    }
  }

  if (epiComplianceRate < 70) {
    alerts.push({
      type: 'epi_non_compliance',
      severity: epiComplianceRate < 50 ? 'critical' : 'warning',
      message: `Conformidade EPI em ${epiComplianceRate}% — abaixo do mínimo de 90% exigido`,
      value: epiComplianceRate,
    })
  }

  if (avgDdiScore > 0 && avgDdiScore < 60) {
    alerts.push({
      type: 'low_ddi_score',
      severity: avgDdiScore < 45 ? 'critical' : 'warning',
      message: `Média de inspeção DDI: ${avgDdiScore} pts — qualidade das inspeções abaixo do padrão`,
      value: avgDdiScore,
    })
  }

  if (ddsAttendanceRate < 70 && totalDds > 0) {
    alerts.push({
      type: 'missing_dds', severity: 'warning',
      message: `Taxa de participação no DDS: ${ddsAttendanceRate}% — engajamento abaixo de 70%`,
      value: ddsAttendanceRate,
    })
  }

  const criticalEmployees = employees.filter(e => e.riskLevel === 'critico')
  if (criticalEmployees.length > 0) {
    alerts.push({
      type: 'employee_risk', severity: 'critical',
      message: `${criticalEmployees.length} colaborador(es) com perfil de risco crítico — ação imediata necessária`,
      value: criticalEmployees.length,
    })
  }

  alerts.sort((a, b) =>
    a.severity === 'critical' && b.severity !== 'critical' ? -1 :
    a.severity !== 'critical' && b.severity === 'critical' ? 1 : 0,
  )

  // ── Assemble ──────────────────────────────────────────────────

  const result: SafetyAnalyticsData = {
    period, computedAt: new Date(),
    totalIncidents, totalNearMisses, totalDds, totalDdi,
    avgDdiScore, epiComplianceRate, ddsAttendanceRate,
    openOccurrences, activePermits,
    overallRiskScore, overallRiskLevel,
    monthlyTrend, sectors, employees,
    byType, bySeverity, radarData, alerts,
  }

  writeCache(result, period)
  return result
}

// src/lib/db-employees-analytics.ts
// Data layer for Employees Analytics module.
// Reads employees, employee_evaluations, employee_warnings, employee_recognitions.
// Pre-computed aggregates on the employee document are used directly.

import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { getPeriodRanges } from '@/types/dashboard'
import type { Period } from '@/types/dashboard'
import type {
  EmployeesPeriod, EmployeesAnalyticsData, EmployeeMetrics,
  SectorEmployeeMetrics, PerformanceDistribution,
  CriteriaAverage, EmployeeTrendPoint, EmployeesAlert,
} from '@/types/employees-analytics'
import {
  scoreToLevel, PERFORMANCE_COLORS, PERFORMANCE_LABELS,
  CRITERIA_LABELS, CRITERIA_WEIGHTS,
} from '@/types/employees-analytics'

// ── Collections ───────────────────────────────────────────────

const C = {
  employees:    'employees',
  evaluations:  'employee_evaluations',
  warnings:     'employee_warnings',
  recognitions: 'employee_recognitions',
} as const

// ── Cache ─────────────────────────────────────────────────────

const CACHE_KEY = 'employees_analytics_v1'
const CACHE_TTL = 30 * 60 * 1000

interface CacheEntry { data: EmployeesAnalyticsData; ts: number; period: string }

function readCache(period: string): EmployeesAnalyticsData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const e = JSON.parse(raw) as CacheEntry
    if (e.period !== period || Date.now() - e.ts > CACHE_TTL) return null
    e.data.computedAt = new Date(e.data.computedAt)
    return e.data
  } catch { return null }
}

function writeCache(data: EmployeesAnalyticsData, period: string): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now(), period } satisfies CacheEntry)) }
  catch { /* storage full */ }
}

export function clearEmployeesAnalyticsCache(): void {
  localStorage.removeItem(CACHE_KEY)
}

// ── Date helpers ──────────────────────────────────────────────

function resolveDate(val: unknown): Date | null {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val === 'object' && typeof (val as Record<string, unknown>)['toDate'] === 'function') {
    return (val as { toDate(): Date }).toDate()
  }
  return null
}

function toMonthKey(val: unknown): string {
  const d = resolveDate(val)
  if (!d) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  if (!key) return ''
  const [y, m] = key.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[Number(m) - 1]}/${String(y).slice(-2)}`
}

// ── Inline doc types ──────────────────────────────────────────

interface EmpDoc {
  id:                    string
  nome:                  string
  matricula:             string
  cargo:                 string
  setor:                 string
  departamento:          string
  turno:                 string
  status:                string
  nivelAcesso:           string
  scorePerformance:      number
  statusPerformance:     string
  totalAvisos:           number
  totalReconhecimentos:  number
  totalEvaluacoes:       number
  ultimaAvaliacao?:      unknown
  totalIncidentesSeg:    number
  totalDDSPresencas:     number
}

interface EvalDoc {
  employeeId: string
  score:      number
  criterios?: Record<string, number>
  createdAt:  unknown
}

interface WarnDoc {
  employeeId: string
  createdAt:  unknown
}

interface RecoDoc {
  employeeId: string
  createdAt:  unknown
}

// ── Risk model ────────────────────────────────────────────────

function computeEmployeeRisk(
  scorePerformance: number,
  totalAvisos:      number,
  incidentes:       number,
  ddsPresencas:     number,
): number {
  let r = 0
  r += (1 - Math.min(scorePerformance, 100) / 100) * 0.45   // low performance = 45%
  r += Math.min(totalAvisos / 5, 1) * 0.30                   // warnings = 30%
  r += Math.min(incidentes / 3, 1) * 0.15                    // incidents = 15%
  r += (ddsPresencas === 0 ? 1 : 0) * 0.10                   // no DDS = 10%
  return Math.min(Math.round(r * 100), 100)
}

// ── Main export ───────────────────────────────────────────────

export async function fetchEmployeesAnalytics(
  period: EmployeesPeriod,
  force  = false,
): Promise<EmployeesAnalyticsData> {
  if (!force) {
    const cached = readCache(period)
    if (cached) return cached
  }

  const { current } = getPeriodRanges(period as Period)
  const from = current.from

  // ── Parallel Firestore reads ────────────────────────────────
  // warnings and recognitions are fetched without a date filter to avoid
  // composite-index requirements — period filtering happens client-side.
  const [empSnap, evalSnap, warnSnap, recoSnap] = await Promise.all([
    getDocs(query(collection(db, C.employees), where('status', '==', 'ativo'))),
    getDocs(query(collection(db, C.evaluations), where('createdAt', '>=', from))),
    getDocs(collection(db, C.warnings)),
    getDocs(collection(db, C.recognitions)),
  ])

  // ── Normalize ───────────────────────────────────────────────

  const empRecords: EmpDoc[] = []
  empSnap.forEach(doc => {
    const d = doc.data()
    empRecords.push({
      id:                   doc.id,
      nome:                 String(d['nome'] ?? ''),
      matricula:            String(d['matricula'] ?? ''),
      cargo:                String(d['cargo'] ?? ''),
      setor:                String(d['setor'] ?? ''),
      departamento:         String(d['departamento'] ?? ''),
      turno:                String(d['turno'] ?? ''),
      status:               String(d['status'] ?? 'ativo'),
      nivelAcesso:          String(d['nivelAcesso'] ?? 'operador'),
      scorePerformance:     Number(d['scorePerformance'] ?? 50),
      statusPerformance:    String(d['statusPerformance'] ?? 'bom'),
      totalAvisos:          Number(d['totalAvisos'] ?? 0),
      totalReconhecimentos: Number(d['totalReconhecimentos'] ?? 0),
      totalEvaluacoes:      Number(d['totalEvaluacoes'] ?? 0),
      ultimaAvaliacao:      d['ultimaAvaliacao'],
      totalIncidentesSeg:   Number(d['totalIncidentesSeg'] ?? 0),
      totalDDSPresencas:    Number(d['totalDDSPresencas'] ?? 0),
    })
  })

  const evalRecords: EvalDoc[] = []
  evalSnap.forEach(doc => {
    const d = doc.data()
    evalRecords.push({
      employeeId: String(d['employeeId'] ?? ''),
      score:      Number(d['score'] ?? 0),
      criterios:  d['criterios'] as Record<string, number> | undefined,
      createdAt:  d['createdAt'],
    })
  })

  // Client-side period filter: support both 'createdAt' and 'data' field names
  const fromMs = from.getTime()

  const warnRecords: WarnDoc[] = []
  warnSnap.forEach(doc => {
    const d = doc.data()
    const dateVal = d['createdAt'] ?? d['data']
    const dateMs  = resolveDate(dateVal)?.getTime() ?? 0
    if (dateMs >= fromMs) {
      warnRecords.push({ employeeId: String(d['employeeId'] ?? ''), createdAt: dateVal })
    }
  })

  const recoRecords: RecoDoc[] = []
  recoSnap.forEach(doc => {
    const d = doc.data()
    const dateVal = d['createdAt'] ?? d['data']
    const dateMs  = resolveDate(dateVal)?.getTime() ?? 0
    if (dateMs >= fromMs) {
      recoRecords.push({ employeeId: String(d['employeeId'] ?? ''), createdAt: dateVal })
    }
  })

  // ── Per-employee metrics ─────────────────────────────────────

  const warnByEmp = new Map<string, number>()
  for (const w of warnRecords) {
    warnByEmp.set(w.employeeId, (warnByEmp.get(w.employeeId) ?? 0) + 1)
  }

  const evalsByEmp = new Map<string, EvalDoc[]>()
  for (const e of evalRecords) {
    const arr = evalsByEmp.get(e.employeeId) ?? []
    arr.push(e)
    evalsByEmp.set(e.employeeId, arr)
  }

  const employees: EmployeeMetrics[] = empRecords.map(emp => {
    const evals         = evalsByEmp.get(emp.id) ?? []
    const periodEvalCount = evals.length
    const periodAvgScore  = periodEvalCount > 0
      ? Math.round(evals.reduce((s, e) => s + e.score, 0) / periodEvalCount)
      : 0
    const periodWarnings  = warnByEmp.get(emp.id) ?? 0

    // Trend: compare first and last eval score in the period
    let trend: EmployeeMetrics['trend'] = 'no_data'
    let trendDelta = 0
    if (evals.length >= 2) {
      const sorted = [...evals].sort((a, b) => {
        const da = resolveDate(a.createdAt)?.getTime() ?? 0
        const db = resolveDate(b.createdAt)?.getTime() ?? 0
        return da - db
      })
      trendDelta = Math.round(sorted[sorted.length - 1].score - sorted[0].score)
      trend = trendDelta > 5 ? 'improving' : trendDelta < -5 ? 'declining' : 'stable'
    } else if (evals.length === 1) {
      trend = 'stable'
    }

    const riskScore = computeEmployeeRisk(
      emp.scorePerformance,
      emp.totalAvisos,
      emp.totalIncidentesSeg,
      emp.totalDDSPresencas,
    )

    return {
      id: emp.id, nome: emp.nome, matricula: emp.matricula,
      cargo: emp.cargo, setor: emp.setor, departamento: emp.departamento,
      turno: emp.turno, status: emp.status, nivelAcesso: emp.nivelAcesso,
      scorePerformance:  emp.scorePerformance,
      performanceLevel:  scoreToLevel(emp.scorePerformance),
      totalEvaluacoes:   emp.totalEvaluacoes,
      periodEvaluations: periodEvalCount,
      periodAvgScore,
      totalAvisos:          emp.totalAvisos,
      totalReconhecimentos: emp.totalReconhecimentos,
      periodWarnings,
      totalIncidentesSeg: emp.totalIncidentesSeg,
      totalDDSPresencas:  emp.totalDDSPresencas,
      riskScore,
      trend, trendDelta,
    }
  }).sort((a, b) => b.scorePerformance - a.scorePerformance)

  // ── Global KPIs ─────────────────────────────────────────────

  const totalActive = employees.length
  const avgPerformanceScore = totalActive > 0
    ? Math.round(employees.reduce((s, e) => s + e.scorePerformance, 0) / totalActive)
    : 0
  const topPerformersCount  = employees.filter(e => e.scorePerformance >= 75).length
  const lowPerformersCount  = employees.filter(e => e.scorePerformance < 60).length
  const totalWarningsPeriod     = warnRecords.length
  const totalRecognitionsPeriod = recoRecords.length

  // ── Performance distribution ─────────────────────────────────

  const levelCount = new Map<string, number>()
  for (const e of employees) {
    levelCount.set(e.performanceLevel, (levelCount.get(e.performanceLevel) ?? 0) + 1)
  }

  const byPerformanceLevel: PerformanceDistribution[] = (
    ['excelente', 'muito_bom', 'bom', 'atencao', 'critico'] as const
  ).map(level => ({
    level,
    label: PERFORMANCE_LABELS[level],
    count: levelCount.get(level) ?? 0,
    color: PERFORMANCE_COLORS[level],
  })).filter(d => d.count > 0)

  // ── Sector breakdown ─────────────────────────────────────────

  const allSectors = new Set(employees.map(e => e.setor).filter(Boolean))
  const sectors: SectorEmployeeMetrics[] = Array.from(allSectors).map(setor => {
    const emps = employees.filter(e => e.setor === setor)
    const count = emps.length
    const avg   = count > 0 ? Math.round(emps.reduce((s, e) => s + e.scorePerformance, 0) / count) : 0
    return {
      setor,
      employeeCount: count,
      avgScore:      avg,
      performanceLevel: scoreToLevel(avg),
      topPerformers: emps.filter(e => e.scorePerformance >= 75).length,
      lowPerformers: emps.filter(e => e.scorePerformance < 60).length,
      periodWarnings: emps.reduce((s, e) => s + e.periodWarnings, 0),
      totalIncidents: emps.reduce((s, e) => s + e.totalIncidentesSeg, 0),
    }
  }).sort((a, b) => b.avgScore - a.avgScore)

  // ── Monthly trend ────────────────────────────────────────────

  const periodDays = period === '30d' ? 30 : period === '90d' ? 90 : period === '6m' ? 180 : 365
  const monthSeeds = new Map<string, { scores: number[]; evals: number; warnings: number }>()
  for (let i = 0; i <= periodDays; i += 30) {
    const d   = new Date(from.getTime() + i * 86_400_000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!monthSeeds.has(key)) monthSeeds.set(key, { scores: [], evals: 0, warnings: 0 })
  }

  for (const ev of evalRecords) {
    const key = toMonthKey(ev.createdAt)
    if (!key) continue
    const m = monthSeeds.get(key) ?? { scores: [], evals: 0, warnings: 0 }
    m.scores.push(ev.score)
    m.evals++
    monthSeeds.set(key, m)
  }
  for (const w of warnRecords) {
    const key = toMonthKey(w.createdAt)
    if (!key) continue
    const m = monthSeeds.get(key) ?? { scores: [], evals: 0, warnings: 0 }
    m.warnings++
    monthSeeds.set(key, m)
  }

  const monthlyTrend: EmployeeTrendPoint[] = Array.from(monthSeeds.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, m]) => ({
      monthKey:         key,
      label:            monthLabel(key),
      avgScore:         m.scores.length > 0
        ? Math.round(m.scores.reduce((s, v) => s + v, 0) / m.scores.length)
        : avgPerformanceScore,
      evaluationsCount: m.evals,
      warningsCount:    m.warnings,
    }))

  // ── Criteria averages ─────────────────────────────────────────

  const criteriaKeys = Object.keys(CRITERIA_WEIGHTS)
  const criteriaSums = Object.fromEntries(criteriaKeys.map(k => [k, 0]))
  const criteriaCountMap = Object.fromEntries(criteriaKeys.map(k => [k, 0]))

  for (const ev of evalRecords) {
    if (!ev.criterios) continue
    for (const key of criteriaKeys) {
      const raw = ev.criterios[key]
      if (typeof raw === 'number') {
        criteriaSums[key] += raw * 10   // 0-10 → 0-100
        criteriaCountMap[key]++
      }
    }
  }

  const criteriaAverages: CriteriaAverage[] = criteriaKeys.map(key => ({
    key,
    label:  CRITERIA_LABELS[key] ?? key,
    avg:    criteriaCountMap[key] > 0
      ? Math.round(criteriaSums[key] / criteriaCountMap[key])
      : avgPerformanceScore,
    weight: CRITERIA_WEIGHTS[key],
  }))

  // ── Alerts ────────────────────────────────────────────────────

  const alerts: EmployeesAlert[] = []

  const criticalEmps = employees.filter(e => e.performanceLevel === 'critico')
  if (criticalEmps.length > 0) {
    alerts.push({
      type: 'low_performance', severity: 'critical',
      message: `${criticalEmps.length} colaborador(es) com performance CRÍTICA — avaliação e plano de ação necessários`,
      value: criticalEmps.length,
    })
  }

  const atencaoEmps = employees.filter(e => e.performanceLevel === 'atencao')
  if (atencaoEmps.length > 0) {
    alerts.push({
      type: 'low_performance', severity: 'warning',
      message: `${atencaoEmps.length} colaborador(es) em nível de ATENÇÃO — monitoramento recomendado`,
      value: atencaoEmps.length,
    })
  }

  const highWarnings = employees.filter(e => e.periodWarnings >= 2)
  for (const e of highWarnings) {
    alerts.push({
      type: 'repeated_warnings', severity: e.periodWarnings >= 3 ? 'critical' : 'warning',
      message: `${e.nome} — ${e.periodWarnings} aviso(s) no período (${e.setor})`,
      employeeId: e.id, employeeName: e.nome, setor: e.setor, value: e.periodWarnings,
    })
  }

  const safetyRisk = employees.filter(e => e.totalIncidentesSeg >= 2)
  if (safetyRisk.length > 0) {
    alerts.push({
      type: 'safety_risk', severity: 'critical',
      message: `${safetyRisk.length} colaborador(es) com 2+ incidentes de segurança`,
      value: safetyRisk.length,
    })
  }

  const noEval = employees.filter(e => e.totalEvaluacoes === 0)
  if (noEval.length > 0) {
    alerts.push({
      type: 'no_evaluations', severity: 'warning',
      message: `${noEval.length} colaborador(es) sem nenhuma avaliação de desempenho registrada`,
      value: noEval.length,
    })
  }

  const decliningEmps = employees.filter(e => e.trend === 'declining')
  if (decliningEmps.length > 0) {
    alerts.push({
      type: 'declining_trend', severity: 'warning',
      message: `${decliningEmps.length} colaborador(es) com tendência de queda no período`,
      value: decliningEmps.length,
    })
  }

  alerts.sort((a, b) =>
    a.severity === 'critical' && b.severity !== 'critical' ? -1 :
    a.severity !== 'critical' && b.severity === 'critical' ? 1 : 0,
  )

  const result: EmployeesAnalyticsData = {
    period, computedAt: new Date(),
    totalActive, avgPerformanceScore,
    topPerformersCount, lowPerformersCount,
    totalWarningsPeriod, totalRecognitionsPeriod,
    byPerformanceLevel, employees, sectors,
    monthlyTrend, criteriaAverages, alerts,
  }

  writeCache(result, period)
  return result
}

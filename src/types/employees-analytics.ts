// src/types/employees-analytics.ts
// Type system for the Employees Analytics (Colaboradores Analytics) module.

export type EmployeesPeriod = '30d' | '90d' | '6m' | '1a'

export type PerformanceLevel =
  | 'excelente'
  | 'muito_bom'
  | 'bom'
  | 'atencao'
  | 'critico'

export type EmployeeTrend = 'improving' | 'stable' | 'declining' | 'no_data'

// ── Per-employee aggregated metrics ───────────────────────────

export interface EmployeeMetrics {
  id:           string
  nome:         string
  matricula:    string
  cargo:        string
  setor:        string
  departamento: string
  turno:        string
  status:       string
  nivelAcesso:  string

  // Performance (from employee aggregate + period evaluations)
  scorePerformance:  number         // 0–100 (lifetime rolling avg)
  performanceLevel:  PerformanceLevel
  totalEvaluacoes:   number
  periodEvaluations: number         // evaluations in this period
  periodAvgScore:    number         // avg score from period evaluations

  // Discipline
  totalAvisos:          number      // lifetime
  totalReconhecimentos: number      // lifetime
  periodWarnings:       number      // warnings created in this period

  // Safety (counters on employee record)
  totalIncidentesSeg: number
  totalDDSPresencas:  number

  // Risk (composite — higher = more concern)
  riskScore: number   // 0–100

  // Trend within the period
  trend:      EmployeeTrend
  trendDelta: number   // score delta between first and last period evaluation
}

// ── Per-sector aggregated view ─────────────────────────────────

export interface SectorEmployeeMetrics {
  setor:            string
  employeeCount:    number
  avgScore:         number
  performanceLevel: PerformanceLevel
  topPerformers:    number   // score >= 75
  lowPerformers:    number   // score < 60
  periodWarnings:   number
  totalIncidents:   number
}

// ── Performance distribution chart ────────────────────────────

export interface PerformanceDistribution {
  level: PerformanceLevel
  label: string
  count: number
  color: string
}

// ── Evaluation criteria average ────────────────────────────────

export interface CriteriaAverage {
  key:    string
  label:  string
  avg:    number   // 0–100
  weight: number
}

// ── Monthly trend point ────────────────────────────────────────

export interface EmployeeTrendPoint {
  monthKey:         string
  label:            string
  avgScore:         number
  evaluationsCount: number
  warningsCount:    number
}

// ── Alerts ─────────────────────────────────────────────────────

export type EmployeesAlertType =
  | 'low_performance'
  | 'repeated_warnings'
  | 'safety_risk'
  | 'no_evaluations'
  | 'declining_trend'
  | 'low_sector_avg'

export interface EmployeesAlert {
  type:          EmployeesAlertType
  severity:      'critical' | 'warning'
  message:       string
  employeeId?:   string
  employeeName?: string
  setor?:        string
  value?:        number
}

// ── Main analytics result ──────────────────────────────────────

export interface EmployeesAnalyticsData {
  period:     EmployeesPeriod
  computedAt: Date

  // Global KPIs
  totalActive:             number
  avgPerformanceScore:     number
  topPerformersCount:      number   // score >= 75
  lowPerformersCount:      number   // score < 60
  totalWarningsPeriod:     number
  totalRecognitionsPeriod: number

  // Distribution
  byPerformanceLevel: PerformanceDistribution[]

  // Employee metrics (sorted by scorePerformance desc)
  employees: EmployeeMetrics[]

  // Sector breakdown
  sectors: SectorEmployeeMetrics[]

  // Monthly trend
  monthlyTrend: EmployeeTrendPoint[]

  // Criteria averages (from period evaluations)
  criteriaAverages: CriteriaAverage[]

  // Alerts (critical first)
  alerts: EmployeesAlert[]
}

// ── UI helpers ─────────────────────────────────────────────────

export const PERFORMANCE_COLORS: Record<PerformanceLevel, string> = {
  excelente: '#16a34a',
  muito_bom: '#22c55e',
  bom:       '#f59e0b',
  atencao:   '#ea580c',
  critico:   '#dc2626',
}

export const PERFORMANCE_BG: Record<PerformanceLevel, string> = {
  excelente: '#f0fdf4',
  muito_bom: '#dcfce7',
  bom:       '#fffbeb',
  atencao:   '#fff7ed',
  critico:   '#fef2f2',
}

export const PERFORMANCE_LABELS: Record<PerformanceLevel, string> = {
  excelente: 'Excelente',
  muito_bom: 'Muito Bom',
  bom:       'Bom',
  atencao:   'Atenção',
  critico:   'Crítico',
}

export const TREND_ICON: Record<EmployeeTrend, string>  = {
  improving: '↑', stable: '→', declining: '↓', no_data: '—',
}

export const TREND_COLOR: Record<EmployeeTrend, string> = {
  improving: '#16a34a', stable: '#94a3b8', declining: '#dc2626', no_data: '#cbd5e1',
}

export const CRITERIA_LABELS: Record<string, string> = {
  produtividade:      'Produtividade',
  qualidade:          'Qualidade',
  prazo:              'Prazo',
  responsabilidade:   'Responsabilidade',
  resolucaoProblemas: 'Resolução Prob.',
  iniciativa:         'Iniciativa',
  colaboracao:        'Colaboração',
  lideranca:          'Liderança',
  disciplina:         'Disciplina',
  conformidade:       'Conformidade',
}

export const CRITERIA_WEIGHTS: Record<string, number> = {
  produtividade: 0.15, qualidade: 0.15, prazo: 0.10, responsabilidade: 0.10,
  resolucaoProblemas: 0.10, iniciativa: 0.10, colaboracao: 0.10,
  lideranca: 0.05, disciplina: 0.10, conformidade: 0.05,
}

export function scoreToLevel(score: number): PerformanceLevel {
  if (score >= 90) return 'excelente'
  if (score >= 75) return 'muito_bom'
  if (score >= 60) return 'bom'
  if (score >= 40) return 'atencao'
  return 'critico'
}

export function scoreColorEmp(score: number): string {
  if (score >= 75) return '#16a34a'
  if (score >= 60) return '#f59e0b'
  if (score >= 40) return '#ea580c'
  return '#dc2626'
}

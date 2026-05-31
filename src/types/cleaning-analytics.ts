// src/types/cleaning-analytics.ts
// TypeScript types for the 5S Cleaning Analytics module.

import type { InspectionStatus } from './cleaning'

export type AnalyticsPeriod = '30d' | '90d' | '6m' | '1a'

export type CleaningRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type ZoneTrend = 'improving' | 'stable' | 'declining' | 'no_data'

export type CleaningAlertType =
  | 'score_drop'
  | 'overdue_inspection'
  | 'critical_issue'
  | 'repeated_nonconformity'
  | 'low_compliance'

// ── 5S Breakdown ──────────────────────────────────────────────

export interface FiveSScore {
  seiri:    number   // S1 — Utilização
  seiton:   number   // S2 — Organização
  seiso:    number   // S3 — Limpeza
  seiketsu: number   // S4 — Padronização
  shitsuke: number   // S5 — Disciplina
}

export interface FiveSItem {
  key:        keyof FiveSScore
  number:     number
  name:       string
  short:      string
  description: string
  avgScore:   number
  worstZone:  string
  worstScore: number
  color:      string
}

// ── Zone Metrics ─────────────────────────────────────────────

export interface ScorePoint {
  ts:    number
  score: number
  label: string
}

export interface IssuePattern {
  description: string
  count:       number
  severity:    string
}

export interface ZoneMetrics {
  zoneId:                  string
  zoneName:                string
  zoneIcon:                string
  sector:                  string
  totalInspections:        number
  averageScore:            number
  latestScore:             number | null
  latestTs:                number | null
  latestInspector:         string | null
  latestStatus:            InspectionStatus | 'no_data'
  scoreHistory:            ScorePoint[]
  fiveSScores:             FiveSScore
  nonConformities:         number
  criticalIssues:          number
  complianceRate:          number   // % inspections with score >= 70
  trend:                   ZoneTrend
  trendDelta:              number   // latestScore - prevScore
  daysSinceLastInspection: number | null
  riskScore:               number   // 0–100
  riskLevel:               CleaningRiskLevel
  topIssues:               IssuePattern[]
}

// ── Non-Conformity Patterns ───────────────────────────────────

export interface NonConformityPattern {
  description: string
  count:       number
  zones:       string[]
  severity:    'critical' | 'low'
  actionType:  string
  lastSeen:    number
}

// ── Time-Series ───────────────────────────────────────────────

export interface MonthlyTrend {
  monthKey:    string
  label:       string
  avgScore:    number
  inspections: number
  compliance:  number   // 0–100
}

// ── Inspector Performance ─────────────────────────────────────

export interface InspectorMetrics {
  employeeId:       string
  employeeName:     string
  cargo:            string
  totalInspections: number
  avgScore:         number
  zonesInspected:   string[]
  criticalFound:    number
  issuesFound:      number
}

// ── Alerts ────────────────────────────────────────────────────

export interface CleaningAlert {
  zoneId:   string
  zoneName: string
  type:     CleaningAlertType
  message:  string
  severity: 'critical' | 'warning'
  value?:   number
}

// ── Main Analytics Result ─────────────────────────────────────

export interface CleaningAnalyticsData {
  period:     AnalyticsPeriod
  computedAt: Date

  // Global KPIs
  totalZones:                    number
  totalInspections:              number
  avgScore:                      number
  complianceRate:                number
  criticalZones:                 number
  totalNonConformities:          number
  criticalIssues:                number
  daysSinceMostRecentInspection: number | null

  // Zone metrics sorted by riskScore desc
  zones: ZoneMetrics[]

  // Global 5S breakdown
  fiveSItems: FiveSItem[]

  // Score trend over time
  monthlyTrend: MonthlyTrend[]

  // Recurring non-conformity patterns
  topNonConformities: NonConformityPattern[]

  // Inspector performance
  inspectors: InspectorMetrics[]

  // Active alerts
  alerts: CleaningAlert[]
}

// ── UI Helpers ────────────────────────────────────────────────

export const RISK_COLORS: Record<CleaningRiskLevel, string> = {
  low:      '#16a34a',
  medium:   '#f59e0b',
  high:     '#ea580c',
  critical: '#dc2626',
}

export const RISK_LABELS: Record<CleaningRiskLevel, string> = {
  low: 'Baixo', medium: 'Médio', high: 'Alto', critical: 'Crítico',
}

export const TREND_ICON: Record<ZoneTrend, string> = {
  improving: '↑',
  stable:    '→',
  declining: '↓',
  no_data:   '—',
}

export const TREND_COLOR: Record<ZoneTrend, string> = {
  improving: '#16a34a',
  stable:    '#94a3b8',
  declining: '#dc2626',
  no_data:   '#cbd5e1',
}

export function scoreColor(score: number): string {
  if (score >= 70) return '#16a34a'
  if (score >= 50) return '#f59e0b'
  return '#dc2626'
}

export function scoreStatus(score: number): InspectionStatus {
  if (score >= 80) return 'excellent'
  if (score >= 70) return 'acceptable'
  if (score >= 50) return 'attention'
  return 'critical'
}

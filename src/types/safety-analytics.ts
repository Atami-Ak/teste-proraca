// src/types/safety-analytics.ts
// Type system for the Safety Analytics (Segurança Analytics) module.

import type { NivelRisco, Severidade } from './safety'

export type SafetyPeriod = '30d' | '90d' | '6m' | '1a'
export type SafetyRisk   = NivelRisco    // 'baixo' | 'medio' | 'alto' | 'critico'
export type SafetyTrend  = 'improving' | 'stable' | 'declining' | 'no_data'
export type IncidentLevel = Severidade   // 'baixa' | 'media' | 'alta' | 'critica'

// ── Monthly trend point ────────────────────────────────────────

export interface SafetyTrendPoint {
  monthKey:    string   // 'YYYY-MM'
  label:       string   // 'Jan/26'
  incidents:   number
  nearMisses:  number
  ddiAvgScore: number   // 0–100
  ddsCount:    number
}

// ── Per-sector aggregated safety metrics ───────────────────────

export interface SectorMetrics {
  setor:               string
  incidents:           number
  nearMisses:          number
  criticalOccurrences: number
  openOccurrences:     number
  ddsCount:            number
  ddiCount:            number
  avgDdiScore:         number   // 0–100
  epiNonCompliance:    number   // 0–100 (% non-compliant)
  epiTotal:            number
  activePermits:       number
  riskScore:           number   // 0–100
  riskLevel:           SafetyRisk
  trend:               SafetyTrend
  trendDelta:          number   // incident delta vs previous period
  topHazards:          string[] // top DDI non-conformance item labels
}

// ── Per-employee safety profile ────────────────────────────────

export interface EmployeeSafetyProfile {
  id:           string
  nome:         string
  matricula:    string
  setor:        string
  departamento: string
  funcao:       string
  epiStatus:    string   // 'conforme' | 'pendente' | 'irregular' | 'vencido'
  epiVencidos:  number
  epiAVencer:   number
  incidentCount: number
  ddsAttended:  number
  ddsInSector:  number
  ddsRate:      number   // 0–100
  riskScore:    number   // 0–100
  riskLevel:    SafetyRisk
}

// ── Incident breakdown ─────────────────────────────────────────

export interface IncidentTypeBreakdown {
  type:  string
  label: string
  count: number
  color: string
}

export interface IncidentSeverityBreakdown {
  severity: string
  label:    string
  count:    number
  color:    string
}

// ── Radar dimension ────────────────────────────────────────────

export interface SafetyDimension {
  subject:  string
  score:    number   // 0–100 (higher = safer)
  fullMark: 100
}

// ── Alerts ─────────────────────────────────────────────────────

export type SafetyAlertType =
  | 'critical_incident'
  | 'high_risk_sector'
  | 'epi_non_compliance'
  | 'missing_dds'
  | 'low_ddi_score'
  | 'employee_risk'
  | 'open_occurrence'

export interface SafetyAlert {
  type:     SafetyAlertType
  severity: 'critical' | 'warning'
  message:  string
  setor?:   string
  value?:   number
}

// ── Main analytics result ──────────────────────────────────────

export interface SafetyAnalyticsData {
  period:     SafetyPeriod
  computedAt: Date

  // Global KPIs
  totalIncidents:    number
  totalNearMisses:   number
  totalDds:          number
  totalDdi:          number
  avgDdiScore:       number   // 0–100
  epiComplianceRate: number   // 0–100
  ddsAttendanceRate: number   // 0–100
  openOccurrences:   number
  activePermits:     number

  // Overall risk
  overallRiskScore: number
  overallRiskLevel: SafetyRisk

  // Time-series
  monthlyTrend: SafetyTrendPoint[]

  // By sector (sorted riskScore desc)
  sectors: SectorMetrics[]

  // Employee profiles (sorted riskScore desc)
  employees: EmployeeSafetyProfile[]

  // Breakdown charts
  byType:     IncidentTypeBreakdown[]
  bySeverity: IncidentSeverityBreakdown[]

  // Multi-dimension radar
  radarData: SafetyDimension[]

  // Alerts (critical first)
  alerts: SafetyAlert[]
}

// ── UI helpers ─────────────────────────────────────────────────

export const RISK_COLORS: Record<SafetyRisk, string> = {
  baixo:   '#16a34a',
  medio:   '#f59e0b',
  alto:    '#ea580c',
  critico: '#dc2626',
}

export const RISK_BG: Record<SafetyRisk, string> = {
  baixo:   '#f0fdf4',
  medio:   '#fffbeb',
  alto:    '#fff7ed',
  critico: '#fef2f2',
}

export const RISK_LABELS: Record<SafetyRisk, string> = {
  baixo:   'Baixo',
  medio:   'Médio',
  alto:    'Alto',
  critico: 'Crítico',
}

export const TREND_ICON: Record<SafetyTrend, string> = {
  improving: '↓',   // fewer incidents is good (down arrow = positive)
  stable:    '→',
  declining: '↑',   // more incidents is bad (up arrow = negative)
  no_data:   '—',
}

export const TREND_COLOR: Record<SafetyTrend, string> = {
  improving: '#16a34a',
  stable:    '#94a3b8',
  declining: '#dc2626',
  no_data:   '#cbd5e1',
}

export const INCIDENT_TYPE_LABELS: Record<string, string> = {
  acidente_com_afastamento: 'Acid. c/ Afastamento',
  acidente_sem_afastamento: 'Acid. s/ Afastamento',
  quase_acidente:           'Quase-Acidente',
  condicao_insegura:        'Condição Insegura',
  ato_inseguro:             'Ato Inseguro',
  doenca_ocupacional:       'Doença Ocupacional',
}

export const INCIDENT_TYPE_COLORS: Record<string, string> = {
  acidente_com_afastamento: '#dc2626',
  acidente_sem_afastamento: '#ea580c',
  quase_acidente:           '#f59e0b',
  condicao_insegura:        '#3b82f6',
  ato_inseguro:             '#8b5cf6',
  doenca_ocupacional:       '#6b7280',
}

export const SEVERITY_LABELS: Record<string, string> = {
  critica: 'Crítica',
  alta:    'Alta',
  media:   'Média',
  baixa:   'Baixa',
}

export const SEVERITY_COLORS: Record<string, string> = {
  critica: '#dc2626',
  alta:    '#ea580c',
  media:   '#f59e0b',
  baixa:   '#16a34a',
}

export const EPI_STATUS_LABELS: Record<string, string> = {
  conforme:  'Conforme',
  pendente:  'Pendente',
  irregular: 'Irregular',
  vencido:   'Vencido',
}

export const EPI_STATUS_COLORS: Record<string, string> = {
  conforme:  '#16a34a',
  pendente:  '#f59e0b',
  irregular: '#ea580c',
  vencido:   '#dc2626',
}

export function riskFromScore(score: number): SafetyRisk {
  if (score >= 70) return 'critico'
  if (score >= 45) return 'alto'
  if (score >= 20) return 'medio'
  return 'baixo'
}

export function scoreColor(score: number): string {
  if (score >= 75) return '#16a34a'
  if (score >= 55) return '#f59e0b'
  return '#dc2626'
}

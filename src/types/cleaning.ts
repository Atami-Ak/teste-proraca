// ── Item level ────────────────────────────────────────

export type ItemType     = 'score' | 'passfail'
export type ActionType   = 'cleaning' | 'structural' | 'material'
export type RiskLevel    = 'low' | 'medium' | 'high' | 'critical'

export interface ChecklistItem {
  id:                 string
  texto:              string
  tipo:               ItemType
  critical:           boolean
  requiresPhotoOnFail: boolean
  actionType:         ActionType
}

// ── Zone catalog ──────────────────────────────────────

export interface ZoneSection {
  id:    string
  nome:  string
  items: ChecklistItem[]
}

export interface Zone {
  id:           string
  nome:         string
  icone:        string
  setor:        string
  riskLevel:    RiskLevel
  descricao:    string
  responsaveis: string[]   // Employee IDs
  sections:     ZoneSection[]
}

export interface Employee {
  id:    string
  nome:  string
  cargo: string
}

// ── Inspection record ─────────────────────────────────

export type InspectionStatus = 'excellent' | 'acceptable' | 'attention' | 'critical'

export interface SectionScore {
  id:    string
  nome:  string
  score: number  // 0-100
  items: Array<ChecklistItem & { scoreGiven: number | null }>
}

export interface Issue {
  itemId:      string
  description: string
  category:    string
  severity:    'critical' | 'low'
  actionType:  ActionType
  linkedWOId:  string | null
  photoUrl:    string | null
}

export interface CleaningInspection {
  id:               string
  zoneId:           string
  zoneName:         string
  inspectorName:    string
  employeeId:       string
  employeeName:     string
  score:            number  // 0-100
  status:           InspectionStatus
  sections:         SectionScore[]
  issues:           Issue[]
  notes:            string
  hasCriticalIssue: boolean
  timestampEnvio:   number
  dataCriacaoOficial?: Date
}

// ── Aggregations ──────────────────────────────────────

export interface ZonePerformance {
  zoneId:          string
  zoneName:        string
  zoneIcon:        string
  totalInspections: number
  averageScore:    number
  latestScore:     number | null
  latestStatus:    InspectionStatus | 'no_data'
  latestEmployee:  string
  latestTs:        number
  scoreHistory:    Array<{ ts: number; score: number }>
  issueCount:      number
}

export type EmployeeStatus = 'top' | 'needs_improvement' | 'critical' | 'no_data'

export interface EmployeePerformance {
  employeeId:       string
  employeeName:     string
  cargo:            string
  totalInspections: number
  averageScore:     number
  failures:         number
  criticalIssues:   number
  status:           EmployeeStatus
  latestTs:         number
}

// ── Scoring result ────────────────────────────────────

export interface ScoringResult {
  finalScore:     number   // 0-100
  sections:       SectionScore[]
  hasLowSection:  boolean  // any section < 60%
}

// ── Form state ────────────────────────────────────────

export type ScoreValue = 0 | 1 | 2 | 3 | 4 | 5 | null   // null = N/A

export interface FormScores {
  [itemId: string]: ScoreValue
}

export interface FormIssue {
  itemId:      string
  description: string
  category:    string
  actionType:  ActionType
  severity:    'critical' | 'low'
  linkedWOId:  string | null
  photo:       File | null
  photoUrl:    string | null
}

// ── UI meta ───────────────────────────────────────────

export const STATUS_META: Record<InspectionStatus, { label: string; color: string; bg: string; border: string; icon: string }> = {
  excellent:  { label: 'Excelente', color: '#16a34a', bg: '#f0fdf4', border: '#86efac', icon: '🟢' },
  acceptable: { label: 'Aceitável', color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '🟡' },
  attention:  { label: 'Atenção',   color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', icon: '🟠' },
  critical:   { label: 'Crítico',   color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: '🔴' },
}

export const ACTION_META: Record<ActionType, { label: string; icon: string; color: string }> = {
  cleaning:   { label: 'Limpeza',   icon: '🧹', color: '#3b82f6' },
  structural: { label: 'Estrutural', icon: '🏗️', color: '#f59e0b' },
  material:   { label: 'Material',   icon: '📦', color: '#8b5cf6' },
}

export const SCORE_LABELS: Record<number, string> = {
  0: 'Péssimo',
  1: 'Ruim',
  2: 'Regular',
  3: 'Bom',
  4: 'Ótimo',
  5: 'Excelente',
}

// src/types/obras-analytics.ts
// Type system for the Works & Contractors Analytics (Obras & Empreiteiras) module.

export type ObrasPeriod = '30d' | '90d' | '6m' | '1a'

export type ObraStatus =
  | 'planejamento'
  | 'em_andamento'
  | 'paralisada'
  | 'concluida'
  | 'cancelada'

export type EmpreiteiraStatus =
  | 'preferencial'
  | 'aprovada'
  | 'aprovada_restr'
  | 'nao_recomendada'
  | 'bloqueada'

export type ObrasRisk = 'baixo' | 'medio' | 'alto' | 'critico'

// ── Per-obra aggregated metrics ────────────────────────────────

export interface ObraMetrics {
  id:                string
  codigo:            string
  nome:              string
  empreiteiraId?:    string
  empreiteiraNome?:  string
  status:            ObraStatus
  prioridade:        string
  local:             string
  tipo:              string
  percentualConcluido: number

  // Financial
  valorContrato?:    number
  valorPago?:        number
  costVariancePct:   number   // (valorPago - valorContrato) / valorContrato * 100

  // Schedule
  dataInicio?:       Date
  dataFimPrevisto?:  Date
  dataFimReal?:      Date
  delayDays:         number   // positive = delayed, 0 = on time, negative = ahead
  isDelayed:         boolean

  // Quality (pre-computed on obra document)
  notaMedia:         number   // 0–10
  totalInspecoes:    number
  alertasCriticos:   number
  qualityScore:      number   // 0–100 = notaMedia * 10

  // Risk
  riskScore:         number
  riskLevel:         ObrasRisk
}

// ── Per-contractor aggregated metrics ──────────────────────────

export interface EmpreiteiraMetrics {
  id:             string
  nome:           string
  cnpj?:          string
  especialidades: string[]
  status:         EmpreiteiraStatus
  ativo:          boolean

  // From empreiteira document aggregates
  scoreGlobal:    number   // 0–100
  totalObras:     number
  obrasAprovadas: number
  approvalRate:   number   // 0–100

  // From avaliacoes in period
  avgQuality:          number   // 0–100
  avgPrazo:            number
  avgSeguranca:        number
  avgCustoBeneficio:   number
  periodAvaliacoes:    number

  // From obras currently linked
  obrasAtivas:     number
  obrasAtrasadas:  number
  delayRate:       number   // 0–100

  // Risk
  riskScore: number
  riskLevel: ObrasRisk
}

// ── Status breakdown chart ─────────────────────────────────────

export interface StatusBreakdown {
  status: ObraStatus | string
  label:  string
  count:  number
  color:  string
}

// ── Contractor status breakdown ────────────────────────────────

export interface ContractorStatusBreakdown {
  status: EmpreiteiraStatus | string
  label:  string
  count:  number
  color:  string
}

// ── Monthly quality trend ──────────────────────────────────────

export interface ObrasTrendPoint {
  monthKey:          string
  label:             string
  avgQualityScore:   number   // 0–10
  inspecoesCount:    number
  alertasCriticos:   number
}

// ── Alerts ─────────────────────────────────────────────────────

export type ObrasAlertType =
  | 'delayed_obra'
  | 'low_quality'
  | 'critical_contractor'
  | 'cost_overrun'
  | 'no_inspections'
  | 'blocked_contractor'

export interface ObrasAlert {
  type:              ObrasAlertType
  severity:          'critical' | 'warning'
  message:           string
  obraId?:           string
  obraNome?:         string
  empreiteiraId?:    string
  empreiteiraNome?:  string
  value?:            number
}

// ── Main analytics result ──────────────────────────────────────

export interface ObrasAnalyticsData {
  period:     ObrasPeriod
  computedAt: Date

  // Global KPIs
  totalObras:          number
  emAndamento:         number
  concluidas:          number
  atrasadas:           number
  paralisadas:         number
  avgQualityScore:     number   // 0–100

  // Financial
  totalContrato:       number
  totalPago:           number
  costVarianceTotal:   number   // R$ overspend/underspend

  // Contractors
  totalEmpreiteiras:   number
  avgEmpreiteiraScore: number

  // Status distribution
  byStatus: StatusBreakdown[]

  // Works metrics (sorted by riskScore desc)
  obras: ObraMetrics[]

  // Contractor metrics (sorted by scoreGlobal desc)
  empreiteiras: EmpreiteiraMetrics[]

  // Monthly quality trend
  monthlyTrend: ObrasTrendPoint[]

  // Alerts (critical first)
  alerts: ObrasAlert[]
}

// ── UI helpers ─────────────────────────────────────────────────

export const OBRAS_RISK_COLORS: Record<ObrasRisk, string> = {
  baixo:   '#16a34a',
  medio:   '#f59e0b',
  alto:    '#ea580c',
  critico: '#dc2626',
}

export const OBRAS_RISK_BG: Record<ObrasRisk, string> = {
  baixo:   '#f0fdf4',
  medio:   '#fffbeb',
  alto:    '#fff7ed',
  critico: '#fef2f2',
}

export const OBRAS_RISK_LABELS: Record<ObrasRisk, string> = {
  baixo: 'Baixo', medio: 'Médio', alto: 'Alto', critico: 'Crítico',
}

export const OBRA_STATUS_LABELS: Record<ObraStatus, string> = {
  planejamento: 'Planejamento',
  em_andamento: 'Em Andamento',
  paralisada:   'Paralisada',
  concluida:    'Concluída',
  cancelada:    'Cancelada',
}

export const OBRA_STATUS_COLORS: Record<ObraStatus, string> = {
  planejamento: '#3b82f6',
  em_andamento: '#f59e0b',
  paralisada:   '#ea580c',
  concluida:    '#16a34a',
  cancelada:    '#94a3b8',
}

export const EMPREITEIRA_STATUS_LABELS: Record<EmpreiteiraStatus, string> = {
  preferencial:   'Preferencial',
  aprovada:       'Aprovada',
  aprovada_restr: 'Aprovada c/ Restr.',
  nao_recomendada:'Não Recomendada',
  bloqueada:      'Bloqueada',
}

export const EMPREITEIRA_STATUS_COLORS: Record<EmpreiteiraStatus, string> = {
  preferencial:    '#16a34a',
  aprovada:        '#22c55e',
  aprovada_restr:  '#f59e0b',
  nao_recomendada: '#ea580c',
  bloqueada:       '#dc2626',
}

export const AVALIACAO_CRITERIA_LABELS: Record<string, string> = {
  qualidade:          'Qualidade',
  seguranca:          'Segurança',
  prazo:              'Prazo',
  retrabalho:         'Zero Retrabalho',
  organizacao:        'Organização',
  custoBeneficio:     'Custo/Benefício',
  profissionalismo:   'Profissionalismo',
  resolucaoProblemas: 'Resolução Prob.',
}

export function obrasRiskFromScore(score: number): ObrasRisk {
  if (score >= 70) return 'critico'
  if (score >= 45) return 'alto'
  if (score >= 20) return 'medio'
  return 'baixo'
}

export function qualityColor(score: number): string {
  // score 0-10
  if (score >= 8) return '#16a34a'
  if (score >= 6) return '#f59e0b'
  if (score >= 4) return '#ea580c'
  return '#dc2626'
}

export function qualityLabel(score: number): string {
  if (score >= 8) return 'Ótima'
  if (score >= 6) return 'Boa'
  if (score >= 4) return 'Regular'
  return 'Crítica'
}

// ─────────────────────────────────────────────────────────────────────────────
// data-hub.ts — Sistema de Tipos do Data Intelligence Hub (v1)
// Motor central que agrega, calcula e distribui inteligência entre módulos.
// ─────────────────────────────────────────────────────────────────────────────

// ── Status / Tendência ────────────────────────────────────────────────────────
export type HealthStatus = 'excellent' | 'good' | 'attention' | 'critical'
export type Trend        = 'rising' | 'stable' | 'falling'
export type AlertSeverity = 'critical' | 'urgent' | 'attention' | 'info'
export type RecommendationPriority = 'high' | 'medium' | 'low'

export type ModuleKey =
  | 'os'
  | 'compras'
  | 'seguranca'
  | 'colaboradores'
  | 'limpeza'
  | 'obras'
  | 'maquinario'
  | 'aprovacoes'

// ── Score por módulo ──────────────────────────────────────────────────────────
export interface ModuleScore {
  score:   number           // 0-100
  status:  HealthStatus
  trend:   Trend
  label:   string           // descrição em linguagem natural
  metrics: Record<string, number>   // métricas brutas que compõem o score
}

// ── Saúde global (todos os módulos + global) ──────────────────────────────────
export interface GlobalHealthScores {
  global:        ModuleScore
  os:            ModuleScore
  compras:       ModuleScore
  seguranca:     ModuleScore
  colaboradores: ModuleScore
  limpeza:       ModuleScore
  obras:         ModuleScore
  maquinario:    ModuleScore
  aprovacoes:    ModuleScore
}

// ── KPIs Consolidados (cross-module) ─────────────────────────────────────────
export interface HubKpis {
  // OS / Manutenção
  osAbertas:            number
  osCriticas:           number
  osAtrasadas:          number
  osConcluidasUltimos7d: number

  // Compras
  pcPendentes:          number
  pcUrgentes:           number
  pcValorPendente:      number    // R$ total

  // Segurança
  incidentesAbertos:    number
  incidentesUltimos30d: number
  epiVencidos:          number
  ddsUltimos30d:        number
  ddiUltimos30d:        number

  // Colaboradores
  colaboradoresAtivos:   number
  colaboradoresCriticos: number   // score < 40
  certVencidas:          number
  certAVencer:           number
  bancoHorasAlerta:      number   // colaboradores com saldo negativo

  // Limpeza 5S
  zonasCriticas:         number   // score < 60
  scoreMediaLimpeza:     number

  // Obras
  obrasAtivas:           number
  obrasAtrasadas:        number
  empreiteirasCriticas:  number

  // Maquinário
  maquinasEmManutencao:  number
  maquinasCriticas:      number
  manutencoesAtrasadas:  number

  // Aprovações
  aprovacoesPendentes:   number
}

// ── Alerta Cross-Module ───────────────────────────────────────────────────────
export interface HubAlert {
  id:          string
  severity:    AlertSeverity
  module:      ModuleKey
  title:       string
  description: string
  actionPath?: string
  actionLabel?: string
  relatedId?:  string
  relatedType?: string
  createdAt:   Date
}

// ── Recomendação Prescritiva ──────────────────────────────────────────────────
export interface HubRecommendation {
  id:              string
  priority:        RecommendationPriority
  module:          ModuleKey
  title:           string
  description:     string
  impact:          string           // descrição do impacto
  estimatedValue?: number           // valor estimado (economia, % melhora, etc.)
  estimatedUnit?:  string           // 'BRL' | '%' | 'horas' | 'dias'
  actionPath?:     string
  actionLabel?:    string
  confidence:      number           // 0-100 — confiança na recomendação
  basis:           string           // por que esta recomendação foi gerada
}

// ── Evento Cross-Module (para correlações) ────────────────────────────────────
export interface CrossModuleEvent {
  id?:         string
  module:      ModuleKey | 'system'
  entityType:  string
  entityId:    string
  entityName?: string
  eventType:   string    // 'created' | 'status_changed' | 'escalated' | 'resolved'
  field?:      string
  oldValue?:   string
  newValue?:   string
  triggeredBy: string    // userId ou 'system'
  occurredAt:  Date
}

// ── Snapshot principal (documento no Firestore) ───────────────────────────────
export interface DataHubSnapshot {
  id?:             string
  generatedAt:     Date
  generatedBy:     string     // 'auto' | userId
  version:         number     // versão do schema
  ttlMinutes:      number     // TTL do cache em minutos

  healthScores:    GlobalHealthScores
  kpis:            HubKpis
  alerts:          HubAlert[]
  recommendations: HubRecommendation[]

  // Metadados de performance
  collectionsRead: string[]
  computationMs:   number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function scoreToHealth(score: number): HealthStatus {
  if (score >= 85) return 'excellent'
  if (score >= 65) return 'good'
  if (score >= 45) return 'attention'
  return 'critical'
}

export const HEALTH_META: Record<HealthStatus, {
  label: string; color: string; bg: string; border: string; icon: string
}> = {
  excellent: { label: 'Excelente', color: '#166534', bg: 'rgba(22,101,52,0.08)',  border: 'rgba(22,101,52,0.2)',  icon: '🟢' },
  good:      { label: 'Bom',       color: '#16a34a', bg: 'rgba(22,163,74,0.08)',  border: 'rgba(22,163,74,0.2)',  icon: '🟡' },
  attention: { label: 'Atenção',   color: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.2)',  icon: '🟠' },
  critical:  { label: 'Crítico',   color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.2)',  icon: '🔴' },
}

export const TREND_META: Record<Trend, { label: string; icon: string; color: string }> = {
  rising:  { label: 'Melhorando', icon: '↑', color: '#16a34a' },
  stable:  { label: 'Estável',    icon: '→', color: '#64748b' },
  falling: { label: 'Piorando',   icon: '↓', color: '#dc2626' },
}

export const MODULE_META: Record<ModuleKey, {
  label: string; icon: string; path: string; dashPath: string; weight: number
}> = {
  seguranca:     { label: 'Segurança',     icon: '🛡️', path: '/seguranca',          dashPath: '/dashboard/seguranca',     weight: 0.25 },
  colaboradores: { label: 'Colaboradores', icon: '👥', path: '/colaboradores',       dashPath: '/dashboard/colaboradores', weight: 0.20 },
  os:            { label: 'O.S.',          icon: '📑', path: '/os',                  dashPath: '/os',                      weight: 0.15 },
  maquinario:    { label: 'Maquinário',    icon: '⚙️', path: '/ativos/manutencao',  dashPath: '/dashboard/maquinario',    weight: 0.15 },
  compras:       { label: 'Compras',       icon: '🛒', path: '/compras',             dashPath: '/dashboard/compras',       weight: 0.10 },
  limpeza:       { label: 'Limpeza 5S',    icon: '🧹', path: '/limpeza',             dashPath: '/dashboard/limpeza',       weight: 0.08 },
  obras:         { label: 'Obras',         icon: '🏗️', path: '/obras',               dashPath: '/dashboard/obras',         weight: 0.04 },
  aprovacoes:    { label: 'Aprovações',    icon: '✅', path: '/dashboard/aprovacoes', dashPath: '/dashboard/aprovacoes',   weight: 0.03 },
}

export const ALERT_SEVERITY_META: Record<AlertSeverity, {
  label: string; color: string; bg: string; order: number
}> = {
  critical:  { label: 'Crítico',     color: '#dc2626', bg: 'rgba(220,38,38,0.08)',  order: 0 },
  urgent:    { label: 'Urgente',     color: '#ea580c', bg: 'rgba(234,88,12,0.08)',  order: 1 },
  attention: { label: 'Atenção',     color: '#d97706', bg: 'rgba(217,119,6,0.08)', order: 2 },
  info:      { label: 'Informativo', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', order: 3 },
}

export const REC_PRIORITY_META: Record<RecommendationPriority, {
  label: string; color: string; bg: string
}> = {
  high:   { label: 'Alta',  color: '#dc2626', bg: 'rgba(220,38,38,0.08)'  },
  medium: { label: 'Média', color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
  low:    { label: 'Baixa', color: '#64748b', bg: 'rgba(100,116,139,0.08)' },
}

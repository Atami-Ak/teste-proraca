// src/types/dashboard.ts

import type { Timestamp } from 'firebase/firestore'

// ── Period ────────────────────────────────────────────

export type Period = '30d' | '90d' | '6m' | '1a'

export interface DateRange {
  from: Date
  to:   Date
}

export function periodToDays(p: Period): number {
  return p === '30d' ? 30 : p === '90d' ? 90 : p === '6m' ? 180 : 365
}

export function getPeriodRanges(period: Period): { current: DateRange; prev: DateRange } {
  const days = periodToDays(period)
  const now  = new Date()
  const from = new Date(now.getTime() - days * 86_400_000)
  const prevTo   = new Date(from.getTime() - 1)
  const prevFrom = new Date(prevTo.getTime() - days * 86_400_000)
  return {
    current: { from, to: now },
    prev:    { from: prevFrom, to: prevTo },
  }
}

// ── KPI ───────────────────────────────────────────────

export type DashboardModule =
  | 'overview' | 'maquinario' | 'frota' | 'limpeza'
  | 'seguranca' | 'colaboradores' | 'obras' | 'compras'
  | 'aprovacoes' | 'documentos' | 'acesso'

export type KpiSeverity = 'neutral' | 'good' | 'warning' | 'critical'

export interface KpiMetric {
  key:      string
  label:    string
  value:    number
  prev:     number
  trend:    number          // ((value - prev) / max(1, prev)) * 100, rounded
  unit?:    string          // 'R$', '%', etc.
  module:   DashboardModule
  severity: KpiSeverity     // determines trend color direction
  detail?:  string          // ex: "2 críticas", "atualizado há 3min"
}

// trend color logic (exported for KpiCard):
// severity=critical → trend>0 = red (bad), trend<0 = green (good)
// severity=good     → trend>0 = green, trend<0 = red
// severity=warning  → trend>0 = green, trend<0 = red  (same as good)
// severity=neutral  → always gray
export function trendColor(severity: KpiSeverity, trend: number): string {
  if (severity === 'neutral' || trend === 0) return '#94a3b8'
  if (severity === 'critical') return trend > 0 ? '#dc2626' : '#16a34a'
  return trend > 0 ? '#16a34a' : '#dc2626'
}

export function trendIcon(trend: number): string {
  if (trend > 0) return '▲'
  if (trend < 0) return '▼'
  return '—'
}

// ── Alert ─────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'urgent' | 'attention'

export interface AlertItem {
  id:        string
  severity:  AlertSeverity
  title:     string
  module:    DashboardModule
  createdAt: Date
  linkTo:    string
}

// ── Module Health ─────────────────────────────────────

export type HealthStatus = 'ok' | 'warning' | 'critical'

export interface ModuleHealth {
  module:  DashboardModule
  label:   string
  status:  HealthStatus
  metric:  string
}

// ── KPI Cache (Firestore document) ────────────────────

export interface KpiValue {
  value: number
  prev:  number
}

export interface KpiCacheDoc {
  generatedAt:          Timestamp
  period:               Period
  ordensAbertas:        KpiValue
  aprovacoesPendentes:  KpiValue
  manutencaoAtrasada:   KpiValue
  comprasUrgentes:      KpiValue
  alertasMaquinario:    KpiValue
  alertasFrota:         KpiValue
  falhasLimpeza:        KpiValue
  incidentesSeguranca:  KpiValue
  alertasColaboradores: KpiValue
  empreiteirasCriticas: KpiValue
  problemsFornecedores: KpiValue
  itensAuditoriaPend:   KpiValue
}

// ── Chart Data ────────────────────────────────────────

export interface OverviewChartPoint {
  date:       string   // 'DD/MM' for display
  abertas:    number   // OS abertas
  concluidas: number   // OS concluídas
  custo:      number   // custo operacional R$
}

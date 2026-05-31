// src/types/machinery-analytics.ts

export type MachineRiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type AnalyticsPeriod  = '30d' | '90d' | '6m' | '1a'

export interface CostByMonth {
  monthKey: string   // 'YYYY-MM' — used for sorting
  label:    string   // 'Jan/25'
  cost:     number
}

export interface RecurrentIssue {
  description: string
  count:       number
}

export interface MachineAlert {
  assetId:     string
  machineName: string
  type:        'cost_spike' | 'repeated_failures' | 'os_flood' | 'overdue' | 'critical_state'
  message:     string
  severity:    'warning' | 'critical'
}

export interface MachineMetrics {
  assetId:       string
  name:          string
  code:          string
  categoryId:    string
  location:      string
  assetStatus:   string          // 'ativo' | 'manutencao' | 'avariado' | 'inativo'
  currentState:  'ok' | 'warning' | 'danger' | 'unknown'

  // Cost
  totalCost:     number
  costByMonth:   CostByMonth[]

  // Maintenance
  maintTotal:    number
  prevCount:     number
  corrCount:     number
  inspCount:     number
  overdueCount:  number
  avgResDays:    number          // average resolution days
  mtbf:          number | null   // mean time between failures (days)
  recurrent:     RecurrentIssue[]

  // Work orders
  osTotal:       number
  osOpen:        number

  // Risk
  riskScore:     number          // 0–100
  riskLevel:     MachineRiskLevel
}

export interface MachineryAnalyticsData {
  machines:          MachineMetrics[]

  // Global KPIs
  totalMachines:     number
  criticalCount:     number
  totalCostPeriod:   number
  totalOsOpen:       number
  totalOverdue:      number
  avgMtbf:           number | null

  // Global cost trend
  globalCostByMonth: CostByMonth[]

  // Alerts
  alerts:            MachineAlert[]

  computedAt:        Date
  period:            AnalyticsPeriod
}

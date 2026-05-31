// src/types/fleet-analytics.ts

export type FleetRiskLevel   = 'low' | 'medium' | 'high' | 'critical'
export type FleetPeriod      = '30d' | '90d' | '6m' | '1a'
export type VehicleStatus    = 'operational' | 'attention' | 'preventive_due' | 'in_maintenance' | 'stopped' | 'critical' | 'unknown'
export type VehicleTrend     = 'improving' | 'worsening' | 'stable' | 'insufficient_data'

export interface FleetCostByMonth {
  monthKey: string   // 'YYYY-MM'
  label:    string   // 'Jan/25'
  cost:     number
}

export interface FleetAlert {
  vehicleId:   string
  plate:       string
  vehicleName: string
  type:        'cost_spike' | 'repeated_failures' | 'os_flood' | 'critical_state' | 'high_nc' | 'downtime'
  message:     string
  severity:    'warning' | 'critical'
}

export interface VehicleMetrics {
  vehicleId:      string
  placa:          string
  modelo:         string
  categoria:      string
  icone:          string
  motorista:      string

  // From vehicle_state (pre-computed by fleet engine)
  currentStatus:  VehicleStatus
  failureCount:   number
  downtimeHours:  number
  mtbfHours:      number | null
  mttrHours:      number | null
  trend:          VehicleTrend
  lastEventDesc:  string | null

  // From checklists_frota
  inspectionCount:  number
  totalNcCount:     number
  latestMileage:    number | null
  firstMileage:     number | null

  // From work_orders
  osTotal:          number
  osOpen:           number
  correctiveCount:  number
  preventiveCount:  number

  // From purchase_orders (cost = sum items[].precoTotal)
  totalCost:        number
  costByMonth:      FleetCostByMonth[]

  // Computed
  mileageDelta:     number | null   // km travelled in period
  costPerKm:        number | null

  riskScore:        number          // 0–100
  riskLevel:        FleetRiskLevel
}

export interface FleetAnalyticsData {
  vehicles:          VehicleMetrics[]

  totalVehicles:     number
  criticalCount:     number
  totalCostPeriod:   number
  totalOsOpen:       number
  totalNcPeriod:     number
  avgMtbfHours:      number | null
  totalDowntimeHours:number

  globalCostByMonth: FleetCostByMonth[]
  alerts:            FleetAlert[]

  computedAt:        Date
  period:            FleetPeriod
}

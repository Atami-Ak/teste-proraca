import type { FirestoreTimestamp } from './index'

// ── Vehicle catalog (static) ──────────────────────────

export type VehicleCategory =
  | 'Caminhões Leves (3/4)'
  | 'Carretas'
  | 'Caminhões Toco/Truck'
  | 'Caminhões 4º Eixo'
  | 'Caminhões Bitruck'
  | 'Rodotrem'
  | 'Carros Leves'
  | 'Motos'

export interface Vehicle {
  id:               string
  placa:            string
  modelo:           string
  categoria:        VehicleCategory
  icone:            string
  motoristaPadrao?: string
}

// ── Checklist ────────────────────────────────────────

export type ChecklistCategory =
  | 'cab_internal'
  | 'lighting_signaling'
  | 'advanced_lighting'
  | 'structure_safety_fluids'
  | 'mechanical_load'

export interface ChecklistItemDef {
  id:       string
  label:    string
  required: boolean
}

export interface ChecklistItem {
  id:       string
  label:    string
  category: ChecklistCategory
  status:   'C' | 'NC' | null  // null = unanswered
  notes:    string
  photos:   string[]            // download URLs after upload; empty while filling
  required: boolean
}

export interface CategoryGroup {
  key:   ChecklistCategory
  meta:  { label: string; icon: string; order: number; optional?: boolean }
  items: ChecklistItem[]
}

export interface ChecklistStats {
  total:     number
  answered:  number
  ncCount:   number
  cCount:    number
  remaining: number
  pct:       number
}

export interface CapabilitySet {
  cab_internal:            boolean
  lighting_signaling:      boolean
  advanced_lighting:       boolean
  structure_safety_fluids: boolean
  mechanical_load:         boolean
}

// ── Maintenance data (fluids section of inspection) ──

export type FluidLevel = 'ok' | 'baixo' | 'critico'

export interface MaintenanceData {
  oilLevel:       FluidLevel
  coolantLevel:   FluidLevel
  brakeFluid:     FluidLevel
  tiresPressure:  string
  maintenanceObs: string
}

// ── Inspection ────────────────────────────────────────

export type InspectionType = 'departure' | 'return'

export interface InspectionHeader {
  vehicleId:       string
  vehiclePlate:    string
  vehicleModel:    string
  vehicleCategory: string
  inspectionType:  InspectionType
  date:            string   // YYYY-MM-DD
  time?:           string
  location:        string
  destination?:    string
  mileage:         number
  fueling:         boolean
}

export interface FleetInspection {
  id:                         string
  header:                     InspectionHeader
  checklist:                  ChecklistItem[]
  maintenance:                MaintenanceData
  inspector:                  string
  driver:                     string
  generalNotes:               string
  responsibilityTermAccepted: boolean
  nonConformities:            number
  vehicleId:                  string
  vehiclePlate:               string
  vehicleModel:               string
  inspectionType:             InspectionType
  linkedWorkOrders?:          string[]
  linkedPurchaseOrders?:      string[]
  createdBy:                  string
  createdAt?:                 FirestoreTimestamp | null
  timestampEnvio:             number
}

// ── Vehicle state (vehicle_state collection) ─────────

export type VehicleStatus =
  | 'operational'
  | 'attention'
  | 'preventive_due'
  | 'in_maintenance'
  | 'stopped'
  | 'critical'

export type TrendType =
  | 'improving'
  | 'worsening'
  | 'stable'
  | 'insufficient_data'

export interface VehicleState {
  id:                  string   // same as vehicleId
  vehicleId:           string
  currentStatus:       VehicleStatus
  lastEventDate:       number   // ms timestamp
  lastEventDesc:       string | null
  lastMaintenanceType: string | null
  lastWorkOrderId:     string | null
  totalDowntimeHours:  number
  failureCount:        number
  mtbfHours:           number | null
  mttrHours:           number | null
  recentFailures:      number
  trend:               TrendType
  updatedAt?:          FirestoreTimestamp | null
  updatedBy:           string
}

export interface VehicleWithState {
  vehicle:         Vehicle
  state:           VehicleState | null
  effectiveStatus: VehicleStatus
}

// ── KPIs ─────────────────────────────────────────────

export interface VehicleKPIs {
  totalRegistros:    number
  totalParadas:      number
  totalPreventivas:  number
  totalDowntimeHours: number
  mtbfHours:         number | null
  mttrHours:         number | null
  recentFailures:    number
  trend:             TrendType
}

// ── Parts catalog ─────────────────────────────────────

export interface Part {
  name:     string
  quantity: number
  priority: 'high' | 'medium' | 'low'
}

export interface PartsCatalogEntry {
  requiresPurchase: boolean
  parts:            Part[]
}

export type PartsCatalog = Record<string, PartsCatalogEntry>

// ── Status display metadata (mirrors STATUS_META in legacy) ──

export interface StatusMeta {
  label:  string
  color:  string
  bg:     string
  icon:   string
}

export const VEHICLE_STATUS_META: Record<VehicleStatus, StatusMeta> = {
  operational:    { label: 'Operacional',       color: '#16a34a', bg: '#dcfce7', icon: '🟢' },
  attention:      { label: 'Atenção',           color: '#d97706', bg: '#fef3c7', icon: '🟡' },
  preventive_due: { label: 'Preventiva Devida', color: '#0891b2', bg: '#e0f2fe', icon: '🔵' },
  in_maintenance: { label: 'Em Manutenção',     color: '#7c3aed', bg: '#ede9fe', icon: '🔧' },
  stopped:        { label: 'Parado',            color: '#64748b', bg: '#f1f5f9', icon: '⛔' },
  critical:       { label: 'Crítico',           color: '#dc2626', bg: '#fee2e2', icon: '🔴' },
}

export const TREND_META: Record<TrendType, { label: string; icon: string; color: string }> = {
  improving:         { label: 'Melhorando',      icon: '↓', color: '#16a34a' },
  worsening:         { label: 'Piorando',        icon: '↑', color: '#dc2626' },
  stable:            { label: 'Estável',         icon: '→', color: '#0891b2' },
  insufficient_data: { label: 'Dados insuf.',    icon: '—', color: '#94a3b8' },
}

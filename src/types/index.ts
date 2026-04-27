// ── Shared primitives ─────────────────────────────────

// Firestore Timestamp shape — avoids importing the heavy SDK type
export interface FirestoreTimestamp {
  toDate(): Date
  seconds: number
  nanoseconds: number
}

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'textarea'

export interface FieldSchema {
  key:       string
  label:     string
  type:      FieldType
  options?:  string[]
  required?: boolean
}

export type MaintenanceType = 'preventiva' | 'corretiva' | 'inspecao'

export interface MaintenanceConfig {
  preventiveFrequencyDays: number | null
  defaultType:             MaintenanceType
  requiresTechnician:      boolean
  notes:                   string | null
}

// ── Category ──────────────────────────────────────────

export interface Category {
  id:                string
  name:              string
  prefix:            string
  icon:              string
  color:             string
  fields:            FieldSchema[]
  maintenanceTypes:  MaintenanceType[]
  maintenanceConfig: MaintenanceConfig
  assetCount:        number
  createdAt?:        Date
  updatedAt?:        Date
}

// ── Asset ─────────────────────────────────────────────

export type AssetStatus = 'ativo' | 'manutencao' | 'avariado' | 'inativo'

export interface Asset {
  id:              string
  code:            string
  codePrefix:      string
  name:            string
  categoryId:      string
  location:        string
  locationDetail?: string | null
  status:          AssetStatus
  responsible?:    string | null
  acquisition?:    string | null   // ISO date string
  value?:          number | null
  notes?:          string | null
  dynamicData:     Record<string, string | number>   // category-specific fields
  createdBy?:      string
  updatedBy?:      string
  createdAt?:      Date
  updatedAt?:      Date
}

// ── Maintenance Record ────────────────────────────────

export type MaintenanceStatus = 'pendente' | 'andamento' | 'concluida'
export type ServiceType = 'internal' | 'external'

export interface MaintenanceRecord {
  id:              string
  assetId:         string
  categoryId?:     string
  type:            MaintenanceType
  status:          MaintenanceStatus
  description:     string
  technician?:     string
  serviceType?:    ServiceType
  scheduledDate?:  Date
  completedDate?:  Date
  cost?:           number
  notes?:          string
  serviceOrderId?: string
  purchaseOrderId?: string
  createdAt?:      FirestoreTimestamp | Date
  updatedAt?:      FirestoreTimestamp | Date
}

// ── Supplier ──────────────────────────────────────────

export type SupplierType = 'purchase' | 'service' | 'both'

export interface Supplier {
  id:           string
  name:         string
  categoryIds:  string[]
  type:         SupplierType
  contact?:     string
  email?:       string
  phone?:       string
  cnpj?:        string
  notes?:       string
  active:       boolean
  createdAt?:   Date
  updatedAt?:   Date
}

// ── Service Order ─────────────────────────────────────

export type ServiceOrderStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'
export type Priority = 'low' | 'normal' | 'high' | 'critical'

export interface ServiceOrder {
  id:              string
  orderNumber?:    string
  assetId?:        string
  maintenanceId?:  string
  title:           string
  description:     string
  technician?:     string
  serviceType:     ServiceType
  status:          ServiceOrderStatus
  priority?:       Priority
  supplierId?:     string
  requestedBy?:    string
  cost?:           number
  notes?:          string
  scheduledDate?:  Date
  completedDate?:  Date
  createdAt?:      Date
  updatedAt?:      Date
}

// ── Purchase Order ────────────────────────────────────

export type PurchaseOrderStatus = 'draft' | 'pending' | 'approved' | 'ordered' | 'received' | 'cancelled'

export interface PurchaseOrderItem {
  description: string
  quantity:    number
  unit:        string
  unitPrice?:  number
}

export interface PurchaseOrder {
  id:             string
  orderNumber?:   string
  assetId?:       string
  maintenanceId?: string
  supplierId?:    string
  title:          string
  description?:   string
  items:          PurchaseOrderItem[]
  status:         PurchaseOrderStatus
  requestedBy?:   string
  approvedBy?:    string
  totalValue?:    number
  notes?:         string
  createdAt?:     Date
  updatedAt?:     Date
}

// ── Auth ──────────────────────────────────────────────

export type UserRole = 'admin' | 'supervisor' | 'operador' | 'visualizador'

export interface UserProfile {
  uid:        string
  nome:       string
  email:      string
  role:       UserRole
  accessCode?: string
  active?:    boolean
  cargo?:     string
}

// ── UI metadata maps ──────────────────────────────────

export const ASSET_STATUS_META: Record<AssetStatus, { label: string; icon: string; cls: string }> = {
  ativo:      { label: 'Ativo',         icon: '🟢', cls: 'status-ativo'      },
  manutencao: { label: 'Em Manutenção', icon: '🔧', cls: 'status-manutencao' },
  avariado:   { label: 'Avariado',      icon: '🔴', cls: 'status-avariado'   },
  inativo:    { label: 'Inativo',       icon: '⚫', cls: 'status-inativo'    },
}

export const MAINT_TYPE_META: Record<MaintenanceType, { label: string; icon: string; cls: string }> = {
  preventiva: { label: 'Preventiva', icon: '🔵', cls: 'type-preventiva' },
  corretiva:  { label: 'Corretiva',  icon: '🔴', cls: 'type-corretiva'  },
  inspecao:   { label: 'Inspeção',   icon: '🟢', cls: 'type-inspecao'   },
}

export const MAINT_STATUS_META: Record<MaintenanceStatus, { label: string; icon: string }> = {
  pendente:  { label: 'Pendente',     icon: '⏳' },
  andamento: { label: 'Em Andamento', icon: '🔄' },
  concluida: { label: 'Concluída',    icon: '✅' },
}

export const SUPPLIER_TYPE_META: Record<SupplierType, { label: string; icon: string; cls: string }> = {
  purchase: { label: 'Compras',         icon: '🛒', cls: 'type-compra'  },
  service:  { label: 'Serviços',        icon: '🔧', cls: 'type-servico' },
  both:     { label: 'Compras + Serv.', icon: '🏢', cls: 'type-ambos'  },
}

// ── Maintenance extensions ────────────────────────────

export interface ReplacedPart {
  name:     string
  quantity: number
  cost:     number
}

export interface MachineryMaintenance extends MaintenanceRecord {
  failureType:      string
  downtime:         number
  replacedParts:    ReplacedPart[]
  rootCause?:       string
  requiresPurchase: boolean
}

export interface ITMaintenance extends MaintenanceRecord {
  deviceType:     'computer' | 'printer' | 'network' | 'other'
  issueType:      string
  replacedParts?: string[]
  assignedUser?:  string
}

export function isMachineryMaintenance(r: MaintenanceRecord): r is MachineryMaintenance {
  return 'failureType' in r && (r as MachineryMaintenance).failureType != null
}

export function isITMaintenance(r: MaintenanceRecord): r is ITMaintenance {
  return 'deviceType' in r && (r as ITMaintenance).deviceType != null
}

// ── Maintenance engine resolver ───────────────────────

export type MaintenanceEngine = 'legacy_machinery' | 'it' | 'standard'

const MACHINERY_PREFIXES = new Set(['MAQ', 'CLIM'])
const IT_PREFIXES        = new Set(['TI', 'COM'])

export function resolveEngine(category: Pick<Category, 'prefix'>): MaintenanceEngine {
  if (MACHINERY_PREFIXES.has(category.prefix)) return 'legacy_machinery'
  if (IT_PREFIXES.has(category.prefix))        return 'it'
  return 'standard'
}

// ── Order document system ─────────────────────────────

export interface ServiceDocumentContent {
  orderNumber:    string
  title:          string
  description:    string
  technician?:    string
  serviceType:    ServiceType
  priority?:      Priority
  status:         ServiceOrderStatus
  cost?:          number
  scheduledDate?: string
  completedDate?: string
  assetId?:       string
  maintenanceId?: string
  requestedBy?:   string
  notes?:         string
}

export interface PurchaseDocumentContent {
  orderNumber:  string
  title:        string
  description?: string
  items:        PurchaseOrderItem[]
  totalValue?:  number
  supplierId?:  string
  status:       PurchaseOrderStatus
  requestedBy?: string
  approvedBy?:  string
  assetId?:     string
  notes?:       string
}

export interface OrderDocument {
  id:             string
  orderId:        string
  orderType:      'service' | 'purchase'
  documentNumber: string
  orderNumber:    string
  generatedBy?:   string
  content:        ServiceDocumentContent | PurchaseDocumentContent
  createdAt?:     Date
}

// ── Meta maps ─────────────────────────────────────────

export const SERVICE_ORDER_STATUS_META: Record<ServiceOrderStatus, { label: string; color: string }> = {
  open:        { label: 'Aberta',       color: '#3b82f6' },
  in_progress: { label: 'Em Andamento', color: '#f59e0b' },
  completed:   { label: 'Concluída',    color: '#22c55e' },
  cancelled:   { label: 'Cancelada',    color: '#94a3b8' },
}

export const PURCHASE_ORDER_STATUS_META: Record<PurchaseOrderStatus, { label: string; color: string }> = {
  draft:      { label: 'Rascunho',   color: '#94a3b8' },
  pending:    { label: 'Pendente',   color: '#3b82f6' },
  approved:   { label: 'Aprovado',   color: '#22c55e' },
  ordered:    { label: 'Solicitado', color: '#f59e0b' },
  received:   { label: 'Recebido',   color: '#10b981' },
  cancelled:  { label: 'Cancelado',  color: '#ef4444' },
}

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  low:      { label: 'Baixa',   color: '#22c55e' },
  normal:   { label: 'Normal',  color: '#3b82f6' },
  high:     { label: 'Alta',    color: '#f59e0b' },
  critical: { label: 'Crítica', color: '#ef4444' },
}

export const SERVICE_TYPE_META: Record<ServiceType, { label: string }> = {
  internal: { label: 'Interno' },
  external: { label: 'Externo' },
}

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

export type MaintenanceType = 'preventiva' | 'corretiva' | 'inspecao' | 'software' | 'hardware'

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
  id:               string
  code:             string
  codePrefix:       string
  name:             string
  categoryId:       string
  location:         string
  locationDetail?:  string | null
  status:           AssetStatus
  lifecycleStatus?: import('@/types/eam').AssetLifecycleStatus
  responsible?:     string | null
  acquisition?:     string | null   // ISO date string
  value?:           number | null
  serialNumber?:    string | null
  manufacturer?:    string | null
  model?:           string | null
  warrantyExpiry?:  string | null   // ISO date string
  notes?:           string | null
  dynamicData:      Record<string, string | number>
  createdBy?:       string
  updatedBy?:       string
  createdAt?:       Date
  updatedAt?:       Date
}

// ── Maintenance additional data ───────────────────────

export interface ReplacedPart {
  name:     string
  quantity: number
  cost:     number
}

export interface MachineryAdditionalData {
  hoursUsed?:           number
  mileage?:             number
  nextMaintenanceDate?: string
  failureType?:         string
  downtime?:            number
  rootCause?:           string
  requiresPurchase?:    boolean
  replacedParts?:       ReplacedPart[]
}

export interface ITAdditionalData {
  ticketId?:           string
  deviceType?:         'computer' | 'printer' | 'network' | 'other'
  issueType?:          string
  assignedTechnician?: string
  affectedUser?:       string
  softwareUpdated?:    string[]
  replacedParts?:      string[]
}

export interface CLIMAdditionalData {
  refrigerantType?: string
  filterState?:     'clean' | 'dirty' | 'replaced'
  drainState?:      string
  evaporatorState?: string
  condenserState?:  string
  currentPressure?: number
  lastGasRefill?:   string
  cleaningDone?:    boolean
  gasRefillDone?:   boolean
  gasRefillQty?:    number
  failureType?:     string
  requiresPurchase?: boolean
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
  images?:         string[]
  engineCategory?: 'machinery' | 'it' | 'clim' | 'default'
  additionalData?: MachineryAdditionalData | ITAdditionalData | CLIMAdditionalData
  trigger?:        import('@/types/eam').MaintenanceTrigger
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

export type ServiceOrderStatus =
  | 'draft'
  | 'open'
  | 'awaiting_approval'
  | 'in_progress'
  | 'awaiting_parts'
  | 'on_hold'
  | 'completed'
  | 'cancelled'

export type Priority = 'low' | 'normal' | 'high' | 'critical' | 'bloqueante'

export interface ServiceOrder {
  id:               string
  orderNumber?:     string
  assetId?:         string
  maintenanceId?:   string
  title:            string
  description:      string
  technician?:      string
  serviceType:      ServiceType
  status:           ServiceOrderStatus
  priority?:        Priority
  supplierId?:      string
  requestedBy?:     string
  sector?:          string
  serviceCategory?: string
  cost?:            number
  estimatedCost?:   number
  quoteImages?:     string[]
  notes?:           string
  scheduledDate?:   Date
  completedDate?:   Date
  slaHours?:        number
  slaDueAt?:        Date
  slaStatus?:       'ok' | 'warning' | 'breached'
  createdAt?:       Date
  updatedAt?:       Date
}

// ── Purchase Order ────────────────────────────────────

export type PurchaseOrderStatus =
  | 'draft'
  | 'pending'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'ordered'
  | 'partial_delivery'
  | 'received'
  | 'returned'
  | 'cancelled'

export interface PurchaseOrderItem {
  description: string
  quantity:    number
  unit:        string
  unitPrice?:  number
}

export interface PurchaseOrder {
  id:                string
  orderNumber?:      string
  assetId?:          string
  maintenanceId?:    string
  supplierId?:       string
  title:             string
  description?:      string
  items:             PurchaseOrderItem[]
  status:            PurchaseOrderStatus
  priority?:         Priority
  requestedBy?:      string
  approvedBy?:       string
  rejectedBy?:       string
  rejectedReason?:   string
  sector?:           string
  purchaseCategory?: string
  deliveryDate?:     Date
  totalValue?:       number
  quoteImages?:      string[]
  notes?:            string
  createdAt?:        Date
  updatedAt?:        Date
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
  software:   { label: 'Software',   icon: '💻', cls: 'type-software'   },
  hardware:   { label: 'Hardware',   icon: '🖥️', cls: 'type-hardware'   },
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

// ── Maintenance extensions (legacy flat shapes — kept for backward compat) ────

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

export type MaintenanceEngine = 'machinery' | 'it' | 'clim' | 'standard'

const CLIM_ENGINE_PREFIXES     = new Set(['CLIM'])
const MACHINERY_ENGINE_PREFIXES = new Set(['MAQ', 'COZ'])
const IT_ENGINE_PREFIXES        = new Set(['TI', 'COM'])

export function resolveEngine(category: Pick<Category, 'prefix'>): MaintenanceEngine {
  if (CLIM_ENGINE_PREFIXES.has(category.prefix))     return 'clim'
  if (MACHINERY_ENGINE_PREFIXES.has(category.prefix)) return 'machinery'
  if (IT_ENGINE_PREFIXES.has(category.prefix))        return 'it'
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
  orderNumber:       string
  title:             string
  description?:      string
  items:             PurchaseOrderItem[]
  totalValue?:       number
  supplierId?:       string
  status:            PurchaseOrderStatus
  priority?:         Priority
  requestedBy?:      string
  approvedBy?:       string
  sector?:           string
  purchaseCategory?: string
  deliveryDate?:     string
  assetId?:          string
  notes?:            string
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
  draft:              { label: 'Rascunho',         color: '#94a3b8' },
  open:               { label: 'Aberta',           color: '#3b82f6' },
  awaiting_approval:  { label: 'Aguard. Aprovação', color: '#8b5cf6' },
  in_progress:        { label: 'Em Andamento',     color: '#f59e0b' },
  awaiting_parts:     { label: 'Aguard. Peças',    color: '#f97316' },
  on_hold:            { label: 'Pausada',          color: '#6b7280' },
  completed:          { label: 'Concluída',        color: '#22c55e' },
  cancelled:          { label: 'Cancelada',        color: '#ef4444' },
}

export const PURCHASE_ORDER_STATUS_META: Record<PurchaseOrderStatus, { label: string; color: string }> = {
  draft:              { label: 'Rascunho',       color: '#94a3b8' },
  pending:            { label: 'Pendente',       color: '#3b82f6' },
  awaiting_approval:  { label: 'Aguard. Aprov.', color: '#8b5cf6' },
  approved:           { label: 'Aprovado',       color: '#22c55e' },
  rejected:           { label: 'Rejeitado',      color: '#dc2626' },
  ordered:            { label: 'Pedido Emitido', color: '#f59e0b' },
  partial_delivery:   { label: 'Entr. Parcial',  color: '#f97316' },
  received:           { label: 'Recebido',       color: '#10b981' },
  returned:           { label: 'Devolvido',      color: '#ef4444' },
  cancelled:          { label: 'Cancelado',      color: '#6b7280' },
}

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  low:        { label: 'Baixa',      color: '#22c55e' },
  normal:     { label: 'Normal',     color: '#3b82f6' },
  high:       { label: 'Alta',       color: '#f59e0b' },
  critical:   { label: 'Crítica',    color: '#ef4444' },
  bloqueante: { label: 'Bloqueante', color: '#7c3aed' },
}

export const SERVICE_TYPE_META: Record<ServiceType, { label: string }> = {
  internal: { label: 'Interno' },
  external: { label: 'Externo' },
}

/**
 * siga.types.ts — SIGA Platform TypeScript Type Definitions
 *
 * Architecture reference for future React + TypeScript migration.
 * These types mirror the Firestore data model exactly.
 *
 * Collections:
 *   asset_categories   → Category
 *   assets             → Asset
 *   asset_maintenance  → MaintenanceRecord
 *   inventory_sessions → InventorySession
 *   asset_suppliers    → Supplier
 *   work_orders        → ServiceOrder
 *   purchase_orders    → PurchaseOrder
 */

// ── Field schema (used in Category.fields) ────────────
export type FieldType = "text" | "number" | "date" | "select" | "textarea";

export interface FieldSchema {
  key:      string;
  label:    string;
  type:     FieldType;
  options?: string[];   // for type === 'select'
  required?: boolean;
}

export type MaintenanceType = "preventiva" | "corretiva" | "inspecao";

export interface MaintenanceConfig {
  preventiveFrequencyDays: number | null;
  defaultType:             MaintenanceType;
  requiresTechnician:      boolean;
  notes:                   string | null;
}

// ── Category ──────────────────────────────────────────
export interface Category {
  id:                string;
  name:              string;
  prefix:            string;   // e.g. "MAQ" → MAQ-0001
  icon:              string;   // emoji
  color:             string;   // hex
  fields:            FieldSchema[];
  maintenanceTypes:  MaintenanceType[];
  maintenanceConfig: MaintenanceConfig;
  assetCount:        number;
  createdAt?:        Date;
  updatedAt?:        Date;
}

// ── Asset ─────────────────────────────────────────────
export type AssetStatus = "ativo" | "manutencao" | "avariado" | "inativo";

export interface Asset {
  id:           string;
  code:         string;        // e.g. "MAQ-0001"
  codePrefix:   string;        // e.g. "MAQ"
  name:         string;
  categoryId:   string;
  location:     string;
  status:       AssetStatus;
  responsible?: string;
  data:         Record<string, string | number>;  // dynamic fields per category
  createdAt?:   Date;
  updatedAt?:   Date;
}

// ── Maintenance Record ────────────────────────────────
export type MaintenanceStatus = "pendente" | "andamento" | "concluida";

export interface MaintenanceRecord {
  id:            string;
  assetId:       string;
  type:          MaintenanceType;
  status:        MaintenanceStatus;
  description:   string;
  technician?:   string;
  serviceType?:  "internal" | "external";
  scheduledDate?: Date;
  completedDate?: Date;
  cost?:         number;
  notes?:        string;
  serviceOrderId?:  string;    // linked OS
  purchaseOrderId?: string;    // linked compra
  createdAt?:    Date;
  updatedAt?:    Date;
}

// ── Inventory Session ─────────────────────────────────
export type InventoryStatus = "em_andamento" | "concluida";
export type ItemAuditStatus = "found" | "missing" | "issue";

export interface InventorySession {
  id:          string;
  name:        string;
  status:      InventoryStatus;
  results:     Record<string, { status: ItemAuditStatus; note: string; markedAt: string }>;
  summary?:    { found: number; missing: number; issues: number };
  createdAt?:  Date;
  closedAt?:   Date;
}

// ── Supplier ──────────────────────────────────────────
export type SupplierType = "purchase" | "service" | "both";

export interface Supplier {
  id:            string;
  name:          string;
  categoryIds:   string[];      // which asset categories they serve
  type:          SupplierType;
  contact?:      string;
  email?:        string;
  phone?:        string;
  cnpj?:         string;
  notes?:        string;
  active:        boolean;
  createdAt?:    Date;
  updatedAt?:    Date;
}

// ── Service Order (O.S. Serviço) ──────────────────────
export type ServiceOrderStatus = "open" | "in_progress" | "completed" | "cancelled";

export interface ServiceOrder {
  id:           string;
  assetId?:     string;         // linked asset (optional)
  maintenanceId?: string;       // originated from maintenance record
  title:        string;
  description:  string;
  technician?:  string;
  serviceType:  "internal" | "external";
  status:       ServiceOrderStatus;
  priority?:    "low" | "normal" | "high" | "critical";
  supplierId?:  string;         // if external, linked supplier
  cost?:        number;
  scheduledDate?: Date;
  completedDate?: Date;
  createdAt?:   Date;
  updatedAt?:   Date;
}

// ── Purchase Order ────────────────────────────────────
export type PurchaseOrderStatus = "draft" | "pending" | "approved" | "ordered" | "received" | "cancelled";

export interface PurchaseOrderItem {
  description: string;
  quantity:    number;
  unit:        string;
  unitPrice?:  number;
}

export interface PurchaseOrder {
  id:            string;
  assetId?:      string;         // linked asset
  maintenanceId?: string;        // originated from maintenance
  supplierId?:   string;
  title:         string;
  items:         PurchaseOrderItem[];
  status:        PurchaseOrderStatus;
  requestedBy?:  string;
  approvedBy?:   string;
  totalValue?:   number;
  notes?:        string;
  createdAt?:    Date;
  updatedAt?:    Date;
}

// ── Zustand Store Shape ───────────────────────────────
export interface SIGAStore {
  // Data
  categories:     Category[];
  assets:         Asset[];
  suppliers:      Supplier[];
  maintenance:    MaintenanceRecord[];
  serviceOrders:  ServiceOrder[];
  purchaseOrders: PurchaseOrder[];

  // UI state
  activeCategoryId: string | null;
  loadingState:     Record<string, boolean>;

  // Actions
  setCategories:    (cats: Category[]) => void;
  setAssets:        (assets: Asset[]) => void;
  setActiveCat:     (id: string | null) => void;
  addServiceOrder:  (fromMaintenance: MaintenanceRecord) => void;
  addPurchaseOrder: (fromMaintenance: MaintenanceRecord) => void;
}

// ── Category-based maintenance logic ──────────────────
/**
 * Rule: Machinery uses the legacy maintenance engine with complex scheduling.
 * All other categories use the standard maintenance engine.
 *
 * if (category.prefix === "MAQ") {
 *   useLegacyMaintenanceLogic(asset);
 * } else {
 *   useStandardMaintenanceEngine(asset, category);
 * }
 */
export type MaintenanceEngine = "legacy_machinery" | "standard";

export function resolveMaintenanceEngine(category: Category): MaintenanceEngine {
  return category.prefix === "MAQ" ? "legacy_machinery" : "standard";
}

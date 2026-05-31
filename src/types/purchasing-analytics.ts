// src/types/purchasing-analytics.ts
// Type definitions for the Purchasing & Suppliers Analytics module.

export type PurchasingPeriod = '30d' | '90d' | '6m' | '1a'

export type SupplierRiskLevel = 'low' | 'medium' | 'high' | 'critical'

// ── Time-series ───────────────────────────────────────────────

export interface MonthlySpend {
  monthKey:  string   // 'YYYY-MM'
  label:     string   // 'Jan/25'
  value:     number   // total R$
  count:     number   // orders
}

// ── Category / type breakdown ─────────────────────────────────

export interface TypeSpend {
  type:    string   // 'purchase' | 'service' | 'both' | 'unknown'
  label:   string
  value:   number
  count:   number
  color:   string
}

// ── Order status distribution ─────────────────────────────────

export interface StatusCount {
  status: string
  label:  string
  count:  number
  value:  number
  color:  string
}

// ── Frequently purchased items ────────────────────────────────

export interface TopItem {
  description: string
  count:       number
  totalValue:  number
  suppliers:   string[]   // supplier names that provide this item
}

// ── Per-supplier aggregated metrics ──────────────────────────

export interface SupplierMetrics {
  supplierId:    string
  supplierName:  string
  supplierType:  'purchase' | 'service' | 'both' | 'unknown'
  active:        boolean
  cnpj?:         string
  contact?:      string

  // Order counts
  totalOrders:     number
  approvedOrders:  number
  receivedOrders:  number
  cancelledOrders: number
  pendingOrders:   number
  draftOrders:     number

  // Spend
  totalSpend:         number
  avgOrderValue:      number
  maxOrderValue:      number
  shareOfTotalSpend:  number   // 0–100 percent
  cancelRate:         number   // 0–1

  // Timing
  lastOrderDate:       Date | null
  daysSinceLastOrder:  number | null
  firstOrderDate:      Date | null

  // Trend
  monthlySpend: MonthlySpend[]

  // Items
  topItems: TopItem[]

  // Linked assets
  linkedAssets: string[]   // assetIds from orders

  // Risk
  riskScore: number
  riskLevel: SupplierRiskLevel
}

// ── Alerts ────────────────────────────────────────────────────

export type PurchasingAlertType =
  | 'high_concentration'   // one supplier > 40% of spend
  | 'high_cancellation'    // supplier > 50% cancel rate
  | 'spend_spike'          // month-over-month spike > 150%
  | 'dormant_supplier'     // active supplier, no orders > 90 days
  | 'pending_high_value'   // order pending approval with high value

export interface PurchasingAlert {
  type:        PurchasingAlertType
  supplierId?: string
  supplierName?: string
  message:     string
  severity:    'warning' | 'critical'
  value?:      number
}

// ── Main analytics result ─────────────────────────────────────

export interface PurchasingAnalyticsData {
  period:     PurchasingPeriod
  computedAt: Date

  // Global KPIs
  totalSpend:       number
  totalOrders:      number
  activeSuppliers:  number
  avgOrderValue:    number
  approvalRate:     number    // % approved+received out of non-draft
  totalCancelled:   number

  // Suppliers ranked by total spend desc
  suppliers: SupplierMetrics[]

  // Global trends
  monthlyTrend: MonthlySpend[]

  // Type breakdown
  typeBreakdown: TypeSpend[]

  // Status distribution
  statusDistribution: StatusCount[]

  // Top items across all orders
  topItems: TopItem[]

  // Active alerts
  alerts: PurchasingAlert[]
}

// ── UI helpers ────────────────────────────────────────────────

export const RISK_COLORS: Record<SupplierRiskLevel, string> = {
  low:      '#16a34a',
  medium:   '#f59e0b',
  high:     '#ea580c',
  critical: '#dc2626',
}

export const RISK_LABELS: Record<SupplierRiskLevel, string> = {
  low: 'Baixo', medium: 'Médio', high: 'Alto', critical: 'Crítico',
}

export const SUPPLIER_TYPE_META: Record<string, { label: string; color: string }> = {
  purchase: { label: 'Compras',         color: '#2563eb' },
  service:  { label: 'Serviços',        color: '#7c3aed' },
  both:     { label: 'Compras+Serv.',   color: '#0891b2' },
  unknown:  { label: 'Não vinculado',   color: '#94a3b8' },
}

export const STATUS_META_PURCHASE: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Rascunho',   color: '#94a3b8' },
  pending:   { label: 'Pendente',   color: '#3b82f6' },
  approved:  { label: 'Aprovado',   color: '#16a34a' },
  ordered:   { label: 'Pedido',     color: '#f59e0b' },
  received:  { label: 'Recebido',   color: '#10b981' },
  cancelled: { label: 'Cancelado',  color: '#dc2626' },
}

// src/types/approvals.ts
// Type definitions for the Approval Center module.

import type { ServiceOrder, PurchaseOrder, Priority } from './index'

// ── Unified pending item ──────────────────────────────────────

export type ApprovalOrderType = 'service' | 'purchase'

export type ApprovalItemStatus =
  | 'pending_approval'     // Service: open | Purchase: pending
  | 'revision_requested'   // Has revisionNote but still in queue
  | 'approved'
  | 'rejected'

export interface ApprovalItem {
  id:           string
  orderType:    ApprovalOrderType
  orderNumber:  string
  title:        string
  description:  string
  requestedBy:  string
  priority?:    Priority               // service orders only
  cost?:        number                 // service orders
  totalValue?:  number                 // purchase orders
  assetId?:     string
  supplierId?:  string
  status:       ApprovalItemStatus
  createdAt?:   Date
  updatedAt?:   Date
  revisionNote?:      string
  revisionRequestedBy?: string
  rejectionReason?:   string
  rejectedBy?:        string
  approvedBy?:        string
  // Enriched display fields
  assetName?:    string
  supplierName?: string
  // Raw order reference (for document generation)
  _rawService?:  ServiceOrder
  _rawPurchase?: PurchaseOrder
}

// ── PRIORITY sort weight (higher = more urgent) ───────────────

export const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high:     3,
  normal:   2,
  low:      1,
}

// ── Action types ──────────────────────────────────────────────

export type ApprovalAction = 'approve' | 'reject' | 'revision'

export interface ActionState {
  action:   ApprovalAction
  item:     ApprovalItem
}

// ── Approval Center KPIs ──────────────────────────────────────

export interface ApprovalKpis {
  totalPending:   number
  criticalCount:  number
  serviceCount:   number
  purchaseCount:  number
  totalValue:     number    // sum of pending purchase values
  revisionCount:  number    // items with revision requested
}

// ── Filter / Sort state ───────────────────────────────────────

export type ApprovalTypeFilter  = 'all' | 'service' | 'purchase'
export type ApprovalSortKey     = 'priority' | 'age' | 'cost' | 'title'

export interface ApprovalFilters {
  type:     ApprovalTypeFilter
  priority: Priority | 'all'
  sort:     ApprovalSortKey
  search:   string
}

export const DEFAULT_FILTERS: ApprovalFilters = {
  type:     'all',
  priority: 'all',
  sort:     'priority',
  search:   '',
}

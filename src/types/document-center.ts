// src/types/document-center.ts
// Type definitions for the Document Center module.

import type { OrderDocument } from './index'

// ── Document categories ───────────────────────────────────────

export type DocCategory =
  | 'service_order'    // order_documents where orderType='service'
  | 'purchase_order'   // order_documents where orderType='purchase'
  | 'legacy_document'  // 'documents' collection (legacy HTML module)
  | 'legacy_purchase'  // 'purchase_document' collection
  | 'service_report'   // 'service_report' collection

export type DocSource =
  | 'order_documents'
  | 'documents'
  | 'purchase_document'
  | 'service_report'

// ── Unified document ──────────────────────────────────────────

export interface UnifiedDocument {
  id:             string
  source:         DocSource
  category:       DocCategory
  documentNumber: string
  title:          string
  orderId:        string
  orderNumber:    string
  orderType:      string
  status:         string
  generatedBy:    string
  requestedBy:    string
  approvedBy:     string
  supplierId:     string
  assetId:        string
  totalValue?:    number
  createdAt:      Date | null
  rawOrderDoc?:   OrderDocument
  rawData?:       Record<string, unknown>
  missingNumber:  boolean
  missingOrder:   boolean
}

// ── Filter & search state ─────────────────────────────────────

export type DocCategoryFilter = DocCategory | 'all'
export type DocDateFilter     = 'all' | 'month' | '3months'

export interface DocFilters {
  category:   DocCategoryFilter
  dateRange:  DocDateFilter
  search:     string
}

export const DEFAULT_DOC_FILTERS: DocFilters = {
  category:  'all',
  dateRange: 'all',
  search:    '',
}

// ── Stats ─────────────────────────────────────────────────────

export interface DocStats {
  total:          number
  serviceOrders:  number
  purchaseOrders: number
  legacy:         number
  thisMonth:      number
  integrity:      number
}

// ── Pagination cursor ─────────────────────────────────────────

export interface FetchPage {
  docs:    UnifiedDocument[]
  hasMore: boolean
  cursor:  unknown | null   // Firestore DocumentSnapshot cursor
}

// ── Combined load result ──────────────────────────────────────

export interface AllDocsResult {
  docs:    UnifiedDocument[]
  hasMore: boolean   // whether more primary (order_documents) pages exist
  cursor:  unknown | null
}

// ── Display meta ──────────────────────────────────────────────

export const CATEGORY_META: Record<DocCategory, { label: string; icon: string; color: string }> = {
  service_order:   { label: 'OS de Serviço',  icon: '🔧', color: '#2563eb' },
  purchase_order:  { label: 'OS de Compra',   icon: '🛒', color: '#166534' },
  legacy_document: { label: 'Legado',         icon: '📁', color: '#7c3aed' },
  legacy_purchase: { label: 'Compra Legado',  icon: '🗂️', color: '#7c3aed' },
  service_report:  { label: 'Relatório',      icon: '📋', color: '#ea580c' },
}

export const SOURCE_META: Record<DocSource, { label: string; icon: string }> = {
  order_documents:   { label: 'Ordens de Serviço',   icon: '📋' },
  documents:         { label: 'Documentos Legados',  icon: '📁' },
  purchase_document: { label: 'Pedidos de Compra',   icon: '🛒' },
  service_report:    { label: 'Relatórios de Serviço', icon: '📝' },
}

export const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  approved:           { label: 'Aprovado',        color: '#166534', bg: '#f0fdf4' },
  approved_generated: { label: 'Aprovado',        color: '#166534', bg: '#f0fdf4' },
  completed:          { label: 'Concluído',        color: '#166534', bg: '#f0fdf4' },
  in_progress:        { label: 'Em Andamento',     color: '#1d4ed8', bg: '#eff6ff' },
  pending_approval:   { label: 'Pend. Aprovação',  color: '#92400e', bg: '#fffbeb' },
  pending:            { label: 'Pendente',         color: '#92400e', bg: '#fffbeb' },
  revision_requested: { label: 'Em Revisão',       color: '#7c2d12', bg: '#fff7ed' },
  rejected:           { label: 'Rejeitado',        color: '#991b1b', bg: '#fef2f2' },
  cancelled:          { label: 'Cancelado',        color: '#991b1b', bg: '#fef2f2' },
  draft:              { label: 'Rascunho',         color: '#475569', bg: '#f8fafc' },
  legacy:             { label: 'Legado',           color: '#6d28d9', bg: '#f5f3ff' },
}

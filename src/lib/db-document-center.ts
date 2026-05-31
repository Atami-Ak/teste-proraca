// src/lib/db-document-center.ts
//
// Data layer for the Document Center module.
// Sources: order_documents (primary), documents (legacy), purchase_document (legacy), service_report (legacy)
// Uses cursor-based pagination + client-side search.

import {
  collection, getDocs, query, orderBy, limit,
  startAfter, type DocumentSnapshot, type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from './firebase'
import type { OrderDocument, ServiceDocumentContent, PurchaseDocumentContent } from '@/types'
import type {
  UnifiedDocument, DocCategory, DocFilters, DocStats, FetchPage, AllDocsResult,
} from '@/types/document-center'

// ── Helpers ───────────────────────────────────────────────────

type DocData = Record<string, unknown>

function tsToDate(ts: unknown): Date | null {
  if (!ts) return null
  if (ts instanceof Date) return ts
  const t = ts as { toDate?: () => Date; seconds?: number }
  if (typeof t.toDate === 'function') return t.toDate()
  if (typeof t.seconds === 'number')  return new Date(t.seconds * 1000)
  if (typeof ts === 'string') { const d = new Date(ts); return isNaN(d.getTime()) ? null : d }
  return null
}

function strOf(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

// ── Normalise order_documents ─────────────────────────────────

function normaliseOrderDoc(snap: QueryDocumentSnapshot): UnifiedDocument {
  const data    = snap.data() as DocData
  const id      = snap.id
  const orderType = strOf(data.orderType, 'service')
  const category: DocCategory = orderType === 'purchase' ? 'purchase_order' : 'service_order'

  const content = (data.content ?? {}) as DocData

  // Pull requestedBy / approvedBy / status from nested content
  const requestedBy = strOf(content.requestedBy)
  const approvedBy  = strOf(content.approvedBy)
  const status      = strOf(content.status, strOf(data.status))
  const title       = strOf(content.title, strOf(data.title, 'Documento'))
  const supplierId  = strOf(content.supplierId)
  const assetId     = strOf(content.assetId)
  const totalValue  = typeof content.totalValue === 'number' ? content.totalValue : undefined

  const docNum = strOf(data.documentNumber)
  const orderId = strOf(data.orderId)
  const orderNum = strOf(data.orderNumber)

  // Build the raw OrderDocument for full rendering
  const rawOrderDoc: OrderDocument = {
    id, orderId, orderType: orderType as 'service' | 'purchase',
    documentNumber: docNum,
    orderNumber: orderNum,
    generatedBy: strOf(data.generatedBy),
    content: content as unknown as ServiceDocumentContent | PurchaseDocumentContent,
    createdAt: tsToDate(data.createdAt) ?? undefined,
  }

  return {
    id, source: 'order_documents', category,
    documentNumber: docNum || id.slice(0, 8).toUpperCase(),
    title,
    orderId, orderNumber: orderNum,
    orderType, status,
    generatedBy: strOf(data.generatedBy),
    requestedBy, approvedBy,
    supplierId, assetId, totalValue,
    createdAt: tsToDate(data.createdAt),
    rawOrderDoc,
    missingNumber: !docNum,
    missingOrder:  !orderId,
  }
}

// ── Normalise legacy 'documents' collection ───────────────────

function normaliseLegacyDoc(snap: QueryDocumentSnapshot): UnifiedDocument {
  const data = snap.data() as DocData
  const id   = snap.id
  return {
    id, source: 'documents', category: 'legacy_document',
    documentNumber: strOf(data.numero, strOf(data.documentNumber, id.slice(0, 8).toUpperCase())),
    title:          strOf(data.titulo, strOf(data.title, 'Documento Legado')),
    orderId:        strOf(data.sourceId),
    orderNumber:    strOf(data.sourceId, strOf(data.orderNumber)),
    orderType:      strOf(data.tipo, 'legacy'),
    status:         strOf(data.status),
    generatedBy:    strOf(data.geradoPor, strOf(data.generatedBy)),
    requestedBy:    strOf(data.solicitante, strOf(data.requestedBy)),
    approvedBy:     strOf(data.aprovadoPor, strOf(data.approvedBy)),
    supplierId:     strOf(data.supplierId, strOf(data.fornecedorId)),
    assetId:        strOf(data.assetId),
    createdAt:      tsToDate(data.emitidoEm ?? data.createdAt),
    rawData:        data,
    missingNumber:  !data.numero && !data.documentNumber,
    missingOrder:   !data.sourceId,
  }
}

// ── Normalise 'purchase_document' collection ──────────────────

function normalisePurchaseDoc(snap: QueryDocumentSnapshot): UnifiedDocument {
  const data = snap.data() as DocData
  const id   = snap.id
  return {
    id, source: 'purchase_document', category: 'legacy_purchase',
    documentNumber: strOf(data.numero, strOf(data.documentNumber, id.slice(0, 8).toUpperCase())),
    title:          strOf(data.titulo, strOf(data.title, 'Pedido de Compra')),
    orderId:        strOf(data.pedidoId, strOf(data.orderId)),
    orderNumber:    strOf(data.numeroPedido, strOf(data.orderNumber)),
    orderType:      'purchase',
    status:         strOf(data.status),
    generatedBy:    strOf(data.geradoPor, strOf(data.generatedBy)),
    requestedBy:    strOf(data.solicitante, strOf(data.requestedBy)),
    approvedBy:     strOf(data.aprovadoPor, strOf(data.approvedBy)),
    supplierId:     strOf(data.fornecedorId, strOf(data.supplierId)),
    assetId:        strOf(data.assetId),
    totalValue:     typeof data.total === 'number' ? data.total : undefined,
    createdAt:      tsToDate(data.emitidoEm ?? data.createdAt),
    rawData:        data,
    missingNumber:  !data.numero && !data.documentNumber,
    missingOrder:   !data.pedidoId && !data.orderId,
  }
}

// ── Normalise 'service_report' collection ─────────────────────

function normaliseServiceReport(snap: QueryDocumentSnapshot): UnifiedDocument {
  const data = snap.data() as DocData
  const id   = snap.id
  return {
    id, source: 'service_report', category: 'service_report',
    documentNumber: strOf(data.numero, strOf(data.documentNumber, `SR-${id.slice(0, 6).toUpperCase()}`)),
    title:          strOf(data.titulo, strOf(data.title, 'Relatório de Serviço')),
    orderId:        strOf(data.osId, strOf(data.orderId)),
    orderNumber:    strOf(data.numeroOS, strOf(data.orderNumber)),
    orderType:      'service',
    status:         strOf(data.status),
    generatedBy:    strOf(data.geradoPor, strOf(data.generatedBy)),
    requestedBy:    strOf(data.tecnico, strOf(data.requestedBy)),
    approvedBy:     strOf(data.aprovadoPor, strOf(data.approvedBy)),
    supplierId:     '',
    assetId:        strOf(data.equipamentoId, strOf(data.assetId)),
    createdAt:      tsToDate(data.timestampEnvio ?? data.createdAt),
    rawData:        data,
    missingNumber:  !data.numero && !data.documentNumber,
    missingOrder:   !data.osId && !data.orderId,
  }
}

// ── Fetch page ────────────────────────────────────────────────

const PAGE_SIZE = 40

export async function fetchDocumentPage(
  cursor: DocumentSnapshot | null = null,
): Promise<FetchPage> {

  const constraints = [
    orderBy('createdAt', 'desc'),
    limit(PAGE_SIZE + 1),
    ...(cursor ? [startAfter(cursor)] : []),
  ]

  const snap = await getDocs(
    query(collection(db, 'order_documents'), ...constraints)
  )

  const hasMore = snap.docs.length > PAGE_SIZE
  const slice   = snap.docs.slice(0, PAGE_SIZE)

  const docs: UnifiedDocument[] = slice.map(d => normaliseOrderDoc(d))
  const lastCursor = slice.length > 0 ? slice[slice.length - 1] : null

  return { docs, hasMore, cursor: lastCursor }
}

// ── Fetch legacy documents (one-shot, no pagination) ──────────

export async function fetchLegacyDocuments(): Promise<UnifiedDocument[]> {
  const results: UnifiedDocument[] = []

  const [legacySnap, purchaseDocSnap, reportSnap] = await Promise.allSettled([
    getDocs(query(collection(db, 'documents'),         orderBy('emitidoEm', 'desc'),   limit(50))),
    getDocs(query(collection(db, 'purchase_document'), orderBy('createdAt', 'desc'),   limit(50))),
    getDocs(query(collection(db, 'service_report'),    orderBy('timestampEnvio', 'desc'), limit(50))),
  ])

  if (legacySnap.status === 'fulfilled') {
    legacySnap.value.docs.forEach(d => results.push(normaliseLegacyDoc(d)))
  }
  if (purchaseDocSnap.status === 'fulfilled') {
    purchaseDocSnap.value.docs.forEach(d => results.push(normalisePurchaseDoc(d)))
  }
  if (reportSnap.status === 'fulfilled') {
    reportSnap.value.docs.forEach(d => results.push(normaliseServiceReport(d)))
  }

  return results
}

// ── Search (client-side on loaded docs) ──────────────────────

export function searchDocuments(
  docs:   UnifiedDocument[],
  search: string,
): UnifiedDocument[] {
  const q = search.trim().toLowerCase()
  if (!q) return docs
  return docs.filter(d =>
    d.documentNumber.toLowerCase().includes(q) ||
    d.orderNumber.toLowerCase().includes(q)    ||
    d.title.toLowerCase().includes(q)          ||
    d.requestedBy.toLowerCase().includes(q)    ||
    d.orderId.toLowerCase().includes(q)        ||
    d.generatedBy.toLowerCase().includes(q)    ||
    d.supplierId.toLowerCase().includes(q)     ||
    d.assetId.toLowerCase().includes(q)
  )
}

// ── Filter (client-side) ──────────────────────────────────────

export function filterDocuments(
  docs:    UnifiedDocument[],
  filters: DocFilters,
): UnifiedDocument[] {
  let result = docs

  if (filters.category !== 'all') {
    // 'legacy_document' tab matches both legacy_document and legacy_purchase
    if (filters.category === 'legacy_document') {
      result = result.filter(d => d.category === 'legacy_document' || d.category === 'legacy_purchase')
    } else {
      result = result.filter(d => d.category === filters.category)
    }
  }

  if (filters.dateRange !== 'all') {
    const ms     = filters.dateRange === 'month' ? 30 * 86_400_000 : 90 * 86_400_000
    const cutoff = Date.now() - ms
    result = result.filter(d => (d.createdAt?.getTime() ?? 0) >= cutoff)
  }

  if (filters.search.trim()) {
    result = searchDocuments(result, filters.search)
  }

  return result
}

// ── Stats (client-side) ───────────────────────────────────────

export function computeDocStats(docs: UnifiedDocument[]): DocStats {
  const now      = Date.now()
  const oneMonth = 30 * 86_400_000
  return {
    total:          docs.length,
    serviceOrders:  docs.filter(d => d.category === 'service_order').length,
    purchaseOrders: docs.filter(d => d.category === 'purchase_order').length,
    legacy:         docs.filter(d =>
      d.category === 'legacy_document' ||
      d.category === 'legacy_purchase'  ||
      d.category === 'service_report'
    ).length,
    thisMonth: docs.filter(d => (d.createdAt?.getTime() ?? 0) >= now - oneMonth).length,
    integrity: docs.filter(d => d.missingNumber || d.missingOrder).length,
  }
}

// ── localStorage cache ────────────────────────────────────────
// rawOrderDoc and rawData are stripped on serialisation (non-serialisable Firestore refs).
// The in-memory state retains them for the current session; fresh loads restore them.

const CACHE_KEY = 'siga_doc_center_v1'
const CACHE_TTL = 20 * 60 * 1000

type CachedDoc = Omit<UnifiedDocument, 'createdAt' | 'rawOrderDoc' | 'rawData'> & {
  createdAt: number | null
}

function serializeDoc(d: UnifiedDocument): CachedDoc {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rawOrderDoc: _r, rawData: _d, ...rest } = d
  return { ...rest, createdAt: d.createdAt?.getTime() ?? null }
}

function reviveDoc(d: CachedDoc): UnifiedDocument {
  return { ...d, createdAt: d.createdAt ? new Date(d.createdAt) : null }
}

export function clearDocumentCache(): void {
  try { localStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
}

// ── Combined load (primary page + legacy, with cache) ─────────

export async function fetchAllDocuments(force = false): Promise<AllDocsResult> {
  if (!force) {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { docs: CachedDoc[]; ts: number }
        if (Date.now() - parsed.ts < CACHE_TTL && Array.isArray(parsed.docs) && parsed.docs.length > 0) {
          return { docs: parsed.docs.map(reviveDoc), hasMore: false, cursor: null }
        }
      }
    } catch { /* stale or corrupt — fall through */ }
  }

  const [page, legacy] = await Promise.all([
    fetchDocumentPage(null),
    fetchLegacyDocuments(),
  ])

  const all: UnifiedDocument[] = [
    ...page.docs,
    ...legacy,
  ].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      docs: all.map(serializeDoc),
      ts: Date.now(),
    }))
  } catch { /* storage full or private mode — ignore */ }

  return { docs: all, hasMore: page.hasMore, cursor: page.cursor }
}

// ── Next-page wrapper (keeps Firestore types out of UI layer) ─

export async function fetchNextDocumentPage(cursor: unknown): Promise<FetchPage> {
  return fetchDocumentPage(cursor as DocumentSnapshot | null)
}

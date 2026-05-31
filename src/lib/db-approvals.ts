// src/lib/db-approvals.ts
//
// Data layer for the Approval Center module.
// Fetches: work_orders (status=open) + purchase_orders (status=pending)
// Writes: status updates, approvedBy/rejectedBy, document generation.

import {
  collection, getDocs, getDoc, doc,
  query, where, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import {
  createOrderDocument,
  getAssets,
  getSuppliers,
} from './db'
import {
  generateServiceDocument,
  generatePurchaseDocument,
  calcTotal,
} from './document-generator'
import type { ServiceOrder, PurchaseOrder, Asset, Supplier } from '@/types'
import type { ApprovalItem, ApprovalItemStatus } from '@/types/approvals'

// ── Helpers ───────────────────────────────────────────────────

type DocData = Record<string, unknown>

function tsToDate(ts: unknown): Date | undefined {
  if (!ts) return undefined
  if (ts instanceof Date) return ts
  const t = ts as { toDate?: () => Date; seconds?: number }
  if (typeof t.toDate === 'function') return t.toDate()
  if (typeof t.seconds === 'number')  return new Date(t.seconds * 1000)
  return undefined
}

function hydrate<T>(id: string, data: DocData): T {
  return { id, ...data } as T
}

// ── Fetch pending service orders ──────────────────────────────

async function fetchPendingServiceOrders(): Promise<ServiceOrder[]> {
  const snap = await getDocs(
    query(collection(db, 'work_orders'), where('status', '==', 'open'))
  )
  return snap.docs.map(d => hydrate<ServiceOrder>(d.id, d.data() as DocData))
}

// ── Fetch pending purchase orders ─────────────────────────────

async function fetchPendingPurchaseOrders(): Promise<PurchaseOrder[]> {
  const snap = await getDocs(
    query(collection(db, 'purchase_orders'), where('status', '==', 'pending'))
  )
  return snap.docs.map(d => {
    const data = d.data() as DocData
    return hydrate<PurchaseOrder>(d.id, { ...data, items: (data.items as []) ?? [] })
  })
}

// ── Build unified ApprovalItem list ──────────────────────────

function serviceToItem(
  o: ServiceOrder,
  assetMap: Map<string, Asset>,
  status: ApprovalItemStatus = 'pending_approval',
): ApprovalItem {
  const data = o as unknown as DocData
  return {
    id:          o.id,
    orderType:   'service',
    orderNumber: o.orderNumber ?? o.id,
    title:       o.title,
    description: o.description,
    requestedBy: o.requestedBy ?? '—',
    priority:    o.priority,
    cost:        o.cost,
    assetId:     o.assetId,
    status,
    createdAt:   tsToDate(data.createdAt),
    updatedAt:   tsToDate(data.updatedAt),
    revisionNote:        (data.revisionNote        as string) || undefined,
    revisionRequestedBy: (data.revisionRequestedBy as string) || undefined,
    rejectionReason:     (data.rejectionReason     as string) || undefined,
    rejectedBy:          (data.rejectedBy          as string) || undefined,
    approvedBy:          (data.approvedBy          as string) || undefined,
    assetName:   o.assetId ? assetMap.get(o.assetId)?.name : undefined,
    _rawService: o,
  }
}

function purchaseToItem(
  o: PurchaseOrder,
  assetMap: Map<string, Asset>,
  supplierMap: Map<string, Supplier>,
  status: ApprovalItemStatus = 'pending_approval',
): ApprovalItem {
  const data   = o as unknown as DocData
  const items  = o.items ?? []
  const total  = o.totalValue ?? calcTotal(items)
  return {
    id:           o.id,
    orderType:    'purchase',
    orderNumber:  o.orderNumber ?? o.id,
    title:        o.title,
    description:  o.description ?? '',
    requestedBy:  o.requestedBy ?? '—',
    totalValue:   total,
    assetId:      o.assetId,
    supplierId:   o.supplierId,
    status,
    createdAt:    tsToDate(data.createdAt),
    updatedAt:    tsToDate(data.updatedAt),
    revisionNote:        (data.revisionNote        as string) || undefined,
    revisionRequestedBy: (data.revisionRequestedBy as string) || undefined,
    rejectionReason:     (data.rejectionReason     as string) || undefined,
    rejectedBy:          (data.rejectedBy          as string) || undefined,
    approvedBy:          (data.approvedBy          as string) || undefined,
    assetName:    o.assetId    ? assetMap.get(o.assetId)?.name         : undefined,
    supplierName: o.supplierId ? supplierMap.get(o.supplierId)?.name   : undefined,
    _rawPurchase: o,
  }
}

// ── Determine visual status of an item ────────────────────────

function resolveStatus(raw: DocData): ApprovalItemStatus {
  if ((raw.revisionNote as string)?.trim()) return 'revision_requested'
  return 'pending_approval'
}

// ── Main fetch ────────────────────────────────────────────────

export async function fetchPendingApprovals(): Promise<ApprovalItem[]> {
  // Parallel fetch of pending orders + lookup tables
  const [serviceOrders, purchaseOrders, assets, suppliers] = await Promise.all([
    fetchPendingServiceOrders(),
    fetchPendingPurchaseOrders(),
    getAssets(),
    getSuppliers(),
  ])

  const assetMap    = new Map(assets.map(a   => [a.id,   a]))
  const supplierMap = new Map(suppliers.map(s => [s.id,   s]))

  const serviceItems  = serviceOrders.map(o =>
    serviceToItem(o, assetMap, resolveStatus(o as unknown as DocData)))

  const purchaseItems = purchaseOrders.map(o =>
    purchaseToItem(o, assetMap, supplierMap, resolveStatus(o as unknown as DocData)))

  return [...serviceItems, ...purchaseItems]
}

// ── Re-fetch a single item (after action) ─────────────────────

export async function refetchItem(
  id:        string,
  orderType: 'service' | 'purchase',
): Promise<ApprovalItem | null> {
  const colName = orderType === 'service' ? 'work_orders' : 'purchase_orders'
  const snap    = await getDoc(doc(db, colName, id))
  if (!snap.exists()) return null

  const data = snap.data() as DocData
  const [assets, suppliers] = await Promise.all([getAssets(), getSuppliers()])
  const assetMap    = new Map(assets.map(a   => [a.id, a]))
  const supplierMap = new Map(suppliers.map(s => [s.id, s]))

  if (orderType === 'service') {
    const o = hydrate<ServiceOrder>(snap.id, data)
    return serviceToItem(o, assetMap, resolveStatus(data))
  } else {
    const o = hydrate<PurchaseOrder>(snap.id, { ...data, items: (data.items as []) ?? [] })
    return purchaseToItem(o, assetMap, supplierMap, resolveStatus(data))
  }
}

// ── Approve Service Order ─────────────────────────────────────

export async function approveServiceOrder(
  id:            string,
  order:         ServiceOrder,
  approverUid:   string,
  approverName:  string,
  generateDoc:   boolean,
): Promise<string | null> {
  await updateDoc(doc(db, 'work_orders', id), {
    status:        'in_progress',
    approvedBy:    approverName,
    approvedByUid: approverUid,
    approvedAt:    serverTimestamp(),
    revisionNote:  null,
    updatedAt:     serverTimestamp(),
  })

  if (!generateDoc) return null

  const docData = {
    ...generateServiceDocument({ ...order, status: 'in_progress' }),
    generatedBy: approverName,
  }
  return createOrderDocument(docData)
}

// ── Approve Purchase Order ────────────────────────────────────

export async function approvePurchaseOrder(
  id:            string,
  order:         PurchaseOrder,
  approverUid:   string,
  approverName:  string,
): Promise<string> {
  const items      = order.items ?? []
  const totalValue = order.totalValue ?? calcTotal(items)

  await updateDoc(doc(db, 'purchase_orders', id), {
    status:        'approved',
    approvedBy:    approverName,
    approvedByUid: approverUid,
    approvedAt:    serverTimestamp(),
    totalValue,
    revisionNote:  null,
    updatedAt:     serverTimestamp(),
  })

  const docData = {
    ...generatePurchaseDocument({ ...order, status: 'approved', approvedBy: approverName }),
    generatedBy: approverName,
  }
  return createOrderDocument(docData)
}

// ── Reject Order ──────────────────────────────────────────────

export async function rejectOrder(
  id:           string,
  orderType:    'service' | 'purchase',
  rejectorUid:  string,
  rejectorName: string,
  reason:       string,
): Promise<void> {
  const colName = orderType === 'service' ? 'work_orders' : 'purchase_orders'
  await updateDoc(doc(db, colName, id), {
    status:           'cancelled',
    rejectedBy:       rejectorName,
    rejectedByUid:    rejectorUid,
    rejectedAt:       serverTimestamp(),
    rejectionReason:  reason.trim(),
    revisionNote:     null,
    updatedAt:        serverTimestamp(),
  })
}

// ── Request Revision ──────────────────────────────────────────

export async function requestRevision(
  id:           string,
  orderType:    'service' | 'purchase',
  reviewerName: string,
  note:         string,
): Promise<void> {
  const colName = orderType === 'service' ? 'work_orders' : 'purchase_orders'
  await updateDoc(doc(db, colName, id), {
    revisionNote:        note.trim(),
    revisionRequestedBy: reviewerName,
    revisionRequestedAt: serverTimestamp(),
    updatedAt:           serverTimestamp(),
    // status stays unchanged — item remains in the pending queue
  })
}

// ── Fetch linked documents ────────────────────────────────────

export async function fetchOrderDocuments(orderId: string): Promise<Array<{
  id: string; documentNumber: string; orderType: string; createdAt?: Date
}>> {
  const snap = await getDocs(
    query(collection(db, 'order_documents'), where('orderId', '==', orderId))
  )
  return snap.docs.map(d => {
    const data = d.data() as DocData
    return {
      id:             d.id,
      documentNumber: (data.documentNumber as string) ?? '—',
      orderType:      (data.orderType      as string) ?? '—',
      createdAt:      tsToDate(data.createdAt),
    }
  })
}

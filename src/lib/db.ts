/**
 * db.ts — Typed Firestore data layer (React/npm version)
 *
 * Mirrors the vanilla js/core/db-ativos.js logic
 * but with strong TypeScript types and npm firebase imports.
 */

import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, writeBatch, increment,
  type QueryConstraint,
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  Category, Asset, MaintenanceRecord, Supplier,
  AssetStatus, MaintenanceStatus, MaintenanceType, SupplierType, FieldType,
  FirestoreTimestamp, ServiceOrder, PurchaseOrder, ServiceOrderStatus,
  PurchaseOrderStatus, Priority, OrderDocument,
} from '@/types'

// Re-export so callers can use this from either '@/lib/db' or '@/types'
export type { FirestoreTimestamp }

// ── Collection refs ───────────────────────────────────
const C = {
  cats:  'asset_categories',
  assets: 'assets',
  maint: 'asset_maintenance',
  inv:   'inventory_sessions',
  supp:  'asset_suppliers',
  os:    'work_orders',
  po:    'purchase_orders',
  docs:  'order_documents',
} as const

// ── Timestamp helper ──────────────────────────────────
type TimestampInput = FirestoreTimestamp | Date | null | undefined

function tsToDate(ts: TimestampInput): Date | undefined {
  if (!ts) return undefined
  if (ts instanceof Date) return ts
  if ('toDate' in ts) return ts.toDate()
  return new Date((ts as { seconds: number }).seconds * 1000)
}

function hydrate<T extends object>(id: string, data: Record<string, unknown>): T {
  return { id, ...data } as T
}

// Firestore rejects `undefined` field values — strip them recursively before any write.
function dropUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropUndefined)
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, dropUndefined(v)])
    )
  }
  return value
}

// ══════════════════════════════════════════════════════
// CATEGORIES
// ══════════════════════════════════════════════════════

export async function getCategories(): Promise<Category[]> {
  const snap = await getDocs(query(collection(db, C.cats), orderBy('name')))
  return snap.docs.map(d => hydrate<Category>(d.id, d.data()))
}

export async function getCategoryById(id: string): Promise<Category | null> {
  const snap = await getDoc(doc(db, C.cats, id))
  return snap.exists() ? hydrate<Category>(snap.id, snap.data()) : null
}

export async function createCategory(data: Omit<Category, 'id' | 'assetCount' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, C.cats), {
    ...data, assetCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateCategory(id: string, data: Partial<Category>): Promise<void> {
  await updateDoc(doc(db, C.cats, id), { ...data, updatedAt: serverTimestamp() })
}

export async function deleteCategory(id: string): Promise<void> {
  await deleteDoc(doc(db, C.cats, id))
}

export async function seedDefaultCategories(defaults: Omit<Category, 'id' | 'assetCount'>[]): Promise<boolean> {
  const existing = await getDocs(collection(db, C.cats))
  if (!existing.empty) return false
  const batch = writeBatch(db)
  defaults.forEach(cat => {
    batch.set(doc(collection(db, C.cats)), {
      ...cat, assetCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
  })
  await batch.commit()
  return true
}

// ══════════════════════════════════════════════════════
// ASSETS
// ══════════════════════════════════════════════════════

interface AssetFilters {
  categoryId?: string
  status?:     AssetStatus
  location?:   string
}

export async function getAssets(filters: AssetFilters = {}): Promise<Asset[]> {
  const constraints: QueryConstraint[] = []
  if (filters.categoryId) constraints.push(where('categoryId', '==', filters.categoryId))
  if (filters.status)     constraints.push(where('status',     '==', filters.status))
  if (filters.location)   constraints.push(where('location',   '==', filters.location))
  constraints.push(orderBy('createdAt', 'desc'))

  const snap = await getDocs(query(collection(db, C.assets), ...constraints))
  return snap.docs.map(d => hydrate<Asset>(d.id, d.data()))
}

export async function getAssetById(id: string): Promise<Asset | null> {
  const snap = await getDoc(doc(db, C.assets, id))
  return snap.exists() ? hydrate<Asset>(snap.id, snap.data()) : null
}

export async function createAsset(data: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, C.assets), {
    ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
  if (data.categoryId) {
    updateDoc(doc(db, C.cats, data.categoryId), { assetCount: increment(1) }).catch(() => {})
  }
  return ref.id
}

export async function updateAsset(id: string, data: Partial<Asset>): Promise<void> {
  await updateDoc(doc(db, C.assets, id), { ...data, updatedAt: serverTimestamp() })
}

export async function deleteAsset(id: string, categoryId?: string): Promise<void> {
  await deleteDoc(doc(db, C.assets, id))
  if (categoryId) {
    updateDoc(doc(db, C.cats, categoryId), { assetCount: increment(-1) }).catch(() => {})
  }
}

export async function generateAssetCode(prefix: string): Promise<string> {
  const snap = await getDocs(query(collection(db, C.assets), where('codePrefix', '==', prefix)))
  return `${prefix}-${String(snap.size + 1).padStart(4, '0')}`
}

// ══════════════════════════════════════════════════════
// MAINTENANCE
// ══════════════════════════════════════════════════════

interface MaintenanceFilters {
  assetId?: string
  status?:  MaintenanceStatus
  type?:    MaintenanceType
}

export async function getMaintenance(filters: MaintenanceFilters = {}): Promise<MaintenanceRecord[]> {
  const constraints: QueryConstraint[] = []
  if (filters.assetId) constraints.push(where('assetId', '==', filters.assetId))
  if (filters.status)  constraints.push(where('status',  '==', filters.status))
  if (filters.type)    constraints.push(where('type',    '==', filters.type))
  constraints.push(orderBy('createdAt', 'desc'))

  const snap = await getDocs(query(collection(db, C.maint), ...constraints))
  return snap.docs.map(d => hydrate<MaintenanceRecord>(d.id, d.data()))
}

export async function createMaintenance(
  data: Omit<MaintenanceRecord, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const clean = dropUndefined(data) as typeof data
  const ref = await addDoc(collection(db, C.maint), {
    ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
  if (data.status === 'andamento' && data.assetId) {
    updateAsset(data.assetId, { status: 'manutencao' }).catch(() => {})
  }
  return ref.id
}

export async function updateMaintenance(
  id: string,
  data: Partial<MaintenanceRecord>,
  assetId?: string
): Promise<void> {
  await updateDoc(doc(db, C.maint, id), { ...data, updatedAt: serverTimestamp() })
  if (data.status === 'concluida' && assetId) {
    updateAsset(assetId, { status: 'ativo' }).catch(() => {})
  }
}

export async function deleteMaintenance(id: string): Promise<void> {
  await deleteDoc(doc(db, C.maint, id))
}

// ══════════════════════════════════════════════════════
// SUPPLIERS
// ══════════════════════════════════════════════════════

interface SupplierFilters {
  categoryId?: string
  type?:       SupplierType
  active?:     boolean
}

export async function getSuppliers(filters: SupplierFilters = {}): Promise<Supplier[]> {
  const constraints: QueryConstraint[] = []
  if (filters.categoryId) constraints.push(where('categoryIds', 'array-contains', filters.categoryId))
  if (filters.type)       constraints.push(where('type',   '==', filters.type))
  if (filters.active !== undefined) constraints.push(where('active', '==', filters.active))
  constraints.push(orderBy('name'))

  const snap = await getDocs(query(collection(db, C.supp), ...constraints))
  return snap.docs.map(d => hydrate<Supplier>(d.id, d.data()))
}

export async function getSupplierById(id: string): Promise<Supplier | null> {
  const snap = await getDoc(doc(db, C.supp, id))
  return snap.exists() ? hydrate<Supplier>(snap.id, snap.data()) : null
}

export async function createSupplier(data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, C.supp), {
    ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateSupplier(id: string, data: Partial<Supplier>): Promise<void> {
  await updateDoc(doc(db, C.supp, id), { ...data, updatedAt: serverTimestamp() })
}

export async function deleteSupplier(id: string): Promise<void> {
  await deleteDoc(doc(db, C.supp, id))
}

// ── Date formatting helpers ───────────────────────────

export function fmtDate(ts: TimestampInput): string {
  const d = tsToDate(ts)
  return d ? d.toLocaleDateString('pt-BR') : '—'
}

export function fmtDateTime(ts: TimestampInput): string {
  const d = tsToDate(ts)
  if (!d) return '—'
  return (
    d.toLocaleDateString('pt-BR') + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  )
}

// ══════════════════════════════════════════════════════
// INVENTORY SESSIONS
// ══════════════════════════════════════════════════════

export type ItemAuditStatus = 'found' | 'missing' | 'issue'
export type InventoryScope  = 'all' | 'category' | 'location'

export interface InventoryResult {
  status:   ItemAuditStatus
  note:     string
  markedAt: string
}

export interface InventorySession {
  id:          string
  name:        string
  scopeType:   InventoryScope
  scopeValue?: string | null
  responsible?: string | null
  createdBy?:  string
  status:      'em_andamento' | 'concluida'
  results:     Record<string, InventoryResult>
  summary?:    { total: number; found: number; missing: number; issue: number; closedBy: string }
  createdAt?:  FirestoreTimestamp | Date | null
  closedAt?:   FirestoreTimestamp | Date | null
}

export async function getInventorySessions(): Promise<InventorySession[]> {
  const snap = await getDocs(query(collection(db, C.inv), orderBy('createdAt', 'desc')))
  return snap.docs.map(d => hydrate<InventorySession>(d.id, d.data()))
}

export async function getInventorySession(id: string): Promise<InventorySession | null> {
  const snap = await getDoc(doc(db, C.inv, id))
  return snap.exists() ? hydrate<InventorySession>(snap.id, snap.data()) : null
}

export async function createInventorySession(
  data: Omit<InventorySession, 'id' | 'status' | 'results' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, C.inv), {
    ...data,
    status:    'em_andamento',
    results:   {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function markInventoryItem(
  sessionId: string,
  assetId:   string,
  status:    ItemAuditStatus,
  note = ''
): Promise<void> {
  await updateDoc(doc(db, C.inv, sessionId), {
    [`results.${assetId}`]: { status, note, markedAt: new Date().toISOString() },
    updatedAt: serverTimestamp(),
  })
}

export async function closeInventorySession(
  sessionId: string,
  summary:   InventorySession['summary']
): Promise<void> {
  await updateDoc(doc(db, C.inv, sessionId), {
    status:    'concluida',
    summary,
    closedAt:  serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

// ── FIELD_TYPES constant (mirrors js/core/db-ativos.js) ─────────
export const FIELD_TYPES: Record<FieldType, string> = {
  text:     'Texto',
  number:   'Número',
  date:     'Data',
  select:   'Seleção',
  textarea: 'Texto Longo',
}

// ══════════════════════════════════════════════════════
// ORDER NUMBER GENERATOR
// ══════════════════════════════════════════════════════

export async function generateOrderNumber(type: 'OS' | 'PC'): Promise<string> {
  const col  = type === 'OS' ? C.os : C.po
  const snap = await getDocs(collection(db, col))
  const year = new Date().getFullYear()
  return `${type}-${year}-${String(snap.size + 1).padStart(4, '0')}`
}

// ══════════════════════════════════════════════════════
// SERVICE ORDERS
// ══════════════════════════════════════════════════════

interface ServiceOrderFilters {
  status?:   ServiceOrderStatus
  priority?: Priority
  assetId?:  string
}

export async function getServiceOrders(filters: ServiceOrderFilters = {}): Promise<ServiceOrder[]> {
  const constraints: QueryConstraint[] = []
  if (filters.status)   constraints.push(where('status',   '==', filters.status))
  if (filters.priority) constraints.push(where('priority', '==', filters.priority))
  if (filters.assetId)  constraints.push(where('assetId',  '==', filters.assetId))
  constraints.push(orderBy('createdAt', 'desc'))
  const snap = await getDocs(query(collection(db, C.os), ...constraints))
  return snap.docs.map(d => hydrate<ServiceOrder>(d.id, d.data()))
}

export async function getServiceOrderById(id: string): Promise<ServiceOrder | null> {
  const snap = await getDoc(doc(db, C.os, id))
  return snap.exists() ? hydrate<ServiceOrder>(snap.id, snap.data()) : null
}

export async function createServiceOrder(
  data: Omit<ServiceOrder, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const clean = dropUndefined(data) as typeof data
  const ref = await addDoc(collection(db, C.os), {
    ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateServiceOrder(id: string, data: Partial<ServiceOrder>): Promise<void> {
  await updateDoc(doc(db, C.os, id), { ...data, updatedAt: serverTimestamp() })
}

export async function deleteServiceOrder(id: string): Promise<void> {
  await deleteDoc(doc(db, C.os, id))
}

// ══════════════════════════════════════════════════════
// PURCHASE ORDERS
// ══════════════════════════════════════════════════════

interface PurchaseOrderFilters {
  status?:    PurchaseOrderStatus
  supplierId?: string
  assetId?:   string
}

export async function getPurchaseOrders(filters: PurchaseOrderFilters = {}): Promise<PurchaseOrder[]> {
  const constraints: QueryConstraint[] = []
  if (filters.status)     constraints.push(where('status',     '==', filters.status))
  if (filters.supplierId) constraints.push(where('supplierId', '==', filters.supplierId))
  if (filters.assetId)    constraints.push(where('assetId',    '==', filters.assetId))
  constraints.push(orderBy('createdAt', 'desc'))
  const snap = await getDocs(query(collection(db, C.po), ...constraints))
  // Ensure `items` always exists — legacy documents may not have the field
  return snap.docs.map(d => {
    const data = d.data()
    return hydrate<PurchaseOrder>(d.id, { ...data, items: data['items'] ?? [] })
  })
}

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrder | null> {
  const snap = await getDoc(doc(db, C.po, id))
  if (!snap.exists()) return null
  const data = snap.data()
  return hydrate<PurchaseOrder>(snap.id, { ...data, items: data['items'] ?? [] })
}

export async function createPurchaseOrder(
  data: Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const clean = dropUndefined(data) as typeof data
  const ref = await addDoc(collection(db, C.po), {
    ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updatePurchaseOrder(id: string, data: Partial<PurchaseOrder>): Promise<void> {
  await updateDoc(doc(db, C.po, id), { ...data, updatedAt: serverTimestamp() })
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  await deleteDoc(doc(db, C.po, id))
}

// ══════════════════════════════════════════════════════
// ORDER DOCUMENTS
// ══════════════════════════════════════════════════════

export async function getOrderDocuments(orderId?: string): Promise<OrderDocument[]> {
  const constraints: QueryConstraint[] = []
  if (orderId) constraints.push(where('orderId', '==', orderId))
  constraints.push(orderBy('createdAt', 'desc'))
  const snap = await getDocs(query(collection(db, C.docs), ...constraints))
  return snap.docs.map(d => hydrate<OrderDocument>(d.id, d.data()))
}

export async function createOrderDocument(
  data: Omit<OrderDocument, 'id'>
): Promise<string> {
  const clean = dropUndefined(data) as Omit<OrderDocument, 'id'>
  const ref = await addDoc(collection(db, C.docs), {
    ...clean, createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function deleteOrderDocument(id: string): Promise<void> {
  await deleteDoc(doc(db, C.docs, id))
}

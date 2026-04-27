import type {
  ServiceOrder, PurchaseOrder,
  OrderDocument, ServiceDocumentContent, PurchaseDocumentContent,
} from '@/types'

function toISOSafe(d: Date | undefined): string | undefined {
  if (!d) return undefined
  if (d instanceof Date) return d.toISOString()
  // Firestore Timestamp at runtime
  const ts = d as unknown as { toDate(): Date }
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString()
  return undefined
}

function docNumber(prefix: string, orderId: string): string {
  return `DOC-${prefix}-${orderId.slice(-6).toUpperCase()}`
}

export function generateServiceDocument(
  order: ServiceOrder
): Omit<OrderDocument, 'id'> {
  const orderNumber = order.orderNumber ?? order.id

  const content: ServiceDocumentContent = {
    orderNumber,
    title:          order.title,
    description:    order.description,
    technician:     order.technician,
    serviceType:    order.serviceType,
    priority:       order.priority,
    status:         order.status,
    cost:           order.cost,
    scheduledDate:  toISOSafe(order.scheduledDate),
    completedDate:  toISOSafe(order.completedDate),
    assetId:        order.assetId,
    maintenanceId:  order.maintenanceId,
    requestedBy:    order.requestedBy,
    notes:          order.notes,
  }

  return {
    orderId:        order.id,
    orderType:      'service',
    documentNumber: docNumber('OS', order.id),
    orderNumber,
    content,
    createdAt:      new Date(),
  }
}

export function generatePurchaseDocument(
  order: PurchaseOrder
): Omit<OrderDocument, 'id'> {
  const orderNumber = order.orderNumber ?? order.id

  const content: PurchaseDocumentContent = {
    orderNumber,
    title:        order.title,
    description:  order.description,
    items:        order.items,
    totalValue:   order.totalValue,
    supplierId:   order.supplierId,
    status:       order.status,
    requestedBy:  order.requestedBy,
    approvedBy:   order.approvedBy,
    assetId:      order.assetId,
    notes:        order.notes,
  }

  return {
    orderId:        order.id,
    orderType:      'purchase',
    documentNumber: docNumber('PC', order.id),
    orderNumber,
    content,
    createdAt:      new Date(),
  }
}

export function calcTotal(items: PurchaseOrder['items']): number {
  return items.reduce((sum, it) => sum + it.quantity * (it.unitPrice ?? 0), 0)
}

export function fmtCurrency(value: number | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function fmtDocDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

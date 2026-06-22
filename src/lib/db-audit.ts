// db-audit.ts — Central de Auditoria Global (imutável)
//
// Registra ações de todos os módulos em 'audit_log'.
// Leitura: supervisor+. Escrita: qualquer usuário autenticado.
// Logs são imutáveis (update bloqueado em firestore.rules).

import {
  collection, addDoc, getDocs,
  query, where, orderBy, limit as firestoreLimit,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

export type AuditAction =
  | 'create' | 'update' | 'delete'
  | 'approve' | 'reject' | 'status_change'
  | 'login' | 'logout' | 'view'
  | 'upload' | 'generate'

export interface AuditEntry {
  id?:         string
  module:      string            // 'os' | 'compras' | 'seguranca' | etc.
  entityType:  string            // 'work_order' | 'employee' | 'obra' | etc.
  entityId:    string
  entityName?: string
  action:      AuditAction
  details?:    string            // descrição curta livre
  oldValue?:   Record<string, unknown>
  newValue?:   Record<string, unknown>
  userId:      string
  userName:    string
  userRole?:   string
  occurredAt:  Date
}

export interface AuditFilters {
  module?:     string
  entityId?:   string
  userId?:     string
  action?:     AuditAction
  after?:      Date
  limitTo?:    number
}

// ── Escreve uma entrada de auditoria ──────────────────────

export async function logAudit(
  entry: Omit<AuditEntry, 'id' | 'occurredAt'>,
): Promise<void> {
  try {
    await addDoc(collection(db, 'audit_log'), {
      ...entry,
      occurredAt: Timestamp.now(),
    })
  } catch (err) {
    // Nunca deve bloquear a ação principal — apenas loga
    console.warn('[audit] falha ao registrar:', err)
  }
}

// ── Lê o log de auditoria ─────────────────────────────────

export async function getAuditLog(filters: AuditFilters = {}): Promise<AuditEntry[]> {
  const { module, entityId, userId, action, after, limitTo = 200 } = filters

  const constraints: Parameters<typeof query>[1][] = [
    orderBy('occurredAt', 'desc'),
    firestoreLimit(limitTo),
  ]

  if (module)   constraints.push(where('module',   '==', module))
  if (entityId) constraints.push(where('entityId', '==', entityId))
  if (userId)   constraints.push(where('userId',   '==', userId))
  if (action)   constraints.push(where('action',   '==', action))
  if (after)    constraints.push(where('occurredAt', '>=', Timestamp.fromDate(after)))

  const snap = await getDocs(query(collection(db, 'audit_log'), ...constraints))
  return snap.docs.map(d => ({
    ...d.data(),
    id:         d.id,
    occurredAt: (d.data().occurredAt as Timestamp).toDate(),
  } as AuditEntry))
}

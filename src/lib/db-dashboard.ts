// src/lib/db-dashboard.ts
//
// Collections used:
//   work_orders, purchase_orders, asset_maintenance  — from db.ts domain
//   vehicle_state                                    — from db-fleet.ts domain
//   cleaning_inspections                             — from db-cleaning.ts domain
//   safety_occurrences                               — from db-safety.ts domain
//   employees                                        — from db-employees.ts domain
//   avaliacoes_empreiteira                           — from db-obras.ts domain
//   dashboard_kpi_cache                              — new cache collection

import {
  collection, doc, getDoc, getDocs, setDoc, onSnapshot,
  query, where, orderBy, limit, serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db }            from './firebase'
import type {
  Period, DateRange, KpiCacheDoc, KpiValue,
  AlertItem, AlertSeverity, DashboardModule, OverviewChartPoint,
} from '@/types/dashboard'
import { getPeriodRanges } from '@/types/dashboard'

// ── Constants ─────────────────────────────────────────────
const KPI_CACHE_COLLECTION = 'dashboard_kpi_cache'
const KPI_CACHE_DOC        = 'current'
const KPI_TTL_MS           = 15 * 60 * 1000  // 15 minutes

// ── Timestamp helper ──────────────────────────────────────
function tsToDate(ts: unknown): Date | undefined {
  if (!ts) return undefined
  if (ts instanceof Date) return ts
  const t = ts as { toDate?: () => Date; seconds?: number }
  if (typeof t.toDate === 'function') return t.toDate()
  if (typeof t.seconds === 'number') return new Date(t.seconds * 1000)
  return undefined
}

function kv(value: number, prev: number): KpiValue {
  return { value, prev }
}

// ─────────────────────────────────────────────────────────
// KPI CACHE
// ─────────────────────────────────────────────────────────

export async function readKpiCache(period: Period): Promise<KpiCacheDoc | null> {
  try {
    const snap = await getDoc(doc(db, KPI_CACHE_COLLECTION, KPI_CACHE_DOC))
    if (!snap.exists()) return null
    const data = snap.data() as KpiCacheDoc
    const age  = Date.now() - (tsToDate(data.generatedAt)?.getTime() ?? 0)
    if (age > KPI_TTL_MS || data.period !== period) return null
    return data
  } catch {
    return null
  }
}

export async function computeAndWriteKpiCache(period: Period): Promise<KpiCacheDoc> {
  const { current, prev } = getPeriodRanges(period)
  const now = new Date()

  // ── Parallel queries ──────────────────────────────────
  const [
    openOrdersSnap,
    pendingPOsSnap,
    lateMaintSnap,
    prevLateMaintSnap,
    fleetStateSnap,
    cleaningCurrSnap,
    cleaningPrevSnap,
    safetyOccCurrSnap,
    safetyOccPrevSnap,
    employeesSnap,
    empreiteirasCurrSnap,
    empreiteirasPrevSnap,
    cancelledPOsCurrSnap,
    cancelledPOsPrevSnap,
    workPermitsSnap,
  ] = await Promise.all([
    getDocs(query(collection(db, 'work_orders'), where('status', 'in', ['open', 'in_progress']))),
    getDocs(query(collection(db, 'purchase_orders'), where('status', '==', 'pending'))),
    getDocs(query(collection(db, 'asset_maintenance'), where('status', 'in', ['pendente', 'andamento']))),
    getDocs(query(collection(db, 'asset_maintenance'), where('status', 'in', ['pendente', 'andamento']), where('scheduledDate', '>=', prev.from), where('scheduledDate', '<=', prev.to))),
    getDocs(collection(db, 'vehicle_state')),
    getDocs(query(collection(db, 'cleaning_inspections'), where('timestampEnvio', '>=', current.from.getTime()))),
    getDocs(query(collection(db, 'cleaning_inspections'), where('timestampEnvio', '>=', prev.from.getTime()), where('timestampEnvio', '<=', prev.to.getTime()))),
    getDocs(query(collection(db, 'safety_occurrences'), where('createdAt', '>=', current.from))),
    getDocs(query(collection(db, 'safety_occurrences'), where('createdAt', '>=', prev.from), where('createdAt', '<=', prev.to))),
    getDocs(query(collection(db, 'employees'), where('status', '==', 'ativo'))),
    getDocs(query(collection(db, 'avaliacoes_empreiteira'), where('createdAt', '>=', current.from))),
    getDocs(query(collection(db, 'avaliacoes_empreiteira'), where('createdAt', '>=', prev.from), where('createdAt', '<=', prev.to))),
    getDocs(query(collection(db, 'purchase_orders'), where('status', '==', 'cancelled'), where('updatedAt', '>=', current.from))),
    getDocs(query(collection(db, 'purchase_orders'), where('status', '==', 'cancelled'), where('updatedAt', '>=', prev.from), where('updatedAt', '<=', prev.to))),
    getDocs(query(collection(db, 'work_permits'), where('status', '==', 'pendente'))),
  ])

  // ── Ordenes abertas ───────────────────────────────────
  const ordensAbertas = kv(openOrdersSnap.size, 0)

  // ── Aprovações pendentes ──────────────────────────────
  const aprovacoesPendentes = kv(pendingPOsSnap.size, 0)

  // ── Manutenção atrasada ───────────────────────────────
  const lateMaintCount = lateMaintSnap.docs.filter(d => {
    const sd = tsToDate(d.data().scheduledDate)
    return sd && sd < now
  }).length
  const prevLateMaintCount = prevLateMaintSnap.docs.filter(d => {
    const sd = tsToDate(d.data().scheduledDate)
    return sd && sd < prev.to
  }).length
  const manutencaoAtrasada = kv(lateMaintCount, prevLateMaintCount)

  // ── Compras urgentes ──────────────────────────────────
  const comprasUrgentes = kv(pendingPOsSnap.size, 0)

  // ── Alertas maquinário ────────────────────────────────
  const alertasMaquinario = kv(lateMaintSnap.docs.length, prevLateMaintSnap.docs.length)

  // ── Alertas frota ─────────────────────────────────────
  const fleetAlerts = fleetStateSnap.docs.filter(d => {
    const s = d.data().status as string
    return s === 'danger' || s === 'warning'
  }).length
  const alertasFrota = kv(fleetAlerts, 0)

  // ── Falhas limpeza (score < 60) ───────────────────────
  const cleaningFails = cleaningCurrSnap.docs.filter(d => (d.data().score as number ?? 0) < 60).length
  const prevCleaningFails = cleaningPrevSnap.docs.filter(d => (d.data().score as number ?? 0) < 60).length
  const falhasLimpeza = kv(cleaningFails, prevCleaningFails)

  // ── Incidentes segurança ──────────────────────────────
  const incidentesSeguranca = kv(safetyOccCurrSnap.size, safetyOccPrevSnap.size)

  // ── Alertas colaboradores (crítico/atenção) ───────────
  const criticalEmps = employeesSnap.docs.filter(d => {
    const sp = d.data().statusPerformance as string
    return sp === 'critico' || sp === 'atencao'
  }).length
  const alertasColaboradores = kv(criticalEmps, 0)

  // ── Empreiteiras críticas (score < 60) ───────────────
  const emprCrit = empreiteirasCurrSnap.docs.filter(d => (d.data().score as number ?? 100) < 60).length
  const prevEmprCrit = empreiteirasPrevSnap.docs.filter(d => (d.data().score as number ?? 100) < 60).length
  const empreiteirasCriticas = kv(emprCrit, prevEmprCrit)

  // ── Problemas fornecedores (POs canceladas) ──────────
  const problemsFornecedores = kv(cancelledPOsCurrSnap.size, cancelledPOsPrevSnap.size)

  // ── Itens auditoria pendentes (PT pendentes) ──────────
  const itensAuditoriaPend = kv(workPermitsSnap.size, 0)

  const cacheData: Omit<KpiCacheDoc, 'generatedAt'> = {
    period,
    ordensAbertas,
    aprovacoesPendentes,
    manutencaoAtrasada,
    comprasUrgentes,
    alertasMaquinario,
    alertasFrota,
    falhasLimpeza,
    incidentesSeguranca,
    alertasColaboradores,
    empreiteirasCriticas,
    problemsFornecedores,
    itensAuditoriaPend,
  }

  await setDoc(doc(db, KPI_CACHE_COLLECTION, KPI_CACHE_DOC), {
    ...cacheData,
    generatedAt: serverTimestamp(),
  })

  return {
    ...cacheData,
    generatedAt: { toDate: () => new Date(), seconds: Date.now() / 1000, nanoseconds: 0 } as unknown as import('firebase/firestore').Timestamp,
  }
}

// ─────────────────────────────────────────────────────────
// LIVE ALERTS (onSnapshot)
// ─────────────────────────────────────────────────────────

export function subscribeToAlerts(
  cb: (alerts: AlertItem[]) => void
): Unsubscribe {
  const now = new Date()
  const cutoff5d = new Date(now.getTime() - 5 * 86_400_000)

  const unsubs: Unsubscribe[] = []
  const state: Record<string, AlertItem[]> = {
    os:     [],
    maint:  [],
    safety: [],
  }

  function emit() {
    const all = [...state.os, ...state.maint, ...state.safety]
    all.sort((a, b) => {
      const order: Record<string, number> = { critical: 0, urgent: 1, attention: 2 }
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
    })
    cb(all.slice(0, 30))
  }

  // Overdue work orders
  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'work_orders'),
        where('status', 'in', ['open', 'in_progress']),
        limit(50)
      ),
      snap => {
        state.os = snap.docs
          .filter(d => {
            const sd = tsToDate(d.data().scheduledDate)
            return sd && sd < cutoff5d
          })
          .map(d => ({
            id:        d.id,
            severity:  'urgent' as AlertSeverity,
            title:     `OS atrasada: ${(d.data().title as string) ?? d.id}`,
            module:    'maquinario' as DashboardModule,
            createdAt: tsToDate(d.data().createdAt) ?? new Date(),
            linkTo:    '/os',
          }))
        emit()
      }
    )
  )

  // Overdue maintenance
  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'asset_maintenance'),
        where('status', 'in', ['pendente', 'andamento']),
        limit(50)
      ),
      snap => {
        state.maint = snap.docs
          .filter(d => {
            const sd = tsToDate(d.data().scheduledDate)
            return sd && sd < now
          })
          .map(d => ({
            id:        d.id,
            severity:  'attention' as AlertSeverity,
            title:     `Manutenção pendente: ${(d.data().description as string)?.slice(0, 50) ?? d.id}`,
            module:    'maquinario' as DashboardModule,
            createdAt: tsToDate(d.data().createdAt) ?? new Date(),
            linkTo:    '/ativos/manutencao',
          }))
        emit()
      }
    )
  )

  // Unresolved safety incidents
  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'safety_occurrences'),
        where('resolvido', '==', false),
        limit(20)
      ),
      snap => {
        state.safety = snap.docs.map(d => ({
          id:        d.id,
          severity:  'critical' as AlertSeverity,
          title:     `Incidente não resolvido: ${(d.data().titulo as string) ?? d.id}`,
          module:    'seguranca' as DashboardModule,
          createdAt: tsToDate(d.data().createdAt) ?? new Date(),
          linkTo:    '/seguranca/ocorrencias',
        }))
        emit()
      }
    )
  )

  return () => unsubs.forEach(u => u())
}

// ─────────────────────────────────────────────────────────
// PENDING APPROVALS COUNT (for tab badge)
// ─────────────────────────────────────────────────────────

export function subscribeToPendingCount(cb: (count: number) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'purchase_orders'), where('status', '==', 'pending')),
    snap => cb(snap.size)
  )
}

// ─────────────────────────────────────────────────────────
// CHART DATA
// ─────────────────────────────────────────────────────────

export async function fetchOverviewChartData(
  current: DateRange,
  period:  Period
): Promise<OverviewChartPoint[]> {
  const [osSnap, maintSnap] = await Promise.all([
    getDocs(query(
      collection(db, 'work_orders'),
      where('createdAt', '>=', current.from),
      orderBy('createdAt', 'asc'),
    )),
    getDocs(query(
      collection(db, 'asset_maintenance'),
      where('createdAt', '>=', current.from),
      orderBy('createdAt', 'asc'),
    )),
  ])

  const useWeekly = period === '90d' || period === '6m' || period === '1a'
  const buckets   = new Map<string, { abertas: number; concluidas: number; custo: number }>()

  function bucketKey(date: Date): string {
    if (!useWeekly) {
      return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
    }
    const d = new Date(date)
    d.setDate(d.getDate() - d.getDay() + 1)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  function ensureBucket(key: string) {
    if (!buckets.has(key)) buckets.set(key, { abertas: 0, concluidas: 0, custo: 0 })
  }

  osSnap.docs.forEach(d => {
    const data  = d.data()
    const date  = tsToDate(data.createdAt)
    if (!date) return
    const key    = bucketKey(date)
    ensureBucket(key)
    const bucket = buckets.get(key)!
    if (data.status === 'open' || data.status === 'in_progress') bucket.abertas++
    else if (data.status === 'completed') bucket.concluidas++
  })

  maintSnap.docs.forEach(d => {
    const data  = d.data()
    const date  = tsToDate(data.completedDate ?? data.createdAt)
    if (!date) return
    const key    = bucketKey(date)
    ensureBucket(key)
    const bucket = buckets.get(key)!
    bucket.custo += (data.cost as number) ?? 0
  })

  return Array.from(buckets.entries())
    .sort(([a], [b]) => {
      const [da, ma] = a.split('/').map(Number)
      const [db2, mb] = b.split('/').map(Number)
      return ma !== mb ? ma - mb : da - db2
    })
    .map(([date, vals]) => ({ date, ...vals }))
}

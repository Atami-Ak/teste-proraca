/**
 * db-fleet.ts — Firestore layer for the Fleet module
 *
 * TypeScript port of:
 *   js/core/db-frota.js         — inspection save, WO/PO auto-creation, queries
 *   js/core/vehicle-state-engine.js — vehicle state KPI computation
 *
 * Collections:
 *   checklists_frota  — inspection records
 *   vehicle_state     — status & pre-computed KPIs
 *   work_orders       — maintenance WOs (auto-created on NC)
 *   purchase_orders   — procurement POs (auto-created on NC)
 */

import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc,
  serverTimestamp, query, where, limit,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from './firebase'
import type {
  FleetInspection, ChecklistItem, InspectionHeader,
  VehicleState, VehicleStatus, TrendType, VehicleKPIs,
} from '@/types/vehicle'
import { PARTS_CATALOG } from '@/data/fleet-catalog'

// ── Collection keys ───────────────────────────────────
const C = {
  inspections:   'checklists_frota',
  vehicleState:  'vehicle_state',
  workOrders:    'work_orders',
  purchaseOrders:'purchase_orders',
} as const

const PREVENTIVE_THRESHOLD_MS = 30 * 24 * 3_600_000

// ══════════════════════════════════════════════════════
// SAVE INSPECTION
// ══════════════════════════════════════════════════════

/**
 * Saves a complete inspection to Firestore.
 * Uploads photos per NC item to Firebase Storage first.
 * Auto-creates WO + PO for NC items (non-blocking).
 *
 * @param inspection  - structured form payload (photos as [])
 * @param photoFiles  - Map<itemId, File[]> for NC items
 * @param authorName  - authenticated user display name
 * @returns Firestore doc ID
 */
export async function salvarInspecao(
  inspection:  Omit<FleetInspection, 'id'>,
  photoFiles:  Map<string, File[]>,
  authorName:  string,
): Promise<string> {
  const updatedItems = await _uploadItemPhotos(
    inspection.checklist,
    photoFiles,
    inspection.header.vehiclePlate || 'SEM_PLACA',
  )

  const nonConformities = updatedItems.filter(i => i.status === 'NC').length

  const payload = {
    ...inspection,
    checklist:       updatedItems,
    nonConformities,
    vehicleId:       inspection.header.vehicleId,
    vehiclePlate:    inspection.header.vehiclePlate,
    vehicleModel:    inspection.header.vehicleModel,
    inspectionType:  inspection.header.inspectionType,
    createdBy:       authorName,
    createdAt:       serverTimestamp(),
    timestampEnvio:  Date.now(),
  }

  const docRef = await addDoc(collection(db, C.inspections), payload)

  // Non-blocking side effects
  if (nonConformities > 0) {
    _autoWorkOrderFrota(docRef.id, updatedItems, inspection.header, authorName)
      .catch(err => console.error('[FROTA] Erro ao criar O.S:', err))
  }

  const inspResult = nonConformities === 0 ? 'ok' : nonConformities >= 3 ? 'critical' : 'attention'
  updateVehicleState(inspection.header.vehicleId, {
    newStatus:    inspResult === 'ok' ? 'operational' : inspResult === 'critical' ? 'critical' : 'attention',
    woType:       'inspection',
    lastEventDesc:`Inspeção de ${inspection.header.inspectionType === 'departure' ? 'saída' : 'retorno'} — ${nonConformities > 0 ? `${nonConformities} NC` : 'Conforme'}`,
    authorName,
  }).catch(e => console.warn('[FROTA] updateVehicleState:', e))

  return docRef.id
}

// ── Photo upload helper ───────────────────────────────

async function _uploadItemPhotos(
  items:      ChecklistItem[],
  photoFiles: Map<string, File[]>,
  placa:      string,
): Promise<ChecklistItem[]> {
  if (!photoFiles || photoFiles.size === 0) return items
  return Promise.all(
    items.map(async item => {
      const files = photoFiles.get(item.id)
      if (!files || files.length === 0) return item
      const urls: string[] = []
      for (let i = 0; i < files.length; i++) {
        const path        = `inspecoes_frota/${placa}/${Date.now()}_${item.id}_${i}.jpg`
        const storageRef  = ref(storage, path)
        const snapshot    = await uploadBytes(storageRef, files[i])
        urls.push(await getDownloadURL(snapshot.ref))
      }
      return { ...item, photos: urls }
    })
  )
}

// ══════════════════════════════════════════════════════
// AUTO WO + PO ENGINE
// Faithful TypeScript port of autoWorkOrderFrota() in db-frota.js
// Business rules PRESERVED exactly.
// ══════════════════════════════════════════════════════

async function _autoWorkOrderFrota(
  inspectionId: string,
  items:        ChecklistItem[],
  header:       InspectionHeader,
  authorName:   string,
): Promise<void> {
  const ncItems = items.filter(i => i.status === 'NC')
  if (!ncItems.length) return

  const vehicleId = header.vehicleId
  const veiculo   = `${header.vehiclePlate}${header.vehicleModel ? ` — ${header.vehicleModel}` : ''}`
  const tipo      = header.inspectionType === 'departure' ? 'Saída' : 'Retorno'
  const dataInsp  = header.date || new Date().toLocaleDateString('pt-BR')

  const highPrioCategories = ['structure_safety_fluids', 'mechanical_load', 'lighting_signaling']
  const hasCritical        = ncItems.some(i => highPrioCategories.includes(i.category))
  const woPriority         = hasCritical ? 'high' : 'medium'

  // Collect all parts from NC items
  const allParts: Array<{ name: string; quantity: number }> = []
  ncItems.forEach(item => {
    const entry = PARTS_CATALOG[item.id]
    if (entry?.requiresPurchase && entry.parts.length) {
      entry.parts.forEach(p => allParts.push({ name: p.name, quantity: p.quantity }))
    }
  })
  const consolidatedItems = _consolidateParts(allParts)

  // Build ONE consolidated Maintenance WO
  const issueLines = ncItems
    .map(i => `  • ${i.label}${i.notes ? ` — ${i.notes}` : ''}`)
    .join('\n')
  const maintTitle = ncItems.length === 1
    ? `[FROTA] NC: ${ncItems[0].label} — ${header.vehiclePlate}`
    : `[FROTA] ${ncItems.length} NCs — Inspeção de ${tipo} — ${header.vehiclePlate}`
  const maintDesc =
    `Inspeção de ${tipo} em ${dataInsp} — ${ncItems.length} item(s) não conforme(s).\n` +
    `Veículo: ${veiculo}\n\nItens NC:\n${issueLines}`

  const maintPayload = {
    type:            'maintenance',
    maintenanceType: 'corrective',
    title:           maintTitle,
    description:     maintDesc,
    issues:          ncItems.map(i => ({ label: i.label, category: i.category, notes: i.notes, photos: i.photos })),
    origin:          'inspection',
    originId:        vehicleId,
    originNome:      header.vehiclePlate,
    entityType:      'vehicle',
    vehicleId,
    vehicleName:     header.vehicleModel,
    assetTag:        header.vehiclePlate,
    sector:          'logistica',
    priority:        woPriority,
    status:          'open',
    solicitante:     authorName,
    criadoPor:       authorName,
    inspecaoId:      inspectionId,
    ncItemLabel:     ncItems[0]?.label ?? null,
    timeline: [{
      acao:      `O.S consolidada criada automaticamente — ${ncItems.length} NC(s) em inspeção de frota (${tipo})`,
      usuario:   'Sistema',
      icone:     '🤖',
      timestamp: Date.now(),
    }],
    createdAt:      serverTimestamp(),
    updatedAt:      serverTimestamp(),
    timestampEnvio: Date.now(),
  }

  const maintRef  = await addDoc(collection(db, C.workOrders), maintPayload)
  const createdWoId = maintRef.id

  // Create or update ONE consolidated PO (cross-inspection dedup)
  let finalPoId: string | null = null

  if (consolidatedItems.length > 0) {
    const existingPOs  = await _loadOpenPurchaseOrders(vehicleId)
    const existingPO   = existingPOs[0] ?? null
    const urgencia     = _woPriorityToUrgencia(woPriority)

    if (existingPO) {
      const prevItems = (existingPO['items'] as Array<Record<string, unknown>>) ?? []
      const prevTl    = (existingPO['timeline'] as Array<Record<string, unknown>>) ?? []
      const prevWoIds = (existingPO['linkedWorkOrderIds'] as string[]) ?? []
      const mergedItems = _mergeItems(prevItems, consolidatedItems)
      const appendNote  = `\nAtualizado — inspeção de ${tipo} em ${dataInsp} (${ncItems.length} NC adicionais)`
      await updateDoc(doc(db, C.purchaseOrders, existingPO.id), {
        items:         mergedItems,
        justificativa: (existingPO['justificativa'] as string ?? '') + appendNote,
        urgencia:      _maxUrgencia(existingPO['urgencia'] as string, urgencia),
        linkedWorkOrderIds: [...new Set([...prevWoIds, createdWoId])],
        updatedAt:     serverTimestamp(),
        timestampAtualizado: Date.now(),
        timeline: [
          ...prevTl,
          {
            acao:      `${consolidatedItems.length} item(s) adicionado(s) — inspeção de ${tipo} em ${dataInsp} | O.S: ${createdWoId}`,
            usuario:   'Sistema',
            timestamp: Date.now(),
          },
        ],
      })
      finalPoId = existingPO.id
    } else {
      const ncLabels = ncItems.map(i => i.label).join(', ')
      const poPayload = {
        categoria:         'peca',
        origem:            'inspection',
        originId:          inspectionId,
        linkedWorkOrderId: createdWoId,
        inspecaoId:        inspectionId,
        vehicleId,
        vehiclePlate:      header.vehiclePlate,
        vehicleName:       header.vehicleModel,
        justificativa:
          `Auto-gerado — inspeção de ${tipo} em ${dataInsp}.\n` +
          `Veículo: ${veiculo}\nItens NC: ${ncLabels}`,
        items:       consolidatedItems,
        solicitante: authorName,
        criadoPor:   authorName,
        setor:       'logistica',
        urgencia,
        fornecedor:  '',
        status:      'pending',
        timeline: [{
          acao:      `Pedido de compra criado automaticamente — ${consolidatedItems.length} item(s) de ${ncItems.length} NC(s) | O.S: ${createdWoId}`,
          usuario:   'Sistema',
          timestamp: Date.now(),
        }],
        createdAt:      serverTimestamp(),
        updatedAt:      serverTimestamp(),
        timestampEnvio: Date.now(),
      }
      const poRef = await addDoc(collection(db, C.purchaseOrders), poPayload)
      finalPoId = poRef.id
    }

    // Write purchaseOrderId back to the WO
    if (finalPoId) {
      updateDoc(doc(db, C.workOrders, createdWoId), {
        purchaseOrderId:     finalPoId,
        updatedAt:           serverTimestamp(),
        timestampAtualizado: Date.now(),
      }).catch(e => console.warn('[FROTA] Falha ao vincular PO na O.S:', e))
    }
  }

  // Bidirectional backlinks on the inspection
  const backlink: Record<string, string[]> = { linkedWorkOrders: [createdWoId] }
  if (finalPoId) backlink.linkedPurchaseOrders = [finalPoId]
  updateDoc(doc(db, C.inspections, inspectionId), backlink)
    .catch(e => console.warn('[FROTA] Falha ao atualizar backlinks:', e))
}

// ── Action engine helpers ─────────────────────────────

function _consolidateParts(parts: Array<{ name: string; quantity: number }>) {
  const map: Record<string, { descricao: string; quantidade: number; precoUnitario: number; precoTotal: number }> = {}
  parts.forEach(p => {
    if (!map[p.name]) map[p.name] = { descricao: p.name, quantidade: 0, precoUnitario: 0, precoTotal: 0 }
    map[p.name].quantidade += p.quantity
  })
  return Object.values(map)
}

function _mergeItems(
  existing: Array<Record<string, unknown>>,
  incoming: Array<Record<string, unknown>>,
) {
  const map: Record<string, Record<string, unknown>> = {}
  existing.forEach(i => {
    const key = (i['descricao'] as string) || (i['nome'] as string) || ''
    map[key] = { ...i, descricao: key }
  })
  incoming.forEach(i => {
    const key = (i['descricao'] as string) || ''
    if (map[key]) {
      map[key]['quantidade'] = (map[key]['quantidade'] as number) + ((i['quantidade'] as number) || 1)
    } else {
      map[key] = { ...i, descricao: key }
    }
  })
  return Object.values(map)
}

function _woPriorityToUrgencia(priority: 'high' | 'medium' | 'low') {
  return priority === 'high' ? 'critico' : priority === 'medium' ? 'urgente' : 'normal'
}

function _maxUrgencia(a: string, b: string) {
  const rank: Record<string, number> = { critico: 3, urgente: 2, normal: 1 }
  return (rank[a] ?? 1) >= (rank[b] ?? 1) ? a : b
}

async function _loadOpenPurchaseOrders(vehicleId: string) {
  if (!vehicleId) return []
  try {
    const q    = query(collection(db, C.purchaseOrders), where('vehicleId', '==', vehicleId))
    const snap = await getDocs(q)
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }))
      .filter(po => po['status'] !== 'received' && po['status'] !== 'cancelled')
      .sort((a, b) => ((b['timestampEnvio'] as number) || 0) - ((a['timestampEnvio'] as number) || 0))
  } catch {
    return []
  }
}

// ══════════════════════════════════════════════════════
// VEHICLE STATE ENGINE
// ══════════════════════════════════════════════════════

export async function getVehicleState(vehicleId: string): Promise<VehicleState | null> {
  try {
    const snap = await getDoc(doc(db, C.vehicleState, vehicleId))
    return snap.exists() ? { id: snap.id, ...snap.data() } as VehicleState : null
  } catch {
    return null
  }
}

export async function getAllVehicleStates(): Promise<Record<string, VehicleState>> {
  try {
    const snap = await getDocs(collection(db, C.vehicleState))
    const map: Record<string, VehicleState> = {}
    snap.forEach(d => { map[d.id] = { id: d.id, ...d.data() } as VehicleState })
    return map
  } catch {
    return {}
  }
}

export async function updateVehicleState(
  vehicleId: string,
  opts: {
    newStatus?:    VehicleStatus
    woType?:       string
    downtimeHours?: number
    lastEventDesc?: string
    authorName?:   string
  } = {},
): Promise<void> {
  try {
    const stateRef = doc(db, C.vehicleState, vehicleId)
    const existing = await getDoc(stateRef)
    const prev     = existing.exists() ? existing.data() as Partial<VehicleState> : {}

    const resolvedStatus = opts.newStatus ?? 'operational'
    const isFailure      = resolvedStatus === 'stopped' || resolvedStatus === 'critical'
    const kpis           = await _computeKPIs(vehicleId)

    await setDoc(stateRef, {
      vehicleId,
      currentStatus:       resolvedStatus,
      lastEventDate:       Date.now(),
      lastEventDesc:       opts.lastEventDesc ?? prev.lastEventDesc ?? null,
      lastMaintenanceType: opts.woType ?? prev.lastMaintenanceType ?? null,
      totalDowntimeHours:  (prev.totalDowntimeHours ?? 0) + (opts.downtimeHours ?? 0),
      failureCount:        (prev.failureCount ?? 0) + (isFailure ? 1 : 0),
      mtbfHours:     kpis.mtbfHours,
      mttrHours:     kpis.mttrHours,
      recentFailures: kpis.recentFailures,
      trend:         kpis.trend,
      updatedAt:     serverTimestamp(),
      updatedBy:     opts.authorName ?? 'Sistema',
    }, { merge: true })
  } catch (e) {
    console.error('[VehicleState] updateVehicleState error:', e)
  }
}

// ── KPI computation ───────────────────────────────────

async function _computeKPIs(vehicleId: string): Promise<Pick<VehicleState, 'mtbfHours' | 'mttrHours' | 'recentFailures' | 'trend'>> {
  const fallback = { mtbfHours: null, mttrHours: null, recentFailures: 0, trend: 'insufficient_data' as TrendType }
  try {
    const q    = query(collection(db, C.workOrders), where('originId', '==', vehicleId))
    const snap = await getDocs(q)
    const recs = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>))
      .filter(r => (r['origin'] === 'fleet' || r['entityType'] === 'vehicle') && r['status'] !== 'cancelled')
      .sort((a, b) => ((a['timestampEnvio'] as number) || 0) - ((b['timestampEnvio'] as number) || 0))

    if (!recs.length) return fallback

    const failures = recs.filter(r => r['downtime'] || r['maintenanceType'] === 'corrective')

    let mtbfHours: number | null = null
    if (failures.length >= 2) {
      const intervals: number[] = []
      for (let i = 1; i < failures.length; i++) {
        const diff = ((failures[i]['timestampEnvio'] as number) || 0) - ((failures[i-1]['timestampEnvio'] as number) || 0)
        if (diff > 0) intervals.push(diff)
      }
      if (intervals.length) {
        mtbfHours = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length / 3_600_000)
      }
    }

    const completedCW = recs.filter(r =>
      r['status'] === 'completed' && r['downtime'] &&
      (r['scheduling'] as Record<string, unknown>)?.['durationHours'] != null
    )
    const mttrHours: number | null = completedCW.length > 0
      ? Math.round(completedCW.reduce((a, r) => a + ((r['scheduling'] as Record<string, number>)?.['durationHours'] ?? 0), 0) / completedCW.length * 10) / 10
      : null

    const sevenDaysAgo   = Date.now() - 7 * 24 * 3_600_000
    const recentFailures = failures.filter(r => ((r['timestampEnvio'] as number) || 0) >= sevenDaysAgo).length

    let trend: TrendType = 'insufficient_data'
    if (recs.length >= 6) {
      const score = (r: Record<string, unknown>) => (r['downtime'] || r['maintenanceType'] === 'corrective') ? 2 : 0
      const r5    = recs.slice(-5).reduce((acc, r) => acc + score(r), 0)
      const p5    = recs.slice(-10, -5).reduce((acc, r) => acc + score(r), 0)
      trend = r5 < p5 ? 'improving' : r5 > p5 ? 'worsening' : 'stable'
    }

    return { mtbfHours, mttrHours, recentFailures, trend }
  } catch {
    return fallback
  }
}

/** Returns effective display status (applies preventive_due override). */
export function getEffectiveVehicleStatus(state: VehicleState | null): VehicleStatus {
  if (!state) return 'operational'
  const s = state.currentStatus ?? 'operational'
  if (s === 'operational' && state.lastEventDate) {
    if (Date.now() - state.lastEventDate > PREVENTIVE_THRESHOLD_MS) return 'preventive_due'
  }
  return s
}

// ══════════════════════════════════════════════════════
// KPI for history page
// ══════════════════════════════════════════════════════

export async function calcularKPIsVehicle(vehicleId: string): Promise<VehicleKPIs> {
  const fallback: VehicleKPIs = {
    totalRegistros: 0, totalParadas: 0, totalPreventivas: 0,
    totalDowntimeHours: 0, mtbfHours: null, mttrHours: null,
    recentFailures: 0, trend: 'insufficient_data',
  }
  try {
    const q    = query(collection(db, C.workOrders), where('originId', '==', vehicleId))
    const snap = await getDocs(q)
    const recs = snap.docs
      .map(d => ({ ...d.data() } as Record<string, unknown>))
      .filter(r => (r['origin'] === 'fleet' || r['entityType'] === 'vehicle') && r['status'] !== 'cancelled')
      .sort((a, b) => ((a['timestampEnvio'] as number) || 0) - ((b['timestampEnvio'] as number) || 0))

    const failures     = recs.filter(r => r['downtime'] || r['maintenanceType'] === 'corrective')
    const preventivas  = recs.filter(r => r['maintenanceType'] === 'preventive')
    const totalDowntime= recs.reduce((acc, r) => {
      const sched = r['scheduling'] as Record<string, number> | undefined
      return acc + (r['downtime'] && sched?.['durationHours'] ? sched['durationHours'] : 0)
    }, 0)

    let mtbfHours: number | null = null
    if (failures.length >= 2) {
      const spans: number[] = []
      for (let i = 1; i < failures.length; i++) {
        const diff = ((failures[i]['timestampEnvio'] as number) || 0) - ((failures[i-1]['timestampEnvio'] as number) || 0)
        if (diff > 0) spans.push(diff)
      }
      if (spans.length) mtbfHours = Math.round(spans.reduce((a, b) => a + b, 0) / spans.length / 3_600_000)
    }

    const completedCW = recs.filter(r =>
      r['status'] === 'completed' && r['downtime'] &&
      (r['scheduling'] as Record<string, unknown>)?.['durationHours'] != null
    )
    const mttrHours: number | null = completedCW.length > 0
      ? Math.round(completedCW.reduce((a, r) => a + ((r['scheduling'] as Record<string, number>)?.['durationHours'] ?? 0), 0) / completedCW.length * 10) / 10
      : null

    const sevenDaysAgo   = Date.now() - 7 * 24 * 3_600_000
    const recentFailures = failures.filter(r => ((r['timestampEnvio'] as number) || 0) >= sevenDaysAgo).length

    let trend: TrendType = 'insufficient_data'
    if (recs.length >= 6) {
      const score = (r: Record<string, unknown>) => (r['downtime'] || r['maintenanceType'] === 'corrective') ? 2 : 0
      const r5    = recs.slice(-5).reduce((acc, r) => acc + score(r), 0)
      const p5    = recs.slice(-10, -5).reduce((acc, r) => acc + score(r), 0)
      trend = r5 < p5 ? 'improving' : r5 > p5 ? 'worsening' : 'stable'
    }

    return {
      totalRegistros:    recs.length,
      totalParadas:      failures.length,
      totalPreventivas:  preventivas.length,
      totalDowntimeHours: totalDowntime,
      mtbfHours, mttrHours, recentFailures, trend,
    }
  } catch {
    return fallback
  }
}

// ══════════════════════════════════════════════════════
// INSPECTION QUERIES
// ══════════════════════════════════════════════════════

export async function obterInspecoesRecentes(vehicleId: string | null = null, limitN = 50): Promise<FleetInspection[]> {
  const q = vehicleId
    ? query(collection(db, C.inspections), where('vehicleId', '==', vehicleId), limit(limitN))
    : query(collection(db, C.inspections), limit(limitN))
  const snap = await getDocs(q)
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as FleetInspection))
  return docs.sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0))
}

export async function obterInspecaoPorId(id: string): Promise<FleetInspection> {
  const snap = await getDoc(doc(db, C.inspections, id))
  if (!snap.exists()) throw new Error('Inspeção não encontrada.')
  return { id: snap.id, ...snap.data() } as FleetInspection
}

export async function getVehicleWorkOrders(vehicleId: string): Promise<Record<string, unknown>[]> {
  try {
    const q    = query(collection(db, C.workOrders), where('originId', '==', vehicleId))
    const snap = await getDocs(q)
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>))
      .filter(r => r['entityType'] === 'vehicle' || r['origin'] === 'inspection')
      .sort((a, b) => ((b['timestampEnvio'] as number) || 0) - ((a['timestampEnvio'] as number) || 0))
  } catch {
    return []
  }
}

export async function getVehiclePurchaseOrders(vehicleId: string): Promise<Record<string, unknown>[]> {
  try {
    const q    = query(collection(db, C.purchaseOrders), where('vehicleId', '==', vehicleId))
    const snap = await getDocs(q)
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>))
      .sort((a, b) => ((b['timestampEnvio'] as number) || 0) - ((a['timestampEnvio'] as number) || 0))
  } catch {
    return []
  }
}

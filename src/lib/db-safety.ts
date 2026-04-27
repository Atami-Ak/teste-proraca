/**
 * db-safety.ts — Firestore CRUD for Safety Management System
 * Collections: safety_dds, safety_ddi, employee_epi, epi_inspections,
 *              safety_occurrences, work_permits, safety_actions, safety_kpi
 */

import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  DDS, DDSStatus,
  DDI, DDISecao,
  EPIFicha, EPIEntrega, EPIInspecao,
  Ocorrencia,
  PermissaoTrabalho,
} from '@/types/safety'

// ── Collection names ──────────────────────────────────────
const C = {
  dds:         'safety_dds',
  ddi:         'safety_ddi',
  epi:         'employee_epi',
  epiInsp:     'epi_inspections',
  ocorrencias: 'safety_occurrences',
  permissoes:  'work_permits',
  actions:     'safety_actions',
  kpi:         'safety_kpi',
} as const

// ── Helpers ───────────────────────────────────────────────

function tsToDate(ts: unknown): Date | undefined {
  if (!ts) return undefined
  if (ts instanceof Date) return ts
  const t = ts as { toDate?: () => Date; seconds?: number }
  if (typeof t.toDate === 'function') return t.toDate()
  if (typeof t.seconds === 'number') return new Date(t.seconds * 1000)
  return undefined
}

function dropUndefined(v: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(v)
      .filter(([, val]) => val !== undefined)
      .map(([k, val]) => {
        if (Array.isArray(val)) return [k, val]
        if (val && typeof val === 'object' && !(val instanceof Date)) {
          return [k, dropUndefined(val as Record<string, unknown>)]
        }
        return [k, val]
      })
  )
}

async function nextCode(col: string, prefix: string): Promise<string> {
  const snap = await getDocs(collection(db, col))
  let max = 0
  snap.forEach(d => {
    const n = d.data().numero as string | undefined
    if (n) {
      const num = parseInt(n.replace(`${prefix}-`, ''), 10)
      if (!isNaN(num) && num > max) max = num
    }
  })
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

// ── Hydrators ─────────────────────────────────────────────

function hydrateDDS(id: string, d: Record<string, unknown>): DDS {
  return {
    ...d,
    id,
    data:      tsToDate(d.data) ?? new Date(),
    createdAt: tsToDate(d.createdAt),
    updatedAt: tsToDate(d.updatedAt),
  } as DDS
}

function hydrateDDI(id: string, d: Record<string, unknown>): DDI {
  return {
    ...d,
    id,
    data:      tsToDate(d.data) ?? new Date(),
    createdAt: tsToDate(d.createdAt),
    updatedAt: tsToDate(d.updatedAt),
  } as DDI
}

function hydrateEPIFicha(id: string, d: Record<string, unknown>): EPIFicha {
  const entregas = ((d.entregas ?? []) as Record<string, unknown>[]).map(e => ({
    ...e,
    dataEntrega:     tsToDate(e.dataEntrega) ?? new Date(),
    dataVencimento:  tsToDate(e.dataVencimento),
    previsaoTroca:   tsToDate(e.previsaoTroca),
  })) as EPIEntrega[]

  return {
    ...d,
    id,
    entregas,
    dataAdmissao: tsToDate(d.dataAdmissao),
    createdAt:    tsToDate(d.createdAt),
    updatedAt:    tsToDate(d.updatedAt),
  } as EPIFicha
}

function hydrateOcorrencia(id: string, d: Record<string, unknown>): Ocorrencia {
  return {
    ...d,
    id,
    data:       tsToDate(d.data) ?? new Date(),
    prazoAcao:  tsToDate(d.prazoAcao),
    createdAt:  tsToDate(d.createdAt),
    updatedAt:  tsToDate(d.updatedAt),
  } as Ocorrencia
}

function hydratePermissao(id: string, d: Record<string, unknown>): PermissaoTrabalho {
  return {
    ...d,
    id,
    data:      tsToDate(d.data) ?? new Date(),
    createdAt: tsToDate(d.createdAt),
    updatedAt: tsToDate(d.updatedAt),
  } as PermissaoTrabalho
}

// ── DDI scoring ───────────────────────────────────────────

export function computeDDIScore(secoes: DDISecao[]): {
  scoreGeral: number
  totalItens: number
  totalConformes: number
  totalNaoConformes: number
  totalNaoAplicaveis: number
  totalCriticosAbertos: number
} {
  let totalItens = 0
  let totalConformes = 0
  let totalNaoConformes = 0
  let totalNaoAplicaveis = 0
  let totalCriticosAbertos = 0

  for (const secao of secoes) {
    for (const item of secao.itens) {
      if (item.resultado === 'nao_aplicavel') {
        totalNaoAplicaveis++
      } else {
        totalItens++
        if (item.resultado === 'conforme')      totalConformes++
        if (item.resultado === 'nao_conforme') {
          totalNaoConformes++
          if (item.critico) totalCriticosAbertos++
        }
      }
    }
  }

  const aplicaveis = totalConformes + totalNaoConformes
  const scoreGeral = aplicaveis > 0 ? Math.round((totalConformes / aplicaveis) * 100) : 0

  return {
    scoreGeral, totalItens, totalConformes,
    totalNaoConformes, totalNaoAplicaveis, totalCriticosAbertos,
  }
}

// ═══════════════════════════════════════════════════════════
// DDS
// ═══════════════════════════════════════════════════════════

export async function getDDSList(): Promise<DDS[]> {
  const q = query(collection(db, C.dds), orderBy('data', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => hydrateDDS(d.id, d.data() as Record<string, unknown>))
}

export async function getDDS(id: string): Promise<DDS | null> {
  const snap = await getDoc(doc(db, C.dds, id))
  if (!snap.exists()) return null
  return hydrateDDS(snap.id, snap.data() as Record<string, unknown>)
}

export async function createDDS(data: Omit<DDS, 'id' | 'numero' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const numero = await nextCode(C.dds, 'DDS')
  const ref = await addDoc(collection(db, C.dds), {
    ...dropUndefined(data as Record<string, unknown>),
    numero,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateDDS(id: string, data: Partial<DDS>): Promise<void> {
  const { id: _id, createdAt: _c, ...rest } = data
  void _id; void _c
  await updateDoc(doc(db, C.dds, id), {
    ...dropUndefined(rest as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteDDS(id: string): Promise<void> {
  await deleteDoc(doc(db, C.dds, id))
}

// ═══════════════════════════════════════════════════════════
// DDI
// ═══════════════════════════════════════════════════════════

export async function getDDIList(): Promise<DDI[]> {
  const q = query(collection(db, C.ddi), orderBy('data', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => hydrateDDI(d.id, d.data() as Record<string, unknown>))
}

export async function getDDI(id: string): Promise<DDI | null> {
  const snap = await getDoc(doc(db, C.ddi, id))
  if (!snap.exists()) return null
  return hydrateDDI(snap.id, snap.data() as Record<string, unknown>)
}

export async function createDDI(data: Omit<DDI, 'id' | 'numero' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const numero = await nextCode(C.ddi, 'DDI')
  const scores = computeDDIScore(data.secoes)
  const ref = await addDoc(collection(db, C.ddi), {
    ...dropUndefined(data as Record<string, unknown>),
    numero,
    ...scores,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateDDI(id: string, data: Partial<DDI>): Promise<void> {
  const { id: _id, createdAt: _c, ...rest } = data
  void _id; void _c

  // Recompute scores if secoes are being updated
  const scores = rest.secoes ? computeDDIScore(rest.secoes) : {}

  await updateDoc(doc(db, C.ddi, id), {
    ...dropUndefined(rest as Record<string, unknown>),
    ...scores,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteDDI(id: string): Promise<void> {
  await deleteDoc(doc(db, C.ddi, id))
}

// ═══════════════════════════════════════════════════════════
// EPI — Fichas
// ═══════════════════════════════════════════════════════════

function computeEPIStatus(entregas: EPIEntrega[]): {
  statusFicha: EPIFicha['statusFicha']
  totalEpisVencidos: number
  totalEpisAVencer: number
} {
  const now = new Date()
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  let vencidos = 0
  let aVencer = 0

  for (const e of entregas) {
    if (e.dataVencimento) {
      if (e.dataVencimento < now) vencidos++
      else if (e.dataVencimento < in30) aVencer++
    }
  }

  let status: EPIFicha['statusFicha'] = 'conforme'
  if (vencidos > 0) status = 'vencido'
  else if (aVencer > 0) status = 'pendente'

  return { statusFicha: status, totalEpisVencidos: vencidos, totalEpisAVencer: aVencer }
}

export async function getEPIFichas(): Promise<EPIFicha[]> {
  const q = query(collection(db, C.epi), orderBy('colaboradorNome', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => hydrateEPIFicha(d.id, d.data() as Record<string, unknown>))
}

export async function getEPIFicha(id: string): Promise<EPIFicha | null> {
  const snap = await getDoc(doc(db, C.epi, id))
  if (!snap.exists()) return null
  return hydrateEPIFicha(snap.id, snap.data() as Record<string, unknown>)
}

export async function createEPIFicha(data: Omit<EPIFicha, 'id' | 'statusFicha' | 'totalEpisVencidos' | 'totalEpisAVencer' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const computed = computeEPIStatus(data.entregas)
  const ref = await addDoc(collection(db, C.epi), {
    ...dropUndefined(data as Record<string, unknown>),
    ...computed,
    ativo: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateEPIFicha(id: string, data: Partial<EPIFicha>): Promise<void> {
  const { id: _id, createdAt: _c, ...rest } = data
  void _id; void _c
  const computed = rest.entregas ? computeEPIStatus(rest.entregas) : {}
  await updateDoc(doc(db, C.epi, id), {
    ...dropUndefined(rest as Record<string, unknown>),
    ...computed,
    updatedAt: serverTimestamp(),
  })
}

export async function addEPIEntrega(fichaId: string, entrega: EPIEntrega): Promise<void> {
  const ficha = await getEPIFicha(fichaId)
  if (!ficha) throw new Error('Ficha not found')
  const entregas = [...ficha.entregas, entrega]
  await updateEPIFicha(fichaId, { entregas })
}

// ── EPI Inspections ───────────────────────────────────────

export async function getEPIInspecoes(fichaId?: string): Promise<EPIInspecao[]> {
  const col = collection(db, C.epiInsp)
  const q = fichaId
    ? query(col, where('fichaId', '==', fichaId), orderBy('dataInspecao', 'desc'))
    : query(col, orderBy('dataInspecao', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => {
    const data = d.data() as Record<string, unknown>
    return {
      ...data,
      id:            d.id,
      dataInspecao:  tsToDate(data.dataInspecao) ?? new Date(),
      createdAt:     tsToDate(data.createdAt),
    } as EPIInspecao
  })
}

export async function createEPIInspecao(data: Omit<EPIInspecao, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, C.epiInsp), {
    ...dropUndefined(data as Record<string, unknown>),
    createdAt: serverTimestamp(),
  })
  return ref.id
}

// ═══════════════════════════════════════════════════════════
// Ocorrências
// ═══════════════════════════════════════════════════════════

export async function getOcorrencias(): Promise<Ocorrencia[]> {
  const q = query(collection(db, C.ocorrencias), orderBy('data', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => hydrateOcorrencia(d.id, d.data() as Record<string, unknown>))
}

export async function getOcorrencia(id: string): Promise<Ocorrencia | null> {
  const snap = await getDoc(doc(db, C.ocorrencias, id))
  if (!snap.exists()) return null
  return hydrateOcorrencia(snap.id, snap.data() as Record<string, unknown>)
}

export async function createOcorrencia(data: Omit<Ocorrencia, 'id' | 'numero' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const numero = await nextCode(C.ocorrencias, 'OC')
  const ref = await addDoc(collection(db, C.ocorrencias), {
    ...dropUndefined(data as Record<string, unknown>),
    numero,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateOcorrencia(id: string, data: Partial<Ocorrencia>): Promise<void> {
  const { id: _id, createdAt: _c, ...rest } = data
  void _id; void _c
  await updateDoc(doc(db, C.ocorrencias, id), {
    ...dropUndefined(rest as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  })
}

// ═══════════════════════════════════════════════════════════
// Permissões de Trabalho
// ═══════════════════════════════════════════════════════════

export async function getPermissoes(): Promise<PermissaoTrabalho[]> {
  const q = query(collection(db, C.permissoes), orderBy('data', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => hydratePermissao(d.id, d.data() as Record<string, unknown>))
}

export async function getPermissao(id: string): Promise<PermissaoTrabalho | null> {
  const snap = await getDoc(doc(db, C.permissoes, id))
  if (!snap.exists()) return null
  return hydratePermissao(snap.id, snap.data() as Record<string, unknown>)
}

export async function createPermissao(data: Omit<PermissaoTrabalho, 'id' | 'numero' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const numero = await nextCode(C.permissoes, 'PT')
  const ref = await addDoc(collection(db, C.permissoes), {
    ...dropUndefined(data as Record<string, unknown>),
    numero,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updatePermissao(id: string, data: Partial<PermissaoTrabalho>): Promise<void> {
  const { id: _id, createdAt: _c, ...rest } = data
  void _id; void _c
  await updateDoc(doc(db, C.permissoes, id), {
    ...dropUndefined(rest as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  })
}

// ═══════════════════════════════════════════════════════════
// KPI Snapshot
// ═══════════════════════════════════════════════════════════

export async function getSafetyKPISnapshot(): Promise<{
  totalDDSMes: number
  totalDDIMes: number
  scoreMediaDDI: number
  episVencidos: number
  ocorrenciasAbertas: number
  permissoesAtivas: number
}> {
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [ddsSnap, ddiSnap, epiSnap, ocSnap, ptSnap] = await Promise.all([
    getDocs(query(collection(db, C.dds), where('data', '>=', firstOfMonth))),
    getDocs(query(collection(db, C.ddi), where('data', '>=', firstOfMonth))),
    getDocs(query(collection(db, C.epi), where('ativo', '==', true), limit(200))),
    getDocs(query(collection(db, C.ocorrencias), where('status', '!=', 'encerrada'))),
    getDocs(query(collection(db, C.permissoes), where('status', '==', 'em_execucao'))),
  ])

  let scoreSum = 0
  ddiSnap.forEach(d => { scoreSum += (d.data().scoreGeral as number) ?? 0 })
  const scoreMediaDDI = ddiSnap.size > 0 ? Math.round(scoreSum / ddiSnap.size) : 0

  let episVencidos = 0
  epiSnap.forEach(d => { episVencidos += (d.data().totalEpisVencidos as number) ?? 0 })

  return {
    totalDDSMes:      ddsSnap.size,
    totalDDIMes:      ddiSnap.size,
    scoreMediaDDI,
    episVencidos,
    ocorrenciasAbertas: ocSnap.size,
    permissoesAtivas: ptSnap.size,
  }
}

// ── Next code exports for external use ────────────────────
export const nextDDSCode  = () => nextCode(C.dds,        'DDS')
export const nextDDICode  = () => nextCode(C.ddi,        'DDI')
export const nextOCCode   = () => nextCode(C.ocorrencias, 'OC')
export const nextPTCode   = () => nextCode(C.permissoes,  'PT')

// ── DDI status update ─────────────────────────────────────
export async function updateDDIStatus(id: string, status: DDI['status'], aprovadoPor?: string): Promise<void> {
  await updateDoc(doc(db, C.ddi, id), {
    status,
    ...(aprovadoPor ? { aprovadoPor } : {}),
    updatedAt: serverTimestamp(),
  })
}

export async function updateDDSStatus(id: string, status: DDSStatus): Promise<void> {
  await updateDoc(doc(db, C.dds, id), {
    status,
    updatedAt: serverTimestamp(),
  })
}

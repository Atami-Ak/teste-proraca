/**
 * db-obras.ts — Firestore CRUD layer for Obras & Empreiteiras module
 */

import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  Obra, Empreiteira, InspecaoObra, AvaliacaoEmpreiteira,
  AprovacaoFinal, AlertaCritico, InspecaoSecao,
} from '@/types/obras'
import { calcAvaliacaoScore, calcEmpreiteiraStatus, calcRecomendacao } from '@/types/obras'

// ── Collection names ──────────────────────────────────────
const C = {
  obras:       'obras',
  empreiteiras:'empreiteiras',
  inspecoes:   'inspecoes_obra',
  avaliacoes:  'avaliacoes_empreiteira',
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

function dropUndefined(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropUndefined)
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, val]) => val !== undefined)
        .map(([k, val]) => [k, dropUndefined(val)])
    )
  }
  return v
}

function hydrateObra(id: string, d: Record<string, unknown>): Obra {
  return {
    ...d,
    id,
    dataInicio:      tsToDate(d.dataInicio),
    dataFimPrevisto: tsToDate(d.dataFimPrevisto),
    dataFimReal:     tsToDate(d.dataFimReal),
    createdAt:       tsToDate(d.createdAt),
    updatedAt:       tsToDate(d.updatedAt),
  } as Obra
}

function hydrateEmpreiteira(id: string, d: Record<string, unknown>): Empreiteira {
  return {
    ...d,
    id,
    createdAt: tsToDate(d.createdAt),
    updatedAt: tsToDate(d.updatedAt),
  } as Empreiteira
}

function hydrateInspecao(id: string, d: Record<string, unknown>): InspecaoObra {
  return {
    ...d,
    id,
    dataInspecao: tsToDate(d.dataInspecao) ?? new Date(),
    createdAt:    tsToDate(d.createdAt),
    updatedAt:    tsToDate(d.updatedAt),
  } as InspecaoObra
}

function hydrateAvaliacao(id: string, d: Record<string, unknown>): AvaliacaoEmpreiteira {
  return {
    ...d,
    id,
    createdAt: tsToDate(d.createdAt),
    updatedAt: tsToDate(d.updatedAt),
  } as AvaliacaoEmpreiteira
}

async function nextObrasCode(): Promise<string> {
  const snap = await getDocs(collection(db, C.obras))
  const max = snap.docs.reduce((acc, d) => {
    const code: string = d.data().codigo ?? ''
    const n = parseInt(code.replace('OBR-', ''), 10)
    return isNaN(n) ? acc : Math.max(acc, n)
  }, 0)
  return `OBR-${String(max + 1).padStart(3, '0')}`
}

// ══════════════════════════════════════════════════════════
// OBRAS
// ══════════════════════════════════════════════════════════

export async function getObras(): Promise<Obra[]> {
  const snap = await getDocs(query(collection(db, C.obras), orderBy('createdAt', 'desc')))
  return snap.docs.map(d => hydrateObra(d.id, d.data() as Record<string, unknown>))
}

export async function getObra(id: string): Promise<Obra | null> {
  const snap = await getDoc(doc(db, C.obras, id))
  return snap.exists() ? hydrateObra(snap.id, snap.data() as Record<string, unknown>) : null
}

export async function createObra(
  data: Omit<Obra, 'id' | 'codigo' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const codigo = await nextObrasCode()
  const payload = dropUndefined({
    ...data,
    codigo,
    totalInspecoes:  0,
    alertasCriticos: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  const ref = await addDoc(collection(db, C.obras), payload)
  return ref.id
}

export async function updateObra(id: string, data: Partial<Obra>): Promise<void> {
  const payload = dropUndefined({ ...data, updatedAt: serverTimestamp() })
  await updateDoc(doc(db, C.obras, id), payload as Record<string, unknown>)
}

export async function deleteObra(id: string): Promise<void> {
  await deleteDoc(doc(db, C.obras, id))
}

export async function updateAprovacao(obraId: string, ap: AprovacaoFinal): Promise<void> {
  await updateDoc(doc(db, C.obras, obraId), {
    aprovacaoFinal: dropUndefined(ap),
    updatedAt: serverTimestamp(),
  })
}

// ══════════════════════════════════════════════════════════
// EMPREITEIRAS
// ══════════════════════════════════════════════════════════

export async function getEmpreiteiras(): Promise<Empreiteira[]> {
  const snap = await getDocs(query(collection(db, C.empreiteiras), orderBy('nome')))
  return snap.docs.map(d => hydrateEmpreiteira(d.id, d.data() as Record<string, unknown>))
}

export async function getEmpreiteira(id: string): Promise<Empreiteira | null> {
  const snap = await getDoc(doc(db, C.empreiteiras, id))
  return snap.exists() ? hydrateEmpreiteira(snap.id, snap.data() as Record<string, unknown>) : null
}

export async function createEmpreiteira(
  data: Omit<Empreiteira, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const payload = dropUndefined({
    ...data,
    totalObras:    0,
    obrasAprovadas: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  const ref = await addDoc(collection(db, C.empreiteiras), payload)
  return ref.id
}

export async function updateEmpreiteira(id: string, data: Partial<Empreiteira>): Promise<void> {
  const payload = dropUndefined({ ...data, updatedAt: serverTimestamp() })
  await updateDoc(doc(db, C.empreiteiras, id), payload as Record<string, unknown>)
}

export async function deleteEmpreiteira(id: string): Promise<void> {
  await deleteDoc(doc(db, C.empreiteiras, id))
}

// ══════════════════════════════════════════════════════════
// INSPEÇÕES DE OBRA
// ══════════════════════════════════════════════════════════

export async function getInspecoesObra(obraId: string): Promise<InspecaoObra[]> {
  const snap = await getDocs(
    query(collection(db, C.inspecoes), where('obraId', '==', obraId), orderBy('dataInspecao', 'desc'))
  )
  return snap.docs.map(d => hydrateInspecao(d.id, d.data() as Record<string, unknown>))
}

export async function getInspecao(id: string): Promise<InspecaoObra | null> {
  const snap = await getDoc(doc(db, C.inspecoes, id))
  return snap.exists() ? hydrateInspecao(snap.id, snap.data() as Record<string, unknown>) : null
}

export async function createInspecao(
  data: Omit<InspecaoObra, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const payload = dropUndefined({ ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  const ref = await addDoc(collection(db, C.inspecoes), payload)

  // Update obra aggregates
  await _recalcObraAggregates(data.obraId)

  return ref.id
}

export async function updateInspecao(id: string, data: Partial<InspecaoObra>): Promise<void> {
  const payload = dropUndefined({ ...data, updatedAt: serverTimestamp() })
  await updateDoc(doc(db, C.inspecoes, id), payload as Record<string, unknown>)
  if (data.obraId) await _recalcObraAggregates(data.obraId)
}

async function _recalcObraAggregates(obraId: string): Promise<void> {
  const insp = await getInspecoesObra(obraId)
  const submitted = insp.filter(i => i.status !== 'rascunho')
  const total = submitted.length
  const notaMedia = total > 0
    ? Math.round((submitted.reduce((s, i) => s + i.scoreGeral, 0) / total) * 10) / 10
    : 0
  const alertasCriticos = submitted.reduce(
    (s, i) => s + (i.alertasCriticos?.filter(a => a.tipo === 'critico').length ?? 0), 0
  )
  await updateDoc(doc(db, C.obras, obraId), {
    totalInspecoes:  total,
    notaMedia,
    alertasCriticos,
    updatedAt: serverTimestamp(),
  })
}

// ══════════════════════════════════════════════════════════
// AVALIAÇÕES FINAIS
// ══════════════════════════════════════════════════════════

export async function getAvaliacoesEmpreiteira(empreiteiraId: string): Promise<AvaliacaoEmpreiteira[]> {
  const snap = await getDocs(
    query(collection(db, C.avaliacoes), where('empreiteiraId', '==', empreiteiraId), orderBy('createdAt', 'desc'))
  )
  return snap.docs.map(d => hydrateAvaliacao(d.id, d.data() as Record<string, unknown>))
}

export async function getAvaliacaoByObra(obraId: string): Promise<AvaliacaoEmpreiteira | null> {
  const snap = await getDocs(query(collection(db, C.avaliacoes), where('obraId', '==', obraId)))
  if (snap.empty) return null
  const d = snap.docs[0]
  return hydrateAvaliacao(d.id, d.data() as Record<string, unknown>)
}

export async function createAvaliacao(
  data: Omit<AvaliacaoEmpreiteira, 'id' | 'scoreTotal' | 'recomendacao' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const scoreTotal = calcAvaliacaoScore(data)
  const recomendacao = calcRecomendacao(scoreTotal)
  const payload = dropUndefined({
    ...data,
    scoreTotal,
    recomendacao,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  const ref = await addDoc(collection(db, C.avaliacoes), payload)

  // Re-aggregate empreiteira global score
  await _recalcEmpreiteiraScore(data.empreiteiraId)

  return ref.id
}

export async function updateAvaliacao(id: string, data: Partial<AvaliacaoEmpreiteira>): Promise<void> {
  const recompute: Partial<AvaliacaoEmpreiteira> = { ...data }
  if (
    data.qualidade !== undefined || data.seguranca !== undefined ||
    data.prazo !== undefined || data.retrabalho !== undefined
  ) {
    const existing = await getDoc(doc(db, C.avaliacoes, id))
    const merged = { ...existing.data(), ...data } as AvaliacaoEmpreiteira
    recompute.scoreTotal = calcAvaliacaoScore(merged)
    recompute.recomendacao = calcRecomendacao(recompute.scoreTotal)
  }
  const payload = dropUndefined({ ...recompute, updatedAt: serverTimestamp() })
  await updateDoc(doc(db, C.avaliacoes, id), payload as Record<string, unknown>)
  if (data.empreiteiraId) await _recalcEmpreiteiraScore(data.empreiteiraId)
}

async function _recalcEmpreiteiraScore(empreiteiraId: string): Promise<void> {
  const avs = await getAvaliacoesEmpreiteira(empreiteiraId)
  if (avs.length === 0) return

  const scoreGlobal = Math.round(avs.reduce((s, a) => s + a.scoreTotal, 0) / avs.length)
  const status = calcEmpreiteiraStatus(scoreGlobal)
  const totalObras = avs.length
  const obrasAprovadas = avs.filter(a => a.recomendacao === 'sim' || a.recomendacao === 'sim_restricoes').length

  await updateDoc(doc(db, C.empreiteiras, empreiteiraId), {
    scoreGlobal,
    status,
    totalObras,
    obrasAprovadas,
    updatedAt: serverTimestamp(),
  })
}

// ── Score helpers re-exported ─────────────────────────────
export { calcAvaliacaoScore, calcEmpreiteiraStatus, calcRecomendacao }

// ── Inspecao score computation (pure, no DB) ──────────────
export function computeInspecaoScore(secoes: InspecaoSecao[]): {
  scoreGeral: number
  alertasCriticos: AlertaCritico[]
} {
  let scoreGeral = 0
  const alertasCriticos: AlertaCritico[] = []

  for (const sec of secoes) {
    const avaliados = sec.itens.filter(i => i.nota !== null)
    if (avaliados.length === 0) continue

    const scoreSecao = avaliados.reduce((s, i) => s + (i.nota ?? 0), 0) / avaliados.length
    scoreGeral += scoreSecao * sec.peso

    for (const item of avaliados) {
      if (item.nota === null) continue
      if (item.critico && item.nota < 7) {
        alertasCriticos.push({
          itemId:  item.itemId,
          secaoId: sec.secaoId,
          label:   item.label,
          nota:    item.nota,
          tipo:    item.nota < 5 ? 'critico' : 'atencao',
        })
      } else if (!item.critico && item.nota < 5) {
        alertasCriticos.push({
          itemId:  item.itemId,
          secaoId: sec.secaoId,
          label:   item.label,
          nota:    item.nota,
          tipo:    'atencao',
        })
      }
    }
  }

  return {
    scoreGeral: Math.round(scoreGeral * 10) / 10,
    alertasCriticos,
  }
}

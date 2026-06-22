/**
 * db-performance.ts — Firestore CRUD para Sistema de KPI / Avaliação de Desempenho
 * Coleção: kpi_evaluations
 */

import {
  collection, doc, addDoc, getDoc, getDocs, deleteDoc,
  query, where, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { KPIEvaluation, KPIEvaluationScore, PerformancePeriod, Parecer } from '@/types/performance'
import { calcKPIResult } from '@/types/performance'

const COL = 'kpi_evaluations'

function tsToDate(ts: unknown): Date | undefined {
  if (!ts) return undefined
  if (ts instanceof Date) return ts
  const t = ts as { toDate?: () => Date; seconds?: number }
  if (typeof t.toDate === 'function') return t.toDate()
  if (typeof t.seconds === 'number') return new Date(t.seconds * 1000)
  return undefined
}

function hydrateEval(id: string, d: Record<string, unknown>): KPIEvaluation {
  return {
    id,
    employeeId:    d.employeeId    as string,
    employeeNome:  d.employeeNome  as string,
    avaliadorNome: d.avaliadorNome as string,
    periodo:       d.periodo       as PerformancePeriod,
    ano:           d.ano           as number,
    data:          tsToDate(d.data)    ?? new Date(),
    scores:       (d.scores        as KPIEvaluationScore[]) ?? [],
    notaFinal:     d.notaFinal     as number,
    percentual:    d.percentual    as number,
    parecer:       d.parecer       as Parecer,
    observacoes:   d.observacoes   as string | undefined,
    createdAt:     tsToDate(d.createdAt),
  }
}

export async function createKPIEvaluation(
  data: Omit<KPIEvaluation, 'id' | 'notaFinal' | 'percentual' | 'parecer' | 'createdAt'>
): Promise<string> {
  const { notaFinal, percentual, parecer } = calcKPIResult(data.scores)
  const ref = await addDoc(collection(db, COL), {
    ...data,
    notaFinal,
    percentual,
    parecer,
    createdAt: serverTimestamp(),
  })

  // Atualiza scorePerformance do colaborador como média ponderada com avaliações anteriores
  try {
    const { updateEmployee, getEmployee } = await import('./db-employees')
    const emp = await getEmployee(data.employeeId)
    if (emp) {
      const prev = emp.totalEvaluacoes ?? 0
      const prevScore = emp.scorePerformance ?? 50
      const newScore = prev === 0
        ? percentual
        : Math.round((prevScore * prev + percentual) / (prev + 1))
      await updateEmployee(data.employeeId, {
        scorePerformance: newScore,
        totalEvaluacoes:  prev + 1,
        ultimaAvaliacao:  data.data,
      })
    }
  } catch { /* não bloqueia a criação se houver erro no update */ }

  return ref.id
}

export async function getKPIEvaluations(employeeId: string): Promise<KPIEvaluation[]> {
  const q = query(
    collection(db, COL),
    where('employeeId', '==', employeeId),
  )
  const snap = await getDocs(q)
  return snap.docs
    .map(d => hydrateEval(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => b.data.getTime() - a.data.getTime())
}

export async function getKPIEvaluation(id: string): Promise<KPIEvaluation | null> {
  const snap = await getDoc(doc(db, COL, id))
  if (!snap.exists()) return null
  return hydrateEval(snap.id, snap.data() as Record<string, unknown>)
}

export async function deleteKPIEvaluation(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}

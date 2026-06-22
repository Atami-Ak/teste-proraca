// src/lib/db-obras-timeline.ts
// CIP V1 — Timeline básica (Digital Twin) da Obra. Escrita direta do client
// (sem Cloud Functions — ver docs/modules/obras-cip-vision.md V1).

import {
  collection, addDoc, getDocs,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { ObraTimelineEvent } from '@/types/obras-timeline'

const COLL = 'obra_timeline'

export async function addObraTimelineEvent(
  data: Omit<ObraTimelineEvent, 'id' | 'createdAt'>,
): Promise<void> {
  try {
    await addDoc(collection(db, COLL), { ...data, createdAt: serverTimestamp() })
  } catch (err) {
    // Nunca deve bloquear a ação principal — apenas loga
    console.warn('[obra_timeline] falha ao registrar evento:', err)
  }
}

export async function getObraTimeline(obraId: string): Promise<ObraTimelineEvent[]> {
  try {
    const snap = await getDocs(
      query(collection(db, COLL), where('obraId', '==', obraId), orderBy('createdAt', 'desc')),
    )
    return snap.docs.map(d => {
      const data = d.data()
      const raw  = data.createdAt
      const createdAt = raw && typeof raw.toDate === 'function' ? raw.toDate() : undefined
      return { id: d.id, ...data, createdAt } as ObraTimelineEvent
    })
  } catch {
    return []
  }
}

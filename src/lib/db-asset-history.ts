import {
  collection, addDoc, getDocs,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { AssetEvent } from '@/types/asset-history'

const COLL = 'asset_events'

export async function addAssetEvent(
  data: Omit<AssetEvent, 'id' | 'createdAt'>,
): Promise<string> {
  const ref = await addDoc(collection(db, COLL), {
    ...data,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getAssetHistory(assetId: string): Promise<AssetEvent[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, COLL),
        where('assetId', '==', assetId),
        orderBy('createdAt', 'desc'),
      ),
    )
    return snap.docs.map(d => {
      const data = d.data()
      const raw  = data.createdAt
      let createdAt: Date | undefined
      if (raw && typeof raw.toDate === 'function') createdAt = raw.toDate()
      else if (raw instanceof Date) createdAt = raw
      return { id: d.id, ...data, createdAt } as AssetEvent
    })
  } catch {
    // Índice ainda em construção ou sem permissão — retorna vazio sem travar a UI
    return []
  }
}

import {
  collection, addDoc, getDocs,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from './firebase'
import type { AssetLocationEntry } from '@/types/asset-history'

const COLL = 'asset_location_history'

export async function addLocationEntry(
  data: Omit<AssetLocationEntry, 'id' | 'createdAt' | 'photos'>,
  photoFiles: File[],
): Promise<string> {
  const photos: string[] = []
  for (const file of photoFiles) {
    const safeName = file.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')
    const storageRef = ref(
      storage,
      `assets/${data.assetId}/location-history/${Date.now()}-${safeName}`,
    )
    await uploadBytes(storageRef, file)
    const url = await getDownloadURL(storageRef)
    photos.push(url)
  }
  const docRef = await addDoc(collection(db, COLL), {
    ...data,
    photos,
    createdAt: serverTimestamp(),
  })
  return docRef.id
}

export async function getLocationHistory(assetId: string): Promise<AssetLocationEntry[]> {
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
      return { id: d.id, ...data, createdAt } as AssetLocationEntry
    })
  } catch {
    return []
  }
}

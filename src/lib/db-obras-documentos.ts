// src/lib/db-obras-documentos.ts
// CIP V2 — Documentação da Obra (Storage + Firestore). Escrita direta do
// client, sem Cloud Functions (não há ainda alerta de vencimento — isso é
// uma feature do GED completo, V2/V3 do roadmap).

import {
  collection, addDoc, getDocs, deleteDoc, doc,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from './firebase'
import type { ObraDocumento, ObraDocumentoTipo } from '@/types/obras-documentos'

const COLL = 'obra_documentos'

function getStoragePath(url: string): string {
  try {
    const match = url.match(/\/o\/(.+?)(?:\?|$)/)
    return match ? decodeURIComponent(match[1]) : ''
  } catch { return '' }
}

export async function uploadObraDocumento(
  obraId:     string,
  file:       File,
  tipo:       ObraDocumentoTipo,
  nome:       string,
  uploadedBy?: string,
): Promise<string> {
  const safeName = file.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')
  const storageRef = ref(storage, `obras/${obraId}/documentos/${Date.now()}-${safeName}`)
  await uploadBytes(storageRef, file)
  const url = await getDownloadURL(storageRef)

  const ref_ = await addDoc(collection(db, COLL), {
    obraId, tipo, nome: nome.trim() || file.name, fileName: file.name, url,
    uploadedBy, createdAt: serverTimestamp(),
  })
  return ref_.id
}

export async function getObraDocumentos(obraId: string): Promise<ObraDocumento[]> {
  try {
    const snap = await getDocs(
      query(collection(db, COLL), where('obraId', '==', obraId), orderBy('createdAt', 'desc')),
    )
    return snap.docs.map(d => {
      const data = d.data()
      const raw  = data.createdAt
      const createdAt = raw && typeof raw.toDate === 'function' ? raw.toDate() : undefined
      return { id: d.id, ...data, createdAt } as ObraDocumento
    })
  } catch {
    return []
  }
}

export async function deleteObraDocumento(docId: string, url: string): Promise<void> {
  const path = getStoragePath(url)
  if (path) {
    try { await deleteObject(ref(storage, path)) } catch { /* arquivo pode não existir */ }
  }
  await deleteDoc(doc(db, COLL, docId))
}

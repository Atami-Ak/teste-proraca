import {
  collection, addDoc, getDocs, deleteDoc,
  doc, query, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from './firebase'
import type { EmployeeDocument, EmployeeDocumentType } from '@/types/employee'

const subcol = (employeeId: string) =>
  collection(db, 'employees', employeeId, 'employee_documents')

function toDateField(raw: unknown): Date | undefined {
  if (!raw) return undefined
  if (raw instanceof Date) return raw
  if (typeof raw === 'object' && typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate()
  }
  return undefined
}

export async function getEmployeeDocuments(employeeId: string): Promise<EmployeeDocument[]> {
  try {
    const snap = await getDocs(
      query(subcol(employeeId), orderBy('uploadedAt', 'desc')),
    )
    return snap.docs.map(d => {
      const data = d.data()
      return {
        id: d.id, ...data,
        uploadedAt:     toDateField(data.uploadedAt),
        dataRealizacao: toDateField(data.dataRealizacao),
        dataValidade:   toDateField(data.dataValidade),
      } as EmployeeDocument
    })
  } catch {
    return []
  }
}

export async function uploadEmployeeDocument(
  employeeId: string,
  meta: { type: EmployeeDocumentType; name: string; uploadedBy?: string; dataRealizacao?: Date; dataValidade?: Date },
  file: File,
): Promise<EmployeeDocument> {
  const safeName = file.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')
  const path     = `employee-docs/${employeeId}/${Date.now()}-${safeName}`
  const snap     = await uploadBytes(ref(storage, path), file)
  const fileUrl  = await getDownloadURL(snap.ref)

  const docData = {
    employeeId,
    type:           meta.type,
    name:           meta.name,
    fileName:       file.name,
    fileUrl,
    fileType:       file.type,
    fileSize:       file.size,
    uploadedBy:     meta.uploadedBy ?? null,
    uploadedAt:     serverTimestamp(),
    dataRealizacao: meta.dataRealizacao ?? null,
    dataValidade:   meta.dataValidade ?? null,
  }

  const docRef = await addDoc(subcol(employeeId), docData)
  return {
    id: docRef.id, ...docData, uploadedAt: new Date(),
    dataRealizacao: meta.dataRealizacao, dataValidade: meta.dataValidade,
  } as EmployeeDocument
}

export async function deleteEmployeeDocument(
  employeeId: string,
  docId: string,
  fileUrl: string,
): Promise<void> {
  await deleteDoc(doc(db, 'employees', employeeId, 'employee_documents', docId))
  // Tenta remover o arquivo do Storage (falha silenciosa se já não existir)
  try {
    const storageRef = ref(storage, fileUrl)
    await deleteObject(storageRef)
  } catch { /* arquivo pode já ter sido removido */ }
}

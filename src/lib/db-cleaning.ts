import {
  collection, addDoc, getDocs, query, orderBy,
  serverTimestamp, doc, updateDoc, arrayUnion,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { scoreToStatus } from '@/lib/cleaning-scoring'
import type { CleaningInspection, InspectionStatus, Issue, SectionScore, FormIssue } from '@/types/cleaning'

const COL_NEW    = 'cleaning_inspections'
const COL_LEGACY = 'auditorias_limpeza'

// ── Read ──────────────────────────────────────────────

function normalizeLegacy(raw: Record<string, unknown>, id: string): CleaningInspection {
  const rawScore = typeof raw.notaLimpeza === 'number' ? raw.notaLimpeza * 10 : (raw.score as number ?? 0)
  const statusMap: Record<string, InspectionStatus> = {
    excelente: 'excellent', aceitavel: 'acceptable', atencao: 'attention', critico: 'critical',
  }
  const rawStatus = (raw.statusVisual as string ?? '').toLowerCase().replace(/[^a-z]/g, '')
  const status: InspectionStatus = statusMap[rawStatus] ?? scoreToStatus(rawScore)

  return {
    id,
    zoneId:           (raw.zoneId ?? raw.zonaId ?? '') as string,
    zoneName:         (raw.zoneName ?? raw.nomeZona ?? '') as string,
    inspectorName:    (raw.inspectorName ?? raw.inspetor ?? '') as string,
    employeeId:       (raw.employeeId ?? raw.funcionarioId ?? '') as string,
    employeeName:     (raw.employeeName ?? raw.funcionario ?? '') as string,
    score:            rawScore,
    status,
    sections:         (raw.sections as SectionScore[]) ?? [],
    issues:           (raw.issues ?? raw.checklistDetalhado ?? []) as Issue[],
    notes:            (raw.notes ?? raw.observacoes ?? '') as string,
    hasCriticalIssue: (raw.hasCriticalIssue ?? false) as boolean,
    timestampEnvio:   (raw.timestampEnvio ?? Date.now()) as number,
  }
}

export async function fetchAllInspections(): Promise<CleaningInspection[]> {
  const seenIds = new Set<string>()
  const results: CleaningInspection[] = []

  const [newSnap, legSnap] = await Promise.all([
    getDocs(query(collection(db, COL_NEW),    orderBy('timestampEnvio', 'desc'))),
    getDocs(query(collection(db, COL_LEGACY), orderBy('timestampEnvio', 'desc'))),
  ])

  newSnap.forEach(d => {
    seenIds.add(d.id)
    const raw = d.data() as CleaningInspection
    results.push({ ...raw, id: d.id })
  })

  legSnap.forEach(d => {
    if (seenIds.has(d.id)) return
    results.push(normalizeLegacy(d.data() as Record<string, unknown>, d.id))
  })

  return results.sort((a, b) => b.timestampEnvio - a.timestampEnvio)
}

export async function fetchInspectionsByZone(zoneId: string): Promise<CleaningInspection[]> {
  const all = await fetchAllInspections()
  return all.filter(i => i.zoneId === zoneId)
}

// ── Aggregations ──────────────────────────────────────

export interface ZonePerfRow {
  zoneId:          string
  zoneName:        string
  totalInspections: number
  averageScore:    number
  latestScore:     number | null
  latestStatus:    InspectionStatus | 'no_data'
  latestEmployee:  string
  latestTs:        number
  scoreHistory:    Array<{ ts: number; score: number }>
  issueCount:      number
}

export interface EmployeePerfRow {
  employeeId:       string
  employeeName:     string
  totalInspections: number
  averageScore:     number
  failures:         number
  criticalIssues:   number
  latestTs:         number
}

export async function fetchZonePerformance(): Promise<ZonePerfRow[]> {
  const all = await fetchAllInspections()
  const map = new Map<string, CleaningInspection[]>()

  for (const insp of all) {
    if (!map.has(insp.zoneId)) map.set(insp.zoneId, [])
    map.get(insp.zoneId)!.push(insp)
  }

  const rows: ZonePerfRow[] = []
  for (const [zoneId, inspections] of map) {
    const sorted   = [...inspections].sort((a, b) => b.timestampEnvio - a.timestampEnvio)
    const latest   = sorted[0]
    const avgScore = inspections.reduce((s, i) => s + i.score, 0) / inspections.length
    const issues   = inspections.reduce((s, i) => s + i.issues.length, 0)
    rows.push({
      zoneId,
      zoneName:        latest.zoneName,
      totalInspections: inspections.length,
      averageScore:    Math.round(avgScore),
      latestScore:     latest.score,
      latestStatus:    latest.status,
      latestEmployee:  latest.employeeName,
      latestTs:        latest.timestampEnvio,
      issueCount:      issues,
      scoreHistory:    sorted.slice(0, 12).map(i => ({ ts: i.timestampEnvio, score: i.score })).reverse(),
    })
  }

  return rows.sort((a, b) => a.averageScore - b.averageScore)
}

export async function fetchEmployeePerformance(): Promise<EmployeePerfRow[]> {
  const all = await fetchAllInspections()
  const map = new Map<string, CleaningInspection[]>()

  for (const insp of all) {
    if (!map.has(insp.employeeId)) map.set(insp.employeeId, [])
    map.get(insp.employeeId)!.push(insp)
  }

  const rows: EmployeePerfRow[] = []
  for (const [employeeId, inspections] of map) {
    const sorted      = [...inspections].sort((a, b) => b.timestampEnvio - a.timestampEnvio)
    const avgScore    = inspections.reduce((s, i) => s + i.score, 0) / inspections.length
    const failures    = inspections.reduce((s, i) => s + i.issues.length, 0)
    const criticals   = inspections.reduce((s, i) => s + i.issues.filter(is => is.severity === 'critical').length, 0)
    rows.push({
      employeeId,
      employeeName:    sorted[0].employeeName,
      totalInspections: inspections.length,
      averageScore:    Math.round(avgScore),
      failures,
      criticalIssues:  criticals,
      latestTs:        sorted[0].timestampEnvio,
    })
  }

  return rows.sort((a, b) => b.averageScore - a.averageScore)
}

// ── Write ─────────────────────────────────────────────

export interface SavePayload {
  zoneId:           string
  zoneName:         string
  inspectorName:    string
  employeeId:       string
  employeeName:     string
  score:            number
  status:           InspectionStatus
  sections:         SectionScore[]
  issues:           FormIssue[]
  notes:            string
  hasCriticalIssue: boolean
}

export async function saveInspection(payload: SavePayload): Promise<string> {
  const ts = Date.now()

  // Upload photos and convert FormIssue → Issue
  const resolvedIssues: Issue[] = await Promise.all(
    payload.issues.map(async issue => {
      let photoUrl = issue.photoUrl
      if (issue.photo) {
        const path    = `cleaning_photos/${ts}_${payload.zoneId}_${issue.itemId}.jpg`
        const storRef = ref(storage, path)
        await uploadBytes(storRef, issue.photo)
        photoUrl = await getDownloadURL(storRef)
      }
      return {
        itemId:      issue.itemId,
        description: issue.description,
        category:    issue.category,
        severity:    issue.severity,
        actionType:  issue.actionType,
        linkedWOId:  issue.linkedWOId,
        photoUrl,
      } satisfies Issue
    }),
  )

  const docData = {
    zoneId:           payload.zoneId,
    zoneName:         payload.zoneName,
    inspectorName:    payload.inspectorName,
    employeeId:       payload.employeeId,
    employeeName:     payload.employeeName,
    score:            payload.score,
    status:           payload.status,
    sections:         payload.sections,
    issues:           resolvedIssues,
    notes:            payload.notes,
    hasCriticalIssue: payload.hasCriticalIssue,
    timestampEnvio:   ts,
    dataCriacaoOficial: serverTimestamp(),
  }

  const docRef = await addDoc(collection(db, COL_NEW), docData)

  // Legacy compatibility write
  await addDoc(collection(db, COL_LEGACY), {
    ...docData,
    notaLimpeza:  payload.score / 10,
    statusVisual: payload.status,
    inspetor:     payload.inspectorName,
    funcionarioId: payload.employeeId,
    funcionario:  payload.employeeName,
    zonaId:       payload.zoneId,
    nomeZona:     payload.zoneName,
    observacoes:  payload.notes,
    legacyRef:    docRef.id,
  }).catch(() => { /* legacy write failing silently is acceptable */ })

  return docRef.id
}

export async function linkWorkOrderToInspection(inspectionId: string, woId: string): Promise<void> {
  await updateDoc(doc(db, COL_NEW, inspectionId), {
    linkedWorkOrders: arrayUnion(woId),
  })
}

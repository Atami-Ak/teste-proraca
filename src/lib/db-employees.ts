/**
 * db-employees.ts — Firestore CRUD for Employee Management System
 * Single source of truth for all employee data — Safety system reads from here.
 */

import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  Employee, EmployeeHistoryEvent, EmployeeEvaluation,
  EmployeeWarning, EmployeeRecognition, SupervisorNote,
  DepartmentMove,
} from '@/types/employee'
import { calcEvaluationScore, scoreToStatus } from '@/types/employee'

// ── Collection names ──────────────────────────────────────────
export const EMP_COLLECTIONS = {
  employees:   'employees',
  history:     'employee_history',
  evaluations: 'employee_evaluations',
  warnings:    'employee_warnings',
  recognitions:'employee_recognitions',
  notes:       'employee_supervisor_notes',
  deptHistory: 'employee_department_history',
  cache:       'employee_dashboard_cache',
} as const

// ── Helpers ───────────────────────────────────────────────────

function tsToDate(ts: unknown): Date | undefined {
  if (!ts) return undefined
  if (ts instanceof Date) return ts
  const t = ts as { toDate?: () => Date; seconds?: number }
  if (typeof t.toDate === 'function') return t.toDate()
  if (typeof t.seconds === 'number') return new Date(t.seconds * 1000)
  return undefined
}

function clean(v: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(v).filter(([, val]) => val !== undefined)
  )
}

// ── Hydrators ─────────────────────────────────────────────────

function hydrateEmployee(id: string, d: Record<string, unknown>): Employee {
  return {
    ...d,
    id,
    dataAdmissao:    tsToDate(d.dataAdmissao) ?? new Date(),
    dataDemissao:    tsToDate(d.dataDemissao),
    ultimaAvaliacao: tsToDate(d.ultimaAvaliacao),
    createdAt:       tsToDate(d.createdAt),
    updatedAt:       tsToDate(d.updatedAt),
  } as Employee
}

function hydrateEvent(id: string, d: Record<string, unknown>): EmployeeHistoryEvent {
  return {
    ...d,
    id,
    data:      tsToDate(d.data) ?? new Date(),
    createdAt: tsToDate(d.createdAt),
  } as EmployeeHistoryEvent
}

function hydrateEvaluation(id: string, d: Record<string, unknown>): EmployeeEvaluation {
  return {
    ...d,
    id,
    data:      tsToDate(d.data) ?? new Date(),
    createdAt: tsToDate(d.createdAt),
    updatedAt: tsToDate(d.updatedAt),
  } as EmployeeEvaluation
}

function hydrateWarning(id: string, d: Record<string, unknown>): EmployeeWarning {
  return { ...d, id, data: tsToDate(d.data) ?? new Date(), createdAt: tsToDate(d.createdAt) } as EmployeeWarning
}

function hydrateRecognition(id: string, d: Record<string, unknown>): EmployeeRecognition {
  return { ...d, id, data: tsToDate(d.data) ?? new Date(), createdAt: tsToDate(d.createdAt) } as EmployeeRecognition
}

function hydrateNote(id: string, d: Record<string, unknown>): SupervisorNote {
  return { ...d, id, data: tsToDate(d.data) ?? new Date(), createdAt: tsToDate(d.createdAt) } as SupervisorNote
}

// ═════════════════════════════════════════════════════════════
// EMPLOYEES — Master CRUD
// ═════════════════════════════════════════════════════════════

export async function getEmployees(onlyActive = false): Promise<Employee[]> {
  const col = collection(db, EMP_COLLECTIONS.employees)
  const q = onlyActive
    ? query(col, where('status', '==', 'ativo'), orderBy('nome', 'asc'))
    : query(col, orderBy('nome', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => hydrateEmployee(d.id, d.data() as Record<string, unknown>))
}

export async function getEmployee(id: string): Promise<Employee | null> {
  const snap = await getDoc(doc(db, EMP_COLLECTIONS.employees, id))
  if (!snap.exists()) return null
  return hydrateEmployee(snap.id, snap.data() as Record<string, unknown>)
}

export async function searchEmployees(term: string): Promise<Employee[]> {
  const all = await getEmployees(true)
  const q = term.toLowerCase()
  return all.filter(e =>
    e.nome.toLowerCase().includes(q) ||
    e.matricula.toLowerCase().includes(q) ||
    e.cargo.toLowerCase().includes(q) ||
    (e.codigoInterno ?? '').toLowerCase().includes(q)
  ).slice(0, 20)
}

export async function createEmployee(
  data: Omit<Employee, 'id' | 'scorePerformance' | 'statusPerformance' | 'totalAvisos' | 'totalReconhecimentos' | 'totalEvaluacoes' | 'totalIncidentesSeg' | 'totalDDSPresencas' | 'totalEpisAtivos' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, EMP_COLLECTIONS.employees), {
    ...clean(data as Record<string, unknown>),
    scorePerformance:    50,
    statusPerformance:   'bom',
    totalAvisos:         0,
    totalReconhecimentos:0,
    totalEvaluacoes:     0,
    totalIncidentesSeg:  0,
    totalDDSPresencas:   0,
    totalEpisAtivos:     0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  // Log admission event
  await addHistoryEvent({
    employeeId:    ref.id,
    tipo:          'admissao',
    titulo:        'Admissão',
    descricao:     `Colaborador admitido como ${data.cargo} no setor ${data.setor}.`,
    positivo:      true,
    registradoPor: 'Sistema',
    data:          data.dataAdmissao instanceof Date ? data.dataAdmissao : new Date(),
  })

  return ref.id
}

export async function updateEmployee(id: string, data: Partial<Employee>): Promise<void> {
  const { id: _id, createdAt: _c, ...rest } = data
  void _id; void _c
  await updateDoc(doc(db, EMP_COLLECTIONS.employees, id), {
    ...clean(rest as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  })
}

export async function deactivateEmployee(id: string, motivo: string, registradoPor: string): Promise<void> {
  await updateDoc(doc(db, EMP_COLLECTIONS.employees, id), {
    status: 'desligado',
    dataDemissao: new Date(),
    updatedAt: serverTimestamp(),
  })
  await addHistoryEvent({
    employeeId: id, tipo: 'desligamento',
    titulo: 'Desligamento', descricao: motivo,
    positivo: false, registradoPor, data: new Date(),
  })
}

// ═════════════════════════════════════════════════════════════
// HISTORY EVENTS
// ═════════════════════════════════════════════════════════════

export async function getEmployeeHistory(employeeId: string, maxItems = 100): Promise<EmployeeHistoryEvent[]> {
  const q = query(
    collection(db, EMP_COLLECTIONS.history),
    where('employeeId', '==', employeeId),
    orderBy('data', 'desc'),
    limit(maxItems),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => hydrateEvent(d.id, d.data() as Record<string, unknown>))
}

export async function addHistoryEvent(
  data: Omit<EmployeeHistoryEvent, 'id' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, EMP_COLLECTIONS.history), {
    ...clean(data as Record<string, unknown>),
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function deleteHistoryEvent(id: string): Promise<void> {
  await deleteDoc(doc(db, EMP_COLLECTIONS.history, id))
}

// ═════════════════════════════════════════════════════════════
// EVALUATIONS
// ═════════════════════════════════════════════════════════════

export async function getEmployeeEvaluations(employeeId: string): Promise<EmployeeEvaluation[]> {
  const q = query(
    collection(db, EMP_COLLECTIONS.evaluations),
    where('employeeId', '==', employeeId),
    orderBy('data', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => hydrateEvaluation(d.id, d.data() as Record<string, unknown>))
}

export async function createEvaluation(
  data: Omit<EmployeeEvaluation, 'id' | 'score' | 'status' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const score  = calcEvaluationScore(data.criterios)
  const status = scoreToStatus(score)

  const ref = await addDoc(collection(db, EMP_COLLECTIONS.evaluations), {
    ...clean(data as Record<string, unknown>),
    score,
    status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  // Update employee aggregate
  const emp = await getEmployee(data.employeeId)
  if (emp) {
    const newScore = Math.round((emp.scorePerformance * emp.totalEvaluacoes + score) / (emp.totalEvaluacoes + 1))
    await updateEmployee(data.employeeId, {
      scorePerformance:  newScore,
      statusPerformance: scoreToStatus(newScore),
      totalEvaluacoes:   emp.totalEvaluacoes + 1,
      ultimaAvaliacao:   data.data,
    })
  }

  // Log history event
  await addHistoryEvent({
    employeeId:    data.employeeId,
    tipo:          'avaliacao_performance',
    titulo:        `Avaliação de Desempenho — ${data.periodo}`,
    descricao:     `Score: ${score}/100 — ${scoreToStatus(score)}. ${data.comentarios ?? ''}`.trim(),
    positivo:      score >= 60,
    valor:         score,
    registradoPor: data.avaliadorNome,
    registradoPorId: data.avaliadorId,
    data:          data.data,
    referenceId:   ref.id,
    referenceType: 'evaluation',
  })

  return ref.id
}

// ═════════════════════════════════════════════════════════════
// WARNINGS
// ═════════════════════════════════════════════════════════════

export async function getEmployeeWarnings(employeeId: string): Promise<EmployeeWarning[]> {
  const q = query(
    collection(db, EMP_COLLECTIONS.warnings),
    where('employeeId', '==', employeeId),
    orderBy('data', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => hydrateWarning(d.id, d.data() as Record<string, unknown>))
}

export async function createWarning(data: Omit<EmployeeWarning, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, EMP_COLLECTIONS.warnings), {
    ...clean(data as Record<string, unknown>),
    createdAt: serverTimestamp(),
  })

  // Update aggregate
  const emp = await getEmployee(data.employeeId)
  if (emp) await updateEmployee(data.employeeId, { totalAvisos: emp.totalAvisos + 1 })

  // Log history
  await addHistoryEvent({
    employeeId: data.employeeId,
    tipo: data.tipo === 'verbal' ? 'aviso_verbal' : data.tipo === 'escrito' ? 'aviso_escrito' : data.tipo === 'suspensao' ? 'suspensao' : 'conduta',
    titulo: data.titulo,
    descricao: data.descricao,
    positivo: false,
    registradoPor: data.emissorNome,
    registradoPorId: data.emissorId,
    data: data.data,
    referenceId: ref.id,
    referenceType: 'warning',
  })

  return ref.id
}

export async function resolveWarning(id: string, resolucao: string): Promise<void> {
  await updateDoc(doc(db, EMP_COLLECTIONS.warnings, id), {
    resolvido: true, resolucao,
  })
}

// ═════════════════════════════════════════════════════════════
// RECOGNITIONS
// ═════════════════════════════════════════════════════════════

export async function getEmployeeRecognitions(employeeId: string): Promise<EmployeeRecognition[]> {
  const q = query(
    collection(db, EMP_COLLECTIONS.recognitions),
    where('employeeId', '==', employeeId),
    orderBy('data', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => hydrateRecognition(d.id, d.data() as Record<string, unknown>))
}

export async function createRecognition(data: Omit<EmployeeRecognition, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, EMP_COLLECTIONS.recognitions), {
    ...clean(data as Record<string, unknown>),
    createdAt: serverTimestamp(),
  })

  const emp = await getEmployee(data.employeeId)
  if (emp) await updateEmployee(data.employeeId, { totalReconhecimentos: emp.totalReconhecimentos + 1 })

  await addHistoryEvent({
    employeeId: data.employeeId,
    tipo: 'reconhecimento',
    titulo: data.titulo,
    descricao: data.descricao,
    positivo: true,
    registradoPor: data.emissorNome,
    registradoPorId: data.emissorId,
    data: data.data,
    referenceId: ref.id,
    referenceType: 'recognition',
  })

  return ref.id
}

// ═════════════════════════════════════════════════════════════
// SUPERVISOR NOTES
// ═════════════════════════════════════════════════════════════

export async function getSupervisorNotes(employeeId: string): Promise<SupervisorNote[]> {
  const q = query(
    collection(db, EMP_COLLECTIONS.notes),
    where('employeeId', '==', employeeId),
    orderBy('data', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => hydrateNote(d.id, d.data() as Record<string, unknown>))
}

export async function createSupervisorNote(data: Omit<SupervisorNote, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, EMP_COLLECTIONS.notes), {
    ...clean(data as Record<string, unknown>),
    createdAt: serverTimestamp(),
  })

  if (!data.confidencial) {
    await addHistoryEvent({
      employeeId: data.employeeId,
      tipo: 'nota_supervisor',
      titulo: `Observação — ${data.categoria}`,
      descricao: data.nota,
      positivo: data.positivo,
      registradoPor: data.supervisorNome,
      registradoPorId: data.supervisorId,
      data: data.data,
      referenceId: ref.id,
      referenceType: 'note',
    })
  }

  return ref.id
}

export async function deleteSupervisorNote(id: string): Promise<void> {
  await deleteDoc(doc(db, EMP_COLLECTIONS.notes, id))
}

// ═════════════════════════════════════════════════════════════
// DEPARTMENT HISTORY
// ═════════════════════════════════════════════════════════════

export async function getDepartmentHistory(employeeId: string): Promise<DepartmentMove[]> {
  const q = query(
    collection(db, EMP_COLLECTIONS.deptHistory),
    where('employeeId', '==', employeeId),
    orderBy('data', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({
    ...d.data(),
    id: d.id,
    data: tsToDate(d.data().data) ?? new Date(),
    createdAt: tsToDate(d.data().createdAt),
  }) as DepartmentMove)
}

export async function createDepartmentMove(data: Omit<DepartmentMove, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, EMP_COLLECTIONS.deptHistory), {
    ...clean(data as Record<string, unknown>),
    createdAt: serverTimestamp(),
  })

  // Update employee record
  await updateEmployee(data.employeeId, {
    setor: data.setorNovo as Employee['setor'],
    cargo: data.cargoNovo,
  })

  await addHistoryEvent({
    employeeId: data.employeeId,
    tipo: 'transferencia_setor',
    titulo: `Transferência: ${data.setorAnterior} → ${data.setorNovo}`,
    descricao: `Cargo: ${data.cargoAnterior} → ${data.cargoNovo}. Motivo: ${data.motivo}`,
    positivo: true,
    registradoPor: data.aprovadoPor,
    data: data.data,
    referenceId: ref.id,
    referenceType: 'dept_move',
  })

  return ref.id
}

// ═════════════════════════════════════════════════════════════
// DASHBOARD KPI
// ═════════════════════════════════════════════════════════════

export async function getEmployeeKPISnapshot() {
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [empSnap, warnSnap, reconhSnap] = await Promise.all([
    getDocs(collection(db, EMP_COLLECTIONS.employees)),
    getDocs(query(collection(db, EMP_COLLECTIONS.warnings), where('data', '>=', firstOfMonth))),
    getDocs(query(collection(db, EMP_COLLECTIONS.recognitions), where('data', '>=', firstOfMonth))),
  ])

  let totalAtivos = 0, totalInAtivos = 0, totalAfastados = 0, totalTerceirizados = 0
  let scoreSum = 0, excelentes = 0, criticos = 0, atencao = 0

  const allEmployees: Employee[] = []
  empSnap.forEach(d => {
    const e = hydrateEmployee(d.id, d.data() as Record<string, unknown>)
    allEmployees.push(e)
    if (e.status === 'ativo') totalAtivos++
    else if (e.status === 'inativo' || e.status === 'desligado') totalInAtivos++
    else if (e.status === 'afastado') totalAfastados++
    if (e.tipoVinculo === 'terceirizado') totalTerceirizados++
    scoreSum += e.scorePerformance
    if (e.statusPerformance === 'excelente' || e.statusPerformance === 'muito_bom') excelentes++
    if (e.statusPerformance === 'critico') criticos++
    if (e.statusPerformance === 'atencao') atencao++
  })

  const avgScore = allEmployees.length > 0 ? Math.round(scoreSum / allEmployees.length) : 0

  const sorted = [...allEmployees].sort((a, b) => b.scorePerformance - a.scorePerformance)
  const topPerformers = sorted.slice(0, 5).map(e => ({ id: e.id, nome: e.nome, score: e.scorePerformance, cargo: e.cargo }))
  const criticalList  = sorted.slice().reverse().filter(e => e.statusPerformance === 'critico' || e.statusPerformance === 'atencao').slice(0, 5).map(e => ({ id: e.id, nome: e.nome, score: e.scorePerformance, cargo: e.cargo }))

  return {
    totalAtivos, totalInAtivos, totalAfastados, totalTerceirizados,
    avgScore, excelentes, criticos, atencao,
    totalAvisosNoMes:  warnSnap.size,
    totalReconhNoMes:  reconhSnap.size,
    topPerformers, criticalList,
  }
}

// ── Safety integration helpers ────────────────────────────────

export async function incrementSafetyCounter(
  employeeId: string,
  field: 'totalIncidentesSeg' | 'totalDDSPresencas' | 'totalEpisAtivos',
  delta = 1
): Promise<void> {
  const emp = await getEmployee(employeeId)
  if (!emp) return
  await updateEmployee(employeeId, { [field]: emp[field] + delta } as Partial<Employee>)
}

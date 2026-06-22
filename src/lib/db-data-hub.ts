// db-data-hub.ts — Motor Central de Inteligência Operacional
//
// Agrega dados de todos os módulos, computa health scores,
// gera alertas cross-module e recomendações prescritivas.
//
// Cache 3 camadas:
//   1. Memória (por sessão, 30 min TTL)
//   2. Firestore doc 'data_hub_snapshots/latest' (cross-user)
//   3. Recomputa se stale — cliente inicia, todos lêem

import {
  collection, getDocs, query, where,
  doc, setDoc, getDoc, serverTimestamp, Timestamp,
  type QueryDocumentSnapshot, type DocumentData,
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  DataHubSnapshot, HubKpis, HubAlert, HubRecommendation,
  ModuleScore, GlobalHealthScores, ModuleKey,
} from '@/types/data-hub'
import { scoreToHealth, MODULE_META } from '@/types/data-hub'

// ── Helpers internos de tipo ──────────────────────────────

type QDoc = QueryDocumentSnapshot<DocumentData>
type FallbackSnap = { docs: QDoc[] }
const EMPTY: FallbackSnap = { docs: [] }

// ── Constantes ────────────────────────────────────────────

const COL_SNAPSHOT = 'data_hub_snapshots'
const SNAPSHOT_ID  = 'latest'
const CACHE_TTL_MS = 30 * 60 * 1000
const HUB_VERSION  = 1

// ── Cache em memória (por sessão) ─────────────────────────

let _memCache:  DataHubSnapshot | null = null
let _memCacheAt = 0
let _computing  = false

// ── API Pública ────────────────────────────────────────────

export async function getDataHubSnapshot(forceRefresh = false): Promise<DataHubSnapshot> {
  if (!forceRefresh && _memCache && Date.now() - _memCacheAt < CACHE_TTL_MS) {
    return _memCache
  }

  if (!forceRefresh) {
    const cached = await readSnapshot()
    if (cached && isSnapshotFresh(cached)) {
      _memCache   = cached
      _memCacheAt = Date.now()
      return cached
    }
  }

  if (_computing) {
    await new Promise<void>(resolve => {
      const check = setInterval(() => { if (!_computing) { clearInterval(check); resolve() } }, 200)
    })
    if (_memCache) return _memCache
  }

  _computing = true
  try {
    const snapshot = await computeSnapshot()
    await writeSnapshot(snapshot).catch(() => {/* permissão insuficiente — silencioso */})
    _memCache   = snapshot
    _memCacheAt = Date.now()
    return snapshot
  } finally {
    _computing = false
  }
}

export function invalidateDataHub(): void {
  _memCache   = null
  _memCacheAt = 0
}

export async function readSnapshot(): Promise<DataHubSnapshot | null> {
  try {
    const snap = await getDoc(doc(db, COL_SNAPSHOT, SNAPSHOT_ID))
    if (!snap.exists()) return null
    return hydrateSnapshot(snap.data() as Record<string, unknown>)
  } catch {
    return null
  }
}

// ── Hidratação ────────────────────────────────────────────

function tsToDate(v: unknown): Date {
  if (!v) return new Date()
  const t = v as { toDate?: () => Date; seconds?: number }
  if (typeof t.toDate === 'function') return t.toDate()
  if (typeof t.seconds === 'number') return new Date(t.seconds * 1000)
  return new Date()
}

function hydrateSnapshot(data: Record<string, unknown>): DataHubSnapshot {
  return {
    ...data,
    generatedAt: tsToDate(data.generatedAt),
    alerts: ((data.alerts as unknown[]) ?? []).map(a => {
      const alert = a as Record<string, unknown>
      return { ...alert, createdAt: tsToDate(alert.createdAt) } as HubAlert
    }),
  } as DataHubSnapshot
}

// ── Escrita ────────────────────────────────────────────────

async function writeSnapshot(snap: DataHubSnapshot): Promise<void> {
  await setDoc(doc(db, COL_SNAPSHOT, SNAPSHOT_ID), {
    ...snap,
    generatedAt: serverTimestamp(),
    alerts: snap.alerts.map(a => ({
      ...a,
      createdAt: Timestamp.fromDate(a.createdAt instanceof Date ? a.createdAt : new Date()),
    })),
  })
}

function isSnapshotFresh(snap: DataHubSnapshot): boolean {
  if (!snap.generatedAt) return false
  return Date.now() - snap.generatedAt.getTime() < (snap.ttlMinutes ?? 30) * 60_000
}

// ── Computação principal ──────────────────────────────────

async function computeSnapshot(): Promise<DataHubSnapshot> {
  const startMs = Date.now()
  const [kpis, moduleScores, alerts, recommendations] = await Promise.all([
    computeKpis(),
    computeAllModuleScores(),
    generateAlerts(),
    generateRecommendations(),
  ])
  const globalScore = computeGlobalScore(moduleScores)
  return {
    generatedAt:  new Date(),
    generatedBy:  'client',
    version:      HUB_VERSION,
    ttlMinutes:   30,
    healthScores: { global: globalScore, ...moduleScores },
    kpis,
    alerts,
    recommendations,
    collectionsRead: [
      'work_orders', 'purchase_orders', 'employees',
      'safety_occurrences', 'employee_epi', 'safety_dds',
      'cleaning_inspections', 'obras', 'asset_maintenance',
    ],
    computationMs: Date.now() - startMs,
  }
}

// ── KPIs consolidados ─────────────────────────────────────

async function computeKpis(): Promise<HubKpis> {
  const now    = new Date()
  const d30ago = new Date(now.getTime() - 30 * 86_400_000)
  const d7ago  = new Date(now.getTime() -  7 * 86_400_000)

  const [woSnap, poSnap, empSnap, occSnap, epiSnap, ddsSnap, ddiSnap, cleanSnap, obrasSnap, maintSnap] = await Promise.all([
    getDocs(collection(db, 'work_orders')).catch(() => EMPTY),
    getDocs(collection(db, 'purchase_orders')).catch(() => EMPTY),
    getDocs(query(collection(db, 'employees'), where('status', '==', 'ativo'))).catch(() => EMPTY),
    getDocs(query(collection(db, 'safety_occurrences'), where('status', '==', 'aberta'))).catch(() => EMPTY),
    getDocs(collection(db, 'employee_epi')).catch(() => EMPTY),
    getDocs(collection(db, 'safety_dds')).catch(() => EMPTY),
    getDocs(collection(db, 'safety_ddi')).catch(() => EMPTY),
    getDocs(collection(db, 'cleaning_inspections')).catch(() => EMPTY),
    getDocs(collection(db, 'obras')).catch(() => EMPTY),
    getDocs(collection(db, 'asset_maintenance')).catch(() => EMPTY),
  ])

  // OS
  const osAtivas   = woSnap.docs.filter((d: QDoc) => !isTerminalStatus(d.data().status as string))
  const osCriticas = osAtivas.filter((d: QDoc) => isCriticalPriority(d.data().priority as string)).length
  const osConcluidasUltimos7d = woSnap.docs.filter((d: QDoc) => {
    const data = d.data()
    return isTerminalStatus(data.status as string) && tsToDate(data.updatedAt) >= d7ago
  }).length

  // Compras
  const pcAtivas      = poSnap.docs.filter((d: QDoc) => !isTerminalStatus(d.data().status as string))
  const pcPendentes   = pcAtivas.length
  const pcUrgentes    = pcAtivas.filter((d: QDoc) => isCriticalPriority(d.data().priority as string)).length
  const pcValorPendente = pcAtivas.reduce((sum: number, d: QDoc) => sum + ((d.data().totalValue as number) ?? 0), 0)

  // Colaboradores
  let colaboradoresCriticos = 0, certVencidas = 0, certAVencer = 0, bancoHorasAlerta = 0
  empSnap.docs.forEach((d: QDoc) => {
    const e = d.data()
    if (((e.scorePerformance as number) ?? 100) < 40) colaboradoresCriticos++
    certVencidas    += (e.totalCertificacoesVencidas as number) ?? 0
    certAVencer     += (e.totalCertificacoesAVencer  as number) ?? 0
    if (((e.saldoBancoHoras as number) ?? 0) < 0) bancoHorasAlerta++
  })

  // Segurança — EPIs vencidos
  let epiVencidos = 0
  epiSnap.docs.forEach((d: QDoc) => {
    ((d.data().epis as unknown[]) ?? []).forEach(e => {
      const ep = e as Record<string, unknown>
      if (tsToDate(ep.dataValidade) < now) epiVencidos++
    })
  })
  const ddsUltimos30d = ddsSnap.docs.filter((d: QDoc) => tsToDate(d.data().data) >= d30ago).length
  const ddiUltimos30d = ddiSnap.docs.filter((d: QDoc) => tsToDate(d.data().data) >= d30ago).length

  // Limpeza
  const cleanDocs = cleanSnap.docs
  const scoreMediaLimpeza = cleanDocs.length > 0
    ? Math.round(cleanDocs.reduce((s: number, d: QDoc) => s + ((d.data().totalScore as number) ?? 0), 0) / cleanDocs.length)
    : 0
  const zonasCriticas = cleanDocs.filter((d: QDoc) => ((d.data().totalScore as number) ?? 100) < 60).length

  // Obras
  const obrasAtivas    = obrasSnap.docs.filter((d: QDoc) => d.data().status === 'em_andamento').length
  const obrasAtrasadas = obrasSnap.docs.filter((d: QDoc) =>
    d.data().status === 'em_andamento' && tsToDate(d.data().dataFim) < now
  ).length

  // Maquinário
  const maquinasEmManutencao = maintSnap.docs.filter((d: QDoc) => d.data().status === 'andamento').length
  const manutencoesAtrasadas = maintSnap.docs.filter((d: QDoc) =>
    d.data().status !== 'concluida' && tsToDate(d.data().scheduledDate) < now
  ).length
  const maquinasCriticas = maintSnap.docs.filter((d: QDoc) => isCriticalPriority(d.data().priority as string)).length

  return {
    osAbertas: osAtivas.length, osCriticas, osAtrasadas: 0, osConcluidasUltimos7d,
    pcPendentes, pcUrgentes, pcValorPendente,
    incidentesAbertos: occSnap.docs.length, incidentesUltimos30d: occSnap.docs.length,
    epiVencidos, ddsUltimos30d, ddiUltimos30d,
    colaboradoresAtivos: empSnap.docs.length, colaboradoresCriticos,
    certVencidas, certAVencer, bancoHorasAlerta,
    zonasCriticas, scoreMediaLimpeza,
    obrasAtivas, obrasAtrasadas, empreiteirasCriticas: 0,
    maquinasEmManutencao, maquinasCriticas, manutencoesAtrasadas,
    aprovacoesPendentes: pcPendentes,
  }
}

// ── Scores por Módulo ─────────────────────────────────────

type Trend = 'rising' | 'stable' | 'falling'

async function computeAllModuleScores(): Promise<Omit<GlobalHealthScores, 'global'>> {
  const [os, compras, seguranca, colaboradores, limpeza, obras, maquinario, aprovacoes] = await Promise.all([
    scoreOS(), scoreCompras(), scoreSeguranca(), scoreColaboradores(),
    scoreLimpeza(), scoreObras(), scoreMaquinario(), scoreAprovacoes(),
  ])
  return { os, compras, seguranca, colaboradores, limpeza, obras, maquinario, aprovacoes }
}

function makeScore(rawScore: number, trend: Trend, metrics: Record<string, number>): ModuleScore {
  const score  = clamp(Math.round(rawScore), 0, 100)
  const status = scoreToHealth(score)
  const labels: Record<typeof status, string> = {
    excellent: 'Operação saudável',
    good:      'Bom desempenho',
    attention: 'Requer atenção',
    critical:  'Situação crítica',
  }
  return { score, status, trend, label: labels[status], metrics }
}

async function scoreOS(): Promise<ModuleScore> {
  const snap   = await getDocs(collection(db, 'work_orders')).catch(() => EMPTY)
  const active = snap.docs.filter((d: QDoc) => !isTerminalStatus(d.data().status as string))
  const criticas = active.filter((d: QDoc) => isCriticalPriority(d.data().priority as string)).length
  let score = 100 - Math.min(40, active.length * 2) - criticas * 15
  const trend: Trend = active.length > 15 ? 'falling' : active.length < 5 ? 'rising' : 'stable'
  return makeScore(score, trend, { osAbertas: active.length, osCriticas: criticas })
}

async function scoreCompras(): Promise<ModuleScore> {
  const snap   = await getDocs(collection(db, 'purchase_orders')).catch(() => EMPTY)
  const active = snap.docs.filter((d: QDoc) => !isTerminalStatus(d.data().status as string))
  const urgentes = active.filter((d: QDoc) => isCriticalPriority(d.data().priority as string)).length
  let score = 100 - Math.min(30, active.length * 3) - urgentes * 15
  return makeScore(score, active.length > 10 ? 'falling' : 'stable', { pcPendentes: active.length, pcUrgentes: urgentes })
}

async function scoreSeguranca(): Promise<ModuleScore> {
  const now    = new Date()
  const d30ago = new Date(now.getTime() - 30 * 86_400_000)
  const [occ, epiSnap, dds] = await Promise.all([
    getDocs(query(collection(db, 'safety_occurrences'), where('status', '==', 'aberta'))).catch(() => EMPTY),
    getDocs(collection(db, 'employee_epi')).catch(() => EMPTY),
    getDocs(collection(db, 'safety_dds')).catch(() => EMPTY),
  ])
  let epiVencidos = 0
  epiSnap.docs.forEach((d: QDoc) => {
    ((d.data().epis as unknown[]) ?? []).forEach(e => {
      const ep = e as Record<string, unknown>
      if (tsToDate(ep.dataValidade) < now) epiVencidos++
    })
  })
  const dds30d = dds.docs.filter((d: QDoc) => tsToDate(d.data().data) >= d30ago).length
  let score = 100 - occ.docs.length * 12 - epiVencidos * 5 + Math.min(10, dds30d * 0.5)
  const trend: Trend = occ.docs.length > 2 ? 'falling' : occ.docs.length === 0 ? 'rising' : 'stable'
  return makeScore(score, trend, { incidentesAbertos: occ.docs.length, epiVencidos, dds30d })
}

async function scoreColaboradores(): Promise<ModuleScore> {
  const snap = await getDocs(query(collection(db, 'employees'), where('status', '==', 'ativo'))).catch(() => EMPTY)
  if (snap.docs.length === 0) return makeScore(70, 'stable', {})
  let scoreSum = 0, criticos = 0, certVencidas = 0
  snap.docs.forEach((d: QDoc) => {
    const e    = d.data()
    const perf = (e.scorePerformance as number) ?? 70
    scoreSum  += perf
    if (perf < 40) criticos++
    certVencidas += (e.totalCertificacoesVencidas as number) ?? 0
  })
  const mediaPerf = scoreSum / snap.docs.length
  const score     = mediaPerf - criticos * 5 - certVencidas * 2
  const trend: Trend = criticos > 3 ? 'falling' : mediaPerf > 80 ? 'rising' : 'stable'
  return makeScore(score, trend, { mediaPerformance: Math.round(mediaPerf), criticos, certVencidas })
}

async function scoreLimpeza(): Promise<ModuleScore> {
  const snap = await getDocs(collection(db, 'cleaning_inspections')).catch(() => EMPTY)
  if (snap.docs.length === 0) return makeScore(70, 'stable', {})
  const scores    = snap.docs.map((d: QDoc) => (d.data().totalScore as number) ?? 0)
  const media     = scores.reduce((a: number, b: number) => a + b, 0) / scores.length
  const zonasCrit = scores.filter((sc: number) => sc < 60).length
  return makeScore(media - zonasCrit * 8, zonasCrit > 2 ? 'falling' : 'stable', { scoreMedia: Math.round(media), zonasCriticas: zonasCrit })
}

async function scoreObras(): Promise<ModuleScore> {
  const now  = new Date()
  const snap = await getDocs(query(collection(db, 'obras'), where('status', '==', 'em_andamento'))).catch(() => EMPTY)
  if (snap.docs.length === 0) return makeScore(90, 'stable', {})
  const atrasadas = snap.docs.filter((d: QDoc) => tsToDate(d.data().dataFim) < now).length
  return makeScore(100 - atrasadas * 18, atrasadas > 0 ? 'falling' : 'stable', {
    obrasAtivas: snap.docs.length, obrasAtrasadas: atrasadas,
  })
}

async function scoreMaquinario(): Promise<ModuleScore> {
  const now  = new Date()
  const snap = await getDocs(collection(db, 'asset_maintenance')).catch(() => EMPTY)
  const pendentes  = snap.docs.filter((d: QDoc) => d.data().status === 'pendente')
  const atrasadas  = pendentes.filter((d: QDoc) => tsToDate(d.data().scheduledDate) < now).length
  const criticas   = pendentes.filter((d: QDoc) => isCriticalPriority(d.data().priority as string)).length
  return makeScore(100 - atrasadas * 10 - criticas * 15, atrasadas > 3 ? 'falling' : 'stable', {
    manutencoesAtrasadas: atrasadas, maquinasCriticas: criticas,
  })
}

async function scoreAprovacoes(): Promise<ModuleScore> {
  const snap = await getDocs(collection(db, 'purchase_orders')).catch(() => EMPTY)
  const pendentes = snap.docs.filter((d: QDoc) =>
    ['pending', 'draft', 'cotacao', 'aguardando_aprovacao', 'rascunho'].includes(d.data().status as string)
  ).length
  return makeScore(Math.max(0, 100 - pendentes * 8), pendentes > 8 ? 'falling' : 'stable', { aprovacoesPendentes: pendentes })
}

function computeGlobalScore(modules: Omit<GlobalHealthScores, 'global'>): ModuleScore {
  const keys = Object.keys(modules) as ModuleKey[]
  let total = 0
  keys.forEach(k => { total += modules[k].score * (MODULE_META[k]?.weight ?? 0.05) })
  const minScore = Math.min(...keys.map(k => modules[k].score))
  const trend: Trend = minScore < 45 ? 'falling' : total > 82 ? 'rising' : 'stable'
  return makeScore(total, trend, { minModuleScore: minScore })
}

// ── Geração de Alertas Cross-Module ──────────────────────

async function generateAlerts(): Promise<HubAlert[]> {
  const alerts: HubAlert[] = []
  const now = new Date()
  let seq = 0
  const id = (prefix: string) => `${prefix}_${now.getTime()}_${++seq}`

  const [woSnap, occSnap, poSnap, empSnap, epiSnap, obrasSnap, maintSnap] = await Promise.all([
    getDocs(collection(db, 'work_orders')).catch(() => EMPTY),
    getDocs(query(collection(db, 'safety_occurrences'), where('status', '==', 'aberta'))).catch(() => EMPTY),
    getDocs(collection(db, 'purchase_orders')).catch(() => EMPTY),
    getDocs(query(collection(db, 'employees'), where('status', '==', 'ativo'))).catch(() => EMPTY),
    getDocs(collection(db, 'employee_epi')).catch(() => EMPTY),
    getDocs(query(collection(db, 'obras'), where('status', '==', 'em_andamento'))).catch(() => EMPTY),
    getDocs(collection(db, 'asset_maintenance')).catch(() => EMPTY),
  ])

  // OS críticas
  const osCrit = woSnap.docs.filter((d: QDoc) =>
    !isTerminalStatus(d.data().status as string) && isCriticalPriority(d.data().priority as string)
  )
  if (osCrit.length > 0) alerts.push({
    id: id('os_crit'), severity: 'critical', module: 'os',
    title: `${osCrit.length} O.S. crítica${osCrit.length > 1 ? 's' : ''} em aberto`,
    description: 'Ordens de serviço com prioridade crítica aguardando ação imediata.',
    actionPath: '/os', actionLabel: 'Ver O.S.', createdAt: now,
  })

  // Incidentes de segurança
  if (occSnap.docs.length > 0) alerts.push({
    id: id('seg_occ'), severity: 'critical', module: 'seguranca',
    title: `${occSnap.docs.length} ocorrência${occSnap.docs.length > 1 ? 's' : ''} de segurança abertas`,
    description: 'Incidentes de segurança do trabalho aguardando investigação e tratamento.',
    actionPath: '/seguranca/ocorrencias', actionLabel: 'Ver Ocorrências', createdAt: now,
  })

  // Compras urgentes
  const pcUrg = poSnap.docs.filter((d: QDoc) =>
    ['pending', 'draft', 'cotacao', 'aguardando_aprovacao', 'rascunho'].includes(d.data().status as string) &&
    isCriticalPriority(d.data().priority as string)
  )
  if (pcUrg.length > 0) alerts.push({
    id: id('pc_urg'), severity: 'urgent', module: 'compras',
    title: `${pcUrg.length} compra${pcUrg.length > 1 ? 's' : ''} urgente${pcUrg.length > 1 ? 's' : ''} pendente${pcUrg.length > 1 ? 's' : ''}`,
    description: 'Pedidos de compra críticos aguardando aprovação urgente.',
    actionPath: '/dashboard/aprovacoes', actionLabel: 'Aprovar Agora', createdAt: now,
  })

  // Colaboradores críticos
  const empCrit = empSnap.docs.filter((d: QDoc) => ((d.data().scorePerformance as number) ?? 100) < 40)
  if (empCrit.length > 0) alerts.push({
    id: id('emp_crit'), severity: 'urgent', module: 'colaboradores',
    title: `${empCrit.length} colaborador${empCrit.length > 1 ? 'es' : ''} com desempenho crítico`,
    description: 'Score abaixo de 40/100 — necessitam de plano de desenvolvimento imediato.',
    actionPath: '/dashboard/colaboradores', actionLabel: 'Ver Desempenho', createdAt: now,
  })

  // EPIs vencidos
  let epiVencidos = 0
  epiSnap.docs.forEach((d: QDoc) => {
    ((d.data().epis as unknown[]) ?? []).forEach(e => {
      const ep = e as Record<string, unknown>
      if (tsToDate(ep.dataValidade) < now) epiVencidos++
    })
  })
  if (epiVencidos > 0) alerts.push({
    id: id('epi_venc'), severity: 'attention', module: 'seguranca',
    title: `${epiVencidos} EPI${epiVencidos > 1 ? 's' : ''} vencido${epiVencidos > 1 ? 's' : ''}`,
    description: 'EPIs com validade vencida — risco legal e de segurança do colaborador.',
    actionPath: '/seguranca/epi', actionLabel: 'Ver EPIs', createdAt: now,
  })

  // Obras atrasadas
  const obrasAtr = obrasSnap.docs.filter((d: QDoc) => tsToDate(d.data().dataFim) < now)
  if (obrasAtr.length > 0) alerts.push({
    id: id('obras_atr'), severity: 'attention', module: 'obras',
    title: `${obrasAtr.length} obra${obrasAtr.length > 1 ? 's' : ''} com prazo vencido`,
    description: 'Obras em andamento que ultrapassaram a data prevista de conclusão.',
    actionPath: '/obras', actionLabel: 'Ver Obras', createdAt: now,
  })

  // Manutenções atrasadas
  const maintAtr = maintSnap.docs.filter((d: QDoc) =>
    d.data().status === 'pendente' && tsToDate(d.data().scheduledDate) < now
  )
  if (maintAtr.length > 0) alerts.push({
    id: id('maint_atr'), severity: 'attention', module: 'maquinario',
    title: `${maintAtr.length} manutenção${maintAtr.length > 1 ? 'ões' : ''} atrasada${maintAtr.length > 1 ? 's' : ''}`,
    description: 'Manutenções preventivas vencidas aumentam o risco de falha não programada.',
    actionPath: '/ativos/manutencao', actionLabel: 'Ver Manutenção', createdAt: now,
  })

  return alerts.sort((a, b) => {
    const order = { critical: 0, urgent: 1, attention: 2, info: 3 }
    return order[a.severity] - order[b.severity]
  })
}

// ── Recomendações Prescritivas ────────────────────────────

async function generateRecommendations(): Promise<HubRecommendation[]> {
  const recs: HubRecommendation[] = []
  const now = new Date()
  const d30ago = new Date(now.getTime() - 30 * 86_400_000)
  let seq = 0
  const id = (prefix: string) => `rec_${prefix}_${now.getTime()}_${++seq}`

  const [maintSnap, poSnap, empSnap, ddsSnap] = await Promise.all([
    getDocs(collection(db, 'asset_maintenance')).catch(() => EMPTY),
    getDocs(collection(db, 'purchase_orders')).catch(() => EMPTY),
    getDocs(query(collection(db, 'employees'), where('status', '==', 'ativo'))).catch(() => EMPTY),
    getDocs(collection(db, 'safety_dds')).catch(() => EMPTY),
  ])

  // Manutenções recorrentes
  const failuresByAsset: Record<string, number> = {}
  maintSnap.docs.forEach((d: QDoc) => {
    const assetId = d.data().assetId as string
    if (assetId) failuresByAsset[assetId] = (failuresByAsset[assetId] ?? 0) + 1
  })
  const highFailure = Object.values(failuresByAsset).filter(c => c >= 3).length
  if (highFailure > 0) recs.push({
    id: id('maint_recurrence'), priority: 'high', module: 'maquinario',
    title: `${highFailure} equipamento${highFailure > 1 ? 's' : ''} com manutenções recorrentes`,
    description: `${highFailure} ativo${highFailure > 1 ? 's' : ''} com 3+ manutenções. Avalie substituição ou revisão do programa preventivo.`,
    impact: 'Redução de downtime e custo de manutenção corretiva',
    estimatedValue: 35, estimatedUnit: '%',
    actionPath: '/ativos/manutencao', actionLabel: 'Ver Manutenção',
    confidence: 78, basis: `${highFailure} ativo(s) com ≥3 registros de manutenção`,
  })

  // Concentração de fornecedor
  const volumeBySupplier: Record<string, number> = {}
  let totalActive = 0
  poSnap.docs.forEach((d: QDoc) => {
    if (['cancelled', 'cancelada', 'arquivada', 'devolvida'].includes(d.data().status as string)) return
    const sid = d.data().supplierId as string
    if (sid) { volumeBySupplier[sid] = (volumeBySupplier[sid] ?? 0) + 1; totalActive++ }
  })
  if (totalActive > 5) {
    const maxVol = Math.max(...Object.values(volumeBySupplier))
    const pct    = maxVol / totalActive
    if (pct > 0.5) recs.push({
      id: id('supplier_conc'), priority: 'medium', module: 'compras',
      title: 'Alta concentração em único fornecedor',
      description: `${Math.round(pct * 100)}% das compras ativas em 1 fornecedor — risco de ruptura operacional.`,
      impact: 'Redução de risco de parada por falta de material',
      estimatedValue: 60, estimatedUnit: '%',
      actionPath: '/ativos/fornecedores', actionLabel: 'Ver Fornecedores',
      confidence: 85, basis: `Fornecedor dominante com ${Math.round(pct * 100)}% das compras`,
    })
  }

  // Certificações vencidas
  const comCertVencida = empSnap.docs.filter((d: QDoc) => ((d.data().totalCertificacoesVencidas as number) ?? 0) > 0).length
  if (comCertVencida > 0) recs.push({
    id: id('cert_expired'), priority: 'high', module: 'colaboradores',
    title: `${comCertVencida} colaborador${comCertVencida > 1 ? 'es' : ''} com certificações vencidas`,
    description: 'Certificações/NRs vencidas representam risco legal e de acidente. Reagende treinamentos urgentemente.',
    impact: 'Conformidade legal + redução de risco de acidente',
    actionPath: '/colaboradores/lista', actionLabel: 'Ver Colaboradores',
    confidence: 100, basis: 'Documentos com data de validade vencida no RH',
  })

  // Banco de horas negativo
  const empBH = empSnap.docs.filter((d: QDoc) => ((d.data().saldoBancoHoras as number) ?? 0) < -8)
  if (empBH.length > 0) recs.push({
    id: id('bh_negativo'), priority: 'medium', module: 'colaboradores',
    title: `${empBH.length} colaborador${empBH.length > 1 ? 'es' : ''} com banco de horas negativo`,
    description: `Saldo abaixo de -8h — regularize com compensação ou pagamento para evitar passivo trabalhista.`,
    impact: 'Prevenção de passivo trabalhista',
    actionPath: '/colaboradores/lista', actionLabel: 'Ver Colaboradores',
    confidence: 100, basis: 'Saldo de banco de horas negativo no módulo RH',
  })

  // DDS com baixa frequência
  const dds30d   = ddsSnap.docs.filter((d: QDoc) => tsToDate(d.data().data) >= d30ago).length
  const totalEmp = empSnap.docs.length
  if (totalEmp > 0 && dds30d < Math.ceil(totalEmp * 0.5)) recs.push({
    id: id('dds_low'), priority: 'medium', module: 'seguranca',
    title: 'Frequência de DDS abaixo do recomendado',
    description: `${dds30d} DDS em 30 dias para ${totalEmp} colaboradores. Meta: ≥1 DDS/semana.`,
    impact: 'Redução de incidentes e conformidade com NR-1',
    estimatedValue: 30, estimatedUnit: '%',
    actionPath: '/seguranca/dds/novo', actionLabel: 'Registrar DDS',
    confidence: 72, basis: `${dds30d} DDS em 30 dias para ${totalEmp} colaboradores`,
  })

  return recs
    .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - ({ high: 0, medium: 1, low: 2 }[b.priority])))
    .slice(0, 8)
}

// ── Utilitários ────────────────────────────────────────────

function isTerminalStatus(status: string): boolean {
  return ['completed', 'cancelled', 'concluida', 'cancelada', 'arquivada', 'recusada'].includes(status)
}

function isCriticalPriority(priority: string): boolean {
  return ['critical', 'bloqueante', 'critica'].includes(priority)
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

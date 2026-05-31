// src/lib/db-obras-analytics.ts
// Data layer for Works & Contractors Analytics module.
// Reads obras, empreiteiras, inspecoes_obra, avaliacoes_empreiteira.
// The obras and empreiteiras documents carry pre-computed aggregate fields.

import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { getPeriodRanges } from '@/types/dashboard'
import type { Period } from '@/types/dashboard'
import type {
  ObrasPeriod, ObrasAnalyticsData, ObraMetrics, EmpreiteiraMetrics,
  ObraStatus, StatusBreakdown, ObrasTrendPoint, ObrasAlert,
} from '@/types/obras-analytics'
import {
  obrasRiskFromScore,
  OBRA_STATUS_LABELS, OBRA_STATUS_COLORS,
} from '@/types/obras-analytics'

// ── Collections ───────────────────────────────────────────────

const C = {
  obras:        'obras',
  empreiteiras: 'empreiteiras',
  inspecoes:    'inspecoes_obra',
  avaliacoes:   'avaliacoes_empreiteira',
} as const

// ── Cache ─────────────────────────────────────────────────────

const CACHE_KEY = 'obras_analytics_v1'
const CACHE_TTL = 30 * 60 * 1000

interface CacheEntry { data: ObrasAnalyticsData; ts: number; period: string }

function readCache(period: string): ObrasAnalyticsData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const e = JSON.parse(raw) as CacheEntry
    if (e.period !== period || Date.now() - e.ts > CACHE_TTL) return null
    e.data.computedAt = new Date(e.data.computedAt)
    return e.data
  } catch { return null }
}

function writeCache(data: ObrasAnalyticsData, period: string): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now(), period } satisfies CacheEntry)) }
  catch { /* storage full */ }
}

export function clearObrasAnalyticsCache(): void {
  localStorage.removeItem(CACHE_KEY)
}

// ── Date helpers ──────────────────────────────────────────────

function resolveDate(val: unknown): Date | null {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val === 'object' && typeof (val as Record<string, unknown>)['toDate'] === 'function') {
    return (val as { toDate(): Date }).toDate()
  }
  return null
}

function toMonthKey(val: unknown): string {
  const d = resolveDate(val)
  if (!d) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  if (!key) return ''
  const [y, m] = key.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[Number(m) - 1]}/${String(y).slice(-2)}`
}

// ── Inline doc types ──────────────────────────────────────────

interface ObraDoc {
  id:                  string
  codigo:              string
  nome:                string
  empreiteiraId?:      string
  empreiteiraNome?:    string
  status:              string
  prioridade:          string
  local:               string
  tipo:                string
  percentualConcluido: number
  valorContrato?:      number
  valorPago?:          number
  dataInicio?:         unknown
  dataFimPrevisto?:    unknown
  dataFimReal?:        unknown
  notaMedia?:          number
  totalInspecoes?:     number
  alertasCriticos?:    number
  createdAt?:          unknown
}

interface EmpDoc {
  id:             string
  nome:           string
  cnpj?:          string
  especialidades: string[]
  status:         string
  ativo:          boolean
  scoreGlobal?:   number
  totalObras?:    number
  obrasAprovadas?:number
}

interface InspDoc {
  obraId:          string
  empreiteiraId?:  string
  dataInspecao:    unknown
  scoreGeral:      number
  alertasCriticos: Array<{ tipo: string }>
  status:          string
}

interface AvalDoc {
  empreiteiraId:    string
  obraId:           string
  scoreTotal:       number
  qualidade:        number
  seguranca:        number
  prazo:            number
  retrabalho:       number
  organizacao:      number
  custoBeneficio:   number
  profissionalismo: number
  resolucaoProblemas: number
  recomendacao:     string
  createdAt?:       unknown
}

// ── Risk models ───────────────────────────────────────────────

function computeObraRisk(
  isDelayed:       boolean,
  delayDays:       number,
  qualityScore:    number,    // 0–100
  alertasCriticos: number,
  totalInspecoes:  number,
): number {
  let r = 0
  if (isDelayed) r += Math.min(delayDays / 60, 1) * 0.40    // delay up to 60d = 40 pts
  r += (1 - Math.min(qualityScore, 100) / 100) * 0.35        // quality deficit = 35 pts
  r += Math.min(alertasCriticos / Math.max(totalInspecoes, 1), 1) * 0.25  // criticals = 25 pts
  return Math.min(Math.round(r * 100), 100)
}

function computeEmpreiteiraRisk(scoreGlobal: number): number {
  return Math.min(Math.max(100 - scoreGlobal, 0), 100)
}

// ── Main export ───────────────────────────────────────────────

export async function fetchObrasAnalytics(
  period: ObrasPeriod,
  force  = false,
): Promise<ObrasAnalyticsData> {
  if (!force) {
    const cached = readCache(period)
    if (cached) return cached
  }

  const { current } = getPeriodRanges(period as Period)
  const from = current.from

  // ── Parallel Firestore reads ────────────────────────────────
  // obras: fetch all (no date filter — small collection, pre-computed aggregates)
  const [obrasSnap, empSnap, inspSnap, avalSnap] = await Promise.all([
    getDocs(collection(db, C.obras)),
    getDocs(query(collection(db, C.empreiteiras), where('ativo', '==', true))),
    getDocs(query(collection(db, C.inspecoes),  where('dataInspecao', '>=', from))),
    getDocs(query(collection(db, C.avaliacoes), where('createdAt', '>=', from))),
  ])

  // ── Normalize ───────────────────────────────────────────────

  const obraRecords: ObraDoc[] = []
  obrasSnap.forEach(doc => {
    const d = doc.data()
    obraRecords.push({
      id:                  doc.id,
      codigo:              String(d['codigo'] ?? ''),
      nome:                String(d['nome'] ?? ''),
      empreiteiraId:       d['empreiteiraId'] ? String(d['empreiteiraId']) : undefined,
      empreiteiraNome:     d['empreiteiraNome'] ? String(d['empreiteiraNome']) : undefined,
      status:              String(d['status'] ?? 'planejamento'),
      prioridade:          String(d['prioridade'] ?? 'normal'),
      local:               String(d['local'] ?? ''),
      tipo:                String(d['tipo'] ?? ''),
      percentualConcluido: Number(d['percentualConcluido'] ?? 0),
      valorContrato:       d['valorContrato'] != null ? Number(d['valorContrato']) : undefined,
      valorPago:           d['valorPago']     != null ? Number(d['valorPago'])     : undefined,
      dataInicio:          d['dataInicio'],
      dataFimPrevisto:     d['dataFimPrevisto'],
      dataFimReal:         d['dataFimReal'],
      notaMedia:           d['notaMedia']          != null ? Number(d['notaMedia']) : undefined,
      totalInspecoes:      d['totalInspecoes']     != null ? Number(d['totalInspecoes']) : undefined,
      alertasCriticos:     d['alertasCriticos']    != null ? Number(d['alertasCriticos']) : undefined,
      createdAt:           d['createdAt'],
    })
  })

  const empRecords: EmpDoc[] = []
  empSnap.forEach(doc => {
    const d = doc.data()
    empRecords.push({
      id:             doc.id,
      nome:           String(d['nome'] ?? ''),
      cnpj:           d['cnpj'] ? String(d['cnpj']) : undefined,
      especialidades: Array.isArray(d['especialidades']) ? d['especialidades'].map(String) : [],
      status:         String(d['status'] ?? 'aprovada'),
      ativo:          Boolean(d['ativo'] ?? true),
      scoreGlobal:    d['scoreGlobal']    != null ? Number(d['scoreGlobal']) : undefined,
      totalObras:     d['totalObras']     != null ? Number(d['totalObras'])  : undefined,
      obrasAprovadas: d['obrasAprovadas'] != null ? Number(d['obrasAprovadas']) : undefined,
    })
  })

  const inspRecords: InspDoc[] = []
  inspSnap.forEach(doc => {
    const d = doc.data()
    if (d['status'] === 'rascunho') return
    inspRecords.push({
      obraId:          String(d['obraId'] ?? ''),
      empreiteiraId:   d['empreiteiraId'] ? String(d['empreiteiraId']) : undefined,
      dataInspecao:    d['dataInspecao'],
      scoreGeral:      Number(d['scoreGeral'] ?? 0),
      alertasCriticos: Array.isArray(d['alertasCriticos']) ? d['alertasCriticos'] as InspDoc['alertasCriticos'] : [],
      status:          String(d['status'] ?? 'submetida'),
    })
  })

  const avalRecords: AvalDoc[] = []
  avalSnap.forEach(doc => {
    const d = doc.data()
    avalRecords.push({
      empreiteiraId:    String(d['empreiteiraId'] ?? ''),
      obraId:           String(d['obraId'] ?? ''),
      scoreTotal:       Number(d['scoreTotal'] ?? 0),
      qualidade:        Number(d['qualidade'] ?? 0),
      seguranca:        Number(d['seguranca'] ?? 0),
      prazo:            Number(d['prazo'] ?? 0),
      retrabalho:       Number(d['retrabalho'] ?? 0),
      organizacao:      Number(d['organizacao'] ?? 0),
      custoBeneficio:   Number(d['custoBeneficio'] ?? 0),
      profissionalismo: Number(d['profissionalismo'] ?? 0),
      resolucaoProblemas: Number(d['resolucaoProblemas'] ?? 0),
      recomendacao:     String(d['recomendacao'] ?? 'nao'),
      createdAt:        d['createdAt'],
    })
  })

  // ── Obras metrics ────────────────────────────────────────────

  const today = new Date()

  const obras: ObraMetrics[] = obraRecords.map(obra => {
    const dataFimPrevisto = resolveDate(obra.dataFimPrevisto)
    const dataFimReal     = resolveDate(obra.dataFimReal)
    const dataInicio      = resolveDate(obra.dataInicio)

    const referenceDate = obra.status === 'concluida' && dataFimReal ? dataFimReal : today
    const delayDays = dataFimPrevisto
      ? Math.round((referenceDate.getTime() - dataFimPrevisto.getTime()) / 86_400_000)
      : 0
    const isDelayed = obra.status === 'em_andamento' && delayDays > 0

    const notaMedia      = obra.notaMedia       ?? 0
    const totalInspecoes = obra.totalInspecoes  ?? 0
    const alertasCrit    = obra.alertasCriticos ?? 0
    const qualityScore   = Math.round(notaMedia * 10)   // 0-10 → 0-100

    const valorContrato = obra.valorContrato ?? 0
    const valorPago     = obra.valorPago     ?? 0
    const costVariancePct = valorContrato > 0
      ? Math.round(((valorPago - valorContrato) / valorContrato) * 100)
      : 0

    const riskScore = computeObraRisk(isDelayed, delayDays, qualityScore, alertasCrit, totalInspecoes)
    const riskLevel = obrasRiskFromScore(riskScore)

    return {
      id: obra.id, codigo: obra.codigo, nome: obra.nome,
      empreiteiraId: obra.empreiteiraId,
      empreiteiraNome: obra.empreiteiraNome,
      status:             obra.status as ObraStatus,
      prioridade:         obra.prioridade,
      local:              obra.local,
      tipo:               obra.tipo,
      percentualConcluido: obra.percentualConcluido,
      valorContrato:      valorContrato || undefined,
      valorPago:          valorPago || undefined,
      costVariancePct,
      dataInicio:      dataInicio ?? undefined,
      dataFimPrevisto: dataFimPrevisto ?? undefined,
      dataFimReal:     dataFimReal ?? undefined,
      delayDays, isDelayed,
      notaMedia, totalInspecoes,
      alertasCriticos: alertasCrit,
      qualityScore,
      riskScore, riskLevel,
    }
  }).sort((a, b) => b.riskScore - a.riskScore)

  // ── Empreiteira metrics ──────────────────────────────────────

  // Map avaliacoes per empreiteira
  const avalByEmp = new Map<string, AvalDoc[]>()
  for (const av of avalRecords) {
    const arr = avalByEmp.get(av.empreiteiraId) ?? []
    arr.push(av)
    avalByEmp.set(av.empreiteiraId, arr)
  }

  // Map obras per empreiteira (all obras)
  const obrasByEmp = new Map<string, ObraDoc[]>()
  for (const obra of obraRecords) {
    if (!obra.empreiteiraId) continue
    const arr = obrasByEmp.get(obra.empreiteiraId) ?? []
    arr.push(obra)
    obrasByEmp.set(obra.empreiteiraId, arr)
  }

  const empreiteiras: EmpreiteiraMetrics[] = empRecords.map(emp => {
    const avals       = avalByEmp.get(emp.id) ?? []
    const empObras    = obrasByEmp.get(emp.id) ?? []

    const scoreGlobal    = emp.scoreGlobal    ?? 50
    const totalObras     = emp.totalObras     ?? 0
    const obrasAprovadas = emp.obrasAprovadas ?? 0
    const approvalRate   = totalObras > 0 ? Math.round((obrasAprovadas / totalObras) * 100) : 0

    const avgOf = (key: keyof AvalDoc) => avals.length > 0
      ? Math.round((avals.reduce((s, a) => s + Number(a[key] ?? 0), 0) / avals.length) * 10)
      : 0

    const obrasAtivas    = empObras.filter(o => o.status === 'em_andamento' || o.status === 'planejamento').length
    const obrasAtrasadas = empObras.filter(o => {
      if (o.status !== 'em_andamento') return false
      const fim = resolveDate(o.dataFimPrevisto)
      return fim ? fim.getTime() < today.getTime() : false
    }).length
    const delayRate = empObras.length > 0
      ? Math.round((obrasAtrasadas / empObras.length) * 100)
      : 0

    const riskScore = computeEmpreiteiraRisk(scoreGlobal)
    const riskLevel = obrasRiskFromScore(riskScore)

    return {
      id: emp.id, nome: emp.nome, cnpj: emp.cnpj,
      especialidades: emp.especialidades,
      status: emp.status as EmpreiteiraMetrics['status'],
      ativo: emp.ativo,
      scoreGlobal, totalObras, obrasAprovadas, approvalRate,
      avgQuality:        avgOf('qualidade'),
      avgPrazo:          avgOf('prazo'),
      avgSeguranca:      avgOf('seguranca'),
      avgCustoBeneficio: avgOf('custoBeneficio'),
      periodAvaliacoes:  avals.length,
      obrasAtivas, obrasAtrasadas, delayRate,
      riskScore, riskLevel,
    }
  }).sort((a, b) => b.scoreGlobal - a.scoreGlobal)

  // ── Global KPIs ─────────────────────────────────────────────

  const totalObras  = obras.length
  const emAndamento = obras.filter(o => o.status === 'em_andamento').length
  const concluidas  = obras.filter(o => o.status === 'concluida').length
  const paralisadas = obras.filter(o => o.status === 'paralisada').length
  const atrasadas   = obras.filter(o => o.isDelayed).length

  const qualityObras = obras.filter(o => o.notaMedia > 0)
  const avgQualityScore = qualityObras.length > 0
    ? Math.round(qualityObras.reduce((s, o) => s + o.qualityScore, 0) / qualityObras.length)
    : 0

  const obrasCom     = obras.filter(o => o.valorContrato)
  const totalContrato = obrasCom.reduce((s, o) => s + (o.valorContrato ?? 0), 0)
  const totalPago     = obrasCom.reduce((s, o) => s + (o.valorPago ?? 0), 0)
  const costVarianceTotal = totalPago - totalContrato

  const totalEmpreiteiras   = empreiteiras.length
  const avgEmpreiteiraScore = totalEmpreiteiras > 0
    ? Math.round(empreiteiras.reduce((s, e) => s + e.scoreGlobal, 0) / totalEmpreiteiras)
    : 0

  // ── Status distribution ──────────────────────────────────────

  const statusOrder: ObraStatus[] = ['em_andamento', 'planejamento', 'paralisada', 'concluida', 'cancelada']
  const statusCount  = new Map<string, number>()
  for (const o of obras) statusCount.set(o.status, (statusCount.get(o.status) ?? 0) + 1)

  const byStatus: StatusBreakdown[] = statusOrder
    .filter(s => (statusCount.get(s) ?? 0) > 0)
    .map(s => ({
      status: s,
      label:  OBRA_STATUS_LABELS[s],
      count:  statusCount.get(s) ?? 0,
      color:  OBRA_STATUS_COLORS[s],
    }))

  // ── Monthly quality trend ────────────────────────────────────

  const periodDays  = period === '30d' ? 30 : period === '90d' ? 90 : period === '6m' ? 180 : 365
  const monthSeeds  = new Map<string, { scores: number[]; alertas: number; count: number }>()
  for (let i = 0; i <= periodDays; i += 30) {
    const d   = new Date(from.getTime() + i * 86_400_000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!monthSeeds.has(key)) monthSeeds.set(key, { scores: [], alertas: 0, count: 0 })
  }

  for (const insp of inspRecords) {
    const key = toMonthKey(insp.dataInspecao)
    if (!key) continue
    const m = monthSeeds.get(key) ?? { scores: [], alertas: 0, count: 0 }
    m.scores.push(insp.scoreGeral)
    m.alertas += insp.alertasCriticos.filter(a => a.tipo === 'critico').length
    m.count++
    monthSeeds.set(key, m)
  }

  const monthlyTrend: ObrasTrendPoint[] = Array.from(monthSeeds.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, m]) => ({
      monthKey: key, label: monthLabel(key),
      avgQualityScore:  m.scores.length > 0
        ? Math.round(m.scores.reduce((s, v) => s + v, 0) / m.scores.length * 10) / 10
        : 0,
      inspecoesCount:  m.count,
      alertasCriticos: m.alertas,
    }))

  // ── Alerts ────────────────────────────────────────────────────

  const alerts: ObrasAlert[] = []

  const criticalObras = obras.filter(o => o.riskLevel === 'critico')
  if (criticalObras.length > 0) {
    alerts.push({
      type: 'low_quality', severity: 'critical',
      message: `${criticalObras.length} obra(s) com nível de risco CRÍTICO — intervenção necessária`,
      value: criticalObras.length,
    })
  }

  for (const o of obras.filter(o => o.isDelayed && o.delayDays > 30)) {
    alerts.push({
      type: 'delayed_obra', severity: o.delayDays > 60 ? 'critical' : 'warning',
      message: `"${o.nome}" — ${o.delayDays} dia(s) de atraso${o.empreiteiraNome ? ` (${o.empreiteiraNome})` : ''}`,
      obraId: o.id, obraNome: o.nome, value: o.delayDays,
    })
  }

  const blockedContractors = empreiteiras.filter(e => e.status === 'bloqueada')
  for (const e of blockedContractors) {
    alerts.push({
      type: 'blocked_contractor', severity: 'critical',
      message: `Empreiteira "${e.nome}" está BLOQUEADA${e.obrasAtivas > 0 ? ` — ${e.obrasAtivas} obra(s) ativa(s) vinculada(s)` : ''}`,
      empreiteiraId: e.id, empreiteiraNome: e.nome, value: e.obrasAtivas,
    })
  }

  const lowQualContractors = empreiteiras.filter(e => e.scoreGlobal > 0 && e.scoreGlobal < 55)
  if (lowQualContractors.length > 0) {
    alerts.push({
      type: 'critical_contractor', severity: 'warning',
      message: `${lowQualContractors.length} empreiteira(s) com score abaixo de 55 — reavaliação recomendada`,
      value: lowQualContractors.length,
    })
  }

  const costOverruns = obras.filter(o => o.costVariancePct > 15)
  if (costOverruns.length > 0) {
    alerts.push({
      type: 'cost_overrun', severity: 'warning',
      message: `${costOverruns.length} obra(s) com custo 15%+ acima do contrato`,
      value: costOverruns.length,
    })
  }

  const noInsp = obras.filter(o => o.status === 'em_andamento' && o.totalInspecoes === 0)
  if (noInsp.length > 0) {
    alerts.push({
      type: 'no_inspections', severity: 'warning',
      message: `${noInsp.length} obra(s) em andamento sem nenhuma inspeção registrada`,
      value: noInsp.length,
    })
  }

  alerts.sort((a, b) =>
    a.severity === 'critical' && b.severity !== 'critical' ? -1 :
    a.severity !== 'critical' && b.severity === 'critical' ? 1 : 0,
  )

  const result: ObrasAnalyticsData = {
    period, computedAt: new Date(),
    totalObras, emAndamento, concluidas, paralisadas, atrasadas, avgQualityScore,
    totalContrato, totalPago, costVarianceTotal,
    totalEmpreiteiras, avgEmpreiteiraScore,
    byStatus, obras, empreiteiras, monthlyTrend, alerts,
  }

  writeCache(result, period)
  return result
}

// ── EAM — Enterprise Asset Management — DB layer ─────────────────────────────
// Lifecycle, costs, KPI computation, health score

import {
  collection, addDoc, getDocs, updateDoc, doc,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db }             from './firebase'
import { updateAsset }    from './db'
import { addAssetEvent }  from './db-asset-history'
import type { Asset, MaintenanceRecord, MachineryAdditionalData } from '@/types'
import type {
  AssetLifecycleStatus, AssetKPIs, AssetHealthScore, AssetCost, AssetCostType,
  ReplacementPrediction,
} from '@/types/eam'

// ── Collections ───────────────────────────────────────────────────────────────

const COSTS_COLL = 'asset_costs'

// ── Lifecycle management ──────────────────────────────────────────────────────

export async function updateLifecycleStatus(
  assetId:      string,
  newStatus:    AssetLifecycleStatus,
  changedBy?:   string,
  reason?:      string,
): Promise<void> {
  await updateAsset(assetId, { lifecycleStatus: newStatus } as Partial<Asset>)
  await addAssetEvent({
    assetId,
    eventType:   'lifecycle_changed',
    title:       `Ciclo de vida atualizado → ${newStatus}`,
    description: reason?.trim() || undefined,
    newValue:    newStatus,
    performedBy: changedBy?.trim() || undefined,
  })
}

// ── Asset costs ───────────────────────────────────────────────────────────────

export async function addAssetCost(
  data: Omit<AssetCost, 'id' | 'createdAt'>,
): Promise<string> {
  const ref = await addDoc(collection(db, COSTS_COLL), {
    ...data,
    date:      data.date instanceof Date ? data.date : new Date(data.date),
    createdAt: serverTimestamp(),
  })

  await addAssetEvent({
    assetId:     data.assetId,
    eventType:   'cost_recorded',
    title:       `Custo registrado — ${data.description}`,
    description: `R$ ${data.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    performedBy: data.registeredBy || undefined,
  })

  return ref.id
}

export async function getAssetCosts(assetId: string): Promise<AssetCost[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, COSTS_COLL),
        where('assetId', '==', assetId),
        orderBy('date', 'desc'),
      ),
    )
    return snap.docs.map(d => {
      const data = d.data()
      const rawDate = data.date
      let date: Date = new Date()
      if (rawDate && typeof rawDate.toDate === 'function') date = rawDate.toDate()
      else if (rawDate instanceof Date) date = rawDate

      const rawCreatedAt = data.createdAt
      let createdAt: Date | undefined
      if (rawCreatedAt && typeof rawCreatedAt.toDate === 'function') createdAt = rawCreatedAt.toDate()

      return { id: d.id, ...data, date, createdAt } as AssetCost
    })
  } catch {
    return []
  }
}

export async function updateAssetCostRegistration(
  costId:    string,
  updates:   Partial<Pick<AssetCost, 'description' | 'value' | 'type' | 'date'>>,
): Promise<void> {
  await updateDoc(doc(db, COSTS_COLL, costId), updates)
}

// ── KPI computation (pure, no Firestore calls) ────────────────────────────────

export function computeAssetKPIs(
  asset:   Asset,
  records: MaintenanceRecord[],
): AssetKPIs {
  const failures = records.filter(r => r.type === 'corretiva')
  const totalFailures = failures.length

  // Downtime hours from MachineryAdditionalData.downtime
  let totalDowntime = 0
  for (const f of failures) {
    const extra = f.additionalData as MachineryAdditionalData | undefined
    if (extra?.downtime) totalDowntime += extra.downtime
  }

  const totalRepairCost = records.reduce((sum, r) => sum + (r.cost ?? 0), 0)

  // Age in years since acquisition (default 1 year if not set)
  const acquisitionMs = asset.acquisition
    ? new Date(asset.acquisition).getTime()
    : Date.now() - 365 * 24 * 60 * 60 * 1000
  const ageMs    = Math.max(0, Date.now() - acquisitionMs)
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000)
  // Assume 8h/day operational time
  const ageHours = ageYears * 365 * 8

  const mtbf = totalFailures > 0 ? ageHours / totalFailures : ageHours
  const mttr = totalFailures > 0 ? totalDowntime / totalFailures : 0
  const availability = ageHours > 0
    ? Math.max(0, Math.min(100, ((ageHours - totalDowntime) / ageHours) * 100))
    : 100

  return {
    totalFailures,
    totalDowntime:   Math.round(totalDowntime * 10) / 10,
    totalRepairCost: Math.round(totalRepairCost * 100) / 100,
    mtbf:            Math.round(mtbf),
    mttr:            Math.round(mttr * 10) / 10,
    availability:    Math.round(availability * 10) / 10,
    ageYears:        Math.round(ageYears * 10) / 10,
  }
}

// ── Health score computation (pure) ──────────────────────────────────────────
// Score 0-100 from four pillars totalling 100 points:
//   availability  (0-30)
//   maintenance quality  (0-25)
//   failure rate  (0-25)
//   asset age     (0-20)

export function computeAssetHealthScore(
  kpis:    AssetKPIs,
  records: MaintenanceRecord[],
): AssetHealthScore {
  // Pillar 1: Availability (0-30)
  const availScore =
    kpis.availability >= 97 ? 30 :
    kpis.availability >= 93 ? 25 :
    kpis.availability >= 85 ? 18 :
    kpis.availability >= 70 ? 10 : 4

  // Pillar 2: Maintenance quality — ratio of preventive+inspection vs total (0-25)
  const total      = records.length
  const proactive  = records.filter(r => r.type === 'preventiva' || r.type === 'inspecao').length
  const ratio      = total === 0 ? 1 : proactive / total
  const maintScore =
    ratio >= 0.75 ? 25 :
    ratio >= 0.55 ? 20 :
    ratio >= 0.35 ? 13 :
    ratio >= 0.15 ? 7  : 3

  // Pillar 3: Failure frequency — MTBF relative to ideal (0-25)
  let failureScore: number
  if (kpis.totalFailures === 0) {
    failureScore = 25
  } else {
    failureScore =
      kpis.mtbf >= 5000 ? 25 :
      kpis.mtbf >= 2000 ? 20 :
      kpis.mtbf >= 1000 ? 13 :
      kpis.mtbf >= 500  ? 7  : 3
  }

  // Pillar 4: Asset age — newer is healthier (0-20)
  const ageScore =
    kpis.ageYears <= 2  ? 20 :
    kpis.ageYears <= 5  ? 16 :
    kpis.ageYears <= 10 ? 10 : 5

  const score = Math.min(100, availScore + maintScore + failureScore + ageScore)

  const label =
    score >= 85 ? 'Excelente' :
    score >= 70 ? 'Bom'       :
    score >= 50 ? 'Atenção'   : 'Crítico'

  const color =
    score >= 85 ? '#16a34a' :
    score >= 70 ? '#3b82f6' :
    score >= 50 ? '#f59e0b' : '#dc2626'

  const bg =
    score >= 85 ? 'rgba(22,163,74,0.1)' :
    score >= 70 ? 'rgba(59,130,246,0.1)' :
    score >= 50 ? 'rgba(245,158,11,0.1)' : 'rgba(220,38,38,0.1)'

  return {
    score,
    label,
    color,
    bg,
    breakdown: {
      availability: availScore,
      maintenance:  maintScore,
      failures:     failureScore,
      age:          ageScore,
    },
  }
}

// ── Cost type options for dropdowns ──────────────────────────────────────────

export const COST_TYPE_OPTIONS: Array<{ value: AssetCostType; label: string }> = [
  { value: 'aquisicao',       label: 'Aquisição'        },
  { value: 'manutencao',      label: 'Manutenção'       },
  { value: 'reparo',          label: 'Reparo'           },
  { value: 'peca',            label: 'Peça/Componente'  },
  { value: 'servico_externo', label: 'Serviço Externo'  },
  { value: 'parada_producao', label: 'Parada Produção'  },
  { value: 'outros',          label: 'Outros'           },
]

// ── Previsão de substituição (pura, sem Firestore) ────────────────────────────
// Analisa idade + health score + custo de reparos para recomendar ação

export function getReplacementPrediction(
  asset:       Asset,
  kpis:        AssetKPIs,
  healthScore: AssetHealthScore,
): ReplacementPrediction {
  const factors: string[] = []
  let urgency = 0  // 0 = manter, 100 = substituição imediata

  // Pilar 1: Idade do ativo
  if (kpis.ageYears > 15) {
    urgency += 30
    factors.push(`Ativo com ${kpis.ageYears.toFixed(0)} anos de vida útil`)
  } else if (kpis.ageYears > 10) {
    urgency += 18
    factors.push(`Ativo com ${kpis.ageYears.toFixed(0)} anos — longevidade elevada`)
  } else if (kpis.ageYears > 7) {
    urgency += 8
    factors.push(`Ativo com ${kpis.ageYears.toFixed(0)} anos`)
  }

  // Pilar 2: Health Score
  if (healthScore.score < 40) {
    urgency += 35
    factors.push(`Health Score crítico: ${healthScore.score}/100`)
  } else if (healthScore.score < 60) {
    urgency += 20
    factors.push(`Health Score baixo: ${healthScore.score}/100`)
  } else if (healthScore.score < 75) {
    urgency += 8
    factors.push(`Health Score moderado: ${healthScore.score}/100`)
  }

  // Pilar 3: Disponibilidade
  if (kpis.availability < 70) {
    urgency += 20
    factors.push(`Disponibilidade crítica: ${kpis.availability.toFixed(1)}%`)
  } else if (kpis.availability < 85) {
    urgency += 10
    factors.push(`Disponibilidade razoável: ${kpis.availability.toFixed(1)}%`)
  }

  // Pilar 4: Custo de reparos vs. valor do ativo
  const assetValue = asset.value ?? 0
  if (assetValue > 0 && kpis.totalRepairCost > assetValue * 0.6) {
    urgency += 25
    factors.push(`Custo de reparos > 60% do valor do ativo`)
  } else if (assetValue > 0 && kpis.totalRepairCost > assetValue * 0.35) {
    urgency += 12
    factors.push(`Custo de reparos > 35% do valor do ativo`)
  }

  const currentYear = new Date().getFullYear()
  const yearsRemaining = Math.max(1, Math.round(10 - kpis.ageYears))

  if (urgency >= 60) {
    return {
      recommendation:          'replace_now',
      label:                   'Substituição Urgente',
      color:                   '#dc2626',
      bg:                      'rgba(220,38,38,0.1)',
      score:                   urgency,
      reasoning:               factors.length > 0 ? factors : ['Múltiplos indicadores críticos'],
      estimatedReplacementYear: currentYear,
    }
  }
  if (urgency >= 35) {
    return {
      recommendation:          'plan_replacement',
      label:                   'Planejar Substituição',
      color:                   '#ea580c',
      bg:                      'rgba(234,88,12,0.1)',
      score:                   urgency,
      reasoning:               factors,
      estimatedReplacementYear: currentYear + Math.min(yearsRemaining, 3),
    }
  }
  if (urgency >= 15) {
    return {
      recommendation: 'monitor',
      label:          'Monitorar',
      color:          '#f59e0b',
      bg:             'rgba(245,158,11,0.1)',
      score:          urgency,
      reasoning:      factors.length > 0 ? factors : ['Ativo aceitável, mas requer atenção contínua'],
    }
  }
  return {
    recommendation: 'maintain',
    label:          'Manter em Operação',
    color:          '#16a34a',
    bg:             'rgba(22,163,74,0.1)',
    score:          urgency,
    reasoning:      ['Ativo em boas condições operacionais'],
  }
}

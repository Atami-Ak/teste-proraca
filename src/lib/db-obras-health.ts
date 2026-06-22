// src/lib/db-obras-health.ts
// CIP V1 — Health Score da Obra (0-100), puro/sem Firestore.
//
// Pesos definidos em docs/modules/obras-cip-vision.md §Módulo 2:
//   25% Qualidade · 20% Segurança · 15% Prazo · 10% Financeiro
//   10% Equipe · 10% Documentação · 5% Compliance · 5% Histórico da empreiteira
//
// V1 usa apenas dados que já existem hoje (inspeções, financeiro, score da
// empreiteira). Documentação e Compliance ainda não têm coleção própria —
// entram como nota neutra até o GED/Compliance Center (V2/V3) existirem.

import type { Obra, Empreiteira, InspecaoObra } from '@/types/obras'

export interface ObraHealthBreakdown {
  qualidade:     number   // 0-25
  seguranca:     number   // 0-20
  prazo:         number   // 0-15
  financeiro:    number   // 0-10
  equipe:        number   // 0-10
  documentacao:  number   // 0-10 (placeholder V1 — sem GED ainda)
  compliance:    number   // 0-5  (placeholder V1 — sem Compliance Center ainda)
  historicoEmp:  number   // 0-5
}

export interface ObraHealthScore {
  score:      number   // 0-100
  label:      string
  color:      string
  bg:         string
  breakdown:  ObraHealthBreakdown
  isPlaceholder: { documentacao: boolean; compliance: boolean }
}

const NEUTRAL_PLACEHOLDER_PCT = 0.7   // 70% — usado quando ainda não há dado real

function sectionScorePct(inspecoes: InspecaoObra[], secaoId: string): number | null {
  const ultima = inspecoes.find(i => i.status !== 'rascunho')
  if (!ultima) return null
  const sec = ultima.secoes.find(s => s.secaoId === secaoId)
  if (!sec || sec.scoreSecao <= 0) return null
  return sec.scoreSecao / 10
}

function prazoScorePct(obra: Obra): number {
  if (!obra.dataFimPrevisto) return 1
  const dias = Math.ceil((obra.dataFimPrevisto.getTime() - Date.now()) / 86_400_000)
  if (obra.status !== 'em_andamento' || dias >= 0) return 1
  const atraso = Math.abs(dias)
  if (atraso <= 7)  return 0.85
  if (atraso <= 30) return 0.6
  if (atraso <= 60) return 0.35
  return 0.1
}

function financeiroScorePct(obra: Obra): number {
  const contrato = (obra.valorContrato ?? 0) + (obra.valorAditivos ?? 0)
  if (contrato <= 0) return 1
  const variancePct = ((obra.valorPago ?? 0) - contrato) / contrato
  if (variancePct <= 0)    return 1
  if (variancePct <= 0.10) return 0.85
  if (variancePct <= 0.25) return 0.6
  if (variancePct <= 0.50) return 0.3
  return 0.1
}

export function computeObraHealthScore(
  obra:       Obra,
  inspecoes:  InspecaoObra[],
  empreiteira: Empreiteira | null,
): ObraHealthScore {
  const qualidadePct    = sectionScorePct(inspecoes, 'qualidade')   ?? (obra.notaMedia ? obra.notaMedia / 10 : NEUTRAL_PLACEHOLDER_PCT)
  const segurancaPct    = sectionScorePct(inspecoes, 'seguranca')   ?? NEUTRAL_PLACEHOLDER_PCT
  const equipePct       = sectionScorePct(inspecoes, 'equipe')      ?? NEUTRAL_PLACEHOLDER_PCT
  const prazoPct        = prazoScorePct(obra)
  const financeiroPct   = financeiroScorePct(obra)
  const historicoEmpPct = empreiteira?.scoreGlobal != null ? empreiteira.scoreGlobal / 100 : NEUTRAL_PLACEHOLDER_PCT

  const breakdown: ObraHealthBreakdown = {
    qualidade:    Math.round(qualidadePct    * 25),
    seguranca:    Math.round(segurancaPct    * 20),
    prazo:        Math.round(prazoPct        * 15),
    financeiro:   Math.round(financeiroPct   * 10),
    equipe:       Math.round(equipePct       * 10),
    documentacao: Math.round(NEUTRAL_PLACEHOLDER_PCT * 10),
    compliance:   Math.round(NEUTRAL_PLACEHOLDER_PCT * 5),
    historicoEmp: Math.round(historicoEmpPct * 5),
  }

  const score = Math.min(100,
    breakdown.qualidade + breakdown.seguranca + breakdown.prazo + breakdown.financeiro +
    breakdown.equipe + breakdown.documentacao + breakdown.compliance + breakdown.historicoEmp,
  )

  const label =
    score >= 95 ? 'Excelente' :
    score >= 85 ? 'Saudável'  :
    score >= 70 ? 'Atenção'   :
    score >= 50 ? 'Risco'     : 'Crítico'

  const color =
    score >= 95 ? '#16a34a' :
    score >= 85 ? '#22c55e' :
    score >= 70 ? '#f59e0b' :
    score >= 50 ? '#ea580c' : '#dc2626'

  const bg =
    score >= 95 ? 'rgba(22,163,74,0.1)' :
    score >= 85 ? 'rgba(34,197,94,0.1)' :
    score >= 70 ? 'rgba(245,158,11,0.1)' :
    score >= 50 ? 'rgba(234,88,12,0.1)' : 'rgba(220,38,38,0.1)'

  return {
    score, label, color, bg, breakdown,
    isPlaceholder: { documentacao: true, compliance: true },
  }
}

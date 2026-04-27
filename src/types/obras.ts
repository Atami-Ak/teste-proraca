// ── Obras & Empreiteiras — TypeScript types ──────────────

import type { Priority } from '@/types'
export type { Priority }

// ── Obra ─────────────────────────────────────────────────

export type ObraStatus =
  | 'planejamento'
  | 'em_andamento'
  | 'paralisada'
  | 'concluida'
  | 'cancelada'

export interface Obra {
  id:                  string
  codigo:              string          // auto: "OBR-001"
  nome:                string
  empreiteiraId?:      string
  empreiteiraNome?:    string
  descricao?:          string
  local:               string
  tipo:                string
  status:              ObraStatus
  prioridade:          Priority
  percentualConcluido: number          // 0-100

  // Financeiro
  valorContrato?:      number
  valorAditivos?:      number
  valorPago?:          number

  // Cronograma
  dataInicio?:         Date
  dataFimPrevisto?:    Date
  dataFimReal?:        Date

  // Responsáveis
  responsavelInterno?: string
  supervisorId?:       string

  // Agregados calculados
  notaMedia?:          number          // média das inspeções
  totalInspecoes?:     number
  alertasCriticos?:    number
  aprovacaoFinal?:     AprovacaoFinal

  createdBy?: string
  createdAt?: Date
  updatedAt?: Date
}

export interface AprovacaoFinal {
  status:        'pendente' | 'aprovada' | 'reprovada'
  aprovadorId?:  string
  aprovadorNome?: string
  data?:         Date
  parecer?:      string
}

// ── Empreiteira ───────────────────────────────────────────

export type EmpreiteiraStatus =
  | 'preferencial'
  | 'aprovada'
  | 'aprovada_restr'
  | 'nao_recomendada'
  | 'bloqueada'

export interface Empreiteira {
  id:             string
  nome:           string
  cnpj?:          string
  contato?:       string
  email?:         string
  telefone?:      string
  especialidades: string[]
  status:         EmpreiteiraStatus
  scoreGlobal?:   number              // 0-100
  totalObras?:    number
  obrasAprovadas?: number
  ativo:          boolean
  observacoes?:   string
  createdAt?:     Date
  updatedAt?:     Date
}

// ── Inspeção de Obra ──────────────────────────────────────

export type InspecaoStatus = 'rascunho' | 'submetida' | 'aprovada'

export interface InspecaoObra {
  id:              string
  obraId:          string
  empreiteiraId?:  string
  dataInspecao:    Date
  inspetorId?:     string
  inspetorNome?:   string
  secoes:          InspecaoSecao[]
  scoreGeral:      number             // 0-10, média ponderada
  alertasCriticos: AlertaCritico[]
  observacoes?:    string
  status:          InspecaoStatus
  aprovadoPor?:    string
  createdAt?:      Date
  updatedAt?:      Date
}

export interface InspecaoSecao {
  secaoId:    string
  label:      string
  peso:       number                  // 0-1, weight for overall score
  itens:      InspecaoItem[]
  scoreSecao: number                  // 0-10
}

export interface InspecaoItem {
  itemId:       string
  label:        string
  critico:      boolean
  nota:         number | null         // 0-10, null = não avaliado
  observacao?:  string
}

export interface AlertaCritico {
  itemId:  string
  secaoId: string
  label:   string
  nota:    number
  tipo:    'critico' | 'atencao'
}

// ── Avaliação Final de Empreiteira ────────────────────────

export type Recomendacao = 'sim' | 'sim_restricoes' | 'nao' | 'bloqueado'

export interface AvaliacaoEmpreiteira {
  id:                   string
  obraId:               string
  empreiteiraId:        string
  qualidade:            number        // 0-10
  seguranca:            number
  prazo:                number
  retrabalho:           number
  organizacao:          number
  custoBeneficio:       number
  profissionalismo:     number
  resolucaoProblemas:   number
  scoreTotal:           number        // 0-100, ponderado
  recomendacao:         Recomendacao
  justificativa:        string
  avaliadorId?:         string
  avaliadorNome?:       string
  createdAt?:           Date
  updatedAt?:           Date
}

// ── Scoring ───────────────────────────────────────────────

export const AVALIACAO_PESOS = {
  qualidade:          0.20,
  seguranca:          0.20,
  prazo:              0.15,
  retrabalho:         0.15,
  organizacao:        0.10,
  custoBeneficio:     0.10,
  profissionalismo:   0.05,
  resolucaoProblemas: 0.05,
} as const

export type AvaliacaoCriteria = keyof typeof AVALIACAO_PESOS

export function calcAvaliacaoScore(
  av: Pick<AvaliacaoEmpreiteira, AvaliacaoCriteria>
): number {
  const raw =
    av.qualidade          * AVALIACAO_PESOS.qualidade +
    av.seguranca          * AVALIACAO_PESOS.seguranca +
    av.prazo              * AVALIACAO_PESOS.prazo +
    av.retrabalho         * AVALIACAO_PESOS.retrabalho +
    av.organizacao        * AVALIACAO_PESOS.organizacao +
    av.custoBeneficio     * AVALIACAO_PESOS.custoBeneficio +
    av.profissionalismo   * AVALIACAO_PESOS.profissionalismo +
    av.resolucaoProblemas * AVALIACAO_PESOS.resolucaoProblemas
  return Math.round(raw * 10) // normalize 0-10 scale to 0-100
}

export function calcEmpreiteiraStatus(score: number): EmpreiteiraStatus {
  if (score >= 85) return 'preferencial'
  if (score >= 70) return 'aprovada'
  if (score >= 55) return 'aprovada_restr'
  if (score >= 40) return 'nao_recomendada'
  return 'bloqueada'
}

export function calcRecomendacao(score: number): Recomendacao {
  if (score >= 70) return 'sim'
  if (score >= 55) return 'sim_restricoes'
  if (score >= 40) return 'nao'
  return 'bloqueado'
}

// ── Metadata maps ─────────────────────────────────────────

export const OBRA_STATUS_META: Record<ObraStatus, { label: string; color: string; bg: string }> = {
  planejamento: { label: 'Planejamento',  color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
  em_andamento: { label: 'Em Andamento',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  paralisada:   { label: 'Paralisada',    color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
  concluida:    { label: 'Concluída',     color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
  cancelada:    { label: 'Cancelada',     color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
}

export const EMPREITEIRA_STATUS_META: Record<EmpreiteiraStatus, { label: string; color: string; bg: string; minScore: number }> = {
  preferencial:    { label: 'Preferencial',           color: '#166534', bg: 'rgba(22,101,52,0.12)',   minScore: 85 },
  aprovada:        { label: 'Aprovada',                color: '#16a34a', bg: 'rgba(22,163,74,0.12)',   minScore: 70 },
  aprovada_restr:  { label: 'Aprovada c/ Restrições',  color: '#ea580c', bg: 'rgba(234,88,12,0.12)',   minScore: 55 },
  nao_recomendada: { label: 'Não Recomendada',         color: '#dc2626', bg: 'rgba(220,38,38,0.12)',   minScore: 40 },
  bloqueada:       { label: 'Bloqueada',               color: '#7f1d1d', bg: 'rgba(127,29,29,0.12)',   minScore: 0  },
}

export const RECOMENDACAO_META: Record<Recomendacao, { label: string; icon: string; color: string }> = {
  sim:           { label: 'Recomendado',            icon: '✅', color: '#166534' },
  sim_restricoes:{ label: 'Recomendado c/ Restrições', icon: '⚠️', color: '#ea580c' },
  nao:           { label: 'Não Recomendado',        icon: '❌', color: '#dc2626' },
  bloqueado:     { label: 'Bloqueado',              icon: '🚫', color: '#7f1d1d' },
}

export const OBRA_TIPOS = [
  'Construção Civil',
  'Instalação Elétrica',
  'Instalação Hidráulica',
  'Reforma',
  'Ampliação',
  'Manutenção Predial',
  'Terraplanagem',
  'Pavimentação',
  'Outro',
] as const

export const AVALIACAO_CRITERIOS: Array<{ key: AvaliacaoCriteria; label: string; desc: string }> = [
  { key: 'qualidade',          label: 'Qualidade de Execução',   desc: 'Conformidade técnica, acabamento e padrão dos serviços' },
  { key: 'seguranca',          label: 'Segurança do Trabalho',   desc: 'Uso de EPIs, cumprimento de NRs e organização segura' },
  { key: 'prazo',              label: 'Controle de Prazo',       desc: 'Cumprimento do cronograma acordado' },
  { key: 'retrabalho',         label: 'Índice de Retrabalho',    desc: '10 = zero retrabalho; 0 = retrabalho frequente' },
  { key: 'organizacao',        label: 'Organização do Canteiro', desc: 'Limpeza, ordem e conservação do local de obra' },
  { key: 'custoBeneficio',     label: 'Custo × Benefício',       desc: 'Relação entre qualidade entregue e valor cobrado' },
  { key: 'profissionalismo',   label: 'Profissionalismo',        desc: 'Comunicação, pontualidade e conduta da equipe' },
  { key: 'resolucaoProblemas', label: 'Resolução de Problemas',  desc: 'Capacidade de lidar com imprevistos e propor soluções' },
]

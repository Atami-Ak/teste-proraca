// ─────────────────────────────────────────────────────────────────────────────
// roadmap.ts — Sistema de Jornada do Colaborador (v2)
// Tipos centrais: StatusEtapa, Templates, StageEntry, Auditoria
// ─────────────────────────────────────────────────────────────────────────────

// ── Status da Etapa (9 valores) ──────────────────────────────────────────────
export type StatusEtapa =
  | 'pendente'
  | 'agendada'
  | 'em_andamento'
  | 'aguardando_aprovacao'
  | 'concluida'
  | 'pausada'
  | 'reaberta'
  | 'cancelada'
  | 'nao_aplicavel'

export const STATUS_ETAPA_META: Record<StatusEtapa, {
  label: string; color: string; bg: string; icon: string
}> = {
  pendente:             { label: 'Pendente',           color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', icon: '⚪' },
  agendada:             { label: 'Agendada',           color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',   icon: '🔵' },
  em_andamento:         { label: 'Em Andamento',       color: '#d97706', bg: 'rgba(217,119,6,0.1)',    icon: '🟡' },
  aguardando_aprovacao: { label: 'Aguard. Aprovação',  color: '#7c3aed', bg: 'rgba(124,58,237,0.1)',   icon: '🟣' },
  concluida:            { label: 'Concluída',          color: '#166534', bg: 'rgba(22,101,52,0.1)',    icon: '🟢' },
  pausada:              { label: 'Pausada',            color: '#64748b', bg: 'rgba(100,116,139,0.1)',  icon: '⏸️' },
  reaberta:             { label: 'Reaberta',           color: '#ea580c', bg: 'rgba(234,88,12,0.1)',    icon: '🔄' },
  cancelada:            { label: 'Cancelada',          color: '#dc2626', bg: 'rgba(220,38,38,0.1)',    icon: '⚫' },
  nao_aplicavel:        { label: 'Não Aplicável',      color: '#cbd5e1', bg: 'rgba(203,213,225,0.08)', icon: '—'  },
}

export const STATUS_ETAPA_ORDER: StatusEtapa[] = [
  'pendente', 'agendada', 'em_andamento', 'aguardando_aprovacao',
  'reaberta', 'pausada', 'concluida', 'cancelada', 'nao_aplicavel',
]

export function isStatusTerminal(s: StatusEtapa): boolean {
  return s === 'concluida' || s === 'cancelada' || s === 'nao_aplicavel'
}

// ── SLA ─────────────────────────────────────────────────────────────────────
export type SlaStatus = 'no_prazo' | 'proximo' | 'atrasada' | 'nao_aplicavel'

export const SLA_STATUS_META: Record<SlaStatus, { label: string; color: string; bg: string }> = {
  no_prazo:      { label: 'No Prazo',  color: '#166534', bg: 'rgba(22,101,52,0.1)'   },
  proximo:       { label: 'Próximo',   color: '#d97706', bg: 'rgba(217,119,6,0.1)'   },
  atrasada:      { label: 'Atrasada',  color: '#dc2626', bg: 'rgba(220,38,38,0.1)'   },
  nao_aplicavel: { label: '—',         color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
}

export function calcSlaStatus(
  status: StatusEtapa,
  dataInicio: Date | undefined,
  slaDias: number | undefined,
): { slaStatus: SlaStatus; diasDecorridos: number | null; diasRestantes: number | null } {
  if (!dataInicio || !slaDias || isStatusTerminal(status)) {
    return { slaStatus: 'nao_aplicavel', diasDecorridos: null, diasRestantes: null }
  }
  const diasDecorridos = Math.floor((Date.now() - dataInicio.getTime()) / 86_400_000)
  const diasRestantes  = slaDias - diasDecorridos
  const slaStatus: SlaStatus = diasRestantes < 0 ? 'atrasada'
    : diasRestantes <= 3 ? 'proximo' : 'no_prazo'
  return { slaStatus, diasDecorridos, diasRestantes }
}

// ── Checklist ────────────────────────────────────────────────────────────────
export interface ChecklistItem {
  itemId:  string
  label:   string
  done:    boolean
  doneBy?: string
  doneAt?: Date
}

// ── Template: definição de etapa ─────────────────────────────────────────────
export interface RoadmapTemplateStage {
  stageId:       string
  order:         number
  name:          string
  icon:          string
  descricao:     string
  slaDias?:      number
  predecessoras?: string[]
  checklist?:    { itemId: string; label: string }[]
}

// ── Template de Roadmap ──────────────────────────────────────────────────────
export type RoadmapTipo =
  | 'operacional' | 'administrativo' | 'gestor'
  | 'estagiario'  | 'terceirizado'   | 'completo' | 'custom'

export interface RoadmapTemplate {
  id:         string
  name:       string
  descricao?: string
  tipo:       RoadmapTipo
  stages:     RoadmapTemplateStage[]
  isDefault?: boolean
  createdAt?: Date
}

// ── Entrada de progresso do colaborador (v2) ─────────────────────────────────
export interface RoadmapStageEntry {
  stageId:        string       // identificador único (ex: 'SELECAO', 'NR35')
  etapa?:         string       // legado — retrocompat com v1
  status:         StatusEtapa
  name?:          string       // snapshot do nome no momento da criação
  icon?:          string
  descricao?:     string
  order?:         number
  slaDias?:       number
  dataInicio?:    Date
  dataPrevisao?:  Date         // dataInicio + slaDias
  dataConclusao?: Date
  responsavel?:   string
  observacoes?:   string
  evidencias?:    string[]     // IDs de EmployeeDocument
  checklist?:     ChecklistItem[]
}

// ── Auditoria de alterações ──────────────────────────────────────────────────
export interface RoadmapAuditEntry {
  id?:           string
  stageId:       string
  stageName:     string
  campo:         string
  valorAnterior: string
  valorNovo:     string
  changedBy:     string
  changedAt:     Date
}

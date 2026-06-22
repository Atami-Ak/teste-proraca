// src/types/obras-timeline.ts
// CIP V1 — Timeline básica (Digital Twin) da Obra.

export type ObraTimelineEventType =
  | 'obra_criada'
  | 'status_alterado'
  | 'inspecao_submetida'
  | 'avaliacao_registrada'
  | 'obra_aprovada'
  | 'obra_reprovada'

export interface ObraTimelineEvent {
  id?:          string
  obraId:       string
  eventType:    ObraTimelineEventType
  title:        string
  description?: string
  performedBy?: string
  linkedId?:    string
  createdAt?:   Date
}

export const OBRA_TIMELINE_META: Record<ObraTimelineEventType, { label: string; icon: string; color: string }> = {
  obra_criada:          { label: 'Obra Criada',          icon: '🏗️', color: '#3b82f6' },
  status_alterado:      { label: 'Status Alterado',      icon: '🔄', color: '#8b5cf6' },
  inspecao_submetida:   { label: 'Inspeção Submetida',   icon: '📋', color: '#f59e0b' },
  avaliacao_registrada: { label: 'Avaliação Registrada', icon: '⭐', color: '#0891b2' },
  obra_aprovada:        { label: 'Obra Aprovada',        icon: '✅', color: '#16a34a' },
  obra_reprovada:       { label: 'Obra Reprovada',       icon: '❌', color: '#dc2626' },
}

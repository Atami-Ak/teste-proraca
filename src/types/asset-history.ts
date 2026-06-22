import type { FirestoreTimestamp } from '@/types'

export interface AssetLocationEntry {
  id:              string
  assetId:         string
  location:        string
  locationDetail?: string
  notes?:          string
  photos:          string[]
  registeredBy?:   string
  createdAt?:      Date | FirestoreTimestamp
}

export type AssetEventType =
  | 'created'
  | 'status_changed'
  | 'location_transfer'
  | 'maintenance_created'
  | 'maintenance_completed'
  | 'purchase_linked'
  | 'decommissioned'
  | 'edited'
  | 'lifecycle_changed'
  | 'cost_recorded'
  | 'trigger_fired'
  | 'document_attached'

export interface AssetEvent {
  id:          string
  assetId:     string
  eventType:   AssetEventType
  title:       string
  description?: string
  oldValue?:   string
  newValue?:   string
  performedBy?: string
  linkedId?:   string
  linkedType?: 'maintenance' | 'service_order' | 'purchase_order'
  createdAt?:  Date | FirestoreTimestamp
}

export const EVENT_META: Record<AssetEventType, { label: string; color: string }> = {
  created:               { label: 'Ativo Cadastrado',      color: '#16A34A' },
  status_changed:        { label: 'Status Alterado',       color: '#3b82f6' },
  location_transfer:     { label: 'Transferência',         color: '#EA580C' },
  maintenance_created:   { label: 'Manutenção Aberta',     color: '#f59e0b' },
  maintenance_completed: { label: 'Manutenção Concluída',  color: '#22c55e' },
  purchase_linked:       { label: 'Compra Vinculada',      color: '#7C3AED' },
  decommissioned:        { label: 'Ativo Baixado',         color: '#DC2626' },
  edited:                { label: 'Dados Editados',        color: '#64748b' },
  lifecycle_changed:     { label: 'Ciclo de Vida',         color: '#6366f1' },
  cost_recorded:         { label: 'Custo Registrado',      color: '#0891b2' },
  trigger_fired:         { label: 'Gatilho Ativado',       color: '#ea580c' },
  document_attached:     { label: 'Documento Anexado',     color: '#7c3aed' },
}

import type { FirestoreTimestamp } from '@/types'

export type AssetEventType =
  | 'created'
  | 'status_changed'
  | 'location_transfer'
  | 'maintenance_created'
  | 'maintenance_completed'
  | 'purchase_linked'
  | 'decommissioned'
  | 'edited'

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
}

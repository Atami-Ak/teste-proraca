// ── EAM — Enterprise Asset Management types ─────────────────────────────────

// ── Ciclo de vida ─────────────────────────────────────────────────────────────

export type AssetLifecycleStatus =
  | 'planejado'
  | 'aguardando_compra'
  | 'em_transporte'
  | 'instalacao'
  | 'operacional'
  | 'manutencao_programada'
  | 'inativo'
  | 'emprestado'
  | 'reservado'
  | 'obsoleto'
  | 'descartado'
  | 'baixado'

export interface AssetLifecycleMeta {
  label: string
  color: string
  bg:    string
  icon:  string
}

export const LIFECYCLE_META: Record<AssetLifecycleStatus, AssetLifecycleMeta> = {
  planejado:             { label: 'Planejado',        color: '#6366f1', bg: 'rgba(99,102,241,0.1)',  icon: '📋' },
  aguardando_compra:     { label: 'Aguard. Compra',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: '🛒' },
  em_transporte:         { label: 'Em Transporte',    color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  icon: '🚚' },
  instalacao:            { label: 'Em Instalação',    color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  icon: '🔧' },
  operacional:           { label: 'Operacional',      color: '#16a34a', bg: 'rgba(22,163,74,0.1)',   icon: '✅' },
  manutencao_programada: { label: 'Manut. Progr.',    color: '#ea580c', bg: 'rgba(234,88,12,0.1)',   icon: '⚙️' },
  inativo:               { label: 'Inativo',          color: '#64748b', bg: 'rgba(100,116,139,0.1)', icon: '⏸️' },
  emprestado:            { label: 'Emprestado',       color: '#0891b2', bg: 'rgba(8,145,178,0.1)',   icon: '📤' },
  reservado:             { label: 'Reservado',        color: '#7c3aed', bg: 'rgba(124,58,237,0.1)',  icon: '🔒' },
  obsoleto:              { label: 'Obsoleto',         color: '#dc2626', bg: 'rgba(220,38,38,0.1)',   icon: '⚠️' },
  descartado:            { label: 'Descartado',       color: '#991b1b', bg: 'rgba(153,27,27,0.1)',   icon: '🗑️' },
  baixado:               { label: 'Baixado',          color: '#475569', bg: 'rgba(71,85,105,0.1)',   icon: '📦' },
}

// ── KPIs de desempenho ────────────────────────────────────────────────────────

export interface AssetKPIs {
  totalFailures:   number   // manutenções corretivas
  totalDowntime:   number   // horas somadas dos registros de manutenção
  totalRepairCost: number   // R$ somado de todas as manutenções
  mtbf:            number   // horas médias entre falhas (Mean Time Between Failures)
  mttr:            number   // horas médias de reparo (Mean Time To Repair)
  availability:    number   // 0-100 %
  ageYears:        number   // anos desde a aquisição
}

// ── Health Score ──────────────────────────────────────────────────────────────

export interface AssetHealthScore {
  score: number    // 0-100
  label: string    // 'Excelente' | 'Bom' | 'Atenção' | 'Crítico'
  color: string
  bg:    string
  breakdown: {
    availability: number   // peso 0-30
    maintenance:  number   // peso 0-25
    failures:     number   // peso 0-25
    age:          number   // peso 0-20
  }
}

// ── Custo do ativo ────────────────────────────────────────────────────────────

export type AssetCostType =
  | 'aquisicao'
  | 'manutencao'
  | 'reparo'
  | 'peca'
  | 'servico_externo'
  | 'parada_producao'
  | 'outros'

export interface AssetCost {
  id:              string
  assetId:         string
  type:            AssetCostType
  description:     string
  value:           number
  date:            Date
  maintenanceId?:  string
  serviceOrderId?: string
  registeredBy?:   string
  createdAt?:      Date
}

export const COST_TYPE_META: Record<AssetCostType, { label: string; color: string; icon: string }> = {
  aquisicao:        { label: 'Aquisição',       color: '#16a34a', icon: '💰' },
  manutencao:       { label: 'Manutenção',      color: '#3b82f6', icon: '🔧' },
  reparo:           { label: 'Reparo',          color: '#ea580c', icon: '🛠️' },
  peca:             { label: 'Peça/Componente', color: '#7c3aed', icon: '⚙️' },
  servico_externo:  { label: 'Serv. Externo',   color: '#0891b2', icon: '🏢' },
  parada_producao:  { label: 'Parada Produção', color: '#dc2626', icon: '⛔' },
  outros:           { label: 'Outros',          color: '#64748b', icon: '📋' },
}

// ── Gatilhos de manutenção ────────────────────────────────────────────────────

export type MaintenanceTriggerUnit = 'horas' | 'km' | 'ciclos' | 'dias'

export interface MaintenanceTrigger {
  unit:          MaintenanceTriggerUnit
  interval:      number   // ex: 500 horas, 10000 km
  currentValue:  number   // valor atual do hodômetro / horímetro
  lastReset?:    number   // valor no momento da última manutenção
  alertThreshold?: number // % do intervalo para alertar (padrão 90)
}

export const TRIGGER_UNIT_META: Record<MaintenanceTriggerUnit, { label: string; abbr: string }> = {
  horas:  { label: 'Horas de Operação', abbr: 'h'    },
  km:     { label: 'Quilômetros',       abbr: 'km'   },
  ciclos: { label: 'Ciclos',            abbr: 'cx'   },
  dias:   { label: 'Dias',              abbr: 'd'    },
}

// ── Previsão de substituição ─────────────────────────────────────────────────

export type ReplacementRecommendation = 'maintain' | 'monitor' | 'plan_replacement' | 'replace_now'

export interface ReplacementPrediction {
  recommendation:          ReplacementRecommendation
  label:                   string
  color:                   string
  bg:                      string
  score:                   number   // 0-100: quanto maior, mais urgente a substituição
  reasoning:               string[]
  estimatedReplacementYear?: number
}

export const REPLACEMENT_META: Record<ReplacementRecommendation, { label: string; color: string; bg: string; icon: string }> = {
  maintain:          { label: 'Manter em Operação',   color: '#16a34a', bg: 'rgba(22,163,74,0.1)',   icon: '✅' },
  monitor:           { label: 'Monitorar',            color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: '👁️' },
  plan_replacement:  { label: 'Planejar Substituição', color: '#ea580c', bg: 'rgba(234,88,12,0.1)',  icon: '📅' },
  replace_now:       { label: 'Substituição Urgente', color: '#dc2626', bg: 'rgba(220,38,38,0.1)',   icon: '🔴' },
}

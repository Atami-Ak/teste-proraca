// ── Safety Management System — TypeScript Types ──────────
// Pro Raça Rações · Gestão de Segurança do Trabalho

// ── Enums / union types ───────────────────────────────────

export type SetorFabrica =
  | 'Produção' | 'Moagem' | 'Mistura' | 'Peletização' | 'Expedição'
  | 'Armazenagem' | 'Caldeiraria' | 'Manutenção' | 'Elétrica'
  | 'Almoxarifado' | 'Administrativo' | 'Segurança' | 'Qualidade'
  | 'Logística/Frota' | 'Outro'

export const SETORES_FABRICA: SetorFabrica[] = [
  'Produção','Moagem','Mistura','Peletização','Expedição',
  'Armazenagem','Caldeiraria','Manutenção','Elétrica',
  'Almoxarifado','Administrativo','Segurança','Qualidade',
  'Logística/Frota','Outro',
]

export type NivelRisco = 'baixo' | 'medio' | 'alto' | 'critico'
export type Severidade = 'baixa' | 'media' | 'alta' | 'critica'

export const NIVEL_RISCO_META: Record<NivelRisco, { label: string; color: string; bg: string }> = {
  baixo:   { label: 'Baixo',   color: '#16a34a', bg: 'rgba(22,163,74,0.1)'   },
  medio:   { label: 'Médio',   color: '#d97706', bg: 'rgba(217,119,6,0.1)'   },
  alto:    { label: 'Alto',    color: '#ea580c', bg: 'rgba(234,88,12,0.1)'   },
  critico: { label: 'Crítico', color: '#dc2626', bg: 'rgba(220,38,38,0.1)'   },
}

export const SEVERIDADE_META: Record<Severidade, { label: string; color: string }> = {
  baixa:   { label: 'Baixa',   color: '#16a34a' },
  media:   { label: 'Média',   color: '#d97706' },
  alta:    { label: 'Alta',    color: '#ea580c' },
  critica: { label: 'Crítica', color: '#dc2626' },
}

// ── DDS — Diálogo Diário de Segurança ────────────────────

export type DDSStatus = 'rascunho' | 'concluido'

export interface ColaboradorPresente {
  nome:      string
  matricula?: string
  funcao?:   string
  assinou:   boolean
}

export interface DDS {
  id:                   string
  numero:               string          // DDS-001
  data:                 Date
  hora:                 string          // "08:00"
  setor:                SetorFabrica
  departamento:         string
  supervisor:           string
  tecnicoNome:          string
  tecnicoId?:           string
  temaId:               string
  tema:                 string
  categoriaId:          string
  categoria:            string
  colaboradores:        ColaboradorPresente[]
  totalPresentes:       number
  duracaoMinutos?:      number
  observacoes?:         string
  riscosIdentificados?: string
  acoesImediatas?:      string
  fotoUrl?:             string
  status:               DDSStatus
  createdBy?:           string
  createdAt?:           Date
  updatedAt?:           Date
}

// ── DDI — Diária de Inspeção de Segurança ────────────────

export type DDIResultado = 'conforme' | 'nao_conforme' | 'nao_aplicavel' | null

export type DDIStatus = 'rascunho' | 'submetido' | 'aprovado'

export interface DDIItem {
  itemId:         string
  label:          string
  critico:        boolean
  resultado:      DDIResultado
  severidade?:    Severidade
  responsavel?:   string
  prazo?:         string          // ISO date string
  observacao?:    string
  acaoCorretiva?: string
  fotoRequerida:  boolean
}

export interface DDISecao {
  secaoId:     string
  label:       string
  icon:        string
  itens:       DDIItem[]
  scoreSecao:  number             // 0-100
  conformes:   number
  naoConformes:number
}

export interface DDI {
  id:                  string
  numero:              string
  data:                Date
  hora:                string
  setor:               SetorFabrica
  inspetor:            string
  inspetorId?:         string
  secoes:              DDISecao[]
  scoreGeral:          number      // 0-100
  totalItens:          number
  totalConformes:      number
  totalNaoConformes:   number
  totalNaoAplicaveis:  number
  totalCriticosAbertos:number
  acoesGeradas:        number
  observacoesGerais?:  string
  status:              DDIStatus
  aprovadoPor?:        string
  createdBy?:          string
  createdAt?:          Date
  updatedAt?:          Date
}

// ── EPI — Equipamentos de Proteção Individual ────────────

export type CondicaoEPI = 'novo' | 'bom' | 'regular' | 'danificado'
export type StatusFichaEPI = 'conforme' | 'pendente' | 'irregular' | 'vencido'

export interface EPIEntrega {
  id:                      string
  epiId:                   string   // from catalog
  epiNome:                 string
  numeroCa:                string
  dataEntrega:             Date
  dataVencimento?:         Date
  previsaoTroca?:          Date
  quantidade:              number
  condicao:                CondicaoEPI
  areaObrigatoria:         string
  assinaturaColaborador:   boolean
  assinaturaResponsavel:   boolean
  responsavelNome?:        string
  observacoes?:            string
}

export interface EPIFicha {
  id:                   string
  colaboradorNome:      string
  matricula:            string
  departamento:         string
  setor:                SetorFabrica
  funcao:               string
  supervisor:           string
  dataAdmissao?:        Date
  classificacaoRisco:   NivelRisco
  entregas:             EPIEntrega[]
  statusFicha:          StatusFichaEPI
  totalEpisVencidos:    number
  totalEpisAVencer:     number   // nos próximos 30 dias
  ativo:                boolean
  observacoes?:         string
  createdAt?:           Date
  updatedAt?:           Date
}

export interface EPIItemInspecao {
  epiNome:               string
  numeroCa:              string
  usoCorreto:            boolean | null
  danificado:            boolean
  vencido:               boolean
  precisaTroca:          boolean
  precisaTreinamento:    boolean
  observacao?:           string
}

export interface EPIInspecao {
  id:              string
  fichaId:         string
  colaboradorId:   string
  colaboradorNome: string
  dataInspecao:    Date
  inspetorNome:    string
  inspetorId?:     string
  itens:           EPIItemInspecao[]
  resultado:       StatusFichaEPI
  observacoes?:    string
  createdAt?:      Date
}

// ── Ocorrência / Incidente ────────────────────────────────

export type TipoOcorrencia =
  | 'acidente_com_afastamento'
  | 'acidente_sem_afastamento'
  | 'quase_acidente'
  | 'condicao_insegura'
  | 'ato_inseguro'
  | 'doenca_ocupacional'

export type StatusOcorrencia = 'aberta' | 'em_investigacao' | 'encerrada'

export interface Ocorrencia {
  id:               string
  numero:           string
  tipo:             TipoOcorrencia
  data:             Date
  hora:             string
  setor:            SetorFabrica
  colaboradorNome?: string
  matricula?:       string
  descricao:        string
  causaImediata?:   string
  causaRaiz?:       string
  acoesTomadas?:    string
  planoAcao?:       string
  responsavel:      string
  prazoAcao?:       Date
  status:           StatusOcorrencia
  severidade:       Severidade
  fotoUrl?:         string
  createdBy?:       string
  createdAt?:       Date
  updatedAt?:       Date
}

// ── Permissão de Trabalho ─────────────────────────────────

export type TipoPermissao =
  | 'trabalho_altura'
  | 'espaco_confinado'
  | 'trabalho_quente'
  | 'bloqueio_energia'
  | 'trabalho_eletrico'
  | 'geral'

export type StatusPermissao = 'solicitada' | 'aprovada' | 'em_execucao' | 'encerrada' | 'cancelada'

export interface PermissaoTrabalho {
  id:              string
  numero:          string
  tipo:            TipoPermissao
  data:            Date
  horaInicio:      string
  horaFim:         string
  setor:           SetorFabrica
  descricaoServico:string
  empresaExecutora?: string
  responsavelServico: string
  supervisorSeguranca: string
  riscos:          string[]
  medidas:         string[]
  episRequeridos:  string[]
  status:          StatusPermissao
  aprovadoPor?:    string
  observacoes?:    string
  createdAt?:      Date
  updatedAt?:      Date
}

// ── Meta maps ─────────────────────────────────────────────

export const TIPO_OCORRENCIA_META: Record<TipoOcorrencia, { label: string; color: string; bg: string }> = {
  acidente_com_afastamento:  { label: 'Acidente c/ Afastamento', color: '#7f1d1d', bg: 'rgba(127,29,29,0.1)'  },
  acidente_sem_afastamento:  { label: 'Acidente s/ Afastamento', color: '#dc2626', bg: 'rgba(220,38,38,0.1)'  },
  quase_acidente:            { label: 'Quase Acidente',          color: '#ea580c', bg: 'rgba(234,88,12,0.1)'  },
  condicao_insegura:         { label: 'Condição Insegura',       color: '#d97706', bg: 'rgba(217,119,6,0.1)'  },
  ato_inseguro:              { label: 'Ato Inseguro',            color: '#d97706', bg: 'rgba(217,119,6,0.1)'  },
  doenca_ocupacional:        { label: 'Doença Ocupacional',      color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
}

export const TIPO_PERMISSAO_META: Record<TipoPermissao, { label: string; icon: string }> = {
  trabalho_altura:     { label: 'Trabalho em Altura',     icon: '🪜' },
  espaco_confinado:    { label: 'Espaço Confinado',       icon: '⚠️' },
  trabalho_quente:     { label: 'Trabalho a Quente',      icon: '🔥' },
  bloqueio_energia:    { label: 'Bloqueio/Etiquetagem',   icon: '🔒' },
  trabalho_eletrico:   { label: 'Trabalho Elétrico',      icon: '⚡' },
  geral:               { label: 'Permissão Geral',        icon: '📋' },
}

export const STATUS_DDI_META: Record<DDIStatus, { label: string; color: string }> = {
  rascunho:  { label: 'Rascunho',  color: '#94a3b8' },
  submetido: { label: 'Submetido', color: '#3b82f6' },
  aprovado:  { label: 'Aprovado',  color: '#16a34a' },
}

export const STATUS_DDS_META: Record<DDSStatus, { label: string; color: string }> = {
  rascunho:  { label: 'Rascunho',  color: '#94a3b8' },
  concluido: { label: 'Concluído', color: '#16a34a' },
}

export const STATUS_FICHA_META: Record<StatusFichaEPI, { label: string; color: string; bg: string }> = {
  conforme:  { label: 'Conforme',  color: '#166534', bg: 'rgba(22,101,52,0.1)'  },
  pendente:  { label: 'Pendente',  color: '#d97706', bg: 'rgba(217,119,6,0.1)'  },
  irregular: { label: 'Irregular', color: '#ea580c', bg: 'rgba(234,88,12,0.1)'  },
  vencido:   { label: 'Vencido',   color: '#dc2626', bg: 'rgba(220,38,38,0.1)'  },
}

export const STATUS_PERMISSAO_META: Record<StatusPermissao, { label: string; color: string }> = {
  solicitada:   { label: 'Solicitada',    color: '#3b82f6' },
  aprovada:     { label: 'Aprovada',      color: '#16a34a' },
  em_execucao:  { label: 'Em Execução',   color: '#f59e0b' },
  encerrada:    { label: 'Encerrada',     color: '#94a3b8' },
  cancelada:    { label: 'Cancelada',     color: '#dc2626' },
}

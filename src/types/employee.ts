// ── Employee Management System — TypeScript Types ────────────
// Pro Raça Rações · Gestão de Pessoas

import type { SetorFabrica } from './safety'
import type { RoadmapStageEntry } from './roadmap'

// ── Enums / union types ───────────────────────────────────────

export type TipoVinculo = 'clt' | 'pj' | 'temporario' | 'terceirizado' | 'estagiario'
export type Turno       = 'A' | 'B' | 'C' | 'administrativo' | 'externo'
export type NivelAcesso = 'operador' | 'lider' | 'supervisor' | 'gerente' | 'diretor'
export type StatusPerformance = 'excelente' | 'muito_bom' | 'bom' | 'atencao' | 'critico'
export type StatusEmployee    = 'ativo' | 'inativo' | 'afastado' | 'ferias' | 'desligado'

export const STATUS_PERFORMANCE_META: Record<StatusPerformance, { label: string; color: string; bg: string; min: number; max: number }> = {
  excelente: { label: 'Excelente',          color: '#166534', bg: 'rgba(22,101,52,0.1)',   min: 90, max: 100 },
  muito_bom: { label: 'Muito Bom',          color: '#16a34a', bg: 'rgba(22,163,74,0.1)',   min: 75, max: 89  },
  bom:       { label: 'Bom',               color: '#2563eb', bg: 'rgba(37,99,235,0.1)',   min: 60, max: 74  },
  atencao:   { label: 'Atenção Necessária', color: '#d97706', bg: 'rgba(217,119,6,0.1)',   min: 40, max: 59  },
  critico:   { label: 'Crítico',           color: '#dc2626', bg: 'rgba(220,38,38,0.1)',   min: 0,  max: 39  },
}

export const TIPO_VINCULO_META: Record<TipoVinculo, { label: string; color: string }> = {
  clt:          { label: 'CLT',         color: '#166534' },
  pj:           { label: 'PJ',          color: '#2563eb' },
  temporario:   { label: 'Temporário',  color: '#d97706' },
  terceirizado: { label: 'Terceirizado',color: '#7c3aed' },
  estagiario:   { label: 'Estagiário',  color: '#0891b2' },
}

export const STATUS_EMPLOYEE_META: Record<StatusEmployee, { label: string; color: string; bg: string }> = {
  ativo:     { label: 'Ativo',      color: '#166534', bg: 'rgba(22,101,52,0.1)'   },
  inativo:   { label: 'Inativo',    color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  afastado:  { label: 'Afastado',   color: '#d97706', bg: 'rgba(217,119,6,0.1)'   },
  ferias:    { label: 'Férias',     color: '#2563eb', bg: 'rgba(37,99,235,0.1)'   },
  desligado: { label: 'Desligado',  color: '#dc2626', bg: 'rgba(220,38,38,0.1)'   },
}

// ── Employee (master record) ──────────────────────────────────

export interface Employee {
  id:                    string
  nome:                  string
  matricula:             string
  codigoInterno?:        string
  cpf?:                  string
  rg?:                   string
  departamento:          string
  setor:                 SetorFabrica
  cargo:                 string
  supervisor:            string
  supervisorId?:         string
  tipoVinculo:           TipoVinculo
  turno:                 Turno
  dataAdmissao:          Date
  dataDemissao?:         Date
  status:                StatusEmployee
  nivelAcesso:           NivelAcesso
  email?:                string
  telefone?:             string
  fotoUrl?:              string
  // Performance aggregate (recalculated on each evaluation)
  scorePerformance:      number         // 0-100
  statusPerformance:     StatusPerformance
  totalAvisos:           number
  totalReconhecimentos:  number
  totalEvaluacoes:       number
  ultimaAvaliacao?:      Date
  // History counts
  totalIncidentesSeg:    number         // from safety system
  totalDDSPresencas:     number
  totalEpisAtivos:       number
  // Capacitação & NRs — certificações com validade
  totalCertificacoesVencidas: number
  totalCertificacoesAVencer:  number
  // Banco de Horas — saldo atual (positivo = crédito, negativo = débito)
  saldoBancoHoras:       number
  // Roadmap / Jornada do Colaborador
  roadmapTemplateId?:    string             // ID do template ativo
  roadmapStages?:        RoadmapStageEntry[]
  observacoes?:          string
  createdBy?:            string
  createdAt?:            Date
  updatedAt?:            Date
}

// ── Employee Documents ────────────────────────────────────────

export type EmployeeDocumentType =
  | 'contrato'
  | 'identidade'
  | 'cpf'
  | 'ctps'
  | 'aso'
  | 'treinamento'
  | 'escolaridade'
  | 'outros'

export interface EmployeeDocument {
  id:             string
  employeeId:     string
  type:           EmployeeDocumentType
  name:           string        // label descritivo
  fileName:       string        // nome original do arquivo
  fileUrl:        string        // Firebase Storage URL
  fileType:       string        // MIME type
  fileSize:       number        // bytes
  uploadedBy?:    string
  uploadedAt?:    Date
  dataRealizacao?:Date          // data de realização do treinamento/certificação
  dataValidade?:  Date          // data de validade (NRs, ASO etc.)
}

export const EMPLOYEE_DOC_META: Record<EmployeeDocumentType, { label: string; icon: string; color: string }> = {
  contrato:    { label: 'Contrato de Trabalho',    icon: '📄', color: '#166534' },
  identidade:  { label: 'Identidade (RG/CNH)',     icon: '🪪', color: '#2563eb' },
  cpf:         { label: 'CPF',                     icon: '🔢', color: '#7c3aed' },
  ctps:        { label: 'Carteira de Trabalho',    icon: '📒', color: '#0891b2' },
  aso:         { label: 'ASO / Atestado Médico',   icon: '🏥', color: '#dc2626' },
  treinamento: { label: 'Certificado / Treinamento', icon: '🎓', color: '#d97706' },
  escolaridade:{ label: 'Diploma / Escolaridade',  icon: '📜', color: '#16a34a' },
  outros:      { label: 'Outros',                  icon: '📎', color: '#64748b' },
}

// ── Certificações / NRs — status de validade ──────────────────

export type StatusCertificacao = 'valido' | 'a_vencer' | 'vencido'

export const STATUS_CERTIFICACAO_META: Record<StatusCertificacao, { label: string; icon: string; color: string; bg: string }> = {
  valido:   { label: 'Válido',     icon: '✅', color: '#166534', bg: 'rgba(22,101,52,0.1)' },
  a_vencer: { label: 'A Vencer',   icon: '⚠️', color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
  vencido:  { label: 'Vencido',    icon: '🔴', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
}

/** Calcula o status de validade de uma certificação/treinamento. Janela de "a vencer": 30 dias. */
export function computeCertStatus(dataValidade?: Date): StatusCertificacao | null {
  if (!dataValidade) return null
  const now = new Date()
  if (dataValidade < now) return 'vencido'
  const limite = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  if (dataValidade < limite) return 'a_vencer'
  return 'valido'
}

// ── Timeline Event ────────────────────────────────────────────

export type TipoEvento =
  | 'aviso_verbal' | 'aviso_escrito' | 'suspensao' | 'conduta'
  | 'reconhecimento' | 'excelencia' | 'lideranca' | 'seguranca_positivo'
  | 'avaliacao_performance' | 'nota_supervisor'
  | 'promocao' | 'transferencia_setor' | 'mudanca_cargo'
  | 'atraso' | 'falta_injustificada' | 'absenteismo'
  | 'treinamento' | 'certificacao'
  | 'incidente_seguranca' | 'quase_acidente' | 'epi_entrega' | 'dds_presenca'
  | 'banco_horas_credito' | 'banco_horas_debito'
  | 'admissao' | 'afastamento' | 'retorno' | 'desligamento'
  | 'etapa_roadmap'

export const TIPO_EVENTO_META: Record<TipoEvento, { label: string; icon: string; positivo: boolean; categoria: string }> = {
  aviso_verbal:         { label: 'Aviso Verbal',            icon: '⚠️', positivo: false, categoria: 'disciplinar' },
  aviso_escrito:        { label: 'Aviso Escrito',           icon: '📄', positivo: false, categoria: 'disciplinar' },
  suspensao:            { label: 'Suspensão',               icon: '🚫', positivo: false, categoria: 'disciplinar' },
  conduta:              { label: 'Ocorrência de Conduta',   icon: '⛔', positivo: false, categoria: 'disciplinar' },
  reconhecimento:       { label: 'Reconhecimento',          icon: '🏆', positivo: true,  categoria: 'reconhecimento' },
  excelencia:           { label: 'Excelência Operacional',  icon: '⭐', positivo: true,  categoria: 'reconhecimento' },
  lideranca:            { label: 'Reconh. de Liderança',    icon: '👑', positivo: true,  categoria: 'reconhecimento' },
  seguranca_positivo:   { label: 'Comportamento Seguro',    icon: '🛡️', positivo: true,  categoria: 'reconhecimento' },
  avaliacao_performance:{ label: 'Avaliação de Desempenho', icon: '📊', positivo: true,  categoria: 'avaliacao' },
  nota_supervisor:      { label: 'Nota do Supervisor',      icon: '📝', positivo: true,  categoria: 'supervisor' },
  promocao:             { label: 'Promoção',                icon: '🎯', positivo: true,  categoria: 'carreira' },
  transferencia_setor:  { label: 'Transferência de Setor',  icon: '🔄', positivo: true,  categoria: 'carreira' },
  mudanca_cargo:        { label: 'Mudança de Cargo',        icon: '📋', positivo: true,  categoria: 'carreira' },
  atraso:               { label: 'Atraso',                  icon: '⏰', positivo: false, categoria: 'frequencia' },
  falta_injustificada:  { label: 'Falta Injustificada',     icon: '❌', positivo: false, categoria: 'frequencia' },
  absenteismo:          { label: 'Padrão de Absenteísmo',   icon: '📅', positivo: false, categoria: 'frequencia' },
  treinamento:          { label: 'Treinamento Realizado',   icon: '🎓', positivo: true,  categoria: 'desenvolvimento' },
  certificacao:         { label: 'Certificação Obtida',     icon: '🏅', positivo: true,  categoria: 'desenvolvimento' },
  incidente_seguranca:  { label: 'Incidente de Segurança',  icon: '🚨', positivo: false, categoria: 'seguranca' },
  quase_acidente:       { label: 'Quase Acidente',          icon: '⚠️', positivo: false, categoria: 'seguranca' },
  epi_entrega:          { label: 'Entrega de EPI',          icon: '🦺', positivo: true,  categoria: 'seguranca' },
  dds_presenca:         { label: 'Presença em DDS',         icon: '📢', positivo: true,  categoria: 'seguranca' },
  banco_horas_credito:  { label: 'Crédito Banco de Horas',  icon: '➕', positivo: true,  categoria: 'frequencia' },
  banco_horas_debito:   { label: 'Débito Banco de Horas',   icon: '➖', positivo: false, categoria: 'frequencia' },
  admissao:             { label: 'Admissão',                icon: '✅', positivo: true,  categoria: 'carreira' },
  afastamento:          { label: 'Afastamento',             icon: '🏥', positivo: false, categoria: 'frequencia' },
  retorno:              { label: 'Retorno ao Trabalho',     icon: '↩️', positivo: true,  categoria: 'frequencia' },
  desligamento:         { label: 'Desligamento',            icon: '🔴', positivo: false, categoria: 'carreira' },
  etapa_roadmap:        { label: 'Etapa do Roadmap',         icon: '🧭', positivo: true,  categoria: 'carreira' },
}

export interface EmployeeHistoryEvent {
  id:              string
  employeeId:      string
  tipo:            TipoEvento
  titulo:          string
  descricao:       string
  positivo:        boolean
  severidade?:     'baixa' | 'media' | 'alta' | 'critica'
  valor?:          number     // e.g. score for evaluation
  registradoPor:   string
  registradoPorId?:string
  data:            Date
  referenceId?:    string     // link to safety record, evaluation, etc.
  referenceType?:  string     // 'evaluation' | 'dds' | 'epi' | 'occurrence' | etc.
  createdAt?:      Date
}

// ── Roadmap 360° / Jornada do Colaborador ─────────────────────

// Re-exports centralizados em types/roadmap.ts
export type {
  StatusEtapa, SlaStatus, RoadmapStageEntry, RoadmapAuditEntry,
  ChecklistItem, RoadmapTemplate, RoadmapTemplateStage, RoadmapTipo,
} from './roadmap'
export {
  STATUS_ETAPA_META, STATUS_ETAPA_ORDER, SLA_STATUS_META,
  calcSlaStatus, isStatusTerminal,
} from './roadmap'

// EtapaRoadmap — legado: mantido para retrocompat com dados v1 no Firestore
export type EtapaRoadmap =
  | 'selecao' | 'admissao' | 'integracao' | 'capacitacao'
  | 'desenvolvimento' | 'promocao' | 'desligamento'

export const ETAPA_ROADMAP_ORDER: EtapaRoadmap[] = [
  'selecao', 'admissao', 'integracao', 'capacitacao', 'desenvolvimento', 'promocao', 'desligamento',
]

export const ETAPA_ROADMAP_META: Record<EtapaRoadmap, { numero: number; label: string; icon: string; descricao: string }> = {
  selecao:         { numero: 1, label: 'Seleção',         icon: '🔍', descricao: 'Recrutamento, entrevistas e parecer do RH.' },
  admissao:        { numero: 2, label: 'Admissão',        icon: '📝', descricao: 'Documentação, contrato e exame admissional.' },
  integracao:      { numero: 3, label: 'Integração',      icon: '🤝', descricao: 'Cultura organizacional, normas internas e segurança do trabalho.' },
  capacitacao:     { numero: 4, label: 'Capacitação',     icon: '🎓', descricao: 'Treinamentos, cursos, certificações e NRs.' },
  desenvolvimento: { numero: 5, label: 'Desenvolvimento', icon: '📈', descricao: 'Polivalência, habilidades adquiridas e projetos realizados.' },
  promocao:        { numero: 6, label: 'Promoção',        icon: '🎯', descricao: 'Evolução de cargo, função ou remuneração.' },
  desligamento:    { numero: 7, label: 'Desligamento',    icon: '🔴', descricao: 'Encerramento do vínculo empregatício.' },
}

// ── Performance Evaluation ────────────────────────────────────

export interface EvaluationCriterio {
  produtividade:       number  // 0-10
  qualidade:           number
  prazo:               number
  responsabilidade:    number
  resolucaoProblemas:  number
  iniciativa:          number
  colaboracao:         number
  lideranca:           number
  disciplina:          number
  conformidade:        number
}

export const EVALUATION_CRITERIOS: { key: keyof EvaluationCriterio; label: string; peso: number }[] = [
  { key: 'produtividade',      label: 'Produtividade',          peso: 0.15 },
  { key: 'qualidade',          label: 'Qualidade do Trabalho',  peso: 0.15 },
  { key: 'prazo',              label: 'Cumprimento de Prazos',  peso: 0.10 },
  { key: 'responsabilidade',   label: 'Responsabilidade',       peso: 0.10 },
  { key: 'resolucaoProblemas', label: 'Resolução de Problemas', peso: 0.10 },
  { key: 'iniciativa',         label: 'Iniciativa',             peso: 0.10 },
  { key: 'colaboracao',        label: 'Colaboração / Equipe',   peso: 0.10 },
  { key: 'lideranca',          label: 'Liderança',              peso: 0.05 },
  { key: 'disciplina',         label: 'Disciplina Operacional', peso: 0.10 },
  { key: 'conformidade',       label: 'Conformidade com Normas',peso: 0.05 },
]

export function calcEvaluationScore(c: EvaluationCriterio): number {
  const raw = EVALUATION_CRITERIOS.reduce((sum, crit) => {
    return sum + (c[crit.key] * 10 * crit.peso)
  }, 0)
  return Math.round(raw)
}

export function scoreToStatus(score: number): StatusPerformance {
  if (score >= 90) return 'excelente'
  if (score >= 75) return 'muito_bom'
  if (score >= 60) return 'bom'
  if (score >= 40) return 'atencao'
  return 'critico'
}

// ── Score 360° (modelo aditivo) ───────────────────────────────

/** Combina performance, disciplina, segurança, capacitação e reconhecimentos num único indicador 0-100. Calculado on-the-fly a partir de aggregates do Employee. */
export function calcScore360(emp: Employee): number {
  const raw =
    emp.scorePerformance
    - emp.totalAvisos                * 5
    - emp.totalIncidentesSeg         * 5
    - emp.totalCertificacoesVencidas * 10
    - emp.totalCertificacoesAVencer  * 3
    + emp.totalReconhecimentos       * 3

  return Math.min(100, Math.max(0, Math.round(raw)))
}

export interface EmployeeEvaluation {
  id:                    string
  employeeId:            string
  employeeNome:          string
  avaliadorNome:         string
  avaliadorId?:          string
  periodo:               string    // "2026-T1", "2026-04"
  data:                  Date
  criterios:             EvaluationCriterio
  score:                 number    // 0-100
  status:                StatusPerformance
  comentarios?:          string
  planoMelhoria?:        string
  aprovadoPorSupervisor: boolean
  aprovadoPor?:          string
  createdAt?:            Date
  updatedAt?:            Date
}

// ── Warning ───────────────────────────────────────────────────

export type TipoAviso = 'verbal' | 'escrito' | 'suspensao' | 'conduta' | 'compliance'

export const TIPO_AVISO_META: Record<TipoAviso, { label: string; color: string; bg: string }> = {
  verbal:     { label: 'Advertência Verbal',    color: '#d97706', bg: 'rgba(217,119,6,0.1)'   },
  escrito:    { label: 'Advertência Escrita',   color: '#ea580c', bg: 'rgba(234,88,12,0.1)'   },
  suspensao:  { label: 'Suspensão',             color: '#dc2626', bg: 'rgba(220,38,38,0.1)'   },
  conduta:    { label: 'Ocorrência de Conduta', color: '#7c3aed', bg: 'rgba(124,58,237,0.1)'  },
  compliance: { label: 'Falha de Compliance',   color: '#7f1d1d', bg: 'rgba(127,29,29,0.1)'   },
}

export interface EmployeeWarning {
  id:            string
  employeeId:    string
  tipo:          TipoAviso
  titulo:        string
  descricao:     string
  data:          Date
  emissorNome:   string
  emissorId?:    string
  assinado:      boolean
  resolvido:     boolean
  resolucao?:    string
  createdAt?:    Date
}

// ── Recognition ───────────────────────────────────────────────

export type TipoReconhecimento = 'desempenho' | 'lideranca' | 'seguranca' | 'produtividade' | 'equipe' | 'inovacao'

export const TIPO_RECONHECIMENTO_META: Record<TipoReconhecimento, { label: string; color: string; bg: string; icon: string }> = {
  desempenho:   { label: 'Excelência em Desempenho', color: '#166534', bg: 'rgba(22,101,52,0.1)',  icon: '🏆' },
  lideranca:    { label: 'Reconhecimento de Líder',  color: '#7c3aed', bg: 'rgba(124,58,237,0.1)', icon: '👑' },
  seguranca:    { label: 'Comportamento Seguro',     color: '#2563eb', bg: 'rgba(37,99,235,0.1)',  icon: '🛡️' },
  produtividade:{ label: 'Alta Produtividade',       color: '#16a34a', bg: 'rgba(22,163,74,0.1)',  icon: '⭐' },
  equipe:       { label: 'Trabalho em Equipe',       color: '#0891b2', bg: 'rgba(8,145,178,0.1)',  icon: '🤝' },
  inovacao:     { label: 'Inovação',                 color: '#ea580c', bg: 'rgba(234,88,12,0.1)',  icon: '💡' },
}

export interface EmployeeRecognition {
  id:           string
  employeeId:   string
  tipo:         TipoReconhecimento
  titulo:       string
  descricao:    string
  data:         Date
  emissorNome:  string
  emissorId?:   string
  publico:      boolean
  createdAt?:   Date
}

// ── Banco de Horas ────────────────────────────────────────────

export type TipoLancamentoBancoHoras = 'credito' | 'debito'

export const TIPO_LANCAMENTO_BH_META: Record<TipoLancamentoBancoHoras, { label: string; color: string; bg: string; icon: string }> = {
  credito: { label: 'Crédito', color: '#166534', bg: 'rgba(22,101,52,0.1)', icon: '➕' },
  debito:  { label: 'Débito',  color: '#dc2626', bg: 'rgba(220,38,38,0.1)', icon: '➖' },
}

export interface TimebankEntry {
  id:                string
  employeeId:        string
  tipo:              TipoLancamentoBancoHoras
  horas:             number     // sempre positivo; sinal vem de `tipo`
  motivo:            string
  data:              Date
  saldoResultante?:  number     // saldo acumulado após este lançamento
  registradoPorNome: string
  registradoPorId?:  string
  createdAt?:        Date
}

// ── Banco de Horas v2 — Registro de Ponto ────────────────────

export type StatusRegistroBH = 'pendente' | 'aprovado' | 'rejeitado'

export const STATUS_REGISTRO_BH_META: Record<StatusRegistroBH, { label: string; color: string; bg: string; icon: string }> = {
  pendente:  { label: 'Pendente',  color: '#d97706', bg: 'rgba(217,119,6,0.1)',  icon: '⏳' },
  aprovado:  { label: 'Aprovado',  color: '#166534', bg: 'rgba(22,101,52,0.1)', icon: '✅' },
  rejeitado: { label: 'Rejeitado', color: '#dc2626', bg: 'rgba(220,38,38,0.1)', icon: '❌' },
}

export interface TimebankRegistro {
  id:                string
  employeeId:        string
  data:              Date
  entrada?:          string       // HH:MM
  inicioPausa?:      string       // HH:MM
  fimPausa?:         string       // HH:MM
  saida?:            string       // HH:MM
  jornadaPrevista:   number       // horas contratadas
  horasTrabalhadas:  number       // calculado
  saldoDia:          number       // horasTrabalhadas - jornadaPrevista
  motivo?:           string
  status:            StatusRegistroBH
  aprovadoPorNome?:  string
  aprovadoEm?:       Date
  registradoPorNome: string
  createdAt?:        Date
}

export function calcHorasFromTimes(
  entrada: string,
  saida: string,
  inicioPausa?: string,
  fimPausa?: string,
): number {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  let total = toMin(saida) - toMin(entrada)
  if (inicioPausa && fimPausa) total -= (toMin(fimPausa) - toMin(inicioPausa))
  return Math.max(0, parseFloat((total / 60).toFixed(2)))
}

export function fmtSaldo(h: number): string {
  const abs = Math.abs(h)
  const hrs = Math.floor(abs)
  const min = Math.round((abs - hrs) * 60)
  const sign = h >= 0 ? '+' : '-'
  return `${sign}${hrs}h${min > 0 ? `${String(min).padStart(2, '0')}min` : ''}`
}

// ── Supervisor Note ───────────────────────────────────────────

export type CategoriaNota = 'comportamento' | 'desempenho' | 'presenca' | 'seguranca' | 'desenvolvimento' | 'geral'

export interface SupervisorNote {
  id:              string
  employeeId:      string
  supervisorNome:  string
  supervisorId?:   string
  nota:            string
  categoria:       CategoriaNota
  positivo:        boolean
  data:            Date
  confidencial:    boolean
  createdAt?:      Date
}

// ── Department History ────────────────────────────────────────

export interface DepartmentMove {
  id:              string
  employeeId:      string
  setorAnterior:   string
  cargoAnterior:   string
  setorNovo:       string
  cargoNovo:       string
  motivo:          string
  aprovadoPor:     string
  data:            Date
  createdAt?:      Date
}

// ── Dashboard KPI snapshot ────────────────────────────────────

export interface EmployeeKPISnapshot {
  totalAtivos:         number
  totalInAtivos:       number
  totalAfastados:      number
  totalTerceirizados:  number
  avgScore:            number
  excelentes:          number
  criticos:            number
  atencao:             number
  totalAvisosNoMes:    number
  totalReconhNoMes:    number
  topPerformers:       Array<{ id: string; nome: string; score: number; cargo: string }>
  criticalList:        Array<{ id: string; nome: string; score: number; cargo: string }>
}

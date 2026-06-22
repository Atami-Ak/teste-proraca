// ── KPI Performance System — Types ──────────────────────────────
// Pro Raça Rações · Avaliação de Desempenho por Indicadores

export type PerformancePeriod = 'marco' | 'junho' | 'setembro' | 'dezembro'
export type Parecer = 'aprovado' | 'reprovado'

export interface KPIIndicator {
  numero: number
  categoria: string
  descricao: string
}

export interface KPIEvaluationScore {
  indicadorNumero: number
  nota: number
  naoConformidade?: string
}

export interface KPIEvaluation {
  id: string
  employeeId: string
  employeeNome: string
  avaliadorNome: string
  periodo: PerformancePeriod
  ano: number
  data: Date
  scores: KPIEvaluationScore[]
  notaFinal: number
  percentual: number
  parecer: Parecer
  observacoes?: string
  createdAt?: Date
}

export const PERFORMANCE_PERIOD_META: Record<PerformancePeriod, { label: string; mes: number }> = {
  marco:    { label: 'Março',    mes: 3  },
  junho:    { label: 'Junho',    mes: 6  },
  setembro: { label: 'Setembro', mes: 9  },
  dezembro: { label: 'Dezembro', mes: 12 },
}

export const PARECER_META: Record<Parecer, { label: string; color: string; bg: string }> = {
  aprovado:  { label: 'Aprovado',  color: '#166534', bg: 'rgba(22,101,52,0.1)'  },
  reprovado: { label: 'Reprovado', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
}

// ── 54 indicadores universais (valem para todos os cargos) ────────

export const KPI_INDICATORS: KPIIndicator[] = [
  { numero: 1,  categoria: 'Operação de Equipamentos e Máquinas',             descricao: 'Tempo médio necessário para preparar e ajustar os equipamentos antes do início da produção.' },
  { numero: 2,  categoria: 'Conhecimento em Processos de Produção',            descricao: 'Taxa de Produção' },
  { numero: 3,  categoria: 'Conhecimento em Processos de Produção',            descricao: 'Taxa de Conformidade com Procedimentos Operacionais' },
  { numero: 4,  categoria: 'Conhecimento em Processos de Produção',            descricao: 'Índice de Retrabalho' },
  { numero: 5,  categoria: 'Controle de Qualidade',                            descricao: 'Percentual de produtos que não atendem aos padrões de qualidade' },
  { numero: 6,  categoria: 'Controle de Qualidade',                            descricao: 'Custo total associado à não conformidade, incluindo retrabalho, desperdícios e devoluções' },
  { numero: 7,  categoria: 'Controle de Qualidade',                            descricao: 'Tempo médio necessário para identificar e resolver problemas de qualidade' },
  { numero: 8,  categoria: 'Leitura e Interpretação de Instruções de Trabalho',descricao: 'Percentual de tarefas realizadas conforme as instruções de trabalho fornecidas' },
  { numero: 9,  categoria: 'Leitura e Interpretação de Instruções de Trabalho',descricao: 'Quantidade de erros ou problemas causados por má interpretação das instruções de trabalho' },
  { numero: 10, categoria: 'Leitura e Interpretação de Instruções de Trabalho',descricao: 'Tempo médio gasto para realizar tarefas de acordo com as instruções de trabalho' },
  { numero: 11, categoria: 'Boas Práticas de Fabricação (BPF)',                descricao: 'Percentual de conformidade com as boas práticas de fabricação durante o processo produtivo' },
  { numero: 12, categoria: 'Boas Práticas de Fabricação (BPF)',                descricao: 'Quantidade de incidentes ou problemas identificados que violam as boas práticas de fabricação' },
  { numero: 13, categoria: 'Boas Práticas de Fabricação (BPF)',                descricao: 'Percentual de colaboradores que completaram com sucesso o treinamento em boas práticas de fabricação' },
  { numero: 14, categoria: 'Atenção',                                          descricao: 'Baixa quantidade de erros nos processos' },
  { numero: 15, categoria: 'Atenção',                                          descricao: 'Evita cometer o mesmo erro mais de uma vez' },
  { numero: 16, categoria: 'Proatividade',                                     descricao: 'Não espera para que seja mandado executar atividades que estão em evidência' },
  { numero: 17, categoria: 'Trabalho em Equipe',                               descricao: 'Mesmo estando ocupado, busca na medida do possível colaborar com sua equipe' },
  { numero: 18, categoria: 'Trabalho em Equipe',                               descricao: 'Não espera pedido para ajudar quem está precisando' },
  { numero: 19, categoria: 'Trabalho em Equipe',                               descricao: 'Busca o resultado comum e não apenas o individual' },
  { numero: 20, categoria: 'Responsabilidade',                                 descricao: 'Não falta de forma não justificada' },
  { numero: 21, categoria: 'Responsabilidade',                                 descricao: 'Mantém a pontualidade' },
  { numero: 22, categoria: 'Responsabilidade',                                 descricao: 'Assume a responsabilidade pelos seus atos' },
  { numero: 23, categoria: 'Responsabilidade',                                 descricao: 'Planeja e organiza suas atividades' },
  { numero: 24, categoria: 'Responsabilidade',                                 descricao: 'Comunica-se de forma clara' },
  { numero: 25, categoria: 'Responsabilidade',                                 descricao: 'Segue normas e procedimentos' },
  { numero: 26, categoria: 'Responsabilidade',                                 descricao: 'Preocupa-se com o impacto de suas ações' },
  { numero: 27, categoria: 'Disciplina',                                       descricao: 'Segue uma rotina estruturada' },
  { numero: 28, categoria: 'Disciplina',                                       descricao: 'Cumpre prazos e regras' },
  { numero: 29, categoria: 'Disciplina',                                       descricao: 'Controla impulsos e distrações' },
  { numero: 30, categoria: 'Disciplina',                                       descricao: 'Mantém o compromisso' },
  { numero: 31, categoria: 'Disciplina',                                       descricao: 'Realiza tarefas de forma consistente' },
  { numero: 32, categoria: 'Disciplina',                                       descricao: 'Prioriza atividades importantes' },
  { numero: 33, categoria: 'Organização',                                      descricao: 'Administra bem o tempo' },
  { numero: 34, categoria: 'Organização',                                      descricao: 'Organiza seu espaço físico' },
  { numero: 35, categoria: 'Organização',                                      descricao: 'Documenta e registra informações' },
  { numero: 36, categoria: 'Organização',                                      descricao: 'Antecipação e preparação' },
  { numero: 37, categoria: 'Determinação',                                     descricao: 'Mesmo nas metas mais ousadas, busca alcançar o sucesso' },
  { numero: 38, categoria: 'Determinação',                                     descricao: 'Vence as barreiras das dificuldades para atingir os objetivos' },
  { numero: 39, categoria: 'Comportamento Ético',                              descricao: 'Mesmo não sendo confortável, fala a verdade' },
  { numero: 40, categoria: 'Comportamento Ético',                              descricao: 'Não fala somente o que o outro quer ouvir, mentindo ou omitindo situações' },
  { numero: 41, categoria: 'Resiliência',                                      descricao: 'Tem respostas positivas em meio a dificuldades' },
  { numero: 42, categoria: 'Resiliência',                                      descricao: 'Busca mesmo em momentos de crise dar o seu melhor' },
  { numero: 43, categoria: 'Flexibilidade',                                    descricao: 'Administra muitas atividades ao mesmo tempo' },
  { numero: 44, categoria: 'Flexibilidade',                                    descricao: 'Recebe bem mudanças trazidas pela empresa' },
  { numero: 45, categoria: 'Flexibilidade',                                    descricao: 'Quando não concorda com as mudanças, sugere alterações com intenção de melhorar processos e práticas' },
  { numero: 46, categoria: 'Flexibilidade',                                    descricao: 'Tem facilidade de adaptação a novas realidades' },
  { numero: 47, categoria: 'Flexibilidade',                                    descricao: 'Tem a cabeça aberta para o aprendizado' },
  { numero: 48, categoria: 'Respeito',                                         descricao: 'Trata as pessoas de forma respeitosa' },
  { numero: 49, categoria: 'Respeito',                                         descricao: 'Mesmo em situações que se sente desrespeitado, age com respeito ao próximo' },
  { numero: 50, categoria: 'Respeito',                                         descricao: 'Tem a capacidade de respeitar opiniões divergentes' },
  { numero: 51, categoria: 'Empatia',                                          descricao: 'Demonstra ânimo, positividade e boa vontade no atendimento ou contato com o cliente ou parceiro' },
  { numero: 52, categoria: 'Empatia',                                          descricao: 'As pessoas sentem liberdade de lhe procurar e se sentem entendidas e ouvidas' },
  { numero: 53, categoria: 'Empatia',                                          descricao: 'Compreende as necessidades dos colaboradores' },
  { numero: 54, categoria: 'Empatia',                                          descricao: 'Ser cortês e realizar atendimento personalizado' },
]

export const KPI_CATEGORIES: string[] = [...new Set(KPI_INDICATORS.map(i => i.categoria))]

export function calcKPIResult(scores: KPIEvaluationScore[]): {
  notaFinal: number
  percentual: number
  parecer: Parecer
} {
  const sum = scores.reduce((acc, s) => acc + s.nota, 0)
  const notaFinal = Math.round((sum / KPI_INDICATORS.length) * 10) / 10
  const percentual = Math.round(notaFinal * 10)
  const parecer: Parecer = notaFinal >= 7 ? 'aprovado' : 'reprovado'
  return { notaFinal, percentual, parecer }
}

export function notaColor(nota: number): string {
  if (nota >= 8) return '#166534'
  if (nota >= 6) return '#2563eb'
  if (nota >= 4) return '#d97706'
  return '#dc2626'
}

export function categoryAvg(categoria: string, scores: KPIEvaluationScore[]): number {
  const nums = KPI_INDICATORS
    .filter(i => i.categoria === categoria)
    .map(i => scores.find(s => s.indicadorNumero === i.numero)?.nota ?? 0)
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

/**
 * inspecao-obra-catalog.ts — Static checklist template for construction inspections
 *
 * 8 sections, ~50 items, weights sum to 1.0.
 * Items use positive framing: "O canteiro está organizado" (not "canteiro desorganizado?")
 * Score: 0=Muito ruim → 10=Excelente; null=Não avaliado
 */

export interface CatalogItem {
  id:      string
  label:   string
  critico: boolean
  dica?:   string   // evaluation hint shown on hover
}

export interface CatalogSection {
  id:        string
  label:     string
  icon:      string
  peso:      number
  itens:     CatalogItem[]
}

export const INSPECAO_CATALOG: CatalogSection[] = [
  {
    id:   'canteiro',
    label:'Organização do Canteiro',
    icon: '🏗️',
    peso: 0.10,
    itens: [
      { id: 'c01', label: 'Área de trabalho está limpa e organizada',                  critico: false },
      { id: 'c02', label: 'Materiais estão armazenados adequadamente',                 critico: false },
      { id: 'c03', label: 'Entulho e resíduos estão sendo descartados corretamente',   critico: false },
      { id: 'c04', label: 'Sinalização do canteiro está visível e completa',           critico: false },
      { id: 'c05', label: 'Passagens e saídas de emergência estão desobstruídas',      critico: true,  dica: 'Saídas bloqueadas = risco imediato' },
      { id: 'c06', label: 'Equipamentos e ferramentas estão guardados após o uso',     critico: false },
      { id: 'c07', label: 'Banheiro/vestiário disponível e em condições de uso',       critico: false },
      { id: 'c08', label: 'Área de convivência está higienizada',                      critico: false },
    ],
  },
  {
    id:   'qualidade',
    label:'Qualidade de Execução',
    icon: '🔩',
    peso: 0.25,
    itens: [
      { id: 'q01', label: 'Serviços executados estão em conformidade com o projeto',   critico: true,  dica: 'Desvio de projeto pode gerar retrabalho total' },
      { id: 'q02', label: 'Acabamentos atendem ao padrão técnico contratado',          critico: true },
      { id: 'q03', label: 'Estruturas e elementos são seguros e bem executados',       critico: true },
      { id: 'q04', label: 'Não há retrabalho visível nas últimas etapas concluídas',   critico: true },
      { id: 'q05', label: 'Instalações (elétricas/hidráulicas) seguem normas técnicas', critico: false },
      { id: 'q06', label: 'Materiais utilizados atendem às especificações do contrato', critico: false },
      { id: 'q07', label: 'Juntas, vedações e revestimentos foram aplicados corretamente', critico: false },
      { id: 'q08', label: 'Há controle de qualidade interno pela empreiteira',         critico: false },
    ],
  },
  {
    id:   'prazo',
    label:'Controle de Prazo',
    icon: '📅',
    peso: 0.15,
    itens: [
      { id: 'p01', label: 'Percentual de execução está alinhado ao cronograma',        critico: true,  dica: 'Atraso >15% do previsto é crítico' },
      { id: 'p02', label: 'Equipe está presente em quantidade suficiente no canteiro', critico: false },
      { id: 'p03', label: 'Cronograma atualizado está disponível e sendo seguido',     critico: false },
      { id: 'p04', label: 'Mobilização de recursos (máquinas/pessoal) está adequada', critico: false },
      { id: 'p05', label: 'Pedidos de materiais estão sendo feitos com antecedência',  critico: false },
      { id: 'p06', label: 'Não há paralisações injustificadas registradas no período', critico: false },
    ],
  },
  {
    id:   'seguranca',
    label:'Segurança do Trabalho',
    icon: '🦺',
    peso: 0.20,
    itens: [
      { id: 's01', label: 'Todos os trabalhadores estão usando EPIs adequados',        critico: true,  dica: 'Trabalho sem EPI = autuação + risco de acidente' },
      { id: 's02', label: 'Andaimes e estruturas temporárias estão seguras',           critico: true },
      { id: 's03', label: 'Instalações elétricas provisórias estão protegidas',        critico: true },
      { id: 's04', label: 'Nenhum trabalho em altura sem cinto de segurança',          critico: true },
      { id: 's05', label: 'Extintores e kit de primeiros socorros estão no canteiro',  critico: true },
      { id: 's06', label: 'PPRA/PCMAT está sendo seguido e documentado',              critico: true },
      { id: 's07', label: 'Ferramenta e equipamentos estão em bom estado de conservação', critico: false },
      { id: 's08', label: 'Não há exposição de terceiros ou moradores a riscos',       critico: true },
      { id: 's09', label: 'Treinamentos de segurança da equipe estão atualizados',     critico: false },
    ],
  },
  {
    id:   'materiais',
    label:'Controle de Materiais',
    icon: '📦',
    peso: 0.10,
    itens: [
      { id: 'm01', label: 'Materiais no canteiro são compatíveis com o contrato',      critico: true,  dica: 'Substituição sem autorização é descumprimento contratual' },
      { id: 'm02', label: 'Há controle de estoque ou nota fiscal dos materiais',       critico: false },
      { id: 'm03', label: 'Não há indício de desvio ou subtração de materiais',        critico: true },
      { id: 'm04', label: 'Materiais estão protegidos contra intempéries e danos',     critico: false },
      { id: 'm05', label: 'Não há desperdício excessivo de materiais na obra',         critico: false },
    ],
  },
  {
    id:   'equipe',
    label:'Equipe e Produtividade',
    icon: '👷',
    peso: 0.10,
    itens: [
      { id: 'e01', label: 'Responsável técnico ou encarregado está presente no canteiro', critico: true },
      { id: 'e02', label: 'Equipe demonstra conhecimento técnico nas atividades',      critico: false },
      { id: 'e03', label: 'Produtividade visível está compatível com o escopo',        critico: false },
      { id: 'e04', label: 'Comunicação com a supervisão é fluida e proativa',          critico: false },
      { id: 'e05', label: 'Registros de ponto / presença estão sendo mantidos',        critico: false },
      { id: 'e06', label: 'Não há conflitos ou intercorrências disciplinares no canteiro', critico: false },
    ],
  },
  {
    id:   'financeiro',
    label:'Controle Financeiro',
    icon: '💰',
    peso: 0.05,
    itens: [
      { id: 'f01', label: 'Medições apresentadas são condizentes com o executado',     critico: false },
      { id: 'f02', label: 'Não há solicitações de aditivos injustificadas',            critico: false },
      { id: 'f03', label: 'Notas fiscais e documentação financeira estão em ordem',    critico: false },
      { id: 'f04', label: 'Previsão de custo final está dentro do contrato original',  critico: false },
    ],
  },
  {
    id:   'operacoes',
    label:'Impacto nas Operações',
    icon: '⚙️',
    peso: 0.05,
    itens: [
      { id: 'o01', label: 'A obra não está gerando impacto operacional não previsto',  critico: true,  dica: 'Impacto operacional não previsto pode gerar penalidade contratual' },
      { id: 'o02', label: 'Ruído, poeira e vibração estão dentro do tolerável',        critico: false },
      { id: 'o03', label: 'Horários de trabalho estão sendo respeitados',              critico: false },
      { id: 'o04', label: 'Acessos e rotas internas estão devidamente coordenados',    critico: false },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────

export function buildEmptyInspecao(): import('@/types/obras').InspecaoSecao[] {
  return INSPECAO_CATALOG.map(sec => ({
    secaoId:    sec.id,
    label:      sec.label,
    peso:       sec.peso,
    scoreSecao: 0,
    itens: sec.itens.map(item => ({
      itemId:      item.id,
      label:       item.label,
      critico:     item.critico,
      nota:        null,
      observacao:  '',
    })),
  }))
}

export function getTotalItems(): number {
  return INSPECAO_CATALOG.reduce((s, sec) => s + sec.itens.length, 0)
}

export function getCriticosCount(): number {
  return INSPECAO_CATALOG.reduce((s, sec) => s + sec.itens.filter(i => i.critico).length, 0)
}

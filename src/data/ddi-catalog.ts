// ── DDI Checklist Catalog — Pro Raça Rações (Feed Factory) ───────────
// Daily Safety Inspection — 15 sections, ~120 items

import type { DDISecao } from '@/types/safety'

export interface CatalogItem {
  itemId:  string
  label:   string
  critico: boolean
}

export interface CatalogSection {
  secaoId: string
  label:   string
  icon:    string
  itens:   CatalogItem[]
}

export const DDI_CATALOG: CatalogSection[] = [
  {
    secaoId: 'epis',
    label:   'EPIs dos Colaboradores',
    icon:    '🦺',
    itens: [
      { itemId: 'epi-1',  label: 'Todos os colaboradores usam capacete corretamente',       critico: true  },
      { itemId: 'epi-2',  label: 'Proteção auditiva em uso nas áreas de ruído',             critico: true  },
      { itemId: 'epi-3',  label: 'Calçado de segurança adequado e em bom estado',           critico: true  },
      { itemId: 'epi-4',  label: 'Máscara respiratória em uso na área de moagem/mistura',   critico: true  },
      { itemId: 'epi-5',  label: 'Luvas adequadas ao risco da atividade',                   critico: false },
      { itemId: 'epi-6',  label: 'Óculos de proteção em uso quando necessário',             critico: false },
      { itemId: 'epi-7',  label: 'Vestimenta de trabalho limpa e sem partes soltas',        critico: false },
      { itemId: 'epi-8',  label: 'EPIs armazenados em local adequado e identificado',       critico: false },
    ],
  },
  {
    secaoId: 'incendio',
    label:   'Prevenção e Combate a Incêndio',
    icon:    '🔥',
    itens: [
      { itemId: 'inc-1',  label: 'Extintores visíveis, sinalizados e com acesso livre',     critico: true  },
      { itemId: 'inc-2',  label: 'Extintores dentro do prazo de validade (lacre íntegro)',  critico: true  },
      { itemId: 'inc-3',  label: 'Rotas de fuga desobstruídas e sinalizadas',               critico: true  },
      { itemId: 'inc-4',  label: 'Saídas de emergência funcionando e sem bloqueio',         critico: true  },
      { itemId: 'inc-5',  label: 'Hidrantes com acesso livre e mangueiras em bom estado',   critico: false },
      { itemId: 'inc-6',  label: 'Sinalização de emergência visível e em bom estado',       critico: false },
      { itemId: 'inc-7',  label: 'Materiais inflamáveis armazenados corretamente',          critico: true  },
      { itemId: 'inc-8',  label: 'Ausência de acúmulo de poeira em superfícies quentes',   critico: true  },
    ],
  },
  {
    secaoId: 'maquinario',
    label:   'Máquinas e Equipamentos',
    icon:    '⚙️',
    itens: [
      { itemId: 'maq-1',  label: 'Proteções e guardas instaladas nos equipamentos',         critico: true  },
      { itemId: 'maq-2',  label: 'Botões de emergência acessíveis e sinalizados',           critico: true  },
      { itemId: 'maq-3',  label: 'Equipamentos sem vazamentos de óleo ou fluido',           critico: false },
      { itemId: 'maq-4',  label: 'Painéis elétricos fechados, sem cabos expostos',          critico: true  },
      { itemId: 'maq-5',  label: 'Moinhos e misturadoras com proteções corretas',           critico: true  },
      { itemId: 'maq-6',  label: 'Transportadores com carcaças e tampas fixadas',           critico: true  },
      { itemId: 'maq-7',  label: 'Peletizadoras — barreiras de temperatura e pressão OK',  critico: true  },
      { itemId: 'maq-8',  label: 'Elevadores de caçamba sem acúmulo de resíduo',            critico: false },
      { itemId: 'maq-9',  label: 'Instrumentos de medição calibrados e legíveis',           critico: false },
    ],
  },
  {
    secaoId: 'eletrica',
    label:   'Instalações Elétricas',
    icon:    '⚡',
    itens: [
      { itemId: 'ele-1',  label: 'Quadros de distribuição fechados e identificados',        critico: true  },
      { itemId: 'ele-2',  label: 'Cabos sem emendas improvisadas ou fitas provisórias',     critico: true  },
      { itemId: 'ele-3',  label: 'Aterramento dos equipamentos verificado',                 critico: true  },
      { itemId: 'ele-4',  label: 'Iluminação de emergência funcionando',                    critico: false },
      { itemId: 'ele-5',  label: 'Sinalizações de risco elétrico presentes e visíveis',     critico: false },
      { itemId: 'ele-6',  label: 'Tags LOTO aplicadas em equipamentos em manutenção',       critico: true  },
    ],
  },
  {
    secaoId: 'ordem',
    label:   'Ordem, Limpeza e Organização',
    icon:    '🧹',
    itens: [
      { itemId: 'ord-1',  label: 'Piso seco, limpo e livre de obstruções',                 critico: true  },
      { itemId: 'ord-2',  label: 'Derrames de produto ou óleo limpos imediatamente',        critico: true  },
      { itemId: 'ord-3',  label: 'Materiais estocados de forma estável e organizada',       critico: false },
      { itemId: 'ord-4',  label: 'Corredores e passagens com largura mínima livre',         critico: false },
      { itemId: 'ord-5',  label: 'Resíduos descartados nos pontos corretos',                critico: false },
      { itemId: 'ord-6',  label: 'Ferramentas armazenadas em local correto após uso',       critico: false },
      { itemId: 'ord-7',  label: 'Ausência de objetos pessoais nas áreas de produção',     critico: false },
    ],
  },
  {
    secaoId: 'armazenagem',
    label:   'Armazenagem e Silos',
    icon:    '🏗️',
    itens: [
      { itemId: 'arm-1',  label: 'Sacarias empilhadas dentro do limite de altura',          critico: true  },
      { itemId: 'arm-2',  label: 'Estrutura dos silos sem sinais de danos ou corrosa',      critico: true  },
      { itemId: 'arm-3',  label: 'Entradas de silos sinalizadas e com bloqueio físico',     critico: true  },
      { itemId: 'arm-4',  label: 'Sistemas de ventilação de silos operacionais',            critico: false },
      { itemId: 'arm-5',  label: 'Termômetros de silo funcionando e sem alarmes ativos',    critico: false },
      { itemId: 'arm-6',  label: 'Área de expedição organizada e identificada por lote',    critico: false },
    ],
  },
  {
    secaoId: 'caldeiraria',
    label:   'Caldeiraria e Vapor',
    icon:    '🌡️',
    itens: [
      { itemId: 'cal-1',  label: 'Caldeira com certificado de inspeção válido',             critico: true  },
      { itemId: 'cal-2',  label: 'Válvulas de segurança testadas e sem bloqueio',           critico: true  },
      { itemId: 'cal-3',  label: 'Manômetros calibrados e legíveis',                        critico: true  },
      { itemId: 'cal-4',  label: 'Tubulaçoes de vapor sem vazamentos perceptíveis',         critico: true  },
      { itemId: 'cal-5',  label: 'Casa de caldeira com ventilação adequada',                critico: false },
      { itemId: 'cal-6',  label: 'Operador de caldeira habilitado presente no turno',       critico: true  },
    ],
  },
  {
    secaoId: 'frota',
    label:   'Frota e Movimentação',
    icon:    '🚛',
    itens: [
      { itemId: 'fro-1',  label: 'Empilhadeiras com habilitação válida do operador',        critico: true  },
      { itemId: 'fro-2',  label: 'Sinalizações de circulação de veículos visíveis',         critico: false },
      { itemId: 'fro-3',  label: 'Separação física entre circulação de pedestre e veículo', critico: true  },
      { itemId: 'fro-4',  label: 'Espelhos de segurança nas curvas cegas',                  critico: false },
      { itemId: 'fro-5',  label: 'Veículos de pátio com freio de mão travado ao estacionar',critico: false },
      { itemId: 'fro-6',  label: 'Cargas estáveis e amarradas nos veículos de transporte', critico: true  },
    ],
  },
  {
    secaoId: 'quimicos',
    label:   'Produtos Químicos',
    icon:    '⚗️',
    itens: [
      { itemId: 'qui-1',  label: 'FISPQ disponível no local de armazenamento dos produtos', critico: true  },
      { itemId: 'qui-2',  label: 'Embalagens identificadas com rótulo legível',             critico: true  },
      { itemId: 'qui-3',  label: 'Segregação de produtos incompatíveis garantida',          critico: true  },
      { itemId: 'qui-4',  label: 'Kit de derrame próximo ao local de uso/armazenamento',    critico: false },
      { itemId: 'qui-5',  label: 'Validade dos produtos armazenados verificada',            critico: false },
    ],
  },
  {
    secaoId: 'ergonomia',
    label:   'Ergonomia e Postos de Trabalho',
    icon:    '💪',
    itens: [
      { itemId: 'erg-1',  label: 'Limites de peso respeitados nas movimentações manuais',   critico: false },
      { itemId: 'erg-2',  label: 'Equipamentos de apoio à movimentação disponíveis',        critico: false },
      { itemId: 'erg-3',  label: 'Postos de trabalho com altura e iluminação adequadas',    critico: false },
      { itemId: 'erg-4',  label: 'Pausas regulamentares sendo cumpridas no setor',          critico: false },
    ],
  },
  {
    secaoId: 'sinalizacao',
    label:   'Sinalização de Segurança',
    icon:    '🚨',
    itens: [
      { itemId: 'sin-1',  label: 'Sinais de obrigação (use EPI) visíveis e limpos',         critico: false },
      { itemId: 'sin-2',  label: 'Sinais de proibição nos locais corretos',                 critico: false },
      { itemId: 'sin-3',  label: 'Sinais de advertência de perigo legíveis',                critico: false },
      { itemId: 'sin-4',  label: 'Sinalização do piso (faixas amarelas) em bom estado',     critico: false },
      { itemId: 'sin-5',  label: 'Iluminação dos painéis de sinalização funcionando',       critico: false },
    ],
  },
  {
    secaoId: 'higiene',
    label:   'Higiene Ocupacional',
    icon:    '🧴',
    itens: [
      { itemId: 'hig-1',  label: 'Lavatórios com água, sabão e papel toalha disponíveis',  critico: false },
      { itemId: 'hig-2',  label: 'Bebedouros em bom estado e com água potável',            critico: false },
      { itemId: 'hig-3',  label: 'Refeitório com higiene adequada (pré e pós uso)',         critico: false },
      { itemId: 'hig-4',  label: 'Vestiários em condições de higiene aceitáveis',           critico: false },
      { itemId: 'hig-5',  label: 'Lixeiras com tampas nas áreas de alimentação',           critico: false },
    ],
  },
  {
    secaoId: 'manutencao',
    label:   'Manutenções em Andamento',
    icon:    '🔧',
    itens: [
      { itemId: 'man-1',  label: 'Isolamento e sinalização de área em manutenção',          critico: true  },
      { itemId: 'man-2',  label: 'LOTO aplicado em todos os equipamentos em manutenção',    critico: true  },
      { itemId: 'man-3',  label: 'Ferramentas e peças organizadas durante a manutenção',    critico: false },
      { itemId: 'man-4',  label: 'Colaboradores de manutenção com EPIs adequados',          critico: true  },
      { itemId: 'man-5',  label: 'Resíduos de manutenção descartados corretamente',         critico: false },
    ],
  },
  {
    secaoId: 'documentacao',
    label:   'Documentação e Registros',
    icon:    '📋',
    itens: [
      { itemId: 'doc-1',  label: 'APR do turno preenchida antes do início das atividades',  critico: true  },
      { itemId: 'doc-2',  label: 'Permissão de trabalho ativa para serviços especiais',     critico: true  },
      { itemId: 'doc-3',  label: 'Livro de ocorrências do setor atualizado',                critico: false },
      { itemId: 'doc-4',  label: 'Certificados de equipamentos críticos em dia',            critico: false },
    ],
  },
  {
    secaoId: 'visitantes',
    label:   'Visitantes e Prestadores',
    icon:    '👷',
    itens: [
      { itemId: 'vis-1',  label: 'Visitantes com EPIs básicos antes de entrar na planta',   critico: true  },
      { itemId: 'vis-2',  label: 'Prestadores com DDS de integração assinado',              critico: true  },
      { itemId: 'vis-3',  label: 'Prestadores com crachá de identificação visível',         critico: false },
      { itemId: 'vis-4',  label: 'Acompanhante designado para visitantes externos',         critico: false },
    ],
  },
]

// ── Factory helpers ───────────────────────────────────────

export function buildEmptyDDISecoes(): DDISecao[] {
  return DDI_CATALOG.map(s => ({
    secaoId:      s.secaoId,
    label:        s.label,
    icon:         s.icon,
    itens:        s.itens.map(item => ({
      itemId:         item.itemId,
      label:          item.label,
      critico:        item.critico,
      resultado:      null,
      fotoRequerida:  false,
    })),
    scoreSecao:    0,
    conformes:     0,
    naoConformes:  0,
  }))
}

export function getDDITotalItens(): number {
  return DDI_CATALOG.reduce((acc, s) => acc + s.itens.length, 0)
}

export function getDDICriticos(): number {
  return DDI_CATALOG.reduce((acc, s) => acc + s.itens.filter(i => i.critico).length, 0)
}

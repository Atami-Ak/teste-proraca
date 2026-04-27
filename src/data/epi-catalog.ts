// ── EPI Catalog — Pro Raça Rações ────────────────────────
// Equipamentos de Proteção Individual com CAs referenciais

export interface EPICatalogItem {
  id:             string
  nome:           string
  categoriaId:    string
  categoria:      string
  numeroCaRef:    string   // CA de referência (atualizar conforme fornecedor)
  vidaUtilMeses:  number   // vida útil em meses (0 = sem vencimento fixo)
  areas:          string[] // setores onde é obrigatório
  descricao:      string
}

export interface EPICategoria {
  id:    string
  label: string
  icon:  string
  itens: EPICatalogItem[]
}

export const EPI_CATALOG: EPICategoria[] = [
  {
    id: 'cabeca',
    label: 'Proteção da Cabeça',
    icon: '👷',
    itens: [
      {
        id: 'cap-01',
        categoriaId: 'cabeca',
        categoria: 'Proteção da Cabeça',
        nome: 'Capacete de Segurança Classe B',
        numeroCaRef: '26.690',
        vidaUtilMeses: 36,
        areas: ['Produção', 'Manutenção', 'Caldeiraria', 'Armazenagem', 'Logística/Frota'],
        descricao: 'Proteção contra impactos e choque elétrico. Trocar a cada 3 anos ou se danificado.',
      },
      {
        id: 'cap-02',
        categoriaId: 'cabeca',
        categoria: 'Proteção da Cabeça',
        nome: 'Touca Árabe Anti-calor',
        numeroCaRef: '43.191',
        vidaUtilMeses: 12,
        areas: ['Caldeiraria'],
        descricao: 'Proteção térmica para trabalhos próximos a caldeiras e fontes de calor radiante.',
      },
    ],
  },
  {
    id: 'audicao',
    label: 'Proteção Auditiva',
    icon: '👂',
    itens: [
      {
        id: 'aud-01',
        categoriaId: 'audicao',
        categoria: 'Proteção Auditiva',
        nome: 'Protetor Auricular Tipo Concha NRR 27 dB',
        numeroCaRef: '36.832',
        vidaUtilMeses: 12,
        areas: ['Moagem', 'Peletização', 'Caldeiraria'],
        descricao: 'Para exposição acima de 85 dB(A). Higienizar com pano úmido e secar antes de guardar.',
      },
      {
        id: 'aud-02',
        categoriaId: 'audicao',
        categoria: 'Proteção Auditiva',
        nome: 'Protetor Auricular Tipo Plug de Espuma (par)',
        numeroCaRef: '5.674',
        vidaUtilMeses: 0,
        areas: ['Moagem', 'Mistura', 'Peletização', 'Expedição', 'Produção'],
        descricao: 'Descartável. Substituir a cada turno de uso. Inserção correta: puxar orelha para cima e trás.',
      },
    ],
  },
  {
    id: 'respiratorio',
    label: 'Proteção Respiratória',
    icon: '😷',
    itens: [
      {
        id: 'res-01',
        categoriaId: 'respiratorio',
        categoria: 'Proteção Respiratória',
        nome: 'Respirador PFF2 — Poeira Orgânica',
        numeroCaRef: '11.662',
        vidaUtilMeses: 0,
        areas: ['Moagem', 'Mistura', 'Armazenagem', 'Almoxarifado'],
        descricao: 'Proteção contra poeiras de farinha, soja e milho. Descartar ao deformar ou dificultar respiração.',
      },
      {
        id: 'res-02',
        categoriaId: 'respiratorio',
        categoria: 'Proteção Respiratória',
        nome: 'Respirador Semifacial com Filtro P3 + Vapores Orgânicos',
        numeroCaRef: '7.791',
        vidaUtilMeses: 3,
        areas: ['Qualidade', 'Manutenção'],
        descricao: 'Para uso com aditivos e solventes. Substituir filtros conforme percepção de odor ou saturação.',
      },
    ],
  },
  {
    id: 'olhos',
    label: 'Proteção dos Olhos e Face',
    icon: '👓',
    itens: [
      {
        id: 'olh-01',
        categoriaId: 'olhos',
        categoria: 'Proteção dos Olhos e Face',
        nome: 'Óculos de Segurança Ampla Visão',
        numeroCaRef: '3.858',
        vidaUtilMeses: 12,
        areas: ['Manutenção', 'Elétrica', 'Caldeiraria', 'Qualidade'],
        descricao: 'Proteção contra partículas e respingos. Trocar se a lente estiver riscada comprometendo visão.',
      },
      {
        id: 'olh-02',
        categoriaId: 'olhos',
        categoria: 'Proteção dos Olhos e Face',
        nome: 'Protetor Facial Tipo Escudo Transparente',
        numeroCaRef: '4.532',
        vidaUtilMeses: 24,
        areas: ['Manutenção', 'Elétrica', 'Caldeiraria'],
        descricao: 'Para operações com risco de projeção de fragmentos ou respingos de fluidos quentes.',
      },
    ],
  },
  {
    id: 'maos',
    label: 'Proteção das Mãos',
    icon: '🧤',
    itens: [
      {
        id: 'luv-01',
        categoriaId: 'maos',
        categoria: 'Proteção das Mãos',
        nome: 'Luva de Couro Raspa Cano Médio',
        numeroCaRef: '3.122',
        vidaUtilMeses: 3,
        areas: ['Manutenção', 'Expedição', 'Armazenagem', 'Logística/Frota'],
        descricao: 'Proteção mecânica e térmica leve. Trocar quando houver furos ou desgaste excessivo.',
      },
      {
        id: 'luv-02',
        categoriaId: 'maos',
        categoria: 'Proteção das Mãos',
        nome: 'Luva de Borracha Nitrílica (par)',
        numeroCaRef: '8.453',
        vidaUtilMeses: 0,
        areas: ['Qualidade', 'Manutenção'],
        descricao: 'Resistente a produtos químicos e óleos. Descartável — trocar se perfurada ou com odor interno.',
      },
      {
        id: 'luv-03',
        categoriaId: 'maos',
        categoria: 'Proteção das Mãos',
        nome: 'Luva Isolante Elétrica Classe 00 (par)',
        numeroCaRef: '2.331',
        vidaUtilMeses: 12,
        areas: ['Elétrica'],
        descricao: 'Obrigatória para trabalhos elétricos. Inspecionar antes de cada uso; trocar se com furos.',
      },
      {
        id: 'luv-04',
        categoriaId: 'maos',
        categoria: 'Proteção das Mãos',
        nome: 'Luva Anticorte Nível 5 (par)',
        numeroCaRef: '38.421',
        vidaUtilMeses: 6,
        areas: ['Manutenção', 'Caldeiraria'],
        descricao: 'Para manuseio de chapas e peças com bordas cortantes.',
      },
    ],
  },
  {
    id: 'pes',
    label: 'Proteção dos Pés',
    icon: '👟',
    itens: [
      {
        id: 'cal-01',
        categoriaId: 'pes',
        categoria: 'Proteção dos Pés',
        nome: 'Calçado de Segurança Bico de Aço PU/PU',
        numeroCaRef: '28.590',
        vidaUtilMeses: 12,
        areas: ['Produção', 'Moagem', 'Mistura', 'Peletização', 'Expedição', 'Armazenagem', 'Manutenção', 'Logística/Frota'],
        descricao: 'Proteção contra impactos e compressão. Trocar anualmente ou se a sola estiver desgastada.',
      },
      {
        id: 'cal-02',
        categoriaId: 'pes',
        categoria: 'Proteção dos Pés',
        nome: 'Bota de Borracha PVC com Bico de Aço',
        numeroCaRef: '11.201',
        vidaUtilMeses: 12,
        areas: ['Caldeiraria', 'Manutenção'],
        descricao: 'Para ambientes úmidos e com risco de derrame de fluidos. Trocar se houver rachaduras.',
      },
    ],
  },
  {
    id: 'altura',
    label: 'Proteção contra Quedas',
    icon: '🪜',
    itens: [
      {
        id: 'cin-01',
        categoriaId: 'altura',
        categoria: 'Proteção contra Quedas',
        nome: 'Cinto de Segurança Tipo Paraquedista com Trava-quedas',
        numeroCaRef: '34.562',
        vidaUtilMeses: 60,
        areas: ['Manutenção', 'Elétrica', 'Caldeiraria'],
        descricao: 'Uso obrigatório acima de 2m (NR-35). Inspecionar a cada uso; substituir após queda.',
      },
      {
        id: 'cin-02',
        categoriaId: 'altura',
        categoria: 'Proteção contra Quedas',
        nome: 'Talabarte com Absorvedor de Energia',
        numeroCaRef: '31.222',
        vidaUtilMeses: 60,
        areas: ['Manutenção', 'Elétrica'],
        descricao: 'Complementar ao cinto paraquedista. Substituir após queda mesmo sem danos visíveis.',
      },
    ],
  },
  {
    id: 'corpo',
    label: 'Proteção do Corpo',
    icon: '🦺',
    itens: [
      {
        id: 'cor-01',
        categoriaId: 'corpo',
        categoria: 'Proteção do Corpo',
        nome: 'Colete Refletivo Classe 2',
        numeroCaRef: '21.487',
        vidaUtilMeses: 12,
        areas: ['Logística/Frota', 'Expedição'],
        descricao: 'Obrigatório em áreas com circulação de veículos. Trocar se perder a refletividade.',
      },
      {
        id: 'cor-02',
        categoriaId: 'corpo',
        categoria: 'Proteção do Corpo',
        nome: 'Avental de Couro para Solda',
        numeroCaRef: '2.867',
        vidaUtilMeses: 24,
        areas: ['Manutenção', 'Caldeiraria'],
        descricao: 'Proteção contra respingos de solda e calor radiante.',
      },
      {
        id: 'cor-03',
        categoriaId: 'corpo',
        categoria: 'Proteção do Corpo',
        nome: 'Macacão Anti-estático',
        numeroCaRef: '18.332',
        vidaUtilMeses: 12,
        areas: ['Armazenagem', 'Moagem'],
        descricao: 'Para operações em áreas com risco de explosão de poeiras. Lavar separado de outras roupas.',
      },
    ],
  },
]

// ── Flat lookup ───────────────────────────────────────────

export const EPI_ITENS_FLAT: EPICatalogItem[] = EPI_CATALOG.flatMap(c => c.itens)

export function getEPIItem(id: string): EPICatalogItem | undefined {
  return EPI_ITENS_FLAT.find(e => e.id === id)
}

export function getEPIsByArea(area: string): EPICatalogItem[] {
  return EPI_ITENS_FLAT.filter(e => e.areas.includes(area))
}

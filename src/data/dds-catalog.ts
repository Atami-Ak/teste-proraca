// ── DDS Theme Catalog — Pro Raça Rações (Feed Factory) ───────────────

export interface DDSTema {
  id:         string
  categoria:  string
  categoriaId:string
  tema:       string
  descricao:  string
  duracao:    number  // minutos sugeridos
  obrigatorio:boolean
}

export interface DDSCategoria {
  id:    string
  label: string
  icon:  string
  temas: DDSTema[]
}

export const DDS_CATALOG: DDSCategoria[] = [
  {
    id: 'epi',
    label: 'EPIs e EPC',
    icon: '🦺',
    temas: [
      {
        id: 'epi-01', categoriaId: 'epi', categoria: 'EPIs e EPC',
        tema: 'Uso correto do capacete de segurança',
        descricao: 'Tipos de capacete, classes, ajuste correto, conservação e validade do CA.',
        duracao: 10, obrigatorio: true,
      },
      {
        id: 'epi-02', categoriaId: 'epi', categoria: 'EPIs e EPC',
        tema: 'Proteção auditiva — Fábricas de ração',
        descricao: 'Mapa de ruído da fábrica, NRs aplicáveis, tipos de protetor auricular e inserção correta.',
        duracao: 10, obrigatorio: true,
      },
      {
        id: 'epi-03', categoriaId: 'epi', categoria: 'EPIs e EPC',
        tema: 'Luvas de segurança — Seleção e uso',
        descricao: 'Classificação de luvas por risco: corte, produtos químicos, temperatura, vibração.',
        duracao: 10, obrigatorio: false,
      },
      {
        id: 'epi-04', categoriaId: 'epi', categoria: 'EPIs e EPC',
        tema: 'Calçado de segurança — Importância e conservação',
        descricao: 'Requisitos mínimos, CA, inspeção visual antes do uso e critérios de troca.',
        duracao: 8, obrigatorio: true,
      },
      {
        id: 'epi-05', categoriaId: 'epi', categoria: 'EPIs e EPC',
        tema: 'Óculos e proteção facial',
        descricao: 'Riscos de projeção de partículas em moagem e peletização; proteção contra respingos de produto.',
        duracao: 8, obrigatorio: false,
      },
      {
        id: 'epi-06', categoriaId: 'epi', categoria: 'EPIs e EPC',
        tema: 'Máscara respiratória — Poeiras de farinha e soja',
        descricao: 'Exposição à poeira orgânica, tipos de filtro PFF1/PFF2/P3, vedação e higienização.',
        duracao: 12, obrigatorio: true,
      },
      {
        id: 'epi-07', categoriaId: 'epi', categoria: 'EPIs e EPC',
        tema: 'Cinto de segurança e trava-quedas',
        descricao: 'Norma NR-35, tipos de cinto, pontos de ancoragem e inspecão antes do uso.',
        duracao: 15, obrigatorio: false,
      },
      {
        id: 'epi-08', categoriaId: 'epi', categoria: 'EPIs e EPC',
        tema: 'Higienização e conservação dos EPIs',
        descricao: 'Responsabilidade do colaborador, armazenamento, periodicidade de inspeção e descarte.',
        duracao: 8, obrigatorio: false,
      },
    ],
  },
  {
    id: 'maquinario',
    label: 'Máquinas e Equipamentos',
    icon: '⚙️',
    temas: [
      {
        id: 'maq-01', categoriaId: 'maquinario', categoria: 'Máquinas e Equipamentos',
        tema: 'LOTO — Bloqueio e etiquetagem de energia (NR-12)',
        descricao: 'Procedimento de bloqueio e etiquetagem (LOTO) antes de manutenção em máquinas.',
        duracao: 15, obrigatorio: true,
      },
      {
        id: 'maq-02', categoriaId: 'maquinario', categoria: 'Máquinas e Equipamentos',
        tema: 'Proteções em moinhos e misturadoras',
        descricao: 'Guardas fixas e móveis, proibição de remoção de proteções, comunicação de anomalias.',
        duracao: 12, obrigatorio: true,
      },
      {
        id: 'maq-03', categoriaId: 'maquinario', categoria: 'Máquinas e Equipamentos',
        tema: 'Segurança em peletizadoras',
        descricao: 'Riscos de esmagamento, temperatura de vapor, parada emergencial e distância de segurança.',
        duracao: 12, obrigatorio: true,
      },
      {
        id: 'maq-04', categoriaId: 'maquinario', categoria: 'Máquinas e Equipamentos',
        tema: 'Transportadores e elevadores de caçamba',
        descricao: 'Risco de aprisionamento, zonas de perigo, sinalização e travamento durante manutenção.',
        duracao: 10, obrigatorio: true,
      },
      {
        id: 'maq-05', categoriaId: 'maquinario', categoria: 'Máquinas e Equipamentos',
        tema: 'Operação segura de empilhadeiras',
        descricao: 'Habilitação obrigatória, limites de carga, visibilidade, velocidade em piso e sinalização.',
        duracao: 15, obrigatorio: false,
      },
      {
        id: 'maq-06', categoriaId: 'maquinario', categoria: 'Máquinas e Equipamentos',
        tema: 'Chaves e dispositivos de parada de emergência',
        descricao: 'Localização dos botões de emergência no setor, acionamento e comunicação imediata.',
        duracao: 8, obrigatorio: true,
      },
    ],
  },
  {
    id: 'quimicos',
    label: 'Produtos Químicos',
    icon: '⚗️',
    temas: [
      {
        id: 'qui-01', categoriaId: 'quimicos', categoria: 'Produtos Químicos',
        tema: 'Manuseio seguro de aditivos e premix',
        descricao: 'FISPQ, EPI específico, armazenamento segregado e procedimento em caso de derrame.',
        duracao: 12, obrigatorio: true,
      },
      {
        id: 'qui-02', categoriaId: 'quimicos', categoria: 'Produtos Químicos',
        tema: 'Lubrificantes e óleos industriais — Riscos e descarte',
        descricao: 'Contato cutâneo, inalação de vapores, descarte correto e contenção de vazamentos.',
        duracao: 10, obrigatorio: false,
      },
      {
        id: 'qui-03', categoriaId: 'quimicos', categoria: 'Produtos Químicos',
        tema: 'Gás liquefeito e combustíveis — Armazenagem',
        descricao: 'Distâncias de segurança, ventilação obrigatória, proibição de chamas e acúmulo de vapores.',
        duracao: 12, obrigatorio: false,
      },
      {
        id: 'qui-04', categoriaId: 'quimicos', categoria: 'Produtos Químicos',
        tema: 'Fichas FISPQ — Como ler e usar',
        descricao: 'Estrutura da ficha de segurança, localização no setor, informações de primeiros socorros.',
        duracao: 10, obrigatorio: true,
      },
    ],
  },
  {
    id: 'incendio',
    label: 'Incêndio e Emergências',
    icon: '🔥',
    temas: [
      {
        id: 'inc-01', categoriaId: 'incendio', categoria: 'Incêndio e Emergências',
        tema: 'Uso do extintor de incêndio — Prática PASS',
        descricao: 'Triângulo do fogo, classes de incêndio, técnica PASS, posicionamento e distância segura.',
        duracao: 15, obrigatorio: true,
      },
      {
        id: 'inc-02', categoriaId: 'incendio', categoria: 'Incêndio e Emergências',
        tema: 'Plano de evacuação da fábrica',
        descricao: 'Rotas de fuga, pontos de encontro, hierarquia de evacuação e função dos brigadistas.',
        duracao: 15, obrigatorio: true,
      },
      {
        id: 'inc-03', categoriaId: 'incendio', categoria: 'Incêndio e Emergências',
        tema: 'Explosão de poeiras — Risco em silos e moinhos',
        descricao: 'Concentração explosiva de poeira de cereais, fontes de ignição, aterramento de silos.',
        duracao: 15, obrigatorio: true,
      },
      {
        id: 'inc-04', categoriaId: 'incendio', categoria: 'Incêndio e Emergências',
        tema: 'Trabalho a quente — Prevenção de incêndio',
        descricao: 'Permissão de trabalho a quente, rondas pós-serviço, guarda-fogo e remoção de combustíveis.',
        duracao: 12, obrigatorio: false,
      },
      {
        id: 'inc-05', categoriaId: 'incendio', categoria: 'Incêndio e Emergências',
        tema: 'Primeiros socorros — Noções básicas',
        descricao: 'Avaliação da cena, acionamento do SAMU, RCP básica, controle de hemorragia.',
        duracao: 20, obrigatorio: true,
      },
      {
        id: 'inc-06', categoriaId: 'incendio', categoria: 'Incêndio e Emergências',
        tema: 'Comunicação de emergências — Números e protocolos',
        descricao: 'Números de emergência (SAMU 192, Bombeiros 193, SESMT interno), protocolo de comunicação.',
        duracao: 8, obrigatorio: true,
      },
    ],
  },
  {
    id: 'altura',
    label: 'Trabalho em Altura',
    icon: '🪜',
    temas: [
      {
        id: 'alt-01', categoriaId: 'altura', categoria: 'Trabalho em Altura',
        tema: 'NR-35 — Trabalho em Altura — Fundamentos',
        descricao: 'Definição de trabalho em altura (>2m), permissão de trabalho, capacitação obrigatória.',
        duracao: 15, obrigatorio: false,
      },
      {
        id: 'alt-02', categoriaId: 'altura', categoria: 'Trabalho em Altura',
        tema: 'Uso correto de escadas — Normas ABNT',
        descricao: 'Ângulo correto, travamento de pés, subida/descida com 3 pontos de apoio, carga máxima.',
        duracao: 10, obrigatorio: false,
      },
      {
        id: 'alt-03', categoriaId: 'altura', categoria: 'Trabalho em Altura',
        tema: 'Andaimes e plataformas de trabalho',
        descricao: 'Inspeção antes do uso, guarda-corpo, rodapé, travamento e capacidade de carga.',
        duracao: 12, obrigatorio: false,
      },
    ],
  },
  {
    id: 'ergonomia',
    label: 'Ergonomia e Saúde',
    icon: '💪',
    temas: [
      {
        id: 'erg-01', categoriaId: 'ergonomia', categoria: 'Ergonomia e Saúde',
        tema: 'Movimentação manual de cargas (NR-17)',
        descricao: 'Limites de peso por sexo e idade, técnica correta de levantamento, uso de ajuda mecânica.',
        duracao: 12, obrigatorio: true,
      },
      {
        id: 'erg-02', categoriaId: 'ergonomia', categoria: 'Ergonomia e Saúde',
        tema: 'LER/DORT — Prevenção em postos de trabalho',
        descricao: 'Lesões por esforço repetitivo, pausas, variação de tarefas, alongamentos preventivos.',
        duracao: 10, obrigatorio: false,
      },
      {
        id: 'erg-03', categoriaId: 'ergonomia', categoria: 'Ergonomia e Saúde',
        tema: 'Calor extremo — Trabalho próximo a caldeiras',
        descricao: 'Hidratação, pausas em ambientes quentes, reconhecimento de exaustão pelo calor, NR-15.',
        duracao: 10, obrigatorio: false,
      },
      {
        id: 'erg-04', categoriaId: 'ergonomia', categoria: 'Ergonomia e Saúde',
        tema: 'Saúde mental no trabalho — Estresse e absenteísmo',
        descricao: 'Sinais de sobrecarga, comunicação com a supervisão, canais de apoio disponíveis.',
        duracao: 10, obrigatorio: false,
      },
    ],
  },
  {
    id: 'eletrica',
    label: 'Elétrica',
    icon: '⚡',
    temas: [
      {
        id: 'ele-01', categoriaId: 'eletrica', categoria: 'Elétrica',
        tema: 'NR-10 — Segurança em instalações elétricas',
        descricao: 'Habilitação obrigatória, distâncias de segurança, EPIs elétricos e proibição a leigos.',
        duracao: 15, obrigatorio: true,
      },
      {
        id: 'ele-02', categoriaId: 'eletrica', categoria: 'Elétrica',
        tema: 'Riscos elétricos no dia a dia — Reconhecimento',
        descricao: 'Fios expostos, quadros abertos, umidade + eletricidade, improvisações perigosas.',
        duracao: 10, obrigatorio: true,
      },
      {
        id: 'ele-03', categoriaId: 'eletrica', categoria: 'Elétrica',
        tema: 'Choque elétrico — Primeiros socorros',
        descricao: 'Não toque na vítima, desligue a energia, acionamento do socorro, posição de recuperação.',
        duracao: 10, obrigatorio: true,
      },
    ],
  },
  {
    id: 'confinado',
    label: 'Espaço Confinado',
    icon: '⚠️',
    temas: [
      {
        id: 'con-01', categoriaId: 'confinado', categoria: 'Espaço Confinado',
        tema: 'NR-33 — Espaço Confinado — Fundamentos',
        descricao: 'Definição, classificação, equipe mínima (vigia + supervisor + socorrista), permissão de entrada.',
        duracao: 20, obrigatorio: false,
      },
      {
        id: 'con-02', categoriaId: 'confinado', categoria: 'Espaço Confinado',
        tema: 'Silos de grãos — Riscos específicos',
        descricao: 'Engolfamento, gases (CO2, NH3), purga e ventilação forçada, nunca entrar sem permissão.',
        duracao: 15, obrigatorio: true,
      },
    ],
  },
  {
    id: 'ordem',
    label: 'Ordem e Limpeza',
    icon: '🧹',
    temas: [
      {
        id: 'ord-01', categoriaId: 'ordem', categoria: 'Ordem e Limpeza',
        tema: 'Metodologia 5S aplicada à segurança',
        descricao: 'Como a desorganização causa acidentes: pisos escorregadios, obstrução de saídas de emergência.',
        duracao: 10, obrigatorio: false,
      },
      {
        id: 'ord-02', categoriaId: 'ordem', categoria: 'Ordem e Limpeza',
        tema: 'Descarte correto de resíduos industriais',
        descricao: 'Segregação de resíduos Classe I e II, embalagens de aditivos, óleos e contaminados.',
        duracao: 10, obrigatorio: false,
      },
      {
        id: 'ord-03', categoriaId: 'ordem', categoria: 'Ordem e Limpeza',
        tema: 'Limpeza em ambientes com poeira explosiva',
        descricao: 'Proibição de uso de ar comprimido em poeira seca, aspiração industrial, aterramento.',
        duracao: 12, obrigatorio: true,
      },
    ],
  },
  {
    id: 'comportamento',
    label: 'Comportamento Seguro',
    icon: '🎯',
    temas: [
      {
        id: 'com-01', categoriaId: 'comportamento', categoria: 'Comportamento Seguro',
        tema: 'Análise de risco no trabalho — APR',
        descricao: 'O que é APR, como preencher, quem deve participar e quando é obrigatória.',
        duracao: 12, obrigatorio: true,
      },
      {
        id: 'com-02', categoriaId: 'comportamento', categoria: 'Comportamento Seguro',
        tema: 'Comunicação de quase acidentes e situações de risco',
        descricao: 'Cultura de segurança, sem punição para relatos honestos, canais de comunicação.',
        duracao: 10, obrigatorio: false,
      },
      {
        id: 'com-03', categoriaId: 'comportamento', categoria: 'Comportamento Seguro',
        tema: 'Recusa de trabalho inseguro — Direito do trabalhador',
        descricao: 'NR-1 item 1.5.5, como proceder ao identificar condição insegura intransponível.',
        duracao: 10, obrigatorio: false,
      },
      {
        id: 'com-04', categoriaId: 'comportamento', categoria: 'Comportamento Seguro',
        tema: 'Distração e uso de celular durante operação',
        descricao: 'Acidentes causados por distração, política da empresa, zonas restritas ao uso de celular.',
        duracao: 8, obrigatorio: false,
      },
      {
        id: 'com-05', categoriaId: 'comportamento', categoria: 'Comportamento Seguro',
        tema: 'Revisão de acidentes ocorridos no mês',
        descricao: 'Lição aprendida do período: o que aconteceu, causa raiz, medidas corretivas adotadas.',
        duracao: 15, obrigatorio: false,
      },
    ],
  },
]

// ── Flat lookup helpers ───────────────────────────────────

export const DDS_TEMAS_FLAT: DDSTema[] = DDS_CATALOG.flatMap(c => c.temas)

export function getDDSTema(id: string): DDSTema | undefined {
  return DDS_TEMAS_FLAT.find(t => t.id === id)
}

export function getDDSCategoria(id: string): DDSCategoria | undefined {
  return DDS_CATALOG.find(c => c.id === id)
}

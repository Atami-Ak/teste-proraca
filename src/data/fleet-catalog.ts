/**
 * fleet-catalog.ts — Static fleet data (TypeScript port of dados-frota.js,
 * checklist-engine.js data section, and parts-catalog.js)
 *
 * Nothing in this file fetches from Firestore — all static.
 */

import type {
  Vehicle, ChecklistItemDef, ChecklistCategory,
  CapabilitySet, PartsCatalog,
} from '@/types/vehicle'

// ── Vehicle catalog (real fleet data) ────────────────

export const FROTA_DB: Vehicle[] = [
  { id: 'VEIC-001', placa: 'OEC-3E92', modelo: 'FORD CARGO 816 E',        categoria: 'Caminhões Leves (3/4)', icone: '🚚', motoristaPadrao: 'JUSCELINO'   },
  { id: 'VEIC-002', placa: 'QRS-3051', modelo: 'VOLVO VM 330 L-S',        categoria: 'Carretas',             icone: '🚛'                                   },
  { id: 'VEIC-003', placa: 'RST-3E58', modelo: 'M. BENS / ACTROS 2429',  categoria: 'Caminhões Toco/Truck', icone: '🚛', motoristaPadrao: 'REGINALDO'    },
  { id: 'VEIC-004', placa: 'ESL-5D38', modelo: 'VOLVO VM 330 L-S',        categoria: 'Carretas',             icone: '🚛', motoristaPadrao: 'TIMOTEO'       },
  { id: 'VEIC-005', placa: 'RSL-0D12', modelo: 'VOLVO VM 330 L-S',        categoria: 'Carretas',             icone: '🚛', motoristaPadrao: 'JOÃO PEREIRA'  },
  { id: 'VEIC-006', placa: 'RSM-6B13', modelo: 'DAF / XF FTT 530 4º EIXO',categoria: 'Caminhões 4º Eixo',   icone: '🚛', motoristaPadrao: 'BRUNO'         },
  { id: 'VEIC-007', placa: 'RSQ 2H28', modelo: 'IVECO / TECTOR 24-280',  categoria: 'Caminhões Toco/Truck', icone: '🚛', motoristaPadrao: 'DAVI'          },
  { id: 'VEIC-008', placa: 'SLS-3H29', modelo: 'M. BENS / ACTROS 2448S', categoria: 'Caminhões 4º Eixo',    icone: '🚛', motoristaPadrao: 'JEAN'          },
  { id: 'VEIC-009', placa: 'QRR-4D94', modelo: 'TOCO ATEGO 1719',         categoria: 'Caminhões Toco/Truck', icone: '🚛', motoristaPadrao: 'JOSIMAR'       },
  { id: 'VEIC-010', placa: 'QRT-9J44', modelo: 'VOLVO VM 330 L-S',        categoria: 'Carretas',             icone: '🚛', motoristaPadrao: 'ZE D-10'       },
  { id: 'VEIC-011', placa: 'NIX-9668', modelo: 'B-TRUK VOLVO VM 270',     categoria: 'Caminhões Bitruck',    icone: '🚛', motoristaPadrao: 'CARLOS IVAN'   },
  { id: 'VEIC-012', placa: 'QRV-5A23', modelo: 'B-TRUK VOLVO VM 360',     categoria: 'Caminhões Bitruck',    icone: '🚛', motoristaPadrao: 'ANDRÉ'         },
  { id: 'VEIC-013', placa: 'QRV-2F43', modelo: 'VOLVO VM 360 L-S',        categoria: 'Carretas',             icone: '🚛', motoristaPadrao: 'DENIS'         },
  { id: 'VEIC-014', placa: 'RST-4H12', modelo: 'VOLVO/FH 540 6X4T',       categoria: 'Rodotrem',             icone: '🚛', motoristaPadrao: 'ALEXANDRE'     },
  { id: 'VEIC-015', placa: 'PID-7114', modelo: 'BITRUK VOLVO VM 330',     categoria: 'Caminhões Bitruck',    icone: '🚛', motoristaPadrao: 'JOÃO CARLOS'   },
  { id: 'VEIC-016', placa: 'JAU-8G04', modelo: 'VOLVO VM 330 L-S',        categoria: 'Carretas',             icone: '🚛', motoristaPadrao: 'CARLINHOS'     },
  { id: 'VEIC-017', placa: 'ETH-5H08', modelo: 'VOLVO VM 330 L-S',        categoria: 'Carretas',             icone: '🚛', motoristaPadrao: 'ADÃO'          },
  { id: 'VEIC-018', placa: 'PIG-3696', modelo: 'B-TRUK SCANIA P-310',     categoria: 'Caminhões Bitruck',    icone: '🚛'                                   },
  { id: 'VEIC-019', placa: 'SIG-0001', modelo: 'Fiat Strada Endurance',   categoria: 'Carros Leves',         icone: '🚗'                                   },
  { id: 'VEIC-020', placa: 'RTY-5555', modelo: 'Honda CG 160 Titan',      categoria: 'Motos',                icone: '🏍️'                                   },
]

// ── Item catalog ──────────────────────────────────────

export const ITEM_CATALOG: Record<ChecklistCategory, ChecklistItemDef[]> = {
  cab_internal: [
    { id: 'chave_veiculo',      label: 'Chave do Veículo',                required: true  },
    { id: 'bancos',             label: 'Bancos',                          required: true  },
    { id: 'ar_condicionado',    label: 'Ar Condicionado',                 required: false },
    { id: 'som_cd',             label: 'Sistema de Som / CD Player',      required: false },
    { id: 'painel',             label: 'Painel de Instrumentos',          required: true  },
    { id: 'tapetes',            label: 'Tapetes / Carpete',               required: false },
    { id: 'limpador_parabrisa', label: 'Limpador de Parabrisa',           required: true  },
    { id: 'esguicho_parabrisa', label: 'Esguichos de Parabrisa',          required: false },
    { id: 'botoes_funcao',      label: 'Botões de Funções',               required: true  },
    { id: 'revestimento',       label: 'Revestimento Interno',            required: false },
    { id: 'luzes_advertencia',  label: 'Luzes de Advertência no Painel',  required: true  },
    { id: 'limpeza_interna',    label: 'Limpeza Interna',                 required: false },
    { id: 'vidro_esq',          label: 'Vidro Janela Esquerda',           required: true  },
    { id: 'vidro_dir',          label: 'Vidro Janela Direita',            required: true  },
    { id: 'buzina',             label: 'Buzina',                          required: true  },
    { id: 'luz_cabine',         label: 'Luz de Cabine',                   required: false },
    { id: 'retrovisor_esq',     label: 'Retrovisor Esquerdo',             required: true  },
    { id: 'retrovisor_dir',     label: 'Retrovisor Direito',              required: true  },
    { id: 'ferramentas',        label: 'Ferramentas (Kit)',               required: false },
    { id: 'pistola_ar',         label: 'Pistola de Ar',                   required: false },
    { id: 'garrafa_termica',    label: 'Garrafa Térmica',                 required: false },
    { id: 'interclima',         label: 'Interclima',                      required: false },
  ],
  lighting_signaling: [
    { id: 'farol_baixo_e',  label: 'Farol Baixo — Esquerdo',        required: true  },
    { id: 'farol_baixo_d',  label: 'Farol Baixo — Direito',         required: true  },
    { id: 'farol_alto_e',   label: 'Farol Alto — Esquerdo',         required: true  },
    { id: 'farol_alto_d',   label: 'Farol Alto — Direito',          required: true  },
    { id: 'seta_diant_e',   label: 'Seta Dianteira — Esquerda',     required: true  },
    { id: 'seta_diant_d',   label: 'Seta Dianteira — Direita',      required: true  },
    { id: 'seta_lateral_e', label: 'Seta Lateral — Esquerda',       required: false },
    { id: 'seta_lateral_d', label: 'Seta Lateral — Direita',        required: false },
    { id: 'seta_tras_e',    label: 'Seta Traseira — Esquerda',      required: true  },
    { id: 'seta_tras_d',    label: 'Seta Traseira — Direita',       required: true  },
    { id: 'luz_freio',      label: 'Luz de Freio',                  required: true  },
    { id: 'luz_re',         label: 'Luz de Ré',                     required: true  },
    { id: 'luz_placa',      label: 'Luz da Placa',                  required: true  },
  ],
  advanced_lighting: [
    { id: 'drl_e',    label: 'DRL (Luz de Rodagem Diurna) — Esquerdo', required: false },
    { id: 'drl_d',    label: 'DRL (Luz de Rodagem Diurna) — Direito',  required: false },
    { id: 'milha_e',  label: 'Farol de Milha / Neblina — Esquerdo',    required: false },
    { id: 'milha_d',  label: 'Farol de Milha / Neblina — Direito',     required: false },
    { id: 'led_re',   label: 'LED de Ré',                              required: false },
    { id: 'sirene_re',label: 'Sirene de Ré',                           required: false },
  ],
  structure_safety_fluids: [
    { id: 'parabrisa',    label: 'Parabrisa (trincas / limpeza)',              required: true  },
    { id: 'peliculas',    label: 'Películas / Adesivos',                      required: false },
    { id: 'tanque',       label: 'Tanque de Combustível',                     required: true  },
    { id: 'vazamento_ar', label: 'Vazamento de Ar',                           required: true  },
    { id: 'cordas',       label: 'Cordas / Cintas de Amarração',              required: false },
    { id: 'estepe',       label: 'Estepe',                                    required: true  },
    { id: 'pneu_integr',  label: 'Integridade dos Pneus (desgaste / calibragem)', required: true },
  ],
  mechanical_load: [
    { id: 'bolsa_suspensao',  label: 'Bolsa de Suspensão (air bag)',      required: true  },
    { id: 'afivelar_carroce', label: 'Afivelar / Aperto de Carroçaria',   required: false },
    { id: 'lonas',            label: 'Lonas de Cobertura / Proteção',     required: false },
    { id: 'corote',           label: 'Corote / Recipientes de Segurança', required: false },
  ],
}

// Motorcycle-specific cab items (replaces cab_internal for Motos)
export const MOTO_CAB_ITEMS: ChecklistItemDef[] = [
  { id: 'chave_moto',        label: 'Chave da Moto',                            required: true  },
  { id: 'painel_moto',       label: 'Painel de Instrumentos',                   required: true  },
  { id: 'pneu_diant',        label: 'Pneu Dianteiro (calibragem / desgaste)',   required: true  },
  { id: 'pneu_tras',         label: 'Pneu Traseiro (calibragem / desgaste)',    required: true  },
  { id: 'corrente',          label: 'Corrente / Relação (tensão / lubrificação)',required: true  },
  { id: 'freio_diant',       label: 'Freio Dianteiro',                          required: true  },
  { id: 'freio_tras',        label: 'Freio Traseiro',                           required: true  },
  { id: 'oleo_motor',        label: 'Nível de Óleo do Motor',                   required: true  },
  { id: 'sem_vazamentos',    label: 'Sem Vazamentos (óleo / combustível)',       required: true  },
  { id: 'embreagem',         label: 'Acionamento da Embreagem',                 required: true  },
  { id: 'escapamento',       label: 'Sistema de Escapamento',                   required: false },
  { id: 'bau_moto',          label: 'Baú (tranca / fixação)',                   required: false },
  { id: 'antena_corta_pipa', label: 'Antena Corta-Pipa',                       required: false },
  { id: 'capacete',          label: 'Capacete (viseira / cinta)',               required: true  },
  { id: 'capa_chuva',        label: 'Capa de Chuva',                            required: false },
  { id: 'retrovisor_e',      label: 'Retrovisor Esquerdo',                      required: true  },
  { id: 'retrovisor_d',      label: 'Retrovisor Direito',                       required: true  },
]

// ── Category metadata ─────────────────────────────────

export const CATEGORY_META: Record<ChecklistCategory, { label: string; icon: string; order: number; optional?: boolean }> = {
  cab_internal:            { label: '1. Cabine Interna',                 icon: '🚗', order: 1 },
  lighting_signaling:      { label: '2. Iluminação e Sinalização',       icon: '💡', order: 2 },
  advanced_lighting:       { label: '3. Iluminação Avançada',            icon: '🔦', order: 3, optional: true },
  structure_safety_fluids: { label: '4. Estrutura, Segurança e Fluidos', icon: '🔩', order: 4 },
  mechanical_load:         { label: '5. Mecânica e Carga',               icon: '⚙️', order: 5 },
}

// ── Capability rules ──────────────────────────────────

interface CapabilityRule {
  match:        (v: Vehicle) => boolean
  capabilities: CapabilitySet
}

export const CAPABILITY_RULES: CapabilityRule[] = [
  {
    match: (v) => v.categoria === 'Carros Leves',
    capabilities: {
      cab_internal:            true,
      lighting_signaling:      true,
      advanced_lighting:       true,   // modern cars typically have DRL
      structure_safety_fluids: true,
      mechanical_load:         false,
    },
  },
  {
    match: (v) => v.categoria === 'Motos',
    capabilities: {
      cab_internal:            false,  // replaced by MOTO_CAB_ITEMS
      lighting_signaling:      true,
      advanced_lighting:       false,
      structure_safety_fluids: true,
      mechanical_load:         false,
    },
  },
  {
    // Default: all trucks, bitrucks, carretas, rodotrem
    match: () => true,
    capabilities: {
      cab_internal:            true,
      lighting_signaling:      true,
      advanced_lighting:       false,  // toggle via UI
      structure_safety_fluids: true,
      mechanical_load:         true,
    },
  },
]

// ── Parts catalog ─────────────────────────────────────

export const PARTS_CATALOG: PartsCatalog = {
  // Lighting & signaling
  farol_baixo_e:  { requiresPurchase: true,  parts: [{ name: 'Lâmpada Farol Baixo — Esquerdo',   quantity: 1, priority: 'high'   }] },
  farol_baixo_d:  { requiresPurchase: true,  parts: [{ name: 'Lâmpada Farol Baixo — Direito',    quantity: 1, priority: 'high'   }] },
  farol_alto_e:   { requiresPurchase: true,  parts: [{ name: 'Lâmpada Farol Alto — Esquerdo',    quantity: 1, priority: 'medium' }] },
  farol_alto_d:   { requiresPurchase: true,  parts: [{ name: 'Lâmpada Farol Alto — Direito',     quantity: 1, priority: 'medium' }] },
  seta_diant_e:   { requiresPurchase: true,  parts: [{ name: 'Lâmpada Seta Dianteira — Esquerda',quantity: 1, priority: 'medium' }] },
  seta_diant_d:   { requiresPurchase: true,  parts: [{ name: 'Lâmpada Seta Dianteira — Direita', quantity: 1, priority: 'medium' }] },
  seta_lateral_e: { requiresPurchase: true,  parts: [{ name: 'Lâmpada Seta Lateral — Esquerda',  quantity: 1, priority: 'low'    }] },
  seta_lateral_d: { requiresPurchase: true,  parts: [{ name: 'Lâmpada Seta Lateral — Direita',   quantity: 1, priority: 'low'    }] },
  seta_tras_e:    { requiresPurchase: true,  parts: [{ name: 'Lâmpada Seta Traseira — Esquerda', quantity: 1, priority: 'medium' }] },
  seta_tras_d:    { requiresPurchase: true,  parts: [{ name: 'Lâmpada Seta Traseira — Direita',  quantity: 1, priority: 'medium' }] },
  luz_freio:      { requiresPurchase: true,  parts: [{ name: 'Lâmpada Luz de Freio',             quantity: 2, priority: 'high'   }] },
  luz_re:         { requiresPurchase: true,  parts: [{ name: 'Lâmpada Luz de Ré',                quantity: 1, priority: 'medium' }] },
  luz_placa:      { requiresPurchase: true,  parts: [{ name: 'Lâmpada Luz de Placa',             quantity: 1, priority: 'low'    }] },
  // Advanced lighting
  drl_e:          { requiresPurchase: true,  parts: [{ name: 'Módulo DRL — Esquerdo',              quantity: 1, priority: 'low' }] },
  drl_d:          { requiresPurchase: true,  parts: [{ name: 'Módulo DRL — Direito',               quantity: 1, priority: 'low' }] },
  milha_e:        { requiresPurchase: true,  parts: [{ name: 'Lâmpada Milha / Neblina — Esquerda', quantity: 1, priority: 'low' }] },
  milha_d:        { requiresPurchase: true,  parts: [{ name: 'Lâmpada Milha / Neblina — Direita',  quantity: 1, priority: 'low' }] },
  // Structure, safety & fluids
  estepe:             { requiresPurchase: true,  parts: [{ name: 'Pneu Estepe',                       quantity: 1, priority: 'high'   }] },
  pneu_integr:        { requiresPurchase: true,  parts: [{ name: 'Pneu (desgaste / recalibração)',    quantity: 1, priority: 'high'   }] },
  limpador_parabrisa: { requiresPurchase: true,  parts: [{ name: 'Palheta Limpador de Parabrisa',     quantity: 2, priority: 'medium' }] },
  tanque:             { requiresPurchase: false, parts: [] },
  // Mechanical & load
  bolsa_suspensao: { requiresPurchase: true,  parts: [{ name: 'Bolsa de Suspensão (Air Bag)',      quantity: 1, priority: 'high'   }] },
  lonas:           { requiresPurchase: true,  parts: [{ name: 'Lona de Cobertura / Proteção',     quantity: 1, priority: 'medium' }] },
  cordas:          { requiresPurchase: true,  parts: [{ name: 'Corda / Cinta de Amarração',       quantity: 2, priority: 'medium' }] },
  // Cabin
  limpeza_interna: { requiresPurchase: false, parts: [] },
  // Motorcycle
  pneu_diant:       { requiresPurchase: true,  parts: [{ name: 'Pneu Dianteiro (Moto)',              quantity: 1, priority: 'high'   }] },
  pneu_tras:        { requiresPurchase: true,  parts: [{ name: 'Pneu Traseiro (Moto)',               quantity: 1, priority: 'high'   }] },
  corrente:         { requiresPurchase: true,  parts: [{ name: 'Corrente de Transmissão',            quantity: 1, priority: 'medium' }] },
  freio_diant:      { requiresPurchase: true,  parts: [{ name: 'Pastilha / Lona de Freio Dianteiro', quantity: 1, priority: 'high'   }] },
  freio_tras:       { requiresPurchase: true,  parts: [{ name: 'Pastilha / Lona de Freio Traseiro',  quantity: 1, priority: 'high'   }] },
  oleo_motor:       { requiresPurchase: true,  parts: [{ name: 'Óleo de Motor',                      quantity: 1, priority: 'high'   }] },
  capacete:         { requiresPurchase: true,  parts: [{ name: 'Capacete (substituição)',             quantity: 1, priority: 'high'   }] },
  capa_chuva:       { requiresPurchase: true,  parts: [{ name: 'Capa de Chuva',                       quantity: 1, priority: 'low'    }] },
  antena_corta_pipa:{ requiresPurchase: true,  parts: [{ name: 'Antena Corta-Pipa',                  quantity: 1, priority: 'medium' }] },
}

/**
 * maquinas-db.js — Industrial Machinery Catalog
 *
 * DESIGN PRINCIPLE:
 *   No type is hardcoded in the inspection engine.
 *   Capability is inferred entirely from `tags` via rule matching.
 *   Add a new machine by adding an entry here — zero changes elsewhere.
 *
 * TAG CONVENTIONS:
 *   - "peneira"       → sieving / vibrating screen logic
 *   - "moinho"        → mill base rules (bearings, vibration, energy)
 *   - "martelos"      → hammer mill specific items
 *   - "rolos"         → roll mill specific items
 *   - "misturador"    → mixer specific items
 *   - "peletizadora"  → pelletizer specific items
 *   - "rosca"         → screw conveyor specific items
 *   - "elevador"      → bucket elevator specific items
 *   - "motor"         → electric motor emphasis (all have motors, but some are motor-heavy)
 *   - "vapor"         → steam system checks (pelletizer conditioner)
 */

export const maquinasDB = [

  // ────────────────────────────────────────────────────────────
  // PRÉ-LIMPEZA
  // ────────────────────────────────────────────────────────────
  {
    id:           "MAQ-001",
    nome:         "Peneira de Pré-limpeza",
    tipo:         "peneira",
    setor:        "Recepção e Pré-limpeza",
    icone:        "🔲",
    tags:         ["peneira", "vibratorio", "classificacao", "pre-limpeza"],
    fabricante:   "Bühler",
    modelo:       "MTRB-600",
    potenciaKw:   3.0,
    rpm:          450,
    responsavel:  null,
    ativo:        true,
    descricao:    "Peneira vibratória para remoção de impurezas grosseiras do grão na entrada da fábrica.",
  },

  // ────────────────────────────────────────────────────────────
  // MOAGEM
  // ────────────────────────────────────────────────────────────
  {
    id:           "MAQ-002",
    nome:         "Moinho de Martelos",
    tipo:         "moinho_martelos",
    setor:        "Moagem",
    icone:        "⚙️",
    tags:         ["moinho", "martelos", "moagem", "triturador", "motor"],
    fabricante:   "CPM",
    modelo:       "Roskamp Champion 44×14",
    potenciaKw:   75.0,
    rpm:          3600,
    responsavel:  null,
    ativo:        true,
    descricao:    "Moinho de martelos para moagem de grãos (milho, soja) com tela de granulometria variável.",
  },
  {
    id:           "MAQ-003",
    nome:         "Moinho de Remoagem",
    tipo:         "moinho_rolos",
    setor:        "Moagem",
    icone:        "⚙️",
    tags:         ["moinho", "rolos", "moagem", "motor"],
    fabricante:   "Bühler",
    modelo:       "DFZC 600",
    potenciaKw:   37.0,
    rpm:          1200,
    responsavel:  null,
    ativo:        true,
    descricao:    "Moinho de rolos para remoagem e refinamento de farinha.",
  },

  // ────────────────────────────────────────────────────────────
  // MISTURA
  // ────────────────────────────────────────────────────────────
  {
    id:           "MAQ-004",
    nome:         "Misturador Horizontal 1000 kg",
    tipo:         "misturador",
    setor:        "Mistura",
    icone:        "🔄",
    tags:         ["misturador", "horizontal", "paletas", "mistura"],
    fabricante:   "Pavan",
    modelo:       "MH-1000",
    potenciaKw:   22.0,
    rpm:          28,
    capacidadeKg: 1000,
    responsavel:  null,
    ativo:        true,
    descricao:    "Misturador horizontal de paletas para ração, capacidade 1000 kg por ciclo.",
  },
  {
    id:           "MAQ-005",
    nome:         "Misturador Horizontal 500 kg",
    tipo:         "misturador",
    setor:        "Mistura",
    icone:        "🔄",
    tags:         ["misturador", "horizontal", "paletas", "mistura"],
    fabricante:   "Pavan",
    modelo:       "MH-500",
    potenciaKw:   11.0,
    rpm:          32,
    capacidadeKg: 500,
    responsavel:  null,
    ativo:        true,
    descricao:    "Misturador horizontal de paletas, capacidade 500 kg por ciclo.",
  },

  // ────────────────────────────────────────────────────────────
  // PELETIZAÇÃO
  // ────────────────────────────────────────────────────────────
  {
    id:           "MAQ-006",
    nome:         "Peletizadora #1",
    tipo:         "peletizadora",
    setor:        "Peletização",
    icone:        "🔧",
    tags:         ["peletizadora", "prensa", "matriz", "rolos", "vapor", "motor"],
    fabricante:   "CPM",
    modelo:       "PPEP-2000",
    potenciaKw:   90.0,
    rpm:          230,
    capacidadeTh: 5.0,
    responsavel:  null,
    ativo:        true,
    descricao:    "Prensa peletizadora com condicionador a vapor, capacidade 5 t/h.",
  },
  {
    id:           "MAQ-007",
    nome:         "Peletizadora #2",
    tipo:         "peletizadora",
    setor:        "Peletização",
    icone:        "🔧",
    tags:         ["peletizadora", "prensa", "matriz", "rolos", "vapor", "motor"],
    fabricante:   "CPM",
    modelo:       "PPEP-2000",
    potenciaKw:   90.0,
    rpm:          230,
    capacidadeTh: 5.0,
    responsavel:  null,
    ativo:        true,
    descricao:    "Prensa peletizadora com condicionador a vapor, capacidade 5 t/h.",
  },

  // ────────────────────────────────────────────────────────────
  // TRANSPORTE — ROSCAS
  // ────────────────────────────────────────────────────────────
  {
    id:           "MAQ-008",
    nome:         "Rosca Transportadora — Moega",
    tipo:         "rosca",
    setor:        "Transporte",
    icone:        "📦",
    tags:         ["rosca", "transportadora", "helice", "transporte"],
    fabricante:   "Intecnial",
    modelo:       "RT-250",
    potenciaKw:   4.0,
    rpm:          60,
    diametroMm:   250,
    responsavel:  null,
    ativo:        true,
    descricao:    "Rosca transportadora para descarga da moega de recepção.",
  },
  {
    id:           "MAQ-009",
    nome:         "Rosca Transportadora — Saída Moinho",
    tipo:         "rosca",
    setor:        "Transporte",
    icone:        "📦",
    tags:         ["rosca", "transportadora", "helice", "transporte"],
    fabricante:   "Intecnial",
    modelo:       "RT-200",
    potenciaKw:   3.0,
    rpm:          60,
    diametroMm:   200,
    responsavel:  null,
    ativo:        true,
    descricao:    "Rosca de transporte na saída do moinho de martelos.",
  },

  // ────────────────────────────────────────────────────────────
  // TRANSPORTE — ELEVADORES
  // ────────────────────────────────────────────────────────────
  {
    id:           "MAQ-010",
    nome:         "Elevador de Canecas — Silos",
    tipo:         "elevador",
    setor:        "Transporte",
    icone:        "⬆️",
    tags:         ["elevador", "canecas", "correia", "transporte"],
    fabricante:   "Intecnial",
    modelo:       "EC-150",
    potenciaKw:   5.5,
    rpm:          45,
    alturaM:      12,
    responsavel:  null,
    ativo:        true,
    descricao:    "Elevador de canecas para transferência de produto aos silos de armazenagem.",
  },
  {
    id:           "MAQ-011",
    nome:         "Elevador de Canecas — Ensaque",
    tipo:         "elevador",
    setor:        "Transporte",
    icone:        "⬆️",
    tags:         ["elevador", "canecas", "correia", "transporte"],
    fabricante:   "Intecnial",
    modelo:       "EC-100",
    potenciaKw:   3.0,
    rpm:          45,
    alturaM:      8,
    responsavel:  null,
    ativo:        true,
    descricao:    "Elevador de canecas para linha de ensaque.",
  },
];

/**
 * Helper: find machine by ID.
 */
export function getMaquina(id) {
  return maquinasDB.find((m) => m.id === id) || null;
}

/**
 * Helper: group machines by setor.
 */
export function getMaquinasBySetor() {
  const map = {};
  for (const m of maquinasDB) {
    if (!map[m.setor]) map[m.setor] = [];
    map[m.setor].push(m);
  }
  return map;
}

/**
 * checklist-engine.js — Dynamic Checklist Engine
 *
 * DESIGN PRINCIPLE:
 *   No vehicle type is hardcoded. The engine uses:
 *     1. A base item catalog (all possible items)
 *     2. Category inclusion rules per vehicle capability set
 *     3. A capability resolver that infers from frotaDB metadata
 *
 * Adding a new category or item never requires touching the form — only this file.
 */

// ============================================================
// ITEM CATALOG
// All possible inspection items. id must be unique across categories.
// ============================================================

export const ITEM_CATALOG = {

  // ----------------------------------------------------------
  // 1. CABINE INTERNA
  // ----------------------------------------------------------
  cab_internal: [
    { id: "chave_veiculo",       label: "Chave do Veículo",          required: true  },
    { id: "bancos",              label: "Bancos",                    required: true  },
    { id: "ar_condicionado",     label: "Ar Condicionado",           required: false },
    { id: "som_cd",              label: "Sistema de Som / CD Player",required: false },
    { id: "painel",              label: "Painel de Instrumentos",    required: true  },
    { id: "tapetes",             label: "Tapetes / Carpete",         required: false },
    { id: "limpador_parabrisa",  label: "Limpador de Parabrisa",     required: true  },
    { id: "esguicho_parabrisa",  label: "Esguichos de Parabrisa",    required: false },
    { id: "botoes_funcao",       label: "Botões de Funções",         required: true  },
    { id: "revestimento",        label: "Revestimento Interno",      required: false },
    { id: "luzes_advertencia",   label: "Luzes de Advertência no Painel", required: true },
    { id: "limpeza_interna",     label: "Limpeza Interna",           required: false },
    { id: "vidro_esq",           label: "Vidro Janela Esquerda",     required: true  },
    { id: "vidro_dir",           label: "Vidro Janela Direita",      required: true  },
    { id: "buzina",              label: "Buzina",                    required: true  },
    { id: "luz_cabine",          label: "Luz de Cabine",             required: false },
    { id: "retrovisor_esq",      label: "Retrovisor Esquerdo",       required: true  },
    { id: "retrovisor_dir",      label: "Retrovisor Direito",        required: true  },
    { id: "ferramentas",         label: "Ferramentas (Kit)",         required: false },
    { id: "pistola_ar",          label: "Pistola de Ar",             required: false },
    { id: "garrafa_termica",     label: "Garrafa Térmica",           required: false },
    { id: "interclima",          label: "Interclima",                required: false },
  ],

  // ----------------------------------------------------------
  // 2. ILUMINAÇÃO E SINALIZAÇÃO (base — always included)
  // ----------------------------------------------------------
  lighting_signaling: [
    { id: "farol_baixo_e",   label: "Farol Baixo — Esquerdo",        required: true  },
    { id: "farol_baixo_d",   label: "Farol Baixo — Direito",         required: true  },
    { id: "farol_alto_e",    label: "Farol Alto — Esquerdo",         required: true  },
    { id: "farol_alto_d",    label: "Farol Alto — Direito",          required: true  },
    { id: "seta_diant_e",    label: "Seta Dianteira — Esquerda",     required: true  },
    { id: "seta_diant_d",    label: "Seta Dianteira — Direita",      required: true  },
    { id: "seta_lateral_e",  label: "Seta Lateral — Esquerda",       required: false },
    { id: "seta_lateral_d",  label: "Seta Lateral — Direita",        required: false },
    { id: "seta_tras_e",     label: "Seta Traseira — Esquerda",      required: true  },
    { id: "seta_tras_d",     label: "Seta Traseira — Direita",       required: true  },
    { id: "luz_freio",       label: "Luz de Freio",                  required: true  },
    { id: "luz_re",          label: "Luz de Ré",                     required: true  },
    { id: "luz_placa",       label: "Luz da Placa",                  required: true  },
  ],

  // ----------------------------------------------------------
  // 3. ILUMINAÇÃO AVANÇADA (optional — included if vehicle has it)
  // ----------------------------------------------------------
  advanced_lighting: [
    { id: "drl_e",           label: "DRL (Luz de Rodagem Diurna) — Esquerdo", required: false },
    { id: "drl_d",           label: "DRL (Luz de Rodagem Diurna) — Direito",  required: false },
    { id: "milha_e",         label: "Farol de Milha / Neblina — Esquerdo",    required: false },
    { id: "milha_d",         label: "Farol de Milha / Neblina — Direito",     required: false },
    { id: "led_re",          label: "LED de Ré",                              required: false },
    { id: "sirene_re",       label: "Sirene de Ré",                           required: false },
  ],

  // ----------------------------------------------------------
  // 4. ESTRUTURA, SEGURANÇA E FLUIDOS
  // ----------------------------------------------------------
  structure_safety_fluids: [
    { id: "parabrisa",       label: "Parabrisa (trincas / limpeza)",    required: true  },
    { id: "peliculas",       label: "Películas / Adesivos",             required: false },
    { id: "tanque",          label: "Tanque de Combustível",            required: true  },
    { id: "vazamento_ar",    label: "Vazamento de Ar",                  required: true  },
    { id: "cordas",          label: "Cordas / Cintas de Amarração",     required: false },
    { id: "estepe",          label: "Estepe",                           required: true  },
    { id: "pneu_integr",     label: "Integridade dos Pneus (desgaste / calibragem)", required: true },
  ],

  // ----------------------------------------------------------
  // 5. MECÂNICA E CARGA
  // ----------------------------------------------------------
  mechanical_load: [
    { id: "bolsa_suspensao", label: "Bolsa de Suspensão (air bag)",     required: true  },
    { id: "afivelar_carroce",label: "Afivelar / Aperto de Carroçaria",  required: false },
    { id: "lonas",           label: "Lonas de Cobertura / Proteção",    required: false },
    { id: "corote",          label: "Corote / Recipientes de Segurança",required: false },
  ],
};

// ============================================================
// CATEGORY METADATA
// Label, icon, order, and whether it requires the "advanced_lighting" capability.
// ============================================================

export const CATEGORY_META = {
  cab_internal:            { label: "1. Cabine Interna",              icon: "🚗", order: 1 },
  lighting_signaling:      { label: "2. Iluminação e Sinalização",    icon: "💡", order: 2 },
  advanced_lighting:       { label: "3. Iluminação Avançada",         icon: "🔦", order: 3, optional: true },
  structure_safety_fluids: { label: "4. Estrutura, Segurança e Fluidos", icon: "🔩", order: 4 },
  mechanical_load:         { label: "5. Mecânica e Carga",            icon: "⚙️", order: 5 },
};

// ============================================================
// CAPABILITY SETS
// Defines which categories a given vehicle "class" supports.
// The class is inferred from frotaDB.categoria — NO hardcoding.
// ============================================================

const CAPABILITY_RULES = [
  {
    // Light cars & shared vehicles: skip heavy mechanical_load
    match: (v) => v.categoria === "Carros Leves",
    capabilities: {
      cab_internal:            true,
      lighting_signaling:      true,
      advanced_lighting:       true,  // Modern cars typically have DRL
      structure_safety_fluids: true,
      mechanical_load:         false, // No suspension air bag, no lonas
    },
  },
  {
    // Motorcycles: minimal set
    match: (v) => v.categoria === "Motos",
    capabilities: {
      cab_internal:            false, // Motorcycles have a different cabin concept
      lighting_signaling:      true,
      advanced_lighting:       false,
      structure_safety_fluids: true,
      mechanical_load:         false,
    },
  },
  {
    // Default: all trucks, bitrucks, carretas, rodotrem → full checklist
    match: () => true,
    capabilities: {
      cab_internal:            true,
      lighting_signaling:      true,
      advanced_lighting:       false, // Most trucks don't have DRL standard → can be toggled
      structure_safety_fluids: true,
      mechanical_load:         true,
    },
  },
];

// ============================================================
// MOTORCYCLE OVERRIDES
// Motorcycles have different cab items
// ============================================================

const MOTO_CAB_ITEMS = [
  { id: "chave_moto",       label: "Chave da Moto",                        required: true  },
  { id: "painel_moto",      label: "Painel de Instrumentos",               required: true  },
  { id: "pneu_diant",       label: "Pneu Dianteiro (calibragem / desgaste)",required: true  },
  { id: "pneu_tras",        label: "Pneu Traseiro (calibragem / desgaste)", required: true  },
  { id: "corrente",         label: "Corrente / Relação (tensão / lubrificação)", required: true },
  { id: "freio_diant",      label: "Freio Dianteiro",                       required: true  },
  { id: "freio_tras",       label: "Freio Traseiro",                        required: true  },
  { id: "oleo_motor",       label: "Nível de Óleo do Motor",                required: true  },
  { id: "sem_vazamentos",   label: "Sem Vazamentos (óleo / combustível)",   required: true  },
  { id: "embreagem",        label: "Acionamento da Embreagem",              required: true  },
  { id: "escapamento",      label: "Sistema de Escapamento",                required: false },
  { id: "bau_moto",         label: "Baú (tranca / fixação)",                required: false },
  { id: "antena_corta_pipa",label: "Antena Corta-Pipa",                     required: false },
  { id: "capacete",         label: "Capacete (viseira / cinta)",            required: true  },
  { id: "capa_chuva",       label: "Capa de Chuva",                        required: false },
  { id: "retrovisor_e",     label: "Retrovisor Esquerdo",                   required: true  },
  { id: "retrovisor_d",     label: "Retrovisor Direito",                    required: true  },
];

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Resolves which capabilities a given vehicle has.
 * Returns a capability map: { cat_key: true|false }
 */
export function resolveCapabilities(veiculo) {
  for (const rule of CAPABILITY_RULES) {
    if (rule.match(veiculo)) {
      return { ...rule.capabilities };
    }
  }
  // Fallback — full checklist
  return Object.fromEntries(Object.keys(ITEM_CATALOG).map((k) => [k, true]));
}

/**
 * Builds the active checklist items for a vehicle.
 *
 * Returns an array of checklist items:
 * {
 *   id: string,
 *   label: string,
 *   category: string,
 *   status: null,    // to be filled by the user
 *   notes: "",
 *   photos: [],
 *   required: boolean,
 * }
 *
 * @param {Object} veiculo — vehicle record from frotaDB
 * @param {Object} overrides — optional capability overrides (e.g., { advanced_lighting: true })
 */
export function buildChecklist(veiculo, overrides = {}) {
  const capabilities = { ...resolveCapabilities(veiculo), ...overrides };

  const isMoto = veiculo.categoria === "Motos";

  const items = [];

  // Category order from CATEGORY_META
  const orderedCategories = Object.entries(CATEGORY_META)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key]) => key);

  for (const catKey of orderedCategories) {
    if (!capabilities[catKey]) continue;

    let catalogItems;
    if (catKey === "cab_internal" && isMoto) {
      catalogItems = MOTO_CAB_ITEMS;
    } else {
      catalogItems = ITEM_CATALOG[catKey] || [];
    }

    for (const item of catalogItems) {
      items.push({
        id:       item.id,
        label:    item.label,
        category: catKey,
        status:   null,      // "C" | "NC" — set by user
        notes:    "",
        photos:   [],
        required: item.required,
      });
    }
  }

  return items;
}

/**
 * Groups a flat items array by category, with metadata.
 * Used for rendering section headers in the UI.
 *
 * @returns {Array<{ key, meta, items }>}
 */
export function groupByCategory(items) {
  const groups = {};
  for (const item of items) {
    if (!groups[item.category]) {
      groups[item.category] = {
        key:   item.category,
        meta:  CATEGORY_META[item.category] || { label: item.category, icon: "📋", order: 99 },
        items: [],
      };
    }
    groups[item.category].items.push(item);
  }
  return Object.values(groups).sort((a, b) => a.meta.order - b.meta.order);
}

/**
 * Returns summary stats for a checklist items array.
 */
export function checklistStats(items) {
  const total     = items.length;
  const answered  = items.filter((i) => i.status !== null).length;
  const ncCount   = items.filter((i) => i.status === "NC").length;
  const cCount    = items.filter((i) => i.status === "C").length;
  const remaining = total - answered;
  const pct       = total > 0 ? Math.round((answered / total) * 100) : 0;

  return { total, answered, ncCount, cCount, remaining, pct };
}

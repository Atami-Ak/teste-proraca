/**
 * inspection-engine-maquinas.js — Dynamic Machinery Inspection Engine
 *
 * DESIGN PRINCIPLE:
 *   The engine composes inspection checklists from two layers:
 *
 *   1. BASE_ITEMS — items that apply to EVERY machine (7 sections)
 *   2. TYPE_RULES — rules that ADD section-specific items when a machine
 *      matches via tag predicates
 *
 *   Adding a new machine type = adding one entry to TYPE_RULES.
 *   No changes to the form, renderer, or DB layer required.
 *
 * ITEM SEVERITY:
 *   null      → not yet evaluated
 *   "ok"      → conforming, no action required
 *   "attention" → non-conformity requiring scheduled action
 *   "critical"  → immediate action required, machine at risk
 *
 * PHOTO RULE:
 *   severity "attention" or "critical" → photo is REQUIRED before submission.
 */

// ============================================================
// SECTION METADATA
// ============================================================

export const SECTION_META = {
  visual:      { label: "1. Inspeção Visual",          icon: "👁️",  order: 1 },
  mechanical:  { label: "2. Sistema Mecânico",         icon: "⚙️",  order: 2 },
  electrical:  { label: "3. Sistema Elétrico",         icon: "⚡",  order: 3 },
  operational: { label: "4. Teste Operacional",        icon: "▶️",  order: 4 },
  safety:      { label: "5. Sistema de Segurança",     icon: "🛡️",  order: 5 },
  lubrication: { label: "6. Lubrificação e Fluidos",   icon: "🛢️",  order: 6 },
  cleaning:    { label: "7. Limpeza e Ambiente",       icon: "🧹",  order: 7 },
};

// ============================================================
// BASE ITEM CATALOG — applies to EVERY machine
// ============================================================

const BASE_ITEMS = {

  visual: [
    { id: "vis_carcaca",     label: "Carcaça / Estrutura (trincas, deformações, amassamentos)", required: true  },
    { id: "vis_fixacoes",    label: "Parafusos e Fixações (folga, ausentes, frouxos)",          required: true  },
    { id: "vis_corrosao",    label: "Oxidação / Corrosão",                                       required: false },
    { id: "vis_protecoes",   label: "Proteções, Tampas e Coberturas (integridade)",              required: true  },
    { id: "vis_sinalizacao", label: "Sinalização de Segurança e Etiquetas (presença, legível)",  required: true  },
    { id: "vis_vazamentos",  label: "Vazamentos Visíveis (óleo, graxa, produto, água)",          required: true  },
    { id: "vis_pintura",     label: "Revestimento / Pintura (deterioração severa)",               required: false },
  ],

  mechanical: [
    { id: "mec_rolamentos",   label: "Rolamentos (temperatura ao toque, ruído anormal)",          required: true  },
    { id: "mec_acoplamento",  label: "Acoplamento Motor–Máquina (alinhamento, desgaste)",         required: true  },
    { id: "mec_vibracao",     label: "Nível de Vibração (excessivo, instável)",                   required: true  },
    { id: "mec_folgas",       label: "Folgas e Desgaste em Partes Móveis",                        required: false },
    { id: "mec_fixacao_motor",label: "Fixação do Motor / Pés Antivibrantes",                     required: false },
  ],

  electrical: [
    { id: "ele_motor_cond",   label: "Condição Geral do Motor (temperatura, ventilação, sujeira)", required: true  },
    { id: "ele_conexoes",     label: "Conexões Elétricas (aperto, oxidação, superaquecimento)",    required: true  },
    { id: "ele_painel",       label: "Painel / Caixa de Comando (organização, umidade)",           required: true  },
    { id: "ele_cabos",        label: "Roteamento e Estado dos Cabos (danos, dobras, fixação)",     required: false },
    { id: "ele_aterramento",  label: "Aterramento (continuidade, fixação)",                        required: true  },
    { id: "ele_prot_termica", label: "Proteção Térmica / Disjuntor / Relé (ajuste correto)",       required: true  },
  ],

  operational: [
    { id: "ope_partida",      label: "Partida e Parada (suave, sem solavancos ou demora)",         required: true  },
    { id: "ope_ruido",        label: "Ruído em Operação (ausência de ruídos anormais)",            required: true  },
    { id: "ope_temperatura",  label: "Temperatura de Operação (dentro do limite)",                 required: true  },
    { id: "ope_corrente",     label: "Corrente do Motor em Operação (dentro da faixa nominal)",    required: true  },
    { id: "ope_capacidade",   label: "Capacidade / Vazão Operacional (conforme especificação)",    required: false },
  ],

  safety: [
    { id: "seg_emergencia",   label: "Botão de Parada de Emergência (teste funcional)",            required: true  },
    { id: "seg_guards",       label: "Proteções Físicas em Operação (instaladas, íntegras)",       required: true  },
    { id: "seg_loto",         label: "Pontos de Bloqueio / LOTO (acessíveis, identificados)",      required: true  },
    { id: "seg_sensores",     label: "Sensores de Segurança (nível, presença, fim-de-curso)",      required: false },
    { id: "seg_advertencia",  label: "Avisos e Sinalização de Perigo (visíveis, completos)",       required: false },
  ],

  lubrication: [
    { id: "lub_nivel",        label: "Nível de Óleo / Graxa (dentro da faixa)",                   required: true  },
    { id: "lub_qualidade",    label: "Qualidade do Lubrificante (cor, aspecto, contaminação)",     required: false },
    { id: "lub_graxeiros",    label: "Pontos de Graxeiros (aplicação periódica, condição)",        required: true  },
    { id: "lub_sem_vaz",      label: "Ausência de Vazamentos de Lubrificante",                    required: true  },
  ],

  cleaning: [
    { id: "lim_maquina",      label: "Limpeza Geral da Máquina (superfície exterior)",             required: false },
    { id: "lim_area",         label: "Limpeza da Área Entorno (piso, acesso)",                    required: false },
    { id: "lim_residuos",     label: "Ausência de Resíduos de Produto Acumulados",                required: true  },
    { id: "lim_filtros",      label: "Filtros, Telas e Coletores de Pó (limpeza, condição)",       required: false },
  ],
};

// ============================================================
// TYPE RULES — machine-specific extra items
// Each rule matches via the machine's `tags` array.
// Multiple rules can match the same machine (composed).
// ============================================================

const TYPE_RULES = [

  // ──────────────────────────────────────────────────────────
  // PENEIRA / SIEVE
  // ──────────────────────────────────────────────────────────
  {
    match:       (m) => m.tags.includes("peneira"),
    label:       "Peneira",
    extraItems: {
      mechanical: [
        { id: "pen_tela",      label: "Tela de Peneiração (furos, rasgos, tensão adequada)",      required: true  },
        { id: "pen_excentrico",label: "Mecanismo Excêntrico / Vibrador (folga, desgaste)",        required: true  },
        { id: "pen_molas",     label: "Molas de Apoio / Antivibrantes (quebra, desgaste uniforme)", required: true },
        { id: "pen_calhas",    label: "Calhas e Saídas (entupimentos, danos)",                    required: false },
        { id: "pen_contrapeso",label: "Contrapesos (soltos, posicionamento)",                     required: false },
      ],
      operational: [
        { id: "pen_amplitude",  label: "Amplitude de Vibração (visual — estável e uniforme)",     required: false },
        { id: "pen_eficiencia", label: "Eficiência de Separação (material passante correto)",     required: false },
        { id: "pen_entupimento",label: "Ausência de Entupimento na Tela",                         required: true  },
      ],
    },
  },

  // ──────────────────────────────────────────────────────────
  // MOINHO BASE (comum a todos os tipos de moinho)
  // ──────────────────────────────────────────────────────────
  {
    match:       (m) => m.tags.includes("moinho"),
    label:       "Moinho",
    extraItems: {
      mechanical: [
        { id: "mill_camara",   label: "Câmara de Moagem (corpo estranho, acúmulo, desgaste interno)", required: true },
        { id: "mill_garganta", label: "Garganta / Boca de Alimentação (desgaste, entupimento)",  required: false },
      ],
      operational: [
        { id: "mill_granulom", label: "Granulometria do Produto (visual — dentro do padrão)",    required: true  },
        { id: "mill_temp_rolam",label: "Temperatura dos Rolamentos (< 60 °C recomendado)",       required: true  },
      ],
    },
  },

  // ──────────────────────────────────────────────────────────
  // MOINHO DE MARTELOS (hammer mill specific)
  // ──────────────────────────────────────────────────────────
  {
    match:       (m) => m.tags.includes("martelos"),
    label:       "Moinho de Martelos",
    extraItems: {
      mechanical: [
        { id: "hmil_martelos",  label: "Condição dos Martelos (desgaste simétrico, trincas, fissuras)", required: true },
        { id: "hmil_pinos",     label: "Pinos dos Martelos (desgaste, folga excessiva)",          required: true  },
        { id: "hmil_rotor_eq",  label: "Equilíbrio do Rotor (sem vibração excessiva pós-troca)",  required: true  },
        { id: "hmil_tela",      label: "Tela / Grade de Peneiramento (furos, desgaste, assentamento)", required: true },
        { id: "hmil_placas_d",  label: "Placas de Desgaste Internas (desgaste, fixação)",         required: false },
      ],
      operational: [
        { id: "hmil_corrente",  label: "Corrente de Operação (A) — carga dentro do nominal",     required: true  },
        { id: "hmil_filtro_ar", label: "Filtro de Ar de Entrada (limpeza, colmatação)",          required: false },
      ],
    },
  },

  // ──────────────────────────────────────────────────────────
  // MOINHO DE ROLOS (roll mill specific)
  // ──────────────────────────────────────────────────────────
  {
    match:       (m) => m.tags.includes("rolos") && m.tags.includes("moinho"),
    label:       "Moinho de Rolos",
    extraItems: {
      mechanical: [
        { id: "rmil_folga",    label: "Folga entre Rolos (ajuste / calibração)",                  required: true  },
        { id: "rmil_surf_rolo",label: "Superfície dos Rolos (estriamento, desgaste uniforme)",    required: true  },
        { id: "rmil_rolos_al", label: "Rolos de Alimentação / Dosagem",                          required: false },
        { id: "rmil_raspador", label: "Raspadores / Limpadores de Rolo",                          required: false },
      ],
    },
  },

  // ──────────────────────────────────────────────────────────
  // MISTURADOR
  // ──────────────────────────────────────────────────────────
  {
    match:       (m) => m.tags.includes("misturador"),
    label:       "Misturador",
    extraItems: {
      mechanical: [
        { id: "mix_paletas",   label: "Paletas / Fitas de Mistura (desgaste, dobras, folga do eixo)", required: true },
        { id: "mix_folga_pal", label: "Folga entre Paletas e Carcaça Interna (< 5 mm recomendado)", required: true },
        { id: "mix_vedacoes",  label: "Vedações do Eixo / Retentores (vazamento de produto)",     required: true  },
        { id: "mix_porta",     label: "Porta de Descarga (vedação, acionamento, trava)",          required: true  },
        { id: "mix_parede_int",label: "Parede Interna (acúmulo de produto, corrosão pontual)",    required: false },
      ],
      operational: [
        { id: "mix_uniformid", label: "Uniformidade de Mistura (amostragem visual ou CV < 5%)",   required: false },
        { id: "mix_ciclo",     label: "Tempo de Ciclo de Mistura (conforme padrão)",              required: false },
        { id: "mix_descarga",  label: "Descarga Total (ausência de resíduos pós-ciclo)",          required: true  },
      ],
    },
  },

  // ──────────────────────────────────────────────────────────
  // PELETIZADORA
  // ──────────────────────────────────────────────────────────
  {
    match:       (m) => m.tags.includes("peletizadora"),
    label:       "Peletizadora",
    extraItems: {
      mechanical: [
        { id: "pel_matriz",    label: "Condição da Matriz (furos parcialmente entupidos, trincas, desgaste)", required: true },
        { id: "pel_rolos",     label: "Condição dos Rolos (desgaste, trincas, girando livres)",   required: true  },
        { id: "pel_folga_rm",  label: "Folga Rolo–Matriz (ajuste: papel de cigarro passando leve)", required: true },
        { id: "pel_faca",      label: "Faca de Corte (ângulo, desgaste, distância da matriz)",    required: false },
        { id: "pel_cond_pal",  label: "Paletas do Condicionador (desgaste, fixação)",             required: false },
        { id: "pel_rosca_al",  label: "Rosca de Alimentação da Matriz (desgaste, folgas)",        required: false },
      ],
      operational: [
        { id: "pel_qual_pelet",label: "Qualidade do Pêlete (dureza, comprimento uniforme, % finos)", required: true },
        { id: "pel_temp_cond", label: "Temperatura do Condicionador (°C — conforme formulação)", required: true  },
        { id: "pel_taxa_prod", label: "Taxa de Produção (t/h — conforme especificação)",          required: false },
      ],
      lubrication: [
        { id: "pel_lub_rolos", label: "Lubrificação dos Mancais dos Rolos (graxeiros)",           required: true  },
        { id: "pel_sist_lubr", label: "Sistema de Lubrificação Automático (nível, funcionamento)", required: false },
      ],
      safety: [
        { id: "pel_purg_vapor",label: "Purgador de Vapor do Condicionador (funcionando, sem bloqueio)", required: true },
        { id: "pel_prot_matr", label: "Tampa de Acesso à Câmara da Matriz (travada em operação)", required: true  },
      ],
    },
  },

  // ──────────────────────────────────────────────────────────
  // ROSCA TRANSPORTADORA
  // ──────────────────────────────────────────────────────────
  {
    match:       (m) => m.tags.includes("rosca"),
    label:       "Rosca Transportadora",
    extraItems: {
      mechanical: [
        { id: "ros_helice",    label: "Hélice / Espiral (desgaste uniforme, dobras, furos)",       required: true  },
        { id: "ros_calha",     label: "Calha / Tubo de Transporte (desgaste, furos, corrosão)",    required: true  },
        { id: "ros_mancais",   label: "Mancais Intermediários / Suspensão (condição, lubrificação)", required: false },
        { id: "ros_io",        label: "Entradas e Saídas (entupimentos, desgaste, tampas)",         required: false },
      ],
      operational: [
        { id: "ros_carga",     label: "Carga do Motor em Operação (sem sobrecargas)",              required: false },
        { id: "ros_entupam",   label: "Ausência de Entupimento / Refluxo",                         required: true  },
      ],
    },
  },

  // ──────────────────────────────────────────────────────────
  // ELEVADOR DE CANECAS
  // ──────────────────────────────────────────────────────────
  {
    match:       (m) => m.tags.includes("elevador"),
    label:       "Elevador de Canecas",
    extraItems: {
      mechanical: [
        { id: "elv_canecas",   label: "Condição das Canecas (quebras, amassamentos, desgaste)",    required: true  },
        { id: "elv_correia",   label: "Correia / Corrente (tensão adequada, desgaste, emendas)",   required: true  },
        { id: "elv_cabeca",    label: "Tambor / Polia da Cabeça (desgaste, alinhamento)",          required: true  },
        { id: "elv_bota",      label: "Tambor / Polia da Bota e Tensionador",                     required: true  },
        { id: "elv_par_can",   label: "Parafusos de Fixação das Canecas (nenhum faltando)",        required: true  },
        { id: "elv_lim_bota",  label: "Limpeza da Seção de Bota (acúmulo de produto)",            required: false },
      ],
      operational: [
        { id: "elv_rastreiam", label: "Rastreamento / Alinhamento da Correia (sem desvio lateral)", required: true },
        { id: "elv_refluxo",   label: "Ausência de Refluxo de Produto na Bota",                   required: true  },
      ],
      safety: [
        { id: "elv_prot_corr", label: "Protetores de Correia (cabeça e bota — instalados)",       required: true  },
        { id: "elv_antirret",  label: "Sensor de Velocidade / Antirretorno (funcionando)",        required: true  },
      ],
    },
  },
];

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Builds the full item list for a given machine.
 *
 * @param {Object} maquina — machine record from maquinasDB
 * @returns {Array<InspectionItem>}
 *
 * Each item shape:
 * {
 *   id:       string,
 *   label:    string,
 *   section:  string,       // section key
 *   severity: null,         // filled by user: "ok" | "attention" | "critical"
 *   notes:    "",
 *   photos:   [],
 *   required: boolean,
 *   requirePhotoOnIssue: true,  // always true for non-OK items
 * }
 */
export function buildInspectionChecklist(maquina) {
  // Deep-clone base items and stamp section key + runtime fields
  const items = [];

  const orderedSections = Object.entries(SECTION_META)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key]) => key);

  for (const sectionKey of orderedSections) {
    const baseList = (BASE_ITEMS[sectionKey] || []).map((item) =>
      _makeItem(item, sectionKey)
    );
    items.push(...baseList);
  }

  // Apply each matching rule's extra items
  for (const rule of TYPE_RULES) {
    if (!rule.match(maquina)) continue;

    for (const [sectionKey, extraList] of Object.entries(rule.extraItems || {})) {
      for (const item of extraList) {
        // Avoid duplicates if a base item has the same id
        if (!items.find((i) => i.id === item.id)) {
          items.push(_makeItem(item, sectionKey));
        }
      }
    }
  }

  // Re-sort so all items within each section are grouped and sections are ordered
  return items.sort((a, b) => {
    const orderA = SECTION_META[a.section]?.order ?? 99;
    const orderB = SECTION_META[b.section]?.order ?? 99;
    return orderA - orderB;
  });
}

function _makeItem(catalogItem, sectionKey) {
  return {
    id:                catalogItem.id,
    label:             catalogItem.label,
    section:           sectionKey,
    severity:          null,      // "ok" | "attention" | "critical"
    notes:             "",
    photos:            [],
    required:          catalogItem.required,
    requirePhotoOnIssue: true,    // universal rule: photo needed for any non-OK
  };
}

/**
 * Groups a flat items array by section, with metadata.
 * Used for rendering section headers in the UI.
 *
 * @returns {Array<{ key, meta, items }>}
 */
export function groupBySection(items) {
  const groups = {};
  for (const item of items) {
    if (!groups[item.section]) {
      groups[item.section] = {
        key:   item.section,
        meta:  SECTION_META[item.section] || { label: item.section, icon: "📋", order: 99 },
        items: [],
      };
    }
    groups[item.section].items.push(item);
  }
  return Object.values(groups).sort((a, b) => a.meta.order - b.meta.order);
}

/**
 * Computes aggregate inspection stats.
 *
 * @returns {{ total, answered, okCount, attCount, critCount, remaining, pct }}
 */
export function inspectionStats(items) {
  const total     = items.length;
  const answered  = items.filter((i) => i.severity !== null).length;
  const okCount   = items.filter((i) => i.severity === "ok").length;
  const attCount  = items.filter((i) => i.severity === "attention").length;
  const critCount = items.filter((i) => i.severity === "critical").length;
  const pct       = total > 0 ? Math.round((answered / total) * 100) : 0;

  return { total, answered, okCount, attCount, critCount, remaining: total - answered, pct };
}

/**
 * Calculates the overall inspection status from item severities.
 *
 *   Any CRITICAL → "CRITICAL"
 *   Any ATTENTION → "ATTENTION"
 *   All OK        → "OK"
 *   Unanswered    → "PENDING"
 */
export function calculateInspectionStatus(items) {
  if (items.some((i) => i.severity === "critical"))  return "CRITICAL";
  if (items.some((i) => i.severity === "attention")) return "ATTENTION";
  if (items.length > 0 && items.every((i) => i.severity === "ok")) return "OK";
  return "PENDING";
}

/**
 * Returns true if a Work Order must be auto-created:
 *   - Any CRITICAL item
 *   - OR 3+ ATTENTION items
 */
export function shouldTriggerWorkOrder(items) {
  const critCount = items.filter((i) => i.severity === "critical").length;
  const attCount  = items.filter((i) => i.severity === "attention").length;
  return critCount > 0 || attCount >= 3;
}

/**
 * Returns items that need a photo but have none.
 * Used in validation before submission.
 */
export function itemsMissingPhoto(items) {
  return items.filter(
    (i) => (i.severity === "attention" || i.severity === "critical") && i.photos.length === 0
  );
}

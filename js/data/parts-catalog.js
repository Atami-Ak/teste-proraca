/**
 * parts-catalog.js — Automatic Parts Requirement Catalog
 *
 * Maps checklist item IDs to the parts typically needed when that item is NC.
 *
 * DESIGN:
 *  - requiresPurchase: true → Action Engine creates a Purchase Work Order automatically
 *  - severity: mirrors the maintenance priority for the generated WO
 *  - parts[]: concrete items list (name, quantity, priority)
 *
 * Items NOT listed here → maintenance-only (labour, no parts purchase required)
 * e.g.: ar_condicionado (recharge/cleaning), painel (diagnostic), buzina (reconnect)
 *
 * To add a new mapping: just add the checklist item ID as a key.
 * No other file needs to change.
 */

export const PARTS_CATALOG = {

  // ── ILUMINAÇÃO E SINALIZAÇÃO ──────────────────────────────────────────────
  farol_baixo_e: {
    requiresPurchase: true,
    parts: [{ name: "Lâmpada Farol Baixo — Esquerdo", quantity: 1, priority: "high" }],
  },
  farol_baixo_d: {
    requiresPurchase: true,
    parts: [{ name: "Lâmpada Farol Baixo — Direito", quantity: 1, priority: "high" }],
  },
  farol_alto_e: {
    requiresPurchase: true,
    parts: [{ name: "Lâmpada Farol Alto — Esquerdo", quantity: 1, priority: "medium" }],
  },
  farol_alto_d: {
    requiresPurchase: true,
    parts: [{ name: "Lâmpada Farol Alto — Direito", quantity: 1, priority: "medium" }],
  },
  seta_diant_e: {
    requiresPurchase: true,
    parts: [{ name: "Lâmpada Seta Dianteira — Esquerda", quantity: 1, priority: "medium" }],
  },
  seta_diant_d: {
    requiresPurchase: true,
    parts: [{ name: "Lâmpada Seta Dianteira — Direita", quantity: 1, priority: "medium" }],
  },
  seta_lateral_e: {
    requiresPurchase: true,
    parts: [{ name: "Lâmpada Seta Lateral — Esquerda", quantity: 1, priority: "low" }],
  },
  seta_lateral_d: {
    requiresPurchase: true,
    parts: [{ name: "Lâmpada Seta Lateral — Direita", quantity: 1, priority: "low" }],
  },
  seta_tras_e: {
    requiresPurchase: true,
    parts: [{ name: "Lâmpada Seta Traseira — Esquerda", quantity: 1, priority: "medium" }],
  },
  seta_tras_d: {
    requiresPurchase: true,
    parts: [{ name: "Lâmpada Seta Traseira — Direita", quantity: 1, priority: "medium" }],
  },
  luz_freio: {
    requiresPurchase: true,
    parts: [{ name: "Lâmpada Luz de Freio", quantity: 2, priority: "high" }],
  },
  luz_re: {
    requiresPurchase: true,
    parts: [{ name: "Lâmpada Luz de Ré", quantity: 1, priority: "medium" }],
  },
  luz_placa: {
    requiresPurchase: true,
    parts: [{ name: "Lâmpada Luz de Placa", quantity: 1, priority: "low" }],
  },

  // ── ILUMINAÇÃO AVANÇADA ───────────────────────────────────────────────────
  drl_e: {
    requiresPurchase: true,
    parts: [{ name: "Módulo DRL — Esquerdo", quantity: 1, priority: "low" }],
  },
  drl_d: {
    requiresPurchase: true,
    parts: [{ name: "Módulo DRL — Direito", quantity: 1, priority: "low" }],
  },
  milha_e: {
    requiresPurchase: true,
    parts: [{ name: "Lâmpada Milha / Neblina — Esquerda", quantity: 1, priority: "low" }],
  },
  milha_d: {
    requiresPurchase: true,
    parts: [{ name: "Lâmpada Milha / Neblina — Direita", quantity: 1, priority: "low" }],
  },

  // ── ESTRUTURA, SEGURANÇA E FLUIDOS ───────────────────────────────────────
  estepe: {
    requiresPurchase: true,
    parts: [{ name: "Pneu Estepe", quantity: 1, priority: "high" }],
  },
  pneu_integr: {
    requiresPurchase: true,
    parts: [{ name: "Pneu (desgaste / recalibração)", quantity: 1, priority: "high" }],
  },
  limpador_parabrisa: {
    requiresPurchase: true,
    parts: [{ name: "Palheta Limpador de Parabrisa", quantity: 2, priority: "medium" }],
  },
  tanque: {
    requiresPurchase: false,
    parts: [],
  },

  // ── MECÂNICA E CARGA ──────────────────────────────────────────────────────
  bolsa_suspensao: {
    requiresPurchase: true,
    parts: [{ name: "Bolsa de Suspensão (Air Bag)", quantity: 1, priority: "high" }],
  },
  lonas: {
    requiresPurchase: true,
    parts: [{ name: "Lona de Cobertura / Proteção", quantity: 1, priority: "medium" }],
  },
  cordas: {
    requiresPurchase: true,
    parts: [{ name: "Corda / Cinta de Amarração", quantity: 2, priority: "medium" }],
  },

  // ── CABINE INTERNA ────────────────────────────────────────────────────────
  limpeza_interna: {
    requiresPurchase: false, // service only
    parts: [],
  },

  // ── MOTO ──────────────────────────────────────────────────────────────────
  pneu_diant: {
    requiresPurchase: true,
    parts: [{ name: "Pneu Dianteiro (Moto)", quantity: 1, priority: "high" }],
  },
  pneu_tras: {
    requiresPurchase: true,
    parts: [{ name: "Pneu Traseiro (Moto)", quantity: 1, priority: "high" }],
  },
  corrente: {
    requiresPurchase: true,
    parts: [{ name: "Corrente de Transmissão", quantity: 1, priority: "medium" }],
  },
  freio_diant: {
    requiresPurchase: true,
    parts: [{ name: "Pastilha / Lona de Freio Dianteiro", quantity: 1, priority: "high" }],
  },
  freio_tras: {
    requiresPurchase: true,
    parts: [{ name: "Pastilha / Lona de Freio Traseiro", quantity: 1, priority: "high" }],
  },
  oleo_motor: {
    requiresPurchase: true,
    parts: [{ name: "Óleo de Motor", quantity: 1, priority: "high" }],
  },
  capacete: {
    requiresPurchase: true,
    parts: [{ name: "Capacete (substituição)", quantity: 1, priority: "high" }],
  },
  capa_chuva: {
    requiresPurchase: true,
    parts: [{ name: "Capa de Chuva", quantity: 1, priority: "low" }],
  },
  antena_corta_pipa: {
    requiresPurchase: true,
    parts: [{ name: "Antena Corta-Pipa", quantity: 1, priority: "medium" }],
  },
};

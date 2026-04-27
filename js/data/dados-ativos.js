/**
 * dados-ativos.js — Catálogo de categorias de ativos
 *
 * Fonte de verdade para as categorias do sistema de gestão de ativos.
 * Ativos da categoria EQP vêm de maquinas-db.js (compatibilidade com o sistema atual).
 * Demais categorias são carregadas do Firestore (collection: assets).
 */

export const CATEGORIAS_ATIVOS = [
  {
    id:          "EQP",
    nome:        "Equipamentos Industriais",
    prefix:      "EQP",
    icon:        "⚙️",
    cor:         "#0f4c75",
    corLight:    "#e0f2fe",
    descricao:   "Máquinas de produção, extrusoras, misturadoras, silos",
    fonte:       "local", // dados de maquinas-db.js
    camposExtras: ["fabricante", "modelo", "potenciaKw", "rpm"],
  },
  {
    id:          "TI",
    nome:        "Informática & TI",
    prefix:      "TI",
    icon:        "💻",
    cor:         "#3b82f6",
    corLight:    "#eff6ff",
    descricao:   "Computadores, servidores, redes, câmeras CFTV",
    fonte:       "firestore",
    camposExtras: ["processador", "ram", "ip", "numeroSerie"],
  },
  {
    id:          "INF",
    nome:        "Infraestrutura",
    prefix:      "INF",
    icon:        "🏗️",
    cor:         "#78716c",
    corLight:    "#f5f5f4",
    descricao:   "Paredes, telhados, pisos, portões, cisternas",
    fonte:       "firestore",
    camposExtras: ["areaM2", "material", "anoConstrucao"],
  },
  {
    id:          "FER",
    nome:        "Ferramentas & Operacionais",
    prefix:      "FER",
    icon:        "🔧",
    cor:         "#f59e0b",
    corLight:    "#fffbeb",
    descricao:   "Paleteiras, ferramentas elétricas, compressores portáteis",
    fonte:       "firestore",
    camposExtras: ["cargaMaxKg", "voltagem"],
  },
  {
    id:          "ELE",
    nome:        "Eletrônicos & Instrumentação",
    prefix:      "ELE",
    icon:        "⚡",
    cor:         "#8b5cf6",
    corLight:    "#f5f3ff",
    descricao:   "Inversores, painéis elétricos, PLCs, sensores",
    fonte:       "firestore",
    camposExtras: ["tensao", "correnteA", "ipRating"],
  },
  {
    id:          "MOB",
    nome:        "Mobiliário & Facilities",
    prefix:      "MOB",
    icon:        "🪑",
    cor:         "#10b981",
    corLight:    "#f0fdf4",
    descricao:   "Móveis, bebedouros, armários, extintores",
    fonte:       "firestore",
    camposExtras: ["cor", "material"],
  },
];

export const CATEGORIA_MAP = Object.fromEntries(
  CATEGORIAS_ATIVOS.map(c => [c.id, c])
);

export const STATUS_ATIVO = {
  ativo:      { label: "Ativo",       cor: "#16a34a", bg: "#f0fdf4", border: "#86efac", icon: "●" },
  manutencao: { label: "Manutenção",  cor: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: "●" },
  inativo:    { label: "Inativo",     cor: "#6b7280", bg: "#f9fafb", border: "#d1d5db", icon: "●" },
  descartado: { label: "Descartado",  cor: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "●" },
};

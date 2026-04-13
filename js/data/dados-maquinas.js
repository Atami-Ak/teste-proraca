// js/dados-maquinas.js

/**
 * Catálogo Mestre de Ativos (Asset Master Data)
 * Em um cenário de produção (pós-MVP), estes dados viriam do seu ERP (ex: SAP/Totvs).
 * Para o MVP, este arquivo atua como nossa Fonte da Verdade (Single Source of Truth).
 */
export const catalogoMaquinas = [
  {
    id: "MIS-001",
    nome: "Misturador Horizontal",
    setor: "Mistura",
    criticidade: "Alta", // Curva ABC: Impacta a linha de produção imediatamente se parar
  },
  {
    id: "PEL-001",
    nome: "Peletizadora",
    setor: "Processamento",
    criticidade: "Alta",
  },
  {
    id: "MOI-001",
    nome: "Moinho de Martelos",
    setor: "Moagem",
    criticidade: "Média",
  },
  {
    id: "EXT-001",
    nome: "Extrusora",
    setor: "Processamento",
    criticidade: "Alta",
  },
  {
    id: "SIL-001",
    nome: "Silo de Armazenagem",
    setor: "Estoque",
    criticidade: "Baixa",
  },
  {
    id: "ELE-001",
    nome: "Elevador de Canecas",
    setor: "Transporte",
    criticidade: "Média",
  },
  // --- Novos Ativos Adicionados para encorpar o MVP ---
  {
    id: "ENS-001",
    nome: "Ensacadeira Automática",
    setor: "Embalagem",
    criticidade: "Média",
  },
  {
    id: "CAL-001",
    nome: "Caldeira a Vapor",
    setor: "Utilidades",
    criticidade: "Alta", // Equipamento de risco (NR-13), vital para extrusão e peletização
  },
];

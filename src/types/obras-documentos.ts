// src/types/obras-documentos.ts
// CIP V2 — Documentação da Obra (contrato, aditivos, ART, seguro, licenças…).
// Primeiro passo do Compliance Center / GED do roadmap CIP — ainda sem
// validade/vencimento (isso entra junto com o GED completo).

export type ObraDocumentoTipo =
  | 'contrato'
  | 'aditivo'
  | 'art'
  | 'seguro'
  | 'licenca'
  | 'nota_fiscal'
  | 'outro'

export interface ObraDocumento {
  id?:          string
  obraId:       string
  tipo:         ObraDocumentoTipo
  nome:         string
  fileName:     string
  url:          string
  uploadedBy?:  string
  createdAt?:   Date
}

export const OBRA_DOC_TIPO_META: Record<ObraDocumentoTipo, { label: string; icon: string }> = {
  contrato:    { label: 'Contrato',     icon: '📄' },
  aditivo:     { label: 'Aditivo',      icon: '📑' },
  art:         { label: 'ART',          icon: '📐' },
  seguro:      { label: 'Seguro',       icon: '🛡️' },
  licenca:     { label: 'Licença',      icon: '🏛️' },
  nota_fiscal: { label: 'Nota Fiscal',  icon: '🧾' },
  outro:       { label: 'Outro',        icon: '📎' },
}

export const OBRA_DOC_TIPOS = Object.keys(OBRA_DOC_TIPO_META) as ObraDocumentoTipo[]

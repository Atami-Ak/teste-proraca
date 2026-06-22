// ── Supply Inventory (Insumos) — Domain Types ─────────────────────────────────

export type InsumoCategoria = 'Insumos' | 'Premix e Núcleos' | 'Sacaria' | 'Subprodutos'

export interface InsumoItem {
  cod: string
  nome: string
  peso: number | null          // kg per unit (null = not applicable)
  estoqueMinimo: number | null
  lotes: string[]
  fornecedores: string[]
}

export interface InsumoBloco {
  categoria: InsumoCategoria
  itens: InsumoItem[]
}

// ── Counting session ──────────────────────────────────────────────────────────

export interface LoteContagem {
  id: string                   // local unique ID (session-only)
  nome: string                 // lot name (from list or custom)
  fornecedor: string
  quantidade: string           // kept as string to allow empty input
  racao: string                // only for "Ração Vencida"
}

export interface LoteDetalhe {
  nomeLote: string
  fornecedor: string
  quantidade: number
}

export interface EstoqueItem {
  total: number
  lotesDetalhes: LoteDetalhe[]
}

export type EstoqueMap = Record<string, EstoqueItem>

export interface ContagemInsumos {
  id: string
  tipo: 'insumos'
  status: 'finalizada'
  data: string                 // YYYY-MM-DD
  hora: string                 // HH:mm (end time)
  horaInicio: string
  horaFim?: string
  usuario: string
  usuarioId: string
  estoque: EstoqueMap
  observacoes: string
  createdAt: unknown           // Firestore Timestamp (use .toDate() carefully)
  updatedAt?: unknown
  docId?: string               // added client-side from doc.id
}

// ── Draft / auto-save ─────────────────────────────────────────────────────────

export interface DraftInsumos {
  uid: string
  estadoLotes: Record<string, LoteContagem[]>
  observacoes: string
  startedAtMs: number
  updatedAtMs: number
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export type AuditAcao =
  | 'criou_insumo'
  | 'editou_insumo'
  | 'removeu_insumo'
  | 'adicionou_lote'
  | 'removeu_lote'
  | 'adicionou_fornecedor'
  | 'removeu_fornecedor'
  | 'criou_contagem'
  | 'editou_contagem'

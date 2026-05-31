// src/pages/dashboard/documentos/DocumentCenterPage.tsx
// Document Center — centralised document control & traceability module.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  fetchAllDocuments, fetchNextDocumentPage, filterDocuments, clearDocumentCache,
} from '@/lib/db-document-center'
import type { OrderDocument, ServiceDocumentContent, PurchaseDocumentContent } from '@/types'
import {
  SERVICE_ORDER_STATUS_META, PURCHASE_ORDER_STATUS_META, PRIORITY_META,
} from '@/types'
import { fmtCurrency, fmtDocDate } from '@/lib/document-generator'
import DocumentViewer from '@/pages/orders/DocumentViewer'
import type {
  UnifiedDocument, DocFilters, DocStats,
  DocCategoryFilter, DocDateFilter,
} from '@/types/document-center'
import {
  DEFAULT_DOC_FILTERS, CATEGORY_META,
} from '@/types/document-center'
import s from './DocumentCenterPage.module.css'

// ── Helpers ───────────────────────────────────────────────────

function fmtDate(d: Date | null | undefined | string): string {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d as string)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateTime(d: Date | null | undefined | string): string {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d as string)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Category badge ────────────────────────────────────────────

function CategoryBadge({ doc }: { doc: UnifiedDocument }) {
  const meta = CATEGORY_META[doc.category]
  return (
    <span
      className={s.catBadge}
      style={{ color: meta.color, background: meta.color + '16', borderColor: meta.color + '40' }}
    >
      {meta.icon} {meta.label}
    </span>
  )
}

// ── Inline document detail ────────────────────────────────────

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className={s.detailRow}>
      <span className={s.detailLabel}>{label}</span>
      <span className={s.detailValue}>{value}</span>
    </div>
  )
}

function ServiceDocDetail({ doc }: { doc: UnifiedDocument }) {
  const content = doc.rawOrderDoc?.content as ServiceDocumentContent | undefined
  if (!content) return <div className={s.noContent}>Conteúdo indisponível.</div>

  const statusMeta   = SERVICE_ORDER_STATUS_META[content.status]   ?? { label: content.status,   color: '#94a3b8' }
  const priorityMeta = content.priority ? (PRIORITY_META[content.priority] ?? { label: content.priority, color: '#94a3b8' }) : null

  return (
    <div className={s.docContent}>
      <div className={s.contentStatus} style={{ color: statusMeta.color, background: statusMeta.color + '16' }}>
        {statusMeta.label}
      </div>
      <DetailRow label="Título"        value={content.title} />
      <DetailRow label="Solicitante"   value={content.requestedBy} />
      <DetailRow label="Técnico"       value={content.technician} />
      <DetailRow label="Tipo"          value={content.serviceType === 'internal' ? 'Interno' : 'Externo'} />
      {priorityMeta && <DetailRow label="Prioridade" value={priorityMeta.label} />}
      <DetailRow label="Ativo (ID)"    value={content.assetId} />
      <DetailRow label="Data prevista" value={fmtDocDate(content.scheduledDate)} />
      <DetailRow label="Data conclusão" value={fmtDocDate(content.completedDate)} />
      <DetailRow label="Custo"         value={content.cost != null ? fmtCurrency(content.cost) : undefined} />
      {content.description && (
        <div className={s.descBlock}>
          <div className={s.descTitle}>Descrição</div>
          <p className={s.descText}>{content.description}</p>
        </div>
      )}
      {content.notes && (
        <div className={s.descBlock}>
          <div className={s.descTitle}>Observações</div>
          <p className={s.descText}>{content.notes}</p>
        </div>
      )}
    </div>
  )
}

function PurchaseDocDetail({ doc }: { doc: UnifiedDocument }) {
  const content = doc.rawOrderDoc?.content as PurchaseDocumentContent | undefined
  if (!content) return <div className={s.noContent}>Conteúdo indisponível.</div>

  const statusMeta = PURCHASE_ORDER_STATUS_META[content.status] ?? { label: content.status, color: '#94a3b8' }

  return (
    <div className={s.docContent}>
      <div className={s.contentStatus} style={{ color: statusMeta.color, background: statusMeta.color + '16' }}>
        {statusMeta.label}
      </div>
      <DetailRow label="Título"       value={content.title} />
      <DetailRow label="Solicitante"  value={content.requestedBy} />
      <DetailRow label="Aprovado por" value={content.approvedBy} />
      <DetailRow label="Fornecedor"   value={content.supplierId} />
      <DetailRow label="Ativo (ID)"   value={content.assetId} />
      {content.description && (
        <div className={s.descBlock}>
          <div className={s.descTitle}>Descrição</div>
          <p className={s.descText}>{content.description}</p>
        </div>
      )}
      {content.items.length > 0 && (
        <div className={s.itemsBlock}>
          <div className={s.descTitle}>Itens</div>
          <table className={s.itemsTable}>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qtd</th>
                <th>Unid.</th>
                <th>Unit.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {content.items.map((it, i) => (
                <tr key={i}>
                  <td>{it.description}</td>
                  <td style={{ textAlign: 'center' }}>{it.quantity}</td>
                  <td>{it.unit}</td>
                  <td style={{ textAlign: 'right' }}>{fmtCurrency(it.unitPrice)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {fmtCurrency(it.quantity * (it.unitPrice ?? 0))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ fontWeight: 700, textAlign: 'right' }}>Total</td>
                <td style={{ fontWeight: 800, textAlign: 'right', color: '#166534' }}>
                  {fmtCurrency(content.totalValue)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function LegacyDocDetail({ doc }: { doc: UnifiedDocument }) {
  const raw = doc.rawData ?? {}
  const entries = Object.entries(raw).filter(([k]) =>
    !['id'].includes(k) && typeof raw[k] !== 'object'
  )
  return (
    <div className={s.docContent}>
      <div className={s.legacyNote}>📁 Documento da base legada</div>
      {entries.slice(0, 12).map(([k, v]) => (
        <DetailRow key={k} label={k} value={String(v)} />
      ))}
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────

function DocDetailPanel({
  doc,
  onClose,
  onOpenFull,
}: {
  doc:        UnifiedDocument
  onClose:    () => void
  onOpenFull: () => void
}) {
  const meta = CATEGORY_META[doc.category]

  return (
    <div className={s.detailPanel}>
      {/* Header */}
      <div className={s.detailHeader}>
        <div className={s.detailHeaderLeft}>
          <span className={s.detailTypeIcon}>{meta.icon}</span>
          <div>
            <code className={s.detailDocNum}>{doc.documentNumber}</code>
            <div className={s.detailDocType}>{meta.label}</div>
          </div>
        </div>
        <button className={s.detailClose} onClick={onClose}>✕</button>
      </div>

      <h3 className={s.detailTitle}>{doc.title}</h3>

      {/* Traceability info */}
      <div className={s.traceGrid}>
        {doc.orderNumber && (
          <div className={s.traceItem}>
            <span className={s.traceLabel}>Ref. Pedido</span>
            <code className={s.traceCode}>{doc.orderNumber}</code>
          </div>
        )}
        <div className={s.traceItem}>
          <span className={s.traceLabel}>Gerado por</span>
          <span className={s.traceValue}>{doc.generatedBy || '—'}</span>
        </div>
        <div className={s.traceItem}>
          <span className={s.traceLabel}>Gerado em</span>
          <span className={s.traceValue}>{fmtDateTime(doc.createdAt)}</span>
        </div>
        {doc.requestedBy && (
          <div className={s.traceItem}>
            <span className={s.traceLabel}>Solicitante</span>
            <span className={s.traceValue}>{doc.requestedBy}</span>
          </div>
        )}
        {doc.approvedBy && (
          <div className={s.traceItem}>
            <span className={s.traceLabel}>Aprovado por</span>
            <span className={s.traceValue}>{doc.approvedBy}</span>
          </div>
        )}
        {doc.assetId && (
          <div className={s.traceItem}>
            <span className={s.traceLabel}>Ativo</span>
            <code className={s.traceCode}>{doc.assetId}</code>
          </div>
        )}
        {doc.supplierId && (
          <div className={s.traceItem}>
            <span className={s.traceLabel}>Fornecedor</span>
            <code className={s.traceCode}>{doc.supplierId}</code>
          </div>
        )}
        {doc.totalValue != null && (
          <div className={s.traceItem}>
            <span className={s.traceLabel}>Valor</span>
            <span className={s.traceValue} style={{ fontWeight: 800, color: '#166534' }}>
              {fmtCurrency(doc.totalValue)}
            </span>
          </div>
        )}
      </div>

      {/* Integrity warnings */}
      {(doc.missingNumber || doc.missingOrder) && (
        <div className={s.integrityWarn}>
          ⚠️{' '}
          {doc.missingNumber && 'Número de documento ausente. '}
          {doc.missingOrder  && 'Referência de pedido ausente.'}
        </div>
      )}

      {/* Document content */}
      <div className={s.detailBody}>
        {doc.source === 'order_documents' && doc.category === 'service_order'  && <ServiceDocDetail doc={doc} />}
        {doc.source === 'order_documents' && doc.category === 'purchase_order' && <PurchaseDocDetail doc={doc} />}
        {doc.source !== 'order_documents' && <LegacyDocDetail doc={doc} />}
      </div>

      {/* Actions */}
      <div className={s.detailActions}>
        {doc.rawOrderDoc && (
          <button className={s.btnOpenFull} onClick={onOpenFull}>
            🖨 Visualizar / Imprimir documento completo
          </button>
        )}
      </div>
    </div>
  )
}

// ── Document row ──────────────────────────────────────────────

function DocRow({
  doc,
  selected,
  onSelect,
}: {
  doc:      UnifiedDocument
  selected: boolean
  onSelect: () => void
}) {
  const meta = CATEGORY_META[doc.category]

  return (
    <div
      className={`${s.docRow} ${selected ? s.docRowSelected : ''} ${doc.missingNumber || doc.missingOrder ? s.docRowWarn : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect()}
    >
      <div className={s.rowTypeIcon} style={{ color: meta.color }}>{meta.icon}</div>
      <div className={s.rowMain}>
        <div className={s.rowTop}>
          <code className={s.rowCode}>{doc.documentNumber}</code>
          <CategoryBadge doc={doc} />
        </div>
        <div className={s.rowTitle}>{doc.title}</div>
        <div className={s.rowMeta}>
          {doc.requestedBy && <span className={s.rowMetaItem}>👤 {doc.requestedBy}</span>}
          {doc.orderNumber  && <span className={s.rowMetaItem}>🔗 {doc.orderNumber}</span>}
          {doc.totalValue != null && (
            <span className={s.rowMetaItem} style={{ fontWeight: 700, color: '#166534' }}>
              {fmtCurrency(doc.totalValue)}
            </span>
          )}
          <span className={s.rowDate}>{fmtDate(doc.createdAt)}</span>
        </div>
      </div>
      {(doc.missingNumber || doc.missingOrder) && (
        <div className={s.warnDot} title="Dados incompletos" />
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className={s.emptyState}>
      <div className={s.emptyIcon}>{filtered ? '🔍' : '📭'}</div>
      <div className={s.emptyTitle}>
        {filtered ? 'Nenhum documento encontrado' : 'Repositório vazio'}
      </div>
      <div className={s.emptyDesc}>
        {filtered
          ? 'Ajuste os filtros ou a busca para ver mais documentos.'
          : 'Documentos aparecem aqui automaticamente quando gerados no sistema.'}
      </div>
    </div>
  )
}

// ── Stats strip ───────────────────────────────────────────────

function StatsStrip({ stats, loading }: { stats: DocStats | null; loading: boolean }) {
  const cards = [
    { label: 'Total de Documentos', value: stats?.total         ?? '—', accent: '#166534' },
    { label: 'OS de Serviço',       value: stats?.serviceOrders ?? '—', accent: '#2563eb' },
    { label: 'OS de Compra',        value: stats?.purchaseOrders ?? '—', accent: '#16a34a' },
    { label: 'Este Mês',            value: stats?.thisMonth     ?? '—', accent: '#ea580c' },
    { label: 'Legados + Relatórios', value: stats?.legacy        ?? '—', accent: '#7c3aed' },
    {
      label: 'Pendências',
      value: stats?.integrity ?? '—',
      accent: stats && stats.integrity > 0 ? '#dc2626' : '#16a34a',
    },
  ]

  return (
    <div className={s.statsStrip}>
      {cards.map(c => (
        <div key={c.label} className={s.statCard}>
          <div className={s.statAccent} style={{ background: c.accent }} />
          {loading
            ? <div className={s.skeletonCell} style={{ height: 28, width: '60%', marginBottom: 6 }} />
            : <div className={s.statValue}>{c.value}</div>}
          <div className={s.statLabel}>{c.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function DocumentCenterPage() {
  const [allDocs,   setAllDocs]   = useState<UnifiedDocument[]>([])
  const [loading,   setLoading]   = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [hasMore,   setHasMore]   = useState(false)
  const [cursor,    setCursor]    = useState<unknown | null>(null)
  const [filters,   setFilters]   = useState<DocFilters>(DEFAULT_DOC_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fullViewDoc, setFullViewDoc] = useState<OrderDocument | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchInput, setSearchInput] = useState('')

  // Debounce search input into filters
  function handleSearchChange(val: string) {
    setSearchInput(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setFilters(f => ({ ...f, search: val }))
    }, 220)
  }

  // ── Load (primary page + legacy, with localStorage cache) ──────

  const loadInitial = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)
    setAllDocs([])
    setCursor(null)
    setSelectedId(null)
    if (force) clearDocumentCache()
    try {
      const result = await fetchAllDocuments(force)
      setAllDocs(result.docs)
      setHasMore(result.hasMore)
      setCursor(result.cursor)
    } catch {
      setError('Erro ao carregar documentos. Verifique a conexão.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadInitial() }, [loadInitial])

  // ── Load more ─────────────────────────────────────────────────

  async function loadMore() {
    if (!hasMore || loadingMore || !cursor) return
    setLoadingMore(true)
    try {
      const page = await fetchNextDocumentPage(cursor)
      setAllDocs(prev => {
        const seen = new Set(prev.map(d => d.id))
        return [...prev, ...page.docs.filter(d => !seen.has(d.id))]
      })
      setHasMore(page.hasMore)
      setCursor(page.cursor)
    } catch {
      // Non-fatal — user can retry via refresh
    } finally {
      setLoadingMore(false)
    }
  }

  // ── Filter + search ──────────────────────────────────────────

  const filteredDocs = useMemo(() => {
    const result = filterDocuments(allDocs, filters)
    // allDocs is already sorted newest-first; preserve that order
    return result
  }, [allDocs, filters])

  const stats = useMemo((): DocStats | null => {
    if (loading) return null
    const now     = new Date()
    const oneMonth = 30 * 86_400_000
    return {
      total:          allDocs.length,
      serviceOrders:  allDocs.filter(d => d.category === 'service_order').length,
      purchaseOrders: allDocs.filter(d => d.category === 'purchase_order').length,
      legacy:         allDocs.filter(d => d.source !== 'order_documents').length,
      thisMonth:      allDocs.filter(d => (d.createdAt?.getTime() ?? 0) >= now.getTime() - oneMonth).length,
      integrity:      allDocs.filter(d => d.missingNumber || d.missingOrder).length,
    }
  }, [allDocs, loading])

  const selectedDoc = useMemo(
    () => allDocs.find(d => d.id === selectedId) ?? null,
    [allDocs, selectedId],
  )

  const hasFilters = filters.category !== 'all' || filters.dateRange !== 'all' || filters.search !== ''

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerInner}>
          <div className={s.headerLeft}>
            <h1 className={s.headerTitle}>
              <span>📄</span> Centro de Documentos
            </h1>
            <p className={s.headerSub}>{today}</p>
          </div>
          <div className={s.headerRight}>
            <div className={s.searchWrap}>
              <span className={s.searchIcon}>🔍</span>
              <input
                className={s.headerSearch}
                type="text"
                placeholder="Buscar por código, pedido, título ou solicitante…"
                value={searchInput}
                onChange={e => handleSearchChange(e.target.value)}
                autoComplete="off"
              />
              {searchInput && (
                <button className={s.searchClear} onClick={() => { setSearchInput(''); setFilters(f => ({ ...f, search: '' })) }}>
                  ✕
                </button>
              )}
            </div>
            <button
              className={s.refreshBtn}
              onClick={() => void loadInitial(true)}
              disabled={loading}
              title="Recarregar documentos (limpa cache)"
            >
              {loading ? '…' : '↺'}
            </button>
          </div>
        </div>
      </div>

      <div className={s.body}>

        {/* Error */}
        {error && (
          <div className={s.errorBox}>
            <span>{error}</span>
            <button onClick={() => void loadInitial()}>Tentar novamente</button>
          </div>
        )}

        {/* Stats */}
        <StatsStrip stats={stats} loading={loading} />

        {/* Integrity alert */}
        {!loading && stats && stats.integrity > 0 && (
          <div className={s.integrityBanner}>
            <span>⚠️</span>
            <span>
              <strong>{stats.integrity} documento{stats.integrity > 1 ? 's' : ''}</strong> com dados incompletos (número ou referência de pedido ausente).
            </span>
            <button
              className={s.integrityFilterBtn}
              onClick={() => setFilters(f => ({ ...f, search: '' }))}
            >
              Ver todos
            </button>
          </div>
        )}

        {/* ── Filters bar ── */}
        <div className={s.filterBar}>
          <div className={s.catTabs}>
            {([
              { v: 'all',             label: `Todos (${stats?.total ?? '…'})` },
              { v: 'service_order',   label: `OS Serviço (${stats?.serviceOrders ?? '…'})` },
              { v: 'purchase_order',  label: `OS Compra (${stats?.purchaseOrders ?? '…'})` },
              { v: 'legacy_document', label: 'Legados' },
              { v: 'service_report',  label: 'Relatórios' },
            ] as { v: DocCategoryFilter; label: string }[]).map(tab => (
              <button
                key={tab.v}
                className={`${s.catTab} ${filters.category === tab.v ? s.catTabActive : ''}`}
                onClick={() => setFilters(f => ({ ...f, category: tab.v }))}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className={s.dateFilter}>
            <span className={s.filterLabel}>Período:</span>
            {([
              { v: 'all',     label: 'Todos' },
              { v: 'month',   label: 'Este mês' },
              { v: '3months', label: 'Últ. 3 meses' },
            ] as { v: DocDateFilter; label: string }[]).map(opt => (
              <button
                key={opt.v}
                className={`${s.dateBtn} ${filters.dateRange === opt.v ? s.dateBtnActive : ''}`}
                onClick={() => setFilters(f => ({ ...f, dateRange: opt.v }))}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {hasFilters && (
            <button className={s.clearFilters} onClick={() => { setFilters(DEFAULT_DOC_FILTERS); setSearchInput('') }}>
              Limpar filtros
            </button>
          )}
          <span className={s.resultCount}>
            {loading ? '…' : `${filteredDocs.length} documento${filteredDocs.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* ── Main split ── */}
        <div className={`${s.mainArea} ${selectedDoc ? s.mainAreaSplit : ''}`}>

          {/* Document list */}
          <div className={s.docList}>
            {loading ? (
              [1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className={s.docRowSkeleton}>
                  <div className={s.skeletonCell} style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className={s.skeletonCell} style={{ width: '45%' }} />
                    <div className={s.skeletonCell} style={{ width: '75%', height: 16 }} />
                    <div className={s.skeletonCell} style={{ width: '55%', height: 11 }} />
                  </div>
                </div>
              ))
            ) : filteredDocs.length === 0 ? (
              <EmptyState filtered={hasFilters} />
            ) : (
              <>
                {filteredDocs.map(doc => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    selected={doc.id === selectedId}
                    onSelect={() => setSelectedId(doc.id === selectedId ? null : doc.id)}
                  />
                ))}
                {hasMore && !filters.search && filters.category === 'all' && filters.dateRange === 'all' && (
                  <div className={s.loadMoreRow}>
                    <button
                      className={s.loadMoreBtn}
                      onClick={() => void loadMore()}
                      disabled={loadingMore}
                    >
                      {loadingMore ? 'Carregando…' : 'Carregar mais documentos'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Detail panel */}
          {selectedDoc ? (
            <DocDetailPanel
              doc={selectedDoc}
              onClose={() => setSelectedId(null)}
              onOpenFull={() => selectedDoc.rawOrderDoc && setFullViewDoc(selectedDoc.rawOrderDoc)}
            />
          ) : !loading && (
            <div className={s.detailPlaceholder}>
              <div className={s.placeholderIcon}>📄</div>
              <div className={s.placeholderTitle}>Selecione um documento</div>
              <div className={s.placeholderDesc}>
                Clique em qualquer documento da lista para visualizar seu conteúdo completo e rastreabilidade.
              </div>
              {stats && stats.integrity > 0 && (
                <div className={s.placeholderWarn}>
                  ⚠️ {stats.integrity} documento{stats.integrity > 1 ? 's' : ''} com pendências de dados
                </div>
              )}
            </div>
          )}

        </div>

      </div>

      {/* ── Full-screen document viewer overlay ── */}
      {fullViewDoc && (
        <DocumentViewer document={fullViewDoc} onClose={() => setFullViewDoc(null)} />
      )}

    </div>
  )
}

// src/pages/dashboard/aprovacoes/ApprovalCenterPage.tsx
// Approval Center — centralised workflow decision module.
// Supervisor / Admin only: approve, reject, or request revision on pending orders.

import {
  useState, useEffect, useCallback, useMemo, useRef,
  type FormEvent,
} from 'react'
import { useStore } from '@/store/useStore'
import {
  fetchPendingApprovals,
  approveServiceOrder,
  approvePurchaseOrder,
  rejectOrder,
  requestRevision,
  fetchOrderDocuments,
} from '@/lib/db-approvals'
import { fmtCurrency } from '@/lib/document-generator'
import type { ApprovalItem, ApprovalFilters, ActionState } from '@/types/approvals'
import {
  DEFAULT_FILTERS, PRIORITY_WEIGHT,
} from '@/types/approvals'
import { PRIORITY_META } from '@/types'
import s from './ApprovalCenterPage.module.css'

// ── Constants ─────────────────────────────────────────────────

const TYPE_LABELS = { service: 'OS de Serviço', purchase: 'OS de Compra' }
const TYPE_ICONS  = { service: '🔧',            purchase: '🛒' }

// ── Formatters ────────────────────────────────────────────────

function fmtAge(date?: Date): string {
  if (!date) return '—'
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days === 0) return 'hoje'
  if (days === 1) return '1 dia'
  return `${days} dias`
}

function fmtDateTime(date?: Date): string {
  if (!date) return '—'
  return date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Priority badge ────────────────────────────────────────────

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority) return null
  const m = PRIORITY_META[priority as keyof typeof PRIORITY_META]
  if (!m) return null
  return (
    <span
      className={s.priorityBadge}
      style={{ color: m.color, background: m.color + '1a', borderColor: m.color + '44' }}
    >
      {m.label}
    </span>
  )
}

// ── Status chip ───────────────────────────────────────────────

function StatusChip({ item }: { item: ApprovalItem }) {
  if (item.status === 'revision_requested') {
    return <span className={`${s.statusChip} ${s.statusRevision}`}>Em Revisão</span>
  }
  return <span className={`${s.statusChip} ${s.statusPending}`}>Pendente</span>
}

// ── Approve Modal ─────────────────────────────────────────────

function ApproveModal({
  item,
  onConfirm,
  onClose,
}: {
  item:      ApprovalItem
  onConfirm: (generateDoc: boolean) => Promise<void>
  onClose:   () => void
}) {
  const [generateDoc, setGenerateDoc] = useState(true)
  const [loading,     setLoading]     = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try { await onConfirm(generateDoc) } finally { setLoading(false) }
    onClose()
  }

  return (
    <div className={s.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader} style={{ borderTop: '3px solid #16a34a' }}>
          <span className={s.modalIcon}>✅</span>
          <div>
            <h3 className={s.modalTitle}>Aprovar {TYPE_LABELS[item.orderType]}</h3>
            <p className={s.modalSub}>{item.orderNumber} — {item.title}</p>
          </div>
          <button className={s.modalClose} onClick={onClose} disabled={loading}>✕</button>
        </div>
        <form onSubmit={e => void handleSubmit(e)}>
          <div className={s.modalBody}>
            <p className={s.modalMsg}>
              Confirma a aprovação de <strong>"{item.title}"</strong>?
              {item.orderType === 'service'
                ? ' O status será atualizado para Em Andamento.'
                : ' O status será atualizado para Aprovado e um documento será gerado.'}
            </p>

            {item.orderType === 'service' && (
              <label className={s.checkRow}>
                <input
                  type="checkbox"
                  checked={generateDoc}
                  onChange={e => setGenerateDoc(e.target.checked)}
                  disabled={loading}
                />
                <span>Gerar documento de autorização</span>
              </label>
            )}

            <div className={s.approveNote}>
              <span>📋</span>
              Esta decisão ficará registrada com seu nome e horário.
            </div>
          </div>
          <div className={s.modalFooter}>
            <button type="button" className={s.btnSecondary} onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className={s.btnApprove} disabled={loading}>
              {loading ? 'Aprovando…' : '✅ Confirmar aprovação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Reject Modal ──────────────────────────────────────────────

function RejectModal({
  item,
  onConfirm,
  onClose,
}: {
  item:      ApprovalItem
  onConfirm: (reason: string) => Promise<void>
  onClose:   () => void
}) {
  const [reason,  setReason]  = useState('')
  const [loading, setLoading] = useState(false)
  const canSubmit = reason.trim().length >= 5 && !loading

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    try { await onConfirm(reason) } finally { setLoading(false) }
    onClose()
  }

  return (
    <div className={s.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader} style={{ borderTop: '3px solid #dc2626' }}>
          <span className={s.modalIcon}>❌</span>
          <div>
            <h3 className={s.modalTitle}>Rejeitar {TYPE_LABELS[item.orderType]}</h3>
            <p className={s.modalSub}>{item.orderNumber} — {item.title}</p>
          </div>
          <button className={s.modalClose} onClick={onClose} disabled={loading}>✕</button>
        </div>
        <form onSubmit={e => void handleSubmit(e)}>
          <div className={s.modalBody}>
            <p className={s.modalMsg}>
              O status será alterado para <strong>Cancelado</strong>. Esta ação não pode ser desfeita.
            </p>
            <label className={s.fieldLabel}>
              Motivo da rejeição *
              <textarea
                className={s.textarea}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Descreva o motivo da rejeição (mínimo 5 caracteres)…"
                rows={4}
                maxLength={500}
                required
                disabled={loading}
              />
              <span className={s.charCount}>{reason.length}/500</span>
            </label>
          </div>
          <div className={s.modalFooter}>
            <button type="button" className={s.btnSecondary} onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className={s.btnReject} disabled={!canSubmit}>
              {loading ? 'Rejeitando…' : '❌ Confirmar rejeição'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Revision Modal ────────────────────────────────────────────

function RevisionModal({
  item,
  onConfirm,
  onClose,
}: {
  item:      ApprovalItem
  onConfirm: (note: string) => Promise<void>
  onClose:   () => void
}) {
  const [note,    setNote]    = useState('')
  const [loading, setLoading] = useState(false)
  const canSubmit = note.trim().length >= 5 && !loading

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    try { await onConfirm(note) } finally { setLoading(false) }
    onClose()
  }

  return (
    <div className={s.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader} style={{ borderTop: '3px solid #ea580c' }}>
          <span className={s.modalIcon}>🔄</span>
          <div>
            <h3 className={s.modalTitle}>Solicitar Revisão</h3>
            <p className={s.modalSub}>{item.orderNumber} — {item.title}</p>
          </div>
          <button className={s.modalClose} onClick={onClose} disabled={loading}>✕</button>
        </div>
        <form onSubmit={e => void handleSubmit(e)}>
          <div className={s.modalBody}>
            <p className={s.modalMsg}>
              O item voltará para a fila com indicador <strong>"Em Revisão"</strong>.
              O solicitante deverá corrigi-lo antes de uma nova avaliação.
            </p>
            <label className={s.fieldLabel}>
              Notas para o solicitante *
              <textarea
                className={s.textarea}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Explique o que precisa ser ajustado (mínimo 5 caracteres)…"
                rows={4}
                maxLength={500}
                required
                disabled={loading}
              />
              <span className={s.charCount}>{note.length}/500</span>
            </label>
          </div>
          <div className={s.modalFooter}>
            <button type="button" className={s.btnSecondary} onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className={s.btnRevision} disabled={!canSubmit}>
              {loading ? 'Enviando…' : '🔄 Solicitar revisão'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Queue Card ────────────────────────────────────────────────

function QueueCard({
  item,
  selected,
  onSelect,
}: {
  item:     ApprovalItem
  selected: boolean
  onSelect: () => void
}) {
  const isCritical = item.priority === 'critical' || item.priority === 'high'
  const cost = item.orderType === 'service' ? item.cost : item.totalValue
  const age  = fmtAge(item.createdAt)

  return (
    <div
      className={`
        ${s.card}
        ${selected ? s.cardSelected : ''}
        ${isCritical && !selected ? s.cardUrgent : ''}
        ${item.status === 'revision_requested' ? s.cardRevision : ''}
      `}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect()}
    >
      <div className={s.cardTop}>
        <div className={s.cardTypeRow}>
          <span className={s.cardTypeIcon}>{TYPE_ICONS[item.orderType]}</span>
          <code className={s.cardCode}>{item.orderNumber}</code>
          <StatusChip item={item} />
          {item.priority && <PriorityBadge priority={item.priority} />}
        </div>
        <span className={s.cardAge} title={fmtDateTime(item.createdAt)}>
          {age}
        </span>
      </div>

      <div className={s.cardTitle}>{item.title}</div>

      {item.description && (
        <div className={s.cardDesc}>{item.description}</div>
      )}

      <div className={s.cardMeta}>
        {item.requestedBy && (
          <span className={s.metaItem}>
            <span className={s.metaIcon}>👤</span>{item.requestedBy}
          </span>
        )}
        {item.assetName && (
          <span className={s.metaItem}>
            <span className={s.metaIcon}>🏭</span>{item.assetName}
          </span>
        )}
        {item.supplierName && (
          <span className={s.metaItem}>
            <span className={s.metaIcon}>🏢</span>{item.supplierName}
          </span>
        )}
        {cost != null && cost > 0 && (
          <span className={s.metaItem} style={{ marginLeft: 'auto', fontWeight: 800 }}>
            {fmtCurrency(cost)}
          </span>
        )}
      </div>

      {item.revisionNote && (
        <div className={s.cardRevisionNote}>
          <span>🔄</span> <em>{item.revisionNote}</em>
        </div>
      )}
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────

function DetailPanel({
  item,
  onAction,
  onClose,
}: {
  item:     ApprovalItem
  onAction: (action: ActionState) => void
  onClose:  () => void
}) {
  const [docs,     setDocs]     = useState<Array<{ id: string; documentNumber: string; createdAt?: Date }>>([])
  const [docsLoading, setDocsLoading] = useState(false)

  useEffect(() => {
    setDocs([])
    setDocsLoading(true)
    fetchOrderDocuments(item.id)
      .then(setDocs)
      .catch(() => {})
      .finally(() => setDocsLoading(false))
  }, [item.id])

  const order = item._rawService ?? item._rawPurchase
  const rawData = order as unknown as Record<string, unknown>

  // Purchase items
  const purchItems = item._rawPurchase?.items ?? []
  const showItems  = item.orderType === 'purchase' && purchItems.length > 0

  return (
    <div className={s.detail}>
      {/* Header */}
      <div className={s.detailHeader}>
        <div className={s.detailHeaderInner}>
          <div className={s.detailHeaderLeft}>
            <span className={s.detailTypeIcon}>{TYPE_ICONS[item.orderType]}</span>
            <div>
              <div className={s.detailOrderNum}>{item.orderNumber}</div>
              <div className={s.detailOrderType}>{TYPE_LABELS[item.orderType]}</div>
            </div>
          </div>
          <button className={s.detailClose} onClick={onClose}>✕</button>
        </div>
        <h2 className={s.detailTitle}>{item.title}</h2>
        <div className={s.detailBadges}>
          <StatusChip item={item} />
          {item.priority && <PriorityBadge priority={item.priority} />}
        </div>
      </div>

      {/* Body */}
      <div className={s.detailBody}>

        {/* Description */}
        {item.description && (
          <div className={s.detailSection}>
            <div className={s.sectionTitle}>Descrição</div>
            <p className={s.detailDesc}>{item.description}</p>
          </div>
        )}

        {/* Key info grid */}
        <div className={s.detailSection}>
          <div className={s.sectionTitle}>Informações</div>
          <div className={s.infoGrid}>
            <div className={s.infoRow}>
              <span className={s.infoLabel}>Solicitado por</span>
              <span className={s.infoValue}>{item.requestedBy}</span>
            </div>
            {item.orderType === 'service' && (
              <>
                {(rawData.technician as string) && (
                  <div className={s.infoRow}>
                    <span className={s.infoLabel}>Técnico</span>
                    <span className={s.infoValue}>{rawData.technician as string}</span>
                  </div>
                )}
                {(rawData.serviceType as string) && (
                  <div className={s.infoRow}>
                    <span className={s.infoLabel}>Tipo de serviço</span>
                    <span className={s.infoValue}>
                      {rawData.serviceType === 'internal' ? 'Interno' : 'Externo'}
                    </span>
                  </div>
                )}
                {item.cost != null && (
                  <div className={s.infoRow}>
                    <span className={s.infoLabel}>Custo estimado</span>
                    <span className={s.infoValueBold}>{fmtCurrency(item.cost)}</span>
                  </div>
                )}
                {(rawData.scheduledDate) && (
                  <div className={s.infoRow}>
                    <span className={s.infoLabel}>Data agendada</span>
                    <span className={s.infoValue}>
                      {new Date(rawData.scheduledDate as string).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                )}
              </>
            )}
            {item.assetName && (
              <div className={s.infoRow}>
                <span className={s.infoLabel}>Ativo vinculado</span>
                <span className={s.infoValueBold}>🏭 {item.assetName}</span>
              </div>
            )}
            {item.supplierName && (
              <div className={s.infoRow}>
                <span className={s.infoLabel}>Fornecedor</span>
                <span className={s.infoValueBold}>🏢 {item.supplierName}</span>
              </div>
            )}
            <div className={s.infoRow}>
              <span className={s.infoLabel}>Criado em</span>
              <span className={s.infoValue}>{fmtDateTime(item.createdAt)}</span>
            </div>
            <div className={s.infoRow}>
              <span className={s.infoLabel}>Última atualização</span>
              <span className={s.infoValue}>{fmtDateTime(item.updatedAt)}</span>
            </div>
          </div>
        </div>

        {/* Purchase items table */}
        {showItems && (
          <div className={s.detailSection}>
            <div className={s.sectionTitle}>Itens do Pedido</div>
            <table className={s.itemsTable}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ textAlign: 'center' }}>Qtd</th>
                  <th style={{ textAlign: 'center' }}>Unid.</th>
                  <th style={{ textAlign: 'right' }}>Valor unit.</th>
                  <th style={{ textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {purchItems.map((it, i) => {
                  const sub = it.quantity * (it.unitPrice ?? 0)
                  return (
                    <tr key={i}>
                      <td>{it.description}</td>
                      <td style={{ textAlign: 'center' }}>{it.quantity}</td>
                      <td style={{ textAlign: 'center' }}>{it.unit}</td>
                      <td style={{ textAlign: 'right' }}>{fmtCurrency(it.unitPrice)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtCurrency(sub)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ fontWeight: 700, textAlign: 'right' }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#166534' }}>
                    {fmtCurrency(item.totalValue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Revision note */}
        {item.revisionNote && (
          <div className={s.detailSection}>
            <div className={s.sectionTitle}>Nota de Revisão</div>
            <div className={s.revisionBox}>
              <div className={s.revisionHeader}>
                🔄 Revisão solicitada{item.revisionRequestedBy ? ` por ${item.revisionRequestedBy}` : ''}
              </div>
              <p>{item.revisionNote}</p>
            </div>
          </div>
        )}

        {/* Linked documents */}
        <div className={s.detailSection}>
          <div className={s.sectionTitle}>
            Documentos vinculados
            {docsLoading && <span className={s.loadingDot} />}
          </div>
          {docs.length === 0 && !docsLoading ? (
            <p className={s.noDocsMsg}>Nenhum documento gerado ainda.</p>
          ) : (
            <div className={s.docList}>
              {docs.map(d => (
                <div key={d.id} className={s.docItem}>
                  <span>📄</span>
                  <code className={s.docNum}>{d.documentNumber}</code>
                  <span className={s.docDate}>{fmtDateTime(d.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        {(rawData.notes as string) && (
          <div className={s.detailSection}>
            <div className={s.sectionTitle}>Observações</div>
            <p className={s.detailDesc}>{rawData.notes as string}</p>
          </div>
        )}

      </div>

      {/* Action bar */}
      <div className={s.actionBar}>
        <button
          className={s.btnRevisionSm}
          onClick={() => onAction({ action: 'revision', item })}
        >
          🔄 Revisão
        </button>
        <button
          className={s.btnRejectSm}
          onClick={() => onAction({ action: 'reject', item })}
        >
          ❌ Rejeitar
        </button>
        <button
          className={s.btnApproveSm}
          onClick={() => onAction({ action: 'approve', item })}
        >
          ✅ Aprovar
        </button>
      </div>
    </div>
  )
}

// ── Empty Queue ───────────────────────────────────────────────

function EmptyQueue({ filtered }: { filtered: boolean }) {
  return (
    <div className={s.emptyQueue}>
      <div className={s.emptyIcon}>{filtered ? '🔍' : '✅'}</div>
      <div className={s.emptyTitle}>
        {filtered ? 'Nenhum item corresponde aos filtros' : 'Fila vazia'}
      </div>
      <div className={s.emptyDesc}>
        {filtered
          ? 'Ajuste os filtros para ver mais itens.'
          : 'Não há aprovações pendentes no momento.'}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────

export default function ApprovalCenterPage() {
  const user     = useStore(st => st.user)
  const userName = user?.nome  ?? 'Supervisor'
  const userUid  = user?.uid   ?? ''

  const [items,       setItems]       = useState<ApprovalItem[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [filters,     setFilters]     = useState<ApprovalFilters>(DEFAULT_FILTERS)
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [actionState, setActionState] = useState<ActionState | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [successMsg,  setSuccessMsg]  = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load ──────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPendingApprovals()
      setItems(data)
      setLastRefresh(new Date())
    } catch {
      setError('Erro ao carregar aprovações pendentes. Verifique a conexão.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function flash(msg: string) {
    setSuccessMsg(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setSuccessMsg(null), 4000)
  }

  // ── Derived data ──────────────────────────────────────────

  const filteredItems = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    let result = items.filter(item => {
      if (filters.type !== 'all' && item.orderType !== filters.type) return false
      if (filters.priority !== 'all' && item.priority !== filters.priority) return false
      if (!q) return true
      return (
        item.orderNumber.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q)       ||
        item.requestedBy.toLowerCase().includes(q)
      )
    })

    if (filters.sort === 'priority') {
      result = [...result].sort((a, b) => {
        const wa = PRIORITY_WEIGHT[a.priority ?? 'normal'] ?? 2
        const wb = PRIORITY_WEIGHT[b.priority ?? 'normal'] ?? 2
        if (wb !== wa) return wb - wa
        return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
      })
    } else if (filters.sort === 'age') {
      result = [...result].sort((a, b) =>
        (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
    } else if (filters.sort === 'cost') {
      result = [...result].sort((a, b) => {
        const ca = a.cost ?? a.totalValue ?? 0
        const cb = b.cost ?? b.totalValue ?? 0
        return cb - ca
      })
    } else {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
    }

    return result
  }, [items, filters])

  const kpis = useMemo(() => ({
    total:     items.length,
    critical:  items.filter(i => i.priority === 'critical' || i.priority === 'high').length,
    service:   items.filter(i => i.orderType === 'service').length,
    purchase:  items.filter(i => i.orderType === 'purchase').length,
    totalValue: items.filter(i => i.orderType === 'purchase')
      .reduce((s, i) => s + (i.totalValue ?? 0), 0),
    revision:  items.filter(i => i.status === 'revision_requested').length,
  }), [items])

  const selectedItem = useMemo(
    () => items.find(i => i.id === selectedId) ?? null,
    [items, selectedId],
  )

  const hasFilters = filters.type !== 'all' || filters.priority !== 'all' || filters.search !== ''

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  // ── Action handlers ───────────────────────────────────────

  async function handleApprove(item: ApprovalItem, generateDoc: boolean) {
    setActionLoading(true)
    try {
      if (item.orderType === 'service' && item._rawService) {
        await approveServiceOrder(item.id, item._rawService, userUid, userName, generateDoc)
        flash(`OS ${item.orderNumber} aprovada e em andamento.`)
      } else if (item.orderType === 'purchase' && item._rawPurchase) {
        await approvePurchaseOrder(item.id, item._rawPurchase, userUid, userName)
        flash(`PC ${item.orderNumber} aprovada — documento gerado.`)
      }
      setItems(prev => prev.filter(i => i.id !== item.id))
      setSelectedId(null)
    } catch {
      flash('Erro ao aprovar. Tente novamente.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReject(item: ApprovalItem, reason: string) {
    setActionLoading(true)
    try {
      await rejectOrder(item.id, item.orderType, userUid, userName, reason)
      flash(`${item.orderNumber} rejeitado.`)
      setItems(prev => prev.filter(i => i.id !== item.id))
      setSelectedId(null)
    } catch {
      flash('Erro ao rejeitar. Tente novamente.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRevision(item: ApprovalItem, note: string) {
    setActionLoading(true)
    try {
      await requestRevision(item.id, item.orderType, userName, note)
      flash(`Revisão solicitada para ${item.orderNumber}.`)
      setItems(prev => prev.map(i =>
        i.id === item.id
          ? { ...i, status: 'revision_requested', revisionNote: note, revisionRequestedBy: userName }
          : i
      ))
    } catch {
      flash('Erro ao solicitar revisão. Tente novamente.')
    } finally {
      setActionLoading(false)
    }
  }

  // ── Filter helpers ────────────────────────────────────────

  function setFilter<K extends keyof ApprovalFilters>(key: K, val: ApprovalFilters[K]) {
    setFilters(prev => ({ ...prev, [key]: val }))
  }

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerInner}>
          <div className={s.headerLeft}>
            <h1 className={s.headerTitle}>
              <span>🎯</span> Centro de Aprovações
            </h1>
            <p className={s.headerSub}>{today}</p>
          </div>
          <div className={s.headerRight}>
            {lastRefresh && !loading && (
              <span className={s.lastRefresh}>
                Atualizado {lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              className={s.refreshBtn}
              onClick={() => void load()}
              disabled={loading}
              title="Recarregar aprovações"
            >
              {loading ? '…' : '↺ Atualizar'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Critical alert banner ── */}
      {!loading && kpis.critical > 0 && (
        <div className={s.alertBanner}>
          <span>🔴</span>
          <span>
            <strong>{kpis.critical} item{kpis.critical > 1 ? 's' : ''} de alta prioridade</strong>
            {' '}aguardando aprovação imediata
          </span>
        </div>
      )}

      {/* ── Success toast ── */}
      {successMsg && (
        <div className={`${s.toast} ${actionLoading ? '' : s.toastVisible}`}>
          ✅ {successMsg}
        </div>
      )}

      <div className={s.body}>

        {/* ── Error ── */}
        {error && (
          <div className={s.errorBox}>
            <span>{error}</span>
            <button onClick={() => void load()}>Tentar novamente</button>
          </div>
        )}

        {/* ── KPI strip ── */}
        <div className={s.kpiStrip}>
          <div className={s.kpiCard} style={{ '--accent': '#ea580c' } as React.CSSProperties}>
            <div className={s.kpiAccent} />
            <div className={s.kpiValue}>{loading ? '—' : kpis.total}</div>
            <div className={s.kpiLabel}>Pendentes</div>
            {!loading && kpis.revision > 0 && (
              <div className={s.kpiSub}>{kpis.revision} em revisão</div>
            )}
          </div>
          <div className={s.kpiCard} style={{ '--accent': '#dc2626' } as React.CSSProperties}>
            <div className={s.kpiAccent} />
            <div className={s.kpiValue} style={{ color: kpis.critical > 0 ? '#dc2626' : undefined }}>
              {loading ? '—' : kpis.critical}
            </div>
            <div className={s.kpiLabel}>Alta prioridade</div>
          </div>
          <div className={s.kpiCard} style={{ '--accent': '#2563eb' } as React.CSSProperties}>
            <div className={s.kpiAccent} />
            <div className={s.kpiValue}>{loading ? '—' : kpis.service}</div>
            <div className={s.kpiLabel}>OS de Serviço</div>
          </div>
          <div className={s.kpiCard} style={{ '--accent': '#16a34a' } as React.CSSProperties}>
            <div className={s.kpiAccent} />
            <div className={s.kpiValue}>{loading ? '—' : kpis.purchase}</div>
            <div className={s.kpiLabel}>OS de Compra</div>
            {!loading && kpis.totalValue > 0 && (
              <div className={s.kpiSub}>{fmtCurrency(kpis.totalValue)}</div>
            )}
          </div>
        </div>

        {/* ── Split panel ── */}
        <div className={`${s.splitPanel} ${selectedItem ? s.splitPanelOpen : ''}`}>

          {/* Queue */}
          <div className={s.queue}>

            {/* Toolbar */}
            <div className={s.toolbar}>
              <input
                className={s.searchInput}
                type="text"
                placeholder="Buscar por código, título ou solicitante…"
                value={filters.search}
                onChange={e => setFilter('search', e.target.value)}
              />
              <div className={s.filterRow}>
                <div className={s.typeButtons}>
                  {(['all', 'service', 'purchase'] as const).map(t => (
                    <button
                      key={t}
                      className={`${s.typeBtn} ${filters.type === t ? s.typeBtnActive : ''}`}
                      onClick={() => setFilter('type', t)}
                    >
                      {t === 'all' ? `Todos (${items.length})` :
                       t === 'service' ? `🔧 OS (${kpis.service})` :
                       `🛒 PC (${kpis.purchase})`}
                    </button>
                  ))}
                </div>
                <select
                  className={s.filterSelect}
                  value={filters.priority}
                  onChange={e => setFilter('priority', e.target.value as ApprovalFilters['priority'])}
                >
                  <option value="all">Todas prioridades</option>
                  <option value="critical">Crítica</option>
                  <option value="high">Alta</option>
                  <option value="normal">Normal</option>
                  <option value="low">Baixa</option>
                </select>
                <select
                  className={s.filterSelect}
                  value={filters.sort}
                  onChange={e => setFilter('sort', e.target.value as ApprovalFilters['sort'])}
                >
                  <option value="priority">Por prioridade</option>
                  <option value="age">Mais antigos</option>
                  <option value="cost">Maior valor</option>
                  <option value="title">Título A-Z</option>
                </select>
                {hasFilters && (
                  <button className={s.clearBtn} onClick={() => setFilters(DEFAULT_FILTERS)}>
                    Limpar
                  </button>
                )}
                <span className={s.countLabel}>
                  {loading ? '…' : `${filteredItems.length}/${items.length}`}
                </span>
              </div>
            </div>

            {/* Cards */}
            <div className={s.cardList}>
              {loading ? (
                [1, 2, 3, 4].map(i => (
                  <div key={i} className={s.cardSkeleton}>
                    <div className={s.skeletonCell} style={{ width: '40%', height: 14, marginBottom: 8 }} />
                    <div className={s.skeletonCell} style={{ width: '80%', height: 16, marginBottom: 6 }} />
                    <div className={s.skeletonCell} style={{ width: '60%', height: 12 }} />
                  </div>
                ))
              ) : filteredItems.length === 0 ? (
                <EmptyQueue filtered={hasFilters} />
              ) : (
                filteredItems.map(item => (
                  <QueueCard
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    onSelect={() => setSelectedId(item.id === selectedId ? null : item.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Detail panel */}
          {selectedItem && (
            <DetailPanel
              item={selectedItem}
              onAction={setActionState}
              onClose={() => setSelectedId(null)}
            />
          )}

          {/* Placeholder when nothing selected */}
          {!selectedItem && !loading && (
            <div className={s.detailPlaceholder}>
              <div className={s.placeholderIcon}>🎯</div>
              <div className={s.placeholderTitle}>Selecione um item para avaliar</div>
              <div className={s.placeholderDesc}>
                Clique em qualquer item na fila para ver os detalhes completos
                e tomar uma decisão de aprovação.
              </div>
              {kpis.critical > 0 && (
                <div className={s.placeholderAlert}>
                  ⚠️ {kpis.critical} item{kpis.critical > 1 ? 's' : ''} de alta prioridade aguarda{kpis.critical === 1 ? '' : 'm'} decisão
                </div>
              )}
            </div>
          )}

        </div>

      </div>

      {/* ── Action modals ── */}
      {actionState?.action === 'approve' && (
        <ApproveModal
          item={actionState.item}
          onConfirm={async (gen) => handleApprove(actionState.item, gen)}
          onClose={() => setActionState(null)}
        />
      )}
      {actionState?.action === 'reject' && (
        <RejectModal
          item={actionState.item}
          onConfirm={async (reason) => handleReject(actionState.item, reason)}
          onClose={() => setActionState(null)}
        />
      )}
      {actionState?.action === 'revision' && (
        <RevisionModal
          item={actionState.item}
          onConfirm={async (note) => handleRevision(actionState.item, note)}
          onClose={() => setActionState(null)}
        />
      )}

    </div>
  )
}

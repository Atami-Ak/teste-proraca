import { useState, useMemo }      from 'react'
import { usePurchaseOrders }       from '@/hooks/useData'
import { useStore }                from '@/store/useStore'
import {
  createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder,
  generateOrderNumber, createOrderDocument,
} from '@/lib/db'
import { generatePurchaseDocument, calcTotal, fmtCurrency } from '@/lib/document-generator'
import DocumentViewer              from './DocumentViewer'
import type {
  PurchaseOrder, PurchaseOrderStatus, PurchaseOrderItem, OrderDocument,
} from '@/types'
import { PURCHASE_ORDER_STATUS_META } from '@/types'
import { fmtDate }                 from '@/lib/db'
import s from './PurchaseOrdersPage.module.css'

// ── Status badge ──────────────────────────────────────

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const m = PURCHASE_ORDER_STATUS_META[status]
  return (
    <span className={s.badge} style={{ background: m.color + '22', color: m.color, borderColor: m.color + '44' }}>
      {m.label}
    </span>
  )
}

// ── Item row state ────────────────────────────────────

interface ItemRow extends PurchaseOrderItem {
  _key: number
}

function emptyItem(key: number): ItemRow {
  return { _key: key, description: '', quantity: 1, unit: 'un', unitPrice: undefined }
}

// ── Form state ────────────────────────────────────────

interface PCFormState {
  title:        string
  description:  string
  status:       PurchaseOrderStatus
  supplierId:   string
  requestedBy:  string
  approvedBy:   string
  assetId:      string
  notes:        string
}

const EMPTY_FORM: PCFormState = {
  title: '', description: '', status: 'draft',
  supplierId: '', requestedBy: '', approvedBy: '', assetId: '', notes: '',
}

function orderToForm(o: PurchaseOrder): PCFormState {
  return {
    title:       o.title,
    description: o.description ?? '',
    status:      o.status,
    supplierId:  o.supplierId  ?? '',
    requestedBy: o.requestedBy ?? '',
    approvedBy:  o.approvedBy  ?? '',
    assetId:     o.assetId     ?? '',
    notes:       o.notes       ?? '',
  }
}

// ── Items editor ──────────────────────────────────────

interface ItemsEditorProps {
  items:    ItemRow[]
  onChange: (items: ItemRow[]) => void
}

function ItemsEditor({ items, onChange }: ItemsEditorProps) {
  let nextKey = Math.max(0, ...items.map(i => i._key)) + 1

  function add() {
    onChange([...items, emptyItem(nextKey++)])
  }

  function remove(key: number) {
    onChange(items.filter(i => i._key !== key))
  }

  function update(key: number, field: keyof PurchaseOrderItem, value: string | number | undefined) {
    onChange(items.map(i => i._key === key ? { ...i, [field]: value } : i))
  }

  return (
    <div className={s.itemsEditor}>
      <div className={s.itemsHeader}>
        <span className={s.itemsTitle}>Itens</span>
        <button type="button" className={s.addItemBtn} onClick={add}>+ Adicionar</button>
      </div>

      {items.length === 0 && (
        <p className={s.itemsEmpty}>Nenhum item adicionado.</p>
      )}

      {items.map(item => (
        <div key={item._key} className={s.itemRow}>
          <div className={s.itemDesc}>
            <input className={s.input} placeholder="Descrição do item"
              value={item.description}
              onChange={e => update(item._key, 'description', e.target.value)} />
          </div>
          <div className={s.itemNum}>
            <input type="number" className={s.input} placeholder="Qtd" min={1}
              value={item.quantity}
              onChange={e => update(item._key, 'quantity', Number(e.target.value))} />
          </div>
          <div className={s.itemUnit}>
            <input className={s.input} placeholder="Unid."
              value={item.unit}
              onChange={e => update(item._key, 'unit', e.target.value)} />
          </div>
          <div className={s.itemPrice}>
            <input type="number" step="0.01" className={s.input} placeholder="Preço unit."
              value={item.unitPrice ?? ''}
              onChange={e => update(item._key, 'unitPrice', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div className={s.itemTotal}>{fmtCurrency(item.quantity * (item.unitPrice ?? 0))}</div>
          <button type="button" className={s.removeItemBtn} onClick={() => remove(item._key)}>✕</button>
        </div>
      ))}

      {items.length > 0 && (
        <div className={s.itemsFooter}>
          <span>Total:</span>
          <strong>{fmtCurrency(calcTotal(items))}</strong>
        </div>
      )}
    </div>
  )
}

// ── Order modal ───────────────────────────────────────

interface OrderModalProps {
  order?:  PurchaseOrder
  onClose: () => void
  onSaved: (o: PurchaseOrder) => void
}

function OrderModal({ order, onClose, onSaved }: OrderModalProps) {
  const isEdit = !!order
  const [form,  setForm]  = useState<PCFormState>(order ? orderToForm(order) : EMPTY_FORM)
  const [items, setItems] = useState<ItemRow[]>(
    (order?.items ?? []).map((it, i) => ({ ...it, _key: i }))
  )
  const [saving, setSaving] = useState(false)

  function setField<K extends keyof PCFormState>(k: K, v: PCFormState[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSave() {
    if (!form.title.trim()) return alert('Título é obrigatório.')
    if (items.length === 0) return alert('Adicione ao menos um item.')
    if (items.some(i => !i.description.trim())) return alert('Todos os itens precisam de descrição.')

    const cleanItems: PurchaseOrderItem[] = items.map(({ _key, ...rest }) => rest)
    const total = calcTotal(cleanItems)

    setSaving(true)
    try {
      const payload: Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt'> = {
        title:       form.title.trim(),
        description: form.description.trim() || undefined,
        status:      form.status,
        items:       cleanItems,
        totalValue:  total,
        supplierId:  form.supplierId.trim()  || undefined,
        requestedBy: form.requestedBy.trim() || undefined,
        approvedBy:  form.approvedBy.trim()  || undefined,
        assetId:     form.assetId.trim()     || undefined,
        notes:       form.notes.trim()       || undefined,
      }

      if (isEdit && order) {
        await updatePurchaseOrder(order.id, payload)
        onSaved({ ...order, ...payload })
      } else {
        const orderNumber = await generateOrderNumber('PC')
        const id = await createPurchaseOrder({ ...payload, orderNumber })
        onSaved({ id, ...payload, orderNumber })
      }
      onClose()
    } catch (e) {
      alert('Erro: ' + String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <div>
            <div className={s.modalSub}>{isEdit ? 'Editar' : 'Novo'} Pedido de Compra</div>
            <div className={s.modalTitle}>{form.title || '—'}</div>
          </div>
          <button className={s.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={s.modalBody}>
          <div className={s.formGroup}>
            <label className={s.label}>Título <span className={s.req}>*</span></label>
            <input className={s.input} placeholder="Ex.: Compra de cabos HDMI"
              value={form.title}
              onChange={e => setField('title', e.target.value)} />
          </div>

          <div className={s.formGroup}>
            <label className={s.label}>Descrição / Justificativa</label>
            <textarea className={s.textarea} rows={2} placeholder="Descreva a necessidade…"
              value={form.description}
              onChange={e => setField('description', e.target.value)} />
          </div>

          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Status</label>
              <select className={s.select} value={form.status}
                onChange={e => setField('status', e.target.value as PurchaseOrderStatus)}>
                <option value="draft">Rascunho</option>
                <option value="pending">Pendente</option>
                <option value="approved">Aprovado</option>
                <option value="ordered">Solicitado</option>
                <option value="received">Recebido</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Fornecedor</label>
              <input className={s.input} placeholder="Nome do fornecedor"
                value={form.supplierId}
                onChange={e => setField('supplierId', e.target.value)} />
            </div>
          </div>

          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Solicitante</label>
              <input className={s.input} placeholder="Quem solicitou"
                value={form.requestedBy}
                onChange={e => setField('requestedBy', e.target.value)} />
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Aprovado por</label>
              <input className={s.input} placeholder="Responsável pela aprovação"
                value={form.approvedBy}
                onChange={e => setField('approvedBy', e.target.value)} />
            </div>
          </div>

          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Ativo relacionado (ID)</label>
              <input className={s.input} placeholder="Ex.: TI-0001"
                value={form.assetId}
                onChange={e => setField('assetId', e.target.value)} />
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Observações</label>
              <input className={s.input} placeholder="Notas adicionais…"
                value={form.notes}
                onChange={e => setField('notes', e.target.value)} />
            </div>
          </div>

          {/* Items editor */}
          <ItemsEditor items={items} onChange={setItems} />
        </div>

        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={s.btnPrimary} disabled={saving} onClick={handleSave}>
            {saving ? 'Salvando…' : isEdit ? 'Salvar Alterações' : 'Criar Pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// PurchaseOrdersPage
// ══════════════════════════════════════════════════════

export default function PurchaseOrdersPage() {
  const { purchaseOrders, loading } = usePurchaseOrders()
  const { upsertPurchaseOrder, removePurchaseOrder } = useStore()

  const [search,    setSearch]    = useState('')
  const [statusSel, setStatusSel] = useState<PurchaseOrderStatus | ''>('')

  const [editOrder,  setEditOrder]  = useState<PurchaseOrder | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [activeDoc,  setActiveDoc]  = useState<OrderDocument | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return purchaseOrders.filter(o => {
      if (statusSel && o.status !== statusSel) return false
      if (q && !o.title.toLowerCase().includes(q)
            && !(o.orderNumber ?? '').toLowerCase().includes(q)
            && !(o.supplierId ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [purchaseOrders, search, statusSel])

  const stats = useMemo(() => ({
    total:     purchaseOrders.length,
    draft:     purchaseOrders.filter(o => o.status === 'draft').length,
    pending:   purchaseOrders.filter(o => o.status === 'pending').length,
    approved:  purchaseOrders.filter(o => o.status === 'approved').length,
    received:  purchaseOrders.filter(o => o.status === 'received').length,
  }), [purchaseOrders])

  const totalSpend = useMemo(
    () => purchaseOrders.filter(o => o.status === 'received')
           .reduce((sum, o) => sum + (o.totalValue ?? 0), 0),
    [purchaseOrders]
  )

  async function handleDelete(order: PurchaseOrder) {
    if (!confirm(`Excluir o pedido "${order.title}"? Esta ação não pode ser desfeita.`)) return
    await deletePurchaseOrder(order.id)
    removePurchaseOrder(order.id)
  }

  async function handleGenerate(order: PurchaseOrder) {
    setGenerating(order.id)
    try {
      const docData = generatePurchaseDocument(order)
      const id = await createOrderDocument(docData)
      setActiveDoc({ id, ...docData })
    } catch (e) {
      alert('Erro ao gerar documento: ' + String(e))
    } finally {
      setGenerating(null)
    }
  }

  function handleSaved(o: PurchaseOrder) {
    upsertPurchaseOrder(o)
  }

  if (loading) {
    return <div className={s.page}><p className={s.loadMsg}>Carregando pedidos de compra…</p></div>
  }

  return (
    <div className={s.page}>
      <div className={s.titleRow}>
        <h2 className={s.pageTitle}>🛒 Pedidos de Compra</h2>
        <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>+ Novo Pedido</button>
      </div>

      {/* Stats */}
      <div className={s.statsBar}>
        {([
          { label: 'Total',      value: stats.total,    color: '#64748b' },
          { label: 'Rascunho',   value: stats.draft,    color: '#94a3b8' },
          { label: 'Pendente',   value: stats.pending,  color: '#3b82f6' },
          { label: 'Aprovado',   value: stats.approved, color: '#22c55e' },
          { label: 'Recebido',   value: stats.received, color: '#10b981' },
        ] as const).map(stat => (
          <div key={stat.label} className={s.statCard} style={{ borderTopColor: stat.color }}>
            <span className={s.statValue}>{stat.value}</span>
            <span className={s.statLabel}>{stat.label}</span>
          </div>
        ))}
        <div className={s.statCard} style={{ borderTopColor: '#0f4c75' }}>
          <span className={s.statValue} style={{ fontSize: '1rem' }}>{fmtCurrency(totalSpend)}</span>
          <span className={s.statLabel}>Total Recebido</span>
        </div>
      </div>

      {/* Filters */}
      <div className={s.filterRow}>
        <input className={s.filterInput} placeholder="Pesquisar por nº, título, fornecedor…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className={s.filterSelect} value={statusSel}
          onChange={e => setStatusSel(e.target.value as PurchaseOrderStatus | '')}>
          <option value="">Todos os status</option>
          <option value="draft">Rascunho</option>
          <option value="pending">Pendente</option>
          <option value="approved">Aprovado</option>
          <option value="ordered">Solicitado</option>
          <option value="received">Recebido</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </div>

      <p className={s.resultCount}>{filtered.length} pedido{filtered.length !== 1 ? 's' : ''}</p>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>🛒</div>
          <h3>Nenhum pedido encontrado</h3>
          <p>Crie o primeiro pedido clicando em "+ Novo Pedido".</p>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Número</th>
                <th>Título</th>
                <th>Itens</th>
                <th>Fornecedor</th>
                <th>Total</th>
                <th>Status</th>
                <th>Data</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => (
                <tr key={order.id} className={s.row}>
                  <td className={s.orderNum}>{order.orderNumber ?? '—'}</td>
                  <td className={s.orderTitle}>{order.title}</td>
                  <td className={s.itemCount}>{order.items.length} item{order.items.length !== 1 ? 's' : ''}</td>
                  <td>{order.supplierId ?? '—'}</td>
                  <td className={s.totalCell}>{fmtCurrency(order.totalValue)}</td>
                  <td><StatusBadge status={order.status} /></td>
                  <td className={s.dateCell}>{fmtDate(order.createdAt as Parameters<typeof fmtDate>[0])}</td>
                  <td>
                    <div className={s.actions}>
                      <button className={s.iconBtn} title="Editar"
                        onClick={() => setEditOrder(order)}>✏️</button>
                      <button className={s.iconBtn} title="Gerar Documento"
                        disabled={generating === order.id}
                        onClick={() => handleGenerate(order)}>
                        {generating === order.id ? '⏳' : '📄'}
                      </button>
                      <button className={s.iconBtn} title="Excluir"
                        onClick={() => handleDelete(order)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <OrderModal
          onClose={() => setShowCreate(false)}
          onSaved={handleSaved}
        />
      )}

      {editOrder && (
        <OrderModal
          order={editOrder}
          onClose={() => setEditOrder(null)}
          onSaved={o => { handleSaved(o); setEditOrder(null) }}
        />
      )}

      <DocumentViewer document={activeDoc} onClose={() => setActiveDoc(null)} />
    </div>
  )
}

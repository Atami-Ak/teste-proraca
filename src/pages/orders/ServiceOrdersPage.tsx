import { useState, useMemo }      from 'react'
import { useServiceOrders }       from '@/hooks/useData'
import { useStore }               from '@/store/useStore'
import {
  createServiceOrder, updateServiceOrder, deleteServiceOrder,
  generateOrderNumber, createOrderDocument,
} from '@/lib/db'
import { generateServiceDocument } from '@/lib/document-generator'
import DocumentViewer              from './DocumentViewer'
import type {
  ServiceOrder, ServiceOrderStatus, ServiceType, Priority, OrderDocument,
} from '@/types'
import {
  SERVICE_ORDER_STATUS_META, PRIORITY_META, SERVICE_TYPE_META,
} from '@/types'
import { fmtDate }                 from '@/lib/db'
import s from './ServiceOrdersPage.module.css'

// ── Status badge ──────────────────────────────────────

const FALLBACK_STATUS = { label: 'Desconhecido', color: '#94a3b8' }
const FALLBACK_PRIORITY = { label: '—', color: '#94a3b8' }

function StatusBadge({ status }: { status: ServiceOrderStatus }) {
  const m = SERVICE_ORDER_STATUS_META[status] ?? FALLBACK_STATUS
  return (
    <span className={s.badge} style={{ background: m.color + '22', color: m.color, borderColor: m.color + '44' }}>
      {m.label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: Priority | undefined }) {
  if (!priority) return <span className={s.badgeNeutral}>—</span>
  const m = PRIORITY_META[priority] ?? FALLBACK_PRIORITY
  return (
    <span className={s.badge} style={{ background: m.color + '22', color: m.color, borderColor: m.color + '44' }}>
      {m.label}
    </span>
  )
}

// ── Form state ────────────────────────────────────────

interface OSFormState {
  title:          string
  description:    string
  serviceType:    ServiceType
  status:         ServiceOrderStatus
  priority:       Priority
  technician:     string
  requestedBy:    string
  assetId:        string
  cost:           string
  scheduledDate:  string
  completedDate:  string
  notes:          string
}

const EMPTY_FORM: OSFormState = {
  title: '', description: '', serviceType: 'internal',
  status: 'open', priority: 'normal',
  technician: '', requestedBy: '', assetId: '',
  cost: '', scheduledDate: '', completedDate: '', notes: '',
}

function orderToForm(o: ServiceOrder): OSFormState {
  return {
    title:         o.title,
    description:   o.description,
    serviceType:   o.serviceType,
    status:        o.status,
    priority:      o.priority ?? 'normal',
    technician:    o.technician   ?? '',
    requestedBy:   o.requestedBy  ?? '',
    assetId:       o.assetId      ?? '',
    cost:          o.cost != null ? String(o.cost) : '',
    scheduledDate: o.scheduledDate ? new Date(o.scheduledDate).toISOString().slice(0, 10) : '',
    completedDate: o.completedDate ? new Date(o.completedDate).toISOString().slice(0, 10) : '',
    notes:         o.notes ?? '',
  }
}

// ── Order modal ───────────────────────────────────────

interface OrderModalProps {
  order?:   ServiceOrder
  onClose:  () => void
  onSaved:  (o: ServiceOrder) => void
}

function OrderModal({ order, onClose, onSaved }: OrderModalProps) {
  const isEdit = !!order
  const [form, setForm] = useState<OSFormState>(order ? orderToForm(order) : EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  function setField<K extends keyof OSFormState>(k: K, v: OSFormState[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSave() {
    if (!form.title.trim())       return alert('Título é obrigatório.')
    if (!form.description.trim()) return alert('Descrição é obrigatória.')

    setSaving(true)
    try {
      const payload: Omit<ServiceOrder, 'id' | 'createdAt' | 'updatedAt'> = {
        title:         form.title.trim(),
        description:   form.description.trim(),
        serviceType:   form.serviceType,
        status:        form.status,
        priority:      form.priority,
        technician:    form.technician.trim()   || undefined,
        requestedBy:   form.requestedBy.trim()  || undefined,
        assetId:       form.assetId.trim()      || undefined,
        cost:          form.cost ? Number(form.cost) : undefined,
        scheduledDate: form.scheduledDate ? new Date(form.scheduledDate) : undefined,
        completedDate: form.completedDate ? new Date(form.completedDate) : undefined,
        notes:         form.notes.trim()        || undefined,
      }

      if (isEdit && order) {
        await updateServiceOrder(order.id, payload)
        onSaved({ ...order, ...payload })
      } else {
        const orderNumber = await generateOrderNumber('OS')
        const id = await createServiceOrder({ ...payload, orderNumber })
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
            <div className={s.modalSub}>{isEdit ? 'Editar' : 'Nova'} Ordem de Serviço</div>
            <div className={s.modalTitle}>{form.title || '—'}</div>
          </div>
          <button className={s.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={s.modalBody}>
          <div className={s.formGroup}>
            <label className={s.label}>Título <span className={s.req}>*</span></label>
            <input className={s.input} placeholder="Ex.: Troca de fonte PC-TI-0012"
              value={form.title}
              onChange={e => setField('title', e.target.value)} />
          </div>

          <div className={s.formGroup}>
            <label className={s.label}>Descrição <span className={s.req}>*</span></label>
            <textarea className={s.textarea} rows={3} placeholder="Detalhe o problema ou serviço…"
              value={form.description}
              onChange={e => setField('description', e.target.value)} />
          </div>

          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Tipo de Serviço</label>
              <select className={s.select} value={form.serviceType}
                onChange={e => setField('serviceType', e.target.value as ServiceType)}>
                <option value="internal">Interno</option>
                <option value="external">Externo (Terceirizado)</option>
              </select>
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Prioridade</label>
              <select className={s.select} value={form.priority}
                onChange={e => setField('priority', e.target.value as Priority)}>
                <option value="low">Baixa</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </select>
            </div>
          </div>

          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Status</label>
              <select className={s.select} value={form.status}
                onChange={e => setField('status', e.target.value as ServiceOrderStatus)}>
                <option value="open">Aberta</option>
                <option value="in_progress">Em Andamento</option>
                <option value="completed">Concluída</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Ativo (ID)</label>
              <input className={s.input} placeholder="Ex.: TI-0001"
                value={form.assetId}
                onChange={e => setField('assetId', e.target.value)} />
            </div>
          </div>

          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Técnico</label>
              <input className={s.input} placeholder="Nome do técnico"
                value={form.technician}
                onChange={e => setField('technician', e.target.value)} />
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Solicitante</label>
              <input className={s.input} placeholder="Nome do solicitante"
                value={form.requestedBy}
                onChange={e => setField('requestedBy', e.target.value)} />
            </div>
          </div>

          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Data Prevista</label>
              <input type="date" className={s.input}
                value={form.scheduledDate}
                onChange={e => setField('scheduledDate', e.target.value)} />
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Data Conclusão</label>
              <input type="date" className={s.input}
                value={form.completedDate}
                onChange={e => setField('completedDate', e.target.value)} />
            </div>
          </div>

          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Custo (R$)</label>
              <input type="number" step="0.01" className={s.input} placeholder="0,00"
                value={form.cost}
                onChange={e => setField('cost', e.target.value)} />
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Observações</label>
              <input className={s.input} placeholder="Notas adicionais…"
                value={form.notes}
                onChange={e => setField('notes', e.target.value)} />
            </div>
          </div>
        </div>

        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={s.btnPrimary} disabled={saving} onClick={handleSave}>
            {saving ? 'Salvando…' : isEdit ? 'Salvar Alterações' : 'Criar Ordem'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// ServiceOrdersPage
// ══════════════════════════════════════════════════════

export default function ServiceOrdersPage() {
  const { serviceOrders, loading } = useServiceOrders()
  const { upsertServiceOrder, removeServiceOrder } = useStore()

  const [search,    setSearch]    = useState('')
  const [statusSel, setStatusSel] = useState<ServiceOrderStatus | ''>('')
  const [typeSel,   setTypeSel]   = useState<ServiceType | ''>('')
  const [priSel,    setPriSel]    = useState<Priority | ''>('')

  const [editOrder,   setEditOrder]   = useState<ServiceOrder | null>(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [activeDoc,   setActiveDoc]   = useState<OrderDocument | null>(null)
  const [generating,  setGenerating]  = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return serviceOrders.filter(o => {
      if (statusSel && o.status !== statusSel)             return false
      if (typeSel   && o.serviceType !== typeSel)          return false
      if (priSel    && o.priority !== priSel)              return false
      if (q && !o.title.toLowerCase().includes(q)
            && !(o.technician ?? '').toLowerCase().includes(q)
            && !(o.orderNumber ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [serviceOrders, search, statusSel, typeSel, priSel])

  const stats = useMemo(() => ({
    total:       serviceOrders.length,
    open:        serviceOrders.filter(o => o.status === 'open').length,
    in_progress: serviceOrders.filter(o => o.status === 'in_progress').length,
    completed:   serviceOrders.filter(o => o.status === 'completed').length,
    cancelled:   serviceOrders.filter(o => o.status === 'cancelled').length,
  }), [serviceOrders])

  async function handleDelete(order: ServiceOrder) {
    if (!confirm(`Excluir a OS "${order.title}"? Esta ação não pode ser desfeita.`)) return
    await deleteServiceOrder(order.id)
    removeServiceOrder(order.id)
  }

  async function handleGenerate(order: ServiceOrder) {
    setGenerating(order.id)
    try {
      const docData = generateServiceDocument(order)
      const id = await createOrderDocument(docData)
      setActiveDoc({ id, ...docData })
    } catch (e) {
      alert('Erro ao gerar documento: ' + String(e))
    } finally {
      setGenerating(null)
    }
  }

  function handleSaved(o: ServiceOrder) {
    upsertServiceOrder(o)
  }

  if (loading) {
    return <div className={s.page}><p className={s.loadMsg}>Carregando ordens de serviço…</p></div>
  }

  return (
    <div className={s.page}>
      <div className={s.titleRow}>
        <h2 className={s.pageTitle}>📑 Ordens de Serviço</h2>
        <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>+ Nova OS</button>
      </div>

      {/* Stats */}
      <div className={s.statsBar}>
        {([
          { label: 'Total',         value: stats.total,       color: '#64748b' },
          { label: 'Abertas',       value: stats.open,        color: '#3b82f6' },
          { label: 'Em Andamento',  value: stats.in_progress, color: '#f59e0b' },
          { label: 'Concluídas',    value: stats.completed,   color: '#22c55e' },
          { label: 'Canceladas',    value: stats.cancelled,   color: '#94a3b8' },
        ] as const).map(stat => (
          <div key={stat.label} className={s.statCard} style={{ borderTopColor: stat.color }}>
            <span className={s.statValue}>{stat.value}</span>
            <span className={s.statLabel}>{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={s.filterRow}>
        <input className={s.filterInput} placeholder="Pesquisar por nº, título, técnico…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className={s.filterSelect} value={statusSel}
          onChange={e => setStatusSel(e.target.value as ServiceOrderStatus | '')}>
          <option value="">Todos os status</option>
          <option value="open">Aberta</option>
          <option value="in_progress">Em Andamento</option>
          <option value="completed">Concluída</option>
          <option value="cancelled">Cancelada</option>
        </select>
        <select className={s.filterSelect} value={typeSel}
          onChange={e => setTypeSel(e.target.value as ServiceType | '')}>
          <option value="">Todos os tipos</option>
          <option value="internal">Interno</option>
          <option value="external">Externo</option>
        </select>
        <select className={s.filterSelect} value={priSel}
          onChange={e => setPriSel(e.target.value as Priority | '')}>
          <option value="">Todas as prioridades</option>
          <option value="low">Baixa</option>
          <option value="normal">Normal</option>
          <option value="high">Alta</option>
          <option value="critical">Crítica</option>
        </select>
      </div>

      <p className={s.resultCount}>{filtered.length} ordem{filtered.length !== 1 ? 's' : ''}</p>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>📑</div>
          <h3>Nenhuma ordem encontrada</h3>
          <p>Crie a primeira OS clicando em "+ Nova OS".</p>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Número</th>
                <th>Título</th>
                <th>Tipo</th>
                <th>Técnico</th>
                <th>Prioridade</th>
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
                  <td>{SERVICE_TYPE_META[order.serviceType]?.label ?? order.serviceType}</td>
                  <td>{order.technician ?? '—'}</td>
                  <td><PriorityBadge priority={order.priority} /></td>
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

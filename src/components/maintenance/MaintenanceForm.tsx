import { useState, useMemo } from 'react'
import { useStore, selectCategoryMap } from '@/store/useStore'
import {
  createMaintenance, updateMaintenance,
  createServiceOrder, createPurchaseOrder,
  generateOrderNumber, updateMaintenance as linkMaintenance,
} from '@/lib/db'
import type {
  MaintenanceRecord, MaintenanceType, MaintenanceStatus, ServiceType,
  MachineryMaintenance, ITMaintenance, ReplacedPart,
} from '@/types'
import { resolveEngine } from '@/types'
import s from './MaintenanceForm.module.css'

// ── Internal types ────────────────────────────────────

interface PartRow { name: string; qty: string; cost: string }

interface FormState {
  type:            MaintenanceType
  status:          MaintenanceStatus
  description:     string
  technician:      string
  serviceType:     ServiceType
  scheduledDate:   string
  completedDate:   string
  cost:            string
  notes:           string
  // Machinery
  failureType:     string
  downtime:        string
  rootCause:       string
  requiresPurchase:boolean
  replacedParts:   PartRow[]
  // IT
  deviceType:      ITMaintenance['deviceType']
  issueType:       string
  assignedUser:    string
  itPartsList:     string
}

const EMPTY_FORM: FormState = {
  type: 'preventiva', status: 'pendente', description: '', technician: '',
  serviceType: 'internal', scheduledDate: '', completedDate: '', cost: '', notes: '',
  failureType: '', downtime: '', rootCause: '', requiresPurchase: false, replacedParts: [],
  deviceType: 'computer', issueType: '', assignedUser: '', itPartsList: '',
}

function recordToForm(r: MaintenanceRecord): FormState {
  const mach = r as MachineryMaintenance
  const it   = r as ITMaintenance
  return {
    type:             r.type,
    status:           r.status,
    description:      r.description,
    technician:       r.technician ?? '',
    serviceType:      r.serviceType ?? 'internal',
    scheduledDate:    r.scheduledDate ? new Date(r.scheduledDate).toISOString().slice(0, 10) : '',
    completedDate:    r.completedDate ? new Date(r.completedDate).toISOString().slice(0, 10) : '',
    cost:             r.cost != null ? String(r.cost) : '',
    notes:            r.notes ?? '',
    failureType:      mach.failureType ?? '',
    downtime:         mach.downtime != null ? String(mach.downtime) : '',
    rootCause:        mach.rootCause ?? '',
    requiresPurchase: mach.requiresPurchase ?? false,
    replacedParts:    (mach.replacedParts ?? []).map(p => ({
      name: p.name, qty: String(p.quantity), cost: String(p.cost),
    })),
    deviceType:       it.deviceType ?? 'computer',
    issueType:        it.issueType ?? '',
    assignedUser:     it.assignedUser ?? '',
    itPartsList:      Array.isArray(it.replacedParts) ? it.replacedParts.join(', ') : '',
  }
}

// ── Post-save actions panel ───────────────────────────

interface PostSaveProps {
  savedId:         string
  savedRecord:     MaintenanceRecord
  requiresPurchase:boolean
  replacedParts:   ReplacedPart[]
  onClose:         () => void
}

function PostSavePanel({ savedId, savedRecord, requiresPurchase, replacedParts, onClose }: PostSaveProps) {
  const [osId,     setOsId]     = useState<string | null>(null)
  const [poId,     setPoId]     = useState<string | null>(null)
  const [creating, setCreating] = useState<'os' | 'po' | null>(null)

  async function handleCreateOS() {
    setCreating('os')
    try {
      const orderNumber = await generateOrderNumber('OS')
      const id = await createServiceOrder({
        title:         `Manutenção: ${savedRecord.description.slice(0, 60)}`,
        description:   savedRecord.description,
        serviceType:   savedRecord.serviceType ?? 'internal',
        status:        'open',
        assetId:       savedRecord.assetId,
        maintenanceId: savedId,
        technician:    savedRecord.technician,
        orderNumber,
      })
      await updateMaintenance(savedId, { serviceOrderId: id }, savedRecord.assetId)
      setOsId(id)
    } catch (e) { alert('Erro: ' + String(e)) }
    finally { setCreating(null) }
  }

  async function handleCreatePO() {
    setCreating('po')
    try {
      const orderNumber = await generateOrderNumber('PC')
      const items = replacedParts.length > 0
        ? replacedParts.map(p => ({ description: p.name, quantity: p.quantity, unit: 'un', unitPrice: p.cost }))
        : [{ description: 'Peças de manutenção', quantity: 1, unit: 'un', unitPrice: undefined }]
      const totalValue = replacedParts.reduce((s, p) => s + p.quantity * p.cost, 0) || undefined
      const id = await createPurchaseOrder({
        title:         `Peças: ${savedRecord.description.slice(0, 50)}`,
        status:        'draft',
        assetId:       savedRecord.assetId,
        maintenanceId: savedId,
        items,
        totalValue,
        orderNumber,
      })
      await linkMaintenance(savedId, { purchaseOrderId: id }, savedRecord.assetId)
      setPoId(id)
    } catch (e) { alert('Erro: ' + String(e)) }
    finally { setCreating(null) }
  }

  return (
    <div className={s.postSave}>
      <div className={s.postSaveTitle}>✅ Manutenção registrada!</div>
      <p className={s.postSaveHint}>Deseja criar vínculos com esta manutenção?</p>

      <div className={s.postSaveActions}>
        {osId ? (
          <span className={s.linkedTag}>📋 OS vinculada</span>
        ) : (
          <button
            className={s.actionBtn}
            disabled={creating !== null}
            onClick={handleCreateOS}
          >
            {creating === 'os' ? '⏳ Criando…' : '📋 Criar Ordem de Serviço'}
          </button>
        )}

        {(requiresPurchase || replacedParts.length > 0) && (
          poId ? (
            <span className={s.linkedTag}>🛒 PO vinculada</span>
          ) : (
            <button
              className={s.actionBtn}
              disabled={creating !== null}
              onClick={handleCreatePO}
            >
              {creating === 'po' ? '⏳ Criando…' : '🛒 Criar Pedido de Compra'}
            </button>
          )
        )}
      </div>

      <button className={s.btnSecondary} onClick={onClose}>Fechar</button>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// MaintenanceForm
// ══════════════════════════════════════════════════════

export interface MaintenanceFormProps {
  preselectedAssetId?: string
  record?:             MaintenanceRecord
  onClose:             () => void
  onSaved:             (record: MaintenanceRecord) => void
}

export default function MaintenanceForm({ preselectedAssetId, record, onClose, onSaved }: MaintenanceFormProps) {
  const isEdit = !!record

  const assets      = useStore(s => s.assets)
  const categoryMap = useStore(selectCategoryMap)

  const [assetId, setAssetId] = useState(preselectedAssetId ?? record?.assetId ?? '')
  const [form, setForm]       = useState<FormState>(record ? recordToForm(record) : EMPTY_FORM)
  const [saving, setSaving]   = useState(false)
  const [savedState, setSavedState] = useState<{
    id: string; rec: MaintenanceRecord; reqPO: boolean; parts: ReplacedPart[]
  } | null>(null)

  const asset    = useMemo(() => assets.find(a => a.id === assetId) ?? null, [assets, assetId])
  const category = useMemo(() => asset ? (categoryMap[asset.categoryId] ?? null) : null, [asset, categoryMap])
  const engine   = useMemo(() => category ? resolveEngine(category) : 'standard', [category])

  const availableTypes: MaintenanceType[] = category?.maintenanceTypes ?? ['preventiva', 'corretiva', 'inspecao']

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  // ── Replaced parts (machinery) ──
  function addPart() { set('replacedParts', [...form.replacedParts, { name: '', qty: '1', cost: '0' }]) }
  function removePart(i: number) { set('replacedParts', form.replacedParts.filter((_, idx) => idx !== i)) }
  function setPart(i: number, field: keyof PartRow, value: string) {
    set('replacedParts', form.replacedParts.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  const partsTotal = form.replacedParts.reduce((sum, p) => sum + (Number(p.qty) || 0) * (Number(p.cost) || 0), 0)

  async function handleSave() {
    if (!assetId)              return alert('Selecione um ativo.')
    if (!form.description.trim()) return alert('Descrição é obrigatória.')

    setSaving(true)
    try {
      const base = {
        assetId,
        categoryId:    category?.id,
        type:          form.type,
        status:        form.status,
        description:   form.description.trim(),
        technician:    form.technician.trim() || undefined,
        serviceType:   form.serviceType,
        scheduledDate: form.scheduledDate ? new Date(form.scheduledDate) : undefined,
        completedDate: form.completedDate ? new Date(form.completedDate) : undefined,
        cost:          form.cost ? Number(form.cost) : undefined,
        notes:         form.notes.trim() || undefined,
      }

      let payload: Omit<MaintenanceRecord, 'id' | 'createdAt' | 'updatedAt'>

      if (engine === 'legacy_machinery') {
        const parts: ReplacedPart[] = form.replacedParts
          .filter(p => p.name.trim())
          .map(p => ({ name: p.name.trim(), quantity: Number(p.qty) || 1, cost: Number(p.cost) || 0 }))
        payload = {
          ...base,
          failureType:      form.failureType.trim() || undefined,
          downtime:         form.downtime ? Number(form.downtime) : undefined,
          rootCause:        form.rootCause.trim() || undefined,
          requiresPurchase: form.requiresPurchase,
          replacedParts:    parts,
        } as unknown as Omit<MaintenanceRecord, 'id' | 'createdAt' | 'updatedAt'>
      } else if (engine === 'it') {
        payload = {
          ...base,
          deviceType:   form.deviceType,
          issueType:    form.issueType.trim() || undefined,
          assignedUser: form.assignedUser.trim() || undefined,
          replacedParts: form.itPartsList
            ? form.itPartsList.split(',').map(s => s.trim()).filter(Boolean)
            : undefined,
        } as unknown as Omit<MaintenanceRecord, 'id' | 'createdAt' | 'updatedAt'>
      } else {
        payload = base as Omit<MaintenanceRecord, 'id' | 'createdAt' | 'updatedAt'>
      }

      if (isEdit && record) {
        await updateMaintenance(record.id, payload, assetId)
        const updated = { ...record, ...payload }
        onSaved(updated)
        onClose()
      } else {
        const id = await createMaintenance(payload)
        const saved: MaintenanceRecord = { id, ...payload }
        onSaved(saved)

        const showActions = form.type === 'corretiva' || form.requiresPurchase ||
          (engine === 'legacy_machinery' && form.replacedParts.some(p => p.name.trim()))

        if (showActions) {
          const parts: ReplacedPart[] = engine === 'legacy_machinery'
            ? form.replacedParts.filter(p => p.name.trim()).map(p => ({
                name: p.name.trim(), quantity: Number(p.qty) || 1, cost: Number(p.cost) || 0,
              }))
            : []
          setSavedState({ id, rec: saved, reqPO: form.requiresPurchase, parts })
        } else {
          onClose()
        }
      }
    } catch (e) {
      alert('Erro: ' + String(e))
    } finally {
      setSaving(false)
    }
  }

  // ── Post-save panel ───────────────────────────────────
  if (savedState) {
    return (
      <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={s.modal}>
          <PostSavePanel
            savedId={savedState.id}
            savedRecord={savedState.rec}
            requiresPurchase={savedState.reqPO}
            replacedParts={savedState.parts}
            onClose={onClose}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>

        {/* Header */}
        <div className={s.modalHeader}>
          <div>
            <div className={s.modalSub}>{isEdit ? 'Editar' : 'Nova'} Manutenção
              {category && <span className={s.engineTag} style={{ background: category.color + '22', color: category.color }}>{category.icon} {category.name}</span>}
            </div>
            <div className={s.modalTitle}>{form.description || '—'}</div>
          </div>
          <button className={s.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={s.modalBody}>

          {/* Asset selector (only when not preselected and not editing) */}
          {!preselectedAssetId && !isEdit && (
            <div className={s.formGroup}>
              <label className={s.label}>Ativo <span className={s.req}>*</span></label>
              <select className={s.select} value={assetId} onChange={e => setAssetId(e.target.value)}>
                <option value="">— Selecione um ativo —</option>
                {assets.map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Base fields */}
          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Tipo</label>
              <select className={s.select} value={form.type} onChange={e => set('type', e.target.value as MaintenanceType)}>
                {availableTypes.includes('preventiva') && <option value="preventiva">🔵 Preventiva</option>}
                {availableTypes.includes('corretiva')  && <option value="corretiva">🔴 Corretiva</option>}
                {availableTypes.includes('inspecao')   && <option value="inspecao">🟢 Inspeção</option>}
              </select>
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Status</label>
              <select className={s.select} value={form.status} onChange={e => set('status', e.target.value as MaintenanceStatus)}>
                <option value="pendente">⏳ Pendente</option>
                <option value="andamento">🔄 Em Andamento</option>
                <option value="concluida">✅ Concluída</option>
              </select>
            </div>
          </div>

          <div className={s.formGroup}>
            <label className={s.label}>Descrição <span className={s.req}>*</span></label>
            <textarea className={s.textarea} rows={3}
              placeholder="Descreva o serviço, problema encontrado ou inspeção realizada…"
              value={form.description}
              onChange={e => set('description', e.target.value)} />
          </div>

          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Técnico Responsável</label>
              <input className={s.input} placeholder="Nome do técnico"
                value={form.technician} onChange={e => set('technician', e.target.value)} />
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Tipo de Serviço</label>
              <select className={s.select} value={form.serviceType} onChange={e => set('serviceType', e.target.value as ServiceType)}>
                <option value="internal">Interno</option>
                <option value="external">Externo (Terceirizado)</option>
              </select>
            </div>
          </div>

          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Data Prevista</label>
              <input type="date" className={s.input} value={form.scheduledDate} onChange={e => set('scheduledDate', e.target.value)} />
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Data Conclusão</label>
              <input type="date" className={s.input} value={form.completedDate} onChange={e => set('completedDate', e.target.value)} />
            </div>
          </div>

          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Custo Total (R$)</label>
              <input type="number" step="0.01" className={s.input} placeholder="0,00"
                value={form.cost} onChange={e => set('cost', e.target.value)} />
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Observações</label>
              <input className={s.input} placeholder="Notas adicionais…"
                value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>

          {/* ── MACHINERY FIELDS ─── */}
          {engine === 'legacy_machinery' && (
            <>
              <div className={s.sectionDivider}>⚙️ Campos de Maquinário</div>

              <div className={s.formRow}>
                <div className={s.formGroup}>
                  <label className={s.label}>Tipo de Falha</label>
                  <input className={s.input} placeholder="Ex.: Falha elétrica, desgaste mecânico…"
                    value={form.failureType} onChange={e => set('failureType', e.target.value)} />
                </div>
                <div className={s.formGroup}>
                  <label className={s.label}>Tempo Parado (h)</label>
                  <input type="number" step="0.5" className={s.input} placeholder="0"
                    value={form.downtime} onChange={e => set('downtime', e.target.value)} />
                </div>
              </div>

              <div className={s.formGroup}>
                <label className={s.label}>Causa Raiz</label>
                <input className={s.input} placeholder="Causa identificada da falha…"
                  value={form.rootCause} onChange={e => set('rootCause', e.target.value)} />
              </div>

              <div className={s.checkRow}>
                <input type="checkbox" id="reqPO" className={s.checkbox}
                  checked={form.requiresPurchase}
                  onChange={e => set('requiresPurchase', e.target.checked)} />
                <label htmlFor="reqPO" className={s.checkLabel}>Requer compra de peças / material</label>
              </div>

              {/* Parts table */}
              <div className={s.partsSection}>
                <div className={s.partsSectionHeader}>
                  <span className={s.label}>Peças Substituídas</span>
                  <button type="button" className={s.addPartBtn} onClick={addPart}>+ Adicionar</button>
                </div>

                {form.replacedParts.length > 0 && (
                  <div className={s.partsTable}>
                    <div className={s.partsHead}>
                      <span>Peça / Componente</span><span>Qtd</span><span>Custo Unit. (R$)</span><span></span>
                    </div>
                    {form.replacedParts.map((p, i) => (
                      <div key={i} className={s.partsRow}>
                        <input className={s.input} placeholder="Nome da peça"
                          value={p.name} onChange={e => setPart(i, 'name', e.target.value)} />
                        <input type="number" className={s.input} style={{ width: 70 }} min="1"
                          value={p.qty} onChange={e => setPart(i, 'qty', e.target.value)} />
                        <input type="number" step="0.01" className={s.input} style={{ width: 110 }}
                          value={p.cost} onChange={e => setPart(i, 'cost', e.target.value)} />
                        <button type="button" className={s.removePartBtn} onClick={() => removePart(i)}>×</button>
                      </div>
                    ))}
                    <div className={s.partsTotal}>
                      Total em peças: <strong>R$ {partsTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── IT FIELDS ─── */}
          {engine === 'it' && (
            <>
              <div className={s.sectionDivider}>💻 Campos de TI</div>

              <div className={s.formRow}>
                <div className={s.formGroup}>
                  <label className={s.label}>Tipo de Dispositivo</label>
                  <select className={s.select} value={form.deviceType}
                    onChange={e => set('deviceType', e.target.value as ITMaintenance['deviceType'])}>
                    <option value="computer">Computador / Servidor</option>
                    <option value="printer">Impressora</option>
                    <option value="network">Rede / Switch / Roteador</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
                <div className={s.formGroup}>
                  <label className={s.label}>Usuário Afetado</label>
                  <input className={s.input} placeholder="Nome do usuário"
                    value={form.assignedUser} onChange={e => set('assignedUser', e.target.value)} />
                </div>
              </div>

              <div className={s.formGroup}>
                <label className={s.label}>Tipo de Problema</label>
                <input className={s.input} placeholder="Ex.: Tela azul, sem internet, impressão…"
                  value={form.issueType} onChange={e => set('issueType', e.target.value)} />
              </div>

              <div className={s.formGroup}>
                <label className={s.label}>Componentes Substituídos (separados por vírgula)</label>
                <input className={s.input} placeholder="Ex.: HD, Fonte, Cabo de rede"
                  value={form.itPartsList} onChange={e => set('itPartsList', e.target.value)} />
              </div>
            </>
          )}
        </div>

        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={s.btnPrimary} disabled={saving || !assetId} onClick={handleSave}>
            {saving ? 'Salvando…' : isEdit ? 'Salvar Alterações' : 'Registrar Manutenção'}
          </button>
        </div>
      </div>
    </div>
  )
}

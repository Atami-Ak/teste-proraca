import { useState, useMemo, useEffect } from 'react'
import { useStore, selectCategoryMap } from '@/store/useStore'
import {
  createMaintenance, updateMaintenance,
  createServiceOrder, createPurchaseOrder,
  generateOrderNumber, updateMaintenance as linkMaintenance,
} from '@/lib/db'
import { addAssetEvent } from '@/lib/db-asset-history'
import { uploadMaintenanceImages } from '@/lib/db-maintenance-images'
import type {
  MaintenanceRecord, MaintenanceType, MaintenanceStatus, ServiceType,
  MachineryMaintenance, ITMaintenance, ReplacedPart,
  MachineryAdditionalData, ITAdditionalData, CLIMAdditionalData,
} from '@/types'
import { resolveEngine, type MaintenanceEngine } from '@/types'
import s from './MaintenanceForm.module.css'

// ── Internal types ────────────────────────────────────

interface PartRow { name: string; qty: string; cost: string }

interface FormState {
  type:                MaintenanceType
  status:              MaintenanceStatus
  description:         string
  technician:          string
  serviceType:         ServiceType
  scheduledDate:       string
  completedDate:       string
  cost:                string
  notes:               string
  // Machinery
  hoursUsed:           string
  mileage:             string
  nextMaintenanceDate: string
  failureType:         string
  downtime:            string
  rootCause:           string
  requiresPurchase:    boolean
  replacedParts:       PartRow[]
  // IT
  ticketId:            string
  deviceType:          ITMaintenance['deviceType']
  issueType:           string
  assignedUser:        string
  softwareUpdated:     string
  itPartsList:         string
  // CLIM
  refrigerantType:     string
  filterState:         'clean' | 'dirty' | 'replaced'
  drainState:          string
  evaporatorState:     string
  condenserState:      string
  currentPressure:     string
  lastGasRefill:       string
  cleaningDone:        boolean
  gasRefillDone:       boolean
  gasRefillQty:        string
}

const EMPTY_FORM: FormState = {
  type: 'preventiva', status: 'pendente', description: '', technician: '',
  serviceType: 'internal', scheduledDate: '', completedDate: '', cost: '', notes: '',
  hoursUsed: '', mileage: '', nextMaintenanceDate: '',
  failureType: '', downtime: '', rootCause: '', requiresPurchase: false, replacedParts: [],
  ticketId: '', deviceType: 'computer', issueType: '', assignedUser: '',
  softwareUpdated: '', itPartsList: '',
  refrigerantType: '', filterState: 'clean', drainState: '',
  evaporatorState: '', condenserState: '', currentPressure: '',
  lastGasRefill: '', cleaningDone: false, gasRefillDone: false, gasRefillQty: '',
}

function recordToForm(r: MaintenanceRecord): FormState {
  const mach    = r as MachineryMaintenance
  const it      = r as ITMaintenance
  const machAdd = r.additionalData as MachineryAdditionalData | undefined
  const itAdd   = r.additionalData as ITAdditionalData | undefined
  const climAdd = r.additionalData as CLIMAdditionalData | undefined

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
    // Machinery
    hoursUsed:           machAdd?.hoursUsed != null ? String(machAdd.hoursUsed) : '',
    mileage:             machAdd?.mileage != null ? String(machAdd.mileage) : '',
    nextMaintenanceDate: machAdd?.nextMaintenanceDate ?? '',
    failureType:         climAdd?.failureType ?? machAdd?.failureType ?? mach.failureType ?? '',
    downtime:            machAdd?.downtime != null ? String(machAdd.downtime) : '',
    rootCause:           machAdd?.rootCause ?? mach.rootCause ?? '',
    requiresPurchase:    climAdd?.requiresPurchase ?? machAdd?.requiresPurchase ?? mach.requiresPurchase ?? false,
    replacedParts:       ((machAdd?.replacedParts ?? mach.replacedParts) ?? []).map(p => ({
                           name: p.name, qty: String(p.quantity), cost: String(p.cost),
                         })),
    // IT
    ticketId:        itAdd?.ticketId ?? '',
    deviceType:      itAdd?.deviceType ?? it.deviceType ?? 'computer',
    issueType:       itAdd?.issueType ?? it.issueType ?? '',
    assignedUser:    itAdd?.affectedUser ?? it.assignedUser ?? '',
    softwareUpdated: Array.isArray(itAdd?.softwareUpdated) ? itAdd!.softwareUpdated.join(', ') : '',
    itPartsList:     Array.isArray(itAdd?.replacedParts)
                       ? itAdd!.replacedParts.join(', ')
                       : Array.isArray(it.replacedParts) ? it.replacedParts.join(', ') : '',
    // CLIM
    refrigerantType: climAdd?.refrigerantType ?? '',
    filterState:     climAdd?.filterState ?? 'clean',
    drainState:      climAdd?.drainState ?? '',
    evaporatorState: climAdd?.evaporatorState ?? '',
    condenserState:  climAdd?.condenserState ?? '',
    currentPressure: climAdd?.currentPressure != null ? String(climAdd.currentPressure) : '',
    lastGasRefill:   climAdd?.lastGasRefill ?? '',
    cleaningDone:    climAdd?.cleaningDone ?? false,
    gasRefillDone:   climAdd?.gasRefillDone ?? false,
    gasRefillQty:    climAdd?.gasRefillQty != null ? String(climAdd.gasRefillQty) : '',
  }
}

// ── OS template by engine ─────────────────────────────

function buildOSContent(engine: MaintenanceEngine, record: MaintenanceRecord, assetName?: string) {
  const asset = assetName ?? record.description.slice(0, 40)
  const typeLabel = { preventiva: 'Preventiva', corretiva: 'Corretiva', inspecao: 'Inspeção',
                      software: 'Software', hardware: 'Hardware' }[record.type] ?? record.type

  if (engine === 'clim') {
    const climAdd = record.additionalData as CLIMAdditionalData | undefined
    const lines = [
      `Manutenção ${typeLabel} em sistema de climatização.`,
      climAdd?.refrigerantType ? `Refrigerante: ${climAdd.refrigerantType}.` : '',
      'Serviços: verificação e limpeza de filtros, dreno, evaporador e condensador.',
      climAdd?.gasRefillDone ? `Reabastecimento de gás realizado (${climAdd.gasRefillQty ?? '—'} kg).` : '',
      record.description,
    ].filter(Boolean).join('\n')
    return {
      title:    `Manutenção A/C: ${asset}`,
      desc:     lines,
      category: 'Climatização',
    }
  }
  if (engine === 'machinery') {
    return {
      title:    `Manutenção Industrial: ${asset}`,
      desc:     `Ordem de serviço para manutenção ${typeLabel} de equipamento.\n\n${record.description}`,
      category: 'Manutenção Industrial',
    }
  }
  if (engine === 'it') {
    return {
      title:    `Suporte TI: ${asset}`,
      desc:     `Atendimento técnico — ${record.type === 'software' ? 'suporte de software' : 'manutenção de hardware'}.\n\n${record.description}`,
      category: 'Suporte de TI',
    }
  }
  return {
    title:    `Manutenção: ${record.description.slice(0, 60)}`,
    desc:     record.description,
    category: 'Manutenção Geral',
  }
}

// ── Post-save actions panel ───────────────────────────

interface PostSaveProps {
  savedId:          string
  savedRecord:      MaintenanceRecord
  requiresPurchase: boolean
  replacedParts:    ReplacedPart[]
  engine:           MaintenanceEngine
  assetName?:       string
  onClose:          () => void
}

function PostSavePanel({ savedId, savedRecord, requiresPurchase, replacedParts, engine, assetName, onClose }: PostSaveProps) {
  const [osId,     setOsId]     = useState<string | null>(null)
  const [poId,     setPoId]     = useState<string | null>(null)
  const [creating, setCreating] = useState<'os' | 'po' | null>(null)

  const { title: osTitle, desc: osDesc, category: osCategory } =
    buildOSContent(engine, savedRecord, assetName)

  async function handleCreateOS() {
    setCreating('os')
    try {
      const orderNumber = await generateOrderNumber('OS')
      const id = await createServiceOrder({
        title:           osTitle,
        description:     osDesc,
        serviceType:     savedRecord.serviceType ?? 'internal',
        status:          'open',
        assetId:         savedRecord.assetId,
        maintenanceId:   savedId,
        technician:      savedRecord.technician,
        serviceCategory: osCategory,
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
      const totalValue = replacedParts.reduce((sum, p) => sum + p.quantity * p.cost, 0) || undefined
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

  const engineColors: Record<MaintenanceEngine, string> = {
    machinery: '#f59e0b', it: '#3b82f6', clim: '#06b6d4', standard: '#64748b',
  }
  const engineLabels: Record<MaintenanceEngine, string> = {
    machinery: '⚙️ Maquinário', it: '💻 TI', clim: '❄️ Climatização', standard: '📋 Geral',
  }

  return (
    <div className={s.postSave}>
      <div className={s.postSaveTitle}>✅ Manutenção registrada!</div>
      <div className={s.postSaveEngine}
        style={{ background: engineColors[engine] + '18', color: engineColors[engine] }}>
        {engineLabels[engine]}
      </div>
      <p className={s.postSaveHint}>Deseja criar vínculos com esta manutenção?</p>

      {/* OS preview */}
      <div className={s.osPreview}>
        <div className={s.osPreviewTitle}>📋 {osTitle}</div>
        <div className={s.osPreviewDesc}>{osDesc}</div>
        <div className={s.osPreviewCat}>{osCategory}</div>
      </div>

      <div className={s.postSaveActions}>
        {osId ? (
          <span className={s.linkedTag}>📋 OS vinculada</span>
        ) : (
          <button className={s.actionBtn} disabled={creating !== null} onClick={handleCreateOS}>
            {creating === 'os' ? '⏳ Criando…' : '📋 Abrir Ordem de Serviço'}
          </button>
        )}

        {(requiresPurchase || replacedParts.length > 0) && (
          poId ? (
            <span className={s.linkedTag}>🛒 PC vinculado</span>
          ) : (
            <button className={s.actionBtn} disabled={creating !== null} onClick={handleCreatePO}>
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

  const assets      = useStore(st => st.assets)
  const categoryMap = useStore(selectCategoryMap)

  const [assetId, setAssetId]   = useState(preselectedAssetId ?? record?.assetId ?? '')
  const [form, setForm]         = useState<FormState>(record ? recordToForm(record) : EMPTY_FORM)
  const [saving, setSaving]     = useState(false)
  const [savedState, setSavedState] = useState<{
    id: string; rec: MaintenanceRecord; reqPO: boolean; parts: ReplacedPart[]
  } | null>(null)

  // Image state
  const [photoFiles,      setPhotoFiles]      = useState<File[]>([])
  const [previews,        setPreviews]        = useState<string[]>([])
  const [existingImages,  setExistingImages]  = useState<string[]>(record?.images ?? [])

  const asset    = useMemo(() => assets.find(a => a.id === assetId) ?? null, [assets, assetId])
  const category = useMemo(() => asset ? (categoryMap[asset.categoryId] ?? null) : null, [asset, categoryMap])
  const engine   = useMemo(() => category ? resolveEngine(category) : 'standard', [category])

  const availableTypes: MaintenanceType[] = useMemo(() => {
    if (engine === 'machinery') return ['preventiva', 'corretiva']
    if (engine === 'it')        return ['software', 'hardware']
    if (engine === 'clim')      return ['preventiva', 'corretiva', 'inspecao']
    return category?.maintenanceTypes ?? ['preventiva', 'corretiva', 'inspecao']
  }, [engine, category])

  useEffect(() => {
    if (isEdit) return
    if (engine === 'it' && form.type !== 'software' && form.type !== 'hardware') {
      setForm(prev => ({ ...prev, type: 'software' }))
    } else if (engine !== 'it' && (form.type === 'software' || form.type === 'hardware')) {
      setForm(prev => ({ ...prev, type: 'preventiva' }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, isEdit])

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  // ── Parts (machinery) ──
  function addPart()    { set('replacedParts', [...form.replacedParts, { name: '', qty: '1', cost: '0' }]) }
  function removePart(i: number) { set('replacedParts', form.replacedParts.filter((_, idx) => idx !== i)) }
  function setPart(i: number, field: keyof PartRow, value: string) {
    set('replacedParts', form.replacedParts.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }
  const partsTotal = form.replacedParts.reduce((sum, p) => sum + (Number(p.qty) || 0) * (Number(p.cost) || 0), 0)

  // ── Images ──
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const combined = [...photoFiles, ...files].slice(0, 8)
    setPhotoFiles(combined)
    setPreviews(prev => { prev.forEach(u => URL.revokeObjectURL(u)); return combined.map(f => URL.createObjectURL(f)) })
    e.target.value = ''
  }
  function removeNewPhoto(idx: number) {
    URL.revokeObjectURL(previews[idx])
    const f = photoFiles.filter((_, i) => i !== idx)
    setPhotoFiles(f)
    setPreviews(f.map(file => URL.createObjectURL(file)))
  }
  function removeExistingImage(idx: number) {
    setExistingImages(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!assetId)                 return alert('Selecione um ativo.')
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

      if (engine === 'machinery') {
        const parts: ReplacedPart[] = form.replacedParts
          .filter(p => p.name.trim())
          .map(p => ({ name: p.name.trim(), quantity: Number(p.qty) || 1, cost: Number(p.cost) || 0 }))

        const additionalData: MachineryAdditionalData = {
          ...(form.hoursUsed           ? { hoursUsed: Number(form.hoursUsed) }           : {}),
          ...(form.mileage             ? { mileage: Number(form.mileage) }               : {}),
          ...(form.nextMaintenanceDate ? { nextMaintenanceDate: form.nextMaintenanceDate } : {}),
          ...(form.failureType.trim()  ? { failureType: form.failureType.trim() }         : {}),
          ...(form.downtime            ? { downtime: Number(form.downtime) }              : {}),
          ...(form.rootCause.trim()    ? { rootCause: form.rootCause.trim() }             : {}),
          requiresPurchase: form.requiresPurchase,
          ...(parts.length > 0         ? { replacedParts: parts }                         : {}),
        }

        payload = {
          ...base,
          engineCategory: 'machinery',
          additionalData,
          failureType:      form.failureType.trim() || undefined,
          downtime:         form.downtime ? Number(form.downtime) : undefined,
          rootCause:        form.rootCause.trim() || undefined,
          requiresPurchase: form.requiresPurchase,
          replacedParts:    parts,
        } as unknown as Omit<MaintenanceRecord, 'id' | 'createdAt' | 'updatedAt'>

      } else if (engine === 'it') {
        const itParts      = form.itPartsList
          ? form.itPartsList.split(',').map(p => p.trim()).filter(Boolean)
          : undefined
        const softwareList = form.softwareUpdated
          ? form.softwareUpdated.split(',').map(p => p.trim()).filter(Boolean)
          : undefined

        const additionalData: ITAdditionalData = {
          ...(form.ticketId.trim()     ? { ticketId: form.ticketId.trim() }               : {}),
          deviceType:                    form.deviceType,
          ...(form.issueType.trim()    ? { issueType: form.issueType.trim() }             : {}),
          ...(form.technician.trim()   ? { assignedTechnician: form.technician.trim() }   : {}),
          ...(form.assignedUser.trim() ? { affectedUser: form.assignedUser.trim() }       : {}),
          ...(softwareList?.length     ? { softwareUpdated: softwareList }                 : {}),
          ...(itParts?.length          ? { replacedParts: itParts }                       : {}),
        }

        payload = {
          ...base,
          engineCategory: 'it',
          additionalData,
          deviceType:    form.deviceType,
          issueType:     form.issueType.trim() || undefined,
          assignedUser:  form.assignedUser.trim() || undefined,
          replacedParts: itParts,
        } as unknown as Omit<MaintenanceRecord, 'id' | 'createdAt' | 'updatedAt'>

      } else if (engine === 'clim') {
        const additionalData: CLIMAdditionalData = {
          ...(form.refrigerantType     ? { refrigerantType: form.refrigerantType }        : {}),
          filterState:                   form.filterState,
          ...(form.drainState.trim()   ? { drainState: form.drainState.trim() }           : {}),
          ...(form.evaporatorState     ? { evaporatorState: form.evaporatorState }        : {}),
          ...(form.condenserState      ? { condenserState: form.condenserState }          : {}),
          ...(form.currentPressure     ? { currentPressure: Number(form.currentPressure) }: {}),
          ...(form.lastGasRefill       ? { lastGasRefill: form.lastGasRefill }            : {}),
          cleaningDone:   form.cleaningDone,
          gasRefillDone:  form.gasRefillDone,
          ...(form.gasRefillDone && form.gasRefillQty ? { gasRefillQty: Number(form.gasRefillQty) } : {}),
          ...(form.failureType.trim()  ? { failureType: form.failureType.trim() }         : {}),
          requiresPurchase: form.requiresPurchase,
        }

        payload = {
          ...base,
          engineCategory:  'clim',
          additionalData,
          requiresPurchase: form.requiresPurchase,
          ...(form.failureType.trim() ? { failureType: form.failureType.trim() } : {}),
        } as unknown as Omit<MaintenanceRecord, 'id' | 'createdAt' | 'updatedAt'>

      } else {
        payload = { ...base, engineCategory: 'default' } as Omit<MaintenanceRecord, 'id' | 'createdAt' | 'updatedAt'>
      }

      if (isEdit && record) {
        await updateMaintenance(record.id, payload, assetId)

        // Handle images for edit
        let imageUrls = existingImages
        if (photoFiles.length > 0) {
          const newUrls = await uploadMaintenanceImages(record.id, photoFiles)
          imageUrls = [...imageUrls, ...newUrls]
        }
        if (imageUrls.length !== (record.images?.length ?? 0) || photoFiles.length > 0) {
          await updateMaintenance(record.id, { images: imageUrls.length > 0 ? imageUrls : undefined }, assetId)
        }

        const updated = { ...record, ...payload, images: imageUrls.length > 0 ? imageUrls : undefined }
        onSaved(updated)

        if (payload.status === 'concluida' && record.status !== 'concluida') {
          addAssetEvent({
            assetId, eventType: 'maintenance_completed',
            title: 'Manutenção concluída', description: form.description.trim(),
            performedBy: form.technician.trim() || undefined,
            linkedId: record.id, linkedType: 'maintenance',
          }).catch(() => {})
        }
        onClose()

      } else {
        const id = await createMaintenance(payload)

        // Upload images and update record
        let imageUrls: string[] = []
        if (photoFiles.length > 0) {
          imageUrls = await uploadMaintenanceImages(id, photoFiles)
          if (imageUrls.length > 0) {
            await updateMaintenance(id, { images: imageUrls }, assetId)
          }
        }

        const saved: MaintenanceRecord = { id, ...payload, ...(imageUrls.length > 0 ? { images: imageUrls } : {}) }
        onSaved(saved)

        addAssetEvent({
          assetId, eventType: 'maintenance_created',
          title: `Manutenção aberta — ${form.type === 'preventiva' ? 'Preventiva'
            : form.type === 'corretiva' ? 'Corretiva'
            : form.type === 'software'  ? 'Software'
            : form.type === 'hardware'  ? 'Hardware'
            : 'Inspeção'}`,
          description: form.description.trim(),
          performedBy: form.technician.trim() || undefined,
          linkedId: id, linkedType: 'maintenance',
        }).catch(() => {})

        const machineryParts: ReplacedPart[] = engine === 'machinery'
          ? form.replacedParts.filter(p => p.name.trim()).map(p => ({
              name: p.name.trim(), quantity: Number(p.qty) || 1, cost: Number(p.cost) || 0,
            }))
          : []

        // Always show PostSave for machinery/it/clim, or for corrective/with-parts
        const showActions = engine === 'machinery' || engine === 'it' || engine === 'clim' ||
          form.type === 'corretiva' || form.requiresPurchase || machineryParts.length > 0

        if (showActions) {
          setSavedState({ id, rec: saved, reqPO: form.requiresPurchase, parts: machineryParts })
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

  // Engine visual config
  const engineConfig: Record<MaintenanceEngine, { color: string; label: string; icon: string }> = {
    machinery: { color: '#f59e0b', label: 'Maquinário / Cozinha', icon: '⚙️' },
    it:        { color: '#3b82f6', label: 'TI / Comunicação',     icon: '💻' },
    clim:      { color: '#06b6d4', label: 'Climatização',         icon: '❄️' },
    standard:  { color: '#64748b', label: 'Geral',                icon: '🔧' },
  }
  const ec = engineConfig[engine]

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
            engine={engine}
            assetName={asset?.name}
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
              {category && (
                <span className={s.engineTag} style={{ background: ec.color + '22', color: ec.color }}>
                  {ec.icon} {ec.label}
                </span>
              )}
            </div>
            <div className={s.modalTitle}>{form.description || '—'}</div>
          </div>
          <button className={s.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={s.modalBody}>

          {/* Asset selector */}
          {!preselectedAssetId && !isEdit && (
            <div className={s.formGroup}>
              <label className={s.label}>Ativo <span className={s.req}>*</span></label>
              <select className={s.select} value={assetId} onChange={e => setAssetId(e.target.value)}>
                <option value="">— Selecione um ativo —</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
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
                {availableTypes.includes('software')   && <option value="software">💻 Software</option>}
                {availableTypes.includes('hardware')   && <option value="hardware">🖥️ Hardware</option>}
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
              value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          {engine !== 'it' && (
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
          )}

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
          {engine === 'machinery' && (
            <>
              <div className={s.sectionDivider}>⚙️ Campos de Maquinário</div>

              {form.type === 'preventiva' && (
                <>
                  <div className={s.formRow}>
                    <div className={s.formGroup}>
                      <label className={s.label}>Horas de Uso</label>
                      <input type="number" step="0.5" className={s.input} placeholder="Ex.: 250"
                        value={form.hoursUsed} onChange={e => set('hoursUsed', e.target.value)} />
                    </div>
                    <div className={s.formGroup}>
                      <label className={s.label}>Quilometragem / Odômetro</label>
                      <input type="number" className={s.input} placeholder="Ex.: 15000"
                        value={form.mileage} onChange={e => set('mileage', e.target.value)} />
                    </div>
                  </div>
                  <div className={s.formGroup}>
                    <label className={s.label}>Próxima Manutenção Prevista</label>
                    <input type="date" className={s.input}
                      value={form.nextMaintenanceDate} onChange={e => set('nextMaintenanceDate', e.target.value)} />
                  </div>
                </>
              )}

              {form.type === 'corretiva' && (
                <>
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
                </>
              )}

              <div className={s.checkRow}>
                <input type="checkbox" id="reqPO" className={s.checkbox}
                  checked={form.requiresPurchase} onChange={e => set('requiresPurchase', e.target.checked)} />
                <label htmlFor="reqPO" className={s.checkLabel}>Requer compra de peças / material</label>
              </div>

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
                  <label className={s.label}>Nº do Ticket</label>
                  <input className={s.input} placeholder="Ex.: TKT-0042"
                    value={form.ticketId} onChange={e => set('ticketId', e.target.value)} />
                </div>
              </div>

              <div className={s.formRow}>
                <div className={s.formGroup}>
                  <label className={s.label}>Usuário Afetado</label>
                  <input className={s.input} placeholder="Nome do usuário"
                    value={form.assignedUser} onChange={e => set('assignedUser', e.target.value)} />
                </div>
                <div className={s.formGroup}>
                  <label className={s.label}>Técnico de TI</label>
                  <input className={s.input} placeholder="Nome do técnico responsável"
                    value={form.technician} onChange={e => set('technician', e.target.value)} />
                </div>
              </div>

              <div className={s.formRow}>
                <div className={s.formGroup}>
                  <label className={s.label}>Tipo de Serviço</label>
                  <select className={s.select} value={form.serviceType} onChange={e => set('serviceType', e.target.value as ServiceType)}>
                    <option value="internal">Interno</option>
                    <option value="external">Externo (Terceirizado)</option>
                  </select>
                </div>
                <div className={s.formGroup} />
              </div>

              <div className={s.formGroup}>
                <label className={s.label}>Descrição do Problema</label>
                <input className={s.input} placeholder="Ex.: Tela azul, sem internet, impressão travada…"
                  value={form.issueType} onChange={e => set('issueType', e.target.value)} />
              </div>

              {form.type === 'software' && (
                <div className={s.formGroup}>
                  <label className={s.label}>Software(s) Atualizado(s) / Instalado(s) (separados por vírgula)</label>
                  <input className={s.input} placeholder="Ex.: Windows Update, Chrome 124, Antivírus"
                    value={form.softwareUpdated} onChange={e => set('softwareUpdated', e.target.value)} />
                </div>
              )}

              {form.type === 'hardware' && (
                <div className={s.formGroup}>
                  <label className={s.label}>Componentes Substituídos (separados por vírgula)</label>
                  <input className={s.input} placeholder="Ex.: HD SSD, Fonte, Cabo de rede, RAM"
                    value={form.itPartsList} onChange={e => set('itPartsList', e.target.value)} />
                </div>
              )}
            </>
          )}

          {/* ── CLIM FIELDS ─── */}
          {engine === 'clim' && (
            <>
              <div className={s.sectionDivider}>❄️ Campos de Climatização</div>

              <div className={s.formRow}>
                <div className={s.formGroup}>
                  <label className={s.label}>Tipo de Refrigerante</label>
                  <select className={s.select} value={form.refrigerantType}
                    onChange={e => set('refrigerantType', e.target.value)}>
                    <option value="">— Selecionar —</option>
                    <option value="R-410A">R-410A (mais comum)</option>
                    <option value="R-32">R-32 (ecológico)</option>
                    <option value="R-22">R-22 (legado)</option>
                    <option value="R-407C">R-407C</option>
                    <option value="R-134a">R-134a</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
                <div className={s.formGroup}>
                  <label className={s.label}>Estado do Filtro</label>
                  <select className={s.select} value={form.filterState}
                    onChange={e => set('filterState', e.target.value as 'clean' | 'dirty' | 'replaced')}>
                    <option value="clean">✅ Limpo</option>
                    <option value="dirty">⚠️ Sujo / Necessita limpeza</option>
                    <option value="replaced">🔄 Substituído</option>
                  </select>
                </div>
              </div>

              <div className={s.formRow}>
                <div className={s.formGroup}>
                  <label className={s.label}>Estado do Evaporador</label>
                  <select className={s.select} value={form.evaporatorState}
                    onChange={e => set('evaporatorState', e.target.value)}>
                    <option value="">— Selecionar —</option>
                    <option value="OK">✅ OK</option>
                    <option value="Sujo">⚠️ Sujo</option>
                    <option value="Danificado">❌ Danificado</option>
                  </select>
                </div>
                <div className={s.formGroup}>
                  <label className={s.label}>Estado do Condensador</label>
                  <select className={s.select} value={form.condenserState}
                    onChange={e => set('condenserState', e.target.value)}>
                    <option value="">— Selecionar —</option>
                    <option value="OK">✅ OK</option>
                    <option value="Sujo">⚠️ Sujo</option>
                    <option value="Danificado">❌ Danificado</option>
                  </select>
                </div>
              </div>

              <div className={s.formRow}>
                <div className={s.formGroup}>
                  <label className={s.label}>Estado do Dreno</label>
                  <input className={s.input} placeholder="Ex.: Desobstruído, entupido, limpo…"
                    value={form.drainState} onChange={e => set('drainState', e.target.value)} />
                </div>
                <div className={s.formGroup}>
                  <label className={s.label}>Pressão Atual (bar)</label>
                  <input type="number" step="0.1" className={s.input} placeholder="Ex.: 8.5"
                    value={form.currentPressure} onChange={e => set('currentPressure', e.target.value)} />
                </div>
              </div>

              <div className={s.climChecks}>
                <div className={s.checkRow}>
                  <input type="checkbox" id="cleaningDone" className={s.checkbox}
                    checked={form.cleaningDone} onChange={e => set('cleaningDone', e.target.checked)} />
                  <label htmlFor="cleaningDone" className={s.checkLabel}>Limpeza geral realizada</label>
                </div>
                <div className={s.checkRow}>
                  <input type="checkbox" id="gasRefillDone" className={s.checkbox}
                    checked={form.gasRefillDone} onChange={e => set('gasRefillDone', e.target.checked)} />
                  <label htmlFor="gasRefillDone" className={s.checkLabel}>Reabastecimento de gás realizado</label>
                </div>
              </div>

              {form.gasRefillDone && (
                <div className={s.formRow}>
                  <div className={s.formGroup}>
                    <label className={s.label}>Quantidade Reabastecida (kg)</label>
                    <input type="number" step="0.1" className={s.input} placeholder="Ex.: 1.5"
                      value={form.gasRefillQty} onChange={e => set('gasRefillQty', e.target.value)} />
                  </div>
                  <div className={s.formGroup}>
                    <label className={s.label}>Data do Reabastecimento</label>
                    <input type="date" className={s.input}
                      value={form.lastGasRefill} onChange={e => set('lastGasRefill', e.target.value)} />
                  </div>
                </div>
              )}

              {form.type === 'corretiva' && (
                <>
                  <div className={s.formGroup}>
                    <label className={s.label}>Tipo de Falha</label>
                    <input className={s.input} placeholder="Ex.: Sem resfriamento, vazamento de gás, barulho…"
                      value={form.failureType} onChange={e => set('failureType', e.target.value)} />
                  </div>
                  <div className={s.checkRow}>
                    <input type="checkbox" id="reqPOClim" className={s.checkbox}
                      checked={form.requiresPurchase} onChange={e => set('requiresPurchase', e.target.checked)} />
                    <label htmlFor="reqPOClim" className={s.checkLabel}>Requer compra de peças / material</label>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── FOTOS DA MANUTENÇÃO ─── */}
          <div className={s.sectionDivider}>📷 Fotos da Manutenção</div>
          <div className={s.formGroup}>
            <label className={s.photoUploadZone}>
              <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                onChange={handleFileChange} />
              <span style={{ fontSize: '1.3rem' }}>📷</span>
              <span style={{ fontWeight: 600 }}>Clique para adicionar fotos</span>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Antes/depois, estado do equipamento · PNG, JPG, WEBP · máx. 8</span>
            </label>

            {(existingImages.length > 0 || previews.length > 0) && (
              <div className={s.photoPreviewGrid}>
                {existingImages.map((url, i) => (
                  <div key={`ex-${i}`} className={s.photoPreviewItem}>
                    <img src={url} alt={`Foto ${i + 1}`} className={s.photoPreviewImg} />
                    <button type="button" className={s.photoRemoveBtn} onClick={() => removeExistingImage(i)}>×</button>
                  </div>
                ))}
                {previews.map((url, i) => (
                  <div key={`nw-${i}`} className={s.photoPreviewItem}>
                    <img src={url} alt={`Nova ${i + 1}`} className={s.photoPreviewImg} />
                    <div className={s.photoNewBadge}>Novo</div>
                    <button type="button" className={s.photoRemoveBtn} onClick={() => removeNewPhoto(i)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={s.btnPrimary} disabled={saving || !assetId} onClick={handleSave}
            style={{ background: ec.color }}>
            {saving ? 'Salvando…' : isEdit ? 'Salvar Alterações' : 'Registrar Manutenção'}
          </button>
        </div>
      </div>
    </div>
  )
}

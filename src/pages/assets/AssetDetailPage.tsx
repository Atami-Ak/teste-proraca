import { useState, useEffect, useMemo, type CSSProperties } from 'react'
import { Link, useNavigate, useParams }  from 'react-router-dom'
import { useStore, selectCategoryMap }   from '@/store/useStore'
import { useAssets, useCategories, useMaintenance } from '@/hooks/useData'
import { getAssetById, deleteAsset, updateAsset, getSuppliers } from '@/lib/db'
import { addAssetEvent, getAssetHistory } from '@/lib/db-asset-history'
import { LOCATIONS }   from '@/data/categories'
import MaintenanceForm from '@/components/maintenance/MaintenanceForm'
import type { Asset, AssetStatus, MaintenanceRecord, Supplier } from '@/types'
import { MAINT_TYPE_META, MAINT_STATUS_META } from '@/types'
import type { AssetEvent, AssetEventType } from '@/types/asset-history'
import { EVENT_META }  from '@/types/asset-history'
import { fmtDate }     from '@/lib/db'
import s from './AssetDetailPage.module.css'

// ── SVG icons ──────────────────────────────────────────
const Ic = {
  Back:       () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6"/></svg>,
  Edit:       () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  MapPin:     () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Wrench:     () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  Trash:      () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  Transfer:   () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17,1 21,5 17,9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7,23 3,19 7,15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  Archive:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21,8 21,21 3,21 3,8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  Close:      () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  AlertTri:   () => <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Clock:      () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>,
  Arrow:      () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/></svg>,
  History:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>,
  Info:       () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Maint:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  Building:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>,
  Phone:      () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.18C1.6 2.1 2.38 1.19 3.46 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.5a16 16 0 0 0 6 6l.81-.81a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  Mail:       () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  Cart:       () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  FileText:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  ExternalLink: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,

  // Timeline event icons (20×20)
  EvCreated:    () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  EvStatus:     () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>,
  EvTransfer:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17,1 21,5 17,9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7,23 3,19 7,15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  EvMaint:      () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  EvDecomm:     () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21,8 21,21 3,21 3,8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  EvEdit:       () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
}

// ── Icon for event type ────────────────────────────────
function EventIcon({ type }: { type: AssetEventType }) {
  switch (type) {
    case 'created':               return <Ic.EvCreated />
    case 'status_changed':        return <Ic.EvStatus />
    case 'location_transfer':     return <Ic.EvTransfer />
    case 'maintenance_created':   return <Ic.EvMaint />
    case 'maintenance_completed': return <Ic.EvStatus />
    case 'purchase_linked':       return <Ic.EvMaint />
    case 'decommissioned':        return <Ic.EvDecomm />
    default:                      return <Ic.EvEdit />
  }
}

// ── Status meta ────────────────────────────────────────
const STATUS_META: Record<AssetStatus, { label: string; color: string; bg: string }> = {
  ativo:      { label: 'Ativo',          color: '#16A34A', bg: 'rgba(22,163,74,0.12)'   },
  manutencao: { label: 'Em Manutenção',  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
  avariado:   { label: 'Avariado',       color: '#DC2626', bg: 'rgba(220,38,38,0.12)'   },
  inativo:    { label: 'Inativo',        color: '#64748B', bg: 'rgba(100,116,139,0.12)' },
}

const SUPPLIER_TYPE_META: Record<string, { label: string; color: string }> = {
  purchase: { label: 'Compras',        color: '#EA580C' },
  service:  { label: 'Serviços',       color: '#3b82f6' },
  both:     { label: 'Comp. + Serv.',  color: '#7C3AED' },
}

const DISCARD_REASONS = [
  '', 'Obsoleto / Fim de vida útil', 'Defeito irreparável', 'Vendido',
  'Doado', 'Roubado / Furtado', 'Sinistro', 'Outros',
]

function fmtCurrency(v?: number | null) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ── Transfer Modal ─────────────────────────────────────
interface TransferModalProps {
  asset:    Asset
  onClose:  () => void
  onSaved:  (asset: Asset) => void
}

function TransferModal({ asset, onClose, onSaved }: TransferModalProps) {
  const [newLocation, setNewLocation] = useState('')
  const [customLoc,   setCustomLoc]   = useState('')
  const [performedBy, setPerformedBy] = useState('')
  const [notes,       setNotes]       = useState('')
  const [saving,      setSaving]      = useState(false)

  const effectiveLoc = newLocation === '__custom__' ? customLoc : newLocation

  async function handleSave() {
    if (!effectiveLoc.trim()) { alert('Selecione a nova localização.'); return }
    if (effectiveLoc === asset.location) { alert('O ativo já está nessa localização.'); return }
    setSaving(true)
    try {
      await updateAsset(asset.id, { location: effectiveLoc.trim() })
      await addAssetEvent({
        assetId:     asset.id,
        eventType:   'location_transfer',
        title:       'Ativo transferido',
        description: notes.trim() || undefined,
        oldValue:    asset.location,
        newValue:    effectiveLoc.trim(),
        performedBy: performedBy.trim() || undefined,
      })
      onSaved({ ...asset, location: effectiveLoc.trim() })
      onClose()
    } catch (e) { alert('Erro: ' + String(e)) }
    finally { setSaving(false) }
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <div className={s.modalHeaderLeft}>
            <div className={s.modalIcon} style={{ background: 'rgba(234,88,12,0.1)', color: '#EA580C' }}>
              <Ic.Transfer />
            </div>
            <div>
              <div className={s.modalLabel}>Transferir Ativo</div>
              <div className={s.modalTitle}>{asset.name}</div>
            </div>
          </div>
          <button className={s.modalCloseBtn} onClick={onClose}><Ic.Close /></button>
        </div>
        <div className={s.modalBody}>
          <div className={s.formGroup}>
            <label className={s.label}>Localização Atual</label>
            <div className={s.input} style={{ background: '#f8fafc', color: '#64748b', cursor: 'default' }}>
              {asset.location || '—'}
            </div>
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Nova Localização <span className={s.req}>*</span></label>
            <select className={s.select} value={newLocation} onChange={e => setNewLocation(e.target.value)}>
              <option value="">— Selecionar —</option>
              {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              <option value="__custom__">✏️ Outra localização…</option>
            </select>
            {newLocation === '__custom__' && (
              <input className={s.input} style={{ marginTop: 6 }}
                placeholder="Digite a nova localização…"
                value={customLoc} onChange={e => setCustomLoc(e.target.value)} />
            )}
          </div>
          <div className={s.formGrid}>
            <div className={s.formGroup}>
              <label className={s.label}>Responsável pela transferência</label>
              <input className={s.input} placeholder="Nome de quem realizou"
                value={performedBy} onChange={e => setPerformedBy(e.target.value)} />
            </div>
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Motivo / Observações</label>
            <textarea className={s.textarea} rows={2}
              placeholder="Motivo da transferência, projeto, setor…"
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={s.btnOrange} disabled={saving} onClick={handleSave}>
            <Ic.Transfer />
            {saving ? 'Salvando…' : 'Confirmar Transferência'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Discard Modal ──────────────────────────────────────
interface DiscardModalProps {
  asset:   Asset
  onClose: () => void
  onSaved: (asset: Asset) => void
}

function DiscardModal({ asset, onClose, onSaved }: DiscardModalProps) {
  const [reason,      setReason]      = useState('')
  const [description, setDescription] = useState('')
  const [performedBy, setPerformedBy] = useState('')
  const [saving,      setSaving]      = useState(false)

  async function handleSave() {
    if (!reason) { alert('Selecione o motivo da baixa.'); return }
    setSaving(true)
    try {
      await updateAsset(asset.id, { status: 'inativo' })
      await addAssetEvent({
        assetId:     asset.id,
        eventType:   'decommissioned',
        title:       `Ativo baixado — ${reason}`,
        description: description.trim() || undefined,
        oldValue:    asset.status,
        newValue:    'inativo',
        performedBy: performedBy.trim() || undefined,
      })
      onSaved({ ...asset, status: 'inativo' })
      onClose()
    } catch (e) { alert('Erro: ' + String(e)) }
    finally { setSaving(false) }
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <div className={s.modalHeaderLeft}>
            <div className={s.modalIcon} style={{ background: 'rgba(220,38,38,0.1)', color: '#DC2626' }}>
              <Ic.Archive />
            </div>
            <div>
              <div className={s.modalLabel}>Dar Baixa no Ativo</div>
              <div className={s.modalTitle}>{asset.name}</div>
            </div>
          </div>
          <button className={s.modalCloseBtn} onClick={onClose}><Ic.Close /></button>
        </div>
        <div className={s.modalBody}>
          <div className={s.formGroup}>
            <label className={s.label}>Motivo da Baixa <span className={s.req}>*</span></label>
            <select className={s.select} value={reason} onChange={e => setReason(e.target.value)}>
              {DISCARD_REASONS.map(r => <option key={r} value={r}>{r || '— Selecionar —'}</option>)}
            </select>
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Descrição / Observações</label>
            <textarea className={s.textarea} rows={3}
              placeholder="Detalhes sobre a baixa: destino, estado, laudo, etc."
              value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Responsável pela baixa</label>
            <input className={s.input} placeholder="Nome de quem autorizou"
              value={performedBy} onChange={e => setPerformedBy(e.target.value)} />
          </div>
          <div style={{
            background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)',
            borderRadius: 10, padding: '10px 14px',
            fontSize: '0.78rem', color: '#DC2626', fontWeight: 600,
          }}>
            ⚠️ O status do ativo será alterado para <strong>Inativo</strong> e o evento ficará registrado permanentemente no histórico.
          </div>
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={s.btnDanger} disabled={saving} onClick={handleSave}>
            <Ic.Archive />
            {saving ? 'Processando…' : 'Confirmar Baixa'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete confirmation ────────────────────────────────
function DeleteModal({ asset, onConfirm, onCancel, deleting }: {
  asset: Asset; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={s.deleteModal}>
        <div className={s.deleteIconWrap}><Ic.AlertTri /></div>
        <h3 className={s.deleteTitle}>Excluir Ativo Permanentemente</h3>
        <p className={s.deleteSubtitle}>Você está prestes a excluir:</p>
        <div className={s.deleteTarget}>
          <span className={s.deleteTargetCode}>{asset.code}</span>
          <span className={s.deleteTargetName}>{asset.name}</span>
        </div>
        <p className={s.deleteWarning}>Esta ação removerá o ativo e não pode ser desfeita.</p>
        <div className={s.deleteActions}>
          <button className={s.btnDangerOutline} onClick={onCancel}>Cancelar</button>
          <button className={s.btnDanger} onClick={onConfirm} disabled={deleting}>
            {deleting ? 'Excluindo…' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// AssetDetailPage
// ══════════════════════════════════════════════════════

export default function AssetDetailPage() {
  const { id }      = useParams<{ id: string }>()
  const navigate    = useNavigate()
  const { removeAsset, upsertAsset } = useStore()

  useCategories()
  useAssets()
  const categoryMap = useStore(selectCategoryMap)

  const { maintenance } = useMaintenance({ assetId: id ?? undefined })

  const [asset,     setAsset]     = useState<Asset | null>(null)
  const [history,   setHistory]   = useState<AssetEvent[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading,   setLoading]   = useState(true)

  const [showTransfer,  setShowTransfer]  = useState(false)
  const [showDiscard,   setShowDiscard]   = useState(false)
  const [showDelete,    setShowDelete]    = useState(false)
  const [showMaint,     setShowMaint]     = useState(false)
  const [deleting,      setDeleting]      = useState(false)

  // Load asset + history
  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      getAssetById(id),
      getAssetHistory(id),  // retorna [] em caso de erro (índice em construção, etc.)
    ])
      .then(([a, h]) => {
        if (!a) { navigate('/ativos', { replace: true }); return }
        setAsset(a)
        setHistory(h)
      })
      .catch(() => {
        // Falha ao carregar ativo — volta para a lista
        navigate('/ativos', { replace: true })
      })
      .finally(() => setLoading(false))
  }, [id]) // eslint-disable-line

  const category = asset ? categoryMap[asset.categoryId] : undefined

  // Carrega fornecedores da categoria do ativo
  useEffect(() => {
    if (!asset?.categoryId) return
    getSuppliers({ categoryId: asset.categoryId, active: true })
      .then(setSuppliers)
      .catch(() => {})
  }, [asset?.categoryId]) // eslint-disable-line

  const openMaintenances = useMemo(
    () => maintenance.filter(m => m.status === 'pendente' || m.status === 'andamento'),
    [maintenance],
  )

  const statusMeta = asset ? (STATUS_META[asset.status] ?? STATUS_META.inativo) : null

  async function handleDelete() {
    if (!asset) return
    setDeleting(true)
    try {
      await deleteAsset(asset.id, asset.categoryId)
      removeAsset(asset.id)
      navigate('/ativos', { replace: true })
    } catch (e) { alert('Erro ao excluir: ' + String(e)) }
    finally { setDeleting(false) }
  }

  function reloadHistory() {
    if (id) getAssetHistory(id).then(setHistory).catch(() => {})
  }

  function handleAssetUpdated(updated: Asset) {
    setAsset(updated)
    upsertAsset?.(updated)
    reloadHistory()
  }

  function handleMaintSaved(_: MaintenanceRecord) {
    reloadHistory()
  }

  if (loading) {
    return (
      <div className={s.page}>
        <div className={s.loadWrap}>Carregando ativo…</div>
      </div>
    )
  }

  if (!asset) return null

  return (
    <div className={s.page}>

      {/* Breadcrumb */}
      <div className={s.breadcrumb}>
        <Link to="/ativos" className={s.backLink}>
          <Ic.Back /> Ativos
        </Link>
        <span className={s.breadSep}>/</span>
        <span className={s.breadCurrent}>{asset.name}</span>
      </div>

      {/* ── Asset Header ── */}
      <div
        className={s.assetHeader}
        style={{ '--status-color': statusMeta?.color } as CSSProperties}
      >
        <div className={s.headerLeft}>
          <div className={s.catIconBox}>
            {category?.icon ?? '🏷️'}
          </div>
          <div className={s.headerMeta}>
            <div className={s.assetCode}>{asset.code}</div>
            <div className={s.assetName}>{asset.name}</div>
            <div className={s.headerTags}>
              {statusMeta && (
                <span className={s.badge} style={{
                  background: statusMeta.bg,
                  color: statusMeta.color,
                  borderColor: statusMeta.color + '44',
                }}>
                  {statusMeta.label}
                </span>
              )}
              {category && (
                <span className={s.catBadge}>
                  {category.icon} {category.name}
                </span>
              )}
              {asset.location && (
                <span className={s.catBadge}>
                  📍 {asset.location}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className={s.headerRight}>
          <div className={s.actionBar}>
            <button className={s.btnGhost} onClick={() => setShowTransfer(true)}>
              <Ic.Transfer /> Transferir
            </button>
            <button className={s.btnPrimary} onClick={() => setShowMaint(true)}>
              <Ic.Wrench /> Nova Manutenção
            </button>
            <Link to={`/ativos/novo?edit=${asset.id}`} className={s.btnGhost}>
              <Ic.Edit /> Editar
            </Link>
            {asset.status !== 'inativo' && (
              <button className={s.btnGhost} style={{ color: '#DC2626', borderColor: 'rgba(220,38,38,0.3)' }}
                onClick={() => setShowDiscard(true)}>
                <Ic.Archive /> Dar Baixa
              </button>
            )}
            <button className={s.btnGhost} style={{ color: '#DC2626', borderColor: 'rgba(220,38,38,0.3)' }}
              onClick={() => setShowDelete(true)}>
              <Ic.Trash /> Excluir
            </button>
          </div>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className={s.body}>

        {/* Left */}
        <div className={s.leftCol}>

          {/* Info card */}
          <div className={s.card}>
            <div className={s.cardHeader}>
              <div className={s.cardHeaderLeft}>
                <div className={s.cardHeaderIcon}
                  style={{ background: 'rgba(22,101,52,0.1)', color: '#166534' }}>
                  <Ic.Info />
                </div>
                <span className={s.cardTitle}>Informações do Ativo</span>
              </div>
            </div>
            <div className={s.cardBody}>
              <div className={s.infoGrid}>
                <div className={s.infoField}>
                  <span className={s.infoKey}>Localização</span>
                  <span className={s.infoVal}>{asset.location || '—'}</span>
                </div>
                {asset.locationDetail && (
                  <div className={s.infoField}>
                    <span className={s.infoKey}>Detalhe</span>
                    <span className={s.infoVal}>{asset.locationDetail}</span>
                  </div>
                )}
                <div className={s.infoField}>
                  <span className={s.infoKey}>Responsável</span>
                  <span className={asset.responsible ? s.infoVal : s.infoValMuted}>
                    {asset.responsible || '—'}
                  </span>
                </div>
                <div className={s.infoField}>
                  <span className={s.infoKey}>Data de Aquisição</span>
                  <span className={asset.acquisition ? s.infoVal : s.infoValMuted}>
                    {asset.acquisition
                      ? new Date(asset.acquisition).toLocaleDateString('pt-BR')
                      : '—'}
                  </span>
                </div>
                <div className={s.infoField}>
                  <span className={s.infoKey}>Valor de Aquisição</span>
                  <span className={s.infoVal}>{fmtCurrency(asset.value)}</span>
                </div>
                <div className={s.infoField}>
                  <span className={s.infoKey}>Status Atual</span>
                  <span className={s.infoVal} style={{ color: statusMeta?.color }}>
                    {statusMeta?.label}
                  </span>
                </div>

                {/* Dynamic category fields */}
                {category?.fields.map(f => {
                  const val = asset.dynamicData?.[f.key]
                  if (!val && val !== 0) return null
                  return (
                    <div key={f.key} className={s.infoField}>
                      <span className={s.infoKey}>{f.label}</span>
                      <span className={s.infoVal}>{String(val)}</span>
                    </div>
                  )
                })}

                {asset.notes && (
                  <div className={`${s.infoField} ${s.infoFieldFull}`}>
                    <span className={s.infoKey}>Observações</span>
                    <span className={s.infoVal}>{asset.notes}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Open maintenances card */}
          <div className={s.card}>
            <div className={s.cardHeader}>
              <div className={s.cardHeaderLeft}>
                <div className={s.cardHeaderIcon}
                  style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}>
                  <Ic.Maint />
                </div>
                <span className={s.cardTitle}>
                  Manutenções em Aberto
                  {openMaintenances.length > 0 && (
                    <span style={{
                      marginLeft: 8, background: '#F59E0B', color: '#fff',
                      borderRadius: 10, padding: '1px 7px', fontSize: '0.65rem',
                    }}>
                      {openMaintenances.length}
                    </span>
                  )}
                </span>
              </div>
              <Link to={`/ativos/manutencao?assetId=${asset.id}`} className={s.btnGhost}
                style={{ fontSize: '0.72rem', padding: '5px 10px' }}>
                Ver todas
              </Link>
            </div>
            {openMaintenances.length === 0 ? (
              <div className={s.maintEmpty}>Nenhuma manutenção em aberto.</div>
            ) : (
              <div className={s.maintList}>
                {openMaintenances.map(m => {
                  const tm = MAINT_TYPE_META[m.type]
                  const sm = MAINT_STATUS_META[m.status]
                  const dotColor = m.type === 'corretiva' ? '#DC2626'
                    : m.type === 'preventiva' ? '#3b82f6' : '#22c55e'
                  const stColor = m.status === 'pendente' ? '#94a3b8' : '#f59e0b'
                  return (
                    <div key={m.id} className={s.maintRow}>
                      <div className={s.maintDot} style={{ background: dotColor }} />
                      <div className={s.maintBody}>
                        <div className={s.maintDesc}>{m.description}</div>
                        <div className={s.maintMeta}>
                          {tm.label}
                          {m.technician ? ` · ${m.technician}` : ''}
                          {m.scheduledDate ? ` · ${fmtDate(m.scheduledDate)}` : ''}
                        </div>
                      </div>
                      <span className={s.maintStatus}
                        style={{ background: stColor + '18', color: stColor }}>
                        {sm.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Fornecedores da categoria */}
          <div className={s.card}>
            <div className={s.cardHeader}>
              <div className={s.cardHeaderLeft}>
                <div className={s.cardHeaderIcon}
                  style={{ background: 'rgba(234,88,12,0.1)', color: '#EA580C' }}>
                  <Ic.Building />
                </div>
                <span className={s.cardTitle}>
                  Fornecedores
                  {category && (
                    <span style={{
                      marginLeft: 6, fontSize: '0.65rem', fontWeight: 600,
                      color: category.color || '#8898AA',
                      background: (category.color || '#8898AA') + '18',
                      padding: '1px 7px', borderRadius: 10,
                    }}>
                      {category.icon} {category.name}
                    </span>
                  )}
                  {suppliers.length > 0 && (
                    <span style={{
                      marginLeft: 6, background: '#EA580C', color: '#fff',
                      borderRadius: 10, padding: '1px 7px', fontSize: '0.65rem',
                    }}>
                      {suppliers.length}
                    </span>
                  )}
                </span>
              </div>
              <Link
                to="/ativos/fornecedores"
                className={s.btnGhost}
                style={{ fontSize: '0.72rem', padding: '5px 10px' }}
              >
                Ver todos
              </Link>
            </div>

            {suppliers.length === 0 ? (
              <div className={s.suppEmpty}>
                <Ic.Building />
                <span>Nenhum fornecedor cadastrado para esta categoria.</span>
                <Link to="/ativos/fornecedores" className={s.suppAddLink}>
                  + Cadastrar fornecedor
                </Link>
              </div>
            ) : (
              <div className={s.suppList}>
                {suppliers.map(sup => {
                  const tm = SUPPLIER_TYPE_META[sup.type] ?? { label: sup.type, color: '#94a3b8' }
                  return (
                    <div key={sup.id} className={s.suppItem}>
                      <div className={s.suppItemHead}>
                        <span className={s.suppName}>{sup.name}</span>
                        <span
                          className={s.suppTypeBadge}
                          style={{ background: tm.color + '18', color: tm.color, borderColor: tm.color + '44' }}
                        >
                          {tm.label}
                        </span>
                      </div>

                      <div className={s.suppContacts}>
                        {sup.contact && (
                          <div className={s.suppContactRow}>
                            <span className={s.suppContactIcon}><Ic.User /></span>
                            <span>{sup.contact}</span>
                          </div>
                        )}
                        {sup.phone && (
                          <div className={s.suppContactRow}>
                            <span className={s.suppContactIcon}><Ic.Phone /></span>
                            <a href={`tel:${sup.phone}`} className={s.suppContactLink}>
                              {sup.phone}
                            </a>
                          </div>
                        )}
                        {sup.email && (
                          <div className={s.suppContactRow}>
                            <span className={s.suppContactIcon}><Ic.Mail /></span>
                            <a href={`mailto:${sup.email}`} className={s.suppContactLink}>
                              {sup.email}
                            </a>
                          </div>
                        )}
                        {sup.cnpj && (
                          <div className={s.suppContactRow}>
                            <span className={s.suppContactIcon} style={{ fontSize: '0.6rem', fontWeight: 700 }}>CNPJ</span>
                            <span className={s.suppCnpj}>{sup.cnpj}</span>
                          </div>
                        )}
                      </div>

                      {/* Ações rápidas */}
                      <div className={s.suppActions}>
                        {(sup.type === 'service' || sup.type === 'both') && (
                          <Link
                            to={`/os`}
                            className={s.suppActBtn}
                            style={{ color: '#166534', borderColor: 'rgba(22,101,52,0.25)', background: 'rgba(22,101,52,0.06)' }}
                            title="Abrir Ordem de Serviço com este fornecedor"
                          >
                            <Ic.FileText /> Nova O.S.
                          </Link>
                        )}
                        {(sup.type === 'purchase' || sup.type === 'both') && (
                          <Link
                            to={`/compras`}
                            className={s.suppActBtn}
                            style={{ color: '#EA580C', borderColor: 'rgba(234,88,12,0.25)', background: 'rgba(234,88,12,0.06)' }}
                            title="Abrir Pedido de Compra com este fornecedor"
                          >
                            <Ic.Cart /> Novo P.C.
                          </Link>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>

        {/* Right — timeline */}
        <div className={s.rightCol}>
          <div className={s.card}>
            <div className={s.cardHeader}>
              <div className={s.cardHeaderLeft}>
                <div className={s.cardHeaderIcon}
                  style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                  <Ic.History />
                </div>
                <span className={s.cardTitle}>Histórico do Ativo</span>
              </div>
            </div>

            {history.length === 0 ? (
              <div className={s.timelineEmpty}>
                <Ic.History />
                <span>Nenhum evento registrado.</span>
                <span style={{ fontSize: '0.72rem' }}>
                  Eventos aparecem automaticamente ao criar manutenções, transferências e outras ações.
                </span>
              </div>
            ) : (
              <div className={s.timeline}>
                {history.map(ev => {
                  const meta   = EVENT_META[ev.eventType] ?? { label: ev.eventType, color: '#94a3b8' }
                  const evDate = ev.createdAt instanceof Date
                    ? ev.createdAt
                    : undefined

                  return (
                    <div key={ev.id} className={s.timelineItem}>
                      <div
                        className={s.timelineDot}
                        style={{ background: meta.color + '20', color: meta.color }}
                      >
                        <EventIcon type={ev.eventType} />
                      </div>
                      <div className={s.timelineContent}>
                        <div className={s.timelineTitle}>{ev.title}</div>

                        {ev.eventType === 'location_transfer' && ev.oldValue && ev.newValue && (
                          <div className={s.timelineTransfer}>
                            <span>{ev.oldValue}</span>
                            <span className={s.timelineArrow}><Ic.Arrow /></span>
                            <span style={{ fontWeight: 700, color: '#EA580C' }}>{ev.newValue}</span>
                          </div>
                        )}

                        {ev.eventType === 'status_changed' && ev.oldValue && ev.newValue && (
                          <div className={s.timelineTransfer}>
                            <span>{STATUS_META[ev.oldValue as AssetStatus]?.label ?? ev.oldValue}</span>
                            <span className={s.timelineArrow}><Ic.Arrow /></span>
                            <span style={{ fontWeight: 700, color: STATUS_META[ev.newValue as AssetStatus]?.color }}>
                              {STATUS_META[ev.newValue as AssetStatus]?.label ?? ev.newValue}
                            </span>
                          </div>
                        )}

                        {ev.description && (
                          <div className={s.timelineDesc}>{ev.description}</div>
                        )}

                        <div className={s.timelineDate}>
                          <Ic.Clock />
                          {evDate
                            ? evDate.toLocaleDateString('pt-BR', {
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })
                            : '—'}
                          {ev.performedBy && (
                            <span className={s.timelineBy}> · {ev.performedBy}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showTransfer && (
        <TransferModal
          asset={asset}
          onClose={() => setShowTransfer(false)}
          onSaved={handleAssetUpdated}
        />
      )}

      {showDiscard && (
        <DiscardModal
          asset={asset}
          onClose={() => setShowDiscard(false)}
          onSaved={handleAssetUpdated}
        />
      )}

      {showDelete && (
        <DeleteModal
          asset={asset}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
          deleting={deleting}
        />
      )}

      {showMaint && (
        <MaintenanceForm
          preselectedAssetId={asset.id}
          onClose={() => setShowMaint(false)}
          onSaved={r => { handleMaintSaved(r); setShowMaint(false) }}
        />
      )}
    </div>
  )
}

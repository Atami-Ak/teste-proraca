import { useState, useEffect, useMemo, type CSSProperties } from 'react'
import { Link, useNavigate, useParams }  from 'react-router-dom'
import { useStore, selectCategoryMap }   from '@/store/useStore'
import { useAssets, useCategories, useMaintenance } from '@/hooks/useData'
import { getAssetById, deleteAsset, updateAsset, getSuppliers } from '@/lib/db'
import { addAssetEvent, getAssetHistory } from '@/lib/db-asset-history'
import { addLocationEntry, getLocationHistory } from '@/lib/db-asset-location'
import {
  addAssetCost, getAssetCosts,
  updateLifecycleStatus, computeAssetKPIs, computeAssetHealthScore,
  getReplacementPrediction, COST_TYPE_OPTIONS,
} from '@/lib/db-eam'
import { LOCATIONS }   from '@/data/categories'
import MaintenanceForm from '@/components/maintenance/MaintenanceForm'
import type { Asset, AssetStatus, Supplier } from '@/types'
import { MAINT_TYPE_META, MAINT_STATUS_META } from '@/types'
import type { AssetEvent, AssetEventType, AssetLocationEntry } from '@/types/asset-history'
import { EVENT_META }  from '@/types/asset-history'
import {
  LIFECYCLE_META, COST_TYPE_META, REPLACEMENT_META,
  type AssetLifecycleStatus, type AssetCost,
} from '@/types/eam'
import { fmtDate }     from '@/lib/db'
import s from './AssetDetailPage.module.css'

// ── SVG icons ──────────────────────────────────────────
const Ic = {
  Back:        () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6"/></svg>,
  Edit:        () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  MapPin:      () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Wrench:      () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  Trash:       () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  Transfer:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17,1 21,5 17,9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7,23 3,19 7,15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  Archive:     () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21,8 21,21 3,21 3,8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  Close:       () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  AlertTri:    () => <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Clock:       () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>,
  Arrow:       () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/></svg>,
  History:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>,
  Info:        () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Maint:       () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  Building:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>,
  Phone:       () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.18C1.6 2.1 2.38 1.19 3.46 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.5a16 16 0 0 0 6 6l.81-.81a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  Mail:        () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  Cart:        () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  FileText:    () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  EvCreated:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  EvStatus:    () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>,
  EvTransfer:  () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17,1 21,5 17,9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7,23 3,19 7,15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  EvMaint:     () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  EvDecomm:    () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21,8 21,21 3,21 3,8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  EvEdit:      () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  EvCost:      () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/></svg>,
  EvLifecycle: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  Camera:      () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Plus:        () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  User:        () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Dollar:      () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  BarChart:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
}

// ── Icon for event type ─────────────────────────────────
function EventIcon({ type }: { type: AssetEventType }) {
  switch (type) {
    case 'created':               return <Ic.EvCreated />
    case 'status_changed':        return <Ic.EvStatus />
    case 'location_transfer':     return <Ic.EvTransfer />
    case 'maintenance_created':   return <Ic.EvMaint />
    case 'maintenance_completed': return <Ic.EvStatus />
    case 'purchase_linked':       return <Ic.EvMaint />
    case 'decommissioned':        return <Ic.EvDecomm />
    case 'lifecycle_changed':     return <Ic.EvLifecycle />
    case 'cost_recorded':         return <Ic.EvCost />
    default:                      return <Ic.EvEdit />
  }
}

// ── Constants ──────────────────────────────────────────
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

const MACHINERY_PREFIXES = new Set(['TI', 'MAQ', 'COZ', 'CLIM', 'COM'])

function fmtCurrency(v?: number | null) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ── Transfer Modal ─────────────────────────────────────
function TransferModal({ asset, onClose, onSaved }: {
  asset: Asset; onClose: () => void; onSaved: (a: Asset) => void
}) {
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
      await addAssetEvent({ assetId: asset.id, eventType: 'location_transfer', title: 'Ativo transferido', description: notes.trim() || undefined, oldValue: asset.location, newValue: effectiveLoc.trim(), performedBy: performedBy.trim() || undefined })
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
            <div className={s.modalIcon} style={{ background: 'rgba(234,88,12,0.1)', color: '#EA580C' }}><Ic.Transfer /></div>
            <div><div className={s.modalLabel}>Transferir Ativo</div><div className={s.modalTitle}>{asset.name}</div></div>
          </div>
          <button className={s.modalCloseBtn} onClick={onClose}><Ic.Close /></button>
        </div>
        <div className={s.modalBody}>
          <div className={s.formGroup}>
            <label className={s.label}>Localização Atual</label>
            <div className={s.input} style={{ background: '#f8fafc', color: '#64748b', cursor: 'default' }}>{asset.location || '—'}</div>
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Nova Localização <span className={s.req}>*</span></label>
            <select className={s.select} value={newLocation} onChange={e => setNewLocation(e.target.value)}>
              <option value="">— Selecionar —</option>
              {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              <option value="__custom__">✏️ Outra localização…</option>
            </select>
            {newLocation === '__custom__' && <input className={s.input} style={{ marginTop: 6 }} placeholder="Digite a nova localização…" value={customLoc} onChange={e => setCustomLoc(e.target.value)} />}
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Responsável pela transferência</label>
            <input className={s.input} placeholder="Nome de quem realizou" value={performedBy} onChange={e => setPerformedBy(e.target.value)} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Motivo / Observações</label>
            <textarea className={s.textarea} rows={2} placeholder="Motivo da transferência…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={s.btnOrange} disabled={saving} onClick={handleSave}><Ic.Transfer /> {saving ? 'Salvando…' : 'Confirmar Transferência'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Discard Modal ──────────────────────────────────────
function DiscardModal({ asset, onClose, onSaved }: {
  asset: Asset; onClose: () => void; onSaved: (a: Asset) => void
}) {
  const [reason,      setReason]      = useState('')
  const [description, setDescription] = useState('')
  const [performedBy, setPerformedBy] = useState('')
  const [saving,      setSaving]      = useState(false)

  async function handleSave() {
    if (!reason) { alert('Selecione o motivo da baixa.'); return }
    setSaving(true)
    try {
      await updateAsset(asset.id, { status: 'inativo' })
      await addAssetEvent({ assetId: asset.id, eventType: 'decommissioned', title: `Ativo baixado — ${reason}`, description: description.trim() || undefined, oldValue: asset.status, newValue: 'inativo', performedBy: performedBy.trim() || undefined })
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
            <div className={s.modalIcon} style={{ background: 'rgba(220,38,38,0.1)', color: '#DC2626' }}><Ic.Archive /></div>
            <div><div className={s.modalLabel}>Dar Baixa no Ativo</div><div className={s.modalTitle}>{asset.name}</div></div>
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
            <textarea className={s.textarea} rows={3} placeholder="Detalhes sobre a baixa…" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Responsável pela baixa</label>
            <input className={s.input} placeholder="Nome de quem autorizou" value={performedBy} onChange={e => setPerformedBy(e.target.value)} />
          </div>
          <div style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: '0.78rem', color: '#DC2626', fontWeight: 600 }}>
            ⚠️ O status do ativo será alterado para <strong>Inativo</strong> e o evento ficará registrado permanentemente no histórico.
          </div>
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={s.btnDanger} disabled={saving} onClick={handleSave}><Ic.Archive /> {saving ? 'Processando…' : 'Confirmar Baixa'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Delete Modal ───────────────────────────────────────
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
          <button className={s.btnDanger} onClick={onConfirm} disabled={deleting}>{deleting ? 'Excluindo…' : 'Excluir'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Location Entry Modal ───────────────────────────────
function LocationEntryModal({ assetId, onClose, onSaved }: {
  assetId: string; onClose: () => void; onSaved: () => void
}) {
  const [location,       setLocation]       = useState('')
  const [customLoc,      setCustomLoc]      = useState('')
  const [locationDetail, setLocationDetail] = useState('')
  const [notes,          setNotes]          = useState('')
  const [registeredBy,   setRegisteredBy]   = useState('')
  const [photoFiles,     setPhotoFiles]     = useState<File[]>([])
  const [previews,       setPreviews]       = useState<string[]>([])
  const [saving,         setSaving]         = useState(false)
  const effectiveLoc = location === '__custom__' ? customLoc : location

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const combined = [...photoFiles, ...files].slice(0, 8)
    setPhotoFiles(combined)
    setPreviews(prev => { prev.forEach(u => URL.revokeObjectURL(u)); return combined.map(f => URL.createObjectURL(f)) })
    e.target.value = ''
  }

  function removePhoto(idx: number) {
    URL.revokeObjectURL(previews[idx])
    const f = photoFiles.filter((_, i) => i !== idx)
    setPhotoFiles(f)
    setPreviews(f.map(file => URL.createObjectURL(file)))
  }

  async function handleSave() {
    if (!effectiveLoc.trim()) { alert('Selecione a localização atual.'); return }
    setSaving(true)
    try {
      await addLocationEntry({ assetId, location: effectiveLoc.trim(), locationDetail: locationDetail.trim() || undefined, notes: notes.trim() || undefined, registeredBy: registeredBy.trim() || undefined }, photoFiles)
      onSaved(); onClose()
    } catch (e) { alert('Erro ao salvar: ' + String(e)) }
    finally { setSaving(false) }
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <div className={s.modalHeaderLeft}>
            <div className={s.modalIcon} style={{ background: 'rgba(124,58,237,0.1)', color: '#7c3aed' }}><Ic.Camera /></div>
            <div><div className={s.modalLabel}>História do Ativo</div><div className={s.modalTitle}>Registrar Localização</div></div>
          </div>
          <button className={s.modalCloseBtn} onClick={onClose}><Ic.Close /></button>
        </div>
        <div className={s.modalBody}>
          <div className={s.formGroup}>
            <label className={s.label}>Localização Atual <span className={s.req}>*</span></label>
            <select className={s.select} value={location} onChange={e => setLocation(e.target.value)}>
              <option value="">— Selecionar —</option>
              {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              <option value="__custom__">✏️ Outra localização…</option>
            </select>
            {location === '__custom__' && <input className={s.input} style={{ marginTop: 6 }} placeholder="Digite a localização atual…" value={customLoc} onChange={e => setCustomLoc(e.target.value)} />}
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Detalhe da Localização</label>
            <input className={s.input} placeholder="Ex: Sala 02, Prateleira B…" value={locationDetail} onChange={e => setLocationDetail(e.target.value)} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Observações</label>
            <textarea className={s.textarea} rows={2} placeholder="Estado do ativo, motivo da mudança…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Registrado por</label>
            <input className={s.input} placeholder="Seu nome" value={registeredBy} onChange={e => setRegisteredBy(e.target.value)} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Fotos <span style={{ fontWeight: 400, textTransform: 'none', color: '#8898AA' }}>(máx. 8)</span></label>
            <label className={s.photoUploadZone}>
              <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileChange} />
              <Ic.Camera /><span>Clique para adicionar fotos</span>
              <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>PNG, JPG, WEBP · até 10 MB cada</span>
            </label>
            {previews.length > 0 && (
              <div className={s.photoPreviewGrid}>
                {previews.map((url, i) => (
                  <div key={i} className={s.photoPreviewItem}>
                    <img src={url} alt={`Foto ${i + 1}`} className={s.photoPreviewImg} />
                    <button className={s.photoRemoveBtn} type="button" onClick={() => removePhoto(i)}><Ic.Close /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={s.btnPurple} disabled={saving} onClick={handleSave}><Ic.Camera /> {saving ? 'Salvando…' : 'Registrar Localização'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Add Cost Modal ─────────────────────────────────────
function AddCostModal({ assetId, onClose, onSaved }: {
  assetId: string; onClose: () => void; onSaved: () => void
}) {
  const [type,         setType]         = useState<string>('manutencao')
  const [description,  setDescription]  = useState('')
  const [value,        setValue]        = useState('')
  const [date,         setDate]         = useState(new Date().toISOString().split('T')[0])
  const [registeredBy, setRegisteredBy] = useState('')
  const [saving,       setSaving]       = useState(false)

  async function handleSave() {
    if (!description.trim()) { alert('Descreva o custo.'); return }
    const v = parseFloat(value.replace(',', '.'))
    if (isNaN(v) || v <= 0) { alert('Informe um valor válido.'); return }
    setSaving(true)
    try {
      await addAssetCost({
        assetId,
        type:         type as import('@/types/eam').AssetCostType,
        description:  description.trim(),
        value:        v,
        date:         new Date(date + 'T12:00:00'),
        registeredBy: registeredBy.trim() || undefined,
      })
      onSaved()
      onClose()
    } catch (e) { alert('Erro: ' + String(e)) }
    finally { setSaving(false) }
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <div className={s.modalHeaderLeft}>
            <div className={s.modalIcon} style={{ background: 'rgba(8,145,178,0.1)', color: '#0891b2' }}><Ic.Dollar /></div>
            <div><div className={s.modalLabel}>Registro de Custo</div><div className={s.modalTitle}>Novo Lançamento</div></div>
          </div>
          <button className={s.modalCloseBtn} onClick={onClose}><Ic.Close /></button>
        </div>
        <div className={s.modalBody}>
          <div className={s.formGrid}>
            <div className={s.formGroup}>
              <label className={s.label}>Tipo de Custo <span className={s.req}>*</span></label>
              <select className={s.select} value={type} onChange={e => setType(e.target.value)}>
                {COST_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Data <span className={s.req}>*</span></label>
              <input type="date" className={s.input} value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Descrição <span className={s.req}>*</span></label>
            <input className={s.input} placeholder="Ex: Troca de correia, revisão geral…" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className={s.formGrid}>
            <div className={s.formGroup}>
              <label className={s.label}>Valor (R$) <span className={s.req}>*</span></label>
              <input className={s.input} placeholder="0,00" value={value} onChange={e => setValue(e.target.value)} />
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Registrado por</label>
              <input className={s.input} placeholder="Seu nome" value={registeredBy} onChange={e => setRegisteredBy(e.target.value)} />
            </div>
          </div>
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={s.btnCyan} disabled={saving} onClick={handleSave}><Ic.Dollar /> {saving ? 'Salvando…' : 'Registrar Custo'}</button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// AssetDetailPage — 360° EAM
// ══════════════════════════════════════════════════════

type TabId = 'geral' | 'manutencoes' | 'indicadores' | 'custos' | 'timeline'

export default function AssetDetailPage() {
  const { id }      = useParams<{ id: string }>()
  const navigate    = useNavigate()
  const { removeAsset, upsertAsset } = useStore()

  useCategories()
  useAssets()
  const categoryMap = useStore(selectCategoryMap)
  const { maintenance } = useMaintenance({ assetId: id ?? undefined })

  const [asset,           setAsset]           = useState<Asset | null>(null)
  const [history,         setHistory]         = useState<AssetEvent[]>([])
  const [suppliers,       setSuppliers]       = useState<Supplier[]>([])
  const [locationHistory, setLocationHistory] = useState<AssetLocationEntry[]>([])
  const [costs,           setCosts]           = useState<AssetCost[]>([])
  const [loading,         setLoading]         = useState(true)

  const [activeTab,         setActiveTab]         = useState<TabId>('geral')
  const [maintFilter,       setMaintFilter]       = useState<string>('all')
  const [showTransfer,      setShowTransfer]      = useState(false)
  const [showDiscard,       setShowDiscard]       = useState(false)
  const [showDelete,        setShowDelete]        = useState(false)
  const [showMaint,         setShowMaint]         = useState(false)
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [showAddCost,       setShowAddCost]       = useState(false)
  const [lightboxPhoto,     setLightboxPhoto]     = useState<string | null>(null)
  const [deleting,          setDeleting]          = useState(false)
  const [newLifecycle,      setNewLifecycle]      = useState<string>('')
  const [savingLifecycle,   setSavingLifecycle]   = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      getAssetById(id),
      getAssetHistory(id),
      getLocationHistory(id),
      getAssetCosts(id),
    ])
      .then(([a, h, lh, c]) => {
        if (!a) { navigate('/ativos', { replace: true }); return }
        setAsset(a)
        setHistory(h)
        setLocationHistory(lh)
        setCosts(c)
      })
      .catch(() => navigate('/ativos', { replace: true }))
      .finally(() => setLoading(false))
  }, [id]) // eslint-disable-line

  useEffect(() => {
    if (!asset?.categoryId) return
    getSuppliers({ categoryId: asset.categoryId, active: true }).then(setSuppliers).catch(() => {})
  }, [asset?.categoryId]) // eslint-disable-line

  // ── Computed values ──────────────────────────────────
  const category    = asset ? categoryMap[asset.categoryId] : undefined
  const statusMeta  = asset ? (STATUS_META[asset.status] ?? STATUS_META.inativo) : null
  const hasLocHist  = category ? !MACHINERY_PREFIXES.has(category.prefix) : false

  const kpis = useMemo(
    () => asset ? computeAssetKPIs(asset, maintenance) : null,
    [asset, maintenance],
  )

  const healthScore = useMemo(
    () => kpis ? computeAssetHealthScore(kpis, maintenance) : null,
    [kpis, maintenance],
  )

  const replacementPrediction = useMemo(
    () => (asset && kpis && healthScore) ? getReplacementPrediction(asset, kpis, healthScore) : null,
    [asset, kpis, healthScore],
  )

  const openMaintenances = useMemo(
    () => maintenance.filter(m => m.status === 'pendente' || m.status === 'andamento'),
    [maintenance],
  )

  const filteredMaint = useMemo(() => {
    if (maintFilter === 'all') return maintenance
    return maintenance.filter(m => m.status === maintFilter || m.type === maintFilter)
  }, [maintenance, maintFilter])

  const totalCostsExtra = useMemo(
    () => costs.filter(c => c.type !== 'aquisicao').reduce((s, c) => s + c.value, 0),
    [costs],
  )

  // ── Handlers ────────────────────────────────────────
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

  function reloadLocationHistory() {
    if (id) getLocationHistory(id).then(setLocationHistory).catch(() => {})
  }

  function reloadCosts() {
    if (id) getAssetCosts(id).then(setCosts).catch(() => {})
  }

  function handleAssetUpdated(updated: Asset) {
    setAsset(updated)
    upsertAsset?.(updated)
    reloadHistory()
  }

  async function handleLifecycleSave() {
    if (!asset || !newLifecycle) return
    setSavingLifecycle(true)
    try {
      await updateLifecycleStatus(asset.id, newLifecycle as AssetLifecycleStatus, undefined, undefined)
      setAsset({ ...asset, lifecycleStatus: newLifecycle as AssetLifecycleStatus })
      upsertAsset?.({ ...asset, lifecycleStatus: newLifecycle as AssetLifecycleStatus })
      reloadHistory()
      setNewLifecycle('')
    } catch (e) { alert('Erro: ' + String(e)) }
    finally { setSavingLifecycle(false) }
  }

  // ── Render guards ────────────────────────────────────
  if (loading) {
    return <div className={s.page}><div className={s.loadWrap}>Carregando ativo…</div></div>
  }
  if (!asset) return null

  const CIRC = 2 * Math.PI * 32
  const lifecycleMeta = asset.lifecycleStatus ? LIFECYCLE_META[asset.lifecycleStatus] : null
  const currentLC     = newLifecycle || asset.lifecycleStatus || ''

  // ── Main render ──────────────────────────────────────
  return (
    <div className={s.page}>

      {/* Breadcrumb */}
      <div className={s.breadcrumb}>
        <Link to="/ativos" className={s.backLink}><Ic.Back /> Ativos</Link>
        <span className={s.breadSep}>/</span>
        <span className={s.breadCurrent}>{asset.name}</span>
      </div>

      {/* ── Header ── */}
      <div className={s.assetHeader} style={{ '--status-color': statusMeta?.color } as CSSProperties}>
        <div className={s.headerLeft}>
          <div className={s.catIconBox}>{category?.icon ?? '🏷️'}</div>
          <div className={s.headerMeta}>
            <div className={s.assetCode}>{asset.code}</div>
            <div className={s.assetName}>{asset.name}</div>
            <div className={s.headerTags}>
              {statusMeta && (
                <span className={s.badge} style={{ background: statusMeta.bg, color: statusMeta.color, borderColor: statusMeta.color + '44' }}>
                  {statusMeta.label}
                </span>
              )}
              {lifecycleMeta && (
                <span className={s.badge} style={{ background: lifecycleMeta.bg, color: lifecycleMeta.color, borderColor: lifecycleMeta.color + '44' }}>
                  {lifecycleMeta.icon} {lifecycleMeta.label}
                </span>
              )}
              {category && <span className={s.catBadge}>{category.icon} {category.name}</span>}
              {asset.location && <span className={s.catBadge}>📍 {asset.location}</span>}
              {openMaintenances.length > 0 && (
                <span className={s.badge} style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', borderColor: 'rgba(245,158,11,0.3)' }}>
                  🔧 {openMaintenances.length} em aberto
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Health Score Ring */}
        {healthScore && (
          <div className={s.healthRingWrap}>
            <svg width="88" height="88" viewBox="0 0 88 88">
              <circle cx="44" cy="44" r="32" fill="none" stroke="#e2e8f0" strokeWidth="7" />
              <circle
                cx="44" cy="44" r="32"
                fill="none"
                stroke={healthScore.color}
                strokeWidth="7"
                strokeDasharray={`${(healthScore.score / 100) * CIRC} ${CIRC}`}
                strokeLinecap="round"
                transform="rotate(-90 44 44)"
                style={{ transition: 'stroke-dasharray 0.6s ease' }}
              />
            </svg>
            <div className={s.healthRingInner}>
              <div className={s.healthRingScore} style={{ color: healthScore.color } as CSSProperties}>{healthScore.score}</div>
              <div className={s.healthRingLabel}>{healthScore.label}</div>
            </div>
          </div>
        )}

        <div className={s.headerRight}>
          <div className={s.actionBar}>
            <button className={s.btnGhost} onClick={() => setShowTransfer(true)}><Ic.Transfer /> Transferir</button>
            <button className={s.btnPrimary} onClick={() => setShowMaint(true)}><Ic.Wrench /> Nova Manutenção</button>
            <Link to={`/ativos/novo?edit=${asset.id}`} className={s.btnGhost}><Ic.Edit /> Editar</Link>
            {asset.status !== 'inativo' && (
              <button className={s.btnGhost} style={{ color: '#DC2626', borderColor: 'rgba(220,38,38,0.3)' }} onClick={() => setShowDiscard(true)}><Ic.Archive /> Dar Baixa</button>
            )}
            <button className={s.btnGhost} style={{ color: '#DC2626', borderColor: 'rgba(220,38,38,0.3)' }} onClick={() => setShowDelete(true)}><Ic.Trash /> Excluir</button>
          </div>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className={s.tabBar}>
        {([
          { id: 'geral',        icon: '📋', label: 'Geral'       },
          { id: 'manutencoes',  icon: '🔧', label: 'Manutenções', count: maintenance.length },
          { id: 'indicadores',  icon: '📊', label: 'Indicadores' },
          { id: 'custos',       icon: '💰', label: 'Custos',      count: costs.length },
          { id: 'timeline',     icon: '📅', label: 'Timeline',    count: history.length },
        ] as Array<{ id: TabId; icon: string; label: string; count?: number }>).map(tab => (
          <button
            key={tab.id}
            className={`${s.tab} ${activeTab === tab.id ? s.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon} {tab.label}</span>
            {tab.count != null && tab.count > 0 && (
              <span className={s.tabBadge}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════
          TAB: GERAL
         ══════════════════════════════ */}
      {activeTab === 'geral' && (
        <div className={s.tabCols}>

          {/* Left — Identification */}
          <div className={s.tabColMain}>
            <div className={s.card}>
              <div className={s.cardHeader}>
                <div className={s.cardHeaderLeft}>
                  <div className={s.cardHeaderIcon} style={{ background: 'rgba(22,101,52,0.1)', color: '#166534' }}><Ic.Info /></div>
                  <span className={s.cardTitle}>Identificação do Ativo</span>
                </div>
              </div>
              <div className={s.cardBody}>
                <div className={s.infoGrid}>
                  <div className={s.infoField}><span className={s.infoKey}>Código</span><span className={s.infoVal}>{asset.code}</span></div>
                  <div className={s.infoField}><span className={s.infoKey}>Categoria</span><span className={s.infoVal}>{category ? `${category.icon} ${category.name}` : '—'}</span></div>
                  <div className={s.infoField}><span className={s.infoKey}>Localização</span><span className={s.infoVal}>{asset.location || '—'}</span></div>
                  {asset.locationDetail && <div className={s.infoField}><span className={s.infoKey}>Detalhe</span><span className={s.infoVal}>{asset.locationDetail}</span></div>}
                  <div className={s.infoField}><span className={s.infoKey}>Responsável</span><span className={asset.responsible ? s.infoVal : s.infoValMuted}>{asset.responsible || '—'}</span></div>
                  <div className={s.infoField}><span className={s.infoKey}>Data de Aquisição</span><span className={asset.acquisition ? s.infoVal : s.infoValMuted}>{asset.acquisition ? new Date(asset.acquisition).toLocaleDateString('pt-BR') : '—'}</span></div>
                  <div className={s.infoField}><span className={s.infoKey}>Valor de Aquisição</span><span className={s.infoVal}>{fmtCurrency(asset.value)}</span></div>
                  {asset.serialNumber && <div className={s.infoField}><span className={s.infoKey}>Nº de Série</span><span className={s.infoVal}>{asset.serialNumber}</span></div>}
                  {asset.manufacturer && <div className={s.infoField}><span className={s.infoKey}>Fabricante</span><span className={s.infoVal}>{asset.manufacturer}</span></div>}
                  {asset.model && <div className={s.infoField}><span className={s.infoKey}>Modelo</span><span className={s.infoVal}>{asset.model}</span></div>}
                  {asset.warrantyExpiry && (
                    <div className={s.infoField}>
                      <span className={s.infoKey}>Garantia até</span>
                      <span className={s.infoVal} style={{ color: new Date(asset.warrantyExpiry) < new Date() ? '#dc2626' : '#16a34a' }}>
                        {new Date(asset.warrantyExpiry).toLocaleDateString('pt-BR')}
                        {new Date(asset.warrantyExpiry) < new Date() ? ' ⚠️ Vencida' : ''}
                      </span>
                    </div>
                  )}
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

            {/* Suppliers */}
            <div className={s.card}>
              <div className={s.cardHeader}>
                <div className={s.cardHeaderLeft}>
                  <div className={s.cardHeaderIcon} style={{ background: 'rgba(234,88,12,0.1)', color: '#EA580C' }}><Ic.Building /></div>
                  <span className={s.cardTitle}>
                    Fornecedores
                    {category && <span style={{ marginLeft: 6, fontSize: '0.65rem', fontWeight: 600, color: category.color || '#8898AA', background: (category.color || '#8898AA') + '18', padding: '1px 7px', borderRadius: 10 }}>{category.icon} {category.name}</span>}
                    {suppliers.length > 0 && <span style={{ marginLeft: 6, background: '#EA580C', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '0.65rem' }}>{suppliers.length}</span>}
                  </span>
                </div>
                <Link to="/ativos/fornecedores" className={s.btnGhost} style={{ fontSize: '0.72rem', padding: '5px 10px' }}>Ver todos</Link>
              </div>
              {suppliers.length === 0 ? (
                <div className={s.suppEmpty}>
                  <Ic.Building /><span>Nenhum fornecedor para esta categoria.</span>
                  <Link to="/ativos/fornecedores" className={s.suppAddLink}>+ Cadastrar fornecedor</Link>
                </div>
              ) : (
                <div className={s.suppList}>
                  {suppliers.map(sup => {
                    const tm = SUPPLIER_TYPE_META[sup.type] ?? { label: sup.type, color: '#94a3b8' }
                    return (
                      <div key={sup.id} className={s.suppItem}>
                        <div className={s.suppItemHead}>
                          <span className={s.suppName}>{sup.name}</span>
                          <span className={s.suppTypeBadge} style={{ background: tm.color + '18', color: tm.color, borderColor: tm.color + '44' }}>{tm.label}</span>
                        </div>
                        <div className={s.suppContacts}>
                          {sup.contact && <div className={s.suppContactRow}><span className={s.suppContactIcon}><Ic.User /></span><span>{sup.contact}</span></div>}
                          {sup.phone && <div className={s.suppContactRow}><span className={s.suppContactIcon}><Ic.Phone /></span><a href={`tel:${sup.phone}`} className={s.suppContactLink}>{sup.phone}</a></div>}
                          {sup.email && <div className={s.suppContactRow}><span className={s.suppContactIcon}><Ic.Mail /></span><a href={`mailto:${sup.email}`} className={s.suppContactLink}>{sup.email}</a></div>}
                        </div>
                        <div className={s.suppActions}>
                          {(sup.type === 'service' || sup.type === 'both') && <Link to="/os" className={s.suppActBtn} style={{ color: '#166534', borderColor: 'rgba(22,101,52,0.25)', background: 'rgba(22,101,52,0.06)' }}><Ic.FileText /> Nova O.S.</Link>}
                          {(sup.type === 'purchase' || sup.type === 'both') && <Link to="/compras" className={s.suppActBtn} style={{ color: '#EA580C', borderColor: 'rgba(234,88,12,0.25)', background: 'rgba(234,88,12,0.06)' }}><Ic.Cart /> Novo P.C.</Link>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right — Status + Lifecycle + Location History */}
          <div className={s.tabColSide}>

            {/* Ciclo de Vida */}
            <div className={s.card}>
              <div className={s.cardHeader}>
                <div className={s.cardHeaderLeft}>
                  <div className={s.cardHeaderIcon} style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><Ic.EvLifecycle /></div>
                  <span className={s.cardTitle}>Ciclo de Vida EAM</span>
                </div>
              </div>
              <div className={s.cardBody}>
                <div style={{ marginBottom: 12 }}>
                  {lifecycleMeta ? (
                    <span className={s.lifecycleBadge} style={{ background: lifecycleMeta.bg, color: lifecycleMeta.color, border: `1px solid ${lifecycleMeta.color}44` }}>
                      {lifecycleMeta.icon} {lifecycleMeta.label}
                    </span>
                  ) : (
                    <span className={s.lifecycleBadgeEmpty}>Não definido</span>
                  )}
                </div>
                <div className={s.lifecycleRow}>
                  <select
                    className={s.select}
                    value={currentLC}
                    onChange={e => setNewLifecycle(e.target.value)}
                  >
                    <option value="">— Selecionar status —</option>
                    {Object.entries(LIFECYCLE_META).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                  {newLifecycle && newLifecycle !== asset.lifecycleStatus && (
                    <button
                      className={s.btnPrimary}
                      style={{ whiteSpace: 'nowrap' }}
                      disabled={savingLifecycle}
                      onClick={handleLifecycleSave}
                    >
                      {savingLifecycle ? '…' : 'Salvar'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Location History */}
            {hasLocHist && (
              <div className={s.card}>
                <div className={s.cardHeader}>
                  <div className={s.cardHeaderLeft}>
                    <div className={s.cardHeaderIcon} style={{ background: 'rgba(124,58,237,0.1)', color: '#7c3aed' }}><Ic.Camera /></div>
                    <span className={s.cardTitle}>
                      Localização Atual
                      {locationHistory.length > 0 && <span style={{ marginLeft: 8, background: '#7c3aed', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '0.65rem' }}>{locationHistory.length}</span>}
                    </span>
                  </div>
                  <button className={s.btnGhost} style={{ color: '#7c3aed', borderColor: 'rgba(124,58,237,0.3)' }} onClick={() => setShowLocationModal(true)}>
                    <Ic.Plus /> Registrar
                  </button>
                </div>
                {locationHistory.length === 0 ? (
                  <div className={s.locHistEmpty}>
                    <Ic.Camera /><span>Nenhum registro de localização.</span>
                    <button className={s.btnPurple} style={{ marginTop: 4 }} onClick={() => setShowLocationModal(true)}><Ic.Plus /> Primeiro Registro</button>
                  </div>
                ) : (
                  <div className={s.locHistList}>
                    {locationHistory.slice(0, 3).map((entry, idx) => (
                      <div key={entry.id} className={s.locHistItem}>
                        <div className={s.locHistDot} style={{ background: idx === 0 ? '#7c3aed' : '#cbd5e1' }}><Ic.MapPin /></div>
                        <div className={s.locHistContent}>
                          <div className={s.locHistHeader}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                              {idx === 0 && <span className={s.locHistCurrentBadge}>Atual</span>}
                              <span className={s.locHistLocation}>{entry.location}</span>
                              {entry.locationDetail && <span className={s.locHistDetail}>— {entry.locationDetail}</span>}
                            </div>
                            <span className={s.locHistDate}>
                              {entry.createdAt instanceof Date ? entry.createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                            </span>
                          </div>
                          {entry.notes && <div className={s.locHistNotes}>{entry.notes}</div>}
                          {entry.photos.length > 0 && (
                            <div className={s.locHistPhotos}>
                              {entry.photos.slice(0, 4).map((url, pi) => (
                                <img key={pi} src={url} alt={`Foto ${pi + 1}`} className={s.locHistPhoto} onClick={() => setLightboxPhoto(url)} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* ══════════════════════════════
          TAB: MANUTENÇÕES
         ══════════════════════════════ */}
      {activeTab === 'manutencoes' && (
        <div>
          <div className={s.card}>
            <div className={s.cardHeader}>
              <div className={s.cardHeaderLeft}>
                <div className={s.cardHeaderIcon} style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}><Ic.Maint /></div>
                <span className={s.cardTitle}>Manutenções ({maintenance.length})</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Link to={`/ativos/manutencao?assetId=${asset.id}`} className={s.btnGhost} style={{ fontSize: '0.72rem', padding: '5px 10px' }}>Ver tudo</Link>
                <button className={s.btnPrimary} onClick={() => setShowMaint(true)}><Ic.Plus /> Nova</button>
              </div>
            </div>

            {/* Filter pills */}
            <div className={s.filterRow}>
              {[
                { key: 'all',       label: 'Todas'        },
                { key: 'pendente',  label: 'Pendentes'    },
                { key: 'andamento', label: 'Em Andamento' },
                { key: 'concluida', label: 'Concluídas'   },
                { key: 'corretiva', label: 'Corretivas'   },
                { key: 'preventiva',label: 'Preventivas'  },
              ].map(f => (
                <button
                  key={f.key}
                  className={`${s.pill} ${maintFilter === f.key ? s.pillActive : ''}`}
                  onClick={() => setMaintFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filteredMaint.length === 0 ? (
              <div className={s.maintEmpty}>Nenhuma manutenção encontrada.</div>
            ) : (
              <div className={s.maintList}>
                {filteredMaint.map(m => {
                  const tm = MAINT_TYPE_META[m.type]
                  const sm = MAINT_STATUS_META[m.status]
                  const dotColor = m.type === 'corretiva' ? '#DC2626' : m.type === 'preventiva' ? '#3b82f6' : '#22c55e'
                  const stColor  = m.status === 'pendente' ? '#94a3b8' : m.status === 'andamento' ? '#f59e0b' : '#22c55e'
                  return (
                    <div key={m.id} className={s.maintRow}>
                      <div className={s.maintDot} style={{ background: dotColor }} />
                      <div className={s.maintBody}>
                        <div className={s.maintDesc}>{m.description}</div>
                        <div className={s.maintMeta}>
                          {tm.label}
                          {m.technician ? ` · ${m.technician}` : ''}
                          {m.scheduledDate ? ` · ${fmtDate(m.scheduledDate)}` : ''}
                          {m.cost ? ` · ${fmtCurrency(m.cost)}` : ''}
                        </div>
                      </div>
                      <span className={s.maintStatus} style={{ background: stColor + '18', color: stColor }}>{sm.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════
          TAB: INDICADORES
         ══════════════════════════════ */}
      {activeTab === 'indicadores' && kpis && healthScore && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* KPI grid */}
          <div className={s.kpiGrid}>
            <div className={s.kpiCard}>
              <div className={s.kpiCardVal}>{kpis.mtbf.toLocaleString('pt-BR')}</div>
              <div className={s.kpiCardUnit}>horas</div>
              <div className={s.kpiCardLabel}>MTBF</div>
              <div className={s.kpiCardSub}>Tempo médio entre falhas</div>
            </div>
            <div className={s.kpiCard}>
              <div className={s.kpiCardVal}>{kpis.mttr.toLocaleString('pt-BR')}</div>
              <div className={s.kpiCardUnit}>horas</div>
              <div className={s.kpiCardLabel}>MTTR</div>
              <div className={s.kpiCardSub}>Tempo médio de reparo</div>
            </div>
            <div className={s.kpiCard}>
              <div className={s.kpiCardVal} style={{ color: kpis.availability >= 90 ? '#16a34a' : kpis.availability >= 75 ? '#f59e0b' : '#dc2626' } as CSSProperties}>
                {kpis.availability.toFixed(1)}%
              </div>
              <div className={s.kpiCardLabel}>Disponibilidade</div>
              <div className={s.kpiCardSub}>Uptime do ativo</div>
            </div>
            <div className={s.kpiCard}>
              <div className={s.kpiCardVal} style={{ color: kpis.totalFailures === 0 ? '#16a34a' : kpis.totalFailures <= 3 ? '#f59e0b' : '#dc2626' } as CSSProperties}>
                {kpis.totalFailures}
              </div>
              <div className={s.kpiCardLabel}>Falhas Registradas</div>
              <div className={s.kpiCardSub}>Manutenções corretivas</div>
            </div>
            <div className={s.kpiCard}>
              <div className={s.kpiCardVal}>{kpis.totalDowntime.toLocaleString('pt-BR')}</div>
              <div className={s.kpiCardUnit}>horas</div>
              <div className={s.kpiCardLabel}>Downtime Total</div>
              <div className={s.kpiCardSub}>Tempo parado acumulado</div>
            </div>
            <div className={s.kpiCard}>
              <div className={s.kpiCardVal}>{kpis.ageYears.toFixed(1)}</div>
              <div className={s.kpiCardUnit}>anos</div>
              <div className={s.kpiCardLabel}>Idade do Ativo</div>
              <div className={s.kpiCardSub}>Desde a aquisição</div>
            </div>
          </div>

          {/* Health score breakdown */}
          <div className={s.card}>
            <div className={s.cardHeader}>
              <div className={s.cardHeaderLeft}>
                <div className={s.cardHeaderIcon} style={{ background: healthScore.bg, color: healthScore.color }}><Ic.BarChart /></div>
                <span className={s.cardTitle}>Composição do Health Score — {healthScore.score}/100 ({healthScore.label})</span>
              </div>
            </div>
            <div className={s.cardBody}>
              <div className={s.breakdownList}>
                {[
                  { label: 'Disponibilidade',     val: healthScore.breakdown.availability, max: 30 },
                  { label: 'Qualidade Manutenção', val: healthScore.breakdown.maintenance,  max: 25 },
                  { label: 'Taxa de Falhas',       val: healthScore.breakdown.failures,     max: 25 },
                  { label: 'Idade do Ativo',       val: healthScore.breakdown.age,          max: 20 },
                ].map(b => (
                  <div key={b.label} className={s.breakdownRow}>
                    <div className={s.breakdownLabel}>{b.label}</div>
                    <div className={s.breakdownBar}>
                      <div className={s.breakdownFill} style={{ width: `${(b.val / b.max) * 100}%`, background: healthScore.color } as CSSProperties} />
                    </div>
                    <div className={s.breakdownScore}>{b.val}/{b.max}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Maintenance type distribution */}
          {maintenance.length > 0 && (
            <div className={s.card}>
              <div className={s.cardHeader}>
                <div className={s.cardHeaderLeft}>
                  <div className={s.cardHeaderIcon} style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}><Ic.Maint /></div>
                  <span className={s.cardTitle}>Distribuição de Manutenções ({maintenance.length})</span>
                </div>
              </div>
              <div className={s.cardBody}>
                <div className={s.distRow}>
                  {(['preventiva', 'corretiva', 'inspecao', 'software', 'hardware'] as const).map(type => {
                    const count = maintenance.filter(m => m.type === type).length
                    if (!count) return null
                    const tm = MAINT_TYPE_META[type]
                    const pct = Math.round((count / maintenance.length) * 100)
                    const color = type === 'corretiva' ? '#dc2626' : type === 'preventiva' ? '#3b82f6' : '#22c55e'
                    return (
                      <div key={type} className={s.distItem}>
                        <div className={s.distBar}>
                          <div className={s.distBarFill} style={{ height: `${pct}%`, background: color } as CSSProperties} />
                        </div>
                        <div className={s.distCount}>{count}</div>
                        <div className={s.distLabel}>{tm.label}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Previsão de Substituição */}
          {replacementPrediction && (
            <div className={s.card}>
              <div className={s.cardHeader}>
                <span className={s.cardTitle}>Previsão de Substituição</span>
              </div>
              <div className={s.cardBody}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ background: replacementPrediction.bg, border: `1px solid ${replacementPrediction.color}30`, borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>
                      {REPLACEMENT_META[replacementPrediction.recommendation].icon}
                    </span>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: replacementPrediction.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Recomendação
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 900, color: replacementPrediction.color, marginTop: 2 }}>
                        {replacementPrediction.label}
                      </div>
                      {replacementPrediction.estimatedReplacementYear && (
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3 }}>
                          Estimativa: {replacementPrediction.estimatedReplacementYear}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8898AA', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                      Fatores Analisados
                    </div>
                    <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {replacementPrediction.reasoning.map((r, i) => (
                        <li key={i} style={{ fontSize: '0.78rem', color: '#374151', fontWeight: 500 }}>{r}</li>
                      ))}
                    </ul>
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${replacementPrediction.score}%`, height: '100%', background: replacementPrediction.color, borderRadius: 4, transition: 'width 0.6s ease' }} />
                      </div>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: replacementPrediction.color, minWidth: 36, textAlign: 'right' }}>
                        {replacementPrediction.score}/100
                      </span>
                    </div>
                    <div style={{ fontSize: '0.67rem', color: '#94a3b8', marginTop: 3 }}>Índice de urgência de substituição</div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ══════════════════════════════
          TAB: CUSTOS
         ══════════════════════════════ */}
      {activeTab === 'custos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Summary cards */}
          <div className={s.costSummaryGrid}>
            <div className={s.costSummaryCard}>
              <div className={s.costSummaryIcon} style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a' }}>💰</div>
              <div className={s.costSummaryLabel}>Valor de Aquisição</div>
              <div className={s.costSummaryVal}>{fmtCurrency(asset.value)}</div>
            </div>
            <div className={s.costSummaryCard}>
              <div className={s.costSummaryIcon} style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>🔧</div>
              <div className={s.costSummaryLabel}>Custos Operacionais</div>
              <div className={s.costSummaryVal}>{fmtCurrency(totalCostsExtra)}</div>
            </div>
            <div className={s.costSummaryCard} style={{ borderColor: '#e2e8f0' }}>
              <div className={s.costSummaryIcon} style={{ background: 'rgba(100,116,139,0.1)', color: '#64748b' }}>📊</div>
              <div className={s.costSummaryLabel}>Custo Total Acumulado</div>
              <div className={s.costSummaryVal}>{fmtCurrency((asset.value ?? 0) + totalCostsExtra)}</div>
            </div>
          </div>

          {/* Costs list */}
          <div className={s.card}>
            <div className={s.cardHeader}>
              <div className={s.cardHeaderLeft}>
                <div className={s.cardHeaderIcon} style={{ background: 'rgba(8,145,178,0.1)', color: '#0891b2' }}><Ic.Dollar /></div>
                <span className={s.cardTitle}>Lançamentos de Custo {costs.length > 0 && <span style={{ marginLeft: 6, background: '#0891b2', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '0.65rem' }}>{costs.length}</span>}</span>
              </div>
              <button className={s.btnPrimary} onClick={() => setShowAddCost(true)}><Ic.Plus /> Novo Custo</button>
            </div>

            {costs.length === 0 ? (
              <div className={s.maintEmpty}>
                <span>Nenhum custo registrado.</span>
                <button className={s.btnGhost} style={{ marginTop: 8 }} onClick={() => setShowAddCost(true)}><Ic.Plus /> Registrar primeiro custo</button>
              </div>
            ) : (
              <div className={s.costList}>
                {costs.map(cost => {
                  const cm = COST_TYPE_META[cost.type] ?? { label: cost.type, color: '#64748b', icon: '📋' }
                  return (
                    <div key={cost.id} className={s.costItem}>
                      <div className={s.costItemIcon} style={{ background: cm.color + '18', color: cm.color }}>{cm.icon}</div>
                      <div className={s.costItemBody}>
                        <div className={s.costItemDesc}>{cost.description}</div>
                        <div className={s.costItemMeta}>
                          <span className={s.costItemType} style={{ background: cm.color + '12', color: cm.color }}>{cm.label}</span>
                          <span>{cost.date instanceof Date ? cost.date.toLocaleDateString('pt-BR') : '—'}</span>
                          {cost.registeredBy && <span>· {cost.registeredBy}</span>}
                        </div>
                      </div>
                      <div className={s.costItemVal}>{fmtCurrency(cost.value)}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════
          TAB: TIMELINE
         ══════════════════════════════ */}
      {activeTab === 'timeline' && (
        <div className={s.card}>
          <div className={s.cardHeader}>
            <div className={s.cardHeaderLeft}>
              <div className={s.cardHeaderIcon} style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}><Ic.History /></div>
              <span className={s.cardTitle}>Timeline Completa ({history.length + (hasLocHist ? locationHistory.length : 0)} eventos)</span>
            </div>
          </div>

          {history.length === 0 && locationHistory.length === 0 ? (
            <div className={s.timelineEmpty}>
              <Ic.History /><span>Nenhum evento registrado.</span>
              <span style={{ fontSize: '0.72rem' }}>Eventos aparecem automaticamente ao criar manutenções, transferências e outras ações.</span>
            </div>
          ) : (
            <div className={s.timeline}>
              {history.map(ev => {
                const meta  = EVENT_META[ev.eventType] ?? { label: ev.eventType, color: '#94a3b8' }
                const evDate = ev.createdAt instanceof Date ? ev.createdAt : undefined
                return (
                  <div key={ev.id} className={s.timelineItem}>
                    <div className={s.timelineDot} style={{ background: meta.color + '20', color: meta.color }}>
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

                      {ev.eventType === 'lifecycle_changed' && ev.newValue && (
                        <div className={s.timelineTransfer}>
                          <span style={{ color: LIFECYCLE_META[ev.newValue as AssetLifecycleStatus]?.color ?? '#6366f1', fontWeight: 700 }}>
                            {LIFECYCLE_META[ev.newValue as AssetLifecycleStatus]?.icon ?? ''} {LIFECYCLE_META[ev.newValue as AssetLifecycleStatus]?.label ?? ev.newValue}
                          </span>
                        </div>
                      )}

                      {ev.description && <div className={s.timelineDesc}>{ev.description}</div>}

                      <div className={s.timelineDate}>
                        <Ic.Clock />
                        {evDate ? evDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        {ev.performedBy && <span className={s.timelineBy}> · {ev.performedBy}</span>}
                        <span className={s.timelineTag} style={{ background: meta.color + '18', color: meta.color }}>{meta.label}</span>
                      </div>
                    </div>
                  </div>
                )
              })}

              {hasLocHist && locationHistory.map(entry => (
                <div key={`loc-${entry.id}`} className={s.timelineItem}>
                  <div className={s.timelineDot} style={{ background: 'rgba(124,58,237,0.15)', color: '#7c3aed' }}>
                    <Ic.MapPin />
                  </div>
                  <div className={s.timelineContent}>
                    <div className={s.timelineTitle}>📍 {entry.location}{entry.locationDetail ? ` — ${entry.locationDetail}` : ''}</div>
                    {entry.notes && <div className={s.timelineDesc}>{entry.notes}</div>}
                    {entry.photos.length > 0 && (
                      <div className={s.locHistPhotos} style={{ marginTop: 6 }}>
                        {entry.photos.slice(0, 4).map((url, pi) => (
                          <img key={pi} src={url} alt={`Foto ${pi + 1}`} className={s.locHistPhoto} onClick={() => setLightboxPhoto(url)} />
                        ))}
                      </div>
                    )}
                    <div className={s.timelineDate}>
                      <Ic.Clock />
                      {entry.createdAt instanceof Date ? entry.createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      {entry.registeredBy && <span className={s.timelineBy}> · {entry.registeredBy}</span>}
                      <span className={s.timelineTag} style={{ background: 'rgba(124,58,237,0.12)', color: '#7c3aed' }}>Localização</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {showTransfer      && <TransferModal asset={asset} onClose={() => setShowTransfer(false)} onSaved={handleAssetUpdated} />}
      {showDiscard       && <DiscardModal  asset={asset} onClose={() => setShowDiscard(false)}  onSaved={handleAssetUpdated} />}
      {showDelete        && <DeleteModal   asset={asset} onConfirm={handleDelete} onCancel={() => setShowDelete(false)} deleting={deleting} />}
      {showLocationModal && <LocationEntryModal assetId={asset.id} onClose={() => setShowLocationModal(false)} onSaved={reloadLocationHistory} />}
      {showAddCost       && <AddCostModal assetId={asset.id} onClose={() => setShowAddCost(false)} onSaved={reloadCosts} />}
      {showMaint         && (
        <MaintenanceForm
          preselectedAssetId={asset.id}
          onClose={() => setShowMaint(false)}
          onSaved={_ => { if (id) getAssetHistory(id).then(setHistory).catch(() => {}); setShowMaint(false) }}
        />
      )}

      {lightboxPhoto && (
        <div className={s.lightbox} onClick={() => setLightboxPhoto(null)}>
          <img src={lightboxPhoto} alt="Ampliado" className={s.lightboxImg} />
          <button className={s.lightboxClose} onClick={() => setLightboxPhoto(null)}><Ic.Close /></button>
        </div>
      )}
    </div>
  )
}

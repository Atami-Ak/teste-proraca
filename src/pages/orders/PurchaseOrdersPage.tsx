import { useState, useMemo, useRef, useCallback, useEffect, type CSSProperties } from 'react'
import { usePurchaseOrders }  from '@/hooks/useData'
import { useStore }           from '@/store/useStore'
import {
  createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder,
  generateOrderNumber, createOrderDocument,
} from '@/lib/db'
import { generatePurchaseDocument, calcTotal, fmtCurrency } from '@/lib/document-generator'
import { storage }            from '@/lib/firebase'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import DocumentViewer         from './DocumentViewer'
import type {
  PurchaseOrder, PurchaseOrderStatus, PurchaseOrderItem,
  OrderDocument, Priority,
} from '@/types'
import { PURCHASE_ORDER_STATUS_META, PRIORITY_META } from '@/types'
import { fmtDate } from '@/lib/db'
import s from './PurchaseOrdersPage.module.css'

// ── SVG Icons ──────────────────────────────────────────
const Ic = {
  Cart:        () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  Plus:        () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Edit:        ({ size = 14 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Document:    ({ size = 14 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>,
  Trash:       ({ size = 14 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  Search:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  User:        () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Truck:       () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16,8 20,8 23,11 23,16 16,16 16,8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  Calendar:    () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Tag:         () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  MapPin:      () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Package:     () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  DollarSign:  () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  Upload:      () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16,16 12,12 8,16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
  X:           ({ size = 10 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Close:       () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  ImageIcon:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>,
  FilePdf:     ({ size = 28 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="9" y1="13" x2="9" y2="17"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="15" y1="14" x2="15" y2="17"/></svg>,
  AlertTriangle: () => <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  ChevronLeft:  () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6"/></svg>,
  ChevronRight: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>,
  ExternalLink: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  Download:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Eye:          ({ size = 14 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Loader:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>,
  Draft:       () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Clock:       () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>,
  CheckCircle: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>,
  Banknote:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>,
  FileText:    ({ size = 14 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Users:       () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
}

// ── Purchase categories ────────────────────────────────
const PURCHASE_CATEGORIES = [
  '', 'Consumíveis', 'EPI / Segurança', 'Peças e Componentes',
  'Ferramentas e Equipamentos', 'Material de Limpeza',
  'Material de Escritório', 'Serviços Terceiros',
  'Infraestrutura / Civil', 'TI e Tecnologia', 'Outros',
]

// ── Image upload helper ────────────────────────────────
async function uploadImages(files: File[], orderId: string): Promise<string[]> {
  return Promise.all(files.map(async file => {
    const path = `pc-attachments/${orderId}/${Date.now()}-${file.name}`
    const snap = await uploadBytes(storageRef(storage, path), file)
    return getDownloadURL(snap.ref)
  }))
}

function getStoragePath(url: string): string {
  try {
    const match = url.match(/\/o\/(.+?)(?:\?|$)/)
    return match ? decodeURIComponent(match[1]) : ''
  } catch { return '' }
}

async function deleteStorageFile(url: string): Promise<void> {
  const path = getStoragePath(url)
  if (!path) return
  try { await deleteObject(storageRef(storage, path)) } catch { /* arquivo pode não existir */ }
}

// ── Form state ─────────────────────────────────────────
interface ItemRow extends PurchaseOrderItem { _key: number }

function emptyItem(key: number): ItemRow {
  return { _key: key, description: '', quantity: 1, unit: 'un', unitPrice: undefined }
}

interface PCFormState {
  title:            string
  description:      string
  status:           PurchaseOrderStatus
  priority:         Priority
  supplierId:       string
  requestedBy:      string
  sector:           string
  purchaseCategory: string
  assetId:          string
  deliveryDate:     string
  notes:            string
  existingImages:   string[]
  newImages:        File[]
}

const EMPTY_FORM: PCFormState = {
  title: '', description: '', status: 'draft', priority: 'normal',
  supplierId: '', requestedBy: '', sector: '', purchaseCategory: '',
  assetId: '', deliveryDate: '', notes: '',
  existingImages: [], newImages: [],
}

function orderToForm(o: PurchaseOrder): PCFormState {
  return {
    title:            o.title,
    description:      o.description      ?? '',
    status:           o.status,
    priority:         o.priority         ?? 'normal',
    supplierId:       o.supplierId       ?? '',
    requestedBy:      o.requestedBy      ?? '',
    sector:           o.sector           ?? '',
    purchaseCategory: o.purchaseCategory ?? '',
    assetId:          o.assetId          ?? '',
    deliveryDate:     o.deliveryDate
      ? new Date(o.deliveryDate).toISOString().slice(0, 10) : '',
    notes:            o.notes            ?? '',
    existingImages:   o.quoteImages      ?? [],
    newImages:        [],
  }
}

// ── Status / Priority badges ───────────────────────────

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const m = PURCHASE_ORDER_STATUS_META[status] ?? { label: status, color: '#94a3b8' }
  return (
    <span className={s.badge} style={{
      background: m.color + '1a', color: m.color, borderColor: m.color + '44',
    }}>
      {m.label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority?: Priority }) {
  if (!priority || priority === 'normal') return null
  const m = PRIORITY_META[priority] ?? { label: priority, color: '#94a3b8' }
  return (
    <span className={s.badge} style={{
      background: m.color + '1a', color: m.color, borderColor: m.color + '44',
    }}>
      {m.label}
    </span>
  )
}

// ── Image Upload Zone ──────────────────────────────────

interface ImageZoneProps {
  existingImages:   string[]
  newImages:        File[]
  onAddFiles:       (files: File[]) => void
  onRemoveExisting: (idx: number)   => void
  onRemoveNew:      (idx: number)   => void
}

function ImageUploadZone({ existingImages, newImages, onAddFiles, onRemoveExisting, onRemoveNew }: ImageZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('image/') || f.type === 'application/pdf'
    )
    if (files.length) onAddFiles(files)
  }, [onAddFiles])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length) onAddFiles(files)
    e.target.value = ''
  }

  const isPdf = (url: string) => url.includes('.pdf') || url.includes('application%2Fpdf')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        className={`${s.imageZone} ${dragging ? s.imageZoneDragging : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className={s.imageZoneIcon}><Ic.Upload /></div>
        <div className={s.imageZoneTitle}>
          {dragging ? 'Solte os arquivos aqui' : 'Arraste orçamentos ou clique para selecionar'}
        </div>
        <div className={s.imageZoneSub}>JPG, PNG, PDF · Múltiplos arquivos aceitos</div>
        <button type="button" className={s.imageZoneBtn} onClick={e => { e.stopPropagation(); inputRef.current?.click() }}>
          Escolher Arquivos
        </button>
        <input ref={inputRef} type="file" multiple accept="image/*,application/pdf"
          style={{ display: 'none' }} onChange={handleChange} />
      </div>

      {(existingImages.length + newImages.length) > 0 && (
        <div className={s.imagePreviewGrid}>
          {existingImages.map((url, i) => (
            <div key={`ex-${i}`} className={s.imageThumb}>
              {isPdf(url)
                ? <div className={s.imageThumbPdf}><Ic.FilePdf /><span className={s.imageThumbPdfName}>PDF</span></div>
                : <img src={url} alt={`Orçamento ${i + 1}`} className={s.imageThumbImg} />
              }
              <button type="button" className={s.imageRemoveBtn} onClick={() => onRemoveExisting(i)}><Ic.X /></button>
            </div>
          ))}
          {newImages.map((file, i) => (
            <div key={`new-${i}`} className={s.imageThumb}>
              {file.type === 'application/pdf'
                ? <div className={s.imageThumbPdf}><Ic.FilePdf /><span className={s.imageThumbPdfName}>{file.name}</span></div>
                : <img src={URL.createObjectURL(file)} alt={file.name} className={s.imageThumbImg} />
              }
              <button type="button" className={s.imageRemoveBtn} onClick={() => onRemoveNew(i)}><Ic.X /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Image Lightbox ─────────────────────────────────────

interface LightboxProps {
  images:       string[]
  initialIndex: number
  onClose:      () => void
}

function ImageLightbox({ images, initialIndex, onClose }: LightboxProps) {
  const [current, setCurrent] = useState(initialIndex)
  const isPdf = (url: string) => url.includes('.pdf') || url.includes('application%2Fpdf')

  const prev = useCallback(() => setCurrent(i => (i - 1 + images.length) % images.length), [images.length])
  const next = useCallback(() => setCurrent(i => (i + 1) % images.length), [images.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     onClose()
      if (e.key === 'ArrowLeft')  prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, prev, next])

  const url = images[current]

  return (
    <div className={s.lightboxOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.lightboxModal}>

        <div className={s.lightboxHeader}>
          <span className={s.lightboxCounter}>
            <Ic.ImageIcon /> {current + 1} / {images.length}
          </span>
          <div className={s.lightboxHeaderActions}>
            <a href={url} target="_blank" rel="noreferrer" className={s.lightboxActionBtn} title="Abrir em nova aba">
              <Ic.ExternalLink />
            </a>
            <a href={url} download className={s.lightboxActionBtn} title="Baixar arquivo">
              <Ic.Download />
            </a>
            <button className={s.lightboxCloseBtn} onClick={onClose}><Ic.Close /></button>
          </div>
        </div>

        <div className={s.lightboxViewer}>
          {images.length > 1 && (
            <button className={`${s.lightboxNav} ${s.lightboxNavPrev}`} onClick={prev}>
              <Ic.ChevronLeft />
            </button>
          )}
          <div className={s.lightboxContent}>
            {isPdf(url) ? (
              <div className={s.lightboxPdf}>
                <Ic.FilePdf size={64} />
                <span className={s.lightboxPdfLabel}>Documento PDF</span>
                <a href={url} target="_blank" rel="noreferrer" className={s.lightboxPdfBtn}>
                  <Ic.ExternalLink /> Abrir PDF
                </a>
              </div>
            ) : (
              <img src={url} alt={`Orçamento ${current + 1}`} className={s.lightboxImg} />
            )}
          </div>
          {images.length > 1 && (
            <button className={`${s.lightboxNav} ${s.lightboxNavNext}`} onClick={next}>
              <Ic.ChevronRight />
            </button>
          )}
        </div>

        {images.length > 1 && (
          <div className={s.lightboxThumbs}>
            {images.map((img, i) => (
              <button
                key={i}
                className={`${s.lightboxThumb} ${i === current ? s.lightboxThumbActive : ''}`}
                onClick={() => setCurrent(i)}
              >
                {isPdf(img) ? (
                  <div className={s.lightboxThumbPdf}><Ic.FilePdf size={20} /></div>
                ) : (
                  <img src={img} alt={`Miniatura ${i + 1}`} />
                )}
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

// ── Form section ───────────────────────────────────────

function FormSection({ icon, title, color, children }: {
  icon: React.ReactNode; title: string; color: string; children: React.ReactNode
}) {
  return (
    <div className={s.formSection}>
      <div className={s.sectionHeader}>
        <div className={s.sectionIcon} style={{ background: color + '18', color }}>{icon}</div>
        <span className={s.sectionTitle}>{title}</span>
      </div>
      {children}
    </div>
  )
}

// ── Items Editor ───────────────────────────────────────

function ItemsEditor({ items, onChange }: { items: ItemRow[]; onChange: (items: ItemRow[]) => void }) {
  const nextKey = useRef(Math.max(0, ...items.map(i => i._key)) + 1)

  function add() {
    onChange([...items, emptyItem(nextKey.current++)])
  }

  function remove(key: number) {
    onChange(items.filter(i => i._key !== key))
  }

  function update(key: number, field: keyof PurchaseOrderItem, value: string | number | undefined) {
    onChange(items.map(i => i._key === key ? { ...i, [field]: value } : i))
  }

  const total = calcTotal(items)

  return (
    <div className={s.itemsEditor}>
      <div className={s.itemsEditorHead}>
        <span className={s.itemsEditorTitle}>Itens do Pedido ({items.length})</span>
        <button type="button" className={s.addItemBtn} onClick={add}>
          <Ic.Plus /> Adicionar Item
        </button>
      </div>

      {items.length > 0 && (
        <div className={s.itemsColHeader}>
          <span className={s.itemColLabel}>Descrição</span>
          <span className={s.itemColLabel}>Qtd</span>
          <span className={s.itemColLabel}>Unid.</span>
          <span className={s.itemColLabelR}>Preço Unit.</span>
          <span className={s.itemColLabelR}>Total</span>
          <span />
        </div>
      )}

      {items.length === 0 && (
        <div className={s.itemsEmptyRow}>
          Nenhum item adicionado. Clique em "Adicionar Item" para começar.
        </div>
      )}

      {items.map(item => (
        <div key={item._key} className={s.itemRow}>
          <input className={s.itemInput} placeholder="Descrição do item"
            value={item.description}
            onChange={e => update(item._key, 'description', e.target.value)} />
          <input type="number" className={s.itemInput} placeholder="Qtd" min={1}
            value={item.quantity}
            onChange={e => update(item._key, 'quantity', Number(e.target.value))} />
          <input className={s.itemInput} placeholder="un"
            value={item.unit}
            onChange={e => update(item._key, 'unit', e.target.value)} />
          <input type="number" step="0.01" className={s.itemInputR} placeholder="0,00"
            value={item.unitPrice ?? ''}
            onChange={e => update(item._key, 'unitPrice', e.target.value ? Number(e.target.value) : undefined)} />
          <span className={s.itemTotalCell}>
            {fmtCurrency(item.quantity * (item.unitPrice ?? 0))}
          </span>
          <button type="button" className={s.removeItemBtn} onClick={() => remove(item._key)}>
            <Ic.X size={10} />
          </button>
        </div>
      ))}

      {items.length > 0 && (
        <div className={s.itemsTotal}>
          <span className={s.itemsTotalLabel}>Total do Pedido</span>
          <span className={s.itemsTotalValue}>{fmtCurrency(total)}</span>
        </div>
      )}
    </div>
  )
}

// ── Order Modal ────────────────────────────────────────

interface OrderModalProps {
  order?:  PurchaseOrder
  onClose: () => void
  onSaved: (o: PurchaseOrder) => void
}

function OrderModal({ order, onClose, onSaved }: OrderModalProps) {
  const isEdit = !!order
  const [form, setForm]  = useState<PCFormState>(order ? orderToForm(order) : EMPTY_FORM)
  const [items, setItems] = useState<ItemRow[]>(
    (order?.items ?? []).map((it, i) => ({ ...it, _key: i }))
  )
  const [saving, setSaving]   = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')

  function setField<K extends keyof PCFormState>(k: K, v: PCFormState[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  const addFiles       = useCallback((files: File[]) => setForm(prev => ({ ...prev, newImages: [...prev.newImages, ...files] })), [])
  const removeExisting = useCallback((idx: number)   => setForm(prev => ({ ...prev, existingImages: prev.existingImages.filter((_, i) => i !== idx) })), [])
  const removeNew      = useCallback((idx: number)   => setForm(prev => ({ ...prev, newImages: prev.newImages.filter((_, i) => i !== idx) })), [])

  async function handleSave() {
    if (!form.title.trim())    { alert('Título é obrigatório.'); return }
    if (items.length === 0)    { alert('Adicione ao menos um item.'); return }
    if (items.some(i => !i.description.trim())) { alert('Todos os itens precisam de descrição.'); return }

    const cleanItems: PurchaseOrderItem[] = items.map(({ _key, ...rest }) => rest)
    const total = calcTotal(cleanItems)

    setSaving(true)
    try {
      const base: Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt'> = {
        title:            form.title.trim(),
        description:      form.description.trim()      || undefined,
        status:           form.status,
        priority:         form.priority,
        items:            cleanItems,
        totalValue:       total,
        supplierId:       form.supplierId.trim()       || undefined,
        requestedBy:      form.requestedBy.trim()      || undefined,
        sector:           form.sector.trim()           || undefined,
        purchaseCategory: form.purchaseCategory        || undefined,
        assetId:          form.assetId.trim()          || undefined,
        deliveryDate:     form.deliveryDate ? new Date(form.deliveryDate) : undefined,
        notes:            form.notes.trim()            || undefined,
        quoteImages:      form.existingImages,
      }

      if (isEdit && order) {
        let quoteImages = form.existingImages
        if (form.newImages.length > 0) {
          setUploadMsg('Enviando imagens…')
          const uploaded = await uploadImages(form.newImages, order.id)
          quoteImages = [...quoteImages, ...uploaded]
        }
        await updatePurchaseOrder(order.id, { ...base, quoteImages })
        onSaved({ ...order, ...base, quoteImages })
      } else {
        const orderNumber = await generateOrderNumber('PC')
        const id = await createPurchaseOrder({ ...base, orderNumber })
        let quoteImages: string[] = []
        if (form.newImages.length > 0) {
          setUploadMsg('Enviando imagens…')
          quoteImages = await uploadImages(form.newImages, id)
          await updatePurchaseOrder(id, { quoteImages })
        }
        onSaved({ id, ...base, orderNumber, quoteImages })
      }
      onClose()
    } catch (e) {
      alert('Erro ao salvar: ' + String(e))
    } finally {
      setSaving(false)
      setUploadMsg('')
    }
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <div className={s.modalHeaderLeft}>
            <div className={s.modalIcon}><Ic.Cart /></div>
            <div>
              <div className={s.modalLabel}>{isEdit ? 'Editar' : 'Novo'} Pedido de Compra</div>
              <div className={s.modalTitle}>{form.title || '—'}</div>
            </div>
          </div>
          <button className={s.modalCloseBtn} onClick={onClose}><Ic.Close /></button>
        </div>

        <div className={s.modalBody}>

          {/* 1. Identificação */}
          <FormSection icon={<Ic.FileText size={14} />} title="Identificação" color="#EA580C">
            <div className={s.formGrid}>
              <div className={`${s.formGroup} ${s.formGroupFull}`}>
                <label className={s.label}>Título <span className={s.req}>*</span></label>
                <input className={s.input} placeholder="Ex.: Compra de EPIs — Equipe de Manutenção"
                  value={form.title} onChange={e => setField('title', e.target.value)} />
              </div>
              <div className={`${s.formGroup} ${s.formGroupFull}`}>
                <label className={s.label}>Justificativa / Descrição</label>
                <textarea className={s.textarea} rows={2}
                  placeholder="Descreva a necessidade e motivo da compra…"
                  value={form.description} onChange={e => setField('description', e.target.value)} />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Categoria</label>
                <select className={s.select} value={form.purchaseCategory}
                  onChange={e => setField('purchaseCategory', e.target.value)}>
                  {PURCHASE_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c || '— Selecionar —'}</option>
                  ))}
                </select>
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Setor / Centro de Custo</label>
                <input className={s.input} placeholder="Ex.: Produção, Manutenção, Administrativo"
                  value={form.sector} onChange={e => setField('sector', e.target.value)} />
              </div>
            </div>
          </FormSection>

          {/* 2. Atribuição */}
          <FormSection icon={<Ic.Users />} title="Atribuição & Fornecedor" color="#3b82f6">
            <div className={s.formGrid}>
              <div className={s.formGroup}>
                <label className={s.label}>Solicitante</label>
                <input className={s.input} placeholder="Quem solicitou a compra"
                  value={form.requestedBy} onChange={e => setField('requestedBy', e.target.value)} />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Fornecedor</label>
                <input className={s.input} placeholder="Nome do fornecedor"
                  value={form.supplierId} onChange={e => setField('supplierId', e.target.value)} />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Ativo Relacionado (Código)</label>
                <input className={s.input} placeholder="Ex.: EQ-0042"
                  value={form.assetId} onChange={e => setField('assetId', e.target.value)} />
              </div>
            </div>
          </FormSection>

          {/* 3. Planejamento */}
          <FormSection icon={<Ic.Clock />} title="Planejamento & Status" color="#f59e0b">
            <div className={s.formGrid}>
              <div className={s.formGroup}>
                <label className={s.label}>Urgência</label>
                <select className={s.select} value={form.priority}
                  onChange={e => setField('priority', e.target.value as Priority)}>
                  <option value="low">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="critical">Crítica</option>
                </select>
              </div>
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
                <label className={s.label}>Prazo de Entrega</label>
                <input type="date" className={s.input}
                  value={form.deliveryDate} onChange={e => setField('deliveryDate', e.target.value)} />
              </div>
            </div>
          </FormSection>

          {/* 4. Itens */}
          <FormSection icon={<Ic.Package />} title="Itens do Pedido" color="#166534">
            <ItemsEditor items={items} onChange={setItems} />
          </FormSection>

          {/* 5. Documentação & Orçamentos */}
          <FormSection icon={<Ic.ImageIcon />} title="Observações & Orçamentos em Imagem" color="#7C3AED">
            <div className={s.formGroup}>
              <label className={s.label}>Observações</label>
              <textarea className={s.textarea} rows={2}
                placeholder="Condições de pagamento, prazos, instruções especiais…"
                value={form.notes} onChange={e => setField('notes', e.target.value)} />
            </div>
            <div>
              <label className={s.label} style={{ marginBottom: 8, display: 'block' }}>
                Orçamentos em Imagem / Referências
              </label>
              <ImageUploadZone
                existingImages={form.existingImages}
                newImages={form.newImages}
                onAddFiles={addFiles}
                onRemoveExisting={removeExisting}
                onRemoveNew={removeNew}
              />
            </div>
          </FormSection>

        </div>

        <div className={s.modalFooter}>
          {uploadMsg && (
            <span style={{ fontSize: '0.78rem', color: '#EA580C', fontWeight: 600, marginRight: 'auto' }}>
              {uploadMsg}
            </span>
          )}
          <button className={s.btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={s.btnPrimary} disabled={saving} onClick={handleSave}>
            {saving ? <><Ic.Loader /> Salvando…</> : isEdit ? 'Salvar Alterações' : 'Criar Pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete Modal ───────────────────────────────────────

function DeleteModal({ order, onConfirm, onCancel, deleting }: {
  order: PurchaseOrder; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={s.deleteModal}>
        <div className={s.deleteIconWrap}><Ic.AlertTriangle /></div>
        <h3 className={s.deleteTitle}>Excluir Pedido de Compra</h3>
        <p className={s.deleteSubtitle}>Você está prestes a excluir permanentemente:</p>
        <div className={s.deleteTarget}>
          <span className={s.deleteTargetNum}>{order.orderNumber ?? order.id.slice(-6).toUpperCase()}</span>
          <span className={s.deleteTargetTitle}>{order.title}</span>
        </div>
        <p className={s.deleteWarning}>Esta ação não pode ser desfeita.</p>
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

// ── Order Card ─────────────────────────────────────────

function OrderCard({ order, generating, onEdit, onViewImages, onGenerate, onDelete }: {
  order: PurchaseOrder; generating: string | null
  onEdit: () => void; onViewImages: () => void; onGenerate: () => void; onDelete: () => void
}) {
  const statusColor = PURCHASE_ORDER_STATUS_META[order.status]?.color ?? '#94a3b8'
  const PREVIEW_ITEMS = 2

  return (
    <div className={s.card}>
      <div className={s.cardAccent} style={{ '--status-color': statusColor } as CSSProperties} />

      <div className={s.cardHead}>
        <span className={s.cardNum}>{order.orderNumber ?? '—'}</span>
        <div className={s.cardBadges}>
          <PriorityBadge priority={order.priority} />
          <StatusBadge status={order.status} />
        </div>
      </div>

      <div className={s.cardBody}>
        <div className={s.cardTitle}>{order.title}</div>
        {order.description && <div className={s.cardDesc}>{order.description}</div>}

        {/* Items preview */}
        {order.items.length > 0 && (
          <div className={s.cardItems}>
            {order.items.slice(0, PREVIEW_ITEMS).map((it, i) => (
              <div key={i} className={s.cardItemRow}>
                <span className={s.cardItemName}>{it.quantity}× {it.description}</span>
                <span className={s.cardItemVal}>
                  {fmtCurrency(it.quantity * (it.unitPrice ?? 0))}
                </span>
              </div>
            ))}
            {order.items.length > PREVIEW_ITEMS && (
              <span className={s.cardItemsMore}>
                + {order.items.length - PREVIEW_ITEMS} item{order.items.length - PREVIEW_ITEMS !== 1 ? 's' : ''} a mais
              </span>
            )}
          </div>
        )}

        {/* Total */}
        {order.totalValue != null && (
          <div className={s.cardTotal}>
            <span className={s.cardTotalLabel}>Total do Pedido</span>
            <span className={s.cardTotalValue}>{fmtCurrency(order.totalValue)}</span>
          </div>
        )}

        {/* Meta */}
        <div className={s.cardMeta}>
          {order.requestedBy && (
            <div className={s.metaItem}>
              <span className={s.metaIcon}><Ic.User /></span>
              <span className={s.metaText}>{order.requestedBy}</span>
            </div>
          )}
          {order.supplierId && (
            <div className={s.metaItem}>
              <span className={s.metaIcon}><Ic.Truck /></span>
              <span className={s.metaText}>{order.supplierId}</span>
            </div>
          )}
          {order.sector && (
            <div className={s.metaItem}>
              <span className={s.metaIcon}><Ic.MapPin /></span>
              <span className={s.metaText}>{order.sector}</span>
            </div>
          )}
          {order.deliveryDate && (
            <div className={s.metaItem}>
              <span className={s.metaIcon}><Ic.Calendar /></span>
              <span className={s.metaText}>Entrega: {fmtDate(order.deliveryDate as Parameters<typeof fmtDate>[0])}</span>
            </div>
          )}
          {order.purchaseCategory && (
            <div className={s.metaItem}>
              <span className={s.metaIcon}><Ic.Tag /></span>
              <span className={s.metaText}>{order.purchaseCategory}</span>
            </div>
          )}
        </div>

        {(order.quoteImages?.length ?? 0) > 0 && (
          <button className={s.cardImageCountBtn} onClick={onViewImages} title="Ver orçamentos anexados">
            <Ic.ImageIcon />
            {order.quoteImages!.length} orçamento{order.quoteImages!.length !== 1 ? 's' : ''} anexado{order.quoteImages!.length !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      <div className={s.cardDivider} />

      <div className={s.cardActions}>
        <button className={`${s.actBtn} ${s.actEdit}`} onClick={onEdit}>
          <Ic.Edit /> Editar
        </button>
        {(order.quoteImages?.length ?? 0) > 0 && (
          <button className={`${s.actBtn} ${s.actPhotos}`} onClick={onViewImages}>
            <Ic.Eye /> Fotos
          </button>
        )}
        <button className={`${s.actBtn} ${s.actDoc}`}
          disabled={generating === order.id} onClick={onGenerate}>
          <Ic.Document /> {generating === order.id ? '…' : 'Documento'}
        </button>
        <button className={`${s.actBtn} ${s.actDelete}`} onClick={onDelete}>
          <Ic.Trash /> Excluir
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// PurchaseOrdersPage
// ══════════════════════════════════════════════════════

export default function PurchaseOrdersPage() {
  const { purchaseOrders, loading }               = usePurchaseOrders()
  const { upsertPurchaseOrder, removePurchaseOrder } = useStore()

  const [search,    setSearch]    = useState('')
  const [statusSel, setStatusSel] = useState<PurchaseOrderStatus | ''>('')
  const [priSel,    setPriSel]    = useState<Priority | ''>('')

  const [editOrder,    setEditOrder]    = useState<PurchaseOrder | null>(null)
  const [showCreate,   setShowCreate]   = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null)
  const [deleting,     setDeleting]     = useState(false)
  const [activeDoc,      setActiveDoc]      = useState<OrderDocument | null>(null)
  const [generating,     setGenerating]     = useState<string | null>(null)
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null)
  const [lightboxIndex,  setLightboxIndex]  = useState(0)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return purchaseOrders.filter(o => {
      if (statusSel && o.status   !== statusSel) return false
      if (priSel    && o.priority !== priSel)    return false
      if (q && !o.title.toLowerCase().includes(q)
            && !(o.orderNumber  ?? '').toLowerCase().includes(q)
            && !(o.supplierId   ?? '').toLowerCase().includes(q)
            && !(o.sector       ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [purchaseOrders, search, statusSel, priSel])

  const stats = useMemo(() => ({
    total:    purchaseOrders.length,
    draft:    purchaseOrders.filter(o => o.status === 'draft').length,
    pending:  purchaseOrders.filter(o => o.status === 'pending').length,
    approved: purchaseOrders.filter(o => o.status === 'approved').length,
    ordered:  purchaseOrders.filter(o => o.status === 'ordered').length,
    received: purchaseOrders.filter(o => o.status === 'received').length,
  }), [purchaseOrders])

  const totalSpend = useMemo(
    () => purchaseOrders
      .filter(o => o.status === 'received')
      .reduce((sum, o) => sum + (o.totalValue ?? 0), 0),
    [purchaseOrders]
  )

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.quoteImages?.length) {
        await Promise.allSettled(deleteTarget.quoteImages.map(deleteStorageFile))
      }
      await deletePurchaseOrder(deleteTarget.id)
      removePurchaseOrder(deleteTarget.id)
      setDeleteTarget(null)
    } catch (e) {
      alert('Erro ao excluir: ' + String(e))
    } finally {
      setDeleting(false)
    }
  }

  function handleViewImages(order: PurchaseOrder) {
    if (order.quoteImages?.length) {
      setLightboxImages(order.quoteImages)
      setLightboxIndex(0)
    }
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

  function handleSaved(o: PurchaseOrder) { upsertPurchaseOrder(o) }

  if (loading) {
    return (
      <div className={s.page}>
        <div className={s.loadWrap}><Ic.Loader /> Carregando pedidos de compra…</div>
      </div>
    )
  }

  const STATS = [
    { label: 'Total',      value: stats.total,    color: '#64748b', icon: <Ic.Cart /> },
    { label: 'Rascunho',   value: stats.draft,    color: '#94a3b8', icon: <Ic.Draft /> },
    { label: 'Pendente',   value: stats.pending,  color: '#3b82f6', icon: <Ic.Clock /> },
    { label: 'Aprovado',   value: stats.approved, color: '#22c55e', icon: <Ic.CheckCircle /> },
    { label: 'Solicitado', value: stats.ordered,  color: '#f59e0b', icon: <Ic.Truck /> },
    { label: 'Recebido',   value: stats.received, color: '#10b981', icon: <Ic.Package /> },
  ]

  return (
    <div className={s.page}>

      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.pageTitleRow}>
            <div className={s.pageTitleIcon}><Ic.Cart /></div>
            <h2 className={s.pageTitle}>Pedidos de Compra</h2>
          </div>
          <span className={s.pageSubtitle}>Gestão de compras, fornecedores e controle de gastos</span>
        </div>
        <div className={s.headerActions}>
          <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>
            <Ic.Plus /> Novo Pedido
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className={s.statsGrid}>
        {STATS.map(st => (
          <div key={st.label} className={s.statCard}
            style={{ '--stat-color': st.color } as CSSProperties}>
            <div className={s.statIconWrap}>{st.icon}</div>
            <div>
              <div className={s.statNum}>{st.value}</div>
              <div className={s.statLabel}>{st.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Total gasto em destaque */}
      {totalSpend > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #7c2d12, #ea580c)',
          borderRadius: 14,
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#fff',
          boxShadow: '0 4px 16px rgba(234,88,12,0.3)',
        }}>
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.8 }}>
              Total Recebido (realizado)
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-1px', marginTop: 2 }}>
              {fmtCurrency(totalSpend)}
            </div>
          </div>
          <Ic.Banknote />
        </div>
      )}

      {/* Filters */}
      <div className={s.filterBar}>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}><Ic.Search /></span>
          <input className={s.searchInput}
            placeholder="Pesquisar por número, título, fornecedor, setor…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className={s.filterDivider} />
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
        <select className={s.filterSelect} value={priSel}
          onChange={e => setPriSel(e.target.value as Priority | '')}>
          <option value="">Todas as urgências</option>
          <option value="low">Baixa</option>
          <option value="normal">Normal</option>
          <option value="high">Alta</option>
          <option value="critical">Crítica</option>
        </select>
        <span className={s.resultBadge}>{filtered.length} PC</span>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}><Ic.Cart /></div>
          <h3 className={s.emptyTitle}>
            {search || statusSel || priSel
              ? 'Nenhum pedido com esses filtros'
              : 'Nenhum pedido de compra ainda'}
          </h3>
          <p className={s.emptyText}>
            {search || statusSel || priSel
              ? 'Tente ajustar os filtros de busca.'
              : 'Crie o primeiro pedido clicando em "+ Novo Pedido".'}
          </p>
          {!(search || statusSel || priSel) && (
            <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>
              <Ic.Plus /> Novo Pedido
            </button>
          )}
        </div>
      ) : (
        <div className={s.cardGrid}>
          {filtered.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              generating={generating}
              onEdit={() => setEditOrder(order)}
              onViewImages={() => handleViewImages(order)}
              onGenerate={() => handleGenerate(order)}
              onDelete={() => setDeleteTarget(order)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <OrderModal
          onClose={() => setShowCreate(false)}
          onSaved={o => { handleSaved(o); setShowCreate(false) }}
        />
      )}
      {editOrder && (
        <OrderModal
          order={editOrder}
          onClose={() => setEditOrder(null)}
          onSaved={o => { handleSaved(o); setEditOrder(null) }}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          order={deleteTarget}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}

      <DocumentViewer document={activeDoc} onClose={() => setActiveDoc(null)} />

      {lightboxImages && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxImages(null)}
        />
      )}
    </div>
  )
}

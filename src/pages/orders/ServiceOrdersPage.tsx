import { useState, useMemo, useRef, useCallback, useEffect, type CSSProperties } from 'react'
import { useServiceOrders }  from '@/hooks/useData'
import { useStore }          from '@/store/useStore'
import {
  createServiceOrder, updateServiceOrder, deleteServiceOrder,
  generateOrderNumber, createOrderDocument,
} from '@/lib/db'
import { generateServiceDocument } from '@/lib/document-generator'
import { storage }                 from '@/lib/firebase'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import DocumentViewer              from './DocumentViewer'
import type {
  ServiceOrder, ServiceOrderStatus, ServiceType, Priority, OrderDocument,
} from '@/types'
import {
  SERVICE_ORDER_STATUS_META, PRIORITY_META, SERVICE_TYPE_META,
} from '@/types'
import { fmtDate } from '@/lib/db'
import s from './ServiceOrdersPage.module.css'

// ── SVG Icons ──────────────────────────────────────────
const Ic = {
  FileText:    () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Plus:        () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Edit:        ({ size = 14 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Document:    ({ size = 14 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>,
  Trash:       ({ size = 14 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  Search:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  User:        () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Calendar:    () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Tag:         () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  MapPin:      () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  DollarSign:  () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  Image:       ({ size = 32 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>,
  Upload:      () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16,16 12,12 8,16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
  X:           ({ size = 10 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Close:       () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Wrench:      () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  Users:       () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Clock:       () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>,
  Banknote:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>,
  Notes:       () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>,
  ImageIcon:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>,
  FilePdf:     ({ size = 28 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="9" y1="13" x2="9" y2="17"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="15" y1="14" x2="15" y2="17"/></svg>,
  AlertTriangle: () => <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  ChevronLeft:  () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6"/></svg>,
  ChevronRight: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>,
  ExternalLink: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  Download:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Eye:          ({ size = 14 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Chart:       () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  CheckCircle: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>,
  Loader:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>,
}

// ── Service categories ─────────────────────────────────
const SERVICE_CATEGORIES = [
  '', 'Elétrico', 'Hidráulico', 'Mecânico', 'Civil / Predial',
  'Tecnologia da Informação', 'Climatização / HVAC',
  'Segurança Patrimonial', 'Pintura', 'Limpeza Industrial', 'Outros',
]

// ── Upload helper ──────────────────────────────────────
async function uploadImages(files: File[], orderId: string): Promise<string[]> {
  return Promise.all(files.map(async file => {
    const path = `os-attachments/${orderId}/${Date.now()}-${file.name}`
    const snap = await uploadBytes(storageRef(storage, path), file)
    return getDownloadURL(snap.ref)
  }))
}

// Extrai o path do Storage a partir de uma download URL do Firebase
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
interface OSFormState {
  title:           string
  description:     string
  serviceType:     ServiceType
  status:          ServiceOrderStatus
  priority:        Priority
  technician:      string
  requestedBy:     string
  assetId:         string
  sector:          string
  serviceCategory: string
  cost:            string
  estimatedCost:   string
  scheduledDate:   string
  completedDate:   string
  notes:           string
  existingImages:  string[]
  newImages:       File[]
}

const EMPTY_FORM: OSFormState = {
  title: '', description: '', serviceType: 'internal',
  status: 'open', priority: 'normal',
  technician: '', requestedBy: '', assetId: '',
  sector: '', serviceCategory: '',
  cost: '', estimatedCost: '',
  scheduledDate: '', completedDate: '', notes: '',
  existingImages: [], newImages: [],
}

function orderToForm(o: ServiceOrder): OSFormState {
  return {
    title:           o.title,
    description:     o.description,
    serviceType:     o.serviceType,
    status:          o.status,
    priority:        o.priority ?? 'normal',
    technician:      o.technician      ?? '',
    requestedBy:     o.requestedBy     ?? '',
    assetId:         o.assetId         ?? '',
    sector:          o.sector          ?? '',
    serviceCategory: o.serviceCategory ?? '',
    cost:            o.cost            != null ? String(o.cost) : '',
    estimatedCost:   o.estimatedCost   != null ? String(o.estimatedCost) : '',
    scheduledDate:   o.scheduledDate   ? new Date(o.scheduledDate).toISOString().slice(0, 10) : '',
    completedDate:   o.completedDate   ? new Date(o.completedDate).toISOString().slice(0, 10) : '',
    notes:           o.notes           ?? '',
    existingImages:  o.quoteImages     ?? [],
    newImages:       [],
  }
}

// ── Badges ─────────────────────────────────────────────

function StatusBadge({ status }: { status: ServiceOrderStatus }) {
  const m = SERVICE_ORDER_STATUS_META[status] ?? { label: status, color: '#94a3b8' }
  return (
    <span className={s.badge} style={{
      background: m.color + '1a', color: m.color, borderColor: m.color + '44',
    }}>
      {m.label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority?: Priority }) {
  if (!priority) return null
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
  existingImages: string[]
  newImages:      File[]
  onAddFiles:     (files: File[]) => void
  onRemoveExisting: (idx: number) => void
  onRemoveNew:    (idx: number) => void
}

function ImageUploadZone({ existingImages, newImages, onAddFiles, onRemoveExisting, onRemoveNew }: ImageZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
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

  const totalCount = existingImages.length + newImages.length

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
          {dragging ? 'Solte os arquivos aqui' : 'Arraste arquivos ou clique para selecionar'}
        </div>
        <div className={s.imageZoneSub}>JPG, PNG, PDF · Múltiplos arquivos aceitos</div>
        <button type="button" className={s.imageZoneBtn} onClick={e => { e.stopPropagation(); inputRef.current?.click() }}>
          Escolher Arquivos
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          style={{ display: 'none' }}
          onChange={handleChange}
        />
      </div>

      {totalCount > 0 && (
        <div className={s.imagePreviewGrid}>
          {existingImages.map((url, i) => (
            <div key={`ex-${i}`} className={s.imageThumb}>
              {isPdf(url) ? (
                <div className={s.imageThumbPdf}>
                  <Ic.FilePdf />
                  <span className={s.imageThumbPdfName}>PDF</span>
                </div>
              ) : (
                <img src={url} alt={`Orçamento ${i + 1}`} className={s.imageThumbImg} />
              )}
              <button
                type="button"
                className={s.imageRemoveBtn}
                onClick={() => onRemoveExisting(i)}
                title="Remover"
              >
                <Ic.X />
              </button>
            </div>
          ))}
          {newImages.map((file, i) => (
            <div key={`new-${i}`} className={s.imageThumb}>
              {file.type === 'application/pdf' ? (
                <div className={s.imageThumbPdf}>
                  <Ic.FilePdf />
                  <span className={s.imageThumbPdfName}>{file.name}</span>
                </div>
              ) : (
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className={s.imageThumbImg}
                />
              )}
              <button
                type="button"
                className={s.imageRemoveBtn}
                onClick={() => onRemoveNew(i)}
                title="Remover"
              >
                <Ic.X />
              </button>
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

        {/* Cabeçalho */}
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

        {/* Visualizador */}
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
              <img src={url} alt={`Imagem ${current + 1}`} className={s.lightboxImg} />
            )}
          </div>
          {images.length > 1 && (
            <button className={`${s.lightboxNav} ${s.lightboxNavNext}`} onClick={next}>
              <Ic.ChevronRight />
            </button>
          )}
        </div>

        {/* Miniaturas */}
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

// ── Form Section wrapper ───────────────────────────────

function FormSection({
  icon, title, color, children,
}: { icon: React.ReactNode; title: string; color: string; children: React.ReactNode }) {
  return (
    <div className={s.formSection}>
      <div className={s.sectionHeader}>
        <div className={s.sectionIcon} style={{ background: color + '18', color }}>
          {icon}
        </div>
        <span className={s.sectionTitle}>{title}</span>
      </div>
      {children}
    </div>
  )
}

// ── Order Modal (Create / Edit) ────────────────────────

interface OrderModalProps {
  order?:  ServiceOrder
  onClose: () => void
  onSaved: (o: ServiceOrder) => void
}

function OrderModal({ order, onClose, onSaved }: OrderModalProps) {
  const isEdit = !!order
  const [form, setForm] = useState<OSFormState>(order ? orderToForm(order) : EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')

  function setField<K extends keyof OSFormState>(k: K, v: OSFormState[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  const addFiles = useCallback((files: File[]) => {
    setForm(prev => ({ ...prev, newImages: [...prev.newImages, ...files] }))
  }, [])

  const removeExisting = useCallback((idx: number) => {
    setForm(prev => ({ ...prev, existingImages: prev.existingImages.filter((_, i) => i !== idx) }))
  }, [])

  const removeNew = useCallback((idx: number) => {
    setForm(prev => ({ ...prev, newImages: prev.newImages.filter((_, i) => i !== idx) }))
  }, [])

  async function handleSave() {
    if (!form.title.trim())       { alert('Título é obrigatório.'); return }
    if (!form.description.trim()) { alert('Descrição é obrigatória.'); return }

    setSaving(true)
    try {
      const base: Omit<ServiceOrder, 'id' | 'createdAt' | 'updatedAt'> = {
        title:           form.title.trim(),
        description:     form.description.trim(),
        serviceType:     form.serviceType,
        status:          form.status,
        priority:        form.priority,
        technician:      form.technician.trim()      || undefined,
        requestedBy:     form.requestedBy.trim()     || undefined,
        assetId:         form.assetId.trim()         || undefined,
        sector:          form.sector.trim()          || undefined,
        serviceCategory: form.serviceCategory        || undefined,
        cost:            form.cost          ? Number(form.cost)          : undefined,
        estimatedCost:   form.estimatedCost ? Number(form.estimatedCost) : undefined,
        scheduledDate:   form.scheduledDate ? new Date(form.scheduledDate) : undefined,
        completedDate:   form.completedDate ? new Date(form.completedDate) : undefined,
        notes:           form.notes.trim()           || undefined,
        quoteImages:     form.existingImages,
      }

      if (isEdit && order) {
        let quoteImages = form.existingImages
        if (form.newImages.length > 0) {
          setUploadProgress('Enviando imagens…')
          const uploaded = await uploadImages(form.newImages, order.id)
          quoteImages = [...quoteImages, ...uploaded]
        }
        await updateServiceOrder(order.id, { ...base, quoteImages })
        onSaved({ ...order, ...base, quoteImages })
      } else {
        const orderNumber = await generateOrderNumber('OS')
        const id = await createServiceOrder({ ...base, orderNumber })
        let quoteImages: string[] = []
        if (form.newImages.length > 0) {
          setUploadProgress('Enviando imagens…')
          quoteImages = await uploadImages(form.newImages, id)
          await updateServiceOrder(id, { quoteImages })
        }
        onSaved({ id, ...base, orderNumber, quoteImages })
      }
      onClose()
    } catch (e) {
      alert('Erro ao salvar: ' + String(e))
    } finally {
      setSaving(false)
      setUploadProgress('')
    }
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        {/* Header */}
        <div className={s.modalHeader}>
          <div className={s.modalHeaderLeft}>
            <div className={s.modalIcon}><Ic.FileText /></div>
            <div>
              <div className={s.modalLabel}>{isEdit ? 'Editar' : 'Nova'} Ordem de Serviço</div>
              <div className={s.modalTitle}>{form.title || '—'}</div>
            </div>
          </div>
          <button className={s.modalCloseBtn} onClick={onClose}><Ic.Close /></button>
        </div>

        {/* Body */}
        <div className={s.modalBody}>

          {/* 1. Identificação */}
          <FormSection icon={<Ic.FileText />} title="Identificação" color="#166534">
            <div className={s.formGrid}>
              <div className={`${s.formGroup} ${s.formGroupFull}`}>
                <label className={s.label}>Título <span className={s.req}>*</span></label>
                <input className={s.input} placeholder="Ex.: Substituição de compressor — Câmara Fria 02"
                  value={form.title}
                  onChange={e => setField('title', e.target.value)} />
              </div>
              <div className={`${s.formGroup} ${s.formGroupFull}`}>
                <label className={s.label}>Descrição <span className={s.req}>*</span></label>
                <textarea className={s.textarea} rows={3}
                  placeholder="Descreva o problema, o serviço necessário e contexto relevante…"
                  value={form.description}
                  onChange={e => setField('description', e.target.value)} />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Tipo de Serviço</label>
                <select className={s.select} value={form.serviceType}
                  onChange={e => setField('serviceType', e.target.value as ServiceType)}>
                  <option value="internal">Interno</option>
                  <option value="external">Externo (Terceirizado)</option>
                </select>
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Categoria do Serviço</label>
                <select className={s.select} value={form.serviceCategory}
                  onChange={e => setField('serviceCategory', e.target.value)}>
                  {SERVICE_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c || '— Selecionar —'}</option>
                  ))}
                </select>
              </div>
            </div>
          </FormSection>

          {/* 2. Atribuição */}
          <FormSection icon={<Ic.Users />} title="Atribuição & Localização" color="#3b82f6">
            <div className={s.formGrid}>
              <div className={s.formGroup}>
                <label className={s.label}>Técnico Responsável</label>
                <input className={s.input} placeholder="Nome do técnico"
                  value={form.technician}
                  onChange={e => setField('technician', e.target.value)} />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Solicitante</label>
                <input className={s.input} placeholder="Nome de quem abriu a OS"
                  value={form.requestedBy}
                  onChange={e => setField('requestedBy', e.target.value)} />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Setor / Localização</label>
                <input className={s.input} placeholder="Ex.: Expedição, Câmara Fria, Escritório…"
                  value={form.sector}
                  onChange={e => setField('sector', e.target.value)} />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Ativo (Código)</label>
                <input className={s.input} placeholder="Ex.: EQ-0042, TI-0012"
                  value={form.assetId}
                  onChange={e => setField('assetId', e.target.value)} />
              </div>
            </div>
          </FormSection>

          {/* 3. Planejamento */}
          <FormSection icon={<Ic.Clock />} title="Planejamento & Status" color="#f59e0b">
            <div className={s.formGrid}>
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
                <label className={s.label}>Data Prevista</label>
                <input type="date" className={s.input}
                  value={form.scheduledDate}
                  onChange={e => setField('scheduledDate', e.target.value)} />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Data de Conclusão</label>
                <input type="date" className={s.input}
                  value={form.completedDate}
                  onChange={e => setField('completedDate', e.target.value)} />
              </div>
            </div>
          </FormSection>

          {/* 4. Financeiro */}
          <FormSection icon={<Ic.Banknote />} title="Financeiro" color="#16A34A">
            <div className={s.formGrid}>
              <div className={s.formGroup}>
                <label className={s.label}>Custo Estimado (R$)</label>
                <input type="number" step="0.01" min="0" className={s.input} placeholder="0,00"
                  value={form.estimatedCost}
                  onChange={e => setField('estimatedCost', e.target.value)} />
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>Custo Real (R$)</label>
                <input type="number" step="0.01" min="0" className={s.input} placeholder="0,00"
                  value={form.cost}
                  onChange={e => setField('cost', e.target.value)} />
              </div>
            </div>
          </FormSection>

          {/* 5. Documentação & Imagens */}
          <FormSection icon={<Ic.ImageIcon />} title="Documentação & Orçamentos em Imagem" color="#7C3AED">
            <div className={s.formGroup}>
              <label className={s.label}>Observações</label>
              <textarea className={s.textarea} rows={2}
                placeholder="Notas adicionais, instruções especiais, histórico relevante…"
                value={form.notes}
                onChange={e => setField('notes', e.target.value)} />
            </div>
            <div>
              <label className={s.label} style={{ marginBottom: 8, display: 'block' }}>
                Imagens de Orçamento / Referência
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

        {/* Footer */}
        <div className={s.modalFooter}>
          {uploadProgress && (
            <span style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 600, marginRight: 'auto' }}>
              {uploadProgress}
            </span>
          )}
          <button className={s.btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={s.btnPrimary} disabled={saving} onClick={handleSave}>
            {saving ? <><Ic.Loader /> Salvando…</> : isEdit ? 'Salvar Alterações' : 'Criar Ordem'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete Modal ───────────────────────────────────────

function DeleteModal({
  order, onConfirm, onCancel, deleting,
}: { order: ServiceOrder; onConfirm: () => void; onCancel: () => void; deleting: boolean }) {
  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={s.deleteModal}>
        <div className={s.deleteIconWrap}><Ic.AlertTriangle /></div>
        <h3 className={s.deleteTitle}>Excluir Ordem de Serviço</h3>
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

interface CardProps {
  order:         ServiceOrder
  generating:    string | null
  onEdit:        () => void
  onViewImages:  () => void
  onGenerate:    () => void
  onDelete:      () => void
}

function OrderCard({ order, generating, onEdit, onViewImages, onGenerate, onDelete }: CardProps) {
  const priorityColor = order.priority ? PRIORITY_META[order.priority]?.color : '#94a3b8'
  const typeMeta = SERVICE_TYPE_META[order.serviceType]

  const fmtCost = (v?: number) =>
    v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null

  return (
    <div className={s.card}>
      <div className={s.cardAccent} style={{ '--priority-color': priorityColor } as CSSProperties} />

      <div className={s.cardHead}>
        <span className={s.cardNum}>{order.orderNumber ?? '—'}</span>
        <div className={s.cardBadges}>
          <PriorityBadge priority={order.priority} />
          <StatusBadge status={order.status} />
        </div>
      </div>

      <div className={s.cardBody}>
        <div className={s.cardTitle}>{order.title}</div>
        <div className={s.cardDesc}>{order.description}</div>

        <div className={s.cardMeta}>
          {order.technician && (
            <div className={s.metaItem}>
              <span className={s.metaIcon}><Ic.User /></span>
              <span className={s.metaText}>{order.technician}</span>
            </div>
          )}
          {order.sector && (
            <div className={s.metaItem}>
              <span className={s.metaIcon}><Ic.MapPin /></span>
              <span className={s.metaText}>{order.sector}</span>
            </div>
          )}
          {order.scheduledDate && (
            <div className={s.metaItem}>
              <span className={s.metaIcon}><Ic.Calendar /></span>
              <span className={s.metaText}>{fmtDate(order.scheduledDate as Parameters<typeof fmtDate>[0])}</span>
            </div>
          )}
          {(order.cost != null || order.estimatedCost != null) && (
            <div className={s.metaItem}>
              <span className={s.metaIcon}><Ic.DollarSign /></span>
              <span className={s.metaText}>
                {fmtCost(order.cost) ?? fmtCost(order.estimatedCost) ?? '—'}
              </span>
            </div>
          )}
          {typeMeta && (
            <div className={s.metaItem}>
              <span className={s.metaIcon}><Ic.Tag /></span>
              <span className={s.metaText}>{typeMeta.label}
                {order.serviceCategory ? ` · ${order.serviceCategory}` : ''}
              </span>
            </div>
          )}
          {order.requestedBy && (
            <div className={s.metaItem}>
              <span className={s.metaIcon}><Ic.Users /></span>
              <span className={s.metaText}>Solicitante: {order.requestedBy}</span>
            </div>
          )}
        </div>

        {(order.quoteImages?.length ?? 0) > 0 && (
          <button className={s.cardImageCountBtn} onClick={onViewImages} title="Ver imagens anexadas">
            <Ic.ImageIcon />
            {order.quoteImages!.length} imagem{order.quoteImages!.length !== 1 ? 'ns' : ''} anexada{order.quoteImages!.length !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      <div className={s.cardDivider} />

      <div className={s.cardActions}>
        <button className={s.actBtn + ' ' + s.actEdit} onClick={onEdit}>
          <Ic.Edit /> Editar
        </button>
        {(order.quoteImages?.length ?? 0) > 0 && (
          <button className={s.actBtn + ' ' + s.actPhotos} onClick={onViewImages}>
            <Ic.Eye /> Fotos
          </button>
        )}
        <button
          className={s.actBtn + ' ' + s.actDoc}
          disabled={generating === order.id}
          onClick={onGenerate}
        >
          <Ic.Document /> {generating === order.id ? '…' : 'Documento'}
        </button>
        <button className={s.actBtn + ' ' + s.actDelete} onClick={onDelete}>
          <Ic.Trash /> Excluir
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// ServiceOrdersPage
// ══════════════════════════════════════════════════════

export default function ServiceOrdersPage() {
  const { serviceOrders, loading }            = useServiceOrders()
  const { upsertServiceOrder, removeServiceOrder } = useStore()

  const [search,    setSearch]    = useState('')
  const [statusSel, setStatusSel] = useState<ServiceOrderStatus | ''>('')
  const [typeSel,   setTypeSel]   = useState<ServiceType | ''>('')
  const [priSel,    setPriSel]    = useState<Priority | ''>('')

  const [editOrder,   setEditOrder]   = useState<ServiceOrder | null>(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ServiceOrder | null>(null)
  const [deleting,    setDeleting]    = useState(false)
  const [activeDoc,      setActiveDoc]      = useState<OrderDocument | null>(null)
  const [generating,     setGenerating]     = useState<string | null>(null)
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null)
  const [lightboxIndex,  setLightboxIndex]  = useState(0)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return serviceOrders.filter(o => {
      if (statusSel && o.status !== statusSel)     return false
      if (typeSel   && o.serviceType !== typeSel)  return false
      if (priSel    && o.priority !== priSel)      return false
      if (q && !o.title.toLowerCase().includes(q)
            && !(o.technician ?? '').toLowerCase().includes(q)
            && !(o.orderNumber ?? '').toLowerCase().includes(q)
            && !(o.sector ?? '').toLowerCase().includes(q)) return false
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

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.quoteImages?.length) {
        await Promise.allSettled(deleteTarget.quoteImages.map(deleteStorageFile))
      }
      await deleteServiceOrder(deleteTarget.id)
      removeServiceOrder(deleteTarget.id)
      setDeleteTarget(null)
    } catch (e) {
      alert('Erro ao excluir: ' + String(e))
    } finally {
      setDeleting(false)
    }
  }

  function handleViewImages(order: ServiceOrder) {
    if (order.quoteImages?.length) {
      setLightboxImages(order.quoteImages)
      setLightboxIndex(0)
    }
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

  function handleSaved(o: ServiceOrder) { upsertServiceOrder(o) }

  if (loading) {
    return (
      <div className={s.page}>
        <div className={s.loadWrap}>
          <Ic.Loader /> Carregando ordens de serviço…
        </div>
      </div>
    )
  }

  const STATS = [
    { label: 'Total',        value: stats.total,       color: '#64748b', icon: <Ic.Chart /> },
    { label: 'Abertas',      value: stats.open,        color: '#3b82f6', icon: <Ic.FileText /> },
    { label: 'Em Andamento', value: stats.in_progress, color: '#f59e0b', icon: <Ic.Wrench /> },
    { label: 'Concluídas',   value: stats.completed,   color: '#22c55e', icon: <Ic.CheckCircle /> },
    { label: 'Canceladas',   value: stats.cancelled,   color: '#94a3b8', icon: <Ic.X size={18} /> },
  ]

  return (
    <div className={s.page}>

      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.pageTitleRow}>
            <div className={s.pageTitleIcon}><Ic.FileText /></div>
            <h2 className={s.pageTitle}>Ordens de Serviço</h2>
          </div>
          <span className={s.pageSubtitle}>Gestão completa de ordens, chamados e manutenções</span>
        </div>
        <div className={s.headerActions}>
          <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>
            <Ic.Plus /> Nova OS
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className={s.statsGrid}>
        {STATS.map(st => (
          <div
            key={st.label}
            className={s.statCard}
            style={{ '--stat-color': st.color } as CSSProperties}
          >
            <div className={s.statIconWrap}>{st.icon}</div>
            <div>
              <div className={s.statNum}>{st.value}</div>
              <div className={s.statLabel}>{st.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={s.filterBar}>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}><Ic.Search /></span>
          <input
            className={s.searchInput}
            placeholder="Pesquisar por número, título, técnico, setor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className={s.filterDivider} />
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
        <span className={s.resultBadge}>{filtered.length} OS</span>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}><Ic.FileText /></div>
          <h3 className={s.emptyTitle}>
            {search || statusSel || typeSel || priSel
              ? 'Nenhuma ordem encontrada com esses filtros'
              : 'Nenhuma ordem de serviço ainda'}
          </h3>
          <p className={s.emptyText}>
            {search || statusSel || typeSel || priSel
              ? 'Tente ajustar os filtros de busca.'
              : 'Crie a primeira OS clicando em "+ Nova OS".'}
          </p>
          {!(search || statusSel || typeSel || priSel) && (
            <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>
              <Ic.Plus /> Nova OS
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

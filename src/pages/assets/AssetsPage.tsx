import { useState, useMemo, type CSSProperties } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useAssets, useCategories } from '@/hooks/useData'
import { useStore, selectCategoryMap } from '@/store/useStore'
import { createMaintenance } from '@/lib/db'
import type { Asset, AssetStatus, Category, MaintenanceType } from '@/types'
import s from './AssetsPage.module.css'

// ── SVG icons ──────────────────────────────────────────
const Ic = {
  Plus:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Search:  () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Cog:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Wrench:  () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  Eye:     () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  MapPin:  () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  User:    () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Money:   () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  Tag:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  TagLg:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  X:       () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Close:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Layers:  () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12,2 2,7 12,12 22,7"/><polyline points="2,17 12,22 22,17"/><polyline points="2,12 12,17 22,12"/></svg>,
  ChevronRight: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>,
}

// ── Status meta ────────────────────────────────────────
const STATUS_META: Record<AssetStatus, { label: string; color: string; bg: string; short: string }> = {
  ativo:      { label: 'Ativo',         short: 'Ativos',   color: '#16A34A', bg: 'rgba(22,163,74,0.1)'   },
  manutencao: { label: 'Em Manutenção', short: 'Manut.',   color: '#F59E0B', bg: 'rgba(245,158,11,0.1)'  },
  avariado:   { label: 'Avariado',      short: 'Avariad.', color: '#DC2626', bg: 'rgba(220,38,38,0.1)'   },
  inativo:    { label: 'Inativo',       short: 'Inativos', color: '#64748B', bg: 'rgba(100,116,139,0.1)' },
}

const STATUS_ORDER: AssetStatus[] = ['ativo', 'manutencao', 'avariado', 'inativo']

function fmtCurrency(v?: number | null) {
  if (v == null) return null
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ── Category stat type ─────────────────────────────────
interface CatStat {
  total:      number
  ativo:      number
  manutencao: number
  avariado:   number
  inativo:    number
}

// ── Quick maintenance modal ────────────────────────────
function QuickMaintModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const categoryMap = useStore(selectCategoryMap)
  const category    = categoryMap[asset.categoryId]
  const [type,   setType]   = useState<MaintenanceType>(category?.maintenanceConfig?.defaultType ?? 'preventiva')
  const [desc,   setDesc]   = useState('')
  const [tech,   setTech]   = useState('')
  const [status, setStatus] = useState<'pendente' | 'andamento'>('pendente')
  const [date,   setDate]   = useState('')
  const [saving, setSaving] = useState(false)
  const allowedTypes = category?.maintenanceTypes ?? ['preventiva', 'corretiva', 'inspecao']
  const TYPE_LABELS: Record<string, string> = {
    preventiva: 'Preventiva', corretiva: 'Corretiva',
    inspecao: 'Inspeção', software: 'Software', hardware: 'Hardware',
  }

  async function handleSave() {
    if (!desc.trim()) { alert('Descrição é obrigatória.'); return }
    setSaving(true)
    try {
      await createMaintenance({
        assetId: asset.id, categoryId: asset.categoryId, type, status,
        description: desc.trim(), technician: tech.trim() || undefined,
        scheduledDate: date ? new Date(date) : undefined,
      })
      onClose()
    } catch (e) { alert('Erro ao salvar: ' + String(e)) }
    finally { setSaving(false) }
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <div className={s.modalHeaderLeft}>
            <div className={s.modalIcon}><Ic.Wrench /></div>
            <div>
              <div className={s.modalLabel}>Registrar Manutenção</div>
              <div className={s.modalTitle}>{asset.name}</div>
            </div>
          </div>
          <button className={s.modalCloseBtn} onClick={onClose}><Ic.Close /></button>
        </div>
        <div className={s.modalBody}>
          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Tipo <span className={s.req}>*</span></label>
              <select className={s.select} value={type} onChange={e => setType(e.target.value as MaintenanceType)}>
                {allowedTypes.map(t => <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>)}
              </select>
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Status Inicial</label>
              <select className={s.select} value={status} onChange={e => setStatus(e.target.value as typeof status)}>
                <option value="pendente">Pendente</option>
                <option value="andamento">Em Andamento</option>
              </select>
            </div>
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Descrição <span className={s.req}>*</span></label>
            <textarea className={s.textarea} rows={3} placeholder="Descreva o serviço ou problema…"
              value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Data Prevista</label>
              <input type="date" className={s.input} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Técnico</label>
              <input className={s.input} placeholder="Nome do técnico"
                value={tech} onChange={e => setTech(e.target.value)} />
            </div>
          </div>
          {category?.maintenanceConfig?.notes && (
            <div className={s.hint}>💡 {category.maintenanceConfig.notes}</div>
          )}
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={s.btnPrimary} disabled={saving} onClick={handleSave}>
            {saving ? 'Salvando…' : 'Registrar Manutenção'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sidebar ────────────────────────────────────────────
interface SidebarProps {
  categories:    Category[]
  catSel:        string
  assets:        Asset[]
  catStats:      Record<string, CatStat>
  onSelect:      (id: string) => void
}

function Sidebar({ categories, catSel, assets, catStats, onSelect }: SidebarProps) {
  const totalStats: CatStat = useMemo(() => ({
    total:      assets.length,
    ativo:      assets.filter(a => a.status === 'ativo').length,
    manutencao: assets.filter(a => a.status === 'manutencao').length,
    avariado:   assets.filter(a => a.status === 'avariado').length,
    inativo:    assets.filter(a => a.status === 'inativo').length,
  }), [assets])

  return (
    <aside className={s.sidebar}>
      {/* Sidebar header */}
      <div className={s.sidebarHeader}>
        <span className={s.sidebarHeaderIcon}><Ic.Layers /></span>
        <span className={s.sidebarHeaderLabel}>Categorias</span>
      </div>

      {/* Todos */}
      <button
        className={`${s.catItem} ${catSel === '' ? s.catItemActive : ''}`}
        onClick={() => onSelect('')}
      >
        <div className={s.catItemTop}>
          <span className={s.catEmoji}>🏷️</span>
          <span className={s.catName}>Todos os Ativos</span>
          <span className={s.catCount}>{assets.length}</span>
        </div>
        {catSel === '' && totalStats.total > 0 && (
          <StatusBar stat={totalStats} />
        )}
      </button>

      {/* Divider */}
      {categories.length > 0 && <div className={s.sidebarDivider} />}

      {/* Per category */}
      {categories.map(cat => {
        const st  = catStats[cat.id] ?? { total: 0, ativo: 0, manutencao: 0, avariado: 0, inativo: 0 }
        const isActive = catSel === cat.id
        return (
          <button
            key={cat.id}
            className={`${s.catItem} ${isActive ? s.catItemActive : ''} ${st.total === 0 ? s.catItemEmpty : ''}`}
            onClick={() => onSelect(isActive ? '' : cat.id)}
            style={isActive && cat.color ? { '--cat-color': cat.color } as CSSProperties : undefined}
          >
            <div className={s.catItemTop}>
              <span className={s.catEmoji}>{cat.icon}</span>
              <span className={s.catName}>{cat.name}</span>
              <span className={s.catCount} style={st.total === 0 ? { opacity: 0.35 } : undefined}>
                {st.total}
              </span>
            </div>
            {st.total > 0 && <StatusBar stat={st} />}
            {st.avariado > 0 && (
              <div className={s.catAlertRow}>
                <span className={s.catAlertDot} />
                {st.avariado} avariado{st.avariado !== 1 ? 's' : ''}
              </div>
            )}
          </button>
        )
      })}

      {/* Footer link */}
      <div className={s.sidebarFooter}>
        <Link to="/ativos/categorias" className={s.sidebarFooterLink}>
          <Ic.Cog /> Gerenciar categorias
        </Link>
      </div>
    </aside>
  )
}

// ── Status bar (mini progress bar) ────────────────────
function StatusBar({ stat }: { stat: CatStat }) {
  if (stat.total === 0) return null
  return (
    <div className={s.statusBar}>
      {STATUS_ORDER.map(st => {
        const count = stat[st]
        if (!count) return null
        const pct = Math.round((count / stat.total) * 100)
        return (
          <div
            key={st}
            className={s.statusBarSeg}
            style={{ width: `${pct}%`, background: STATUS_META[st].color }}
            title={`${STATUS_META[st].short}: ${count}`}
          />
        )
      })}
    </div>
  )
}

// ── Asset Card ─────────────────────────────────────────
function AssetCard({ asset, onMaint }: { asset: Asset; onMaint: () => void }) {
  const navigate    = useNavigate()
  const categoryMap = useStore(selectCategoryMap)
  const cat         = categoryMap[asset.categoryId]
  const sm          = STATUS_META[asset.status] ?? STATUS_META.inativo

  return (
    <div
      className={s.assetCard}
      style={{ '--status-color': sm.color } as CSSProperties}
      onClick={() => navigate(`/ativos/${asset.id}`)}
    >
      <div className={s.cardAccent} />

      <div className={s.cardHead}>
        <div className={s.cardCatBox}>{cat?.icon ?? '🏷️'}</div>
        <span className={s.cardStatus} style={{ background: sm.bg, color: sm.color }}>
          {sm.label}
        </span>
      </div>

      <div className={s.cardIdentity}>
        <span className={s.cardCode}>{asset.code}</span>
        <div className={s.cardName}>{asset.name}</div>
        {cat && <span className={s.cardCat}>{cat.name}</span>}
      </div>

      <div className={s.cardMeta}>
        {asset.location && (
          <div className={s.cardMetaRow}>
            <span className={s.cardMetaIcon}><Ic.MapPin /></span>
            <span className={s.cardMetaText}>{asset.location}</span>
          </div>
        )}
        {asset.responsible && (
          <div className={s.cardMetaRow}>
            <span className={s.cardMetaIcon}><Ic.User /></span>
            <span className={s.cardMetaText}>{asset.responsible}</span>
          </div>
        )}
        {asset.value != null && (
          <div className={s.cardMetaRow}>
            <span className={s.cardMetaIcon}><Ic.Money /></span>
            <span className={s.cardMetaText}>{fmtCurrency(asset.value)}</span>
          </div>
        )}
        {asset.notes && (
          <div className={s.cardNotes}>{asset.notes}</div>
        )}
      </div>

      <div className={s.cardDivider} />

      <div className={s.cardActions} onClick={e => e.stopPropagation()}>
        <button className={s.cardBtnMaint} onClick={onMaint}>
          <Ic.Wrench /> Manutenção
        </button>
        <button className={s.cardBtnView} onClick={() => navigate(`/ativos/${asset.id}`)}>
          <Ic.Eye /> Perfil
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// AssetsPage
// ══════════════════════════════════════════════════════

export default function AssetsPage() {
  const navigate         = useNavigate()
  const [params]         = useSearchParams()
  const catFilter        = params.get('cat') ?? ''

  const { assets, loading } = useAssets({ categoryId: catFilter || undefined })
  const { categories }      = useCategories()
  const { removeAsset }     = useStore()

  void navigate
  void removeAsset

  const [search,    setSearch]    = useState('')
  const [catSel,    setCatSel]    = useState(catFilter)
  const [statusSel, setStatusSel] = useState<AssetStatus | ''>('')
  const [sortBy,    setSortBy]    = useState<'name' | 'code' | 'status'>('name')
  const [maintAsset, setMaintAsset] = useState<Asset | null>(null)

  // Category stats for sidebar
  const catStats = useMemo<Record<string, CatStat>>(() => {
    const map: Record<string, CatStat> = {}
    for (const cat of categories) {
      const catAssets = assets.filter(a => a.categoryId === cat.id)
      map[cat.id] = {
        total:      catAssets.length,
        ativo:      catAssets.filter(a => a.status === 'ativo').length,
        manutencao: catAssets.filter(a => a.status === 'manutencao').length,
        avariado:   catAssets.filter(a => a.status === 'avariado').length,
        inativo:    catAssets.filter(a => a.status === 'inativo').length,
      }
    }
    return map
  }, [assets, categories])

  // Filtered + sorted list
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let list = assets.filter(a => {
      if (catSel    && a.categoryId !== catSel)  return false
      if (statusSel && a.status !== statusSel)   return false
      if (q && !a.name.toLowerCase().includes(q)
            && !a.code.toLowerCase().includes(q)
            && !(a.responsible ?? '').toLowerCase().includes(q)
            && !(a.location ?? '').toLowerCase().includes(q)) return false
      return true
    })
    list = [...list].sort((a, b) => {
      if (sortBy === 'code')   return a.code.localeCompare(b.code)
      if (sortBy === 'status') return a.status.localeCompare(b.status)
      return a.name.localeCompare(b.name)
    })
    return list
  }, [assets, search, catSel, statusSel, sortBy])

  // Global stats (for top bar)
  const stats = useMemo(() => ({
    total:    assets.length,
    ativo:    assets.filter(a => a.status === 'ativo').length,
    mant:     assets.filter(a => a.status === 'manutencao').length,
    avariado: assets.filter(a => a.status === 'avariado').length,
    inativo:  assets.filter(a => a.status === 'inativo').length,
  }), [assets])

  const hasFilters = !!(search || statusSel)

  if (loading) {
    return (
      <div className={s.page}>
        <div className={s.loadWrap}>Carregando ativos…</div>
      </div>
    )
  }

  const STATS = [
    { label: 'Total',      value: stats.total,    color: '#166534', status: '' as const },
    { label: 'Ativos',     value: stats.ativo,    color: '#16A34A', status: 'ativo' as AssetStatus },
    { label: 'Manutenção', value: stats.mant,     color: '#F59E0B', status: 'manutencao' as AssetStatus },
    { label: 'Avariados',  value: stats.avariado, color: '#DC2626', status: 'avariado' as AssetStatus },
    { label: 'Inativos',   value: stats.inativo,  color: '#64748B', status: 'inativo' as AssetStatus },
  ]

  return (
    <div className={s.page}>

      {/* ── Full-width header ── */}
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Ativos Patrimoniais</h1>
          <p className={s.pageSubtitle}>{assets.length} itens cadastrados</p>
        </div>
        <div className={s.headerActions}>
          <Link to="/ativos/novo" className={s.btnPrimary}>
            <Ic.Plus /> Novo Ativo
          </Link>
        </div>
      </div>

      {/* ── Body: sidebar + main ── */}
      <div className={s.pageBody}>

        {/* ── Sidebar ── */}
        <Sidebar
          categories={categories}
          catSel={catSel}
          assets={assets}
          catStats={catStats}
          onSelect={setCatSel}
        />

        {/* ── Main content ── */}
        <div className={s.mainContent}>

          {/* Stats */}
          <div className={s.statsRow}>
            {STATS.map(sc => (
              <div
                key={sc.label}
                className={`${s.statCard} ${sc.status ? s.clickable : ''} ${statusSel === sc.status && sc.status ? s.statActive : ''}`}
                style={{ '--stat-color': sc.color } as CSSProperties}
                onClick={() => sc.status && setStatusSel(statusSel === sc.status ? '' : sc.status as AssetStatus)}
              >
                <div className={s.statBar} />
                <div className={s.statBody}>
                  <div className={s.statValue}>{sc.value}</div>
                  <div className={s.statLabel}>{sc.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className={s.filtersBar}>
            <div className={s.searchWrap}>
              <span className={s.searchIcon}><Ic.Search /></span>
              <input
                className={s.searchInput}
                placeholder="Buscar por código, nome, responsável ou localização…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <select className={s.filterSelect} value={statusSel}
              onChange={e => setStatusSel(e.target.value as AssetStatus | '')}>
              <option value="">Todos os status</option>
              <option value="ativo">Ativo</option>
              <option value="manutencao">Em Manutenção</option>
              <option value="avariado">Avariado</option>
              <option value="inativo">Inativo</option>
            </select>

            <select className={s.filterSelect} value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}>
              <option value="name">Ordenar: Nome</option>
              <option value="code">Ordenar: Código</option>
              <option value="status">Ordenar: Status</option>
            </select>

            <div className={s.filterDivider} />

            <span className={s.resultCount}>
              {filtered.length} de {assets.length}
            </span>

            {(hasFilters || catSel) && (
              <button className={s.clearBtn}
                onClick={() => { setSearch(''); setCatSel(''); setStatusSel('') }}>
                <Ic.X /> Limpar
              </button>
            )}
          </div>

          {/* ── Category breadcrumb when filtered ── */}
          {catSel && (() => {
            const cat = categories.find(c => c.id === catSel)
            const st  = catStats[catSel]
            if (!cat) return null
            return (
              <div className={s.catBreadcrumb}>
                <span className={s.catBreadcrumbIcon}>{cat.icon}</span>
                <span className={s.catBreadcrumbName}>{cat.name}</span>
                <span className={s.catBreadcrumbCount}>{st?.total ?? 0} ativos</span>
                {st && st.avariado > 0 && (
                  <span className={s.catBreadcrumbAlert}>
                    ⚠ {st.avariado} avariado{st.avariado !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )
          })()}

          {/* Cards grid */}
          {filtered.length === 0 ? (
            <div className={s.empty}>
              <div className={s.emptyIcon}><Ic.TagLg /></div>
              <h3 className={s.emptyTitle}>
                {hasFilters || catSel ? 'Nenhum ativo encontrado' : 'Nenhum ativo cadastrado'}
              </h3>
              <p className={s.emptyDesc}>
                {hasFilters || catSel
                  ? 'Ajuste os filtros ou selecione outra categoria.'
                  : 'Cadastre o primeiro ativo patrimonial.'}
              </p>
              {!(hasFilters || catSel) && (
                <Link to="/ativos/novo" className={s.btnPrimary}>
                  <Ic.Plus /> Novo Ativo
                </Link>
              )}
            </div>
          ) : (
            <div className={s.cardGrid}>
              {filtered.map(asset => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onMaint={() => setMaintAsset(asset)}
                />
              ))}
            </div>
          )}

        </div>
      </div>

      {/* Quick maintenance modal */}
      {maintAsset && (
        <QuickMaintModal
          asset={maintAsset}
          onClose={() => setMaintAsset(null)}
        />
      )}
    </div>
  )
}

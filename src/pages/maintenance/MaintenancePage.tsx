import { useState, useMemo }        from 'react'
import { useSearchParams }          from 'react-router-dom'
import { useMaintenance, useAssets, useCategories } from '@/hooks/useData'
import { useStore, selectCategoryMap } from '@/store/useStore'
import { deleteMaintenance }        from '@/lib/db'
import MaintenanceForm              from '@/components/maintenance/MaintenanceForm'
import MaintenanceDetails           from '@/components/maintenance/MaintenanceDetails'
import MaintenanceList              from '@/components/maintenance/MaintenanceList'
import type { MaintenanceRecord, MaintenanceStatus, MaintenanceType } from '@/types'
import s from './MaintenancePage.module.css'

export default function MaintenancePage() {
  const [params]           = useSearchParams()
  const assetIdFilter       = params.get('assetId') ?? ''
  const catFilter           = params.get('cat') ?? ''

  const { maintenance, loading } = useMaintenance({ assetId: assetIdFilter || undefined })
  const { assets }               = useAssets()
  useCategories()
  const categoryMap = useStore(selectCategoryMap)
  const { upsertMaint, removeMaint } = useStore()

  const [typeSel,   setTypeSel]   = useState<MaintenanceType | ''>('')
  const [statusSel, setStatusSel] = useState<MaintenanceStatus | ''>('')
  const [search,    setSearch]    = useState('')

  const [showCreate,  setShowCreate]  = useState(false)
  const [editRecord,  setEditRecord]  = useState<MaintenanceRecord | null>(null)
  const [viewRecord,  setViewRecord]  = useState<MaintenanceRecord | null>(null)

  const assetMap = useMemo(
    () => Object.fromEntries(assets.map(a => [a.id, a])),
    [assets]
  )

  // ── Filter ──
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return maintenance.filter(m => {
      if (typeSel   && m.type   !== typeSel)   return false
      if (statusSel && m.status !== statusSel) return false
      if (catFilter) {
        const asset = assetMap[m.assetId]
        if (asset?.categoryId !== catFilter) return false
      }
      if (q) {
        const asset = assetMap[m.assetId]
        if (
          !m.description.toLowerCase().includes(q) &&
          !(m.technician ?? '').toLowerCase().includes(q) &&
          !(asset?.code ?? '').toLowerCase().includes(q) &&
          !(asset?.name ?? '').toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [maintenance, typeSel, statusSel, catFilter, search, assetMap])

  // ── Stats ──
  const stats = useMemo(() => ({
    total:     maintenance.length,
    pendente:  maintenance.filter(m => m.status === 'pendente').length,
    andamento: maintenance.filter(m => m.status === 'andamento').length,
    concluida: maintenance.filter(m => m.status === 'concluida').length,
    custo:     maintenance.reduce((sum, m) => sum + (m.cost ?? 0), 0),
  }), [maintenance])

  const contextCat = catFilter ? categoryMap[catFilter] : null
  const preselectedAsset = assetIdFilter || undefined

  function handleSaved(record: MaintenanceRecord) {
    upsertMaint(record)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este registro de manutenção? Esta ação não pode ser desfeita.')) return
    await deleteMaintenance(id)
    removeMaint(id)
    if (viewRecord?.id === id) setViewRecord(null)
  }

  function openEdit(r: MaintenanceRecord) {
    setViewRecord(null)
    setEditRecord(r)
  }

  return (
    <div className={s.page}>

      {/* Title */}
      <div className={s.titleRow}>
        <div className={s.titleLeft}>
          <h2 className={s.pageTitle}>🔧 Manutenções</h2>
          {contextCat && (
            <span className={s.catPill} style={{ background: `${contextCat.color}22`, color: contextCat.color }}>
              {contextCat.icon} {contextCat.name}
            </span>
          )}
        </div>
        <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>+ Nova Manutenção</button>
      </div>

      {/* Stats */}
      <div className={s.statsBar}>
        {([
          { label: 'Total',          value: stats.total,     color: '#3b82f6', fmt: String },
          { label: '⏳ Pendentes',   value: stats.pendente,  color: '#f59e0b', fmt: String },
          { label: '🔄 Em Andamento', value: stats.andamento, color: '#8b5cf6', fmt: String },
          { label: '✅ Concluídas',  value: stats.concluida, color: '#22c55e', fmt: String },
          { label: '💰 Custo Total', value: stats.custo,     color: '#0f4c75',
            fmt: (v: number) => v > 0 ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—' },
        ] as const).map(({ label, value, color, fmt }) => (
          <div key={label} className={s.statCard} style={{ borderTopColor: color }}>
            <span className={s.statValue} style={{ fontSize: value > 9999 ? '0.95rem' : undefined }}>
              {fmt(value as number)}
            </span>
            <span className={s.statLabel}>{label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={s.filterRow}>
        <input className={s.filterInput} placeholder="Pesquisar por ativo, técnico, descrição…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className={s.filterSelect} value={typeSel} onChange={e => setTypeSel(e.target.value as MaintenanceType | '')}>
          <option value="">Todos os tipos</option>
          <option value="preventiva">🔵 Preventiva</option>
          <option value="corretiva">🔴 Corretiva</option>
          <option value="inspecao">🟢 Inspeção</option>
        </select>
        <select className={s.filterSelect} value={statusSel} onChange={e => setStatusSel(e.target.value as MaintenanceStatus | '')}>
          <option value="">Todos os status</option>
          <option value="pendente">⏳ Pendente</option>
          <option value="andamento">🔄 Em Andamento</option>
          <option value="concluida">✅ Concluída</option>
        </select>
      </div>

      <p className={s.resultCount}>{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</p>

      {/* List */}
      {loading ? (
        <p className={s.loadMsg}>Carregando…</p>
      ) : (
        <MaintenanceList
          records={filtered}
          assetMap={assetMap}
          categoryMap={categoryMap}
          onView={setViewRecord}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      {/* Create form */}
      {showCreate && (
        <MaintenanceForm
          preselectedAssetId={preselectedAsset}
          onClose={() => setShowCreate(false)}
          onSaved={r => { handleSaved(r); }}
        />
      )}

      {/* Edit form */}
      {editRecord && (
        <MaintenanceForm
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={r => { handleSaved(r); setEditRecord(null); }}
        />
      )}

      {/* Details modal */}
      {viewRecord && (
        <MaintenanceDetails
          record={viewRecord}
          asset={assetMap[viewRecord.assetId]}
          category={categoryMap[assetMap[viewRecord.assetId]?.categoryId ?? '']}
          onClose={() => setViewRecord(null)}
          onEdit={() => openEdit(viewRecord)}
        />
      )}
    </div>
  )
}

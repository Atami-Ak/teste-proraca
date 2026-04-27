import { useState, useMemo }        from 'react'
import { useSearchParams, Link }    from 'react-router-dom'
import { useAssets, useCategories } from '@/hooks/useData'
import { useStore, selectCategoryMap } from '@/store/useStore'
import { deleteAsset, createMaintenance } from '@/lib/db'
import type { Asset, AssetStatus, MaintenanceType } from '@/types'
import s from './AssetsPage.module.css'

// ── Status helpers ─────────────────────────────────────
const STATUS_META: Record<AssetStatus, { label: string; cls: string; icon: string; color: string; bg: string }> = {
  ativo:      { label: 'Ativo',          cls: s.statusAtivo,      icon: '🟢', color: '#16A34A', bg: 'rgba(22,163,74,0.1)' },
  manutencao: { label: 'Manutenção',     cls: s.statusManutencao, icon: '🔧', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  avariado:   { label: 'Avariado',       cls: s.statusAvariado,   icon: '🔴', color: '#DC2626', bg: 'rgba(220,38,38,0.1)' },
  inativo:    { label: 'Inativo',        cls: s.statusInativo,    icon: '⚫', color: '#64748B', bg: 'rgba(100,116,139,0.1)' },
}

function StatusBadge({ status }: { status: AssetStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.inativo
  return <span className={`${s.statusBadge} ${m.cls}`}>{m.icon} {m.label}</span>
}

// ── Quick maintenance modal ───────────────────────────
interface MaintModalProps { asset: Asset; onClose: () => void; onSaved: () => void }
function QuickMaintModal({ asset, onClose, onSaved }: MaintModalProps) {
  const categoryMap = useStore(selectCategoryMap)
  const category    = categoryMap[asset.categoryId]
  const [type,   setType]   = useState<MaintenanceType>(category?.maintenanceConfig?.defaultType ?? 'preventiva')
  const [desc,   setDesc]   = useState('')
  const [tech,   setTech]   = useState('')
  const [status, setStatus] = useState<'pendente' | 'andamento'>('pendente')
  const [date,   setDate]   = useState('')
  const [saving, setSaving] = useState(false)
  const allowedTypes = category?.maintenanceTypes ?? ['preventiva', 'corretiva', 'inspecao']

  async function handleSave() {
    if (!desc.trim()) return alert('Descrição é obrigatória.')
    setSaving(true)
    try {
      await createMaintenance({
        assetId: asset.id, categoryId: asset.categoryId, type, status,
        description: desc.trim(), technician: tech.trim() || undefined,
        scheduledDate: date ? new Date(date) : undefined,
      })
      onSaved(); onClose()
    } catch (e) { alert('Erro ao salvar: ' + String(e)) }
    finally { setSaving(false) }
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal} style={{ maxWidth: 500 }}>
        <div className={s.modalHeader}>
          <div>
            <div className={s.modalSub}>Registrar Manutenção</div>
            <div className={s.modalTitle}>{asset.name}</div>
          </div>
          <button className={s.closeBtn} onClick={onClose}>×</button>
        </div>
        <div className={s.detailTop}>
          <span className={s.detailCode}>{asset.code}</span>
          <span className={s.detailCat}>{category?.name ?? '—'}</span>
        </div>
        <div className={s.modalBody}>
          <div className={s.formGroup}>
            <label className={s.label}>Tipo de Manutenção <span className={s.req}>*</span></label>
            <select className={s.select} value={type} onChange={e => setType(e.target.value as MaintenanceType)}>
              {allowedTypes.map(t => (
                <option key={t} value={t}>
                  {t === 'preventiva' ? '🔵 Preventiva' : t === 'corretiva' ? '🔴 Corretiva' : '🟢 Inspeção'}
                </option>
              ))}
            </select>
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Descrição do Serviço <span className={s.req}>*</span></label>
            <textarea className={s.textarea} rows={3} placeholder="Descreva o serviço a ser realizado…"
              value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          {category?.maintenanceConfig?.notes && (
            <div style={{ fontSize: '0.82rem', color: '#D97706', background: 'rgba(245,158,11,0.08)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)' }}>
              💡 {category.maintenanceConfig.notes}
            </div>
          )}
          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Data Prevista</label>
              <input type="date" className={s.input} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Status Inicial</label>
              <select className={s.select} value={status} onChange={e => setStatus(e.target.value as typeof status)}>
                <option value="pendente">⏳ Pendente</option>
                <option value="andamento">🔄 Em Andamento</option>
              </select>
            </div>
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>
              Técnico Responsável {category?.maintenanceConfig?.requiresTechnician && <span className={s.req}>*</span>}
            </label>
            <input type="text" className={s.input} placeholder="Nome do técnico…"
              value={tech} onChange={e => setTech(e.target.value)} />
          </div>
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose}>Cancelar</button>
          <div style={{ flex: 1 }} />
          <button className={s.btnPrimary} disabled={saving} onClick={handleSave}>
            {saving ? 'Salvando…' : 'Registrar Manutenção'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Asset detail modal ────────────────────────────────
interface DetailModalProps { asset: Asset; onClose: () => void; onDelete: () => void; onMaint: () => void }
function DetailModal({ asset, onClose, onDelete, onMaint }: DetailModalProps) {
  const categoryMap = useStore(selectCategoryMap)
  const category    = categoryMap[asset.categoryId]
  const sm = STATUS_META[asset.status] ?? STATUS_META.inativo

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <div>
            <div className={s.modalSub}>Detalhes do Ativo</div>
            <div className={s.modalTitle}>{asset.name}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`${s.statusBadge} ${sm.cls}`}>{sm.icon} {sm.label}</span>
            <button className={s.closeBtn} onClick={onClose}>×</button>
          </div>
        </div>
        <div className={s.detailTop}>
          <span className={s.detailCode}>{asset.code}</span>
          <span className={s.detailCat}>{category?.icon} {category?.name ?? '—'}</span>
        </div>
        <div className={s.modalBody}>
          <div className={s.detailGrid}>
            <div className={s.detailField}>
              <span className={s.detailKey}>Localização</span>
              <span className={s.detailVal}>{asset.location || '—'}</span>
            </div>
            <div className={s.detailField}>
              <span className={s.detailKey}>Responsável</span>
              <span className={s.detailVal}>{asset.responsible || '—'}</span>
            </div>
            {category?.fields.map(f => (
              <div key={f.key} className={s.detailField}>
                <span className={s.detailKey}>{f.label}</span>
                <span className={s.detailVal}>{String(asset.dynamicData?.[f.key] ?? '—')}</span>
              </div>
            ))}
          </div>
          <div className={s.actionGrid}>
            <button className={`${s.actionBtn} ${s.actionMaint}`} onClick={onMaint}>
              🔧 Nova Manutenção
            </button>
            <Link to={`/ativos/manutencao?assetId=${asset.id}`} className={`${s.actionBtn} ${s.actionHistory}`}>
              📋 Histórico
            </Link>
            <Link to={`/ativos/novo?edit=${asset.id}`} className={`${s.actionBtn} ${s.actionEdit}`}>
              ✏️ Editar Ativo
            </Link>
            <button className={`${s.actionBtn} ${s.actionDelete}`} onClick={onDelete}>
              🗑️ Excluir
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════
// AssetsPage
// ════════════════════════════════════════════════════
export default function AssetsPage() {
  const [params]         = useSearchParams()
  const catFilter        = params.get('cat') ?? ''
  const { assets, loading } = useAssets({ categoryId: catFilter || undefined })
  const { categories }      = useCategories()
  const categoryMap         = useStore(selectCategoryMap)
  const { removeAsset }     = useStore()

  const [search,    setSearch]    = useState('')
  const [catSel,    setCatSel]    = useState(catFilter)
  const [statusSel, setStatusSel] = useState<AssetStatus | ''>('')
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null)
  const [maintAsset,  setMaintAsset]  = useState<Asset | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return assets.filter(a => {
      if (catSel    && a.categoryId !== catSel)  return false
      if (statusSel && a.status !== statusSel)   return false
      if (q && !a.name.toLowerCase().includes(q)
            && !a.code.toLowerCase().includes(q)
            && !(a.responsible ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [assets, search, catSel, statusSel])

  const stats = useMemo(() => ({
    total:    assets.length,
    ativo:    assets.filter(a => a.status === 'ativo').length,
    mant:     assets.filter(a => a.status === 'manutencao').length,
    avariado: assets.filter(a => a.status === 'avariado').length,
    inativo:  assets.filter(a => a.status === 'inativo').length,
  }), [assets])

  async function handleDelete(asset: Asset) {
    if (!confirm(`Excluir "${asset.name}"? Esta ação não pode ser desfeita.`)) return
    await deleteAsset(asset.id, asset.categoryId)
    removeAsset(asset.id)
    setDetailAsset(null)
  }

  const hasFilters = !!(search || catSel || statusSel)

  if (loading) {
    return <div className={s.page}><p className={s.loadMsg}>Carregando ativos…</p></div>
  }

  return (
    <div className={s.page}>
      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.pageTitle}>Ativos Patrimoniais</h1>
          <p className={s.pageSubtitle}>Controle completo do parque de ativos — {assets.length} itens cadastrados</p>
        </div>
        <div className={s.headerActions}>
          <Link to="/ativos/categorias" className={s.btnSecondary}>⚙️ Categorias</Link>
          <Link to="/ativos/novo" className={s.btnPrimary}>+ Novo Ativo</Link>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className={s.statsRow}>
        {[
          { label: 'Total de Ativos', value: stats.total,    icon: '🏷️', color: '#166534', bg: 'rgba(22,101,52,0.1)',   status: '' },
          { label: 'Ativos',          value: stats.ativo,    icon: '✅', color: '#16A34A', bg: 'rgba(22,163,74,0.1)',   status: 'ativo' },
          { label: 'Em Manutenção',   value: stats.mant,     icon: '🔧', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', status: 'manutencao' },
          { label: 'Avariados',       value: stats.avariado, icon: '⚠️', color: '#DC2626', bg: 'rgba(220,38,38,0.1)',  status: 'avariado' },
          { label: 'Inativos',        value: stats.inativo,  icon: '⚫', color: '#64748B', bg: 'rgba(100,116,139,0.1)',status: 'inativo' },
        ].map(sc => (
          <div key={sc.label}
            className={`${s.statCard} ${sc.status ? s.clickable : ''}`}
            style={{ borderTopColor: sc.color }}
            onClick={() => sc.status && setStatusSel(statusSel === sc.status ? '' : sc.status as AssetStatus)}>
            <div className={s.statIconWrap} style={{ background: sc.bg }}>
              {sc.icon}
            </div>
            <div className={s.statBody}>
              <div className={s.statValue} style={{ color: sc.value > 0 && sc.status === 'avariado' ? '#DC2626' : undefined }}>
                {sc.value}
              </div>
              <div className={s.statLabel}>{sc.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className={s.filtersBar}>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}>🔍</span>
          <input className={s.searchInput}
            placeholder="Buscar por código, nome ou responsável…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className={s.filterSelect} value={catSel} onChange={e => setCatSel(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        <select className={s.filterSelect} value={statusSel} onChange={e => setStatusSel(e.target.value as AssetStatus | '')}>
          <option value="">Todos os status</option>
          <option value="ativo">🟢 Ativo</option>
          <option value="manutencao">🔧 Manutenção</option>
          <option value="avariado">🔴 Avariado</option>
          <option value="inativo">⚫ Inativo</option>
        </select>
        <div className={s.filterDivider} />
        <span className={s.resultCount}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
        {hasFilters && (
          <button className={s.clearBtn}
            onClick={() => { setSearch(''); setCatSel(''); setStatusSel('') }}>
            Limpar filtros ×
          </button>
        )}
      </div>

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>{hasFilters ? '🔍' : '🏷️'}</div>
          <h3 className={s.emptyTitle}>{hasFilters ? 'Nenhum ativo encontrado' : 'Nenhum ativo cadastrado'}</h3>
          <p className={s.emptyDesc}>{hasFilters ? 'Ajuste os filtros ou limpe a busca.' : 'Cadastre o primeiro ativo patrimonial.'}</p>
          {!hasFilters && <Link to="/ativos/novo" className={s.btnPrimary}>+ Novo Ativo</Link>}
        </div>
      ) : (
        <div className={s.tableWrap}>
          <div className={s.tableScroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nome / Descrição</th>
                  <th>Categoria</th>
                  <th>Localização</th>
                  <th>Responsável</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(asset => {
                  const cat = categoryMap[asset.categoryId]
                  return (
                    <tr key={asset.id} className={s.tableRow} onClick={() => setDetailAsset(asset)}>
                      <td><span className={s.codeCell}>{asset.code}</span></td>
                      <td>
                        <div className={s.nameCell}>{asset.name}</div>
                        {asset.notes && <div className={s.nameSecondary}>{asset.notes.slice(0, 60)}{asset.notes.length > 60 ? '…' : ''}</div>}
                      </td>
                      <td>
                        {cat
                          ? <span className={s.catBadge}>{cat.icon} {cat.name}</span>
                          : <span style={{ color: '#94a3b8' }}>—</span>
                        }
                      </td>
                      <td>{asset.location || '—'}</td>
                      <td>{asset.responsible || '—'}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <StatusBadge status={asset.status} />
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className={s.actionsCell}>
                          <button className={s.iconBtn} title="Nova Manutenção"
                            onClick={() => setMaintAsset(asset)}>🔧</button>
                          <Link to={`/ativos/novo?edit=${asset.id}`} className={s.iconBtn} title="Editar">✏️</Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {detailAsset && (
        <DetailModal
          asset={detailAsset}
          onClose={() => setDetailAsset(null)}
          onDelete={() => handleDelete(detailAsset)}
          onMaint={() => { setMaintAsset(detailAsset); setDetailAsset(null) }}
        />
      )}
      {maintAsset && (
        <QuickMaintModal
          asset={maintAsset}
          onClose={() => setMaintAsset(null)}
          onSaved={() => {}}
        />
      )}
    </div>
  )
}

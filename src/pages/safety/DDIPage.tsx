import { useState, useEffect, type CSSProperties } from 'react'
import { Link, useNavigate }    from 'react-router-dom'
import { getDDIList, deleteDDI } from '@/lib/db-safety'
import type { DDI }              from '@/types/safety'
import { STATUS_DDI_META, SETORES_FABRICA } from '@/types/safety'
import { toast }                 from '@/components/ui/Toast'
import s from './DDIPage.module.css'

function fmtShort(d: Date | undefined) {
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

const Ic = {
  Back:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6"/></svg>,
  Inspect:  () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  Plus:     () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Search:   () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Edit:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Trash:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  AlertTri: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Chart:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Calendar: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Eye:      () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  ChevRight:() => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>,
  X:        () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Filter:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3"/></svg>,
  User:     () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
}

function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626'
  const label = score >= 80 ? 'Bom' : score >= 60 ? 'Regular' : 'Crítico'
  return (
    <div className={s.scoreWrap}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} />
        <text x={size/2} y={size/2 + 4} textAnchor="middle"
          fontSize={10} fontWeight="700" fill={color}>{score}%</text>
      </svg>
      <span className={s.scoreLabel} style={{ color }}>{label}</span>
    </div>
  )
}

function DeleteModal({ item, onConfirm, onCancel, deleting }: {
  item: DDI; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={s.deleteModal}>
        <div className={s.delIconWrap}><Ic.AlertTri /></div>
        <h3 className={s.delTitle}>Excluir Inspeção de Segurança</h3>
        <p className={s.delDesc}>Você está prestes a excluir permanentemente:</p>
        <div className={s.delTarget}>
          <span className={s.delCode}>{item.numero}</span>
          <span className={s.delName}>{item.setor} · {item.inspetor}</span>
        </div>
        <p className={s.delWarning}>Esta ação não pode ser desfeita.</p>
        <div className={s.delActions}>
          <button className={s.btnCancel} onClick={onCancel}>Cancelar</button>
          <button className={s.btnConfirmDel} onClick={onConfirm} disabled={deleting}>
            {deleting ? 'Excluindo…' : 'Excluir Inspeção'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DDIPage() {
  const navigate = useNavigate()
  const [list, setList]           = useState<DDI[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [setor, setSetor]         = useState('')
  const [statusFilter, setStatus] = useState('')
  const [delTarget, setDelTarget] = useState<DDI | null>(null)
  const [deleting, setDeleting]   = useState(false)

  async function load() {
    setLoading(true)
    try { setList(await getDDIList()) }
    catch { toast.error('Erro ao carregar inspeções.') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function handleDelete() {
    if (!delTarget) return
    setDeleting(true)
    try {
      await deleteDDI(delTarget.id)
      toast.success('Inspeção excluída com sucesso.')
      setList(prev => prev.filter(d => d.id !== delTarget.id))
      setDelTarget(null)
    } catch { toast.error('Erro ao excluir.') }
    finally { setDeleting(false) }
  }

  const filtered = list.filter(d => {
    const q = search.toLowerCase()
    const matchQ = !q || d.numero.toLowerCase().includes(q) || d.inspetor.toLowerCase().includes(q) || d.setor.toLowerCase().includes(q)
    return matchQ && (!setor || d.setor === setor) && (!statusFilter || d.status === statusFilter)
  })

  const now = new Date()
  const m   = new Date(now.getFullYear(), now.getMonth(), 1)
  const totalMes = list.filter(d => d.data >= m).length
  const avgScore = list.length > 0 ? Math.round(list.reduce((a, d) => a + d.scoreGeral, 0) / list.length) : 0
  const criticos = list.reduce((a, d) => a + d.totalCriticosAbertos, 0)
  const scoreColor = avgScore >= 80 ? '#16a34a' : avgScore >= 60 ? '#d97706' : '#dc2626'
  const hasFilters = search || setor || statusFilter

  return (
    <div className={s.page}>

      {/* Header */}
      <div className={s.pageHeader}>
        <div className={s.headerLeft}>
          <Link to="/seguranca" className={s.backLink}><Ic.Back /> Segurança</Link>
          <div className={s.headerDivider} />
          <div className={s.headerIconWrap}><Ic.Inspect /></div>
          <div>
            <h1 className={s.pageTitle}>Inspeções de Segurança</h1>
            <p className={s.pageSub}>Checklist de conformidade — identificação e controle de riscos</p>
          </div>
        </div>
        <Link to="/seguranca/ddi/novo" className={s.btnPrimary}><Ic.Plus /> Nova Inspeção de Segurança</Link>
      </div>

      {/* Stats */}
      <div className={s.statsRow}>
        {[
          { label: 'Total inspeções', value: list.length,  color: '#2563eb' },
          { label: 'Este mês',        value: totalMes,     color: '#166534' },
          { label: 'Score médio',     value: `${avgScore}%`, color: scoreColor },
          { label: 'Críticos abertos',value: criticos,     color: criticos > 0 ? '#dc2626' : '#16a34a' },
        ].map(st => (
          <div key={st.label} className={s.statCard} style={{ '--stat-color': st.color } as CSSProperties}>
            <div className={s.statAccent} />
            <div className={s.statValue}>{st.value}</div>
            <div className={s.statLabel}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={s.filtersBar}>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}><Ic.Search /></span>
          <input className={s.searchInput}
            placeholder="Buscar por número, inspetor ou setor…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button className={s.searchClear} onClick={() => setSearch('')}><Ic.X /></button>
          )}
        </div>
        <div className={s.filterGroup}>
          <span className={s.filterIcon}><Ic.Filter /></span>
          <select className={s.filterSelect} value={setor} onChange={e => setSetor(e.target.value)}>
            <option value="">Todos os setores</option>
            {SETORES_FABRICA.map(sv => <option key={sv} value={sv}>{sv}</option>)}
          </select>
        </div>
        <select className={s.filterSelect} value={statusFilter} onChange={e => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="rascunho">Rascunho</option>
          <option value="submetido">Submetido</option>
          <option value="aprovado">Aprovado</option>
        </select>
        {hasFilters && (
          <button className={s.clearFilters} onClick={() => { setSearch(''); setSetor(''); setStatus('') }}>
            <Ic.X /> Limpar
          </button>
        )}
        <span className={s.resultCount}>{filtered.length} de {list.length}</span>
      </div>

      {/* Content */}
      {loading ? (
        <div className={s.loadingWrap}><div className={s.spinner} /><span>Carregando inspeções…</span></div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIconWrap}><Ic.Inspect /></div>
          <h3 className={s.emptyTitle}>
            {list.length === 0 ? 'Nenhuma inspeção registrada ainda' : 'Nenhuma inspeção encontrada'}
          </h3>
          <p className={s.emptyDesc}>
            {list.length === 0 ? 'Realize a primeira inspeção de segurança.' : 'Ajuste os filtros ou a busca.'}
          </p>
          {list.length === 0 && (
            <Link to="/seguranca/ddi/novo" className={s.btnPrimary}><Ic.Plus /> Nova Inspeção de Segurança</Link>
          )}
        </div>
      ) : (
        <div className={s.ddiGrid}>
          {filtered.map(d => {
            const meta   = STATUS_DDI_META[d.status]
            const hasCrit = d.totalCriticosAbertos > 0
            const hasNC   = d.totalNaoConformes > 0

            return (
              <div key={d.id} className={s.ddiCard}
                style={{ '--card-color': meta.color } as CSSProperties}>
                <div className={s.cardAccent} />

                <div className={s.cardMain}>
                  {/* Score */}
                  <div className={s.cardScore}>
                    <ScoreRing score={d.scoreGeral} size={56} />
                  </div>

                  {/* Info */}
                  <div className={s.cardInfo}>
                    <div className={s.cardTopRow}>
                      <span className={s.cardCode}>{d.numero}</span>
                      <span className={s.cardBadge} style={{ color: meta.color, background: meta.color + '18' }}>
                        {meta.label}
                      </span>
                      <span className={s.cardDate}><Ic.Calendar /> {fmtShort(d.data)}</span>
                    </div>

                    <div className={s.cardSetor}>{d.setor}</div>
                    <div className={s.cardInspetor}><Ic.User /> {d.inspetor}</div>

                    {/* Metrics */}
                    <div className={s.cardMetrics}>
                      <span className={s.metric} style={{ color: '#16a34a' }}>
                        ✓ {d.totalConformes} conformes
                      </span>
                      {hasNC && (
                        <span className={s.metric} style={{ color: '#ea580c' }}>
                          ✗ {d.totalNaoConformes} NC
                        </span>
                      )}
                      {hasCrit && (
                        <span className={s.metricCrit}>
                          ⚠ {d.totalCriticosAbertos} crítico{d.totalCriticosAbertos > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className={s.cardActions}>
                  <button className={s.btnView}
                    onClick={() => navigate(`/seguranca/ddi/${d.id}`)}>
                    <Ic.Eye /> Ver
                  </button>
                  <button className={s.btnEdit}
                    onClick={() => navigate(`/seguranca/ddi/${d.id}/editar`)}>
                    <Ic.Edit /> Editar
                  </button>
                  <button className={s.btnDel}
                    onClick={() => setDelTarget(d)}>
                    <Ic.Trash />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {delTarget && (
        <DeleteModal item={delTarget} onConfirm={handleDelete}
          onCancel={() => setDelTarget(null)} deleting={deleting} />
      )}
    </div>
  )
}

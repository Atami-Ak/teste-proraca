import { useState, useEffect, type CSSProperties } from 'react'
import { Link, useNavigate }   from 'react-router-dom'
import { getDDSList, deleteDDS } from '@/lib/db-safety'
import type { DDS }             from '@/types/safety'
import { STATUS_DDS_META, SETORES_FABRICA } from '@/types/safety'
import { toast }                from '@/components/ui/Toast'
import s from './DDSPage.module.css'

function fmt(d: Date | undefined) {
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtShort(d: Date | undefined) {
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
function isToday(d: Date | undefined) {
  if (!d) return false
  const n = new Date()
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
}

const Ic = {
  Back:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6"/></svg>,
  Chat:     () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Plus:     () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Search:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Edit:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Trash:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  AlertTri: () => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Users:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Calendar: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  ChevRight:() => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>,
  Eye:      () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Filter:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3"/></svg>,
  X:        () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
}

function DeleteModal({ item, onConfirm, onCancel, deleting }: {
  item: DDS; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className={s.deleteModal}>
        <div className={s.delIconWrap}><Ic.AlertTri /></div>
        <h3 className={s.delTitle}>Excluir DDS</h3>
        <p className={s.delDesc}>Você está prestes a excluir permanentemente:</p>
        <div className={s.delTarget}>
          <span className={s.delCode}>{item.numero}</span>
          <span className={s.delName}>{item.tema}</span>
        </div>
        <p className={s.delWarning}>Esta ação não pode ser desfeita.</p>
        <div className={s.delActions}>
          <button className={s.btnCancel} onClick={onCancel}>Cancelar</button>
          <button className={s.btnConfirmDel} onClick={onConfirm} disabled={deleting}>
            {deleting ? <span className={s.spinnerSm} /> : null}
            {deleting ? 'Excluindo…' : 'Excluir DDS'}
          </button>
        </div>
      </div>
    </div>
  )
}

function avatar(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export default function DDSPage() {
  const navigate = useNavigate()
  const [list, setList]           = useState<DDS[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [setor, setSetor]         = useState('')
  const [status, setStatus]       = useState('')
  const [delTarget, setDelTarget] = useState<DDS | null>(null)
  const [deleting, setDeleting]   = useState(false)

  async function load() {
    setLoading(true)
    try { setList(await getDDSList()) }
    catch { toast.error('Erro ao carregar DDS.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleDelete() {
    if (!delTarget) return
    setDeleting(true)
    try {
      await deleteDDS(delTarget.id)
      toast.success('DDS excluído com sucesso.')
      setList(prev => prev.filter(d => d.id !== delTarget.id))
      setDelTarget(null)
    } catch { toast.error('Erro ao excluir. Tente novamente.') }
    finally { setDeleting(false) }
  }

  const filtered = list.filter(d => {
    const q = search.toLowerCase()
    const matchQ = !q || d.numero.toLowerCase().includes(q) || d.tema.toLowerCase().includes(q) || d.supervisor.toLowerCase().includes(q) || d.setor.toLowerCase().includes(q)
    const matchSetor  = !setor  || d.setor  === setor
    const matchStatus = !status || d.status === status
    return matchQ && matchSetor && matchStatus
  })

  const now     = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const totalMes     = list.filter(d => d.data >= firstOfMonth).length
  const totalPresentes = list.reduce((a, d) => a + d.totalPresentes, 0)
  const concluidos   = list.filter(d => d.status === 'concluido').length
  const rascunhos    = list.filter(d => d.status === 'rascunho').length

  const hasFilters = search || setor || status

  function clearFilters() { setSearch(''); setSetor(''); setStatus('') }

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.pageHeader}>
        <div className={s.headerLeft}>
          <Link to="/seguranca" className={s.backLink}><Ic.Back /> Segurança</Link>
          <div className={s.headerDivider} />
          <div className={s.headerIconWrap}><Ic.Chat /></div>
          <div>
            <h1 className={s.pageTitle}>Diálogo Diário de Segurança</h1>
            <p className={s.pageSub}>Registro e acompanhamento de todos os DDS realizados</p>
          </div>
        </div>
        <Link to="/seguranca/dds/novo" className={s.btnPrimary}>
          <Ic.Plus /> Novo DDS
        </Link>
      </div>

      {/* ── Stats bar ── */}
      <div className={s.statsRow}>
        {[
          { label: 'Total registrados', value: list.length,      color: '#166534', bg: 'rgba(22,101,52,0.08)' },
          { label: 'Este mês',          value: totalMes,         color: '#2563eb', bg: 'rgba(37,99,235,0.08)' },
          { label: 'Concluídos',        value: concluidos,       color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
          { label: 'Rascunhos',         value: rascunhos,        color: '#94a3b8', bg: 'rgba(148,163,184,0.10)' },
          { label: 'Total presenças',   value: totalPresentes,   color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
        ].map(st => (
          <div key={st.label} className={s.statCard} style={{ '--stat-color': st.color, '--stat-bg': st.bg } as CSSProperties}>
            <div className={s.statAccent} />
            <div className={s.statValue}>{st.value}</div>
            <div className={s.statLabel}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className={s.filtersBar}>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}><Ic.Search /></span>
          <input className={s.searchInput}
            placeholder="Buscar por número, tema, supervisor ou setor…"
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
        <select className={s.filterSelect} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="concluido">Concluídos</option>
          <option value="rascunho">Rascunhos</option>
        </select>
        {hasFilters && (
          <button className={s.clearFilters} onClick={clearFilters}>
            <Ic.X /> Limpar filtros
          </button>
        )}
        <div className={s.resultCount}>
          {filtered.length} de {list.length}
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className={s.loadingWrap}>
          <div className={s.spinner} />
          <span>Carregando DDS…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIconWrap}><Ic.Chat /></div>
          <h3 className={s.emptyTitle}>
            {list.length === 0 ? 'Nenhum DDS registrado ainda' : 'Nenhum DDS encontrado'}
          </h3>
          <p className={s.emptyDesc}>
            {list.length === 0
              ? 'Registre o primeiro DDS clicando em "+ Novo DDS".'
              : 'Tente ajustar os filtros ou a busca.'}
          </p>
          {list.length === 0 && (
            <Link to="/seguranca/dds/novo" className={s.btnPrimary}><Ic.Plus /> Criar primeiro DDS</Link>
          )}
          {list.length > 0 && (
            <button className={s.btnGhost} onClick={clearFilters}>Limpar filtros</button>
          )}
        </div>
      ) : (
        <div className={s.ddsGrid}>
          {filtered.map(d => {
            const meta    = STATUS_DDS_META[d.status]
            const today   = isToday(d.data)
            const signed  = d.colaboradores.filter(c => c.assinou).length
            const pctSign = d.colaboradores.length > 0 ? Math.round((signed / d.colaboradores.length) * 100) : 0

            return (
              <div key={d.id} className={s.ddsCard}
                style={{ '--card-color': meta.color } as CSSProperties}>
                {today && <div className={s.todayRibbon}>Hoje</div>}

                <div className={s.cardAccent} />

                <div className={s.cardTop}>
                  <div className={s.cardTopLeft}>
                    <div className={s.cardAvatar}>{avatar(d.supervisor)}</div>
                    <div>
                      <span className={s.cardCode}>{d.numero}</span>
                      <span className={s.cardBadge} style={{ color: meta.color, background: meta.color + '18' }}>
                        {meta.label}
                      </span>
                    </div>
                  </div>
                  <div className={s.cardDate}>
                    <Ic.Calendar />
                    {fmtShort(d.data)}
                  </div>
                </div>

                <div className={s.cardTema}>{d.tema}</div>
                <div className={s.cardSup}>{d.supervisor}</div>

                <div className={s.cardTags}>
                  <span className={s.cardTag}>{d.setor}</span>
                  {d.departamento && <span className={s.cardTag}>{d.departamento}</span>}
                  {d.duracaoMinutos && <span className={s.cardTag}>{d.duracaoMinutos} min</span>}
                </div>

                <div className={s.cardPresence}>
                  <div className={s.presenceTop}>
                    <span className={s.presenceLabel}><Ic.Users /> {d.totalPresentes} participante{d.totalPresentes !== 1 ? 's' : ''}</span>
                    {d.colaboradores.length > 0 && (
                      <span className={s.presencePct} style={{ color: pctSign === 100 ? '#16a34a' : '#d97706' }}>
                        {pctSign}% assinaram
                      </span>
                    )}
                  </div>
                  {d.colaboradores.length > 0 && (
                    <div className={s.presenceBar}>
                      <div className={s.presenceFill} style={{
                        width: `${pctSign}%`,
                        background: pctSign === 100 ? '#16a34a' : '#d97706',
                      }} />
                    </div>
                  )}
                </div>

                <div className={s.cardActions}>
                  <button className={s.btnViewDetail}
                    onClick={() => navigate(`/seguranca/dds/${d.id}`)}>
                    <Ic.Eye /> Visualizar
                  </button>
                  <div className={s.cardActionsSide}>
                    <button className={s.btnEdit} title="Editar"
                      onClick={() => navigate(`/seguranca/dds/${d.id}/editar`)}>
                      <Ic.Edit /> Editar
                    </button>
                    <button className={s.btnDel} title="Excluir"
                      onClick={() => setDelTarget(d)}>
                      <Ic.Trash />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {delTarget && (
        <DeleteModal
          item={delTarget}
          onConfirm={handleDelete}
          onCancel={() => setDelTarget(null)}
          deleting={deleting}
        />
      )}
    </div>
  )
}

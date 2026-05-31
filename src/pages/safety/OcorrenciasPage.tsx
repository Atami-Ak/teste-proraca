import { useState, useEffect, type CSSProperties } from 'react'
import { Link }              from 'react-router-dom'
import { getOcorrencias, createOcorrencia, updateOcorrencia } from '@/lib/db-safety'
import { useStore }          from '@/store/useStore'
import type { Ocorrencia }   from '@/types/safety'
import { TIPO_OCORRENCIA_META, SETORES_FABRICA, SEVERIDADE_META } from '@/types/safety'
import { toast }             from '@/components/ui/Toast'
import s from './OcorrenciasPage.module.css'

function fmt(d: Date | undefined) { return d ? d.toLocaleDateString('pt-BR') : '—' }

const Ic = {
  Back:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6"/></svg>,
  AlertTri:  () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Plus:      () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Search:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Close:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  MapPin:    () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  User:      () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  CheckOk:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12"/></svg>,
  Eye:       () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Filter:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3"/></svg>,
  X:         () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Magnifier: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Clock:     () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>,
}

type OcForm = {
  tipo: Ocorrencia['tipo']; data: string; hora: string; setor: string
  colaboradorNome: string; descricao: string; causaImediata: string
  severidade: Ocorrencia['severidade']; responsavel: string
}

const EMPTY: OcForm = {
  tipo: 'quase_acidente', data: new Date().toISOString().split('T')[0],
  hora: new Date().toTimeString().slice(0, 5), setor: '',
  colaboradorNome: '', descricao: '', causaImediata: '',
  severidade: 'media', responsavel: '',
}

const STATUS_META: Record<Ocorrencia['status'], { label: string; color: string; bg: string }> = {
  aberta:           { label: 'Aberta',           color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
  em_investigacao:  { label: 'Em investigação',  color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
  encerrada:        { label: 'Encerrada',        color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
}

export default function OcorrenciasPage() {
  const user = useStore(st => st.user)
  const [list, setList]             = useState<Ocorrencia[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState<OcForm>(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [transitioning, setTransit] = useState<string | null>(null)

  const TIPOS = Object.entries(TIPO_OCORRENCIA_META) as [Ocorrencia['tipo'], typeof TIPO_OCORRENCIA_META[keyof typeof TIPO_OCORRENCIA_META]][]

  useEffect(() => {
    getOcorrencias()
      .then(setList)
      .catch(() => toast.error('Erro ao carregar ocorrências.'))
      .finally(() => setLoading(false))
  }, [])

  function setF(k: keyof OcForm, v: string) { setForm(prev => ({ ...prev, [k]: v })) }

  async function handleSave() {
    if (!form.setor)       { toast.error('Informe o setor.'); return }
    if (!form.descricao)   { toast.error('Descreva a ocorrência.'); return }
    if (!form.responsavel) { toast.error('Informe o responsável.'); return }
    setSaving(true)
    try {
      await createOcorrencia({
        tipo: form.tipo, data: new Date(form.data + 'T12:00:00'), hora: form.hora,
        setor: form.setor as Ocorrencia['setor'],
        colaboradorNome: form.colaboradorNome || undefined,
        descricao: form.descricao,
        causaImediata: form.causaImediata || undefined,
        severidade: form.severidade, responsavel: form.responsavel,
        status: 'aberta', createdBy: user?.uid,
      })
      toast.success('Ocorrência registrada com sucesso.')
      setShowForm(false); setForm(EMPTY)
      setList(await getOcorrencias())
    } catch { toast.error('Erro ao salvar. Tente novamente.') }
    finally { setSaving(false) }
  }

  async function handleTransition(id: string, newStatus: Ocorrencia['status']) {
    setTransit(id)
    try {
      await updateOcorrencia(id, { status: newStatus })
      setList(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o))
      const labels: Record<Ocorrencia['status'], string> = {
        aberta: 'Aberta', em_investigacao: 'Em investigação', encerrada: 'Encerrada'
      }
      toast.success(`Status atualizado: ${labels[newStatus]}`)
    } catch { toast.error('Erro ao atualizar status.') }
    finally { setTransit(null) }
  }

  const filtered = list.filter(d => {
    const q = search.toLowerCase()
    const matchQ = !q || d.numero.toLowerCase().includes(q) || d.descricao.toLowerCase().includes(q) || d.setor.toLowerCase().includes(q) || (d.colaboradorNome ?? '').toLowerCase().includes(q)
    return matchQ && (!filterTipo || d.tipo === filterTipo) && (!filterStatus || d.status === filterStatus)
  })

  const abertas     = list.filter(o => o.status === 'aberta').length
  const investigacao = list.filter(o => o.status === 'em_investigacao').length
  const acidentes   = list.filter(o => o.tipo.startsWith('acidente')).length
  const quaseAcid   = list.filter(o => o.tipo === 'quase_acidente').length
  const hasFilters  = search || filterTipo || filterStatus

  return (
    <div className={s.page}>

      {/* Header */}
      <div className={s.pageHeader}>
        <div className={s.headerLeft}>
          <Link to="/seguranca" className={s.backLink}><Ic.Back /> Segurança</Link>
          <div className={s.headerDivider} />
          <div className={s.headerIconWrap}><Ic.AlertTri /></div>
          <div>
            <h1 className={s.pageTitle}>Ocorrências e Incidentes</h1>
            <p className={s.pageSub}>Registro de acidentes, quase acidentes e condições inseguras</p>
          </div>
        </div>
        <button className={s.btnPrimary} onClick={() => { setShowForm(true); setForm(EMPTY) }}>
          <Ic.Plus /> Registrar Ocorrência
        </button>
      </div>

      {/* Alert for open items */}
      {abertas > 0 && (
        <div className={s.urgentBanner}>
          <span className={s.urgentDot} />
          <strong>{abertas} ocorrência{abertas !== 1 ? 's' : ''} em aberto</strong> aguardando ação imediata.
          <button className={s.urgentFilter}
            onClick={() => setFilterStatus(filterStatus === 'aberta' ? '' : 'aberta')}>
            {filterStatus === 'aberta' ? 'Ver todas' : 'Filtrar abertas'}
          </button>
        </div>
      )}

      {/* Stats */}
      <div className={s.statsRow}>
        {[
          { label: 'Total registros',  value: list.length,    color: '#64748b' },
          { label: 'Em aberto',        value: abertas,        color: abertas > 0 ? '#dc2626' : '#16a34a' },
          { label: 'Em investigação',  value: investigacao,   color: investigacao > 0 ? '#d97706' : '#94a3b8' },
          { label: 'Acidentes',        value: acidentes,      color: '#7f1d1d' },
          { label: 'Quase acidentes',  value: quaseAcid,      color: '#ea580c' },
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
            placeholder="Buscar por número, descrição, setor ou colaborador…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className={s.searchClear} onClick={() => setSearch('')}><Ic.X /></button>}
        </div>
        <div className={s.filterGroup}>
          <span className={s.filterIcon}><Ic.Filter /></span>
          <select className={s.filterSelect} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {TIPOS.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <select className={s.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="aberta">Abertas</option>
          <option value="em_investigacao">Em investigação</option>
          <option value="encerrada">Encerradas</option>
        </select>
        {hasFilters && (
          <button className={s.clearFilters} onClick={() => { setSearch(''); setFilterTipo(''); setFilterStatus('') }}>
            <Ic.X /> Limpar
          </button>
        )}
        <span className={s.resultCount}>{filtered.length} de {list.length}</span>
      </div>

      {/* Content */}
      {loading ? (
        <div className={s.loadingWrap}><div className={s.spinner} /><span>Carregando ocorrências…</span></div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIconWrap}><Ic.AlertTri /></div>
          <h3 className={s.emptyTitle}>
            {list.length === 0 ? 'Nenhuma ocorrência registrada' : 'Nenhuma ocorrência encontrada'}
          </h3>
          <p className={s.emptyDesc}>
            {list.length === 0 ? 'Registre a primeira ocorrência clicando no botão acima.' : 'Ajuste os filtros para encontrar ocorrências.'}
          </p>
          {hasFilters && (
            <button className={s.btnGhost} onClick={() => { setSearch(''); setFilterTipo(''); setFilterStatus('') }}>
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className={s.listCards}>
          {filtered.map(o => {
            const tMeta  = TIPO_OCORRENCIA_META[o.tipo]
            const sMeta  = STATUS_META[o.status]
            const sevMeta = SEVERIDADE_META[o.severidade]
            const isOpen = o.status === 'aberta'
            const isInvest = o.status === 'em_investigacao'
            const isTransit = transitioning === o.id

            return (
              <div key={o.id} className={s.ocCard} style={{ '--oc-color': tMeta.color } as CSSProperties}>
                <div className={s.ocAccent} />

                <div className={s.ocTop}>
                  <span className={s.ocCode}>{o.numero}</span>
                  <span className={s.ocTipo} style={{ color: tMeta.color, background: tMeta.bg }}>{tMeta.label}</span>
                  <span className={s.ocStatus} style={{ color: sMeta.color, background: sMeta.bg }}>{sMeta.label}</span>
                  <div className={s.ocSeverity} style={{ color: sevMeta.color }}>
                    <span className={s.sevDot} style={{ background: sevMeta.color }} />
                    {sevMeta.label}
                  </div>
                  <span className={s.ocDate}>
                    <Ic.Clock /> {fmt(o.data)}{o.hora ? ` ${o.hora}` : ''}
                  </span>
                </div>

                <p className={s.ocDesc}>{o.descricao}</p>

                <div className={s.ocMeta}>
                  <span className={s.metaItem}><Ic.MapPin /> {o.setor}</span>
                  {o.colaboradorNome && <span className={s.metaItem}><Ic.User /> {o.colaboradorNome}</span>}
                  <span className={s.metaItem}><Ic.Eye /> Responsável: {o.responsavel}</span>
                </div>

                {/* Status actions */}
                {(isOpen || isInvest) && (
                  <div className={s.ocActions}>
                    {isOpen && (
                      <button
                        className={s.btnInvestigate}
                        disabled={isTransit}
                        onClick={() => handleTransition(o.id, 'em_investigacao')}>
                        <Ic.Magnifier />
                        {isTransit ? 'Atualizando…' : 'Iniciar investigação'}
                      </button>
                    )}
                    <button
                      className={s.btnClose}
                      disabled={isTransit}
                      onClick={() => {
                        if (!confirm(`Encerrar ${o.numero}? Esta ação indica que o caso foi resolvido.`)) return
                        handleTransition(o.id, 'encerrada')
                      }}>
                      <Ic.CheckOk />
                      {isTransit ? 'Atualizando…' : 'Encerrar'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── New Occurrence Modal ── */}
      {showForm && (
        <div className={s.overlay} onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className={s.formModal}>
            <div className={s.modalHeader}>
              <div className={s.modalHeaderLeft}>
                <div className={s.modalIcon}><Ic.AlertTri /></div>
                <div>
                  <div className={s.modalSuperTitle}>Registrar</div>
                  <div className={s.modalTitle}>Nova Ocorrência</div>
                </div>
              </div>
              <button className={s.modalCloseBtn} onClick={() => setShowForm(false)}><Ic.Close /></button>
            </div>
            <div className={s.modalBody}>
              <div className={s.formGrid}>
                <div className={s.field}>
                  <label className={s.label}>Tipo de ocorrência <span className={s.req}>*</span></label>
                  <select className={s.input} value={form.tipo} onChange={e => setF('tipo', e.target.value)}>
                    {TIPOS.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className={s.field}>
                  <label className={s.label}>Severidade</label>
                  <select className={s.input} value={form.severidade} onChange={e => setF('severidade', e.target.value)}>
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="critica">Crítica</option>
                  </select>
                </div>
                <div className={s.field}>
                  <label className={s.label}>Data <span className={s.req}>*</span></label>
                  <input type="date" className={s.input} value={form.data} onChange={e => setF('data', e.target.value)} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Hora</label>
                  <input type="time" className={s.input} value={form.hora} onChange={e => setF('hora', e.target.value)} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Setor <span className={s.req}>*</span></label>
                  <select className={s.input} value={form.setor} onChange={e => setF('setor', e.target.value)}>
                    <option value="">Selecione o setor…</option>
                    {SETORES_FABRICA.map(sv => <option key={sv} value={sv}>{sv}</option>)}
                  </select>
                </div>
                <div className={s.field}>
                  <label className={s.label}>Colaborador envolvido</label>
                  <input className={s.input} value={form.colaboradorNome}
                    onChange={e => setF('colaboradorNome', e.target.value)}
                    placeholder="Nome (se aplicável)" />
                </div>
                <div className={`${s.field} ${s.fieldFull}`}>
                  <label className={s.label}>Descrição da ocorrência <span className={s.req}>*</span></label>
                  <textarea className={s.textarea} rows={3} value={form.descricao}
                    onChange={e => setF('descricao', e.target.value)}
                    placeholder="Descreva o que aconteceu, onde, como e quando…" />
                </div>
                <div className={`${s.field} ${s.fieldFull}`}>
                  <label className={s.label}>Causa imediata</label>
                  <textarea className={s.textarea} rows={2} value={form.causaImediata}
                    onChange={e => setF('causaImediata', e.target.value)}
                    placeholder="Qual foi a causa direta do evento?" />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Responsável <span className={s.req}>*</span></label>
                  <input className={s.input} value={form.responsavel}
                    onChange={e => setF('responsavel', e.target.value)}
                    placeholder="Nome do responsável pela investigação" />
                </div>
              </div>
            </div>
            <div className={s.modalFooter}>
              <button className={s.btnGhost} onClick={() => setShowForm(false)}>Cancelar</button>
              <button className={s.btnPrimary} disabled={saving} onClick={handleSave}>
                {saving
                  ? <><span className={s.spinnerSm} /> Salvando…</>
                  : <><Ic.AlertTri /> Registrar ocorrência</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

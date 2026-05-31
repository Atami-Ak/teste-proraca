import { useState, useEffect, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { getPermissoes, createPermissao, updatePermissao } from '@/lib/db-safety'
import type { PermissaoTrabalho } from '@/types/safety'
import { TIPO_PERMISSAO_META, STATUS_PERMISSAO_META, SETORES_FABRICA } from '@/types/safety'
import { toast } from '@/components/ui/Toast'
import s from './PermissoesPage.module.css'

const Ic = {
  Back:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6"/></svg>,
  Clipboard: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
  Plus:      () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Search:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  X:         () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Check:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12"/></svg>,
  Play:      () => <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>,
  Stop:      () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  Ban:       () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
  MapPin:    () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  User:      () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Clock:     () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>,
  AlertTri:  () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Shield:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  FileCheck: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><polyline points="9,15 11,17 15,13"/></svg>,
}

function fmt(d: Date | undefined): string {
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR')
}

type PTForm = {
  tipo:                PermissaoTrabalho['tipo']
  data:                string
  horaInicio:          string
  horaFim:             string
  setor:               string
  descricaoServico:    string
  empresaExecutora:    string
  responsavelServico:  string
  supervisorSeguranca: string
  riscos:              string
  medidas:             string
  episRequeridos:      string
}

const EMPTY: PTForm = {
  tipo:                'geral',
  data:                new Date().toISOString().split('T')[0],
  horaInicio:          '07:00',
  horaFim:             '17:00',
  setor:               '',
  descricaoServico:    '',
  empresaExecutora:    '',
  responsavelServico:  '',
  supervisorSeguranca: '',
  riscos:              '',
  medidas:             '',
  episRequeridos:      '',
}

const TIPOS = Object.entries(TIPO_PERMISSAO_META) as [PermissaoTrabalho['tipo'], typeof TIPO_PERMISSAO_META[keyof typeof TIPO_PERMISSAO_META]][]

const STATUS_PT_COLOR: Record<PermissaoTrabalho['status'], string> = {
  solicitada:  '#3b82f6',
  aprovada:    '#16a34a',
  em_execucao: '#f59e0b',
  encerrada:   '#94a3b8',
  cancelada:   '#dc2626',
}

export default function PermissoesPage() {
  const [list, setList]         = useState<PermissaoTrabalho[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState<PTForm>(EMPTY)
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    getPermissoes()
      .then(setList)
      .catch(() => toast.error('Erro ao carregar permissões.'))
      .finally(() => setLoading(false))
  }, [])

  function setF(k: keyof PTForm, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function openModal() { setForm(EMPTY); setShowModal(true) }
  function closeModal() { setShowModal(false) }

  async function handleSave() {
    if (!form.setor)              { toast.error('Informe o setor.'); return }
    if (!form.descricaoServico)   { toast.error('Descreva o serviço.'); return }
    if (!form.responsavelServico) { toast.error('Informe o responsável.'); return }
    setSaving(true)
    try {
      await createPermissao({
        tipo:                form.tipo,
        data:                new Date(form.data + 'T12:00:00'),
        horaInicio:          form.horaInicio,
        horaFim:             form.horaFim,
        setor:               form.setor as PermissaoTrabalho['setor'],
        descricaoServico:    form.descricaoServico,
        empresaExecutora:    form.empresaExecutora || undefined,
        responsavelServico:  form.responsavelServico,
        supervisorSeguranca: form.supervisorSeguranca,
        riscos:              form.riscos.split('\n').filter(Boolean),
        medidas:             form.medidas.split('\n').filter(Boolean),
        episRequeridos:      form.episRequeridos.split('\n').filter(Boolean),
        status:              'solicitada',
      })
      toast.success('Permissão de trabalho criada.')
      closeModal()
      const updated = await getPermissoes()
      setList(updated)
    } catch { toast.error('Erro ao salvar.') }
    finally { setSaving(false) }
  }

  async function handleStatusChange(id: string, status: PermissaoTrabalho['status']) {
    try {
      await updatePermissao(id, { status })
      setList(prev => prev.map(p => p.id === id ? { ...p, status } : p))
      toast.success('Status atualizado.')
    } catch { toast.error('Erro ao atualizar status.') }
  }

  const filtered = list.filter(d => {
    const q = search.toLowerCase()
    return !q
      || d.numero.toLowerCase().includes(q)
      || d.descricaoServico.toLowerCase().includes(q)
      || d.setor.toLowerCase().includes(q)
      || d.responsavelServico.toLowerCase().includes(q)
  })

  const aguardando = list.filter(p => p.status === 'solicitada').length
  const aprovadas  = list.filter(p => p.status === 'aprovada').length
  const ativas     = list.filter(p => p.status === 'em_execucao').length

  const STATS = [
    { label: 'Total',        value: list.length, color: '#ea580c', icon: <Ic.Clipboard /> },
    { label: 'Aguardando',   value: aguardando,  color: '#3b82f6', icon: <Ic.AlertTri /> },
    { label: 'Aprovadas',    value: aprovadas,   color: '#16a34a', icon: <Ic.FileCheck /> },
    { label: 'Em execução',  value: ativas,      color: '#f59e0b', icon: <Ic.Shield />   },
  ]

  return (
    <div className={s.page}>

      {/* Header */}
      <div className={s.pageHeader}>
        <div className={s.headerLeft}>
          <Link to="/seguranca" className={s.backLink}><Ic.Back /> Segurança</Link>
          <div className={s.headerDivider} />
          <div>
            <h1 className={s.pageTitle}>Permissões de Trabalho</h1>
            <p className={s.pageSub}>Controle de permissões para trabalhos especiais e de risco</p>
          </div>
        </div>
        <button className={s.btnPrimary} onClick={openModal}><Ic.Plus /> Nova Permissão</button>
      </div>

      {/* Stats */}
      <div className={s.statsRow}>
        {STATS.map(st => (
          <div key={st.label} className={s.statCard} style={{ '--accent-color': st.color } as CSSProperties}>
            <div className={s.statAccent} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 9, background: st.color + '18', color: st.color, flexShrink: 0 }}>{st.icon}</div>
            <div className={s.statBody}>
              <div className={s.statValue} style={{ color: st.color }}>{st.value}</div>
              <div className={s.statLabel}>{st.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={s.filtersRow}>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}><Ic.Search /></span>
          <input
            className={s.searchInput}
            placeholder="Buscar por número, serviço, setor ou responsável…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className={s.filterDivider} />
        <span className={s.resultBadge}>{filtered.length} de {list.length}</span>
      </div>

      {/* List */}
      {loading ? (
        <div className={s.loadingWrap}><div className={s.spinnerLg} /></div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}><Ic.Clipboard /></div>
          <h3 className={s.emptyTitle}>{list.length === 0 ? 'Nenhuma permissão registrada' : 'Nenhuma permissão encontrada'}</h3>
          <p className={s.emptyDesc}>{list.length === 0 ? 'Crie a primeira permissão de trabalho.' : 'Ajuste os filtros de busca.'}</p>
          {list.length === 0 && (
            <button className={s.btnPrimary} onClick={openModal}><Ic.Plus /> Nova Permissão</button>
          )}
        </div>
      ) : (
        <div className={s.listCards}>
          {filtered.map(p => {
            const tMeta  = TIPO_PERMISSAO_META[p.tipo]
            const sMeta  = STATUS_PERMISSAO_META[p.status]
            const ptColor = STATUS_PT_COLOR[p.status]
            const canAct = p.status !== 'encerrada' && p.status !== 'cancelada'
            return (
              <div key={p.id} className={s.ptCard} style={{ '--pt-color': ptColor } as CSSProperties}>
                <div className={s.ptAccent} />

                <div className={s.ptTop}>
                  <div className={s.ptIconBox}>{tMeta.icon}</div>
                  <div className={s.ptMain}>
                    <div className={s.ptTitleRow}>
                      <span className={s.ptCode}>{p.numero}</span>
                      <span className={s.ptTipo}>{tMeta.label}</span>
                    </div>
                    <p className={s.ptDesc}>{p.descricaoServico}</p>
                  </div>
                  <div className={s.ptRight}>
                    <span className={s.ptStatus} style={{ color: sMeta.color, background: sMeta.color + '1a' }}>
                      {sMeta.label}
                    </span>
                    <span className={s.ptDate}>{fmt(p.data)} · {p.horaInicio}–{p.horaFim}</span>
                    <span className={s.ptSetor}>{p.setor}</span>
                  </div>
                </div>

                <div className={s.ptMeta}>
                  {p.responsavelServico && (
                    <span className={s.ptMetaItem}><Ic.User /> {p.responsavelServico}</span>
                  )}
                  {p.empresaExecutora && (
                    <span className={s.ptMetaItem}><Ic.MapPin /> {p.empresaExecutora}</span>
                  )}
                  <span className={s.ptMetaItem}><Ic.Clock /> {p.horaInicio}–{p.horaFim}</span>
                </div>

                {p.riscos.length > 0 && (
                  <div className={s.ptRiscos}>
                    {p.riscos.map((r, i) => <span key={i} className={s.riscoTag}>{r}</span>)}
                  </div>
                )}

                {canAct && (
                  <div className={s.ptActions}>
                    {p.status === 'solicitada' && (
                      <button className={s.btnAprov} onClick={() => handleStatusChange(p.id, 'aprovada')}>
                        <Ic.Check /> Aprovar
                      </button>
                    )}
                    {p.status === 'aprovada' && (
                      <button className={s.btnExec} onClick={() => handleStatusChange(p.id, 'em_execucao')}>
                        <Ic.Play /> Iniciar
                      </button>
                    )}
                    {p.status === 'em_execucao' && (
                      <button className={s.btnEnc} onClick={() => handleStatusChange(p.id, 'encerrada')}>
                        <Ic.Stop /> Encerrar
                      </button>
                    )}
                    <button className={s.btnCanc} onClick={() => handleStatusChange(p.id, 'cancelada')}>
                      <Ic.Ban /> Cancelar
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className={s.overlay} onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className={s.formModal}>
            <div className={s.modalHeader}>
              <div className={s.modalHeaderLeft}>
                <div className={s.modalIcon}><Ic.Clipboard /></div>
                <div>
                  <div className={s.modalLabel}>Nova Permissão</div>
                  <div className={s.modalTitle}>Permissão de Trabalho</div>
                </div>
              </div>
              <button className={s.modalCloseBtn} onClick={closeModal} aria-label="Fechar"><Ic.X /></button>
            </div>

            <div className={s.modalBody}>
              <div className={s.formGrid}>
                <div className={s.field}>
                  <label className={s.label}>Tipo *</label>
                  <select className={s.input} value={form.tipo} onChange={e => setF('tipo', e.target.value)}>
                    {TIPOS.map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
                <div className={s.field}>
                  <label className={s.label}>Data *</label>
                  <input type="date" className={s.input} value={form.data} onChange={e => setF('data', e.target.value)} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Hora início</label>
                  <input type="time" className={s.input} value={form.horaInicio} onChange={e => setF('horaInicio', e.target.value)} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Hora fim</label>
                  <input type="time" className={s.input} value={form.horaFim} onChange={e => setF('horaFim', e.target.value)} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Setor *</label>
                  <select className={s.input} value={form.setor} onChange={e => setF('setor', e.target.value)}>
                    <option value="">Selecione…</option>
                    {SETORES_FABRICA.map(sv => <option key={sv} value={sv}>{sv}</option>)}
                  </select>
                </div>
                <div className={s.field}>
                  <label className={s.label}>Empresa executora</label>
                  <input className={s.input} value={form.empresaExecutora} onChange={e => setF('empresaExecutora', e.target.value)} placeholder="Prestador / empresa" />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Responsável pelo serviço *</label>
                  <input className={s.input} value={form.responsavelServico} onChange={e => setF('responsavelServico', e.target.value)} placeholder="Nome completo" />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Supervisor de segurança</label>
                  <input className={s.input} value={form.supervisorSeguranca} onChange={e => setF('supervisorSeguranca', e.target.value)} placeholder="Nome do supervisor" />
                </div>
                <div className={`${s.field} ${s.fieldFull}`}>
                  <label className={s.label}>Descrição do serviço *</label>
                  <textarea className={s.textarea} rows={2} value={form.descricaoServico} onChange={e => setF('descricaoServico', e.target.value)} placeholder="Descreva o serviço a ser executado…" />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Riscos identificados (1 por linha)</label>
                  <textarea className={s.textarea} rows={3} value={form.riscos} onChange={e => setF('riscos', e.target.value)} placeholder={'Queda de altura\nChoque elétrico\n…'} />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Medidas de controle (1 por linha)</label>
                  <textarea className={s.textarea} rows={3} value={form.medidas} onChange={e => setF('medidas', e.target.value)} placeholder={'Cinto de segurança\nLOTO aplicado\n…'} />
                </div>
                <div className={`${s.field} ${s.fieldFull}`}>
                  <label className={s.label}>EPIs requeridos (1 por linha)</label>
                  <textarea className={s.textarea} rows={3} value={form.episRequeridos} onChange={e => setF('episRequeridos', e.target.value)} placeholder={'Capacete\nCinto paraquedista\n…'} />
                </div>
              </div>
            </div>

            <div className={s.modalFooter}>
              <button className={s.btnGhost} onClick={closeModal} disabled={saving}>Cancelar</button>
              <button className={s.btnPrimary} onClick={handleSave} disabled={saving}>
                {saving ? <span className={s.spinner} /> : <Ic.Clipboard />}
                {saving ? 'Salvando…' : 'Criar permissão'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

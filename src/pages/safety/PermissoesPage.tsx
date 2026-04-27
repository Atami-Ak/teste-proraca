import { useState, useEffect } from 'react'
import { getPermissoes, createPermissao, updatePermissao } from '@/lib/db-safety'
import type { PermissaoTrabalho } from '@/types/safety'
import { TIPO_PERMISSAO_META, STATUS_PERMISSAO_META, SETORES_FABRICA } from '@/types/safety'
import { toast } from '@/components/ui/Toast'
import s from './PermissoesPage.module.css'

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

export default function PermissoesPage() {
  const [list, setList]       = useState<PermissaoTrabalho[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState<PTForm>(EMPTY)
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    getPermissoes()
      .then(setList)
      .catch(() => toast.error('Erro ao carregar permissões.'))
      .finally(() => setLoading(false))
  }, [])

  function setF(k: keyof PTForm, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSave() {
    if (!form.setor)             { toast.error('Informe o setor.'); return }
    if (!form.descricaoServico)  { toast.error('Descreva o serviço.'); return }
    if (!form.responsavelServico){ toast.error('Informe o responsável.'); return }

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
      setShowForm(false)
      setForm(EMPTY)
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
    return !q || d.numero.toLowerCase().includes(q) || d.descricaoServico.toLowerCase().includes(q) || d.setor.toLowerCase().includes(q)
  })

  const ativas  = list.filter(p => p.status === 'em_execucao').length
  const aguardando = list.filter(p => p.status === 'solicitada').length
  const aprovadas  = list.filter(p => p.status === 'aprovada').length

  return (
    <div className={s.page}>

      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>📋 Permissões de Trabalho</h1>
          <p className={s.pageSub}>Controle de permissões para trabalhos especiais e de risco</p>
        </div>
        <button className={s.btnPrimary} onClick={() => setShowForm(v => !v)}>
          {showForm ? '× Cancelar' : '+ Nova Permissão'}
        </button>
      </div>

      <div className={s.statsRow}>
        <div className={s.statCard}><span className={s.statValue}>{list.length}</span><span className={s.statLabel}>Total</span></div>
        <div className={s.statCard}><span className={s.statValue} style={{ color: '#d97706' }}>{aguardando}</span><span className={s.statLabel}>Aguardando</span></div>
        <div className={s.statCard}><span className={s.statValue} style={{ color: '#16a34a' }}>{aprovadas}</span><span className={s.statLabel}>Aprovadas</span></div>
        <div className={s.statCard}><span className={s.statValue} style={{ color: '#ea580c' }}>{ativas}</span><span className={s.statLabel}>Em execução</span></div>
      </div>

      {/* Form */}
      {showForm && (
        <div className={s.formCard}>
          <div className={s.formTitle}>Nova Permissão de Trabalho</div>
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
              <label className={s.label}>Início</label>
              <input type="time" className={s.input} value={form.horaInicio} onChange={e => setF('horaInicio', e.target.value)} />
            </div>
            <div className={s.field}>
              <label className={s.label}>Fim</label>
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
              <input className={s.input} value={form.responsavelServico} onChange={e => setF('responsavelServico', e.target.value)} placeholder="Nome" />
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
              <textarea className={s.textarea} rows={3} value={form.riscos} onChange={e => setF('riscos', e.target.value)} placeholder="Queda&#10;Choque elétrico&#10;…" />
            </div>
            <div className={s.field}>
              <label className={s.label}>Medidas de controle (1 por linha)</label>
              <textarea className={s.textarea} rows={3} value={form.medidas} onChange={e => setF('medidas', e.target.value)} placeholder="Cinto de segurança&#10;LOTO aplicado&#10;…" />
            </div>
            <div className={s.field}>
              <label className={s.label}>EPIs requeridos (1 por linha)</label>
              <textarea className={s.textarea} rows={3} value={form.episRequeridos} onChange={e => setF('episRequeridos', e.target.value)} placeholder="Capacete&#10;Cinto paraquedista&#10;…" />
            </div>
          </div>
          <button className={s.btnSave} disabled={saving} onClick={handleSave}>
            {saving ? <span className={s.spinner} /> : '📋'} Criar permissão
          </button>
        </div>
      )}

      {/* Filters */}
      <div className={s.filtersRow}>
        <input className={s.searchInput} placeholder="Buscar por número, serviço ou setor…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* List */}
      {loading ? (
        <div className={s.loadingWrap}><div className={s.spinnerLg} /></div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <span className={s.emptyIcon}>📋</span>
          <p>{list.length === 0 ? 'Nenhuma permissão registrada.' : 'Nenhuma permissão encontrada.'}</p>
        </div>
      ) : (
        <div className={s.listCards}>
          {filtered.map(p => {
            const tMeta = TIPO_PERMISSAO_META[p.tipo]
            const sMeta = STATUS_PERMISSAO_META[p.status]
            return (
              <div key={p.id} className={s.ptCard}>
                <div className={s.ptTop}>
                  <span className={s.ptIcon}>{tMeta.icon}</span>
                  <div className={s.ptMain}>
                    <div className={s.ptTitle}>
                      <span className={s.ptCode}>{p.numero}</span>
                      <span className={s.ptTipo}>{tMeta.label}</span>
                    </div>
                    <p className={s.ptDesc}>{p.descricaoServico}</p>
                  </div>
                  <div className={s.ptRight}>
                    <span className={s.ptStatus} style={{ color: sMeta.color, background: `${sMeta.color}1a` }}>{sMeta.label}</span>
                    <span className={s.ptDate}>{fmt(p.data)} {p.horaInicio}–{p.horaFim}</span>
                    <span className={s.ptSetor}>{p.setor}</span>
                  </div>
                </div>

                {/* Quick status actions */}
                {p.status !== 'encerrada' && p.status !== 'cancelada' && (
                  <div className={s.ptActions}>
                    {p.status === 'solicitada' && (
                      <button className={s.btnAprov} onClick={() => handleStatusChange(p.id, 'aprovada')}>✓ Aprovar</button>
                    )}
                    {p.status === 'aprovada' && (
                      <button className={s.btnExec} onClick={() => handleStatusChange(p.id, 'em_execucao')}>▶ Iniciar</button>
                    )}
                    {p.status === 'em_execucao' && (
                      <button className={s.btnEnc} onClick={() => handleStatusChange(p.id, 'encerrada')}>✓ Encerrar</button>
                    )}
                    <button className={s.btnCanc} onClick={() => handleStatusChange(p.id, 'cancelada')}>✕ Cancelar</button>
                  </div>
                )}

                {p.riscos.length > 0 && (
                  <div className={s.ptRiscos}>
                    {p.riscos.map((r, i) => <span key={i} className={s.riscoTag}>{r}</span>)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}

import { useState, useEffect } from 'react'
import { getOcorrencias, createOcorrencia, updateOcorrencia } from '@/lib/db-safety'
import { useStore } from '@/store/useStore'
import type { Ocorrencia } from '@/types/safety'
import { TIPO_OCORRENCIA_META, SETORES_FABRICA } from '@/types/safety'
import { toast } from '@/components/ui/Toast'
import s from './OcorrenciasPage.module.css'

function fmt(d: Date | undefined): string {
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR')
}

type OcForm = {
  tipo:             Ocorrencia['tipo']
  data:             string
  hora:             string
  setor:            string
  colaboradorNome:  string
  descricao:        string
  causaImediata:    string
  severidade:       Ocorrencia['severidade']
  responsavel:      string
  status:           Ocorrencia['status']
}

const EMPTY: OcForm = {
  tipo:            'quase_acidente',
  data:            new Date().toISOString().split('T')[0],
  hora:            new Date().toTimeString().slice(0, 5),
  setor:           '',
  colaboradorNome: '',
  descricao:       '',
  causaImediata:   '',
  severidade:      'media',
  responsavel:     '',
  status:          'aberta',
}

export default function OcorrenciasPage() {
  const user = useStore(st => st.user)

  const [list, setList]       = useState<Ocorrencia[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState<OcForm>(EMPTY)
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    getOcorrencias()
      .then(setList)
      .catch(() => toast.error('Erro ao carregar ocorrências.'))
      .finally(() => setLoading(false))
  }, [])

  function setF(k: keyof OcForm, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSave() {
    if (!form.setor)     { toast.error('Informe o setor.'); return }
    if (!form.descricao) { toast.error('Descreva a ocorrência.'); return }
    if (!form.responsavel) { toast.error('Informe o responsável.'); return }

    setSaving(true)
    try {
      await createOcorrencia({
        tipo:            form.tipo,
        data:            new Date(form.data + 'T12:00:00'),
        hora:            form.hora,
        setor:           form.setor as Ocorrencia['setor'],
        colaboradorNome: form.colaboradorNome || undefined,
        descricao:       form.descricao,
        causaImediata:   form.causaImediata || undefined,
        severidade:      form.severidade,
        responsavel:     form.responsavel,
        status:          'aberta',
        createdBy:       user?.uid,
      })
      toast.success('Ocorrência registrada.')
      setShowForm(false)
      setForm(EMPTY)
      const updated = await getOcorrencias()
      setList(updated)
    } catch { toast.error('Erro ao salvar.') }
    finally { setSaving(false) }
  }

  async function handleClose(id: string) {
    if (!confirm('Encerrar esta ocorrência?')) return
    try {
      await updateOcorrencia(id, { status: 'encerrada' })
      setList(prev => prev.map(o => o.id === id ? { ...o, status: 'encerrada' } : o))
      toast.success('Ocorrência encerrada.')
    } catch { toast.error('Erro ao encerrar.') }
  }

  const filtered = list.filter(d => {
    const q = search.toLowerCase()
    const matchQ = !q || d.numero.toLowerCase().includes(q) || d.descricao.toLowerCase().includes(q) || d.setor.toLowerCase().includes(q)
    const matchT = !filterTipo || d.tipo === filterTipo
    return matchQ && matchT
  })

  const abertas = list.filter(o => o.status !== 'encerrada').length
  const acidentes = list.filter(o => o.tipo.startsWith('acidente')).length
  const quaseAcidentes = list.filter(o => o.tipo === 'quase_acidente').length

  const TIPOS = Object.entries(TIPO_OCORRENCIA_META) as [Ocorrencia['tipo'], typeof TIPO_OCORRENCIA_META[keyof typeof TIPO_OCORRENCIA_META]][]

  const STATUS_COLORS: Record<Ocorrencia['status'], string> = {
    aberta: '#dc2626', em_investigacao: '#d97706', encerrada: '#94a3b8'
  }
  const STATUS_LABELS: Record<Ocorrencia['status'], string> = {
    aberta: 'Aberta', em_investigacao: 'Em investigação', encerrada: 'Encerrada'
  }

  return (
    <div className={s.page}>

      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>🚨 Ocorrências e Incidentes</h1>
          <p className={s.pageSub}>Registro de acidentes, quase acidentes e condições inseguras</p>
        </div>
        <button className={s.btnPrimary} onClick={() => setShowForm(v => !v)}>
          {showForm ? '× Cancelar' : '🚨 Registrar ocorrência'}
        </button>
      </div>

      <div className={s.statsRow}>
        <div className={s.statCard}>
          <span className={s.statValue}>{list.length}</span>
          <span className={s.statLabel}>Total</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statValue} style={{ color: abertas > 0 ? '#dc2626' : '#16a34a' }}>{abertas}</span>
          <span className={s.statLabel}>Em aberto</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statValue} style={{ color: '#7f1d1d' }}>{acidentes}</span>
          <span className={s.statLabel}>Acidentes</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statValue} style={{ color: '#ea580c' }}>{quaseAcidentes}</span>
          <span className={s.statLabel}>Quase acidentes</span>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className={s.formCard}>
          <div className={s.formTitle}>🚨 Nova Ocorrência</div>
          <div className={s.formGrid}>
            <div className={s.field}>
              <label className={s.label}>Tipo *</label>
              <select className={s.input} value={form.tipo} onChange={e => setF('tipo', e.target.value)}>
                {TIPOS.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label}>Data *</label>
              <input type="date" className={s.input} value={form.data} onChange={e => setF('data', e.target.value)} />
            </div>
            <div className={s.field}>
              <label className={s.label}>Hora</label>
              <input type="time" className={s.input} value={form.hora} onChange={e => setF('hora', e.target.value)} />
            </div>
            <div className={s.field}>
              <label className={s.label}>Setor *</label>
              <select className={s.input} value={form.setor} onChange={e => setF('setor', e.target.value)}>
                <option value="">Selecione…</option>
                {SETORES_FABRICA.map(sv => <option key={sv} value={sv}>{sv}</option>)}
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
              <label className={s.label}>Colaborador envolvido</label>
              <input className={s.input} value={form.colaboradorNome} onChange={e => setF('colaboradorNome', e.target.value)} placeholder="Nome (se aplicável)" />
            </div>
            <div className={`${s.field} ${s.fieldFull}`}>
              <label className={s.label}>Descrição da ocorrência *</label>
              <textarea className={s.textarea} rows={3} value={form.descricao} onChange={e => setF('descricao', e.target.value)} placeholder="Descreva o que aconteceu, onde, como…" />
            </div>
            <div className={`${s.field} ${s.fieldFull}`}>
              <label className={s.label}>Causa imediata</label>
              <textarea className={s.textarea} rows={2} value={form.causaImediata} onChange={e => setF('causaImediata', e.target.value)} placeholder="Qual foi a causa direta do evento?" />
            </div>
            <div className={s.field}>
              <label className={s.label}>Responsável pelo acompanhamento *</label>
              <input className={s.input} value={form.responsavel} onChange={e => setF('responsavel', e.target.value)} placeholder="Nome do responsável" />
            </div>
          </div>
          <button className={s.btnSave} disabled={saving} onClick={handleSave}>
            {saving ? <span className={s.spinner} /> : '🚨'} Registrar ocorrência
          </button>
        </div>
      )}

      {/* Filters */}
      <div className={s.filtersRow}>
        <input className={s.searchInput} placeholder="Buscar por número, descrição ou setor…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className={s.filterSelect} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {TIPOS.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className={s.loadingWrap}><div className={s.spinnerLg} /></div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <span className={s.emptyIcon}>🚨</span>
          <p>{list.length === 0 ? 'Nenhuma ocorrência registrada.' : 'Nenhuma ocorrência encontrada.'}</p>
        </div>
      ) : (
        <div className={s.listCards}>
          {filtered.map(o => {
            const tMeta = TIPO_OCORRENCIA_META[o.tipo]
            const sColor = STATUS_COLORS[o.status]
            return (
              <div key={o.id} className={s.ocCard}>
                <div className={s.ocTop}>
                  <span className={s.ocCode}>{o.numero}</span>
                  <span className={s.ocTipo} style={{ color: tMeta.color, background: tMeta.bg }}>{tMeta.label}</span>
                  <span className={s.ocStatus} style={{ color: sColor, background: `${sColor}1a` }}>{STATUS_LABELS[o.status]}</span>
                  <span className={s.ocDate}>{fmt(o.data)} {o.hora}</span>
                </div>
                <p className={s.ocDesc}>{o.descricao}</p>
                <div className={s.ocMeta}>
                  <span>📍 {o.setor}</span>
                  {o.colaboradorNome && <span>👤 {o.colaboradorNome}</span>}
                  <span>👔 {o.responsavel}</span>
                  <span className={s.sevTag} data-sev={o.severidade}>{o.severidade}</span>
                </div>
                {o.status !== 'encerrada' && (
                  <div className={s.ocActions}>
                    <button className={s.btnClose} onClick={() => handleClose(o.id)}>✓ Encerrar</button>
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

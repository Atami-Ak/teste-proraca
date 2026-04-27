import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createObra, updateObra, getObra, getEmpreiteiras } from '@/lib/db-obras'
import { toast } from '@/components/ui/Toast'
import type { Obra, ObraStatus, Empreiteira } from '@/types/obras'
import { OBRA_TIPOS } from '@/types/obras'
import type { Priority } from '@/types'
import s from './ObraFormPage.module.css'

type FormState = {
  nome:                string
  empreiteiraId:       string
  descricao:           string
  local:               string
  tipo:                string
  status:              ObraStatus
  prioridade:          Priority
  percentualConcluido: number
  valorContrato:       string
  valorAditivos:       string
  valorPago:           string
  dataInicio:          string
  dataFimPrevisto:     string
  responsavelInterno:  string
}

const EMPTY: FormState = {
  nome:                '',
  empreiteiraId:       '',
  descricao:           '',
  local:               '',
  tipo:                'Construção Civil',
  status:              'planejamento',
  prioridade:          'normal',
  percentualConcluido: 0,
  valorContrato:       '',
  valorAditivos:       '',
  valorPago:           '',
  dataInicio:          '',
  dataFimPrevisto:     '',
  responsavelInterno:  '',
}

function toIsoDate(d?: Date) {
  if (!d) return ''
  return d.toISOString().split('T')[0]
}

export default function ObraFormPage() {
  const navigate    = useNavigate()
  const { obraId }  = useParams<{ obraId: string }>()
  const isEdit      = Boolean(obraId)

  const [form,         setForm]         = useState<FormState>(EMPTY)
  const [empreiteiras, setEmpreiteiras] = useState<Empreiteira[]>([])
  const [loading,      setLoading]      = useState(isEdit)
  const [saving,       setSaving]       = useState(false)
  const [errors,       setErrors]       = useState<Partial<Record<keyof FormState, string>>>({})

  useEffect(() => {
    getEmpreiteiras().then(setEmpreiteiras).catch(() => {})
    if (isEdit && obraId) {
      getObra(obraId)
        .then(obra => {
          if (!obra) { toast.error('Obra não encontrada'); navigate('/obras'); return }
          setForm({
            nome:                obra.nome,
            empreiteiraId:       obra.empreiteiraId ?? '',
            descricao:           obra.descricao ?? '',
            local:               obra.local,
            tipo:                obra.tipo,
            status:              obra.status,
            prioridade:          obra.prioridade,
            percentualConcluido: obra.percentualConcluido,
            valorContrato:       obra.valorContrato?.toString() ?? '',
            valorAditivos:       obra.valorAditivos?.toString() ?? '',
            valorPago:           obra.valorPago?.toString() ?? '',
            dataInicio:          toIsoDate(obra.dataInicio),
            dataFimPrevisto:     toIsoDate(obra.dataFimPrevisto),
            responsavelInterno:  obra.responsavelInterno ?? '',
          })
        })
        .catch(() => { toast.error('Erro ao carregar obra'); navigate('/obras') })
        .finally(() => setLoading(false))
    }
  }, [obraId, isEdit, navigate])

  function set(field: keyof FormState, value: string | number) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: undefined }))
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.nome.trim())  e.nome  = 'Nome é obrigatório'
    if (!form.local.trim()) e.local = 'Local é obrigatório'
    if (!form.tipo.trim())  e.tipo  = 'Tipo é obrigatório'
    if (form.percentualConcluido < 0 || form.percentualConcluido > 100)
      e.percentualConcluido = 'Deve ser entre 0 e 100'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      const payload: Omit<Obra, 'id' | 'codigo' | 'createdAt' | 'updatedAt'> = {
        nome:                form.nome.trim(),
        local:               form.local.trim(),
        tipo:                form.tipo,
        status:              form.status,
        prioridade:          form.prioridade,
        percentualConcluido: Number(form.percentualConcluido),
        descricao:           form.descricao.trim() || undefined,
        empreiteiraId:       form.empreiteiraId || undefined,
        empreiteiraNome:     form.empreiteiraId
          ? empreiteiras.find(e => e.id === form.empreiteiraId)?.nome
          : undefined,
        valorContrato:       form.valorContrato ? Number(form.valorContrato) : undefined,
        valorAditivos:       form.valorAditivos ? Number(form.valorAditivos) : undefined,
        valorPago:           form.valorPago     ? Number(form.valorPago)     : undefined,
        dataInicio:          form.dataInicio    ? new Date(form.dataInicio + 'T12:00:00') : undefined,
        dataFimPrevisto:     form.dataFimPrevisto ? new Date(form.dataFimPrevisto + 'T12:00:00') : undefined,
        responsavelInterno:  form.responsavelInterno.trim() || undefined,
      }
      if (isEdit && obraId) {
        await updateObra(obraId, payload)
        toast.success('Obra atualizada com sucesso!')
        navigate(`/obras/${obraId}`)
      } else {
        const newId = await createObra(payload)
        toast.success('Obra criada com sucesso!')
        navigate(`/obras/${newId}`)
      }
    } catch {
      toast.error('Erro ao salvar obra. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className={s.loader}>Carregando…</div>

  return (
    <div className={s.page}>
      <div className={s.formCard}>

        {/* ── Card header ── */}
        <div className={s.cardHeader}>
          <button className={s.backBtn} onClick={() => navigate(isEdit && obraId ? `/obras/${obraId}` : '/obras')}>
            ← Voltar
          </button>
          <div>
            <h1 className={s.cardTitle}>{isEdit ? 'Editar Obra' : 'Nova Obra'}</h1>
            <p className={s.cardSub}>{isEdit ? 'Atualize os dados da obra' : 'Preencha os dados para registrar uma nova obra'}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>

          {/* ── Identificação ── */}
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Identificação</h2>
            <div className={s.grid2}>
              <div className={`${s.field} ${s.span2}`}>
                <label className={s.label}>Nome da Obra *</label>
                <input className={`${s.input} ${errors.nome ? s.inputError : ''}`}
                  value={form.nome} onChange={e => set('nome', e.target.value)}
                  placeholder="Ex: Ampliação do Galpão B" />
                {errors.nome && <span className={s.error}>{errors.nome}</span>}
              </div>
              <div className={s.field}>
                <label className={s.label}>Local / Endereço *</label>
                <input className={`${s.input} ${errors.local ? s.inputError : ''}`}
                  value={form.local} onChange={e => set('local', e.target.value)}
                  placeholder="Setor A, Bloco 2…" />
                {errors.local && <span className={s.error}>{errors.local}</span>}
              </div>
              <div className={s.field}>
                <label className={s.label}>Tipo de Obra *</label>
                <select className={s.input} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                  {OBRA_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className={`${s.field} ${s.span2}`}>
                <label className={s.label}>Descrição</label>
                <textarea className={s.textarea} rows={3}
                  value={form.descricao} onChange={e => set('descricao', e.target.value)}
                  placeholder="Detalhes do escopo, objetivos e especificações…" />
              </div>
            </div>
          </section>

          {/* ── Empreiteira & Responsáveis ── */}
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Empreiteira & Responsáveis</h2>
            <div className={s.grid2}>
              <div className={s.field}>
                <label className={s.label}>Empreiteira Contratada</label>
                <select className={s.input} value={form.empreiteiraId} onChange={e => set('empreiteiraId', e.target.value)}>
                  <option value="">Selecionar empreiteira…</option>
                  {empreiteiras.filter(e => e.ativo).map(e => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
              </div>
              <div className={s.field}>
                <label className={s.label}>Responsável Interno</label>
                <input className={s.input}
                  value={form.responsavelInterno} onChange={e => set('responsavelInterno', e.target.value)}
                  placeholder="Nome do supervisor interno" />
              </div>
            </div>
          </section>

          {/* ── Status & Controle ── */}
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Status & Progresso</h2>
            <div className={s.grid3}>
              <div className={s.field}>
                <label className={s.label}>Status</label>
                <select className={s.input} value={form.status} onChange={e => set('status', e.target.value as ObraStatus)}>
                  <option value="planejamento">Planejamento</option>
                  <option value="em_andamento">Em Andamento</option>
                  <option value="paralisada">Paralisada</option>
                  <option value="concluida">Concluída</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </div>
              <div className={s.field}>
                <label className={s.label}>Prioridade</label>
                <select className={s.input} value={form.prioridade} onChange={e => set('prioridade', e.target.value as Priority)}>
                  <option value="low">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="critical">Crítica</option>
                </select>
              </div>
              <div className={s.field}>
                <label className={s.label}>% Concluído</label>
                <div className={s.progressInput}>
                  <input className={`${s.input} ${errors.percentualConcluido ? s.inputError : ''}`}
                    type="number" min={0} max={100}
                    value={form.percentualConcluido}
                    onChange={e => set('percentualConcluido', Number(e.target.value))} />
                  <span className={s.pctSuffix}>%</span>
                </div>
                {errors.percentualConcluido && <span className={s.error}>{errors.percentualConcluido}</span>}
              </div>
            </div>
          </section>

          {/* ── Cronograma ── */}
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Cronograma</h2>
            <div className={s.grid3}>
              <div className={s.field}>
                <label className={s.label}>Data de Início</label>
                <input className={s.input} type="date"
                  value={form.dataInicio} onChange={e => set('dataInicio', e.target.value)} />
              </div>
              <div className={s.field}>
                <label className={s.label}>Prazo Previsto</label>
                <input className={s.input} type="date"
                  value={form.dataFimPrevisto} onChange={e => set('dataFimPrevisto', e.target.value)} />
              </div>
            </div>
          </section>

          {/* ── Financeiro ── */}
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Financeiro</h2>
            <div className={s.grid3}>
              <div className={s.field}>
                <label className={s.label}>Valor do Contrato (R$)</label>
                <input className={s.input} type="number" min={0} step="0.01"
                  value={form.valorContrato} onChange={e => set('valorContrato', e.target.value)}
                  placeholder="0,00" />
              </div>
              <div className={s.field}>
                <label className={s.label}>Aditivos (R$)</label>
                <input className={s.input} type="number" min={0} step="0.01"
                  value={form.valorAditivos} onChange={e => set('valorAditivos', e.target.value)}
                  placeholder="0,00" />
              </div>
              <div className={s.field}>
                <label className={s.label}>Valor Pago (R$)</label>
                <input className={s.input} type="number" min={0} step="0.01"
                  value={form.valorPago} onChange={e => set('valorPago', e.target.value)}
                  placeholder="0,00" />
              </div>
            </div>
          </section>

          {/* ── Actions ── */}
          <div className={s.actions}>
            <button type="button" className={s.cancelBtn}
              onClick={() => navigate(isEdit && obraId ? `/obras/${obraId}` : '/obras')}>
              Cancelar
            </button>
            <button type="submit" className={s.submitBtn} disabled={saving}>
              {saving ? 'Salvando…' : isEdit ? 'Salvar Alterações' : 'Criar Obra'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}

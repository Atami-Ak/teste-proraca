import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createObra, updateObra, getObra, getEmpreiteiras } from '@/lib/db-obras'
import { toast } from '@/components/ui/Toast'
import type { Obra, ObraStatus, Empreiteira } from '@/types/obras'
import { OBRA_TIPOS, OBRA_STATUS_META } from '@/types/obras'
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
  nome: '', empreiteiraId: '', descricao: '', local: '',
  tipo: 'Construção Civil', status: 'planejamento', prioridade: 'normal',
  percentualConcluido: 0, valorContrato: '', valorAditivos: '', valorPago: '',
  dataInicio: '', dataFimPrevisto: '', responsavelInterno: '',
}

function toIsoDate(d?: Date) {
  if (!d) return ''
  return d.toISOString().split('T')[0]
}

function fmtCurrencyPreview(v: string) {
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  low:      { label: 'Baixa',    color: '#94a3b8' },
  normal:   { label: 'Normal',   color: '#3b82f6' },
  high:     { label: 'Alta',     color: '#d97706' },
  critical: { label: 'Crítica',  color: '#dc2626' },
  bloqueante: { label: 'Bloqueante', color: '#7c3aed' },
}

export default function ObraFormPage() {
  const navigate   = useNavigate()
  const { obraId } = useParams<{ obraId: string }>()
  const isEdit     = Boolean(obraId)

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
        valorContrato:   form.valorContrato  ? Number(form.valorContrato)  : undefined,
        valorAditivos:   form.valorAditivos  ? Number(form.valorAditivos)  : undefined,
        valorPago:       form.valorPago      ? Number(form.valorPago)      : undefined,
        dataInicio:      form.dataInicio     ? new Date(form.dataInicio     + 'T12:00:00') : undefined,
        dataFimPrevisto: form.dataFimPrevisto? new Date(form.dataFimPrevisto+ 'T12:00:00') : undefined,
        responsavelInterno: form.responsavelInterno.trim() || undefined,
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

  if (loading) return <div className={s.loader}><div className={s.loaderSpinner} /></div>

  const statusMeta    = OBRA_STATUS_META[form.status]
  const priorityMeta  = PRIORITY_META[form.prioridade]
  const empSelecionada= empreiteiras.find(e => e.id === form.empreiteiraId)
  const orcTotal      = (parseFloat(form.valorContrato) || 0) + (parseFloat(form.valorAditivos) || 0)
  const pctCor        = form.percentualConcluido >= 80 ? '#16a34a' : form.percentualConcluido >= 40 ? '#d97706' : '#ea580c'

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.pageHeader}>
        <button className={s.backBtn} onClick={() => navigate(isEdit && obraId ? `/obras/${obraId}` : '/obras')}>
          ← Voltar
        </button>
        <div className={s.headerLeft}>
          <div className={s.headerIconWrap}>🏗️</div>
          <div>
            <h1 className={s.pageTitle}>{isEdit ? 'Editar Obra' : 'Nova Obra'}</h1>
            <p className={s.pageSub}>{isEdit ? 'Atualize os dados da obra' : 'Preencha os dados para registrar uma nova obra'}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className={s.formLayout}>

        {/* ── Left: Fields ── */}
        <div className={s.fieldsCol}>

          {/* Identificação */}
          <div className={s.section}>
            <div className={s.sectionHeader}>
              <span className={s.sectionIcon}>🏗️</span>
              <span className={s.sectionTitle}>Identificação</span>
            </div>
            <div className={s.grid2}>
              <div className={`${s.field} ${s.span2}`}>
                <label className={s.label}>Nome da Obra <span className={s.req}>*</span></label>
                <input
                  className={`${s.input} ${errors.nome ? s.inputError : ''}`}
                  value={form.nome}
                  onChange={e => set('nome', e.target.value)}
                  placeholder="Ex: Ampliação do Galpão B"
                />
                {errors.nome && <span className={s.errorMsg}>⚠ {errors.nome}</span>}
              </div>
              <div className={s.field}>
                <label className={s.label}>Local / Endereço <span className={s.req}>*</span></label>
                <input
                  className={`${s.input} ${errors.local ? s.inputError : ''}`}
                  value={form.local}
                  onChange={e => set('local', e.target.value)}
                  placeholder="Setor A, Bloco 2…"
                />
                {errors.local && <span className={s.errorMsg}>⚠ {errors.local}</span>}
              </div>
              <div className={s.field}>
                <label className={s.label}>Tipo de Obra <span className={s.req}>*</span></label>
                <select className={s.input} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                  {OBRA_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className={`${s.field} ${s.span2}`}>
                <label className={s.label}>Descrição</label>
                <textarea
                  className={s.textarea} rows={3}
                  value={form.descricao}
                  onChange={e => set('descricao', e.target.value)}
                  placeholder="Detalhes do escopo, objetivos e especificações…"
                />
              </div>
            </div>
          </div>

          {/* Empreiteira */}
          <div className={s.section}>
            <div className={s.sectionHeader}>
              <span className={s.sectionIcon}>👷</span>
              <span className={s.sectionTitle}>Empreiteira & Responsável</span>
            </div>
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
                <input
                  className={s.input}
                  value={form.responsavelInterno}
                  onChange={e => set('responsavelInterno', e.target.value)}
                  placeholder="Nome do supervisor"
                />
              </div>
            </div>
          </div>

          {/* Status & Progresso */}
          <div className={s.section}>
            <div className={s.sectionHeader}>
              <span className={s.sectionIcon}>📊</span>
              <span className={s.sectionTitle}>Status & Progresso</span>
            </div>
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
                <div className={s.pctInputWrap}>
                  <input
                    className={`${s.input} ${errors.percentualConcluido ? s.inputError : ''}`}
                    type="number" min={0} max={100}
                    value={form.percentualConcluido}
                    onChange={e => set('percentualConcluido', Number(e.target.value))}
                  />
                  <span className={s.pctSuffix}>%</span>
                </div>
                {errors.percentualConcluido && <span className={s.errorMsg}>⚠ {errors.percentualConcluido}</span>}
              </div>
            </div>
            <div className={s.progressPreview}>
              <div className={s.progressTrack}>
                <div className={s.progressFill} style={{ width: `${form.percentualConcluido}%`, background: pctCor }} />
              </div>
              <span className={s.progressLabel} style={{ color: pctCor }}>{form.percentualConcluido}%</span>
            </div>
          </div>

          {/* Cronograma */}
          <div className={s.section}>
            <div className={s.sectionHeader}>
              <span className={s.sectionIcon}>📅</span>
              <span className={s.sectionTitle}>Cronograma</span>
            </div>
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
          </div>

          {/* Financeiro */}
          <div className={s.section}>
            <div className={s.sectionHeader}>
              <span className={s.sectionIcon}>💰</span>
              <span className={s.sectionTitle}>Financeiro</span>
            </div>
            <div className={s.grid3}>
              <div className={s.field}>
                <label className={s.label}>Valor do Contrato (R$)</label>
                <input className={s.input} type="number" min={0} step="0.01"
                  value={form.valorContrato}
                  onChange={e => set('valorContrato', e.target.value)}
                  placeholder="0,00" />
              </div>
              <div className={s.field}>
                <label className={s.label}>Aditivos (R$)</label>
                <input className={s.input} type="number" min={0} step="0.01"
                  value={form.valorAditivos}
                  onChange={e => set('valorAditivos', e.target.value)}
                  placeholder="0,00" />
              </div>
              <div className={s.field}>
                <label className={s.label}>Valor Pago (R$)</label>
                <input className={s.input} type="number" min={0} step="0.01"
                  value={form.valorPago}
                  onChange={e => set('valorPago', e.target.value)}
                  placeholder="0,00" />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className={s.actions}>
            <button
              type="button" className={s.cancelBtn}
              onClick={() => navigate(isEdit && obraId ? `/obras/${obraId}` : '/obras')}
            >
              Cancelar
            </button>
            <button type="submit" className={s.submitBtn} disabled={saving}>
              {saving
                ? <><div className={s.btnSpinner} /> Salvando…</>
                : isEdit ? '💾 Salvar Alterações' : '+ Criar Obra'}
            </button>
          </div>
        </div>

        {/* ── Right: Summary Panel ── */}
        <div className={s.summaryCol}>
          <div className={s.summaryCard}>
            <div className={s.summaryHeader}>🏗️ Resumo</div>

            <div className={s.summarySection}>
              <div className={s.summaryItem}>
                <span className={s.summaryLabel}>Status</span>
                <span className={s.summaryBadge} style={{ color: statusMeta.color, background: statusMeta.bg }}>
                  {statusMeta.label}
                </span>
              </div>
              <div className={s.summaryItem}>
                <span className={s.summaryLabel}>Prioridade</span>
                <span className={s.summaryValue} style={{ color: priorityMeta.color, fontWeight: 700 }}>
                  {priorityMeta.label}
                </span>
              </div>
            </div>

            {empSelecionada && (
              <div className={s.summarySection}>
                <div className={s.summaryLabel}>Empreiteira</div>
                <div className={s.summaryEmp}>👷 {empSelecionada.nome}</div>
              </div>
            )}

            {(form.valorContrato || form.valorAditivos) && (
              <div className={s.summarySection}>
                <div className={s.summaryLabel}>Financeiro</div>
                <div className={s.summaryItem}>
                  <span className={s.summaryLabel}>Contrato</span>
                  <span className={s.summaryValue}>{fmtCurrencyPreview(form.valorContrato)}</span>
                </div>
                {form.valorAditivos && (
                  <div className={s.summaryItem}>
                    <span className={s.summaryLabel}>Aditivos</span>
                    <span className={s.summaryValue}>{fmtCurrencyPreview(form.valorAditivos)}</span>
                  </div>
                )}
                {orcTotal > 0 && (
                  <div className={s.summaryItem}>
                    <span className={s.summaryLabel}>Total</span>
                    <span className={s.summaryValueBold}>{orcTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</span>
                  </div>
                )}
              </div>
            )}

            <div className={s.summarySection}>
              <div className={s.summaryLabel}>Progresso</div>
              <div className={s.summaryProgressWrap}>
                <div className={s.summaryProgressTrack}>
                  <div className={s.summaryProgressFill} style={{ width: `${form.percentualConcluido}%`, background: pctCor }} />
                </div>
                <span className={s.summaryProgressLabel} style={{ color: pctCor }}>{form.percentualConcluido}%</span>
              </div>
            </div>

            {(form.dataInicio || form.dataFimPrevisto) && (
              <div className={s.summarySection}>
                <div className={s.summaryLabel}>Cronograma</div>
                {form.dataInicio && (
                  <div className={s.summaryItem}>
                    <span className={s.summaryLabel}>Início</span>
                    <span className={s.summaryValue}>{new Date(form.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                  </div>
                )}
                {form.dataFimPrevisto && (
                  <div className={s.summaryItem}>
                    <span className={s.summaryLabel}>Prazo</span>
                    <span className={s.summaryValue}>{new Date(form.dataFimPrevisto + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </form>
    </div>
  )
}

import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getEmployee, createEvaluation } from '@/lib/db-employees'
import type { Employee, EvaluationCriterio } from '@/types/employee'
import {
  EVALUATION_CRITERIOS, calcEvaluationScore, scoreToStatus,
  STATUS_PERFORMANCE_META,
} from '@/types/employee'
import { toast } from '@/components/ui/Toast'
import s from './EmployeeEvaluationFormPage.module.css'

const EMPTY_CRITERIOS: EvaluationCriterio = {
  produtividade: 5, qualidade: 5, prazo: 5, responsabilidade: 5,
  resolucaoProblemas: 5, iniciativa: 5, colaboracao: 5, lideranca: 5,
  disciplina: 5, conformidade: 5,
}

function currentPeriodo(): string {
  const d  = new Date()
  const q  = Math.ceil((d.getMonth() + 1) / 3)
  return `${d.getFullYear()}-T${q}`
}

export default function EmployeeEvaluationFormPage() {
  const { id }      = useParams<{ id: string }>()
  const navigate    = useNavigate()
  const [emp, setEmp]     = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  const [criterios, setCriterios] = useState<EvaluationCriterio>(EMPTY_CRITERIOS)
  const [periodo, setPeriodo]       = useState(currentPeriodo())
  const [data, setData]             = useState(new Date().toISOString().split('T')[0])
  const [avaliador, setAvaliador]   = useState('')
  const [comentarios, setComentarios] = useState('')
  const [planoMelhoria, setPlanoMelhoria] = useState('')

  useEffect(() => {
    if (!id) return
    getEmployee(id)
      .then(e => { if (!e) { toast.error('Colaborador não encontrado.'); navigate('/colaboradores') } else setEmp(e) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id, navigate])

  const score  = useMemo(() => calcEvaluationScore(criterios), [criterios])
  const status = useMemo(() => scoreToStatus(score), [score])
  const meta   = STATUS_PERFORMANCE_META[status]

  function setCrit(key: keyof EvaluationCriterio, value: number) {
    setCriterios(prev => ({ ...prev, [key]: Math.min(10, Math.max(0, value)) }))
  }

  async function handleSave() {
    if (!id || !emp) return
    if (!avaliador.trim()) { toast.error('Informe o avaliador.'); return }
    if (!periodo.trim())   { toast.error('Informe o período.'); return }

    setSaving(true)
    try {
      await createEvaluation({
        employeeId:            id,
        employeeNome:          emp.nome,
        avaliadorNome:         avaliador.trim(),
        periodo,
        data:                  new Date(data + 'T12:00:00'),
        criterios,
        comentarios:           comentarios || undefined,
        planoMelhoria:         planoMelhoria || undefined,
        aprovadoPorSupervisor: false,
      })
      toast.success(`Avaliação salva — Score: ${score}/100`)
      navigate(`/colaboradores/${id}`)
    } catch { toast.error('Erro ao salvar avaliação.') }
    finally  { setSaving(false) }
  }

  if (loading) return <div className={s.loadingWrap}><div className={s.spinnerLg} /></div>
  if (!emp)    return null

  return (
    <div className={s.page}>

      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>📊 Avaliação de Desempenho</h1>
          <p className={s.pageSub}>{emp.nome} · {emp.cargo} · {emp.setor}</p>
        </div>
        <button className={s.btnSecondary} onClick={() => navigate(-1)}>← Voltar</button>
      </div>

      {/* ── Live score preview ── */}
      <div className={s.scorePreview} style={{ borderColor: meta.color }}>
        <div className={s.scoreBig} style={{ color: meta.color }}>{score}</div>
        <div className={s.scoreOf}>/100</div>
        <div className={s.scoreBar}>
          <div className={s.scoreFill} style={{ width: `${score}%`, background: meta.color }} />
        </div>
        <span className={s.scoreBadge} style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
        <p className={s.scoreHint}>Score calculado em tempo real com base nos critérios abaixo</p>
      </div>

      <div className={s.formCard}>

        <div className={s.sectionTitle}>Informações da Avaliação</div>
        <div className={s.metaGrid}>
          <div className={s.field}>
            <label className={s.label}>Avaliador *</label>
            <input className={s.input} value={avaliador} onChange={e => setAvaliador(e.target.value)} placeholder="Nome do avaliador" />
          </div>
          <div className={s.field}>
            <label className={s.label}>Período *</label>
            <input className={s.input} value={periodo} onChange={e => setPeriodo(e.target.value)} placeholder="2026-T2" />
          </div>
          <div className={s.field}>
            <label className={s.label}>Data da Avaliação</label>
            <input type="date" className={s.input} value={data} onChange={e => setData(e.target.value)} />
          </div>
        </div>

        <div className={s.divider} />
        <div className={s.sectionTitle}>Critérios de Avaliação</div>
        <p className={s.criteriosHint}>Avalie cada critério de 0 a 10 (0 = insatisfatório, 10 = excelente)</p>

        <div className={s.criteriosList}>
          {EVALUATION_CRITERIOS.map(({ key, label, peso }) => (
            <div key={key} className={s.criterioRow}>
              <div className={s.criterioLabel}>
                <span>{label}</span>
                <span className={s.criterioPeso}>peso {(peso * 100).toFixed(0)}%</span>
              </div>
              <div className={s.criterioControl}>
                <input
                  type="range" min={0} max={10} step={1}
                  value={criterios[key]}
                  onChange={e => setCrit(key, Number(e.target.value))}
                  className={s.slider}
                  style={{ '--pct': `${criterios[key] * 10}%`, '--color': criterios[key] >= 8 ? '#166534' : criterios[key] >= 6 ? '#2563eb' : criterios[key] >= 4 ? '#d97706' : '#dc2626' } as React.CSSProperties}
                />
                <input
                  type="number" min={0} max={10} step={1}
                  value={criterios[key]}
                  onChange={e => setCrit(key, Number(e.target.value))}
                  className={s.numInput}
                />
              </div>
              <div className={s.criterioContrib}>
                +{(criterios[key] * 10 * peso).toFixed(1)}pts
              </div>
            </div>
          ))}
        </div>

        <div className={s.divider} />
        <div className={s.sectionTitle}>Observações e Plano de Melhoria</div>
        <div className={s.metaGrid}>
          <div className={s.fieldFull}>
            <label className={s.label}>Comentários gerais</label>
            <textarea className={s.textarea} rows={3} value={comentarios} onChange={e => setComentarios(e.target.value)} placeholder="Pontos fortes, observações gerais…" />
          </div>
          <div className={s.fieldFull}>
            <label className={s.label}>Plano de melhoria</label>
            <textarea className={s.textarea} rows={3} value={planoMelhoria} onChange={e => setPlanoMelhoria(e.target.value)} placeholder="Ações de desenvolvimento, treinamentos recomendados…" />
          </div>
        </div>

        <div className={s.formActions}>
          <button className={s.btnCancel} onClick={() => navigate(-1)}>Cancelar</button>
          <button className={s.btnSave} disabled={saving} onClick={handleSave}>
            {saving ? 'Salvando…' : `📊 Salvar avaliação (${score}/100)`}
          </button>
        </div>

      </div>
    </div>
  )
}

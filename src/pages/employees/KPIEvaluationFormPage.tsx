import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getEmployee } from '@/lib/db-employees'
import { createKPIEvaluation } from '@/lib/db-performance'
import type { Employee } from '@/types/employee'
import type { PerformancePeriod, KPIEvaluationScore } from '@/types/performance'
import {
  KPI_INDICATORS, KPI_CATEGORIES, PERFORMANCE_PERIOD_META,
  PARECER_META, calcKPIResult, notaColor, categoryAvg,
} from '@/types/performance'
import { toast } from '@/components/ui/Toast'
import s from './KPIEvaluationFormPage.module.css'

function currentPeriod(): PerformancePeriod {
  const m = new Date().getMonth() + 1
  if (m <= 3)  return 'marco'
  if (m <= 6)  return 'junho'
  if (m <= 9)  return 'setembro'
  return 'dezembro'
}

function initScores(): KPIEvaluationScore[] {
  return KPI_INDICATORS.map(i => ({ indicadorNumero: i.numero, nota: 5, naoConformidade: '' }))
}

export default function KPIEvaluationFormPage() {
  const { id }      = useParams<{ id: string }>()
  const navigate    = useNavigate()

  const [emp, setEmp]   = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  const [scores, setScores]       = useState<KPIEvaluationScore[]>(initScores)
  const [periodo, setPeriodo]     = useState<PerformancePeriod>(currentPeriod)
  const [ano, setAno]             = useState(new Date().getFullYear())
  const [avaliador, setAvaliador] = useState('')
  const [observacoes, setObs]     = useState('')
  const [openCats, setOpenCats]   = useState<Set<string>>(() => new Set([KPI_CATEGORIES[0]]))

  useEffect(() => {
    if (!id) return
    getEmployee(id)
      .then(e => {
        if (!e) { toast.error('Colaborador não encontrado.'); navigate('/colaboradores') }
        else setEmp(e)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id, navigate])

  const result = useMemo(() => calcKPIResult(scores), [scores])
  const parecerMeta = PARECER_META[result.parecer]

  function setNota(numero: number, nota: number) {
    setScores(prev =>
      prev.map(s => s.indicadorNumero === numero ? { ...s, nota: Math.min(10, Math.max(0, nota)) } : s)
    )
  }

  function setNC(numero: number, nc: string) {
    setScores(prev =>
      prev.map(s => s.indicadorNumero === numero ? { ...s, naoConformidade: nc } : s)
    )
  }

  function toggleCat(cat: string) {
    setOpenCats(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  function getScore(numero: number) {
    return scores.find(s => s.indicadorNumero === numero) ?? { nota: 5, naoConformidade: '' }
  }

  async function handleSave() {
    if (!id || !emp) return
    if (!avaliador.trim()) { toast.error('Informe o nome do avaliador.'); return }

    setSaving(true)
    try {
      await createKPIEvaluation({
        employeeId:    id,
        employeeNome:  emp.nome,
        avaliadorNome: avaliador.trim(),
        periodo,
        ano,
        data:          new Date(),
        scores:        scores.map(s => ({
          indicadorNumero: s.indicadorNumero,
          nota: s.nota,
          ...(s.naoConformidade?.trim() ? { naoConformidade: s.naoConformidade.trim() } : {}),
        })),
        observacoes: observacoes.trim() || undefined,
      })
      toast.success(`Avaliação KPI salva — Nota ${result.notaFinal}/10 · ${parecerMeta.label}`)
      navigate(`/colaboradores/${id}`)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar avaliação KPI.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Carregando…</div>
  if (!emp)    return null

  const filled   = scores.filter(s => s.nota !== 5).length
  const progress = Math.round((filled / KPI_INDICATORS.length) * 100)

  return (
    <div className={s.page}>

      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>📋 Avaliação de Desempenho KPI</h1>
          <p className={s.pageSub}>{emp.nome} · {emp.cargo} · {emp.setor}</p>
        </div>
        <button className={s.btnBack} onClick={() => navigate(-1)}>← Voltar</button>
      </div>

      <div className={s.layout}>

        {/* ── Main: indicadores por categoria ── */}
        <div className={s.main}>
          {KPI_CATEGORIES.map(cat => {
            const isOpen  = openCats.has(cat)
            const inds    = KPI_INDICATORS.filter(i => i.categoria === cat)
            const avg     = categoryAvg(cat, scores)
            const color   = notaColor(avg)
            return (
              <div key={cat} className={s.category}>
                <div className={s.categoryHeader} onClick={() => toggleCat(cat)}>
                  <span className={s.categoryTitle}>{cat}</span>
                  <div className={s.categoryMeta}>
                    <span
                      className={s.categoryAvgBadge}
                      style={{ color, background: color + '1a' }}
                    >
                      {avg.toFixed(1)}/10
                    </span>
                    <span className={s.categoryCount}>{inds.length} indicador{inds.length > 1 ? 'es' : ''}</span>
                    <span className={`${s.chevron} ${isOpen ? s.chevronOpen : ''}`}>▼</span>
                  </div>
                </div>

                {isOpen && (
                  <div className={s.categoryBody}>
                    {inds.map(ind => {
                      const sc    = getScore(ind.numero)
                      const color = notaColor(sc.nota)
                      const pct   = `${sc.nota * 10}%`
                      return (
                        <div key={ind.numero} className={s.indicatorRow}>
                          <div className={s.indicatorTop}>
                            <span className={s.indicatorNum}>{ind.numero}</span>
                            <span className={s.indicatorDesc}>{ind.descricao}</span>
                          </div>
                          <div className={s.indicatorControls}>
                            <input
                              type="range"
                              min={0} max={10} step={1}
                              value={sc.nota}
                              className={s.slider}
                              style={{ '--pct': pct, '--color': color } as React.CSSProperties}
                              onChange={e => setNota(ind.numero, Number(e.target.value))}
                            />
                            <span
                              className={s.notaDisplay}
                              style={{ color, background: color + '1a' }}
                            >
                              {sc.nota}
                            </span>
                          </div>
                          <input
                            className={s.ncInput}
                            placeholder="Não conformidade / oportunidade de melhoria (opcional)…"
                            value={sc.naoConformidade ?? ''}
                            onChange={e => setNC(ind.numero, e.target.value)}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Sidebar ── */}
        <div className={s.sidebar}>

          {/* Score card */}
          <div className={s.scoreCard}>
            <div className={s.scoreBig} style={{ color: parecerMeta.color }}>
              {result.notaFinal.toFixed(1)}
            </div>
            <div className={s.scoreLabel}>Nota Final / 10</div>
            <div className={s.scoreBar}>
              <div
                className={s.scoreFill}
                style={{ width: `${result.percentual}%`, background: parecerMeta.color }}
              />
            </div>
            <span
              className={s.parecerBadge}
              style={{ color: parecerMeta.color, background: parecerMeta.bg }}
            >
              {parecerMeta.label}
            </span>
            <div className={s.progressRow}>
              <span>{filled}/{KPI_INDICATORS.length} alterados</span>
              <span>{progress}%</span>
            </div>
          </div>

          {/* Info card */}
          <div className={s.infoCard}>
            <div className={s.infoField}>
              <span className={s.infoLabel}>Avaliador *</span>
              <input
                className={s.infoInput}
                placeholder="Nome do avaliador"
                value={avaliador}
                onChange={e => setAvaliador(e.target.value)}
              />
            </div>
            <div className={s.infoField}>
              <span className={s.infoLabel}>Período</span>
              <select
                className={s.infoSelect}
                value={periodo}
                onChange={e => setPeriodo(e.target.value as PerformancePeriod)}
              >
                {(Object.entries(PERFORMANCE_PERIOD_META) as [PerformancePeriod, { label: string }][]).map(
                  ([k, v]) => <option key={k} value={k}>{v.label}</option>
                )}
              </select>
            </div>
            <div className={s.infoField}>
              <span className={s.infoLabel}>Ano</span>
              <input
                type="number"
                className={s.infoInput}
                value={ano}
                min={2020} max={2099}
                onChange={e => setAno(Number(e.target.value))}
              />
            </div>
            <div className={s.infoField}>
              <span className={s.infoLabel}>Observações gerais</span>
              <textarea
                className={s.infoTextarea}
                rows={3}
                placeholder="Comentários, pontos de atenção…"
                value={observacoes}
                onChange={e => setObs(e.target.value)}
              />
            </div>
            <button
              className={s.btnSave}
              disabled={saving || !avaliador.trim()}
              onClick={handleSave}
            >
              {saving ? 'Salvando…' : `💾 Salvar Avaliação`}
            </button>
          </div>

          {/* Category progress mini */}
          <div className={s.infoCard}>
            <span className={s.infoLabel}>Desempenho por Categoria</span>
            <div className={s.catProgress}>
              {KPI_CATEGORIES.map(cat => {
                const avg   = categoryAvg(cat, scores)
                const color = notaColor(avg)
                const shortName = cat.length > 22 ? cat.slice(0, 20) + '…' : cat
                return (
                  <div key={cat} className={s.catProgressRow}>
                    <span className={s.catProgressName} title={cat}>{shortName}</span>
                    <div className={s.catProgressBar}>
                      <div
                        className={s.catProgressFill}
                        style={{ width: `${avg * 10}%`, background: color }}
                      />
                    </div>
                    <span className={s.catProgressVal} style={{ color }}>{avg.toFixed(1)}</span>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

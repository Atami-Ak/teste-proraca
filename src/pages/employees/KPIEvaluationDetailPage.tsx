import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { getKPIEvaluation } from '@/lib/db-performance'
import type { KPIEvaluation } from '@/types/performance'
import {
  KPI_INDICATORS, KPI_CATEGORIES, PERFORMANCE_PERIOD_META,
  PARECER_META, notaColor, categoryAvg,
} from '@/types/performance'
import s from './KPIEvaluationDetailPage.module.css'

export default function KPIEvaluationDetailPage() {
  const { id, evalId } = useParams<{ id: string; evalId: string }>()
  const navigate = useNavigate()

  const [ev, setEv]         = useState<KPIEvaluation | null>(null)
  const [loading, setLoading] = useState(true)
  const [openCats, setOpenCats] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!evalId) return
    getKPIEvaluation(evalId)
      .then(e => {
        if (!e) { navigate(-1); return }
        setEv(e)
        // abre categorias com NC preenchida
        const catsComNC = new Set(
          e.scores
            .filter(sc => sc.naoConformidade?.trim())
            .map(sc => KPI_INDICATORS.find(i => i.numero === sc.indicadorNumero)?.categoria ?? '')
            .filter(Boolean)
        )
        setOpenCats(catsComNC.size > 0 ? catsComNC : new Set([KPI_CATEGORIES[0]]))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [evalId, navigate])

  function toggleCat(cat: string) {
    setOpenCats(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  if (loading) return <div className={s.loadingWrap}>Carregando…</div>
  if (!ev)     return null

  const parecerMeta  = PARECER_META[ev.parecer]
  const periodoLabel = PERFORMANCE_PERIOD_META[ev.periodo]?.label ?? ev.periodo

  return (
    <div className={s.page}>

      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>📋 Avaliação de Desempenho KPI</h1>
          <p className={s.pageSub}>{ev.employeeNome}</p>
        </div>
        <Link to={`/colaboradores/${id}`} className={s.btnBack}>← Voltar ao Perfil</Link>
      </div>

      {/* ── Hero ── */}
      <div className={s.hero}>
        <div className={s.heroScore}>
          <div className={s.heroScoreNum} style={{ color: parecerMeta.color }}>
            {ev.notaFinal.toFixed(1)}
          </div>
          <div className={s.heroScoreLabel}>/10</div>
        </div>
        <div className={s.heroInfo}>
          <span
            className={s.heroBadge}
            style={{ color: parecerMeta.color, background: parecerMeta.bg }}
          >
            {parecerMeta.label}
          </span>
          <div className={s.heroBar}>
            <div
              className={s.heroBarFill}
              style={{ width: `${ev.percentual}%`, background: parecerMeta.color }}
            />
          </div>
          <div className={s.heroMeta}>
            <span className={s.heroMetaItem}><strong>Período:</strong> {periodoLabel}/{ev.ano}</span>
            <span className={s.heroMetaItem}><strong>Avaliador:</strong> {ev.avaliadorNome}</span>
            <span className={s.heroMetaItem}>
              <strong>Data:</strong> {ev.data.toLocaleDateString('pt-BR')}
            </span>
            <span className={s.heroMetaItem}><strong>Percentual:</strong> {ev.percentual}%</span>
          </div>
        </div>
      </div>

      {/* ── Observações ── */}
      {ev.observacoes && (
        <div className={s.obsCard}>
          <div className={s.obsTitle}>Observações do Avaliador</div>
          {ev.observacoes}
        </div>
      )}

      {/* ── Grid de categorias ── */}
      <div className={s.catGrid}>
        {KPI_CATEGORIES.map(cat => {
          const avg   = categoryAvg(cat, ev.scores)
          const color = notaColor(avg)
          return (
            <div
              key={cat}
              className={s.catCard}
              style={{ borderLeftColor: color, borderLeftWidth: 3, borderLeftStyle: 'solid' }}
            >
              <div className={s.catCardName}>{cat}</div>
              <div className={s.catCardBar}>
                <div
                  className={s.catCardFill}
                  style={{ width: `${avg * 10}%`, background: color }}
                />
              </div>
              <div className={s.catCardVal} style={{ color }}>{avg.toFixed(1)}</div>
            </div>
          )
        })}
      </div>

      {/* ── Indicadores por categoria (acordeão) ── */}
      {KPI_CATEGORIES.map(cat => {
        const inds   = KPI_INDICATORS.filter(i => i.categoria === cat)
        const avg    = categoryAvg(cat, ev.scores)
        const color  = notaColor(avg)
        const isOpen = openCats.has(cat)
        return (
          <div key={cat} className={s.section}>
            <div className={s.sectionHeader} onClick={() => toggleCat(cat)}>
              <span className={s.sectionTitle}>{cat}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  className={s.sectionAvg}
                  style={{ color, background: color + '1a' }}
                >
                  {avg.toFixed(1)}/10
                </span>
                <span className={`${s.chevron} ${isOpen ? s.chevronOpen : ''}`}>▼</span>
              </div>
            </div>

            {isOpen && inds.map(ind => {
              const sc    = ev.scores.find(sc => sc.indicadorNumero === ind.numero)
              const nota  = sc?.nota ?? 0
              const color = notaColor(nota)
              return (
                <div key={ind.numero} className={s.indicatorRow}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span className={s.indicatorNum}>{ind.numero}</span>
                    <div style={{ flex: 1 }}>
                      <span className={s.indicatorDesc}>{ind.descricao}</span>
                      <div className={s.notaBarWrap} style={{ marginTop: 6 }}>
                        <div className={s.notaBar}>
                          <div
                            className={s.notaBarFill}
                            style={{ width: `${nota * 10}%`, background: color }}
                          />
                        </div>
                        <span
                          className={s.notaBadge}
                          style={{ color, background: color + '1a' }}
                        >
                          {nota}
                        </span>
                      </div>
                      {sc?.naoConformidade && (
                        <span className={s.ncTag}>⚠ {sc.naoConformidade}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

    </div>
  )
}

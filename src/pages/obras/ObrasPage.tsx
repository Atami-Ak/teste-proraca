import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getObras, getEmpreiteiras } from '@/lib/db-obras'
import { toast } from '@/components/ui/Toast'
import type { Obra, Empreiteira, ObraStatus } from '@/types/obras'
import { OBRA_STATUS_META } from '@/types/obras'
import s from './ObrasPage.module.css'

const STATUS_OPTIONS: Array<{ value: ObraStatus | ''; label: string }> = [
  { value: '',             label: 'Todos os status'  },
  { value: 'planejamento', label: 'Planejamento'     },
  { value: 'em_andamento', label: 'Em Andamento'     },
  { value: 'paralisada',   label: 'Paralisada'       },
  { value: 'concluida',    label: 'Concluída'        },
  { value: 'cancelada',    label: 'Cancelada'        },
]

function fmtCurrency(v?: number) {
  if (!v) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtDate(d?: Date) {
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ProgressRing({ pct, size = 48 }: { pct: number; size?: number }) {
  const r     = (size - 6) / 2
  const circ  = 2 * Math.PI * r
  const color = pct >= 80 ? '#16a34a' : pct >= 40 ? '#d97706' : '#ea580c'
  return (
    <div className={s.progressRingWrap} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} stroke="#EBF0F7" strokeWidth="5" fill="none" />
        <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth="5" fill="none"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct / 100)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className={s.progressRingLabel} style={{ color }}>{pct}%</span>
    </div>
  )
}

export default function ObrasPage() {
  const navigate = useNavigate()
  const [obras,        setObras]        = useState<Obra[]>([])
  const [empreiteiras, setEmpreiteiras] = useState<Empreiteira[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState<ObraStatus | ''>('')
  const [filterEmp,    setFilterEmp]    = useState('')
  const [viewMode,     setViewMode]     = useState<'cards' | 'table'>('cards')

  useEffect(() => {
    Promise.all([getObras(), getEmpreiteiras()])
      .then(([obs, emps]) => { setObras(obs); setEmpreiteiras(emps) })
      .catch(() => toast.error('Erro ao carregar obras'))
      .finally(() => setLoading(false))
  }, [])

  const empMap = useMemo(
    () => Object.fromEntries(empreiteiras.map(e => [e.id, e])),
    [empreiteiras]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return obras.filter(o => {
      if (filterStatus && o.status !== filterStatus) return false
      if (filterEmp && o.empreiteiraId !== filterEmp) return false
      if (q && !o.nome.toLowerCase().includes(q) && !o.codigo.toLowerCase().includes(q) && !(o.local ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [obras, filterStatus, filterEmp, search])

  const kpis = useMemo(() => ({
    total:       obras.length,
    andamento:   obras.filter(o => o.status === 'em_andamento').length,
    concluidas:  obras.filter(o => o.status === 'concluida').length,
    alertas:     obras.reduce((s, o) => s + (o.alertasCriticos ?? 0), 0),
    paralisadas: obras.filter(o => o.status === 'paralisada').length,
  }), [obras])

  const hasFilters = Boolean(search || filterStatus || filterEmp)

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.pageHeader}>
        <div className={s.headerLeft}>
          <div className={s.headerIconWrap}>🏗️</div>
          <div>
            <h1 className={s.pageTitle}>Obras & Contratos</h1>
            <p className={s.pageSub}>Supervisão de obras terceirizadas · {obras.length} registro{obras.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className={s.headerActions}>
          <button className={s.btnOutline} onClick={() => navigate('/empreiteiras')}>
            👷 Empreiteiras
          </button>
          <button className={s.btnPrimary} onClick={() => navigate('/obras/nova')}>
            + Nova Obra
          </button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className={s.kpiRow}>
        <div className={s.kpiCard} style={{ '--kpi-color': '#ea580c' } as React.CSSProperties}>
          <div className={s.kpiAccent} />
          <div className={s.kpiIconWrap} style={{ background: 'rgba(234,88,12,0.1)', color: '#ea580c', fontSize: '1.2rem' }}>🏗️</div>
          <div className={s.kpiBody}>
            <div className={s.kpiValue}>{kpis.total}</div>
            <div className={s.kpiLabel}>Total de Obras</div>
          </div>
        </div>
        <div className={s.kpiCard} style={{ '--kpi-color': '#d97706' } as React.CSSProperties}>
          <div className={s.kpiAccent} />
          <div className={s.kpiIconWrap} style={{ background: 'rgba(217,119,6,0.1)', color: '#d97706', fontSize: '1.2rem' }}>⚙️</div>
          <div className={s.kpiBody}>
            <div className={s.kpiValue} style={{ color: '#d97706' }}>{kpis.andamento}</div>
            <div className={s.kpiLabel}>Em Andamento</div>
          </div>
        </div>
        <div className={s.kpiCard} style={{ '--kpi-color': '#16a34a' } as React.CSSProperties}>
          <div className={s.kpiAccent} />
          <div className={s.kpiIconWrap} style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a', fontSize: '1.2rem' }}>✅</div>
          <div className={s.kpiBody}>
            <div className={s.kpiValue} style={{ color: '#16a34a' }}>{kpis.concluidas}</div>
            <div className={s.kpiLabel}>Concluídas</div>
          </div>
        </div>
        <div className={s.kpiCard} style={{ '--kpi-color': '#dc2626' } as React.CSSProperties}>
          <div className={s.kpiAccent} />
          <div className={s.kpiIconWrap} style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626', fontSize: '1.2rem' }}>⚠️</div>
          <div className={s.kpiBody}>
            <div className={s.kpiValue} style={{ color: kpis.alertas > 0 ? '#dc2626' : undefined }}>{kpis.alertas}</div>
            <div className={s.kpiLabel}>Alertas Críticos</div>
          </div>
        </div>
        <div className={s.kpiCard} style={{ '--kpi-color': '#7c3aed' } as React.CSSProperties}>
          <div className={s.kpiAccent} />
          <div className={s.kpiIconWrap} style={{ background: 'rgba(124,58,237,0.1)', color: '#7c3aed', fontSize: '1.2rem' }}>⏸️</div>
          <div className={s.kpiBody}>
            <div className={s.kpiValue} style={{ color: kpis.paralisadas > 0 ? '#dc2626' : undefined }}>{kpis.paralisadas}</div>
            <div className={s.kpiLabel}>Paralisadas</div>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className={s.filtersBar}>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}>🔍</span>
          <input
            className={s.searchInput}
            placeholder="Buscar por nome, código ou local…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className={s.searchClear} onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <select className={s.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value as ObraStatus | '')}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select className={s.filterSelect} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="">Todas as empreiteiras</option>
          {empreiteiras.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>

        {hasFilters && (
          <button className={s.clearFilters} onClick={() => { setSearch(''); setFilterStatus(''); setFilterEmp('') }}>
            ✕ Limpar
          </button>
        )}

        <div className={s.resultCount}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</div>

        <div className={s.viewToggle}>
          <button
            className={`${s.viewBtn} ${viewMode === 'cards' ? s.viewBtnActive : ''}`}
            onClick={() => setViewMode('cards')}
            title="Cards"
          >⊞</button>
          <button
            className={`${s.viewBtn} ${viewMode === 'table' ? s.viewBtnActive : ''}`}
            onClick={() => setViewMode('table')}
            title="Lista"
          >☰</button>
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className={s.loadingWrap}>
          <div className={s.spinner} />
          <span>Carregando obras…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIconWrap}>🏗️</div>
          <h3 className={s.emptyTitle}>Nenhuma obra encontrada</h3>
          <p className={s.emptyDesc}>
            {obras.length === 0
              ? 'Registre a primeira obra para começar a supervisão.'
              : 'Tente ajustar os filtros de busca.'}
          </p>
          {obras.length === 0 && (
            <button className={s.btnPrimary} onClick={() => navigate('/obras/nova')}>
              + Nova Obra
            </button>
          )}
        </div>
      ) : viewMode === 'cards' ? (

        /* ── Card Grid ── */
        <div className={s.obraGrid}>
          {filtered.map(obra => {
            const meta    = OBRA_STATUS_META[obra.status]
            const emp     = obra.empreiteiraId ? empMap[obra.empreiteiraId] : null
            const pct     = obra.percentualConcluido ?? 0
            const orcTotal= (obra.valorContrato ?? 0) + (obra.valorAditivos ?? 0)
            const dias    = obra.dataFimPrevisto
              ? Math.ceil((obra.dataFimPrevisto.getTime() - Date.now()) / 86400000)
              : null
            const atrasada = dias !== null && dias < 0 && obra.status === 'em_andamento'
            return (
              <div
                key={obra.id}
                className={`${s.obraCard} ${atrasada ? s.obraCardAlert : ''}`}
                style={{ '--card-status': meta.color } as React.CSSProperties}
              >
                <div className={s.cardStatusBar} style={{ background: meta.color }} />

                <div className={s.cardHead}>
                  <div className={s.cardHeadLeft}>
                    <span className={s.cardCode}>{obra.codigo}</span>
                    <span className={s.cardStatusBadge} style={{ color: meta.color, background: meta.bg }}>
                      {meta.label}
                    </span>
                    {atrasada && <span className={s.cardDelayBadge}>⏰ Atrasada</span>}
                  </div>
                  <ProgressRing pct={pct} size={46} />
                </div>

                <div className={s.cardBody}>
                  <h3 className={s.cardTitle}>{obra.nome}</h3>
                  <div className={s.cardLocal}>📍 {obra.local} · {obra.tipo}</div>
                </div>

                {emp && (
                  <div className={s.cardEmp}>
                    👷 <span>{emp.nome}</span>
                    {emp.scoreGlobal != null && (
                      <span className={s.empScore} style={{ color: emp.scoreGlobal >= 70 ? '#16a34a' : emp.scoreGlobal >= 50 ? '#d97706' : '#dc2626' }}>
                        ★ {emp.scoreGlobal}
                      </span>
                    )}
                  </div>
                )}

                <div className={s.cardMetrics}>
                  <div className={s.cardMetric}>
                    <span className={s.metricLabel}>💰 Contrato</span>
                    <span className={s.metricValue}>{fmtCurrency(orcTotal || obra.valorContrato)}</span>
                  </div>
                  {obra.notaMedia != null && (
                    <div className={s.cardMetric}>
                      <span className={s.metricLabel}>📊 Nota média</span>
                      <span className={s.metricValue}
                        style={{ color: obra.notaMedia >= 7 ? '#16a34a' : obra.notaMedia >= 5 ? '#d97706' : '#dc2626' }}>
                        {obra.notaMedia.toFixed(1)}/10
                      </span>
                    </div>
                  )}
                  {dias !== null && obra.status === 'em_andamento' && (
                    <div className={s.cardMetric}>
                      <span className={s.metricLabel}>⏱️ Prazo</span>
                      <span className={s.metricValue}
                        style={{ color: dias < 0 ? '#dc2626' : dias < 7 ? '#d97706' : '#16a34a' }}>
                        {dias < 0 ? `${Math.abs(dias)}d atrasado` : `${dias}d restantes`}
                      </span>
                    </div>
                  )}
                  {obra.dataFimPrevisto && obra.status !== 'em_andamento' && (
                    <div className={s.cardMetric}>
                      <span className={s.metricLabel}>📅 Prazo previsto</span>
                      <span className={s.metricValue}>{fmtDate(obra.dataFimPrevisto)}</span>
                    </div>
                  )}
                </div>

                {(obra.alertasCriticos ?? 0) > 0 && (
                  <div className={s.cardAlertBanner}>
                    ⚠️ {obra.alertasCriticos} alerta{(obra.alertasCriticos ?? 0) > 1 ? 's' : ''} crítico{(obra.alertasCriticos ?? 0) > 1 ? 's' : ''}
                  </div>
                )}

                <div className={s.cardActions}>
                  <button className={s.btnCardPrimary} onClick={() => navigate(`/obras/${obra.id}`)}>
                    Ver detalhes →
                  </button>
                  <button className={s.btnCardSecondary} onClick={() => navigate(`/obras/${obra.id}/inspecao`)}>
                    + Inspeção
                  </button>
                  <button className={s.btnCardIcon} onClick={() => navigate(`/obras/${obra.id}/editar`)} title="Editar">
                    ✏️
                  </button>
                </div>
              </div>
            )
          })}
        </div>

      ) : (

        /* ── Table View ── */
        <div className={s.tableCard}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Obra / Local</th>
                <th>Empreiteira</th>
                <th>Status</th>
                <th>Progresso</th>
                <th>Valor</th>
                <th>Nota</th>
                <th>Alertas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(obra => {
                const meta    = OBRA_STATUS_META[obra.status]
                const emp     = obra.empreiteiraId ? empMap[obra.empreiteiraId] : null
                const pct     = obra.percentualConcluido ?? 0
                const pctColor= pct >= 80 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ea580c'
                return (
                  <tr key={obra.id} className={s.tableRow} onClick={() => navigate(`/obras/${obra.id}`)}>
                    <td><span className={s.tableCode}>{obra.codigo}</span></td>
                    <td>
                      <div className={s.tableObraName}>{obra.nome}</div>
                      <div className={s.tableObraLocal}>📍 {obra.local}</div>
                    </td>
                    <td className={s.tableEmp}>{emp ? emp.nome : <span className={s.noData}>—</span>}</td>
                    <td>
                      <span className={s.tableBadge} style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                    </td>
                    <td style={{ minWidth: 130 }}>
                      <div className={s.tableProgress}>
                        <div className={s.tableProgressBar} style={{ width: `${pct}%`, background: pctColor }} />
                        <span className={s.tableProgressLabel}>{pct}%</span>
                      </div>
                    </td>
                    <td className={s.tableCurrency}>{fmtCurrency(obra.valorContrato)}</td>
                    <td>
                      {obra.notaMedia != null
                        ? <span className={s.tableScore} style={{ color: obra.notaMedia >= 7 ? '#166534' : obra.notaMedia >= 5 ? '#d97706' : '#dc2626' }}>{obra.notaMedia.toFixed(1)}</span>
                        : <span className={s.noData}>—</span>}
                    </td>
                    <td>
                      {(obra.alertasCriticos ?? 0) > 0
                        ? <span className={s.tableAlert}>⚠️ {obra.alertasCriticos}</span>
                        : <span className={s.noData}>—</span>}
                    </td>
                    <td>
                      <button className={s.tableDetailBtn} onClick={e => { e.stopPropagation(); navigate(`/obras/${obra.id}`) }}>
                        Ver →
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Footer stats ── */}
      {!loading && obras.length > 0 && (
        <div className={s.footerBar}>
          <div className={s.footerStat}>
            👷 {empreiteiras.length} empreiteira{empreiteiras.length !== 1 ? 's' : ''} cadastrada{empreiteiras.length !== 1 ? 's' : ''}
          </div>
          <div className={s.footerDivider} />
          <div className={s.footerStat}>
            📊 Média de conclusão: {obras.length > 0 ? Math.round(obras.reduce((s, o) => s + (o.percentualConcluido ?? 0), 0) / obras.length) : 0}%
          </div>
          <div className={s.footerDivider} />
          <button className={s.footerLink} onClick={() => navigate('/dashboard/obras')}>
            Analytics de Obras →
          </button>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getObras, getEmpreiteiras } from '@/lib/db-obras'
import { toast } from '@/components/ui/Toast'
import type { Obra, Empreiteira, ObraStatus } from '@/types/obras'
import { OBRA_STATUS_META } from '@/types/obras'
import s from './ObrasPage.module.css'

const STATUS_OPTIONS: Array<{ value: ObraStatus | ''; label: string }> = [
  { value: '',             label: 'Todos os status' },
  { value: 'planejamento', label: 'Planejamento'    },
  { value: 'em_andamento', label: 'Em Andamento'    },
  { value: 'paralisada',   label: 'Paralisada'      },
  { value: 'concluida',    label: 'Concluída'       },
  { value: 'cancelada',   label: 'Cancelada'        },
]

function StatusBadge({ status }: { status: ObraStatus }) {
  const m = OBRA_STATUS_META[status]
  return (
    <span className={s.badge} style={{ color: m.color, background: m.bg }}>
      {m.label}
    </span>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ea580c'
  return (
    <div className={s.progressWrap}>
      <div className={s.progressBar} style={{ width: `${pct}%`, background: color }} />
      <span className={s.progressLabel}>{pct}%</span>
    </div>
  )
}

function fmtCurrency(v?: number) {
  if (!v) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export default function ObrasPage() {
  const navigate = useNavigate()
  const [obras,        setObras]        = useState<Obra[]>([])
  const [empreiteiras, setEmpreiteiras] = useState<Empreiteira[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState<ObraStatus | ''>('')
  const [filterEmp,    setFilterEmp]    = useState('')

  useEffect(() => {
    Promise.all([getObras(), getEmpreiteiras()])
      .then(([obs, emps]) => {
        setObras(obs)
        setEmpreiteiras(emps)
      })
      .catch(() => toast.error('Erro ao carregar obras'))
      .finally(() => setLoading(false))
  }, [])

  const empMap = useMemo(
    () => Object.fromEntries(empreiteiras.map(e => [e.id, e.nome])),
    [empreiteiras]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return obras.filter(o => {
      if (filterStatus && o.status !== filterStatus) return false
      if (filterEmp && o.empreiteiraId !== filterEmp) return false
      if (q && !o.nome.toLowerCase().includes(q) && !o.codigo.toLowerCase().includes(q) && !o.local.toLowerCase().includes(q)) return false
      return true
    })
  }, [obras, filterStatus, filterEmp, search])

  // ── KPIs ──
  const kpis = useMemo(() => {
    const total      = obras.length
    const andamento  = obras.filter(o => o.status === 'em_andamento').length
    const concluidas = obras.filter(o => o.status === 'concluida').length
    const alertas    = obras.reduce((s, o) => s + (o.alertasCriticos ?? 0), 0)
    const paralisadas= obras.filter(o => o.status === 'paralisada').length
    return { total, andamento, concluidas, alertas, paralisadas }
  }, [obras])

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.pageTitle}>Obras & Contratos</h1>
          <p className={s.pageSubtitle}>
            Supervisão de obras terceirizadas · {obras.length} registros
          </p>
        </div>
        <div className={s.headerActions}>
          <button className={s.btnSecondary} onClick={() => navigate('/empreiteiras')}>
            👷 Empreiteiras
          </button>
          <button className={s.btnPrimary} onClick={() => navigate('/obras/nova')}>
            + Nova Obra
          </button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className={s.kpiRow}>
        <div className={s.kpiCard}>
          <div className={s.kpiIcon} style={{ background: 'rgba(22,101,52,0.1)', color: '#166534' }}>🏗️</div>
          <div className={s.kpiBody}>
            <div className={s.kpiValue}>{kpis.total}</div>
            <div className={s.kpiLabel}>Total de Obras</div>
          </div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiIcon} style={{ background: 'rgba(245,158,11,0.1)', color: '#d97706' }}>⚙️</div>
          <div className={s.kpiBody}>
            <div className={s.kpiValue}>{kpis.andamento}</div>
            <div className={s.kpiLabel}>Em Andamento</div>
          </div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiIcon} style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>✅</div>
          <div className={s.kpiBody}>
            <div className={s.kpiValue}>{kpis.concluidas}</div>
            <div className={s.kpiLabel}>Concluídas</div>
          </div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiIcon} style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>⚠️</div>
          <div className={s.kpiBody}>
            <div className={s.kpiValue} style={{ color: kpis.alertas > 0 ? '#dc2626' : undefined }}>
              {kpis.alertas}
            </div>
            <div className={s.kpiLabel}>Alertas Críticos</div>
          </div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiIcon} style={{ background: 'rgba(127,29,29,0.1)', color: '#7f1d1d' }}>⏸️</div>
          <div className={s.kpiBody}>
            <div className={s.kpiValue} style={{ color: kpis.paralisadas > 0 ? '#dc2626' : undefined }}>
              {kpis.paralisadas}
            </div>
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
        </div>
        <select className={s.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value as ObraStatus | '')}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={s.filterSelect} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="">Todas as empreiteiras</option>
          {empreiteiras.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        {(search || filterStatus || filterEmp) && (
          <button className={s.clearBtn} onClick={() => { setSearch(''); setFilterStatus(''); setFilterEmp('') }}>
            ✕ Limpar
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className={s.tableCard}>
        {loading ? (
          <div className={s.empty}>Carregando obras…</div>
        ) : filtered.length === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyIcon}>🏗️</div>
            <div className={s.emptyTitle}>Nenhuma obra encontrada</div>
            <div className={s.emptyDesc}>
              {obras.length === 0
                ? 'Registre a primeira obra para começar a supervisão.'
                : 'Tente ajustar os filtros de busca.'}
            </div>
            {obras.length === 0 && (
              <button className={s.btnPrimary} onClick={() => navigate('/obras/nova')}>
                + Nova Obra
              </button>
            )}
          </div>
        ) : (
          <table className={s.table}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Obra</th>
                <th>Empreiteira</th>
                <th>Status</th>
                <th>Progresso</th>
                <th>Valor Contrato</th>
                <th>Nota Média</th>
                <th>Alertas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(obra => (
                <tr key={obra.id} className={s.row} onClick={() => navigate(`/obras/${obra.id}`)}>
                  <td><span className={s.code}>{obra.codigo}</span></td>
                  <td>
                    <div className={s.obraName}>{obra.nome}</div>
                    <div className={s.obraLocal}>📍 {obra.local}</div>
                  </td>
                  <td className={s.empCell}>
                    {obra.empreiteiraId ? (empMap[obra.empreiteiraId] ?? '—') : <span className={s.noEmp}>Não vinculada</span>}
                  </td>
                  <td><StatusBadge status={obra.status} /></td>
                  <td style={{ minWidth: 140 }}>
                    <ProgressBar pct={obra.percentualConcluido ?? 0} />
                  </td>
                  <td className={s.currency}>{fmtCurrency(obra.valorContrato)}</td>
                  <td>
                    {obra.notaMedia != null ? (
                      <span className={s.score} style={{ color: obra.notaMedia >= 7 ? '#166534' : obra.notaMedia >= 5 ? '#d97706' : '#dc2626' }}>
                        {obra.notaMedia.toFixed(1)}
                      </span>
                    ) : <span className={s.noop}>—</span>}
                  </td>
                  <td>
                    {(obra.alertasCriticos ?? 0) > 0 ? (
                      <span className={s.alertBadge}>⚠️ {obra.alertasCriticos}</span>
                    ) : <span className={s.noop}>—</span>}
                  </td>
                  <td>
                    <button
                      className={s.detailBtn}
                      onClick={e => { e.stopPropagation(); navigate(`/obras/${obra.id}`) }}
                    >
                      Ver →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  )
}

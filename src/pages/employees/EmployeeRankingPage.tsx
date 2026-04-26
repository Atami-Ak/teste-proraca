import { useEffect, useState, useMemo } from 'react'
import { getEmployees }                 from '@/lib/db-employees'
import type { Employee }                from '@/types/employee'
import { STATUS_PERFORMANCE_META }      from '@/types/employee'
import s                                from './EmployeeRankingPage.module.css'

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

const SCORE_COLOR: Record<string, string> = {
  excelente: '#166534',
  muito_bom: '#16a34a',
  bom:       '#2563eb',
  atencao:   '#d97706',
  critico:   '#dc2626',
}

export default function EmployeeRankingPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading,   setLoading]   = useState(true)
  const [deptFilter, setDept]     = useState('')
  const [statusFilter, setStatus] = useState('')

  useEffect(() => {
    getEmployees(true)
      .then(list => {
        setEmployees(list.sort((a, b) => b.scorePerformance - a.scorePerformance))
      })
      .finally(() => setLoading(false))
  }, [])

  const departments = useMemo(() => {
    const set = new Set(employees.map(e => e.departamento).filter(Boolean))
    return Array.from(set).sort()
  }, [employees])

  const ranked = useMemo(() => {
    return employees.filter(e => {
      if (deptFilter && e.departamento !== deptFilter) return false
      if (statusFilter && e.statusPerformance !== statusFilter) return false
      return true
    })
  }, [employees, deptFilter, statusFilter])

  const avgScore   = ranked.length > 0 ? Math.round(ranked.reduce((s, e) => s + e.scorePerformance, 0) / ranked.length) : 0
  const excelentes = ranked.filter(e => e.statusPerformance === 'excelente' || e.statusPerformance === 'muito_bom').length
  const criticos   = ranked.filter(e => e.statusPerformance === 'critico').length

  if (loading) {
    return <div className={s.page}><p style={{ color: 'var(--text-3)' }}>Carregando ranking…</p></div>
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.titleBlock}>
          <h1 className={s.pageTitle}>Ranking de Colaboradores</h1>
          <p className={s.pageSub}>{ranked.length} colaborador{ranked.length !== 1 ? 'es' : ''} · Score médio: {avgScore}/100</p>
        </div>

        <div className={s.filters}>
          <select className={s.filterSelect} value={deptFilter} onChange={e => setDept(e.target.value)}>
            <option value="">Todos os departamentos</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className={s.filterSelect} value={statusFilter} onChange={e => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="excelente">Excelente</option>
            <option value="muito_bom">Muito Bom</option>
            <option value="bom">Bom</option>
            <option value="atencao">Atenção</option>
            <option value="critico">Crítico</option>
          </select>
        </div>
      </div>

      {/* KPI bar */}
      <div className={s.kpiBar}>
        <div className={s.kpiCard}>
          <div className={s.kpiValue}>{ranked.length}</div>
          <div className={s.kpiLabel}>Colaboradores</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiValue}>{avgScore}</div>
          <div className={s.kpiLabel}>Score Médio</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiValue} style={{ color: '#166534' }}>{excelentes}</div>
          <div className={s.kpiLabel}>Excelente / Muito Bom</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiValue} style={{ color: '#dc2626' }}>{criticos}</div>
          <div className={s.kpiLabel}>Críticos</div>
        </div>
      </div>

      {/* Table */}
      {ranked.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>👥</div>
          <p>Nenhum colaborador encontrado para os filtros selecionados.</p>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Colaborador</th>
                <th>Setor</th>
                <th>Avaliações</th>
                <th>Status</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((emp, idx) => {
                const pos    = idx + 1
                const meta   = STATUS_PERFORMANCE_META[emp.statusPerformance]
                const color  = SCORE_COLOR[emp.statusPerformance] ?? '#64748b'

                return (
                  <tr key={emp.id}>
                    <td className={s.rankCell}>
                      {pos <= 3
                        ? <span className={s.rankMedal}>{MEDAL[pos]}</span>
                        : <span style={{ color: 'var(--text-3)', fontSize: '0.9rem' }}>{pos}º</span>
                      }
                    </td>
                    <td>
                      <div className={s.nameCell}>{emp.nome}</div>
                      <div className={s.nameRole}>{emp.cargo}</div>
                    </td>
                    <td style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>{emp.setor}</td>
                    <td className={s.metaNum}>{emp.totalEvaluacoes}</td>
                    <td>
                      <span
                        className={s.statusBadge}
                        style={{ background: meta.bg, color: meta.color, borderColor: meta.color + '44' }}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className={s.scoreCell}>
                      <div className={s.scoreWrap}>
                        <div className={s.scoreBar}>
                          <div
                            className={s.scoreBarFill}
                            style={{ width: `${emp.scorePerformance}%`, background: color }}
                          />
                        </div>
                        <span className={s.scoreNum} style={{ color }}>{emp.scorePerformance}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

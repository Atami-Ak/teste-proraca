import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getEmployees } from '@/lib/db-employees'
import type { Employee, StatusEmployee, StatusPerformance, TipoVinculo } from '@/types/employee'
import { STATUS_PERFORMANCE_META, STATUS_EMPLOYEE_META, TIPO_VINCULO_META } from '@/types/employee'
import s from './EmployeeListPage.module.css'

function fmt(d: Date | undefined): string {
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR')
}

export default function EmployeeListPage() {
  const [list, setList]       = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filterStatus, setFilterStatus]     = useState<StatusEmployee | ''>('')
  const [filterPerf, setFilterPerf]         = useState<StatusPerformance | ''>('')
  const [filterVinculo, setFilterVinculo]   = useState<TipoVinculo | ''>('')
  const [filterSetor, setFilterSetor]       = useState('')

  useEffect(() => {
    getEmployees()
      .then(setList)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const setores = useMemo(() => [...new Set(list.map(e => e.setor))].sort(), [list])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return list.filter(e => {
      if (filterStatus  && e.status           !== filterStatus)  return false
      if (filterPerf    && e.statusPerformance !== filterPerf)    return false
      if (filterVinculo && e.tipoVinculo       !== filterVinculo) return false
      if (filterSetor   && e.setor             !== filterSetor)   return false
      if (!q) return true
      return (
        e.nome.toLowerCase().includes(q) ||
        e.matricula.toLowerCase().includes(q) ||
        e.cargo.toLowerCase().includes(q) ||
        (e.codigoInterno ?? '').toLowerCase().includes(q)
      )
    })
  }, [list, search, filterStatus, filterPerf, filterVinculo, filterSetor])

  const totalAtivos = list.filter(e => e.status === 'ativo').length

  return (
    <div className={s.page}>

      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>👤 Colaboradores</h1>
          <p className={s.pageSub}>{totalAtivos} ativos · {list.length} total cadastrado</p>
        </div>
        <Link to="/colaboradores/novo" className={s.btnPrimary}>+ Novo Colaborador</Link>
      </div>

      {/* ── Filters ── */}
      <div className={s.filtersRow}>
        <input
          className={s.searchInput}
          placeholder="Buscar por nome, matrícula, cargo…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={s.select} value={filterStatus} onChange={e => setFilterStatus(e.target.value as StatusEmployee | '')}>
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="afastado">Afastado</option>
          <option value="ferias">Férias</option>
          <option value="inativo">Inativo</option>
          <option value="desligado">Desligado</option>
        </select>
        <select className={s.select} value={filterPerf} onChange={e => setFilterPerf(e.target.value as StatusPerformance | '')}>
          <option value="">Desempenho</option>
          <option value="excelente">Excelente</option>
          <option value="muito_bom">Muito Bom</option>
          <option value="bom">Bom</option>
          <option value="atencao">Atenção</option>
          <option value="critico">Crítico</option>
        </select>
        <select className={s.select} value={filterVinculo} onChange={e => setFilterVinculo(e.target.value as TipoVinculo | '')}>
          <option value="">Vínculo</option>
          <option value="clt">CLT</option>
          <option value="pj">PJ</option>
          <option value="temporario">Temporário</option>
          <option value="terceirizado">Terceirizado</option>
          <option value="estagiario">Estagiário</option>
        </select>
        <select className={s.select} value={filterSetor} onChange={e => setFilterSetor(e.target.value)}>
          <option value="">Setor</option>
          {setores.map(sv => <option key={sv} value={sv}>{sv}</option>)}
        </select>
      </div>

      {loading ? (
        <div className={s.loadingWrap}><div className={s.spinnerLg} /></div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <span className={s.emptyIcon}>👤</span>
          <p>{list.length === 0 ? 'Nenhum colaborador cadastrado.' : 'Nenhum resultado encontrado.'}</p>
          {list.length === 0 && (
            <Link to="/colaboradores/novo" className={s.btnPrimary}>Cadastrar primeiro colaborador</Link>
          )}
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Matrícula</th>
                <th>Cargo / Setor</th>
                <th>Vínculo</th>
                <th>Admissão</th>
                <th>Status</th>
                <th>Desempenho</th>
                <th>Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const perfMeta  = STATUS_PERFORMANCE_META[e.statusPerformance]
                const statMeta  = STATUS_EMPLOYEE_META[e.status]
                const vincMeta  = TIPO_VINCULO_META[e.tipoVinculo]
                return (
                  <tr key={e.id} className={s.row}>
                    <td>
                      <div className={s.empCell}>
                        <div className={s.avatar}>{e.nome[0]?.toUpperCase()}</div>
                        <div>
                          <div className={s.empName}>{e.nome}</div>
                          {e.email && <div className={s.empEmail}>{e.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td><span className={s.mono}>{e.matricula}</span></td>
                    <td>
                      <div className={s.cargoCell}>
                        <span className={s.cargo}>{e.cargo}</span>
                        <span className={s.setor}>{e.setor}</span>
                      </div>
                    </td>
                    <td>
                      <span className={s.vinculoBadge} style={{ color: vincMeta.color, background: `${vincMeta.color}1a` }}>
                        {vincMeta.label}
                      </span>
                    </td>
                    <td className={s.dateCell}>{fmt(e.dataAdmissao)}</td>
                    <td>
                      <span className={s.badge} style={{ color: statMeta.color, background: statMeta.bg }}>
                        {statMeta.label}
                      </span>
                    </td>
                    <td>
                      <span className={s.badge} style={{ color: perfMeta.color, background: perfMeta.bg }}>
                        {perfMeta.label}
                      </span>
                    </td>
                    <td>
                      <div className={s.scoreCell}>
                        <div className={s.scoreBar}>
                          <div className={s.scoreFill} style={{ width: `${e.scorePerformance}%`, background: perfMeta.color }} />
                        </div>
                        <span className={s.scoreNum} style={{ color: perfMeta.color }}>{e.scorePerformance}</span>
                      </div>
                    </td>
                    <td>
                      <Link to={`/colaboradores/${e.id}`} className={s.btnView}>Ver perfil →</Link>
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

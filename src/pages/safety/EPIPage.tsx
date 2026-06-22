import { useState, useEffect, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getEPIFichas }      from '@/lib/db-safety'
import type { EPIFicha }     from '@/types/safety'
import { STATUS_FICHA_META, SETORES_FABRICA } from '@/types/safety'
import { toast }             from '@/components/ui/Toast'
import s from './EPIPage.module.css'

const Ic = {
  Back:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6"/></svg>,
  HardHat: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a8 8 0 0 1 16 0v3"/></svg>,
  Plus:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  SearchSm:() => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Users:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  CheckOk: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>,
  AlertTri:() => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Danger:  () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
}

export default function EPIPage() {
  const navigate = useNavigate()
  const [list, setList]       = useState<EPIFicha[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [setor, setSetor]     = useState('')
  const [status, setStatus]   = useState('')

  useEffect(() => {
    getEPIFichas()
      .then(setList)
      .catch(() => toast.error('Erro ao carregar fichas de EPI.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = list.filter(d => {
    const q = search.toLowerCase()
    return (!q || d.colaboradorNome.toLowerCase().includes(q) || d.matricula.toLowerCase().includes(q))
      && (!setor  || d.setor === setor)
      && (!status || d.statusFicha === status)
  })

  const totalVencidos  = list.filter(d => d.statusFicha === 'vencido').length
  const totalPendentes = list.filter(d => d.statusFicha === 'pendente').length
  const totalConformes = list.filter(d => d.statusFicha === 'conforme').length
  const totalEpisVenc  = list.reduce((a, d) => a + d.totalEpisVencidos, 0)

  const STATS = [
    { label: 'Colaboradores',    value: list.length,   color: '#d97706', icon: <Ic.Users /> },
    { label: 'Conformes',        value: totalConformes,color: '#16a34a', icon: <Ic.CheckOk /> },
    { label: 'A vencer (30d)',   value: totalPendentes,color: '#d97706', icon: <Ic.AlertTri /> },
    { label: 'Fichas vencidas',  value: totalVencidos, color: '#dc2626', icon: <Ic.Danger /> },
    { label: 'EPIs vencidos',    value: totalEpisVenc, color: '#7c3aed', icon: <Ic.HardHat /> },
  ]

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <div className={s.headerLeft}>
          <Link to="/seguranca" className={s.backLink}><Ic.Back /> Segurança</Link>
          <div className={s.headerDivider} />
          <div>
            <h1 className={s.pageTitle}>Controle de EPI</h1>
            <p className={s.pageSub}>Fichas individuais de equipamentos de proteção individual</p>
          </div>
        </div>
        <Link to="/seguranca/epi/novo" className={s.btnPrimary}><Ic.Plus /> Nova Ficha EPI</Link>
      </div>

      <div className={s.statsRow}>
        {STATS.map(st => (
          <div key={st.label} className={s.statCard} style={{ '--accent-color': st.color } as CSSProperties}>
            <div className={s.statAccent} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 9, background: st.color + '18', color: st.color, flexShrink: 0 }}>{st.icon}</div>
            <div className={s.statBody}>
              <div className={s.statValue} style={{ color: st.color }}>{st.value}</div>
              <div className={s.statLabel}>{st.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={s.filtersRow}>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}><Ic.SearchSm /></span>
          <input className={s.searchInput} placeholder="Buscar por nome ou matrícula…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className={s.filterSelect} value={setor} onChange={e => setSetor(e.target.value)}>
          <option value="">Todos os setores</option>
          {SETORES_FABRICA.map(sv => <option key={sv} value={sv}>{sv}</option>)}
        </select>
        <select className={s.filterSelect} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="conforme">Conforme</option>
          <option value="pendente">Pendente</option>
          <option value="irregular">Irregular</option>
          <option value="vencido">Vencido</option>
        </select>
        <div className={s.filterDivider} />
        <span className={s.resultBadge}>{filtered.length} de {list.length}</span>
      </div>

      {loading ? (
        <div className={s.loadingWrap}><div className={s.spinner} /></div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}><Ic.HardHat /></div>
          <h3 className={s.emptyTitle}>{list.length === 0 ? 'Nenhuma ficha cadastrada' : 'Nenhuma ficha encontrada'}</h3>
          <p className={s.emptyDesc}>{list.length === 0 ? 'Cadastre a primeira ficha de EPI.' : 'Ajuste os filtros.'}</p>
          {list.length === 0 && <Link to="/seguranca/epi/novo" className={s.btnPrimary}><Ic.Plus /> Nova Ficha</Link>}
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Colaborador</th><th>Matrícula</th><th>Setor</th>
                <th>Função</th><th>Risco</th>
                <th className={s.thCenter}>EPIs</th>
                <th className={s.thCenter}>Vencidos</th>
                <th className={s.thCenter}>A vencer</th>
                <th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const meta = STATUS_FICHA_META[d.statusFicha] ?? { label: d.statusFicha, color: '#64748b', bg: 'rgba(100,116,139,0.1)' }
                return (
                  <tr key={d.id} className={s.tableRow} onClick={() => navigate(`/seguranca/epi/${d.id}`)}>
                    <td className={s.tdName}>{d.colaboradorNome}</td>
                    <td><span className={s.matTag}>{d.matricula}</span></td>
                    <td><span className={s.setorTag}>{d.setor}</span></td>
                    <td className={s.tdFuncao}>{d.funcao}</td>
                    <td><span className={s.riskTag} data-risk={d.classificacaoRisco}>{d.classificacaoRisco}</span></td>
                    <td className={s.tdCenter}>{d.entregas.length}</td>
                    <td className={s.tdCenter}>
                      <span style={{ color: d.totalEpisVencidos > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>{d.totalEpisVencidos}</span>
                    </td>
                    <td className={s.tdCenter}>
                      <span style={{ color: d.totalEpisAVencer > 0 ? '#d97706' : 'inherit', fontWeight: d.totalEpisAVencer > 0 ? 700 : 400 }}>{d.totalEpisAVencer}</span>
                    </td>
                    <td><span className={s.badge} style={{ color: meta.color, background: meta.bg }}>{meta.label}</span></td>
                    <td className={s.tdAction} onClick={e => e.stopPropagation()}>
                      <button className={s.btnDetail} onClick={() => navigate(`/seguranca/epi/${d.id}`)}>Ver ficha →</button>
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

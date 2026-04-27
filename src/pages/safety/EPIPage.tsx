import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEPIFichas } from '@/lib/db-safety'
import type { EPIFicha } from '@/types/safety'
import { STATUS_FICHA_META, SETORES_FABRICA } from '@/types/safety'
import { toast } from '@/components/ui/Toast'
import s from './EPIPage.module.css'

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
    const matchQ = !q || d.colaboradorNome.toLowerCase().includes(q) || d.matricula.toLowerCase().includes(q)
    const matchS = !setor  || d.setor === setor
    const matchSt = !status || d.statusFicha === status
    return matchQ && matchS && matchSt
  })

  const totalVencidos  = list.filter(d => d.statusFicha === 'vencido').length
  const totalPendentes = list.filter(d => d.statusFicha === 'pendente').length
  const totalConformes = list.filter(d => d.statusFicha === 'conforme').length
  const totalEpisVenc  = list.reduce((a, d) => a + d.totalEpisVencidos, 0)

  return (
    <div className={s.page}>

      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>🦺 Controle de EPI</h1>
          <p className={s.pageSub}>Fichas individuais de equipamentos de proteção individual</p>
        </div>
        <button className={s.btnPrimary} onClick={() => navigate('/seguranca/epi/novo')}>+ Nova Ficha EPI</button>
      </div>

      <div className={s.statsRow}>
        <div className={s.statCard}>
          <span className={s.statValue}>{list.length}</span>
          <span className={s.statLabel}>Colaboradores</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statValue} style={{ color: '#16a34a' }}>{totalConformes}</span>
          <span className={s.statLabel}>Conformes</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statValue} style={{ color: '#d97706' }}>{totalPendentes}</span>
          <span className={s.statLabel}>A vencer (30d)</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statValue} style={{ color: '#dc2626' }}>{totalVencidos}</span>
          <span className={s.statLabel}>Fichas vencidas</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statValue} style={{ color: '#dc2626' }}>{totalEpisVenc}</span>
          <span className={s.statLabel}>EPIs vencidos total</span>
        </div>
      </div>

      <div className={s.filtersRow}>
        <input className={s.searchInput} placeholder="Buscar por nome ou matrícula…" value={search} onChange={e => setSearch(e.target.value)} />
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
      </div>

      {loading ? (
        <div className={s.loadingWrap}><div className={s.spinner} /></div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <span className={s.emptyIcon}>🦺</span>
          <p>{list.length === 0 ? 'Nenhuma ficha de EPI cadastrada ainda.' : 'Nenhuma ficha encontrada.'}</p>
          {list.length === 0 && <button className={s.btnPrimary} onClick={() => navigate('/seguranca/epi/novo')}>Criar primeira ficha</button>}
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Matrícula</th>
                <th>Setor</th>
                <th>Função</th>
                <th>Risco</th>
                <th className={s.thCenter}>EPIs</th>
                <th className={s.thCenter}>Vencidos</th>
                <th className={s.thCenter}>A vencer</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const meta = STATUS_FICHA_META[d.statusFicha]
                return (
                  <tr key={d.id} className={s.tableRow} onClick={() => navigate(`/seguranca/epi/${d.id}`)}>
                    <td className={s.tdName}>{d.colaboradorNome}</td>
                    <td><span className={s.matTag}>{d.matricula}</span></td>
                    <td><span className={s.setorTag}>{d.setor}</span></td>
                    <td className={s.tdFuncao}>{d.funcao}</td>
                    <td>
                      <span className={s.riskTag} data-risk={d.classificacaoRisco}>{d.classificacaoRisco}</span>
                    </td>
                    <td className={s.tdCenter}>{d.entregas.length}</td>
                    <td className={s.tdCenter}>
                      <span style={{ color: d.totalEpisVencidos > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                        {d.totalEpisVencidos}
                      </span>
                    </td>
                    <td className={s.tdCenter}>
                      <span style={{ color: d.totalEpisAVencer > 0 ? '#d97706' : 'inherit', fontWeight: d.totalEpisAVencer > 0 ? 700 : 400 }}>
                        {d.totalEpisAVencer}
                      </span>
                    </td>
                    <td>
                      <span className={s.badge} style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                    </td>
                    <td className={s.tdAction} onClick={e => e.stopPropagation()}>
                      <button className={s.btnDetail} onClick={() => navigate(`/seguranca/epi/${d.id}`)}>→</button>
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

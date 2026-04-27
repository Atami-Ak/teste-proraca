import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDDIList, deleteDDI } from '@/lib/db-safety'
import type { DDI } from '@/types/safety'
import { STATUS_DDI_META, SETORES_FABRICA } from '@/types/safety'
import { toast } from '@/components/ui/Toast'
import s from './DDIPage.module.css'

function fmt(d: Date | undefined): string {
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR')
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626'
  return (
    <span className={s.scoreBadge} style={{ color, background: `${color}1a` }}>
      {score}%
    </span>
  )
}

export default function DDIPage() {
  const navigate = useNavigate()
  const [list, setList]       = useState<DDI[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [setor, setSetor]     = useState('')

  async function load() {
    setLoading(true)
    try { setList(await getDDIList()) }
    catch { toast.error('Erro ao carregar inspeções.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta inspeção?')) return
    try {
      await deleteDDI(id)
      toast.success('Inspeção excluída.')
      setList(prev => prev.filter(d => d.id !== id))
    } catch { toast.error('Erro ao excluir.') }
  }

  const filtered = list.filter(d => {
    const q = search.toLowerCase()
    const matchQ = !q || d.numero.toLowerCase().includes(q) || d.inspetor.toLowerCase().includes(q)
    const matchS = !setor || d.setor === setor
    return matchQ && matchS
  })

  const totalMes = list.filter(d => {
    const now = new Date(); const m = new Date(now.getFullYear(), now.getMonth(), 1)
    return d.data >= m
  }).length
  const avgScore = list.length > 0 ? Math.round(list.reduce((a, d) => a + d.scoreGeral, 0) / list.length) : 0
  const criticos = list.reduce((a, d) => a + d.totalCriticosAbertos, 0)

  return (
    <div className={s.page}>

      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>🔍 Inspeção Diária de Segurança (DDI)</h1>
          <p className={s.pageSub}>Checklist de conformidade e registro de não conformidades</p>
        </div>
        <button className={s.btnPrimary} onClick={() => navigate('/seguranca/ddi/novo')}>+ Nova Inspeção</button>
      </div>

      <div className={s.statsRow}>
        <div className={s.statCard}>
          <span className={s.statValue}>{list.length}</span>
          <span className={s.statLabel}>Total inspeções</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statValue}>{totalMes}</span>
          <span className={s.statLabel}>Este mês</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statValue} style={{ color: avgScore >= 80 ? '#16a34a' : avgScore >= 60 ? '#d97706' : '#dc2626' }}>{avgScore}%</span>
          <span className={s.statLabel}>Score médio</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statValue} style={{ color: criticos > 0 ? '#dc2626' : '#16a34a' }}>{criticos}</span>
          <span className={s.statLabel}>Críticos abertos</span>
        </div>
      </div>

      <div className={s.filtersRow}>
        <input className={s.searchInput} placeholder="Buscar por número ou inspetor…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className={s.filterSelect} value={setor} onChange={e => setSetor(e.target.value)}>
          <option value="">Todos os setores</option>
          {SETORES_FABRICA.map(sv => <option key={sv} value={sv}>{sv}</option>)}
        </select>
      </div>

      {loading ? (
        <div className={s.loadingWrap}><div className={s.spinner} /></div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <span className={s.emptyIcon}>🔍</span>
          <p>{list.length === 0 ? 'Nenhuma inspeção registrada ainda.' : 'Nenhuma inspeção encontrada.'}</p>
          {list.length === 0 && <button className={s.btnPrimary} onClick={() => navigate('/seguranca/ddi/novo')}>Realizar primeira inspeção</button>}
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Número</th>
                <th>Data</th>
                <th>Setor</th>
                <th>Inspetor</th>
                <th>Score</th>
                <th className={s.thCenter}>Conformes</th>
                <th className={s.thCenter}>NC</th>
                <th className={s.thCenter}>Críticos</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const meta = STATUS_DDI_META[d.status]
                return (
                  <tr key={d.id} className={s.tableRow} onClick={() => navigate(`/seguranca/ddi/${d.id}`)}>
                    <td><span className={s.codeTag}>{d.numero}</span></td>
                    <td className={s.tdDate}>{fmt(d.data)}</td>
                    <td><span className={s.setorTag}>{d.setor}</span></td>
                    <td>{d.inspetor}</td>
                    <td><ScoreBadge score={d.scoreGeral} /></td>
                    <td className={s.tdCenter}>{d.totalConformes}</td>
                    <td className={s.tdCenter}>
                      <span style={{ color: d.totalNaoConformes > 0 ? '#ea580c' : 'inherit', fontWeight: d.totalNaoConformes > 0 ? 700 : 400 }}>
                        {d.totalNaoConformes}
                      </span>
                    </td>
                    <td className={s.tdCenter}>
                      <span style={{ color: d.totalCriticosAbertos > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                        {d.totalCriticosAbertos}
                      </span>
                    </td>
                    <td>
                      <span className={s.badge} style={{ color: meta.color, background: `${meta.color}1a` }}>{meta.label}</span>
                    </td>
                    <td className={s.tdActions} onClick={e => e.stopPropagation()}>
                      <button className={s.btnEdit} onClick={() => navigate(`/seguranca/ddi/${d.id}/editar`)}>✏️</button>
                      <button className={s.btnDel} onClick={() => handleDelete(d.id)}>🗑️</button>
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

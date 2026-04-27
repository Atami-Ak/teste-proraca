import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDDSList, deleteDDS } from '@/lib/db-safety'
import type { DDS } from '@/types/safety'
import { STATUS_DDS_META, SETORES_FABRICA } from '@/types/safety'
import { toast } from '@/components/ui/Toast'
import s from './DDSPage.module.css'

function fmt(d: Date | undefined): string {
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR')
}

export default function DDSPage() {
  const navigate = useNavigate()
  const [list, setList]     = useState<DDS[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [setor, setSetor]     = useState('')

  async function load() {
    setLoading(true)
    try {
      const data = await getDDSList()
      setList(data)
    } catch { toast.error('Erro ao carregar DDS.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string) {
    if (!confirm('Excluir este DDS?')) return
    try {
      await deleteDDS(id)
      toast.success('DDS excluído.')
      setList(prev => prev.filter(d => d.id !== id))
    } catch { toast.error('Erro ao excluir.') }
  }

  const filtered = list.filter(d => {
    const q = search.toLowerCase()
    const matchQ = !q || d.numero.toLowerCase().includes(q) || d.tema.toLowerCase().includes(q) || d.supervisor.toLowerCase().includes(q)
    const matchS = !setor || d.setor === setor
    return matchQ && matchS
  })

  // Stats
  const totalMes = list.filter(d => {
    const now = new Date(); const m = new Date(now.getFullYear(), now.getMonth(), 1)
    return d.data >= m
  }).length
  const totalPresentes = list.reduce((a, d) => a + d.totalPresentes, 0)
  const concluidos = list.filter(d => d.status === 'concluido').length

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>📢 Diálogo Diário de Segurança</h1>
          <p className={s.pageSub}>Registro e acompanhamento dos DDS realizados</p>
        </div>
        <button className={s.btnPrimary} onClick={() => navigate('/seguranca/dds/novo')}>
          + Novo DDS
        </button>
      </div>

      {/* ── Stats ── */}
      <div className={s.statsRow}>
        <div className={s.statCard}>
          <span className={s.statValue}>{list.length}</span>
          <span className={s.statLabel}>Total DDS</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statValue}>{totalMes}</span>
          <span className={s.statLabel}>Este mês</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statValue}>{concluidos}</span>
          <span className={s.statLabel}>Concluídos</span>
        </div>
        <div className={s.statCard}>
          <span className={s.statValue}>{totalPresentes}</span>
          <span className={s.statLabel}>Presenças totais</span>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className={s.filtersRow}>
        <input
          className={s.searchInput}
          placeholder="Buscar por número, tema ou supervisor…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={s.filterSelect} value={setor} onChange={e => setSetor(e.target.value)}>
          <option value="">Todos os setores</option>
          {SETORES_FABRICA.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className={s.loadingWrap}><div className={s.spinner} /></div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <span className={s.emptyIcon}>📢</span>
          <p>{list.length === 0 ? 'Nenhum DDS registrado ainda.' : 'Nenhum DDS encontrado com os filtros aplicados.'}</p>
          {list.length === 0 && (
            <button className={s.btnPrimary} onClick={() => navigate('/seguranca/dds/novo')}>Registrar primeiro DDS</button>
          )}
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Número</th>
                <th>Data</th>
                <th>Setor</th>
                <th>Tema</th>
                <th>Supervisor</th>
                <th>Presentes</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const meta = STATUS_DDS_META[d.status]
                return (
                  <tr key={d.id} className={s.tableRow} onClick={() => navigate(`/seguranca/dds/${d.id}`)}>
                    <td><span className={s.codeTag}>{d.numero}</span></td>
                    <td className={s.tdDate}>{fmt(d.data)}</td>
                    <td><span className={s.setorTag}>{d.setor}</span></td>
                    <td className={s.tdTema}>{d.tema}</td>
                    <td>{d.supervisor}</td>
                    <td className={s.tdNum}>{d.totalPresentes}</td>
                    <td>
                      <span className={s.badge} style={{ color: meta.color, background: `${meta.color}1a` }}>
                        {meta.label}
                      </span>
                    </td>
                    <td className={s.tdActions} onClick={e => e.stopPropagation()}>
                      <button className={s.btnEdit} onClick={() => navigate(`/seguranca/dds/${d.id}/editar`)}>✏️</button>
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

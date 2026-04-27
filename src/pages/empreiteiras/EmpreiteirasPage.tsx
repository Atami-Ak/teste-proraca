import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEmpreiteiras, createEmpreiteira, updateEmpreiteira } from '@/lib/db-obras'
import { toast } from '@/components/ui/Toast'
import type { Empreiteira, EmpreiteiraStatus } from '@/types/obras'
import { EMPREITEIRA_STATUS_META } from '@/types/obras'
import s from './EmpreiteirasPage.module.css'

type FormState = {
  nome:           string
  cnpj:           string
  contato:        string
  email:          string
  telefone:       string
  especialidades: string
  observacoes:    string
}
const EMPTY_FORM: FormState = {
  nome: '', cnpj: '', contato: '', email: '', telefone: '', especialidades: '', observacoes: '',
}

function StatusBadge({ status }: { status: EmpreiteiraStatus }) {
  const m = EMPREITEIRA_STATUS_META[status]
  return <span className={s.badge} style={{ color: m.color, background: m.bg }}>{m.label}</span>
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? '#166534' : score >= 55 ? '#d97706' : '#dc2626'
  return (
    <div className={s.scoreBarWrap}>
      <div className={s.scoreBarTrack}>
        <div className={s.scoreBarFill} style={{ width: `${score}%`, background: color }} />
      </div>
      <span className={s.scoreBarValue} style={{ color }}>{score}</span>
    </div>
  )
}

export default function EmpreiteirasPage() {
  const navigate = useNavigate()
  const [empreiteiras, setEmpreiteiras] = useState<Empreiteira[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState<EmpreiteiraStatus | ''>('')
  const [showModal,    setShowModal]    = useState(false)
  const [editTarget,   setEditTarget]   = useState<Empreiteira | null>(null)
  const [form,         setForm]         = useState<FormState>(EMPTY_FORM)
  const [saving,       setSaving]       = useState(false)

  function loadData() {
    getEmpreiteiras()
      .then(setEmpreiteiras)
      .catch(() => toast.error('Erro ao carregar empreiteiras'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { loadData() }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return empreiteiras.filter(e => {
      if (filterStatus && e.status !== filterStatus) return false
      if (q && !e.nome.toLowerCase().includes(q) && !(e.cnpj ?? '').includes(q)) return false
      return true
    })
  }, [empreiteiras, filterStatus, search])

  // Ranking sorted by score
  const ranking = useMemo(
    () => [...empreiteiras].sort((a, b) => (b.scoreGlobal ?? 0) - (a.scoreGlobal ?? 0)),
    [empreiteiras]
  )

  function openCreate() {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  function openEdit(emp: Empreiteira) {
    setEditTarget(emp)
    setForm({
      nome:           emp.nome,
      cnpj:           emp.cnpj ?? '',
      contato:        emp.contato ?? '',
      email:          emp.email ?? '',
      telefone:       emp.telefone ?? '',
      especialidades: emp.especialidades.join(', '),
      observacoes:    emp.observacoes ?? '',
    })
    setShowModal(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    try {
      const specs = form.especialidades.split(',').map(s => s.trim()).filter(Boolean)
      if (editTarget) {
        await updateEmpreiteira(editTarget.id, {
          nome:           form.nome.trim(),
          cnpj:           form.cnpj.trim() || undefined,
          contato:        form.contato.trim() || undefined,
          email:          form.email.trim() || undefined,
          telefone:       form.telefone.trim() || undefined,
          especialidades: specs,
          observacoes:    form.observacoes.trim() || undefined,
        })
        toast.success('Empreiteira atualizada!')
      } else {
        await createEmpreiteira({
          nome:           form.nome.trim(),
          cnpj:           form.cnpj.trim() || undefined,
          contato:        form.contato.trim() || undefined,
          email:          form.email.trim() || undefined,
          telefone:       form.telefone.trim() || undefined,
          especialidades: specs,
          observacoes:    form.observacoes.trim() || undefined,
          status:         'aprovada',
          ativo:          true,
        })
        toast.success('Empreiteira cadastrada!')
      }
      setShowModal(false)
      loadData()
    } catch {
      toast.error('Erro ao salvar empreiteira')
    } finally {
      setSaving(false)
    }
  }

  async function toggleAtivo(emp: Empreiteira) {
    try {
      await updateEmpreiteira(emp.id, { ativo: !emp.ativo })
      setEmpreiteiras(prev => prev.map(e => e.id === emp.id ? { ...e, ativo: !e.ativo } : e))
    } catch {
      toast.error('Erro ao atualizar status')
    }
  }

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.pageTitle}>Empreiteiras</h1>
          <p className={s.pageSubtitle}>Cadastro e ranking de desempenho · {empreiteiras.length} registros</p>
        </div>
        <div className={s.headerActions}>
          <button className={s.btnSecondary} onClick={() => navigate('/obras')}>🏗️ Obras</button>
          <button className={s.btnPrimary} onClick={openCreate}>+ Cadastrar Empreiteira</button>
        </div>
      </div>

      {/* ── Top Ranking ── */}
      {ranking.filter(e => e.scoreGlobal != null && e.ativo).length > 0 && (
        <div className={s.rankingCard}>
          <div className={s.rankingTitle}>🏆 Ranking de Desempenho</div>
          <div className={s.rankingList}>
            {ranking.filter(e => e.ativo).slice(0, 5).map((emp, i) => {
              const meta = EMPREITEIRA_STATUS_META[emp.status]
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`
              return (
                <div key={emp.id} className={s.rankItem} onClick={() => navigate(`/empreiteiras/${emp.id}`)}>
                  <span className={s.rankMedal}>{medal}</span>
                  <div className={s.rankMeta}>
                    <div className={s.rankName}>{emp.nome}</div>
                    <div className={s.rankSpecs}>{emp.especialidades?.slice(0, 2).join(', ')}</div>
                  </div>
                  {emp.scoreGlobal != null
                    ? <ScoreBar score={emp.scoreGlobal} />
                    : <span className={s.noScore}>Sem avaliação</span>
                  }
                  <span className={s.rankBadge} style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className={s.filtersBar}>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}>🔍</span>
          <input className={s.searchInput} placeholder="Buscar por nome ou CNPJ…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className={s.filterSelect} value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as EmpreiteiraStatus | '')}>
          <option value="">Todos os status</option>
          {(Object.keys(EMPREITEIRA_STATUS_META) as EmpreiteiraStatus[]).map(k => (
            <option key={k} value={k}>{EMPREITEIRA_STATUS_META[k].label}</option>
          ))}
        </select>
        {(search || filterStatus) && (
          <button className={s.clearBtn} onClick={() => { setSearch(''); setFilterStatus('') }}>
            ✕ Limpar
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className={s.tableCard}>
        {loading ? (
          <div className={s.empty}>Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyIcon}>👷</div>
            <div className={s.emptyTitle}>Nenhuma empreiteira encontrada</div>
            <div className={s.emptyDesc}>{empreiteiras.length === 0
              ? 'Cadastre a primeira empreiteira para começar.'
              : 'Tente outros termos de busca.'}</div>
            {empreiteiras.length === 0 && (
              <button className={s.btnPrimary} onClick={openCreate}>+ Cadastrar</button>
            )}
          </div>
        ) : (
          <table className={s.table}>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Especialidades</th>
                <th>Status</th>
                <th>Score Global</th>
                <th>Obras</th>
                <th>Aprovadas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => (
                <tr key={emp.id} className={s.row} onClick={() => navigate(`/empreiteiras/${emp.id}`)}>
                  <td>
                    <div className={s.empName}>{emp.nome}</div>
                    {emp.cnpj && <div className={s.empCnpj}>{emp.cnpj}</div>}
                    {!emp.ativo && <span className={s.inativoBadge}>Inativo</span>}
                  </td>
                  <td className={s.specs}>{emp.especialidades?.join(', ') || '—'}</td>
                  <td><StatusBadge status={emp.status} /></td>
                  <td style={{ minWidth: 140 }}>
                    {emp.scoreGlobal != null
                      ? <ScoreBar score={emp.scoreGlobal} />
                      : <span className={s.noScore}>Sem avaliação</span>}
                  </td>
                  <td className={s.numCell}>{emp.totalObras ?? 0}</td>
                  <td className={s.numCell}>{emp.obrasAprovadas ?? 0}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className={s.rowActions}>
                      <button className={s.editBtn} onClick={() => openEdit(emp)}>✏️</button>
                      <button className={`${s.toggleBtn} ${emp.ativo ? s.toggleActive : ''}`}
                        onClick={() => toggleAtivo(emp)}
                        title={emp.ativo ? 'Desativar' : 'Ativar'}>
                        {emp.ativo ? '🟢' : '⚫'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <div className={s.overlay} onClick={() => setShowModal(false)}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h2 className={s.modalTitle}>{editTarget ? 'Editar Empreiteira' : 'Nova Empreiteira'}</h2>
              <button className={s.modalClose} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave} noValidate>
              <div className={s.modalBody}>
                <div className={s.grid2}>
                  <div className={`${s.field} ${s.span2}`}>
                    <label className={s.label}>Nome da Empresa *</label>
                    <input className={s.input} value={form.nome}
                      onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                      placeholder="Razão social ou nome fantasia" required />
                  </div>
                  <div className={s.field}>
                    <label className={s.label}>CNPJ</label>
                    <input className={s.input} value={form.cnpj}
                      onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))}
                      placeholder="00.000.000/0000-00" />
                  </div>
                  <div className={s.field}>
                    <label className={s.label}>Responsável / Contato</label>
                    <input className={s.input} value={form.contato}
                      onChange={e => setForm(f => ({ ...f, contato: e.target.value }))}
                      placeholder="Nome do responsável" />
                  </div>
                  <div className={s.field}>
                    <label className={s.label}>E-mail</label>
                    <input className={s.input} type="email" value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className={s.field}>
                    <label className={s.label}>Telefone</label>
                    <input className={s.input} value={form.telefone}
                      onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
                  </div>
                  <div className={`${s.field} ${s.span2}`}>
                    <label className={s.label}>Especialidades (separadas por vírgula)</label>
                    <input className={s.input} value={form.especialidades}
                      onChange={e => setForm(f => ({ ...f, especialidades: e.target.value }))}
                      placeholder="Construção Civil, Elétrica, Hidráulica…" />
                  </div>
                  <div className={`${s.field} ${s.span2}`}>
                    <label className={s.label}>Observações</label>
                    <textarea className={s.textarea} rows={2} value={form.observacoes}
                      onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className={s.modalFooter}>
                <button type="button" className={s.cancelBtn} onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className={s.btnPrimary} disabled={saving}>
                  {saving ? 'Salvando…' : editTarget ? 'Salvar Alterações' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

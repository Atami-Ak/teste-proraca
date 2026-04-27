import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  getEmployee, getEmployeeHistory, getEmployeeEvaluations,
  getEmployeeWarnings, getEmployeeRecognitions, getSupervisorNotes,
  createSupervisorNote, resolveWarning, deactivateEmployee,
} from '@/lib/db-employees'
import type {
  Employee, EmployeeHistoryEvent, EmployeeEvaluation,
  EmployeeWarning, EmployeeRecognition, SupervisorNote, CategoriaNota,
} from '@/types/employee'
import {
  STATUS_PERFORMANCE_META, STATUS_EMPLOYEE_META, TIPO_VINCULO_META,
  TIPO_EVENTO_META, TIPO_AVISO_META, TIPO_RECONHECIMENTO_META,
} from '@/types/employee'
import { toast } from '@/components/ui/Toast'
import s from './EmployeeProfilePage.module.css'

type Tab = 'timeline' | 'avaliacoes' | 'disciplinar' | 'notas' | 'seguranca'

function fmt(d: Date | undefined): string {
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR')
}

function fmtScore(score: number) {
  const meta = STATUS_PERFORMANCE_META[
    score >= 90 ? 'excelente' : score >= 75 ? 'muito_bom' : score >= 60 ? 'bom' : score >= 40 ? 'atencao' : 'critico'
  ]
  return <span className={s.scorePill} style={{ color: meta.color, background: meta.bg }}>{score}/100 — {meta.label}</span>
}

export default function EmployeeProfilePage() {
  const { id }  = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [emp, setEmp]         = useState<Employee | null>(null)
  const [history, setHistory] = useState<EmployeeHistoryEvent[]>([])
  const [evals, setEvals]     = useState<EmployeeEvaluation[]>([])
  const [warns, setWarns]     = useState<EmployeeWarning[]>([])
  const [reconhs, setReconhs] = useState<EmployeeRecognition[]>([])
  const [notes, setNotes]     = useState<SupervisorNote[]>([])
  const [tab, setTab]         = useState<Tab>('timeline')
  const [loading, setLoading] = useState(true)

  // New note form
  const [noteText, setNoteText]     = useState('')
  const [noteCat, setNoteCat]       = useState<CategoriaNota>('geral')
  const [notePos, setNotePos]       = useState(true)
  const [noteConf, setNoteConf]     = useState(false)
  const [noteSaving, setNoteSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      getEmployee(id),
      getEmployeeHistory(id),
      getEmployeeEvaluations(id),
      getEmployeeWarnings(id),
      getEmployeeRecognitions(id),
      getSupervisorNotes(id),
    ]).then(([e, h, ev, w, r, n]) => {
      if (!e) { toast.error('Colaborador não encontrado.'); navigate('/colaboradores'); return }
      setEmp(e); setHistory(h); setEvals(ev); setWarns(w); setReconhs(r); setNotes(n)
    }).catch(console.error).finally(() => setLoading(false))
  }, [id, navigate])

  async function handleAddNote() {
    if (!noteText.trim() || !id || !emp) return
    setNoteSaving(true)
    try {
      const note = await createSupervisorNote({
        employeeId:    id,
        supervisorNome:'Sistema',
        nota:          noteText.trim(),
        categoria:     noteCat,
        positivo:      notePos,
        data:          new Date(),
        confidencial:  noteConf,
      })
      setNotes(prev => [{
        id: note, employeeId: id, supervisorNome: 'Sistema',
        nota: noteText.trim(), categoria: noteCat, positivo: notePos,
        data: new Date(), confidencial: noteConf,
      }, ...prev])
      setNoteText('')
      toast.success('Nota adicionada.')
    } catch { toast.error('Erro ao salvar nota.') }
    finally { setNoteSaving(false) }
  }

  async function handleResolveWarning(warnId: string) {
    const res = window.prompt('Descreva a resolução desta advertência:')
    if (!res) return
    try {
      await resolveWarning(warnId, res)
      setWarns(prev => prev.map(w => w.id === warnId ? { ...w, resolvido: true, resolucao: res } : w))
      toast.success('Advertência marcada como resolvida.')
    } catch { toast.error('Erro ao resolver advertência.') }
  }

  async function handleDeactivate() {
    if (!id || !emp) return
    const motivo = window.prompt(`Confirma o desligamento de ${emp.nome}? Informe o motivo:`)
    if (!motivo) return
    try {
      await deactivateEmployee(id, motivo, 'Sistema')
      setEmp(prev => prev ? { ...prev, status: 'desligado' } : prev)
      toast.success('Colaborador desligado.')
    } catch { toast.error('Erro ao desligar colaborador.') }
  }

  if (loading) return <div className={s.loadingWrap}><div className={s.spinnerLg} /></div>
  if (!emp)    return null

  const perfMeta = STATUS_PERFORMANCE_META[emp.statusPerformance]
  const statMeta = STATUS_EMPLOYEE_META[emp.status]
  const vincMeta = TIPO_VINCULO_META[emp.tipoVinculo]

  return (
    <div className={s.page}>

      {/* ── Hero card ── */}
      <div className={s.hero}>
        <div className={s.heroLeft}>
          <div className={s.bigAvatar}>{emp.nome[0]?.toUpperCase()}</div>
          <div className={s.heroInfo}>
            <h1 className={s.heroName}>{emp.nome}</h1>
            <p className={s.heroCargo}>{emp.cargo} · {emp.setor}</p>
            <p className={s.heroMeta}>Matrícula {emp.matricula} · {vincMeta.label} · Turno {emp.turno}</p>
            <div className={s.heroBadges}>
              <span className={s.badge} style={{ color: statMeta.color, background: statMeta.bg }}>{statMeta.label}</span>
              <span className={s.badge} style={{ color: perfMeta.color, background: perfMeta.bg }}>{perfMeta.label}</span>
              <span className={s.badge} style={{ color: vincMeta.color, background: `${vincMeta.color}1a` }}>{vincMeta.label}</span>
            </div>
          </div>
        </div>
        <div className={s.heroStats}>
          <div className={s.heroStat}>
            <div className={s.heroStatVal} style={{ color: perfMeta.color }}>{emp.scorePerformance}</div>
            <div className={s.heroStatLbl}>Score</div>
          </div>
          <div className={s.heroStat}>
            <div className={s.heroStatVal}>{emp.totalEvaluacoes}</div>
            <div className={s.heroStatLbl}>Avaliações</div>
          </div>
          <div className={s.heroStat}>
            <div className={s.heroStatVal} style={{ color: emp.totalAvisos > 0 ? '#dc2626' : 'inherit' }}>{emp.totalAvisos}</div>
            <div className={s.heroStatLbl}>Advertências</div>
          </div>
          <div className={s.heroStat}>
            <div className={s.heroStatVal} style={{ color: '#166534' }}>{emp.totalReconhecimentos}</div>
            <div className={s.heroStatLbl}>Reconhecimentos</div>
          </div>
          <div className={s.heroStat}>
            <div className={s.heroStatVal}>{emp.totalDDSPresencas}</div>
            <div className={s.heroStatLbl}>DDS</div>
          </div>
        </div>
        <div className={s.heroActions}>
          <Link to={`/colaboradores/${emp.id}/editar`} className={s.btnEdit}>✏️ Editar</Link>
          <Link to={`/colaboradores/${emp.id}/avaliacao`} className={s.btnEval}>📊 Nova Avaliação</Link>
          {emp.status === 'ativo' && (
            <button className={s.btnDeactivate} onClick={handleDeactivate}>Desligar</button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className={s.tabs}>
        {([
          ['timeline',   '📅 Timeline'],
          ['avaliacoes', '📊 Avaliações'],
          ['disciplinar','⚠️ Disciplinar'],
          ['notas',      '📝 Notas do Supervisor'],
          ['seguranca',  '🛡️ Segurança'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} className={`${s.tab} ${tab === t ? s.tabActive : ''}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Timeline ── */}
      {tab === 'timeline' && (
        <div className={s.tabContent}>
          {history.length === 0 ? (
            <div className={s.empty}>Nenhum evento registrado.</div>
          ) : (
            <div className={s.timeline}>
              {history.map(ev => {
                const meta = TIPO_EVENTO_META[ev.tipo]
                return (
                  <div key={ev.id} className={`${s.timelineItem} ${ev.positivo ? s.positive : s.negative}`}>
                    <div className={s.timelineDot} style={{ background: ev.positivo ? '#166534' : '#dc2626' }}>
                      {meta.icon}
                    </div>
                    <div className={s.timelineBody}>
                      <div className={s.timelineHeader}>
                        <span className={s.timelineTitle}>{ev.titulo}</span>
                        <span className={s.timelineDate}>{fmt(ev.data)}</span>
                      </div>
                      <p className={s.timelineDesc}>{ev.descricao}</p>
                      <span className={s.timelinePor}>Por: {ev.registradoPor}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Avaliações ── */}
      {tab === 'avaliacoes' && (
        <div className={s.tabContent}>
          <div className={s.tabActions}>
            <Link to={`/colaboradores/${emp.id}/avaliacao`} className={s.btnPrimary}>+ Nova Avaliação</Link>
          </div>
          {evals.length === 0 ? (
            <div className={s.empty}>Nenhuma avaliação registrada.</div>
          ) : (
            <div className={s.evalList}>
              {evals.map(ev => {
                const meta = STATUS_PERFORMANCE_META[ev.status]
                return (
                  <div key={ev.id} className={s.evalCard}>
                    <div className={s.evalTop}>
                      <div>
                        <div className={s.evalPeriodo}>{ev.periodo}</div>
                        <div className={s.evalDate}>{fmt(ev.data)}</div>
                      </div>
                      {fmtScore(ev.score)}
                      <span className={s.badge} style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                    </div>
                    {ev.comentarios && <p className={s.evalComent}>{ev.comentarios}</p>}
                    {ev.planoMelhoria && (
                      <div className={s.evalPlan}>
                        <strong>Plano de melhoria:</strong> {ev.planoMelhoria}
                      </div>
                    )}
                    <div className={s.evalAval}>Avaliador: {ev.avaliadorNome}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Disciplinar ── */}
      {tab === 'disciplinar' && (
        <div className={s.tabContent}>
          <div className={s.twoColTabs}>

            <div className={s.subSection}>
              <h3 className={s.subTitle}>⚠️ Advertências ({warns.length})</h3>
              {warns.length === 0 ? (
                <div className={s.empty}>Nenhuma advertência registrada.</div>
              ) : (
                warns.map(w => {
                  const meta = TIPO_AVISO_META[w.tipo]
                  return (
                    <div key={w.id} className={s.disciplCard}>
                      <div className={s.disciplTop}>
                        <span className={s.badge} style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                        <span className={s.disciplDate}>{fmt(w.data)}</span>
                        {w.resolvido && <span className={s.resolvedBadge}>✓ Resolvida</span>}
                      </div>
                      <div className={s.disciplTitle}>{w.titulo}</div>
                      <p className={s.disciplDesc}>{w.descricao}</p>
                      {w.resolucao && <p className={s.resolucao}>Resolução: {w.resolucao}</p>}
                      <div className={s.disciplMeta}>Emitido por: {w.emissorNome}</div>
                      {!w.resolvido && (
                        <button className={s.btnResolve} onClick={() => handleResolveWarning(w.id)}>
                          ✓ Marcar como resolvida
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            <div className={s.subSection}>
              <h3 className={s.subTitle}>🏆 Reconhecimentos ({reconhs.length})</h3>
              {reconhs.length === 0 ? (
                <div className={s.empty}>Nenhum reconhecimento registrado.</div>
              ) : (
                reconhs.map(r => {
                  const meta = TIPO_RECONHECIMENTO_META[r.tipo]
                  return (
                    <div key={r.id} className={s.reconhCard}>
                      <div className={s.reconhTop}>
                        <span className={s.reconhIcon}>{meta.icon}</span>
                        <span className={s.badge} style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                        <span className={s.disciplDate}>{fmt(r.data)}</span>
                      </div>
                      <div className={s.disciplTitle}>{r.titulo}</div>
                      <p className={s.disciplDesc}>{r.descricao}</p>
                      <div className={s.disciplMeta}>Por: {r.emissorNome} {r.publico ? '· público' : '· privado'}</div>
                    </div>
                  )
                })
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Tab: Notas do Supervisor ── */}
      {tab === 'notas' && (
        <div className={s.tabContent}>
          <div className={s.noteForm}>
            <div className={s.noteFormTitle}>Nova observação</div>
            <div className={s.noteFormRow}>
              <select className={s.select} value={noteCat} onChange={e => setNoteCat(e.target.value as CategoriaNota)}>
                <option value="geral">Geral</option>
                <option value="comportamento">Comportamento</option>
                <option value="desempenho">Desempenho</option>
                <option value="presenca">Presença</option>
                <option value="seguranca">Segurança</option>
                <option value="desenvolvimento">Desenvolvimento</option>
              </select>
              <label className={s.checkLabel}>
                <input type="checkbox" checked={notePos} onChange={e => setNotePos(e.target.checked)} /> Observação positiva
              </label>
              <label className={s.checkLabel}>
                <input type="checkbox" checked={noteConf} onChange={e => setNoteConf(e.target.checked)} /> Confidencial
              </label>
            </div>
            <textarea className={s.textarea} rows={3} value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Descreva a observação…" />
            <button className={s.btnPrimary} disabled={noteSaving || !noteText.trim()} onClick={handleAddNote}>
              {noteSaving ? 'Salvando…' : 'Adicionar nota'}
            </button>
          </div>

          {notes.length === 0 ? (
            <div className={s.empty}>Nenhuma nota registrada.</div>
          ) : (
            notes.map(n => (
              <div key={n.id} className={`${s.noteCard} ${n.positivo ? s.notePositive : s.noteNegative}`}>
                <div className={s.noteTop}>
                  <span className={s.noteCat}>{n.categoria}</span>
                  {n.confidencial && <span className={s.confBadge}>🔒 Confidencial</span>}
                  <span className={s.disciplDate}>{fmt(n.data)}</span>
                </div>
                <p className={s.noteText}>{n.nota}</p>
                <div className={s.disciplMeta}>Por: {n.supervisorNome}</div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Tab: Segurança ── */}
      {tab === 'seguranca' && (
        <div className={s.tabContent}>
          <div className={s.safetyGrid}>
            <div className={s.safetyCard}>
              <span className={s.safetyIcon}>📢</span>
              <div className={s.safetyVal}>{emp.totalDDSPresencas}</div>
              <div className={s.safetyLbl}>Presenças em DDS</div>
              <Link to={`/seguranca/dds`} className={s.safetyLink}>Ver DDS →</Link>
            </div>
            <div className={s.safetyCard}>
              <span className={s.safetyIcon}>🦺</span>
              <div className={s.safetyVal}>{emp.totalEpisAtivos}</div>
              <div className={s.safetyLbl}>EPIs Ativos</div>
              <Link to={`/seguranca/epi`} className={s.safetyLink}>Ver Ficha EPI →</Link>
            </div>
            <div className={s.safetyCard} style={{ borderColor: emp.totalIncidentesSeg > 0 ? '#dc2626' : undefined }}>
              <span className={s.safetyIcon}>🚨</span>
              <div className={s.safetyVal} style={{ color: emp.totalIncidentesSeg > 0 ? '#dc2626' : 'inherit' }}>{emp.totalIncidentesSeg}</div>
              <div className={s.safetyLbl}>Incidentes de Segurança</div>
              <Link to={`/seguranca/ocorrencias`} className={s.safetyLink}>Ver Ocorrências →</Link>
            </div>
          </div>
          <div className={s.safetyInfo}>
            <p>Os contadores de segurança são atualizados automaticamente pelos módulos de DDS, EPI e Ocorrências quando este colaborador é vinculado por <strong>ID</strong>.</p>
          </div>
        </div>
      )}

    </div>
  )
}

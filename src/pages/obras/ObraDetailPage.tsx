import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getObra, getEmpreiteira, getInspecoesObra,
  getAvaliacaoByObra, createAvaliacao, updateAprovacao,
} from '@/lib/db-obras'
import { toast } from '@/components/ui/Toast'
import { useStore } from '@/store/useStore'
import type { Obra, Empreiteira, InspecaoObra, AvaliacaoEmpreiteira } from '@/types/obras'
import {
  OBRA_STATUS_META, EMPREITEIRA_STATUS_META, AVALIACAO_CRITERIOS, AVALIACAO_PESOS,
  calcAvaliacaoScore, calcRecomendacao, RECOMENDACAO_META,
} from '@/types/obras'
import s from './ObraDetailPage.module.css'

type Tab = 'visao' | 'inspecoes' | 'avaliacao' | 'aprovacao'

function fmtCurrency(v?: number) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtDate(d?: Date) {
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR')
}

function ScoreRing({ score, max = 10 }: { score: number; max?: number }) {
  const pct     = (score / max) * 100
  const color   = score >= 7 ? '#166534' : score >= 5 ? '#d97706' : '#dc2626'
  const r       = 36
  const circ    = 2 * Math.PI * r
  const offset  = circ * (1 - pct / 100)
  return (
    <div className={s.scoreRing}>
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} stroke="#EBF0F7" strokeWidth="6" fill="none" />
        <circle cx="44" cy="44" r={r} stroke={color} strokeWidth="6" fill="none"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 44 44)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className={s.scoreRingInner}>
        <span className={s.scoreRingValue} style={{ color }}>{score.toFixed(1)}</span>
        <span className={s.scoreRingMax}>/{max}</span>
      </div>
    </div>
  )
}

type AvaliacaoForm = {
  qualidade:          number
  seguranca:          number
  prazo:              number
  retrabalho:         number
  organizacao:        number
  custoBeneficio:     number
  profissionalismo:   number
  resolucaoProblemas: number
  justificativa:      string
}
const EMPTY_AVALIACAO: AvaliacaoForm = {
  qualidade:          7, seguranca: 7, prazo: 7, retrabalho: 7,
  organizacao:        7, custoBeneficio: 7, profissionalismo: 7,
  resolucaoProblemas: 7, justificativa: '',
}

export default function ObraDetailPage() {
  const navigate   = useNavigate()
  const { obraId } = useParams<{ obraId: string }>()
  const user       = useStore(st => st.user)

  const [obra,        setObra]        = useState<Obra | null>(null)
  const [empreiteira, setEmpreiteira] = useState<Empreiteira | null>(null)
  const [inspecoes,   setInspecoes]   = useState<InspecaoObra[]>([])
  const [avaliacao,   setAvaliacao]   = useState<AvaliacaoEmpreiteira | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [tab,         setTab]         = useState<Tab>('visao')

  // Avaliação form state
  const [avForm,    setAvForm]    = useState<AvaliacaoForm>(EMPTY_AVALIACAO)
  const [avSaving,  setAvSaving]  = useState(false)

  // Aprovação state
  const [apParecer, setApParecer] = useState('')
  const [apSaving,  setApSaving]  = useState(false)

  useEffect(() => {
    if (!obraId) return
    Promise.all([
      getObra(obraId),
      getInspecoesObra(obraId),
      getAvaliacaoByObra(obraId),
    ])
      .then(async ([o, ins, av]) => {
        if (!o) { toast.error('Obra não encontrada'); navigate('/obras'); return }
        setObra(o)
        setInspecoes(ins)
        setAvaliacao(av)
        if (o.empreiteiraId) {
          const emp = await getEmpreiteira(o.empreiteiraId)
          setEmpreiteira(emp)
        }
        if (av) {
          setAvForm({
            qualidade:          av.qualidade,
            seguranca:          av.seguranca,
            prazo:              av.prazo,
            retrabalho:         av.retrabalho,
            organizacao:        av.organizacao,
            custoBeneficio:     av.custoBeneficio,
            profissionalismo:   av.profissionalismo,
            resolucaoProblemas: av.resolucaoProblemas,
            justificativa:      av.justificativa,
          })
        }
      })
      .catch(() => toast.error('Erro ao carregar dados'))
      .finally(() => setLoading(false))
  }, [obraId, navigate])

  const previewScore = useMemo(() => calcAvaliacaoScore(avForm), [avForm])
  const previewRecom = useMemo(() => calcRecomendacao(previewScore), [previewScore])

  async function handleSaveAvaliacao() {
    if (!obraId || !obra?.empreiteiraId) {
      toast.error('Obra deve ter uma empreiteira vinculada para avaliação final')
      return
    }
    if (!avForm.justificativa.trim()) {
      toast.error('Justificativa é obrigatória')
      return
    }
    setAvSaving(true)
    try {
      const newAv = await createAvaliacao({
        obraId,
        empreiteiraId:     obra.empreiteiraId,
        ...avForm,
        avaliadorId:   user?.uid,
        avaliadorNome: user?.nome,
      })
      const updated = await getAvaliacaoByObra(obraId)
      setAvaliacao(updated)
      if (obra.empreiteiraId) {
        const emp = await getEmpreiteira(obra.empreiteiraId)
        setEmpreiteira(emp)
      }
      toast.success('Avaliação salva! Score da empreiteira atualizado.')
      void newAv
    } catch {
      toast.error('Erro ao salvar avaliação')
    } finally {
      setAvSaving(false)
    }
  }

  async function handleAprovacao(status: 'aprovada' | 'reprovada') {
    if (!obraId) return
    setApSaving(true)
    try {
      await updateAprovacao(obraId, {
        status,
        aprovadorId:   user?.uid,
        aprovadorNome: user?.nome,
        data:          new Date(),
        parecer:       apParecer.trim() || undefined,
      })
      const updated = await getObra(obraId)
      setObra(updated)
      toast.success(`Obra ${status === 'aprovada' ? 'aprovada' : 'reprovada'} com sucesso!`)
    } catch {
      toast.error('Erro ao registrar aprovação')
    } finally {
      setApSaving(false)
    }
  }

  if (loading) return <div className={s.loader}>Carregando…</div>
  if (!obra)   return null

  const statusMeta = OBRA_STATUS_META[obra.status]
  const empMeta    = empreiteira ? EMPREITEIRA_STATUS_META[empreiteira.status] : null

  const orcamentoTotal = (obra.valorContrato ?? 0) + (obra.valorAditivos ?? 0)
  const pctPago        = orcamentoTotal > 0 ? Math.round(((obra.valorPago ?? 0) / orcamentoTotal) * 100) : 0
  const diasRestantes  = obra.dataFimPrevisto
    ? Math.ceil((obra.dataFimPrevisto.getTime() - Date.now()) / 86400000)
    : null

  return (
    <div className={s.page}>

      {/* ── Hero Header ── */}
      <div className={s.hero}>
        <div className={s.heroBg} />
        <div className={s.heroContent}>
          <div className={s.heroTop}>
            <button className={s.backBtn} onClick={() => navigate('/obras')}>← Obras</button>
            <div className={s.heroActions}>
              <button className={s.editBtn} onClick={() => navigate(`/obras/${obraId}/editar`)}>✏️ Editar</button>
              <button className={s.inspBtn} onClick={() => navigate(`/obras/${obraId}/inspecao`)}>
                📋 Nova Inspeção
              </button>
            </div>
          </div>
          <div className={s.heroMain}>
            <div>
              <div className={s.heroCode}>{obra.codigo}</div>
              <h1 className={s.heroTitle}>{obra.nome}</h1>
              <div className={s.heroMeta}>
                📍 {obra.local} · {obra.tipo}
                {obra.responsavelInterno && ` · 👤 ${obra.responsavelInterno}`}
              </div>
            </div>
            <div className={s.heroRight}>
              <span className={s.statusBadge} style={{ color: statusMeta.color, background: statusMeta.bg }}>
                {statusMeta.label}
              </span>
              {obra.alertasCriticos != null && obra.alertasCriticos > 0 && (
                <span className={s.alertBadge}>⚠️ {obra.alertasCriticos} alerta{obra.alertasCriticos > 1 ? 's' : ''}</span>
              )}
            </div>
          </div>

          {/* ── Progress bar ── */}
          <div className={s.progressRow}>
            <div className={s.progressTrack}>
              <div
                className={s.progressFill}
                style={{ width: `${obra.percentualConcluido}%` }}
              />
            </div>
            <span className={s.progressPct}>{obra.percentualConcluido}% concluído</span>
          </div>

          {/* ── Financial & timeline strip ── */}
          <div className={s.heroStrip}>
            <div className={s.heroStat}>
              <div className={s.heroStatLabel}>Contrato</div>
              <div className={s.heroStatValue}>{fmtCurrency(obra.valorContrato)}</div>
            </div>
            <div className={s.heroStatDivider} />
            <div className={s.heroStat}>
              <div className={s.heroStatLabel}>Total c/ Aditivos</div>
              <div className={s.heroStatValue}>{fmtCurrency(orcamentoTotal || undefined)}</div>
            </div>
            <div className={s.heroStatDivider} />
            <div className={s.heroStat}>
              <div className={s.heroStatLabel}>Pago ({pctPago}%)</div>
              <div className={s.heroStatValue}>{fmtCurrency(obra.valorPago)}</div>
            </div>
            <div className={s.heroStatDivider} />
            <div className={s.heroStat}>
              <div className={s.heroStatLabel}>Prazo Final</div>
              <div className={s.heroStatValue}>{fmtDate(obra.dataFimPrevisto)}</div>
            </div>
            {diasRestantes !== null && (
              <>
                <div className={s.heroStatDivider} />
                <div className={s.heroStat}>
                  <div className={s.heroStatLabel}>Dias Restantes</div>
                  <div className={s.heroStatValue} style={{ color: diasRestantes < 0 ? '#fca5a5' : diasRestantes < 7 ? '#fcd34d' : '#86efac' }}>
                    {diasRestantes < 0 ? `${Math.abs(diasRestantes)}d atrasado` : `${diasRestantes}d`}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className={s.tabBar}>
        {([
          { id: 'visao',     label: 'Visão Geral'  },
          { id: 'inspecoes', label: `Inspeções (${inspecoes.length})` },
          { id: 'avaliacao', label: 'Avaliação Final' },
          { id: 'aprovacao', label: 'Aprovação' },
        ] as Array<{ id: Tab; label: string }>).map(t => (
          <button
            key={t.id}
            className={`${s.tabBtn} ${tab === t.id ? s.tabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Visão Geral ── */}
      {tab === 'visao' && (
        <div className={s.tabContent}>
          <div className={s.infoGrid}>
            <div className={s.infoCard}>
              <div className={s.infoCardTitle}>Empreiteira</div>
              {empreiteira ? (
                <div>
                  <div className={s.empName}>{empreiteira.nome}</div>
                  {empMeta && (
                    <span className={s.empBadge} style={{ color: empMeta.color, background: empMeta.bg }}>
                      {empMeta.label}
                    </span>
                  )}
                  {empreiteira.scoreGlobal != null && (
                    <div className={s.empScore}>Score global: <strong>{empreiteira.scoreGlobal}/100</strong></div>
                  )}
                  <div className={s.empSpecs}>{empreiteira.especialidades?.join(', ')}</div>
                  {empreiteira.contato && <div className={s.empContact}>👤 {empreiteira.contato}</div>}
                  <button className={s.linkBtn} onClick={() => navigate(`/empreiteiras/${empreiteira.id}`)}>
                    Ver perfil completo →
                  </button>
                </div>
              ) : (
                <div className={s.noData}>Nenhuma empreiteira vinculada</div>
              )}
            </div>

            <div className={s.infoCard}>
              <div className={s.infoCardTitle}>Desempenho das Inspeções</div>
              {inspecoes.length > 0 ? (
                <div className={s.inspStats}>
                  <ScoreRing score={obra.notaMedia ?? 0} />
                  <div className={s.inspStatsMeta}>
                    <div className={s.statRow}><span>Total de inspeções</span><strong>{inspecoes.length}</strong></div>
                    <div className={s.statRow}><span>Alertas críticos</span>
                      <strong style={{ color: (obra.alertasCriticos ?? 0) > 0 ? '#dc2626' : '#166534' }}>
                        {obra.alertasCriticos ?? 0}
                      </strong>
                    </div>
                    <div className={s.statRow}><span>Última inspeção</span>
                      <strong>{fmtDate(inspecoes[0]?.dataInspecao)}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={s.noData}>
                  Nenhuma inspeção realizada.
                  <button className={s.linkBtn} onClick={() => navigate(`/obras/${obraId}/inspecao`)}>
                    Iniciar primeira inspeção →
                  </button>
                </div>
              )}
            </div>

            <div className={s.infoCard}>
              <div className={s.infoCardTitle}>Dados da Obra</div>
              <div className={s.detailRows}>
                <div className={s.detailRow}><span>Código</span><strong>{obra.codigo}</strong></div>
                <div className={s.detailRow}><span>Tipo</span><strong>{obra.tipo}</strong></div>
                <div className={s.detailRow}><span>Início</span><strong>{fmtDate(obra.dataInicio)}</strong></div>
                <div className={s.detailRow}><span>Prazo previsto</span><strong>{fmtDate(obra.dataFimPrevisto)}</strong></div>
                <div className={s.detailRow}><span>Prazo real</span><strong>{fmtDate(obra.dataFimReal)}</strong></div>
                <div className={s.detailRow}><span>Responsável</span><strong>{obra.responsavelInterno ?? '—'}</strong></div>
                <div className={s.detailRow}><span>Aprovação</span>
                  <strong style={{ color: obra.aprovacaoFinal?.status === 'aprovada' ? '#166534' : obra.aprovacaoFinal?.status === 'reprovada' ? '#dc2626' : undefined }}>
                    {obra.aprovacaoFinal?.status === 'aprovada' ? '✅ Aprovada' :
                     obra.aprovacaoFinal?.status === 'reprovada' ? '❌ Reprovada' : 'Pendente'}
                  </strong>
                </div>
              </div>
            </div>
          </div>
          {obra.descricao && (
            <div className={s.descCard}>
              <div className={s.descTitle}>Descrição</div>
              <p className={s.descText}>{obra.descricao}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Inspeções ── */}
      {tab === 'inspecoes' && (
        <div className={s.tabContent}>
          <div className={s.sectionHeader}>
            <div>
              <h3 className={s.sectionTitle}>Histórico de Inspeções</h3>
              <p className={s.sectionSub}>{inspecoes.length} inspeção(ões) realizadas</p>
            </div>
            <button className={s.btnPrimary} onClick={() => navigate(`/obras/${obraId}/inspecao`)}>
              + Nova Inspeção
            </button>
          </div>
          {inspecoes.length === 0 ? (
            <div className={s.emptyState}>
              <div className={s.emptyIcon}>📋</div>
              <div className={s.emptyTitle}>Nenhuma inspeção registrada</div>
              <div className={s.emptyDesc}>Inicie a primeira inspeção para acompanhar o desempenho da obra.</div>
              <button className={s.btnPrimary} onClick={() => navigate(`/obras/${obraId}/inspecao`)}>
                + Iniciar Inspeção
              </button>
            </div>
          ) : (
            <div className={s.inspecoesList}>
              {inspecoes.map(insp => {
                const sc = insp.scoreGeral
                const color = sc >= 7 ? '#166534' : sc >= 5 ? '#d97706' : '#dc2626'
                const statusColor = insp.status === 'aprovada' ? '#166534' : insp.status === 'submetida' ? '#3b82f6' : '#94a3b8'
                return (
                  <div key={insp.id} className={s.inspCard}
                    onClick={() => navigate(`/obras/${obraId}/inspecao/${insp.id}`)}>
                    <div className={s.inspCardScore} style={{ color, borderColor: color }}>
                      {sc.toFixed(1)}
                    </div>
                    <div className={s.inspCardBody}>
                      <div className={s.inspCardDate}>{fmtDate(insp.dataInspecao)}</div>
                      <div className={s.inspCardInsp}>
                        👤 {insp.inspetorNome ?? 'Sem inspetor'} &nbsp;·&nbsp;
                        <span style={{ color: statusColor, fontWeight: 600 }}>
                          {insp.status === 'aprovada' ? '✅ Aprovada' :
                           insp.status === 'submetida' ? '🔵 Submetida' : '📝 Rascunho'}
                        </span>
                      </div>
                      {insp.alertasCriticos?.length > 0 && (
                        <div className={s.inspAlerts}>
                          ⚠️ {insp.alertasCriticos.filter(a => a.tipo === 'critico').length} crítico(s),{' '}
                          {insp.alertasCriticos.filter(a => a.tipo === 'atencao').length} atenção
                        </div>
                      )}
                    </div>
                    <div className={s.inspCardArrow}>→</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Avaliação Final ── */}
      {tab === 'avaliacao' && (
        <div className={s.tabContent}>
          {avaliacao ? (
            <div>
              <div className={s.avaliacaoHeader}>
                <div className={s.avaliacaoTitle}>Avaliação Final Registrada</div>
                <div className={s.avaliacaoDate}>em {fmtDate(avaliacao.createdAt)} por {avaliacao.avaliadorNome ?? '—'}</div>
              </div>
              <div className={s.avaliacaoResult}>
                <div className={s.avalResultScore}>
                  <ScoreRing score={avaliacao.scoreTotal / 10} max={10} />
                  <div className={s.avalResultMeta}>
                    <div className={s.avalScore100}>{avaliacao.scoreTotal}<span>/100</span></div>
                    <div className={s.avalRecom} style={{ color: RECOMENDACAO_META[avaliacao.recomendacao].color }}>
                      {RECOMENDACAO_META[avaliacao.recomendacao].icon} {RECOMENDACAO_META[avaliacao.recomendacao].label}
                    </div>
                  </div>
                </div>
                <div className={s.avalCriterios}>
                  {AVALIACAO_CRITERIOS.map(c => {
                    const nota = avaliacao[c.key as keyof AvaliacaoEmpreiteira] as number
                    const color = nota >= 7 ? '#166534' : nota >= 5 ? '#d97706' : '#dc2626'
                    const w = (nota / 10) * 100
                    return (
                      <div key={c.key} className={s.criterioRow}>
                        <span className={s.criterioLabel}>{c.label}</span>
                        <div className={s.criterioBar}>
                          <div className={s.criterioFill} style={{ width: `${w}%`, background: color }} />
                        </div>
                        <span className={s.criterioNota} style={{ color }}>{nota.toFixed(1)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              {avaliacao.justificativa && (
                <div className={s.justificativaBox}>
                  <div className={s.justificativaLabel}>Justificativa do Avaliador</div>
                  <p className={s.justificativaText}>{avaliacao.justificativa}</p>
                </div>
              )}
            </div>
          ) : (
            <div>
              {!obra.empreiteiraId && (
                <div className={s.warningBanner}>
                  ⚠️ Esta obra não tem empreiteira vinculada. Vincule uma empreiteira para liberar a avaliação final.
                </div>
              )}
              <div className={s.avaliacaoForm}>
                <h3 className={s.sectionTitle}>Avaliação Final da Empreiteira</h3>
                <p className={s.sectionSub}>
                  Avaliar cada critério de 0 a 10. Score final ponderado gera a decisão de recontratação.
                </p>

                {/* Score preview */}
                <div className={s.scorePreview}>
                  <div className={s.scorePreviewValue} style={{ color: previewScore >= 70 ? '#166534' : previewScore >= 55 ? '#d97706' : '#dc2626' }}>
                    {previewScore}
                  </div>
                  <div className={s.scorePreviewLabel}>/100 (preview)</div>
                  <div className={s.scorePreviewRecom} style={{ color: RECOMENDACAO_META[previewRecom].color }}>
                    {RECOMENDACAO_META[previewRecom].icon} {RECOMENDACAO_META[previewRecom].label}
                  </div>
                </div>

                <div className={s.criteriosGrid}>
                  {AVALIACAO_CRITERIOS.map(c => (
                    <div key={c.key} className={s.criterioField}>
                      <label className={s.criterioFieldLabel}>
                        {c.label}
                        <span className={s.pesoTag}>{Math.round(AVALIACAO_PESOS[c.key] * 100)}%</span>
                      </label>
                      <p className={s.criterioFieldDesc}>{c.desc}</p>
                      <div className={s.notaInputRow}>
                        <input
                          type="range" min={0} max={10} step={0.5}
                          className={s.notaSlider}
                          value={avForm[c.key as keyof AvaliacaoForm] as number}
                          onChange={e => setAvForm(f => ({ ...f, [c.key]: Number(e.target.value) }))}
                          disabled={!obra.empreiteiraId}
                        />
                        <span className={s.notaValue}>{(avForm[c.key as keyof AvaliacaoForm] as number).toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className={s.justificativaField}>
                  <label className={s.criterioFieldLabel}>Justificativa *</label>
                  <textarea className={s.textarea} rows={4}
                    value={avForm.justificativa}
                    onChange={e => setAvForm(f => ({ ...f, justificativa: e.target.value }))}
                    placeholder="Descreva o desempenho geral, pontos positivos, problemas identificados e a recomendação para futuros contratos…"
                    disabled={!obra.empreiteiraId}
                  />
                </div>

                <div className={s.avaliacaoActions}>
                  <button
                    className={s.btnPrimary}
                    onClick={handleSaveAvaliacao}
                    disabled={avSaving || !obra.empreiteiraId}
                  >
                    {avSaving ? 'Salvando…' : '💾 Salvar Avaliação Final'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Aprovação ── */}
      {tab === 'aprovacao' && (
        <div className={s.tabContent}>
          <div className={s.aprovacaoCard}>
            <h3 className={s.sectionTitle}>Aprovação Final da Obra</h3>
            <p className={s.sectionSub}>
              A aprovação final confirma a entrega da obra, quitação técnica e encerramento do contrato.
            </p>
            {obra.aprovacaoFinal?.status && obra.aprovacaoFinal.status !== 'pendente' ? (
              <div className={s.aprovacaoResult}>
                <div className={s.aprovacaoStatus} style={{
                  color: obra.aprovacaoFinal.status === 'aprovada' ? '#166534' : '#dc2626',
                  background: obra.aprovacaoFinal.status === 'aprovada' ? 'rgba(22,101,52,0.08)' : 'rgba(220,38,38,0.08)',
                }}>
                  {obra.aprovacaoFinal.status === 'aprovada' ? '✅ OBRA APROVADA' : '❌ OBRA REPROVADA'}
                </div>
                <div className={s.aprovacaoMeta}>
                  Por {obra.aprovacaoFinal.aprovadorNome ?? '—'} em {fmtDate(obra.aprovacaoFinal.data)}
                </div>
                {obra.aprovacaoFinal.parecer && (
                  <div className={s.aprovacaoParecer}>{obra.aprovacaoFinal.parecer}</div>
                )}
              </div>
            ) : (
              <div>
                <div className={s.checklist}>
                  {[
                    { ok: obra.percentualConcluido >= 100,     label: 'Obra 100% concluída'              },
                    { ok: inspecoes.length > 0,                label: 'Ao menos uma inspeção realizada'  },
                    { ok: avaliacao !== null,                   label: 'Avaliação final preenchida'       },
                    { ok: (obra.alertasCriticos ?? 0) === 0,   label: 'Sem alertas críticos em aberto'   },
                  ].map((item, i) => (
                    <div key={i} className={`${s.checkItem} ${item.ok ? s.checkOk : s.checkPending}`}>
                      <span>{item.ok ? '✅' : '⏳'}</span> {item.label}
                    </div>
                  ))}
                </div>
                <div className={s.aprovacaoPaecerField}>
                  <label className={s.criterioFieldLabel}>Parecer (opcional)</label>
                  <textarea className={s.textarea} rows={3}
                    value={apParecer} onChange={e => setApParecer(e.target.value)}
                    placeholder="Observações sobre a entrega final, pendências, retenções…"
                  />
                </div>
                <div className={s.aprovacaoActions}>
                  <button className={s.btnDanger} onClick={() => handleAprovacao('reprovada')} disabled={apSaving}>
                    {apSaving ? 'Processando…' : '❌ Reprovar Obra'}
                  </button>
                  <button className={s.btnSuccess} onClick={() => handleAprovacao('aprovada')} disabled={apSaving}>
                    {apSaving ? 'Processando…' : '✅ Aprovar Obra'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

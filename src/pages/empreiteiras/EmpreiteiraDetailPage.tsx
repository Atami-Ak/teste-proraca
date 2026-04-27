import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getEmpreiteira, updateEmpreiteira,
  getAvaliacoesEmpreiteira, getObras,
} from '@/lib/db-obras'
import { toast } from '@/components/ui/Toast'
import type { Empreiteira, AvaliacaoEmpreiteira, Obra } from '@/types/obras'
import {
  EMPREITEIRA_STATUS_META, AVALIACAO_CRITERIOS, RECOMENDACAO_META,
} from '@/types/obras'
import s from './EmpreiteiraDetailPage.module.css'

function fmtDate(d?: Date) {
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR')
}

function CriterioBar({ label, nota }: { label: string; nota: number }) {
  const color = nota >= 7 ? '#166534' : nota >= 5 ? '#d97706' : '#dc2626'
  return (
    <div className={s.criterioRow}>
      <span className={s.criterioLabel}>{label}</span>
      <div className={s.criterioTrack}>
        <div className={s.criterioFill} style={{ width: `${nota * 10}%`, background: color }} />
      </div>
      <span className={s.criterioNota} style={{ color }}>{nota.toFixed(1)}</span>
    </div>
  )
}

export default function EmpreiteiraDetailPage() {
  const navigate            = useNavigate()
  const { empreiteiraId }   = useParams<{ empreiteiraId: string }>()

  const [emp,        setEmp]        = useState<Empreiteira | null>(null)
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoEmpreiteira[]>([])
  const [obras,      setObras]      = useState<Obra[]>([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    if (!empreiteiraId) return
    Promise.all([
      getEmpreiteira(empreiteiraId),
      getAvaliacoesEmpreiteira(empreiteiraId),
      getObras(),
    ])
      .then(([e, avs, allObras]) => {
        if (!e) { toast.error('Empreiteira não encontrada'); navigate('/empreiteiras'); return }
        setEmp(e)
        setAvaliacoes(avs)
        setObras(allObras.filter(o => o.empreiteiraId === empreiteiraId))
      })
      .catch(() => toast.error('Erro ao carregar dados'))
      .finally(() => setLoading(false))
  }, [empreiteiraId, navigate])

  async function toggleAtivo() {
    if (!emp || !empreiteiraId) return
    try {
      await updateEmpreiteira(empreiteiraId, { ativo: !emp.ativo })
      setEmp(e => e ? { ...e, ativo: !e.ativo } : e)
      toast.success(emp.ativo ? 'Empreiteira desativada' : 'Empreiteira ativada')
    } catch {
      toast.error('Erro ao alterar status')
    }
  }

  if (loading) return <div className={s.loader}>Carregando…</div>
  if (!emp)    return null

  const statusMeta = EMPREITEIRA_STATUS_META[emp.status]
  const taxaAprov  = emp.totalObras && emp.totalObras > 0
    ? Math.round(((emp.obrasAprovadas ?? 0) / emp.totalObras) * 100)
    : null

  // Last evaluation for score breakdown
  const lastAv = avaliacoes[0] ?? null

  return (
    <div className={s.page}>

      {/* ── Hero ── */}
      <div className={s.hero}>
        <div className={s.heroBg} />
        <div className={s.heroContent}>
          <div className={s.heroTop}>
            <button className={s.backBtn} onClick={() => navigate('/empreiteiras')}>← Empreiteiras</button>
            <div className={s.heroActions}>
              <button className={s.toggleBtn}
                style={{ borderColor: emp.ativo ? 'rgba(255,255,255,0.4)' : '#fca5a5' }}
                onClick={toggleAtivo}>
                {emp.ativo ? '🟢 Ativa' : '⚫ Inativa'}
              </button>
              <button className={s.obraBtn} onClick={() => navigate(`/obras?emp=${empreiteiraId}`)}>
                🏗️ Ver Obras
              </button>
            </div>
          </div>

          <div className={s.heroMain}>
            <div>
              <h1 className={s.heroName}>{emp.nome}</h1>
              {emp.cnpj && <div className={s.heroCnpj}>CNPJ: {emp.cnpj}</div>}
              <div className={s.heroSpecs}>{emp.especialidades?.join(' · ')}</div>
            </div>
            <div className={s.heroScoreBlock}>
              <div className={s.heroScoreValue}
                style={{ color: emp.scoreGlobal != null && emp.scoreGlobal >= 70 ? '#86efac' : emp.scoreGlobal != null && emp.scoreGlobal >= 55 ? '#fcd34d' : '#fca5a5' }}>
                {emp.scoreGlobal != null ? emp.scoreGlobal : '—'}
              </div>
              <div className={s.heroScoreLabel}>/100 · Score Global</div>
              <span className={s.heroBadge} style={{ color: statusMeta.color, background: statusMeta.bg }}>
                {statusMeta.label}
              </span>
            </div>
          </div>

          <div className={s.heroStats}>
            <div className={s.heroStat}>
              <div className={s.heroStatVal}>{emp.totalObras ?? 0}</div>
              <div className={s.heroStatLbl}>Total de Obras</div>
            </div>
            <div className={s.heroStatDiv} />
            <div className={s.heroStat}>
              <div className={s.heroStatVal}>{emp.obrasAprovadas ?? 0}</div>
              <div className={s.heroStatLbl}>Obras Aprovadas</div>
            </div>
            <div className={s.heroStatDiv} />
            <div className={s.heroStat}>
              <div className={s.heroStatVal}>{taxaAprov != null ? `${taxaAprov}%` : '—'}</div>
              <div className={s.heroStatLbl}>Taxa de Aprovação</div>
            </div>
            <div className={s.heroStatDiv} />
            <div className={s.heroStat}>
              <div className={s.heroStatVal}>{avaliacoes.length}</div>
              <div className={s.heroStatLbl}>Avaliações</div>
            </div>
          </div>
        </div>
      </div>

      <div className={s.body}>

        {/* ── Contato ── */}
        <div className={s.card}>
          <div className={s.cardTitle}>Contato</div>
          <div className={s.contactGrid}>
            {emp.contato  && <div className={s.contactItem}><span>👤</span> {emp.contato}</div>}
            {emp.email    && <div className={s.contactItem}><span>📧</span> {emp.email}</div>}
            {emp.telefone && <div className={s.contactItem}><span>📞</span> {emp.telefone}</div>}
          </div>
          {emp.observacoes && (
            <div className={s.obsBox}>{emp.observacoes}</div>
          )}
        </div>

        {/* ── Score breakdown (last evaluation) ── */}
        {lastAv && (
          <div className={s.card}>
            <div className={s.cardTitle}>Última Avaliação — {fmtDate(lastAv.createdAt)}</div>
            <div className={s.avalHeader}>
              <div className={s.avalScore}>
                <span className={s.avalScoreVal} style={{ color: lastAv.scoreTotal >= 70 ? '#166534' : lastAv.scoreTotal >= 55 ? '#d97706' : '#dc2626' }}>
                  {lastAv.scoreTotal}
                </span>
                <span className={s.avalScoreSub}>/100</span>
              </div>
              <div className={s.avalRecom} style={{ color: RECOMENDACAO_META[lastAv.recomendacao].color }}>
                {RECOMENDACAO_META[lastAv.recomendacao].icon} {RECOMENDACAO_META[lastAv.recomendacao].label}
              </div>
            </div>
            <div className={s.criteriosBlock}>
              {AVALIACAO_CRITERIOS.map(c => (
                <CriterioBar
                  key={c.key}
                  label={c.label}
                  nota={lastAv[c.key as keyof AvaliacaoEmpreiteira] as number}
                />
              ))}
            </div>
            {lastAv.justificativa && (
              <div className={s.justBox}>{lastAv.justificativa}</div>
            )}
          </div>
        )}

        {/* ── Histórico de avaliações ── */}
        {avaliacoes.length > 1 && (
          <div className={s.card}>
            <div className={s.cardTitle}>Histórico de Avaliações</div>
            <div className={s.histList}>
              {avaliacoes.map(av => {
                const scoreColor = av.scoreTotal >= 70 ? '#166534' : av.scoreTotal >= 55 ? '#d97706' : '#dc2626'
                const obraRef    = obras.find(o => o.id === av.obraId)
                return (
                  <div key={av.id} className={s.histItem}
                    onClick={() => navigate(`/obras/${av.obraId}`)}>
                    <div className={s.histScore} style={{ color: scoreColor, borderColor: scoreColor }}>
                      {av.scoreTotal}
                    </div>
                    <div className={s.histMeta}>
                      <div className={s.histObra}>{obraRef?.nome ?? av.obraId}</div>
                      <div className={s.histDate}>{fmtDate(av.createdAt)} · {av.avaliadorNome ?? '—'}</div>
                    </div>
                    <div className={s.histRecom} style={{ color: RECOMENDACAO_META[av.recomendacao].color }}>
                      {RECOMENDACAO_META[av.recomendacao].icon}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Obras vinculadas ── */}
        <div className={s.card}>
          <div className={s.cardTitle}>Obras Vinculadas ({obras.length})</div>
          {obras.length === 0 ? (
            <div className={s.noData}>Nenhuma obra vinculada ainda.</div>
          ) : (
            <div className={s.obrasList}>
              {obras.map(obra => {
                const oSt = obra.status
                const color = oSt === 'concluida' ? '#166534' : oSt === 'em_andamento' ? '#d97706' : '#94a3b8'
                return (
                  <div key={obra.id} className={s.obraItem} onClick={() => navigate(`/obras/${obra.id}`)}>
                    <div className={s.obraMeta}>
                      <span className={s.obraCod}>{obra.codigo}</span>
                      <span className={s.obraNome}>{obra.nome}</span>
                    </div>
                    <div className={s.obraStatus} style={{ color }}>{obra.status.replace('_', ' ')}</div>
                    <div className={s.obraPct}>{obra.percentualConcluido}%</div>
                    {obra.notaMedia != null && (
                      <div className={s.obraNota} style={{ color: obra.notaMedia >= 7 ? '#166534' : '#d97706' }}>
                        {obra.notaMedia.toFixed(1)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  )
}

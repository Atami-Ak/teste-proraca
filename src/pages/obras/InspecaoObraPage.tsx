import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getObra, getInspecao, createInspecao, updateInspecao,
  computeInspecaoScore,
} from '@/lib/db-obras'
import { buildEmptyInspecao, INSPECAO_CATALOG } from '@/data/inspecao-obra-catalog'
import { toast } from '@/components/ui/Toast'
import { useStore } from '@/store/useStore'
import type { Obra, InspecaoSecao, InspecaoItem } from '@/types/obras'
import s from './InspecaoObraPage.module.css'

type Nota = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

const NOTA_LABELS: Record<number, string> = {
  0: 'Péssimo', 1: 'Muito ruim', 2: 'Ruim', 3: 'Abaixo do mínimo',
  4: 'Insuficiente', 5: 'Regular', 6: 'Aceitável',
  7: 'Bom', 8: 'Muito bom', 9: 'Excelente', 10: 'Perfeito',
}

function notaColor(n: number | null) {
  if (n === null) return '#94a3b8'
  if (n >= 8) return '#166534'
  if (n >= 6) return '#16a34a'
  if (n >= 4) return '#d97706'
  return '#dc2626'
}

function SectionProgress({ secao }: { secao: InspecaoSecao }) {
  const avaliados = secao.itens.filter(i => i.nota !== null).length
  const total     = secao.itens.length
  const pct       = Math.round((avaliados / total) * 100)
  return (
    <div className={s.secProgWrap}>
      <div className={s.secProgBar} style={{ width: `${pct}%` }} />
      <span className={s.secProgLabel}>{avaliados}/{total}</span>
    </div>
  )
}

export default function InspecaoObraPage() {
  const navigate     = useNavigate()
  const { obraId, inspecaoId } = useParams<{ obraId: string; inspecaoId?: string }>()
  const user         = useStore(st => st.user)
  const isEdit       = Boolean(inspecaoId)

  const [obra,      setObra]      = useState<Obra | null>(null)
  const [secoes,    setSecoes]    = useState<InspecaoSecao[]>([])
  const [activeSection, setActiveSection] = useState(0)
  const [dataInspecao,  setDataInspecao]  = useState(new Date().toISOString().split('T')[0])
  const [observacoes,   setObservacoes]   = useState('')
  const [inspStatus,    setInspStatus]    = useState<'rascunho' | 'submetida'>('rascunho')
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [readOnly,  setReadOnly]  = useState(false)

  useEffect(() => {
    if (!obraId) return
    const loadObra = getObra(obraId)
    const loadInsp = inspecaoId ? getInspecao(inspecaoId) : Promise.resolve(null)

    Promise.all([loadObra, loadInsp])
      .then(([o, insp]) => {
        if (!o) { toast.error('Obra não encontrada'); navigate('/obras'); return }
        setObra(o)
        if (insp) {
          setSecoes(insp.secoes)
          setDataInspecao(insp.dataInspecao.toISOString().split('T')[0])
          setObservacoes(insp.observacoes ?? '')
          setInspStatus(insp.status === 'submetida' || insp.status === 'aprovada' ? 'submetida' : 'rascunho')
          setReadOnly(insp.status === 'aprovada')
        } else {
          setSecoes(buildEmptyInspecao())
        }
      })
      .catch(() => { toast.error('Erro ao carregar dados'); navigate(`/obras/${obraId}`) })
      .finally(() => setLoading(false))
  }, [obraId, inspecaoId, navigate])

  function setNota(secaoIdx: number, itemIdx: number, nota: number | null) {
    setSecoes(prev => {
      const next = prev.map((sec, si) => {
        if (si !== secaoIdx) return sec
        const itens: InspecaoItem[] = sec.itens.map((item, ii) =>
          ii === itemIdx ? { ...item, nota: nota as Nota } : item
        )
        const avaliados = itens.filter(i => i.nota !== null)
        const scoreSecao = avaliados.length > 0
          ? avaliados.reduce((s, i) => s + (i.nota ?? 0), 0) / avaliados.length
          : 0
        return { ...sec, itens, scoreSecao: Math.round(scoreSecao * 10) / 10 }
      })
      return next
    })
  }

  function setItemObs(secaoIdx: number, itemIdx: number, obs: string) {
    setSecoes(prev => prev.map((sec, si) =>
      si !== secaoIdx ? sec :
        { ...sec, itens: sec.itens.map((item, ii) => ii === itemIdx ? { ...item, observacao: obs } : item) }
    ))
  }

  const { scoreGeral, alertasCriticos } = useMemo(
    () => computeInspecaoScore(secoes),
    [secoes]
  )

  const totalAvaliados = useMemo(
    () => secoes.reduce((s, sec) => s + sec.itens.filter(i => i.nota !== null).length, 0),
    [secoes]
  )
  const totalItens = useMemo(
    () => secoes.reduce((s, sec) => s + sec.itens.length, 0),
    [secoes]
  )

  const handleSave = useCallback(async (submit: boolean) => {
    if (!obraId) return
    setSaving(true)
    const status: 'rascunho' | 'submetida' = submit ? 'submetida' : 'rascunho'
    try {
      const payload = {
        obraId,
        empreiteiraId: obra?.empreiteiraId,
        dataInspecao:  new Date(dataInspecao + 'T12:00:00'),
        inspetorId:    user?.uid,
        inspetorNome:  user?.nome,
        secoes,
        scoreGeral,
        alertasCriticos,
        observacoes:   observacoes.trim() || undefined,
        status,
      }
      if (isEdit && inspecaoId) {
        await updateInspecao(inspecaoId, payload)
        toast.success(submit ? 'Inspeção submetida!' : 'Rascunho salvo!')
      } else {
        const newId = await createInspecao(payload)
        toast.success(submit ? 'Inspeção submetida com sucesso!' : 'Rascunho salvo!')
        navigate(`/obras/${obraId}/inspecao/${newId}`, { replace: true })
      }
      setInspStatus(status)
    } catch {
      toast.error('Erro ao salvar inspeção. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }, [obraId, obra, dataInspecao, user, secoes, scoreGeral, alertasCriticos, observacoes, isEdit, inspecaoId, navigate])

  if (loading) return <div className={s.loader}>Carregando inspeção…</div>
  if (!obra)   return null

  const scoreColor = notaColor(scoreGeral)
  const pctCompleto = totalItens > 0 ? Math.round((totalAvaliados / totalItens) * 100) : 0

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <button className={s.backBtn} onClick={() => navigate(`/obras/${obraId}`)}>
            ← {obra.codigo}
          </button>
          <div>
            <h1 className={s.pageTitle}>{isEdit ? 'Inspeção' : 'Nova Inspeção'}</h1>
            <p className={s.pageSub}>{obra.nome}</p>
          </div>
        </div>
        <div className={s.headerRight}>
          <div className={s.scoreLive} style={{ color: scoreColor }}>
            <div className={s.scoreLiveValue}>{scoreGeral.toFixed(1)}</div>
            <div className={s.scoreLiveLabel}>/10</div>
          </div>
          {alertasCriticos.filter(a => a.tipo === 'critico').length > 0 && (
            <div className={s.critAlert}>
              ⚠️ {alertasCriticos.filter(a => a.tipo === 'critico').length} crítico(s)
            </div>
          )}
        </div>
      </div>

      {/* ── Meta bar ── */}
      <div className={s.metaBar}>
        <div className={s.metaField}>
          <label className={s.metaLabel}>Data da Inspeção</label>
          <input className={s.metaInput} type="date"
            value={dataInspecao} onChange={e => setDataInspecao(e.target.value)}
            disabled={readOnly}
          />
        </div>
        <div className={s.metaProgress}>
          <span className={s.metaLabel}>Progresso</span>
          <div className={s.metaProgressBar}>
            <div className={s.metaProgressFill} style={{ width: `${pctCompleto}%` }} />
          </div>
          <span className={s.metaProgressLabel}>{totalAvaliados}/{totalItens} itens</span>
        </div>
        {inspStatus === 'submetida' && (
          <div className={s.submittedBadge}>✅ Submetida</div>
        )}
      </div>

      <div className={s.layout}>

        {/* ── Section nav ── */}
        <div className={s.sectionNav}>
          {INSPECAO_CATALOG.map((cat, idx) => {
            const sec   = secoes[idx]
            const aval  = sec?.itens.filter(i => i.nota !== null).length ?? 0
            const total = cat.itens.length
            const done  = aval === total
            const score = sec?.scoreSecao ?? 0
            return (
              <button
                key={cat.id}
                className={`${s.sectionNavItem} ${activeSection === idx ? s.sectionNavActive : ''}`}
                onClick={() => setActiveSection(idx)}
              >
                <span className={s.sectionNavIcon}>{cat.icon}</span>
                <div className={s.sectionNavMeta}>
                  <span className={s.sectionNavLabel}>{cat.label}</span>
                  <div className={s.sectionNavSub}>
                    <SectionProgress secao={sec ?? { itens: [] } as unknown as InspecaoSecao} />
                  </div>
                </div>
                {done && (
                  <span className={s.sectionNavScore} style={{ color: notaColor(score) }}>
                    {score.toFixed(1)}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Items panel ── */}
        <div className={s.itemsPanel}>
          {secoes.length > 0 && (() => {
            const cat = INSPECAO_CATALOG[activeSection]
            const sec = secoes[activeSection]
            return (
              <div>
                <div className={s.panelHeader}>
                  <div className={s.panelIcon}>{cat.icon}</div>
                  <div>
                    <div className={s.panelTitle}>{cat.label}</div>
                    <div className={s.panelMeta}>
                      Peso: {Math.round(cat.peso * 100)}% do score final &nbsp;·&nbsp;
                      {cat.itens.filter(i => i.critico).length} item(s) crítico(s)
                    </div>
                  </div>
                  {sec.scoreSecao > 0 && (
                    <div className={s.panelScore} style={{ color: notaColor(sec.scoreSecao) }}>
                      {sec.scoreSecao.toFixed(1)}
                    </div>
                  )}
                </div>

                <div className={s.itemsList}>
                  {sec.itens.map((item, itemIdx) => (
                    <div
                      key={item.itemId}
                      className={`${s.itemCard} ${item.nota !== null ? s.itemDone : ''} ${item.critico ? s.itemCritico : ''}`}
                    >
                      <div className={s.itemHeader}>
                        <div className={s.itemLabel}>
                          {item.label}
                          {item.critico && <span className={s.criticoTag}>Crítico</span>}
                        </div>
                        {item.nota !== null && (
                          <span className={s.itemNota} style={{ color: notaColor(item.nota) }}>
                            {item.nota} — {NOTA_LABELS[item.nota]}
                          </span>
                        )}
                      </div>

                      {/* Score picker */}
                      <div className={s.notaPicker}>
                        {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                          <button
                            key={n}
                            className={`${s.notaBtn} ${item.nota === n ? s.notaSelected : ''}`}
                            style={item.nota === n ? { background: notaColor(n), borderColor: notaColor(n), color: '#fff' } : {}}
                            onClick={() => !readOnly && setNota(activeSection, itemIdx, item.nota === n ? null : n)}
                            disabled={readOnly}
                          >
                            {n}
                          </button>
                        ))}
                      </div>

                      {/* Observation (only if NC/low) */}
                      {(item.nota !== null && item.nota < 6) && (
                        <textarea
                          className={s.itemObs}
                          placeholder={item.critico ? 'Descrição obrigatória para item crítico abaixo de 6…' : 'Observação (opcional)…'}
                          value={item.observacao ?? ''}
                          onChange={e => !readOnly && setItemObs(activeSection, itemIdx, e.target.value)}
                          disabled={readOnly}
                          rows={2}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Section navigation */}
                <div className={s.sectionNav2}>
                  {activeSection > 0 && (
                    <button className={s.navPrev} onClick={() => setActiveSection(i => i - 1)}>
                      ← Seção anterior
                    </button>
                  )}
                  {activeSection < INSPECAO_CATALOG.length - 1 ? (
                    <button className={s.navNext} onClick={() => setActiveSection(i => i + 1)}>
                      Próxima seção →
                    </button>
                  ) : (
                    <div className={s.sectionFinished}>
                      Todas as seções avaliadas ✓
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </div>

      </div>

      {/* ── Observações gerais + Ações ── */}
      <div className={s.footer}>
        <div className={s.footerObs}>
          <label className={s.metaLabel}>Observações Gerais</label>
          <textarea className={s.obsTextarea} rows={2}
            value={observacoes} onChange={e => setObservacoes(e.target.value)}
            placeholder="Observações gerais sobre a inspeção…"
            disabled={readOnly}
          />
        </div>
        <div className={s.footerActions}>
          {!readOnly && (
            <>
              <button className={s.draftBtn} onClick={() => handleSave(false)} disabled={saving}>
                {saving ? 'Salvando…' : '💾 Salvar Rascunho'}
              </button>
              <button
                className={s.submitBtn}
                onClick={() => handleSave(true)}
                disabled={saving || pctCompleto < 100}
                title={pctCompleto < 100 ? 'Avalie todos os itens para submeter' : ''}
              >
                {saving ? 'Submetendo…' : `✅ Submeter Inspeção (${pctCompleto}%)`}
              </button>
            </>
          )}
          {readOnly && (
            <button className={s.draftBtn} onClick={() => navigate(`/obras/${obraId}`)}>
              ← Voltar para a obra
            </button>
          )}
        </div>
      </div>

    </div>
  )
}

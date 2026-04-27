import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createDDI, updateDDI, getDDI, computeDDIScore } from '@/lib/db-safety'
import { useStore } from '@/store/useStore'
import type { DDI, DDIItem, DDIResultado } from '@/types/safety'
import { SETORES_FABRICA } from '@/types/safety'
import { buildEmptyDDISecoes } from '@/data/ddi-catalog'
import { toast } from '@/components/ui/Toast'
import s from './DDIFormPage.module.css'

type Form = {
  data:      string
  hora:      string
  setor:     string
  inspetor:  string
  observacoesGerais: string
}

export default function DDIFormPage() {
  const navigate = useNavigate()
  const { id }   = useParams<{ id: string }>()
  const isEdit   = !!id
  const user     = useStore(st => st.user)

  const [form, setForm]         = useState<Form>({
    data:    new Date().toISOString().split('T')[0],
    hora:    new Date().toTimeString().slice(0, 5),
    setor:   '',
    inspetor: user?.nome ?? '',
    observacoesGerais: '',
  })
  const [secoes, setSecoes]   = useState(() => buildEmptyDDISecoes())
  const [activeSecao, setActiveSecao] = useState(0)
  const [loading, setLoading] = useState(false)
  const [initLoading, setInitLoading] = useState(isEdit)

  useEffect(() => {
    if (!isEdit) return
    getDDI(id!).then(d => {
      if (!d) { toast.error('Inspeção não encontrada.'); navigate('/seguranca/ddi'); return }
      setForm({
        data:    d.data.toISOString().split('T')[0],
        hora:    d.hora,
        setor:   d.setor,
        inspetor: d.inspetor,
        observacoesGerais: d.observacoesGerais ?? '',
      })
      setSecoes(d.secoes)
      setInitLoading(false)
    })
  }, [id, isEdit, navigate])

  function set(key: keyof Form, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function setItemResult(secaoIdx: number, itemIdx: number, resultado: DDIResultado) {
    setSecoes(prev => {
      const next = prev.map((sec, si) => {
        if (si !== secaoIdx) return sec
        const itens = sec.itens.map((item, ii) => ii === itemIdx ? { ...item, resultado } : item)
        const conformes    = itens.filter(i => i.resultado === 'conforme').length
        const naoConformes = itens.filter(i => i.resultado === 'nao_conforme').length
        const aplicaveis   = conformes + naoConformes
        return { ...sec, itens, conformes, naoConformes, scoreSecao: aplicaveis > 0 ? Math.round((conformes / aplicaveis) * 100) : 0 }
      })
      return next
    })
  }

  function setItemObs(secaoIdx: number, itemIdx: number, observacao: string) {
    setSecoes(prev => prev.map((sec, si) => {
      if (si !== secaoIdx) return sec
      return { ...sec, itens: sec.itens.map((item, ii) => ii === itemIdx ? { ...item, observacao } : item) }
    }))
  }

  const scores = useMemo(() => computeDDIScore(secoes), [secoes])

  const sectionProgress = secoes.map(sec => {
    const total = sec.itens.length
    const answered = sec.itens.filter(i => i.resultado !== null).length
    return { total, answered, pct: total > 0 ? Math.round((answered / total) * 100) : 0 }
  })

  const overallProgress = (() => {
    const total = secoes.reduce((a, s) => a + s.itens.length, 0)
    const answered = secoes.reduce((a, s) => a + s.itens.filter(i => i.resultado !== null).length, 0)
    return total > 0 ? Math.round((answered / total) * 100) : 0
  })()

  async function handleSubmit(status: DDI['status']) {
    if (!form.setor)    { toast.error('Informe o setor.'); return }
    if (!form.inspetor) { toast.error('Informe o inspetor.'); return }

    setLoading(true)
    try {
      const payload = {
        data:      new Date(form.data + 'T12:00:00'),
        hora:      form.hora,
        setor:     form.setor as DDI['setor'],
        inspetor:  form.inspetor,
        inspetorId: user?.uid,
        secoes,
        acoesGeradas: 0,
        observacoesGerais: form.observacoesGerais || undefined,
        status,
        createdBy: user?.uid,
        ...scores,
      }

      if (isEdit) {
        await updateDDI(id!, payload)
        toast.success('Inspeção atualizada.')
      } else {
        await createDDI(payload)
        toast.success('Inspeção registrada.')
      }
      navigate('/seguranca/ddi')
    } catch { toast.error('Erro ao salvar inspeção.') }
    finally { setLoading(false) }
  }

  if (initLoading) return <div className={s.loadingWrap}><div className={s.spinner} /></div>

  const curSecao = secoes[activeSecao]
  const scoreColor = scores.scoreGeral >= 80 ? '#16a34a' : scores.scoreGeral >= 60 ? '#d97706' : '#dc2626'

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.pageHeader}>
        <button className={s.btnBack} onClick={() => navigate('/seguranca/ddi')}>← Voltar</button>
        <h1 className={s.pageTitle}>{isEdit ? 'Editar Inspeção DDI' : 'Nova Inspeção DDI'}</h1>
        <div className={s.scoreDisplay} style={{ color: scoreColor }}>
          Score: <strong>{scores.scoreGeral}%</strong>
        </div>
      </div>

      {/* ── Meta form ── */}
      <div className={s.metaCard}>
        <div className={s.metaRow}>
          <div className={s.field}>
            <label className={s.label}>Data *</label>
            <input type="date" className={s.input} value={form.data} onChange={e => set('data', e.target.value)} />
          </div>
          <div className={s.field}>
            <label className={s.label}>Hora</label>
            <input type="time" className={s.input} value={form.hora} onChange={e => set('hora', e.target.value)} />
          </div>
          <div className={s.field}>
            <label className={s.label}>Setor *</label>
            <select className={s.input} value={form.setor} onChange={e => set('setor', e.target.value)}>
              <option value="">Selecione…</option>
              {SETORES_FABRICA.map(sv => <option key={sv} value={sv}>{sv}</option>)}
            </select>
          </div>
          <div className={s.field}>
            <label className={s.label}>Inspetor *</label>
            <input className={s.input} value={form.inspetor} onChange={e => set('inspetor', e.target.value)} placeholder="Nome do inspetor" />
          </div>
        </div>

        {/* Progress bar */}
        <div className={s.progressWrap}>
          <div className={s.progressBar}>
            <div className={s.progressFill} style={{ width: `${overallProgress}%` }} />
          </div>
          <span className={s.progressLabel}>{overallProgress}% preenchido — {scores.scoreGeral}% conformidade</span>
        </div>
      </div>

      {/* ── Main body ── */}
      <div className={s.body}>

        {/* Section sidebar */}
        <div className={s.sidebar}>
          {secoes.map((sec, i) => {
            const prog = sectionProgress[i]
              return (
              <button
                key={sec.secaoId}
                className={`${s.secaoBtn} ${i === activeSecao ? s.secaoBtnActive : ''}`}
                onClick={() => setActiveSecao(i)}
              >
                <span className={s.secaoIcon}>{sec.icon}</span>
                <div className={s.secaoInfo}>
                  <span className={s.secaoLabel}>{sec.label}</span>
                  <span className={s.secaoProg} style={{ color: prog.answered === prog.total ? '#16a34a' : '#94a3b8' }}>
                    {prog.answered}/{prog.total}
                  </span>
                </div>
                {prog.answered === prog.total && <span className={s.secaoCheck}>✓</span>}
              </button>
            )
          })}
        </div>

        {/* Checklist panel */}
        <div className={s.panel}>
          <div className={s.panelHeader}>
            <span className={s.panelIcon}>{curSecao.icon}</span>
            <h2 className={s.panelTitle}>{curSecao.label}</h2>
            <span className={s.panelScore} style={{ color: curSecao.scoreSecao >= 80 ? '#16a34a' : curSecao.scoreSecao >= 60 ? '#d97706' : '#dc2626' }}>
              {curSecao.scoreSecao}%
            </span>
          </div>

          <div className={s.itemList}>
            {curSecao.itens.map((item: DDIItem, ii: number) => (
              <div key={item.itemId} className={`${s.itemCard} ${item.resultado === 'nao_conforme' ? s.itemNC : ''}`}>
                <div className={s.itemTop}>
                  <div className={s.itemLabelWrap}>
                    {item.critico && <span className={s.critTag}>CRÍTICO</span>}
                    <span className={s.itemLabel}>{item.label}</span>
                  </div>
                  <div className={s.resultBtns}>
                    {(['conforme', 'nao_conforme', 'nao_aplicavel'] as DDIResultado[]).map(r => (
                      <button
                        key={r!}
                        className={`${s.resultBtn} ${item.resultado === r ? s.resultBtnActive : ''}`}
                        data-result={r}
                        style={item.resultado === r ? {
                          background: r === 'conforme' ? '#16a34a' : r === 'nao_conforme' ? '#dc2626' : '#94a3b8',
                          color: '#fff',
                          borderColor: 'transparent',
                        } : {}}
                        onClick={() => setItemResult(activeSecao, ii, item.resultado === r ? null : r)}
                      >
                        {r === 'conforme' ? '✅ C' : r === 'nao_conforme' ? '❌ NC' : 'N/A'}
                      </button>
                    ))}
                  </div>
                </div>

                {item.resultado === 'nao_conforme' && (
                  <div className={s.itemObs}>
                    <input
                      className={s.obsInput}
                      placeholder="Descreva a não conformidade ou ação corretiva…"
                      value={item.observacao ?? ''}
                      onChange={e => setItemObs(activeSecao, ii, e.target.value)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Navigation */}
          <div className={s.navRow}>
            <button className={s.btnNav} disabled={activeSecao === 0} onClick={() => setActiveSecao(i => i - 1)}>
              ← Anterior
            </button>
            <span className={s.navCount}>{activeSecao + 1} / {secoes.length}</span>
            <button className={s.btnNav} disabled={activeSecao === secoes.length - 1} onClick={() => setActiveSecao(i => i + 1)}>
              Próxima →
            </button>
          </div>
        </div>

      </div>

      {/* ── Footer obs + submit ── */}
      <div className={s.footer}>
        <div className={s.footerObs}>
          <label className={s.label}>Observações gerais da inspeção</label>
          <textarea className={s.textarea} rows={2} value={form.observacoesGerais}
            onChange={e => set('observacoesGerais', e.target.value)}
            placeholder="Considerações finais, contexto da inspeção…" />
        </div>

        <div className={s.footerSummary}>
          <div className={s.summaryRow}><span>Conformes</span><strong style={{ color: '#16a34a' }}>{scores.totalConformes}</strong></div>
          <div className={s.summaryRow}><span>Não conformes</span><strong style={{ color: '#dc2626' }}>{scores.totalNaoConformes}</strong></div>
          <div className={s.summaryRow}><span>Críticos abertos</span><strong style={{ color: scores.totalCriticosAbertos > 0 ? '#dc2626' : '#16a34a' }}>{scores.totalCriticosAbertos}</strong></div>
        </div>

        <div className={s.submitRow}>
          <button className={s.btnDraft} disabled={loading} onClick={() => handleSubmit('rascunho')}>Salvar rascunho</button>
          <button className={s.btnSubmit} disabled={loading} onClick={() => handleSubmit('submetido')}>
            {loading ? <span className={s.spinnerSm} /> : null}
            ✅ Submeter inspeção
          </button>
        </div>
      </div>

    </div>
  )
}

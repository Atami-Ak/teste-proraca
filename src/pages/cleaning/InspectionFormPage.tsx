import { useState, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate }                 from 'react-router-dom'
import { CATALOGO_ZONAS, EQUIPE_LIMPEZA }         from '@/data/cleaning-catalog'
import { calcularPontuacao, effectiveStatus, scoreToColor, scoreToColorLight } from '@/lib/cleaning-scoring'
import { saveInspection }                         from '@/lib/db-cleaning'
import ScoreRing                                  from '@/components/cleaning/ScoreRing'
import { STATUS_META, SCORE_LABELS, ACTION_META } from '@/types/cleaning'
import type { FormScores, FormIssue, Zone, ChecklistItem, ScoreValue } from '@/types/cleaning'
import s from './InspectionFormPage.module.css'

// ── Score button group ────────────────────────────────

function ScoreButtons({ item, value, onChange }: {
  item: ChecklistItem
  value: ScoreValue
  onChange: (v: ScoreValue) => void
}) {
  const scores = [0, 1, 2, 3, 4, 5] as const
  const colors: Record<number, string> = {
    0: '#dc2626', 1: '#ea580c', 2: '#f59e0b', 3: '#eab308', 4: '#84cc16', 5: '#16a34a',
  }

  if (item.tipo === 'passfail') {
    return (
      <div className={s.passfailRow}>
        <button
          type="button"
          className={`${s.pfBtn} ${value === 5 ? s.pfConforme : ''}`}
          onClick={() => onChange(value === 5 ? null : 5)}
        >
          ✅ Conforme
        </button>
        <button
          type="button"
          className={`${s.pfBtn} ${value === 0 ? s.pfNaoConforme : ''}`}
          onClick={() => onChange(value === 0 ? null : 0)}
        >
          ❌ Não Conforme
        </button>
        <button
          type="button"
          className={`${s.naBtn} ${value === null ? s.naActive : ''}`}
          onClick={() => onChange(null)}
        >
          — N/A
        </button>
      </div>
    )
  }

  return (
    <div className={s.scoreRow}>
      {scores.map(n => (
        <button
          key={n}
          type="button"
          className={`${s.scoreBtn} ${value === n ? s.scoreBtnActive : ''}`}
          style={value === n ? { background: colors[n], borderColor: colors[n], color: '#fff' } : {}}
          onClick={() => onChange(value === n ? null : n as ScoreValue)}
          title={SCORE_LABELS[n]}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        className={`${s.naBtn} ${value === null ? s.naActive : ''}`}
        onClick={() => onChange(null)}
      >
        N/A
      </button>
      {value !== null && (
        <span className={s.scoreLabelTip} style={{ color: colors[value] }}>
          {SCORE_LABELS[value]}
        </span>
      )}
    </div>
  )
}

// ── Item row ─────────────────────────────────────────

function ItemRow({ item, value, issue, onScore, onIssueChange, onPhoto }: {
  item:          ChecklistItem
  value:         ScoreValue
  issue:         FormIssue | null
  onScore:       (v: ScoreValue) => void
  onIssueChange: (desc: string) => void
  onPhoto:       (file: File) => void
}) {
  const failed    = value === 0
  const photoRef  = useRef<HTMLInputElement>(null)
  const actionMeta = ACTION_META[item.actionType]

  return (
    <div className={`${s.itemRow} ${failed ? s.itemFailed : ''} ${value === 5 ? s.itemPassed : ''}`}>
      <div className={s.itemHeader}>
        <div className={s.itemBadges}>
          {item.critical && <span className={s.badgeCritical}>🔴 CRÍTICO</span>}
          {item.requiresPhotoOnFail && <span className={s.badgePhoto}>📷 Foto obrigatória</span>}
          <span className={s.badgeAction} style={{ color: actionMeta.color }}>
            {actionMeta.icon} {actionMeta.label}
          </span>
        </div>
        <p className={s.itemText}>{item.texto}</p>
      </div>

      <ScoreButtons item={item} value={value} onChange={onScore} />

      {failed && (
        <div className={s.issueBox}>
          <textarea
            className={s.issueTextarea}
            placeholder="Descreva o problema encontrado…"
            value={issue?.description ?? ''}
            onChange={e => onIssueChange(e.target.value)}
            rows={2}
          />
          <div className={s.photoRow}>
            <button
              type="button"
              className={s.photoBtn}
              onClick={() => photoRef.current?.click()}
            >
              📷 {issue?.photo ? 'Trocar foto' : 'Adicionar foto'}
              {item.requiresPhotoOnFail && !issue?.photo && <span className={s.required}> *</span>}
            </button>
            {issue?.photo && (
              <span className={s.photoName}>{issue.photo.name}</span>
            )}
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className={s.hidden}
              onChange={e => e.target.files?.[0] && onPhoto(e.target.files[0])}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Section tab ───────────────────────────────────────

type TabState = 'idle' | 'done' | 'has_issue'

function SectionTab({ label, state, active, onClick }: {
  label: string; state: TabState; active: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`${s.tab} ${active ? s.tabActive : ''} ${state === 'done' ? s.tabDone : ''} ${state === 'has_issue' ? s.tabIssue : ''}`}
      onClick={onClick}
    >
      <span className={s.tabLabel}>{label}</span>
      {state === 'done'      && <span className={s.tabBadge} style={{ background: '#16a34a' }}>✓</span>}
      {state === 'has_issue' && <span className={s.tabBadge} style={{ background: '#ea580c' }}>⚠</span>}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────

export default function InspectionFormPage() {
  const { zoneId } = useParams<{ zoneId: string }>()
  const nav = useNavigate()

  const zone: Zone | undefined = CATALOGO_ZONAS.find(z => z.id === zoneId)

  const [activeSection, setActiveSection] = useState(0)
  const [scores,  setScores]  = useState<FormScores>({})
  const [issues,  setIssues]  = useState<Record<string, FormIssue>>({})
  const [inspector, setInspector] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const scoring = useMemo(() => {
    if (!zone) return null
    return calcularPontuacao(zone, scores)
  }, [zone, scores])

  const finalStatus = useMemo(() => {
    if (!scoring) return null
    return effectiveStatus(scoring.finalScore, scoring.hasLowSection)
  }, [scoring])

  const tabStates = useMemo((): TabState[] => {
    if (!zone) return []
    return zone.sections.map(sec => {
      const allAnswered = sec.items.every(item => scores[item.id] !== undefined)
      if (!allAnswered) return 'idle'
      const hasFail = sec.items.some(item => scores[item.id] === 0)
      return hasFail ? 'has_issue' : 'done'
    })
  }, [zone, scores])

  const setScore = useCallback((itemId: string, val: ScoreValue) => {
    setScores(prev => ({ ...prev, [itemId]: val }))
    if (val !== 0) {
      setIssues(prev => {
        const next = { ...prev }
        delete next[itemId]
        return next
      })
    }
  }, [])

  const setIssueDesc = useCallback((itemId: string, desc: string, item: ChecklistItem) => {
    setIssues(prev => ({
      ...prev,
      [itemId]: {
        itemId,
        description: desc,
        category:    item.actionType,
        actionType:  item.actionType,
        severity:    item.critical ? 'critical' : 'low',
        linkedWOId:  null,
        photo:       prev[itemId]?.photo ?? null,
        photoUrl:    null,
      },
    }))
  }, [])

  const setIssuePhoto = useCallback((itemId: string, photo: File, item: ChecklistItem) => {
    setIssues(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? {
          itemId,
          description: '',
          category:    item.actionType,
          actionType:  item.actionType,
          severity:    item.critical ? 'critical' : 'low',
          linkedWOId:  null,
          photoUrl:    null,
        }),
        photo,
      },
    }))
  }, [])

  const validate = (): string[] => {
    if (!zone) return ['Zona não encontrada.']
    const errs: string[] = []
    if (!inspector.trim()) errs.push('Nome do inspetor é obrigatório.')
    if (!employeeId)        errs.push('Selecione o funcionário avaliado.')

    for (const sec of zone.sections) {
      for (const item of sec.items) {
        if (scores[item.id] === undefined) errs.push(`Seção "${sec.nome}": item "${item.texto.slice(0, 40)}…" não respondido.`)
        if (scores[item.id] === 0 && item.requiresPhotoOnFail && !issues[item.id]?.photo) {
          errs.push(`Item "${item.texto.slice(0, 40)}…" requer foto obrigatória.`)
        }
      }
    }
    return errs
  }

  const handleSubmit = async () => {
    const validationErrors = validate()
    if (validationErrors.length > 0) { setErrors(validationErrors); return }
    if (!zone || !scoring || !finalStatus) return

    setSubmitting(true)
    setErrors([])

    try {
      const employee = EQUIPE_LIMPEZA.find(e => e.id === employeeId)
      const issuesList = Object.values(issues)

      await saveInspection({
        zoneId:           zone.id,
        zoneName:         zone.nome,
        inspectorName:    inspector,
        employeeId,
        employeeName:     employee?.nome ?? employeeId,
        score:            scoring.finalScore,
        status:           finalStatus,
        sections:         scoring.sections,
        issues:           issuesList,
        notes,
        hasCriticalIssue: issuesList.some(i => i.severity === 'critical'),
      })

      nav('/limpeza')
    } catch (e) {
      console.error('[InspectionFormPage] submit', e)
      setErrors(['Erro ao salvar inspeção. Tente novamente.'])
    } finally {
      setSubmitting(false)
    }
  }

  if (!zone) {
    return (
      <div className={s.notFound}>
        <p>Zona não encontrada.</p>
        <button className={s.btnSecondary} onClick={() => nav('/limpeza')}>← Voltar</button>
      </div>
    )
  }

  const currentSection = zone.sections[activeSection]
  const meta = finalStatus ? STATUS_META[finalStatus] : null

  return (
    <div className={s.page}>

      {/* Header */}
      <div className={s.header}>
        <button className={s.backBtn} onClick={() => nav('/limpeza')}>← Voltar</button>
        <div>
          <h1 className={s.title}>{zone.icone} {zone.nome}</h1>
          <p className={s.subtitle}>Inspeção 5S · {zone.setor}</p>
        </div>

        {/* Live score */}
        {scoring && (
          <div className={s.liveScore}>
            <ScoreRing score={scoring.finalScore} size={72} stroke={7} />
            {meta && (
              <div>
                <span className={s.statusBadge} style={{ color: meta.color, background: meta.bg }}>
                  {meta.icon} {meta.label}
                </span>
                {scoring.hasLowSection && (
                  <p className={s.lowSectionWarn}>⚠ Seção abaixo de 60%</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inspector fields */}
      <div className={s.metaFields}>
        <div className={s.field}>
          <label className={s.fieldLabel}>Inspetor *</label>
          <input
            className={s.input}
            placeholder="Nome do inspetor"
            value={inspector}
            onChange={e => setInspector(e.target.value)}
          />
        </div>
        <div className={s.field}>
          <label className={s.fieldLabel}>Funcionário avaliado *</label>
          <select
            className={s.input}
            value={employeeId}
            onChange={e => setEmployeeId(e.target.value)}
          >
            <option value="">Selecione…</option>
            {EQUIPE_LIMPEZA
              .filter(emp => zone.responsaveis.includes(emp.id) || true)
              .map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.nome} — {emp.cargo}
                </option>
              ))
            }
          </select>
        </div>
      </div>

      {/* Section tabs */}
      <div className={s.tabs}>
        {zone.sections.map((sec, i) => (
          <SectionTab
            key={sec.id}
            label={sec.nome.split('·')[0].trim()}
            state={tabStates[i]}
            active={activeSection === i}
            onClick={() => setActiveSection(i)}
          />
        ))}
      </div>

      {/* Section score bar */}
      {scoring && (() => {
        const secScore = scoring.sections.find(ss => ss.id === currentSection.id)
        const sScore   = secScore?.score ?? null
        return sScore !== null ? (
          <div className={s.sectionScoreBar} style={{ background: scoreToColorLight(sScore) }}>
            <span style={{ color: scoreToColor(sScore), fontWeight: 600 }}>
              {currentSection.nome} — {sScore}%
            </span>
            {sScore < 60 && <span style={{ color: '#ea580c', fontSize: '0.8rem' }}>⚠ Abaixo do mínimo (60%)</span>}
          </div>
        ) : null
      })()}

      {/* Items */}
      <div className={s.itemList}>
        <h3 className={s.sectionTitle}>{currentSection.nome}</h3>
        {currentSection.items.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            value={scores[item.id] ?? null}
            issue={issues[item.id] ?? null}
            onScore={v => setScore(item.id, v)}
            onIssueChange={desc => setIssueDesc(item.id, desc, item)}
            onPhoto={file => setIssuePhoto(item.id, file, item)}
          />
        ))}
      </div>

      {/* Navigation between sections */}
      <div className={s.sectionNav}>
        {activeSection > 0 && (
          <button className={s.btnSecondary} onClick={() => setActiveSection(p => p - 1)}>
            ← Anterior
          </button>
        )}
        {activeSection < zone.sections.length - 1 ? (
          <button className={s.btnPrimary} onClick={() => setActiveSection(p => p + 1)}>
            Próxima seção →
          </button>
        ) : (
          <div className={s.finalSection}>
            <div className={s.field}>
              <label className={s.fieldLabel}>Observações gerais</label>
              <textarea
                className={s.input}
                rows={3}
                placeholder="Observações adicionais sobre a inspeção…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className={s.errorBox}>
          <strong>Corrija antes de enviar:</strong>
          <ul>
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Submit */}
      <div className={s.submitRow}>
        <button
          className={s.btnSubmit}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Salvando…' : '✓ Finalizar Inspeção'}
        </button>
        {scoring && (
          <span className={s.finalScoreLabel}>
            Pontuação atual: <strong style={{ color: scoreToColor(scoring.finalScore) }}>
              {scoring.finalScore}%
            </strong>
          </span>
        )}
      </div>

    </div>
  )
}

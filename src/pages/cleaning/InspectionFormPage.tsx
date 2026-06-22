import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate }                 from 'react-router-dom'
import { CATALOGO_ZONAS, EQUIPE_LIMPEZA }         from '@/data/cleaning-catalog'
import { calcularPontuacao, effectiveStatus, scoreToColor, scoreToColorLight } from '@/lib/cleaning-scoring'
import { saveInspection }                         from '@/lib/db-cleaning'
import ScoreRing                                  from '@/components/cleaning/ScoreRing'
import { STATUS_META, SCORE_LABELS, ACTION_META } from '@/types/cleaning'
import type { FormScores, FormIssue, Zone, ChecklistItem, ScoreValue } from '@/types/cleaning'
import { useStore }                               from '@/store/useStore'
import s from './InspectionFormPage.module.css'

// ── Score button group ────────────────────────────────

function ScoreButtons({ item, value, onChange }: {
  item:     ChecklistItem
  value:    ScoreValue
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

function ItemRow({ item, value, issue, photos, previews, onScore, onIssueChange, onAddPhoto, onRemovePhoto }: {
  item:          ChecklistItem
  value:         ScoreValue
  issue:         FormIssue | null
  photos:        File[]
  previews:      string[]
  onScore:       (v: ScoreValue) => void
  onIssueChange: (desc: string) => void
  onAddPhoto:    (file: File) => void
  onRemovePhoto: (idx: number) => void
}) {
  const failed     = value === 0
  const answered   = value !== null
  const actionMeta = ACTION_META[item.actionType]
  const needsPhoto = failed && item.requiresPhotoOnFail && photos.length === 0

  const photoLabel = previews.length > 0
    ? '+ Outra foto'
    : failed
      ? 'Adicionar foto'
      : 'Documentar estado'

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

      {/* Descrição do problema — somente quando não conforme */}
      {failed && (
        <div className={s.issueBox}>
          <textarea
            className={s.issueTextarea}
            placeholder="Descreva o problema encontrado…"
            value={issue?.description ?? ''}
            onChange={e => onIssueChange(e.target.value)}
            rows={2}
          />
        </div>
      )}

      {/* Seção de fotos — visível para QUALQUER item respondido */}
      {answered && (
        <div className={s.photoSection}>
          {previews.length > 0 && (
            <div className={s.photoGrid}>
              {previews.map((url, idx) => (
                <div key={idx} className={s.photoThumbWrap}>
                  <img src={url} alt={`Foto ${idx + 1}`} className={s.photoThumb} />
                  <button
                    type="button"
                    className={s.photoRemoveBtn}
                    onClick={() => onRemovePhoto(idx)}
                    aria-label="Remover foto"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {previews.length < 5 && (
            <label className={`${s.photoAddBtn} ${needsPhoto ? s.photoAddBtnRequired : ''}`}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) { onAddPhoto(file); e.target.value = '' }
                }}
              />
              📷 {photoLabel}{needsPhoto ? <span className={s.required}> *</span> : null}
            </label>
          )}
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
  const currentUser = useStore(st => st.user)

  const zone: Zone | undefined = CATALOGO_ZONAS.find(z => z.id === zoneId)

  // Funcionários disponíveis para esta zona (filtrado por responsaveis)
  const zoneEmployees = useMemo(() => {
    if (!zone?.responsaveis.length) return EQUIPE_LIMPEZA
    const filtered = EQUIPE_LIMPEZA.filter(e => zone.responsaveis.includes(e.id))
    return filtered.length > 0 ? filtered : EQUIPE_LIMPEZA
  }, [zone])

  const [activeSection, setActiveSection] = useState(0)
  const [scores,        setScores]        = useState<FormScores>({})
  const [issues,        setIssues]        = useState<Record<string, FormIssue>>({})
  const [itemPhotos,    setItemPhotos]    = useState<Record<string, File[]>>({})
  const [itemPreviews,  setItemPreviews]  = useState<Record<string, string[]>>({})
  const [inspector,     setInspector]     = useState(currentUser?.nome ?? '')
  const [employeeId,    setEmployeeId]    = useState('')
  const [notes,         setNotes]         = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [errors,        setErrors]        = useState<string[]>([])

  // Ref para cleanup de URLs de preview no desmonte
  const itemPreviewsRef = useRef(itemPreviews)
  useEffect(() => { itemPreviewsRef.current = itemPreviews })
  useEffect(() => {
    return () => {
      for (const urls of Object.values(itemPreviewsRef.current)) {
        urls.forEach(u => URL.revokeObjectURL(u))
      }
    }
  }, [])

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
    // Remove a issue quando o item deixa de ser não-conforme
    if (val !== 0) {
      setIssues(prev => {
        const next = { ...prev }
        delete next[itemId]
        return next
      })
    }
    // Fotos (itemPhotos) são preservadas independentemente do score
  }, [])

  const setIssueDesc = useCallback((itemId: string, desc: string, item: ChecklistItem) => {
    setIssues(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? {
          itemId,
          category:   item.actionType,
          actionType: item.actionType,
          severity:   item.critical ? 'critical' : 'low',
          linkedWOId: null,
          photoUrl:   null,
        }),
        description: desc,
      },
    }))
  }, [])

  const addItemPhoto = useCallback((itemId: string, file: File) => {
    setItemPhotos(prev => ({
      ...prev,
      [itemId]: [...(prev[itemId] ?? []), file].slice(0, 5),
    }))
    const preview = URL.createObjectURL(file)
    setItemPreviews(prev => ({
      ...prev,
      [itemId]: [...(prev[itemId] ?? []), preview].slice(0, 5),
    }))
  }, [])

  const removeItemPhoto = useCallback((itemId: string, idx: number) => {
    setItemPreviews(prev => {
      const urls = prev[itemId] ?? []
      URL.revokeObjectURL(urls[idx])
      return { ...prev, [itemId]: urls.filter((_, i) => i !== idx) }
    })
    setItemPhotos(prev => ({
      ...prev,
      [itemId]: (prev[itemId] ?? []).filter((_, i) => i !== idx),
    }))
  }, [])

  const validate = (): string[] => {
    if (!zone) return ['Zona não encontrada.']
    const errs: string[] = []
    if (!inspector.trim()) errs.push('Nome do inspetor é obrigatório.')
    if (!employeeId)        errs.push('Selecione o funcionário avaliado.')

    for (const sec of zone.sections) {
      for (const item of sec.items) {
        if (scores[item.id] === undefined) {
          errs.push(`Seção "${sec.nome}": item "${item.texto.slice(0, 40)}…" não respondido.`)
        }
        if (scores[item.id] === 0 && item.requiresPhotoOnFail && !(itemPhotos[item.id]?.length > 0)) {
          errs.push(`Item "${item.texto.slice(0, 40)}…" requer pelo menos uma foto.`)
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
      const employee   = EQUIPE_LIMPEZA.find(e => e.id === employeeId)
      const issuesList = Object.values(issues)

      await saveInspection({
        zoneId:           zone.id,
        zoneName:         zone.nome,
        inspectorName:    inspector.trim(),
        employeeId,
        employeeName:     employee?.nome ?? employeeId,
        score:            scoring.finalScore,
        status:           finalStatus,
        sections:         scoring.sections,
        issues:           issuesList,
        notes:            notes.trim(),
        hasCriticalIssue: issuesList.some(i => i.severity === 'critical'),
        itemPhotos,
      })

      nav('/limpeza')
    } catch (e) {
      console.error('[InspectionFormPage] submit', e)
      setErrors(['Erro ao salvar inspeção. Tente novamente.'])
    } finally {
      setSubmitting(false)
    }
  }

  const totalItems    = zone?.sections.reduce((acc, sec) => acc + sec.items.length, 0) ?? 0
  const answeredItems = Object.values(scores).filter(v => v !== undefined).length
  const progressPct   = totalItems > 0 ? Math.round((answeredItems / totalItems) * 100) : 0

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
        <div className={s.headerDivider} />
        <span className={s.headerZoneBox}>{zone.icone}</span>
        <div className={s.headerTitleGroup}>
          <h1 className={s.title}>{zone.nome}</h1>
          <p className={s.subtitle}>Inspeção 5S · {zone.setor}</p>
        </div>

        {scoring && (
          <div className={s.liveScore}>
            <ScoreRing score={scoring.finalScore} size={64} stroke={6} />
            {meta && (
              <div>
                <span className={s.statusBadge} style={{ color: meta.color, background: meta.bg }}>
                  {meta.label}
                </span>
                {scoring.hasLowSection && (
                  <p className={s.lowSectionWarn}>Seção abaixo de 60%</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className={s.progressWrap}>
        <span className={s.progressLabel}>Progresso</span>
        <div className={s.progressBar}>
          <div className={s.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
        <span className={s.progressPct}>{answeredItems}/{totalItems}</span>
      </div>

      {/* Inspector + employee fields */}
      <div className={s.metaFields}>
        <div className={s.field}>
          <label className={s.fieldLabel}>
            Inspetor *
            {currentUser?.nome && (
              <span className={s.fieldHint}>preenchido do seu perfil</span>
            )}
          </label>
          <input
            className={s.input}
            placeholder="Nome do inspetor"
            value={inspector}
            onChange={e => setInspector(e.target.value)}
          />
        </div>
        <div className={s.field}>
          <label className={s.fieldLabel}>
            Funcionário avaliado *
            {zone?.responsaveis.length ? (
              <span className={s.fieldHint}>{zoneEmployees.length} responsável{zoneEmployees.length !== 1 ? 'is' : ''} pela área</span>
            ) : null}
          </label>
          <select
            className={s.input}
            value={employeeId}
            onChange={e => setEmployeeId(e.target.value)}
          >
            <option value="">Selecione…</option>
            {zoneEmployees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.nome} — {emp.cargo}
              </option>
            ))}
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
            {sScore < 60 && (
              <span style={{ color: '#ea580c', fontSize: '0.8rem' }}>⚠ Abaixo do mínimo (60%)</span>
            )}
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
            photos={itemPhotos[item.id] ?? []}
            previews={itemPreviews[item.id] ?? []}
            onScore={v => setScore(item.id, v)}
            onIssueChange={desc => setIssueDesc(item.id, desc, item)}
            onAddPhoto={file => addItemPhoto(item.id, file)}
            onRemovePhoto={idx => removeItemPhoto(item.id, idx)}
          />
        ))}
      </div>

      {/* Section navigation */}
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

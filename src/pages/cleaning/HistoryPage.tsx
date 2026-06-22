import { useState, useMemo, type CSSProperties } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useCleaningHistory }           from '@/hooks/useCleaningData'
import { CATALOGO_ZONAS, EQUIPE_LIMPEZA } from '@/data/cleaning-catalog'
import ScoreRing                        from '@/components/cleaning/ScoreRing'
import { STATUS_META, ACTION_META, SCORE_LABELS } from '@/types/cleaning'
import { formatDateTime, scoreToColor }           from '@/lib/cleaning-scoring'
import type { CleaningInspection }                from '@/types/cleaning'
import s from './HistoryPage.module.css'

// ── SVG icons ──────────────────────────────────────────
const Ic = {
  Back:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6"/></svg>,
  Search:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Filter:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"/></svg>,
  X:         () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Close:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  User:      () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  MapPin:    () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Calendar:  () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Warning:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Inspector: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  ChevRight: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>,
  Clipboard: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
  AlertTri:  () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  CheckOk:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>,
  Expand:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>,
}

// ── Item status helper ─────────────────────────────────
const SCORE_COLORS: Record<number, string> = {
  0: '#dc2626', 1: '#ea580c', 2: '#f59e0b', 3: '#eab308', 4: '#84cc16', 5: '#16a34a',
}

function itemChipStyle(score: number, tipo: string): { label: string; color: string; bg: string } {
  if (score === 0)                           return { label: '❌ Não Conforme', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' }
  if (tipo === 'passfail' && score === 5)    return { label: '✅ Conforme',     color: '#16a34a', bg: 'rgba(22,163,74,0.1)'  }
  const c = SCORE_COLORS[score] ?? '#64748b'
  return { label: `${score}/5 · ${SCORE_LABELS[score] ?? ''}`, color: c, bg: c + '18' }
}

// ── Detail Modal ───────────────────────────────────────
function DetailModal({ insp, onClose }: { insp: CleaningInspection; onClose: () => void }) {
  const meta    = STATUS_META[insp.status]
  const [photo, setPhoto] = useState<string | null>(null)
  const initial = insp.employeeName?.[0]?.toUpperCase() ?? '?'
  const color   = scoreToColor(insp.score)

  // Total de itens com fotos (conformes e não conformes)
  const totalItemPhotos = Object.values(insp.itemPhotos ?? {}).reduce((s, a) => s + a.length, 0)

  return (
    <div className={s.modalBackdrop} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>

        {/* Modal Header */}
        <div className={s.modalHeader}>
          <div className={s.modalHeaderLeft}>
            <div className={s.modalScoreWrap}>
              <ScoreRing score={insp.score} size={56} stroke={6} />
            </div>
            <div>
              <h2 className={s.modalTitle}>{insp.zoneName}</h2>
              <p className={s.modalSub}>{formatDateTime(insp.timestampEnvio)}</p>
              <span className={s.modalBadge} style={{ color: meta.color, background: meta.bg }}>
                {meta.label}
              </span>
            </div>
          </div>
          <button className={s.closeBtn} onClick={onClose}><Ic.Close /></button>
        </div>

        {/* People info */}
        <div className={s.modalPeople}>
          <div className={s.modalPersonCard}>
            <div className={s.modalAvatar} style={{ background: '#e0f2fe', color: '#0284c7' }}>
              {insp.inspectorName?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <div className={s.modalPersonRole}>Inspetor</div>
              <div className={s.modalPersonName}>{insp.inspectorName}</div>
            </div>
          </div>
          <div className={s.modalPersonCard}>
            <div className={s.modalAvatar} style={{ background: color + '20', color }}>
              {initial}
            </div>
            <div>
              <div className={s.modalPersonRole}>Funcionário Avaliado</div>
              <div className={s.modalPersonName}>{insp.employeeName}</div>
            </div>
          </div>
          {insp.hasCriticalIssue && (
            <div className={s.modalCriticalBadge}>
              <Ic.AlertTri /> Item crítico detectado
            </div>
          )}
        </div>

        <div className={s.modalBody}>

          {/* 5S breakdown */}
          {insp.sections.length > 0 && (
            <div className={s.modalSection}>
              <div className={s.modalSectionTitle}>Pontuação por Senso (5S)</div>
              <div className={s.sensoGrid}>
                {insp.sections.map(sec => {
                  const sc       = sec.score
                  const sc_color = scoreToColor(sc)
                  return (
                    <div key={sec.id} className={s.sensoCard}>
                      <div className={s.sensoCardTop}>
                        <span className={s.sensoName}>{sec.nome.split('·')[1]?.trim() ?? sec.nome}</span>
                        <span className={s.sensoScore} style={{ color: sc_color }}>{sc}%</span>
                      </div>
                      <div className={s.sensoBar}>
                        <div className={s.sensoBarFill} style={{ width: `${sc}%`, background: sc_color }} />
                      </div>
                      {sc < 60 && <span className={s.sensoWarn}>Abaixo do mínimo (60%)</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Itens por seção — conformes e não conformes com fotos */}
          {insp.sections.length > 0 && (
            <div className={s.modalSection}>
              <div className={s.modalSectionTitle}>
                Itens Avaliados
                {totalItemPhotos > 0 && (
                  <span className={s.modalSectionCount}>
                    📷 {totalItemPhotos} foto{totalItemPhotos !== 1 ? 's' : ''}
                  </span>
                )}
                {insp.issues.length > 0 && (
                  <span className={s.modalSectionCount} style={{ color: '#dc2626', borderColor: 'rgba(220,38,38,0.2)' }}>
                    {insp.issues.length} ocorrência{insp.issues.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {insp.sections.map(sec => {
                if (!sec.items.length) return null
                return (
                  <div key={sec.id} className={s.sectionBlock}>
                    <div className={s.sectionBlockTitle}>
                      {sec.nome.split('·')[0].trim()}
                      <span style={{ color: scoreToColor(sec.score), fontWeight: 700 }}> {sec.score}%</span>
                    </div>

                    <div className={s.itemLines}>
                      {sec.items.map(item => {
                        const score   = item.scoreGiven ?? 0
                        const chip    = itemChipStyle(score, item.tipo)
                        const photos  = insp.itemPhotos?.[item.id] ?? []
                        const issue   = insp.issues.find(i => i.itemId === item.id)
                        const isFail  = score === 0

                        return (
                          <div
                            key={item.id}
                            className={`${s.itemLine} ${isFail ? s.itemLineFail : score >= 4 ? s.itemLinePass : ''}`}
                          >
                            <div className={s.itemLineHead}>
                              <span
                                className={s.itemChip}
                                style={{ color: chip.color, background: chip.bg }}
                              >
                                {chip.label}
                              </span>
                              <span className={s.itemLineText}>{item.texto}</span>
                            </div>

                            {/* Tags de ação e criticidade */}
                            {isFail && (
                              <div className={s.itemLineTags}>
                                {item.critical && <span className={s.criticalTag}>CRÍTICO</span>}
                                {issue?.linkedWOId && <span className={s.linkedTag}>O.S. vinculada</span>}
                                {ACTION_META[item.actionType] && (
                                  <span
                                    className={s.issueBadge}
                                    style={{
                                      color:       ACTION_META[item.actionType].color,
                                      background:  ACTION_META[item.actionType].color + '14',
                                      borderColor: ACTION_META[item.actionType].color + '33',
                                    }}
                                  >
                                    {ACTION_META[item.actionType].label}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Descrição do problema (não conformes) */}
                            {issue?.description && (
                              <p className={s.itemLineIssue}>{issue.description}</p>
                            )}

                            {/* Fotos — conformes e não conformes */}
                            {photos.length > 0 && (
                              <div className={s.itemLinePhotos}>
                                {photos.map((url, pi) => (
                                  <img
                                    key={pi}
                                    src={url}
                                    alt={`Foto ${pi + 1}`}
                                    className={s.itemLinePhoto}
                                    onClick={() => setPhoto(url)}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Notes */}
          {insp.notes && (
            <div className={s.modalSection}>
              <div className={s.modalSectionTitle}>Observações</div>
              <p className={s.notesText}>{insp.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {photo && (
        <div className={s.lightbox} onClick={() => setPhoto(null)}>
          <img src={photo} alt="Foto ampliada" className={s.lightboxImg} />
          <button className={s.lightboxClose} onClick={() => setPhoto(null)}>
            <Ic.Close />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Inspection Card ────────────────────────────────────
function InspCard({ insp, onClick }: { insp: CleaningInspection; onClick: () => void }) {
  const meta    = STATUS_META[insp.status]
  const color   = scoreToColor(insp.score)
  const initial = insp.employeeName?.[0]?.toUpperCase() ?? '?'

  return (
    <div className={s.card} onClick={onClick} style={{ '--card-color': color } as CSSProperties}>
      <div className={s.cardAccent} />

      <div className={s.cardHead}>
        <div className={s.cardAvatar} style={{ background: color + '20', color }}>
          {initial}
        </div>
        <div className={s.cardHeadMeta}>
          <span className={s.cardEmployee}>{insp.employeeName}</span>
          <span className={s.cardBadge} style={{ color: meta.color, background: meta.bg }}>
            {meta.label}
          </span>
        </div>
        <ScoreRing score={insp.score} size={48} stroke={5} />
      </div>

      <div className={s.cardBody}>
        <div className={s.cardMetaRow}>
          <span className={s.cardMetaIcon}><Ic.MapPin /></span>
          <span className={s.cardMetaText}>{insp.zoneName}</span>
        </div>
        <div className={s.cardMetaRow}>
          <span className={s.cardMetaIcon}><Ic.Inspector /></span>
          <span className={s.cardMetaText}>{insp.inspectorName}</span>
        </div>
        <div className={s.cardMetaRow}>
          <span className={s.cardMetaIcon}><Ic.Calendar /></span>
          <span className={s.cardMetaText}>{formatDateTime(insp.timestampEnvio)}</span>
        </div>
        {insp.issues.length > 0 && (
          <div className={s.cardMetaRow}>
            <span className={s.cardMetaIcon} style={{ color: '#ea580c' }}><Ic.Warning /></span>
            <span className={s.cardMetaText} style={{ color: '#ea580c', fontWeight: 600 }}>
              {insp.issues.length} ocorrência{insp.issues.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        {insp.hasCriticalIssue && (
          <div className={s.cardCritical}>Item crítico detectado</div>
        )}
      </div>

      <div className={s.cardFooter}>
        <span className={s.cardViewBtn}>
          Ver detalhes <Ic.ChevRight />
        </span>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// HistoryPage
// ══════════════════════════════════════════════════════
export default function HistoryPage() {
  const [params]    = useSearchParams()
  const initialZone = params.get('zona') ?? ''

  const { inspections, loading, error } = useCleaningHistory()
  const [search,         setSearch]         = useState('')
  const [filterZone,     setFilterZone]     = useState(initialZone)
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterEmployee, setFilterEmployee] = useState('')
  const [selected,       setSelected]       = useState<CleaningInspection | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return inspections.filter(insp => {
      if (filterZone     && insp.zoneId     !== filterZone)     return false
      if (filterStatus   && insp.status     !== filterStatus)   return false
      if (filterEmployee && insp.employeeId !== filterEmployee) return false
      if (q && !insp.zoneName.toLowerCase().includes(q)
            && !insp.employeeName.toLowerCase().includes(q)
            && !insp.inspectorName.toLowerCase().includes(q)) return false
      return true
    })
  }, [inspections, search, filterZone, filterStatus, filterEmployee])

  // Stats
  const stats = useMemo(() => ({
    total:     inspections.length,
    excellent: inspections.filter(i => i.status === 'excellent').length,
    critical:  inspections.filter(i => i.status === 'critical').length,
    withIssues:inspections.filter(i => i.issues.length > 0).length,
    avgScore:  inspections.length > 0
      ? Math.round(inspections.reduce((s, i) => s + i.score, 0) / inspections.length)
      : 0,
  }), [inspections])

  const hasFilters = !!(search || filterZone || filterStatus || filterEmployee)

  // Funcionários filtrados pela zona selecionada
  const filteredEmployees = useMemo(() => {
    if (!filterZone) return EQUIPE_LIMPEZA
    const zone = CATALOGO_ZONAS.find(z => z.id === filterZone)
    if (!zone?.responsaveis.length) return EQUIPE_LIMPEZA
    const zonal = EQUIPE_LIMPEZA.filter(e => zone.responsaveis.includes(e.id))
    return zonal.length > 0 ? zonal : EQUIPE_LIMPEZA
  }, [filterZone])

  const STATS = [
    { label: 'Total',       value: stats.total,      color: '#166534', icon: <Ic.Clipboard /> },
    { label: 'Média Geral', value: `${stats.avgScore}%`, color: '#6366f1', icon: <Ic.CheckOk /> },
    { label: 'Excelentes',  value: stats.excellent,  color: '#16a34a', icon: <Ic.CheckOk /> },
    { label: 'Críticas',    value: stats.critical,   color: '#dc2626', icon: <Ic.AlertTri /> },
    { label: 'Com Ocorr.',  value: stats.withIssues, color: '#ea580c', icon: <Ic.Warning /> },
  ]

  return (
    <div className={s.page}>

      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <Link to="/limpeza" className={s.backBtn}><Ic.Back /> Limpeza</Link>
          <div className={s.divider} />
          <div>
            <h1 className={s.title}>Histórico de Inspeções</h1>
            <p className={s.subtitle}>{inspections.length} inspeção{inspections.length !== 1 ? 'ões' : ''} registrada{inspections.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {error && <div className={s.errorBanner}>{error}</div>}

      {/* Stats */}
      <div className={s.statsRow}>
        {STATS.map(st => (
          <div key={st.label} className={s.statCard} style={{ '--stat-color': st.color } as CSSProperties}>
            <div className={s.statBar} />
            <div className={s.statIconWrap} style={{ background: st.color + '18', color: st.color }}>
              {st.icon}
            </div>
            <div>
              <div className={s.statValue} style={{ color: st.color }}>{st.value}</div>
              <div className={s.statLabel}>{st.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={s.filtersBar}>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}><Ic.Search /></span>
          <input
            className={s.searchInput}
            placeholder="Buscar por zona, funcionário, inspetor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select className={s.filterSelect} value={filterZone}
          onChange={e => { setFilterZone(e.target.value); setFilterEmployee('') }}>
          <option value="">Todas as zonas</option>
          {CATALOGO_ZONAS.map(z => <option key={z.id} value={z.id}>{z.nome}</option>)}
        </select>

        <select className={s.filterSelect} value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="excellent">Excelente</option>
          <option value="acceptable">Aceitável</option>
          <option value="attention">Atenção</option>
          <option value="critical">Crítico</option>
        </select>

        <select className={s.filterSelect} value={filterEmployee}
          onChange={e => setFilterEmployee(e.target.value)}>
          <option value="">
            {filterZone ? 'Responsáveis da área' : 'Todos os funcionários'}
          </option>
          {filteredEmployees.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>

        <div className={s.filterDivider} />
        <span className={s.filterCount}>{filtered.length} de {inspections.length}</span>

        {hasFilters && (
          <button className={s.clearBtn}
            onClick={() => { setSearch(''); setFilterZone(''); setFilterStatus(''); setFilterEmployee('') }}>
            <Ic.X /> Limpar
          </button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className={s.loading}>Carregando inspeções…</div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}><Ic.Clipboard /></div>
          <h3 className={s.emptyTitle}>Nenhuma inspeção encontrada</h3>
          <p className={s.emptyDesc}>
            {hasFilters ? 'Ajuste os filtros para ver mais resultados.' : 'Nenhuma inspeção registrada ainda.'}
          </p>
        </div>
      ) : (
        <div className={s.cardGrid}>
          {filtered.map(insp => (
            <InspCard key={insp.id} insp={insp} onClick={() => setSelected(insp)} />
          ))}
        </div>
      )}

      {selected && <DetailModal insp={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

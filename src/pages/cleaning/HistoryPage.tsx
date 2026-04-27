import { useState, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useCleaningHistory }           from '@/hooks/useCleaningData'
import { CATALOGO_ZONAS, EQUIPE_LIMPEZA } from '@/data/cleaning-catalog'
import ScoreRing                        from '@/components/cleaning/ScoreRing'
import { STATUS_META, ACTION_META }     from '@/types/cleaning'
import { formatDateTime, scoreToColor } from '@/lib/cleaning-scoring'
import type { CleaningInspection }      from '@/types/cleaning'
import s from './HistoryPage.module.css'

// ── Detail modal ──────────────────────────────────────

function DetailModal({ insp, onClose }: { insp: CleaningInspection; onClose: () => void }) {
  const meta    = STATUS_META[insp.status]
  const [photo, setPhoto] = useState<string | null>(null)

  return (
    <div className={s.modalBackdrop} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <div>
            <h2 className={s.modalTitle}>{insp.zoneName}</h2>
            <p className={s.modalSub}>{formatDateTime(insp.timestampEnvio)}</p>
          </div>
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Score + meta */}
        <div className={s.modalScoreRow}>
          <ScoreRing score={insp.score} size={80} stroke={7} />
          <div>
            <span className={s.modalBadge} style={{ color: meta.color, background: meta.bg }}>
              {meta.icon} {meta.label}
            </span>
            <div className={s.modalMeta}>
              <span>👤 Inspetor: {insp.inspectorName}</span>
              <span>🧹 Funcionário: {insp.employeeName}</span>
              {insp.hasCriticalIssue && (
                <span style={{ color: '#dc2626' }}>🔴 Contém item crítico</span>
              )}
            </div>
          </div>
        </div>

        {/* Section breakdown */}
        {insp.sections.length > 0 && (
          <div className={s.modalSection}>
            <h3 className={s.modalSectionTitle}>Pontuação por Senso</h3>
            <div className={s.sensoGrid}>
              {insp.sections.map(sec => (
                <div
                  key={sec.id}
                  className={s.sensoCard}
                  style={{ borderTopColor: scoreToColor(sec.score) }}
                >
                  <span className={s.sensoName}>{sec.nome.split('·')[1]?.trim() ?? sec.nome}</span>
                  <span className={s.sensoScore} style={{ color: scoreToColor(sec.score) }}>
                    {sec.score}%
                  </span>
                  <div className={s.sensoBar}>
                    <div
                      className={s.sensoBarFill}
                      style={{ width: `${sec.score}%`, background: scoreToColor(sec.score) }}
                    />
                  </div>
                  {sec.score < 60 && (
                    <span className={s.sensoWarn}>⚠ Abaixo do mínimo</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Issues */}
        {insp.issues.length > 0 && (
          <div className={s.modalSection}>
            <h3 className={s.modalSectionTitle}>Ocorrências ({insp.issues.length})</h3>
            <div className={s.issueList}>
              {insp.issues.map((issue, i) => {
                const actionMeta = ACTION_META[issue.actionType]
                return (
                  <div key={i} className={s.issueCard}>
                    <div className={s.issueHeader}>
                      <span className={s.issueBadge} style={{ color: actionMeta.color }}>
                        {actionMeta.icon} {actionMeta.label}
                      </span>
                      {issue.severity === 'critical' && (
                        <span className={s.criticalBadge}>🔴 CRÍTICO</span>
                      )}
                      {issue.linkedWOId && (
                        <span className={s.linkedWO}>🔗 O.S. vinculada</span>
                      )}
                    </div>
                    <p className={s.issueDesc}>{issue.description || '(sem descrição)'}</p>
                    {issue.photoUrl && (
                      <img
                        src={issue.photoUrl}
                        alt="Foto da ocorrência"
                        className={s.issuePhoto}
                        onClick={() => setPhoto(issue.photoUrl)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Notes */}
        {insp.notes && (
          <div className={s.modalSection}>
            <h3 className={s.modalSectionTitle}>Observações</h3>
            <p className={s.notesText}>{insp.notes}</p>
          </div>
        )}
      </div>

      {/* Photo lightbox */}
      {photo && (
        <div className={s.lightbox} onClick={() => setPhoto(null)}>
          <img src={photo} alt="Foto ampliada" className={s.lightboxImg} />
        </div>
      )}
    </div>
  )
}

// ── Inspection card ───────────────────────────────────

function InspCard({ insp, onClick }: { insp: CleaningInspection; onClick: () => void }) {
  const meta = STATUS_META[insp.status]
  return (
    <div className={s.card} onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}>
      <div className={s.cardLeft}>
        <ScoreRing score={insp.score} size={52} stroke={5} />
      </div>
      <div className={s.cardBody}>
        <div className={s.cardTop}>
          <span className={s.cardEmployee}>{insp.employeeName}</span>
          <span className={s.cardBadge} style={{ color: meta.color, background: meta.bg }}>
            {meta.icon} {meta.label}
          </span>
        </div>
        <div className={s.cardMeta}>
          <span>📍 {insp.zoneName}</span>
          <span>👤 {insp.inspectorName}</span>
          <span>📅 {formatDateTime(insp.timestampEnvio)}</span>
          {insp.issues.length > 0 && (
            <span style={{ color: '#ea580c' }}>⚠️ {insp.issues.length} ocorrência{insp.issues.length > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
      <div className={s.cardArrow}>›</div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────

export default function HistoryPage() {
  const nav             = useNavigate()
  const [params]        = useSearchParams()
  const initialZone     = params.get('zona') ?? ''

  const { inspections, loading, error } = useCleaningHistory()
  const [filterZone,     setFilterZone]     = useState(initialZone)
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterEmployee, setFilterEmployee] = useState('')
  const [selected,       setSelected]       = useState<CleaningInspection | null>(null)

  const filtered = useMemo(() => {
    return inspections.filter(insp => {
      if (filterZone     && insp.zoneId     !== filterZone)     return false
      if (filterStatus   && insp.status     !== filterStatus)   return false
      if (filterEmployee && insp.employeeId !== filterEmployee) return false
      return true
    })
  }, [inspections, filterZone, filterStatus, filterEmployee])

  const clearFilters = () => {
    setFilterZone(''); setFilterStatus(''); setFilterEmployee('')
  }

  return (
    <div className={s.page}>

      <div className={s.header}>
        <div>
          <button className={s.backBtn} onClick={() => nav('/limpeza')}>← Voltar</button>
          <h1 className={s.title}>Histórico de Inspeções</h1>
          <p className={s.subtitle}>{inspections.length} inspeção{inspections.length !== 1 ? 'ões' : ''} registrada{inspections.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Filters */}
      <div className={s.filters}>
        <select className={s.filterSelect} value={filterZone} onChange={e => setFilterZone(e.target.value)}>
          <option value="">Todas as zonas</option>
          {CATALOGO_ZONAS.map(z => <option key={z.id} value={z.id}>{z.nome}</option>)}
        </select>

        <select className={s.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="excellent">🟢 Excelente</option>
          <option value="acceptable">🟡 Aceitável</option>
          <option value="attention">🟠 Atenção</option>
          <option value="critical">🔴 Crítico</option>
        </select>

        <select className={s.filterSelect} value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
          <option value="">Todos os funcionários</option>
          {EQUIPE_LIMPEZA.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>

        {(filterZone || filterStatus || filterEmployee) && (
          <button className={s.clearBtn} onClick={clearFilters}>✕ Limpar filtros</button>
        )}

        <span className={s.filterCount}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Error */}
      {error && <div className={s.errorBanner}>{error}</div>}

      {/* List */}
      {loading ? (
        <div className={s.loading}>Carregando inspeções…</div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>📋</div>
          <p>Nenhuma inspeção encontrada.</p>
        </div>
      ) : (
        <div className={s.list}>
          {filtered.map(insp => (
            <InspCard key={insp.id} insp={insp} onClick={() => setSelected(insp)} />
          ))}
        </div>
      )}

      {/* Modal */}
      {selected && <DetailModal insp={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

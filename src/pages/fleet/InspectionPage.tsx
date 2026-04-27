/**
 * InspectionPage.tsx — Fleet Inspection Form
 * React migration of /frota/inspecao-frota.html
 *
 * Preserves:
 *  - 5-section accordion form (Vehicle, Identification, Checklist, Maintenance, Finalization)
 *  - Dynamic checklist per vehicle category (capability engine)
 *  - NC validation: notes (≥5 chars) + photo required
 *  - Advanced lighting toggle
 *  - Draft auto-save to localStorage (400ms debounce)
 *  - Auto-WO + Auto-PO creation via db-fleet.ts
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useParams }  from 'react-router-dom'
import { useStore }                from '@/store/useStore'
import { FROTA_DB }                from '@/data/fleet-catalog'
import { buildChecklist, groupByCategory, checklistStats, validateChecklist } from '@/lib/checklist-engine'
import { salvarInspecao }          from '@/lib/db-fleet'
import { useInspectionDraft, emptyDraft } from '@/hooks/useFleetData'
import InspectionChecklist         from '@/components/fleet/InspectionChecklist'
import type { ChecklistItem }      from '@/types/vehicle'
import s from './InspectionPage.module.css'

type Section = 'vehicle' | 'identification' | 'checklist' | 'maintenance' | 'finalization'

export default function InspectionPage() {
  const { vehicleId: paramVehicleId } = useParams<{ vehicleId?: string }>()
  const navigate = useNavigate()
  const user     = useStore(st => st.user)

  // ── Form state ──
  const [draft,    setDraft]    = useState(() => emptyDraft(paramVehicleId ?? ''))
  const [checklist,setChecklist]= useState<ChecklistItem[]>([])
  const [photoMap, setPhotoMap] = useState<Map<string, File[]>>(new Map())

  // ── UI state ──
  const [openSection, setOpenSection] = useState<Section>('vehicle')
  const [submitting,  setSubmitting]  = useState(false)
  const [errors,      setErrors]      = useState<string[]>([])
  const [draftRestored, setDraftRestored] = useState(false)

  const { loadDraft, saveDraft, clearDraft } = useInspectionDraft(draft.vehicleId || null)

  // ── Resolve selected vehicle ──
  const selectedVehicle = useMemo(
    () => FROTA_DB.find(v => v.id === draft.vehicleId) ?? null,
    [draft.vehicleId],
  )

  // ── Build / rebuild checklist when vehicle or advanced lighting changes ──
  useEffect(() => {
    if (!selectedVehicle) { setChecklist([]); return }
    const caps = draft.includeAdvancedLighting ? { advanced_lighting: true } : {}
    setChecklist(prev => buildChecklist(selectedVehicle, caps, prev))
  }, [selectedVehicle, draft.includeAdvancedLighting])

  // ── Pre-select vehicle from URL param ──
  useEffect(() => {
    if (!paramVehicleId) return
    const v = FROTA_DB.find(v => v.id === paramVehicleId)
    if (!v) return
    // Check for existing draft
    const saved = loadDraft()
    if (saved && saved.vehicleId === paramVehicleId) {
      setDraft(saved)
      setDraftRestored(true)
    } else {
      setDraft(prev => ({
        ...prev,
        vehicleId:       v.id,
        vehiclePlate:    v.placa,
        vehicleModel:    v.modelo,
        vehicleCategory: v.categoria,
        driverName:      v.motoristaPadrao ?? prev.driverName,
      }))
    }
    setOpenSection('identification')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramVehicleId])

  // ── Draft auto-save ──
  useEffect(() => {
    if (draft.vehicleId) saveDraft(draft)
  }, [draft, saveDraft])

  // ── Handlers ──
  const updateDraft = useCallback(<K extends keyof typeof draft>(key: K, value: typeof draft[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }))
  }, [])

  function selectVehicle(vehicleId: string) {
    const v = FROTA_DB.find(v => v.id === vehicleId)
    if (!v) return
    setDraft(prev => ({
      ...prev,
      vehicleId:       v.id,
      vehiclePlate:    v.placa,
      vehicleModel:    v.modelo,
      vehicleCategory: v.categoria,
      driverName:      v.motoristaPadrao ?? prev.driverName,
    }))
    // Reset answers when vehicle changes
    setChecklist([])
    setPhotoMap(new Map())
    setOpenSection('identification')
  }

  function handleChecklistChange(itemId: string, field: 'status' | 'notes', value: string) {
    setChecklist(prev =>
      prev.map(item =>
        item.id === itemId
          ? {
              ...item,
              [field]: value,
              // Clear notes and photos when toggling back to C
              ...(field === 'status' && value === 'C' ? { notes: '' } : {}),
            }
          : item
      )
    )
    // Sync answers back to draft for localStorage save
    setDraft(prev => ({
      ...prev,
      checklistAnswers: {
        ...prev.checklistAnswers,
        [itemId]: {
          status: field === 'status' ? (value as 'C' | 'NC') : (prev.checklistAnswers[itemId]?.status ?? null),
          notes:  field === 'notes'  ? value : (prev.checklistAnswers[itemId]?.notes ?? ''),
        },
      },
    }))
  }

  function handlePhotos(itemId: string, files: File[]) {
    setPhotoMap(prev => {
      const next = new Map(prev)
      next.set(itemId, files)
      return next
    })
  }

  // ── Progress ──
  const stats  = useMemo(() => checklistStats(checklist), [checklist])
  const groups  = useMemo(() => groupByCategory(checklist), [checklist])

  // ── Submit ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors([])

    // Client-side validation
    const errs: string[] = []
    if (!draft.vehicleId)         errs.push('Selecione um veículo.')
    if (!draft.inspectionType)    errs.push('Selecione o tipo de inspeção (Saída / Retorno).')
    if (!draft.location.trim())   errs.push('Informe o local de inspeção.')
    if (draft.mileage === '')     errs.push('Informe a quilometragem.')
    if (!draft.inspectorName.trim()) errs.push('Informe o nome do inspetor.')
    if (!draft.responsibilityTermAccepted) errs.push('Aceite o termo de responsabilidade.')
    errs.push(...validateChecklist(checklist, photoMap))

    if (errs.length) { setErrors(errs); return }

    setSubmitting(true)
    try {
      const mileage = parseInt(draft.mileage, 10) || 0
      const payload = {
        header: {
          vehicleId:       draft.vehicleId,
          vehiclePlate:    draft.vehiclePlate,
          vehicleModel:    draft.vehicleModel,
          vehicleCategory: draft.vehicleCategory,
          inspectionType:  draft.inspectionType,
          date:            draft.date,
          time:            draft.time,
          location:        draft.location,
          destination:     draft.destination || undefined,
          mileage,
          fueling:         draft.fueling,
        },
        checklist,
        maintenance: {
          oilLevel:      draft.oilLevel,
          coolantLevel:  draft.coolantLevel,
          brakeFluid:    draft.brakeFluid,
          tiresPressure: draft.tiresPressure,
          maintenanceObs:draft.maintenanceObs,
        },
        inspector:                  draft.inspectorName,
        driver:                     draft.driverName,
        generalNotes:               draft.generalNotes,
        responsibilityTermAccepted: draft.responsibilityTermAccepted,
        nonConformities: 0,   // recalculated in salvarInspecao
        vehicleId:       draft.vehicleId,
        vehiclePlate:    draft.vehiclePlate,
        vehicleModel:    draft.vehicleModel,
        inspectionType:  draft.inspectionType,
        createdBy:       user?.nome ?? 'Sistema',
        timestampEnvio:  Date.now(),
      } as const

      await salvarInspecao(payload, photoMap, user?.nome ?? 'Sistema')
      clearDraft()
      navigate('/frota', { replace: true })
    } catch (e) {
      console.error('[InspectionPage] submit error:', e)
      setErrors(['Erro ao salvar inspeção. Tente novamente.'])
    } finally {
      setSubmitting(false)
    }
  }

  // ── Section toggle ──
  function toggleSection(sec: Section) {
    setOpenSection(prev => prev === sec ? 'vehicle' : sec)
  }

  return (
    <div className={s.page}>

      <div className={s.header}>
        <div>
          <h1 className={s.title}>Nova Inspeção de Frota</h1>
          {selectedVehicle && (
            <p className={s.subtitle}>
              {selectedVehicle.icone} {selectedVehicle.placa} — {selectedVehicle.modelo}
            </p>
          )}
        </div>
        {checklist.length > 0 && (
          <div className={s.progressPill} style={{ '--pct': `${stats.pct}%` } as React.CSSProperties}>
            <div className={s.progressBar} />
            <span className={s.progressText}>{stats.pct}% preenchido · {stats.ncCount} NC</span>
          </div>
        )}
      </div>

      {/* Draft restored banner */}
      {draftRestored && (
        <div className={s.draftBanner}>
          Rascunho restaurado automaticamente.
          <button type="button" onClick={() => { clearDraft(); setDraftRestored(false); setDraft(emptyDraft(paramVehicleId)) }}>
            Descartar
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>

        {/* ── SECTION 1: Vehicle ── */}
        <Accordion

          label="1. Veículo"
          icon="🚛"
          open={openSection === 'vehicle'}
          onToggle={() => toggleSection('vehicle')}
          done={!!selectedVehicle}
        >
          <VehicleSelector
            selectedId={draft.vehicleId}
            onSelect={selectVehicle}
          />
        </Accordion>

        {/* ── SECTION 2: Identification ── */}
        <Accordion
          label="2. Identificação"
          icon="📋"
          open={openSection === 'identification'}
          onToggle={() => toggleSection('identification')}
          done={!!(draft.inspectionType && draft.location && draft.mileage)}
        >
          <IdentificationSection draft={draft} update={updateDraft} />
        </Accordion>

        {/* ── SECTION 3: Checklist ── */}
        <Accordion
          label={`3. Checklist ${checklist.length > 0 ? `(${stats.answered}/${stats.total})` : ''}`}
          icon="✅"
          open={openSection === 'checklist'}
          onToggle={() => toggleSection('checklist')}
          done={checklist.length > 0 && stats.remaining === 0}
        >
          {!selectedVehicle ? (
            <p className={s.noVehicle}>Selecione um veículo primeiro.</p>
          ) : (
            <>
              {/* Advanced lighting toggle (trucks only) */}
              {selectedVehicle.categoria !== 'Motos' && selectedVehicle.categoria !== 'Carros Leves' && (
                <label className={s.advLightToggle}>
                  <input
                    type="checkbox"
                    checked={draft.includeAdvancedLighting}
                    onChange={e => updateDraft('includeAdvancedLighting', e.target.checked)}
                  />
                  Incluir iluminação avançada (DRL, milha, LED de ré)
                </label>
              )}
              <InspectionChecklist
                groups={groups}
                photoMap={photoMap}
                onChange={handleChecklistChange}
                onPhotos={handlePhotos}
              />
            </>
          )}
        </Accordion>

        {/* ── SECTION 4: Maintenance ── */}
        <Accordion
          label="4. Manutenção e Fluidos"
          icon="🔧"
          open={openSection === 'maintenance'}
          onToggle={() => toggleSection('maintenance')}
          done={false}
        >
          <MaintenanceSection draft={draft} update={updateDraft} />
        </Accordion>

        {/* ── SECTION 5: Finalization ── */}
        <Accordion
          label="5. Finalização"
          icon="📝"
          open={openSection === 'finalization'}
          onToggle={() => toggleSection('finalization')}
          done={!!(draft.inspectorName && draft.responsibilityTermAccepted)}
        >
          <FinalizationSection draft={draft} update={updateDraft} />
        </Accordion>

        {/* Error list */}
        {errors.length > 0 && (
          <div className={s.errorBox}>
            <strong>Corrija os seguintes itens antes de enviar:</strong>
            <ul>
              {errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>
        )}

        {/* Submit */}
        <div className={s.submitRow}>
          <button
            type="button"
            className={s.btnCancel}
            onClick={() => navigate('/frota')}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className={s.btnSubmit}
            disabled={submitting || !selectedVehicle}
          >
            {submitting ? 'Enviando…' : '✓ Enviar Inspeção'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────

function Accordion({
  label, icon, open, onToggle, done, children,
}: {
  label: string; icon: string
  open: boolean; onToggle: () => void; done: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`${s.accordion} ${open ? s.accordionOpen : ''}`}>
      <button type="button" className={s.accordionHeader} onClick={onToggle}>
        <span className={s.accIcon}>{icon}</span>
        <span className={s.accLabel}>{label}</span>
        {done && <span className={s.accDone}>✓</span>}
        <span className={s.accChevron}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className={s.accordionBody}>{children}</div>}
    </div>
  )
}

function VehicleSelector({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q
      ? FROTA_DB.filter(v => `${v.placa} ${v.modelo} ${v.categoria}`.toLowerCase().includes(q))
      : FROTA_DB
  }, [search])

  return (
    <div className={s.vehicleSelector}>
      <input
        type="search"
        className={s.vehicleSearch}
        placeholder="Buscar por placa ou modelo…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
      />
      <div className={s.vehicleList}>
        {filtered.map(v => (
          <button
            key={v.id}
            type="button"
            className={`${s.vehicleOption} ${selectedId === v.id ? s.vehicleSelected : ''}`}
            onClick={() => onSelect(v.id)}
          >
            <span className={s.vIcon}>{v.icone}</span>
            <span className={s.vPlate}>{v.placa}</span>
            <span className={s.vModel}>{v.modelo}</span>
            <span className={s.vCat}>{v.categoria}</span>
            {v.motoristaPadrao && <span className={s.vDriver}>👤 {v.motoristaPadrao}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

type DraftKey = keyof ReturnType<typeof emptyDraft>
type Updater  = <K extends DraftKey>(key: K, value: ReturnType<typeof emptyDraft>[K]) => void

function IdentificationSection({ draft, update }: { draft: ReturnType<typeof emptyDraft>; update: Updater }) {
  return (
    <div className={s.formGrid}>
      <div className={s.fieldGroup}>
        <label>Tipo de Inspeção *</label>
        <div className={s.radioRow}>
          {(['departure', 'return'] as const).map(t => (
            <label key={t} className={`${s.radioCard} ${draft.inspectionType === t ? s.radioCardActive : ''}`}>
              <input
                type="radio"
                name="inspectionType"
                value={t}
                checked={draft.inspectionType === t}
                onChange={() => update('inspectionType', t)}
              />
              {t === 'departure' ? '🛫 Saída' : '🛬 Retorno'}
            </label>
          ))}
        </div>
      </div>

      <Field label="Local *" value={draft.location}     onChange={v => update('location', v)}     placeholder="ex: Pátio Central" />
      <Field label="Destino"  value={draft.destination} onChange={v => update('destination', v)}  placeholder="ex: São Paulo — SP" />
      <Field label="Km *"     value={draft.mileage}     onChange={v => update('mileage', v)}      placeholder="Quilometragem atual" type="number" />
      <Field label="Data *"   value={draft.date}        onChange={v => update('date', v)}         type="date" />
      <Field label="Hora"     value={draft.time}        onChange={v => update('time', v)}         type="time" />

      <label className={s.checkboxLabel}>
        <input type="checkbox" checked={draft.fueling} onChange={e => update('fueling', e.target.checked)} />
        Abastecimento realizado
      </label>
    </div>
  )
}

function MaintenanceSection({ draft, update }: { draft: ReturnType<typeof emptyDraft>; update: Updater }) {
  const levels: Array<'ok' | 'baixo' | 'critico'> = ['ok', 'baixo', 'critico']
  const levelLabel = { ok: 'OK', baixo: 'Baixo', critico: 'Crítico' }
  const levelColor = { ok: '#16a34a', baixo: '#d97706', critico: '#dc2626' }

  function LevelSelect({ field, label }: { field: 'oilLevel' | 'coolantLevel' | 'brakeFluid'; label: string }) {
    return (
      <div className={s.fieldGroup}>
        <label>{label}</label>
        <div className={s.levelRow}>
          {levels.map(l => (
            <label
              key={l}
              className={`${s.levelBtn} ${draft[field] === l ? s.levelActive : ''}`}
              style={draft[field] === l ? { borderColor: levelColor[l], color: levelColor[l] } : undefined}
            >
              <input type="radio" name={field} value={l} checked={draft[field] === l} onChange={() => update(field, l)} hidden />
              {levelLabel[l]}
            </label>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={s.formGrid}>
      <LevelSelect field="oilLevel"     label="Nível de Óleo" />
      <LevelSelect field="coolantLevel" label="Nível do Arrefecimento" />
      <LevelSelect field="brakeFluid"   label="Fluido de Freio" />
      <Field
        label="Pressão dos Pneus"
        value={draft.tiresPressure}
        onChange={v => update('tiresPressure', v)}
        placeholder="ex: 110/110/110"
      />
      <div className={`${s.fieldGroup} ${s.fullWidth}`}>
        <label>Observações de Manutenção</label>
        <textarea
          className={s.textarea}
          value={draft.maintenanceObs}
          onChange={e => update('maintenanceObs', e.target.value)}
          rows={3}
          placeholder="Observações gerais sobre manutenção e fluidos"
        />
      </div>
    </div>
  )
}

function FinalizationSection({ draft, update }: { draft: ReturnType<typeof emptyDraft>; update: Updater }) {
  return (
    <div className={s.formGrid}>
      <Field label="Nome do Inspetor *" value={draft.inspectorName} onChange={v => update('inspectorName', v)} placeholder="Seu nome completo" />
      <Field label="Nome do Motorista"  value={draft.driverName}    onChange={v => update('driverName', v)}    placeholder="Motorista responsável" />
      <div className={`${s.fieldGroup} ${s.fullWidth}`}>
        <label>Observações Gerais</label>
        <textarea
          className={s.textarea}
          value={draft.generalNotes}
          onChange={e => update('generalNotes', e.target.value)}
          rows={3}
          placeholder="Observações gerais sobre o veículo ou inspeção"
        />
      </div>
      <div className={`${s.fieldGroup} ${s.fullWidth}`}>
        <label className={`${s.checkboxLabel} ${s.termLabel}`}>
          <input
            type="checkbox"
            checked={draft.responsibilityTermAccepted}
            onChange={e => update('responsibilityTermAccepted', e.target.checked)}
          />
          <span>
            Declaro que as informações acima são verdadeiras e assumo responsabilidade
            pelo estado do veículo descrito nesta inspeção.
          </span>
        </label>
      </div>
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string
}) {
  return (
    <div className={s.fieldGroup}>
      <label>{label}</label>
      <input
        type={type}
        className={s.input}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

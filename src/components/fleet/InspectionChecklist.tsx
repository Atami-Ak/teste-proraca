/**
 * InspectionChecklist.tsx
 *
 * Renders the grouped dynamic checklist for the inspection form.
 * Each category is a collapsible accordion section.
 * NC items reveal a notes textarea and photo file input.
 */

import { useState }         from 'react'
import type { ChecklistItem, CategoryGroup } from '@/types/vehicle'
import s from './InspectionChecklist.module.css'

interface Props {
  groups:     CategoryGroup[]
  photoMap:   Map<string, File[]>
  onChange:   (itemId: string, field: 'status' | 'notes', value: string) => void
  onPhotos:   (itemId: string, files: File[]) => void
}

export default function InspectionChecklist({ groups, photoMap, onChange, onPhotos }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  function toggle(key: string) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className={s.root}>
      {groups.map(group => (
        <div key={group.key} className={s.section}>
          {/* Section header */}
          <button
            type="button"
            className={s.sectionHeader}
            onClick={() => toggle(group.key)}
            aria-expanded={!collapsed[group.key]}
          >
            <span className={s.sectionIcon}>{group.meta.icon}</span>
            <span className={s.sectionLabel}>{group.meta.label}</span>
            <SectionProgress items={group.items} />
            <span className={`${s.chevron} ${collapsed[group.key] ? s.chevronUp : ''}`}>▾</span>
          </button>

          {/* Items */}
          {!collapsed[group.key] && (
            <div className={s.itemList}>
              {group.items.map(item => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  photos={photoMap.get(item.id) ?? []}
                  onChange={onChange}
                  onPhotos={onPhotos}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Section progress badge ────────────────────────────

function SectionProgress({ items }: { items: ChecklistItem[] }) {
  const total    = items.length
  const answered = items.filter(i => i.status !== null).length
  const nc       = items.filter(i => i.status === 'NC').length
  const allDone  = answered === total

  return (
    <span className={`${s.progress} ${allDone ? s.progressDone : ''} ${nc > 0 ? s.progressNc : ''}`}>
      {answered}/{total}{nc > 0 ? ` · ${nc} NC` : ''}
    </span>
  )
}

// ── Single checklist row ──────────────────────────────

interface RowProps {
  item:     ChecklistItem
  photos:   File[]
  onChange: (itemId: string, field: 'status' | 'notes', value: string) => void
  onPhotos: (itemId: string, files: File[]) => void
}

function ChecklistRow({ item, photos, onChange, onPhotos }: RowProps) {
  const isNc    = item.status === 'NC'
  const isC     = item.status === 'C'

  function handlePhotoInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length) onPhotos(item.id, [...photos, ...files])
  }

  function removePhoto(idx: number) {
    onPhotos(item.id, photos.filter((_, i) => i !== idx))
  }

  return (
    <div className={`${s.row} ${isNc ? s.rowNc : ''} ${isC ? s.rowC : ''}`}>
      {/* Label */}
      <div className={s.rowLabel}>
        {item.label}
        {item.required && <span className={s.required} title="Obrigatório">*</span>}
      </div>

      {/* C / NC radio group */}
      <div className={s.radioGroup}>
        <label className={`${s.radioLabel} ${isC ? s.radioC : ''}`}>
          <input
            type="radio"
            name={`item-${item.id}`}
            value="C"
            checked={isC}
            onChange={() => onChange(item.id, 'status', 'C')}
          />
          C
        </label>
        <label className={`${s.radioLabel} ${isNc ? s.radioNC : ''}`}>
          <input
            type="radio"
            name={`item-${item.id}`}
            value="NC"
            checked={isNc}
            onChange={() => onChange(item.id, 'status', 'NC')}
          />
          NC
        </label>
      </div>

      {/* NC details */}
      {isNc && (
        <div className={s.ncDetails}>
          <textarea
            className={s.ncNotes}
            placeholder="Descreva a não conformidade (obrigatório)"
            value={item.notes}
            onChange={e => onChange(item.id, 'notes', e.target.value)}
            rows={2}
          />

          {/* Photo input */}
          <div className={s.photoSection}>
            <label className={s.photoBtn}>
              📷 Adicionar foto
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                hidden
                onChange={handlePhotoInput}
              />
            </label>
            {photos.length > 0 && (
              <div className={s.photoList}>
                {photos.map((file, idx) => (
                  <div key={idx} className={s.photoThumb}>
                    <img src={URL.createObjectURL(file)} alt={`Foto ${idx + 1}`} />
                    <button
                      type="button"
                      className={s.removePhoto}
                      onClick={() => removePhoto(idx)}
                      aria-label="Remover foto"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <span className={`${s.photoRequired} ${photos.length > 0 ? s.photoOk : ''}`}>
              {photos.length > 0 ? `${photos.length} foto(s) adicionada(s)` : 'Foto obrigatória para NC'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

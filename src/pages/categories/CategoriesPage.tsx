import { useState, useMemo } from 'react'
import { useCategories }       from '@/hooks/useData'
import { useStore }            from '@/store/useStore'
import {
  createCategory, updateCategory, deleteCategory,
  FIELD_TYPES,
} from '@/lib/db'
import type { Category, FieldSchema, FieldType, MaintenanceType } from '@/types'
import s from './CategoriesPage.module.css'

function hexToAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ── Form state types ──────────────────────────────────
interface FieldFormState {
  label: string; key: string; type: FieldType; required: boolean; options: string
}
const EMPTY_FIELD: FieldFormState = { label: '', key: '', type: 'text', required: false, options: '' }

interface CategoryFormState {
  name: string; prefix: string; icon: string; color: string
  mtPrev: boolean; mtCorr: boolean; mtInsp: boolean
}
const EMPTY_CATEGORY: CategoryFormState = {
  name: '', prefix: '', icon: '', color: '#166534',
  mtPrev: true, mtCorr: true, mtInsp: false,
}
function categoryToForm(cat: Category): CategoryFormState {
  return {
    name: cat.name, prefix: cat.prefix, icon: cat.icon, color: cat.color,
    mtPrev: cat.maintenanceTypes.includes('preventiva'),
    mtCorr: cat.maintenanceTypes.includes('corretiva'),
    mtInsp: cat.maintenanceTypes.includes('inspecao'),
  }
}

// ── MT badge labels ────────────────────────────────────
const MT_LABELS: Record<string, { label: string; cls: string }> = {
  preventiva: { label: 'Preventiva', cls: s.mtPrev },
  corretiva:  { label: 'Corretiva',  cls: s.mtCorr },
  inspecao:   { label: 'Inspeção',   cls: s.mtInsp },
}

// ════════════════════════════════════════════════════
// FieldModal
// ════════════════════════════════════════════════════
interface FieldModalProps {
  initial?: FieldSchema; onSave: (f: FieldSchema) => void
  onCancel: () => void; usedKeys: string[]
}
function FieldModal({ initial, onSave, onCancel, usedKeys }: FieldModalProps) {
  const isEdit = !!initial
  const [form, setForm] = useState<FieldFormState>(
    initial
      ? { label: initial.label, key: initial.key, type: initial.type, required: initial.required ?? false, options: (initial.options ?? []).join('\n') }
      : EMPTY_FIELD
  )
  function set<K extends keyof FieldFormState>(key: K, val: FieldFormState[K]) {
    setForm(prev => ({ ...prev, [key]: val }))
  }
  function autoKey(lbl: string) {
    return lbl.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  }
  function handleLabelChange(v: string) {
    setForm(prev => ({ ...prev, label: v, key: isEdit ? prev.key : autoKey(v) }))
  }
  function handleSave() {
    const trimLabel = form.label.trim()
    const trimKey   = form.key.trim().replace(/\s+/g, '_')
    if (!trimLabel) { alert('Informe o rótulo.'); return }
    if (!trimKey)   { alert('Informe a chave.'); return }
    if (!isEdit && usedKeys.includes(trimKey)) { alert(`A chave "${trimKey}" já existe.`); return }
    const field: FieldSchema = { key: trimKey, label: trimLabel, type: form.type, required: form.required }
    if (form.type === 'select' && form.options.trim()) {
      field.options = form.options.split('\n').map(o => o.trim()).filter(Boolean)
    }
    onSave(field)
  }

  return (
    <div className={s.overlay} style={{ zIndex: 600 }}>
      <div className={s.modal} style={{ maxWidth: 440 }}>
        <div className={s.modalHeader}>
          <div>
            <div className={s.modalSub}>Definição de Campo</div>
            <div className={s.modalTitle}>{isEdit ? 'Editar Campo' : 'Novo Campo'}</div>
          </div>
          <button className={s.closeBtn} onClick={onCancel}>×</button>
        </div>
        <div className={s.modalBody}>
          <div className={s.formGroup}>
            <label className={s.label}>Rótulo</label>
            <input className={s.input} placeholder="Ex.: Número de Série"
              value={form.label} onChange={e => handleLabelChange(e.target.value)} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Chave <span className={s.hint}>(identificador único)</span></label>
            <input className={s.input} placeholder="ex.: n_serie"
              value={form.key} onChange={e => set('key', e.target.value)} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Tipo de Campo</label>
            <select className={s.select} value={form.type}
              onChange={e => set('type', e.target.value as FieldType)}>
              {Object.entries(FIELD_TYPES).map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
            </select>
          </div>
          {form.type === 'select' && (
            <div className={s.formGroup}>
              <label className={s.label}>Opções <span className={s.hint}>(uma por linha)</span></label>
              <textarea className={s.textarea} rows={4}
                value={form.options} onChange={e => set('options', e.target.value)} />
            </div>
          )}
          <label
            className={`${s.checkLabel} ${form.required ? s.checkLabelActive : ''}`}
            onClick={() => set('required', !form.required)}
          >
            ✔ Campo obrigatório
          </label>
        </div>
        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onCancel}>Cancelar</button>
          <div style={{ flex: 1 }} />
          <button className={s.btnPrimary} onClick={handleSave}>Salvar Campo</button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════
// CatModal
// ════════════════════════════════════════════════════
interface CatModalProps { category?: Category; onClose: () => void; onSaved: () => void }
function CatModal({ category, onClose, onSaved }: CatModalProps) {
  const isEdit = !!category
  const [form, setForm]   = useState<CategoryFormState>(category ? categoryToForm(category) : EMPTY_CATEGORY)
  const [fields, setFields] = useState<FieldSchema[]>(category?.fields ? JSON.parse(JSON.stringify(category.fields)) : [])
  const [saving, setSaving] = useState(false)
  const [fieldModal, setFieldModal] = useState(false)
  const [editFieldIdx, setEditFieldIdx] = useState<number | null>(null)

  function setF<K extends keyof CategoryFormState>(key: K, val: CategoryFormState[K]) {
    setForm(prev => ({ ...prev, [key]: val }))
  }
  function openAddField() { setEditFieldIdx(null); setFieldModal(true) }
  function openEditField(i: number) { setEditFieldIdx(i); setFieldModal(true) }
  function removeField(i: number) { setFields(prev => prev.filter((_, idx) => idx !== i)) }
  function handleFieldSave(f: FieldSchema) {
    if (editFieldIdx !== null) setFields(prev => prev.map((x, i) => i === editFieldIdx ? f : x))
    else setFields(prev => [...prev, f])
    setFieldModal(false)
  }

  async function handleSave() {
    if (!form.name.trim())   { alert('Informe o nome.'); return }
    if (!form.prefix.trim()) { alert('Informe o prefixo.'); return }
    const maintTypes: MaintenanceType[] = []
    if (form.mtPrev) maintTypes.push('preventiva')
    if (form.mtCorr) maintTypes.push('corretiva')
    if (form.mtInsp) maintTypes.push('inspecao')
    const data = {
      name: form.name.trim(), prefix: form.prefix.trim().toUpperCase(),
      icon: form.icon.trim() || '📎', color: form.color,
      maintenanceTypes: maintTypes, fields,
      maintenanceConfig: category?.maintenanceConfig ?? {
        preventiveFrequencyDays: null, defaultType: 'corretiva' as MaintenanceType,
        requiresTechnician: false, notes: null,
      },
    }
    setSaving(true)
    try {
      if (isEdit && category) await updateCategory(category.id, data)
      else await createCategory(data)
      onSaved(); onClose()
    } catch (err) { alert('Erro ao salvar: ' + String(err)) }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!category) return
    if ((category.assetCount ?? 0) > 0) {
      alert(`Não é possível excluir: esta categoria possui ${category.assetCount} ativo(s).`); return
    }
    if (!confirm(`Excluir a categoria "${category.name}"?`)) return
    await deleteCategory(category.id); onSaved(); onClose()
  }

  const usedKeys = fields.map(f => f.key)
  const editingField = editFieldIdx !== null ? fields[editFieldIdx] : undefined

  const previewColor = form.color || '#166534'

  return (
    <>
      <div className={s.overlay}>
        <div className={s.modal}>
          <div className={s.modalHeader} style={{ borderTop: `4px solid ${previewColor}`, borderRadius: `${18}px ${18}px 0 0` }}>
            <div>
              <div className={s.modalSub}>{isEdit ? 'Editar' : 'Nova'} Categoria</div>
              <div className={s.modalTitle}>{form.name || 'Nova Categoria'}</div>
            </div>
            <button className={s.closeBtn} onClick={onClose}>×</button>
          </div>

          <div className={s.modalBody}>
            {/* Identity */}
            <div className={s.sectionBlock}>
              <div className={s.sectionBlockHeader}>
                <span className={s.sectionBlockTitle}>Identidade</span>
              </div>
              <div className={s.sectionBlockBody}>
                <div className={s.formRow2}>
                  <div className={s.formGroup}>
                    <label className={s.label}>Nome <span className={s.req}>*</span></label>
                    <input className={s.input} placeholder="Ex.: Climatização"
                      value={form.name} onChange={e => setF('name', e.target.value)} />
                  </div>
                  <div className={s.formGroup}>
                    <label className={s.label}>Prefixo <span className={s.req}>*</span></label>
                    <input className={s.input} placeholder="Ex.: CLIM"
                      value={form.prefix} onChange={e => setF('prefix', e.target.value.toUpperCase())} />
                  </div>
                </div>
                <div className={s.formRow2}>
                  <div className={s.formGroup}>
                    <label className={s.label}>Ícone (emoji)</label>
                    <input className={s.input} placeholder="❄️"
                      value={form.icon} onChange={e => setF('icon', e.target.value)} />
                  </div>
                  <div className={s.formGroup}>
                    <label className={s.label}>Cor de Identificação</label>
                    <div className={s.colorRow}>
                      <input type="color" className={s.colorPicker}
                        value={form.color} onChange={e => setF('color', e.target.value)} />
                      <span className={s.colorHex}>{form.color}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Maintenance types */}
            <div className={s.sectionBlock}>
              <div className={s.sectionBlockHeader}>
                <span className={s.sectionBlockTitle}>Tipos de Manutenção Permitidos</span>
              </div>
              <div className={s.sectionBlockBody}>
                <div className={s.checkGroup}>
                  <label className={`${s.checkLabel} ${form.mtPrev ? s.checkLabelActive : ''}`}
                    onClick={() => setF('mtPrev', !form.mtPrev)}>
                    🔵 Preventiva
                  </label>
                  <label className={`${s.checkLabel} ${form.mtCorr ? s.checkLabelActive : ''}`}
                    onClick={() => setF('mtCorr', !form.mtCorr)}>
                    🔴 Corretiva
                  </label>
                  <label className={`${s.checkLabel} ${form.mtInsp ? s.checkLabelActive : ''}`}
                    onClick={() => setF('mtInsp', !form.mtInsp)}>
                    🟢 Inspeção
                  </label>
                </div>
              </div>
            </div>

            {/* Fields */}
            <div className={s.sectionBlock}>
              <div className={s.sectionBlockHeader}>
                <span className={s.sectionBlockTitle}>Campos Técnicos ({fields.length})</span>
                <button className={s.btnAddField} onClick={openAddField}>+ Adicionar Campo</button>
              </div>
              {fields.length === 0 ? (
                <div className={s.fieldEmpty}>Nenhum campo. Os campos técnicos são únicos desta categoria.</div>
              ) : (
                <div className={s.fieldList}>
                  {fields.map((f, i) => (
                    <div key={i} className={s.fieldRow}>
                      <div className={s.fieldRowInfo}>
                        <span className={s.fieldLabel}>{f.label}</span>
                        <div className={s.fieldMeta}>
                          <span className={s.fieldTypeBadge}>{FIELD_TYPES[f.type] ?? f.type}</span>
                          <code className={s.fieldKey}>{f.key}</code>
                          {f.required && <span style={{ color: '#DC2626', fontWeight: 700 }}>Obrigatório</span>}
                        </div>
                      </div>
                      <div className={s.fieldRowActions}>
                        <button className={s.iconBtn} onClick={() => openEditField(i)} title="Editar">✏️</button>
                        <button className={s.iconBtn} onClick={() => removeField(i)} title="Remover">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={s.modalFooter}>
            {isEdit && (
              <button className={s.btnDanger}
                disabled={(category?.assetCount ?? 0) > 0}
                title={(category?.assetCount ?? 0) > 0 ? 'Categoria possui ativos' : ''}
                onClick={handleDelete}>
                Excluir
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button className={s.btnSecondary} onClick={onClose}>Cancelar</button>
            <button className={s.btnPrimary} disabled={saving} onClick={handleSave}>
              {saving ? 'Salvando…' : isEdit ? 'Salvar Alterações' : 'Criar Categoria'}
            </button>
          </div>
        </div>
      </div>

      {fieldModal && (
        <FieldModal
          initial={editingField}
          usedKeys={editingField ? usedKeys.filter(k => k !== editingField.key) : usedKeys}
          onSave={handleFieldSave}
          onCancel={() => setFieldModal(false)}
        />
      )}
    </>
  )
}

// ════════════════════════════════════════════════════
// CategoriesPage
// ════════════════════════════════════════════════════
export default function CategoriesPage() {
  useCategories()
  const categories    = useStore(s => s.categories)
  const setCategories = useStore(s => s.setCategories)

  const [modalCat, setModalCat] = useState<Category | 'new' | null>(null)
  const [search,   setSearch]   = useState('')

  async function refreshCategories() {
    const { getCategories } = await import('@/lib/db')
    const cats = await getCategories()
    setCategories(cats)
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return categories
    return categories.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.prefix.toLowerCase().includes(q)
    )
  }, [categories, search])

  // KPI aggregates
  const totalAssets = useMemo(() => categories.reduce((s, c) => s + (c.assetCount ?? 0), 0), [categories])
  const totalFields = useMemo(() => categories.reduce((s, c) => s + (c.fields?.length ?? 0), 0), [categories])
  const withMaint   = useMemo(() => categories.filter(c => c.maintenanceTypes.length > 0).length, [categories])

  return (
    <div className={s.page}>
      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.pageTitle}>Categorias de Ativos</h1>
          <p className={s.pageSubtitle}>Gerencie as categorias e seus campos técnicos personalizados</p>
        </div>
        <div className={s.headerActions}>
          <button className={s.btnPrimary} onClick={() => setModalCat('new')}>
            + Nova Categoria
          </button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className={s.kpiStrip}>
        <div className={s.kpiCard}>
          <div className={s.kpiIconWrap} style={{ background: 'rgba(22,101,52,0.1)' }}>⚙️</div>
          <div className={s.kpiBody}>
            <div className={s.kpiValue}>{categories.length}</div>
            <div className={s.kpiLabel}>Categorias</div>
          </div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiIconWrap} style={{ background: 'rgba(22,163,74,0.1)' }}>🏷️</div>
          <div className={s.kpiBody}>
            <div className={s.kpiValue}>{totalAssets}</div>
            <div className={s.kpiLabel}>Total de Ativos</div>
          </div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiIconWrap} style={{ background: 'rgba(245,158,11,0.1)' }}>📋</div>
          <div className={s.kpiBody}>
            <div className={s.kpiValue}>{totalFields}</div>
            <div className={s.kpiLabel}>Campos Cadastrados</div>
          </div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiIconWrap} style={{ background: 'rgba(234,88,12,0.1)' }}>🔧</div>
          <div className={s.kpiBody}>
            <div className={s.kpiValue}>{withMaint}</div>
            <div className={s.kpiLabel}>Com Manutenção</div>
            <div className={s.kpiSub}>de {categories.length} categorias</div>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className={s.toolbar}>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}>🔍</span>
          <input
            className={s.searchInput}
            placeholder="Buscar categoria por nome ou prefixo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className={s.toolbarRight}>
          <span className={s.resultCount}>{filtered.length} categoria{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* ── Grid ── */}
      {filtered.length === 0 && categories.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>⚙️</div>
          <h3 className={s.emptyTitle}>Nenhuma categoria cadastrada</h3>
          <p className={s.emptyDesc}>Crie a primeira categoria para começar a registrar ativos patrimoniais.</p>
          <button className={s.btnPrimary} onClick={() => setModalCat('new')}>+ Nova Categoria</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>🔍</div>
          <h3 className={s.emptyTitle}>Nenhuma categoria encontrada</h3>
          <p className={s.emptyDesc}>Tente outro termo de busca.</p>
        </div>
      ) : (
        <div className={s.grid}>
          {filtered.map(cat => {
            const fc = cat.fields?.length ?? 0
            const ac = cat.assetCount ?? 0
            const color = cat.color || '#166534'
            return (
              <div key={cat.id} className={s.catCard}
                style={{ borderTopColor: color }}
                onClick={() => setModalCat(cat)}>

                <button className={s.editBtnTop}
                  onClick={e => { e.stopPropagation(); setModalCat(cat) }}
                  title="Editar categoria">✏️</button>

                <div className={s.catTop}>
                  <div className={s.catIconBox} style={{ background: hexToAlpha(color, 0.12) }}>
                    <span style={{ fontSize: '1.6rem' }}>{cat.icon || '📎'}</span>
                  </div>
                  <div className={s.catMeta}>
                    <div className={s.catName}>{cat.name}</div>
                    <div className={s.catPrefixRow}>
                      <span className={s.catPrefix}>{cat.prefix}</span>
                    </div>
                  </div>
                </div>

                <div className={s.catStats}>
                  <div className={s.catStat}>
                    <span className={s.catStatValue} style={{ color }}>{ac}</span>
                    <span className={s.catStatLabel}>Ativos</span>
                  </div>
                  <div className={s.catStat}>
                    <span className={s.catStatValue}>{fc}</span>
                    <span className={s.catStatLabel}>Campos</span>
                  </div>
                  <div className={s.catStat}>
                    <span className={s.catStatValue}>{cat.maintenanceTypes.length}</span>
                    <span className={s.catStatLabel}>Manutenções</span>
                  </div>
                </div>

                {cat.maintenanceTypes.length > 0 && (
                  <div className={s.mtBadges}>
                    {cat.maintenanceTypes.map(mt => (
                      <span key={mt} className={`${s.mtBadge} ${MT_LABELS[mt]?.cls ?? ''}`}>
                        {MT_LABELS[mt]?.label ?? mt}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal ── */}
      {modalCat !== null && (
        <CatModal
          category={modalCat === 'new' ? undefined : modalCat}
          onClose={() => setModalCat(null)}
          onSaved={refreshCategories}
        />
      )}
    </div>
  )
}

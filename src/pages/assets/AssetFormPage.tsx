/**
 * AssetFormPage.tsx
 *
 * Converted from: ativos/ativo-form.html + js/modules/app-ativo-form.js
 *
 * Logic preserved:
 *  - Edit mode via URL ?edit=<id>
 *  - Category selection drives dynamic field rendering
 *  - Code preview generated via generateAssetCode()
 *  - Validates required fields before save
 *  - Creates or updates Firestore asset document
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useCategories }   from '@/hooks/useData'
import { useStore }        from '@/store/useStore'
import {
  getAssetById, createAsset, updateAsset, generateAssetCode,
} from '@/lib/db'
import { LOCATIONS }       from '@/data/categories'
import type { Asset, AssetStatus, Category, FieldSchema } from '@/types'
import s from './AssetFormPage.module.css'

// ── Typed form state ──────────────────────────────────
interface AssetFormState {
  catId:          string
  name:           string
  location:       string
  locationDetail: string
  responsible:    string
  acquisition:    string
  value:          string
  status:         AssetStatus
  notes:          string
  dynamicData:    Record<string, string | number>
  customLocation: string
}

const EMPTY_FORM: AssetFormState = {
  catId: '', name: '', location: '', locationDetail: '',
  responsible: '', acquisition: '', value: '',
  status: 'ativo', notes: '', dynamicData: {}, customLocation: '',
}

// ── Dynamic field renderer ────────────────────────────
interface DynFieldProps {
  field:    FieldSchema
  value:    string | number | undefined
  onChange: (key: string, val: string | number) => void
}

function DynField({ field, value, onChange }: DynFieldProps) {
  const val = value ?? ''

  const common = {
    id:        `dyn-${field.key}`,
    className: s.input,
    value:     String(val),
    onChange:  (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      onChange(field.key, e.target.value),
  }

  let control: React.ReactNode

  switch (field.type) {
    case 'select':
      control = (
        <select {...common} className={s.select}>
          <option value="">Selecione…</option>
          {(field.options ?? []).map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )
      break
    case 'textarea':
      control = (
        <textarea
          id={common.id} className={s.textarea} rows={3}
          value={String(val)}
          onChange={e => onChange(field.key, e.target.value)}
        />
      )
      break
    case 'date':
      control = <input type="date" {...common} />
      break
    case 'number':
      control = <input type="number" {...common} placeholder="0" />
      break
    default:
      control = <input type="text" {...common} placeholder={`${field.label}…`} />
  }

  return (
    <div className={s.formGroup}>
      <label className={s.label} htmlFor={common.id}>
        {field.label} {field.required && <span className={s.req}>*</span>}
      </label>
      {control}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────
function Section({ num, title, children }: { num: string | number; title: string; children: React.ReactNode }) {
  return (
    <div className={s.section}>
      <div className={s.sectionHeader}>
        <div className={s.sectionNum}>{num}</div>
        <span className={s.sectionTitle}>{title}</span>
      </div>
      <div className={s.sectionBody}>{children}</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// AssetFormPage
// ══════════════════════════════════════════════════════
export default function AssetFormPage() {
  const navigate   = useNavigate()
  const [params]   = useSearchParams()
  const editId     = params.get('edit')
  const isEdit     = !!editId

  useCategories()
  const categories = useStore(s => s.categories)

  // ── Typed form state ──
  const [form, setForm] = useState<AssetFormState>(EMPTY_FORM)

  // ── UI state (not form data) ──
  const [codePreview, setCodePreview] = useState<string>('Selecione a categoria')
  const [saving,      setSaving]      = useState<boolean>(false)
  const [loadingEdit, setLoadingEdit] = useState<boolean>(isEdit)

  const selectedCat: Category | undefined = categories.find(c => c.id === form.catId)

  // ── Typed field setter ──
  function setField<K extends keyof AssetFormState>(key: K, val: AssetFormState[K]): void {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  // ── Load edit asset ──
  useEffect(() => {
    if (!editId) return
    getAssetById(editId).then(asset => {
      if (!asset) { alert('Ativo não encontrado.'); navigate('/ativos'); return }
      setForm({
        catId:          asset.categoryId,
        name:           asset.name,
        location:       asset.location ?? '',
        locationDetail: asset.locationDetail ?? '',
        responsible:    asset.responsible ?? '',
        acquisition:    asset.acquisition ?? '',
        value:          String(asset.value ?? ''),
        status:         asset.status,
        notes:          asset.notes ?? '',
        dynamicData:    asset.dynamicData ?? {},
        customLocation: '',
      })
      setCodePreview(asset.code)
      setLoadingEdit(false)
    })
  }, [editId]) // eslint-disable-line

  // ── Category change → code preview ──
  useEffect(() => {
    if (!form.catId || !selectedCat) { setCodePreview('Selecione a categoria'); return }
    if (isEdit) return
    setCodePreview('Gerando…')
    generateAssetCode(selectedCat.prefix)
      .then(setCodePreview)
      .catch(() => setCodePreview(`${selectedCat.prefix}-????`))
  }, [form.catId]) // eslint-disable-line

  const handleDynChange = useCallback((key: string, val: string | number): void => {
    setForm(prev => ({ ...prev, dynamicData: { ...prev.dynamicData, [key]: val } }))
  }, [])

  const effectiveLocation = form.location === '__custom__' ? form.customLocation : form.location

  // ── Save ──
  async function handleSave(): Promise<void> {
    if (!form.name.trim())    return alert('Informe o nome do ativo.')
    if (!form.catId)          return alert('Selecione a categoria.')
    if (!effectiveLocation)   return alert('Selecione a localização.')

    setSaving(true)
    try {
      const payload = {
        name:           form.name.trim(),
        categoryId:     form.catId,
        location:       effectiveLocation,
        locationDetail: form.locationDetail.trim() || null,
        responsible:    form.responsible.trim()    || null,
        acquisition:    form.acquisition           || null,
        value:          form.value ? Number(form.value) : null,
        status:         form.status,
        notes:          form.notes.trim()          || null,
        dynamicData:    form.dynamicData,
      }

      if (isEdit && editId) {
        await updateAsset(editId, { ...payload, updatedBy: 'user' })
      } else {
        const cat  = selectedCat!
        const code = await generateAssetCode(cat.prefix)
        await createAsset({
          code, codePrefix: cat.prefix,
          ...payload,
          createdBy: 'user',
        } as Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>)
      }
      navigate('/ativos')
    } catch (err) {
      alert('Erro ao salvar: ' + String(err))
    } finally {
      setSaving(false)
    }
  }

  if (loadingEdit) {
    return <div className={s.loading}>Carregando ativo…</div>
  }

  const dynSectionNum = selectedCat?.fields.length ? 3 : undefined
  const obsSectionNum = selectedCat?.fields.length ? 4 : 3

  return (
    <div className={s.page}>

      {/* ── Breadcrumb ── */}
      <div className={s.breadcrumb}>
        <Link to="/ativos" className={s.backLink}>← Voltar</Link>
        <span className={s.sep}>/</span>
        <span className={s.breadTitle}>{isEdit ? 'Editar Ativo' : 'Novo Ativo'}</span>
      </div>

      {/* ── Section 1: Identificação ── */}
      <Section num={1} title="Identificação">
        <div className={s.formGroup} style={{ gridColumn: '1 / -1' }}>
          <label className={s.label} htmlFor="f-category">
            Categoria <span className={s.req}>*</span>
          </label>
          <select id="f-category" className={s.select}
            value={form.catId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('catId', e.target.value)}>
            <option value="">Selecione a categoria…</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
          <span className={s.hint}>A categoria determina o prefixo do código e os campos técnicos.</span>
        </div>

        <div className={s.formRow}>
          <div className={s.formGroup}>
            <label className={s.label} htmlFor="f-name">
              Nome do Ativo <span className={s.req}>*</span>
            </label>
            <input id="f-name" type="text" className={s.input}
              placeholder="Ex.: Ar-condicionado Sala A"
              value={form.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('name', e.target.value)} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Código Gerado</label>
            <div className={s.codeDisplay}>{codePreview}</div>
            <span className={s.hint}>Gerado automaticamente após salvar.</span>
          </div>
        </div>
      </Section>

      {/* ── Section 2: Localização & Responsável ── */}
      <Section num={2} title="Localização e Responsável">
        <div className={s.formRow}>
          <div className={s.formGroup}>
            <label className={s.label} htmlFor="f-location">
              Setor / Localização <span className={s.req}>*</span>
            </label>
            <select id="f-location" className={s.select}
              value={form.location}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('location', e.target.value)}>
              <option value="">Selecione…</option>
              {LOCATIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
              <option value="__custom__">✏️ Digitar outro…</option>
            </select>
            {form.location === '__custom__' && (
              <input type="text" className={s.input} style={{ marginTop: 6 }}
                placeholder="Digite a localização…"
                value={form.customLocation}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('customLocation', e.target.value)} />
            )}
          </div>
          <div className={s.formGroup}>
            <label className={s.label} htmlFor="f-loc-detail">Detalhe da Localização</label>
            <input id="f-loc-detail" type="text" className={s.input}
              placeholder="Ex.: Mesa 3, Parede Norte…"
              value={form.locationDetail}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('locationDetail', e.target.value)} />
          </div>
        </div>

        <div className={s.formRow}>
          <div className={s.formGroup}>
            <label className={s.label}>Responsável</label>
            <input type="text" className={s.input}
              placeholder="Nome do responsável…"
              value={form.responsible}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('responsible', e.target.value)} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Data de Aquisição</label>
            <input type="date" className={s.input}
              value={form.acquisition}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('acquisition', e.target.value)} />
          </div>
        </div>

        <div className={s.formRow}>
          <div className={s.formGroup}>
            <label className={s.label}>Valor de Aquisição (R$)</label>
            <input type="number" className={s.input} step="0.01" placeholder="0,00"
              value={form.value}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('value', e.target.value)} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Status <span className={s.req}>*</span></label>
            <select className={s.select}
              value={form.status}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('status', e.target.value as AssetStatus)}>
              <option value="ativo">🟢 Ativo</option>
              <option value="manutencao">🔧 Em Manutenção</option>
              <option value="avariado">🔴 Avariado</option>
              <option value="inativo">⚫ Inativo</option>
            </select>
          </div>
        </div>
      </Section>

      {/* ── Section 3: Dynamic (category-specific) fields ── */}
      {selectedCat && selectedCat.fields.length > 0 && (
        <Section num={dynSectionNum ?? 3} title={`Dados Técnicos — ${selectedCat.name}`}>
          {selectedCat.maintenanceConfig.notes && (
            <p className={s.maintHint}>💡 {selectedCat.maintenanceConfig.notes}</p>
          )}
          <div className={s.dynGrid}>
            {selectedCat.fields.map(field => (
              <div key={field.key} className={field.type === 'textarea' ? s.spanFull : ''}>
                <DynField
                  field={field}
                  value={form.dynamicData[field.key]}
                  onChange={handleDynChange}
                />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Section Obs ── */}
      <Section num={obsSectionNum} title="Observações">
        <div className={s.formGroup}>
          <label className={s.label}>Notas Gerais</label>
          <textarea className={s.textarea} rows={3}
            placeholder="Observações adicionais sobre o ativo…"
            value={form.notes}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setField('notes', e.target.value)} />
        </div>
      </Section>

      {/* ── Footer ── */}
      <div className={s.footer}>
        <Link to="/ativos" className={s.btnSecondary}>Cancelar</Link>
        <button className={s.btnPrimary} disabled={saving} onClick={handleSave}>
          {saving ? 'Salvando…' : isEdit ? 'Salvar Alterações' : 'Salvar Ativo'}
        </button>
      </div>

      {saving && (
        <div className={s.overlay}>
          <div className={s.overlayContent}>
            <div className={s.spinner} />
            <p>{isEdit ? 'Atualizando ativo…' : 'Gerando código e salvando…'}</p>
          </div>
        </div>
      )}

    </div>
  )
}

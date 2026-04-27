import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams }                           from 'react-router-dom'
import { useSuppliers, useCategories }               from '@/hooks/useData'
import { useStore, selectCategoryMap }               from '@/store/useStore'
import { createSupplier, updateSupplier, deleteSupplier, getSupplierById } from '@/lib/db'
import { SupplierTypeBadge }                         from '@/components/ui/Badge'
import type { Category, Supplier, SupplierType }     from '@/types'
import s from './SuppliersPage.module.css'

// ── Typed form state ──────────────────────────────────
interface SupplierFormState {
  name:        string
  type:        SupplierType
  cnpj:        string
  contact:     string
  phone:       string
  email:       string
  notes:       string
  active:      boolean
  categoryIds: string[]
}

const EMPTY_SUPPLIER: SupplierFormState = {
  name: '', type: 'purchase', cnpj: '', contact: '',
  phone: '', email: '', notes: '', active: true, categoryIds: [],
}

// ── Supplier form modal ───────────────────────────────
interface SupplierFormProps {
  editId:      string | null
  presetCatId: string
  categories:  Category[]
  onClose:     () => void
  onSaved:     (supplier: Supplier) => void
}

function SupplierForm({ editId, presetCatId, categories, onClose, onSaved }: SupplierFormProps) {
  const [form,    setForm]    = useState<SupplierFormState>({
    ...EMPTY_SUPPLIER,
    categoryIds: presetCatId ? [presetCatId] : [],
  })
  const [saving,  setSaving]  = useState<boolean>(false)
  const [loaded,  setLoaded]  = useState<boolean>(!editId)

  function setField<K extends keyof SupplierFormState>(key: K, val: SupplierFormState[K]): void {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  function toggleCat(id: string): void {
    setForm(prev => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(id)
        ? prev.categoryIds.filter(x => x !== id)
        : [...prev.categoryIds, id],
    }))
  }

  // Load edit data — correctly uses useEffect, not useState
  useEffect(() => {
    if (!editId) return
    getSupplierById(editId).then(supplier => {
      if (!supplier) return
      setForm({
        name:        supplier.name,
        type:        supplier.type,
        cnpj:        supplier.cnpj     ?? '',
        contact:     supplier.contact  ?? '',
        phone:       supplier.phone    ?? '',
        email:       supplier.email    ?? '',
        notes:       supplier.notes    ?? '',
        active:      supplier.active,
        categoryIds: supplier.categoryIds,
      })
      setLoaded(true)
    })
  }, [editId])

  async function handleSave(): Promise<void> {
    if (!form.name.trim()) return alert('Nome é obrigatório.')
    setSaving(true)
    try {
      const data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'> = {
        name:        form.name.trim(),
        type:        form.type,
        cnpj:        form.cnpj     || undefined,
        contact:     form.contact  || undefined,
        phone:       form.phone    || undefined,
        email:       form.email    || undefined,
        notes:       form.notes    || undefined,
        active:      form.active,
        categoryIds: form.categoryIds,
      }
      if (editId) {
        await updateSupplier(editId, data)
        onSaved({ id: editId, ...data })
      } else {
        const id = await createSupplier(data)
        onSaved({ id, ...data })
      }
    } catch (err) {
      alert('Erro: ' + String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className={s.overlay}>
        <div className={s.modal}>
          <p style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Carregando…</p>
        </div>
      </div>
    )
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <span className={s.modalTitle}>{editId ? 'Editar Fornecedor' : 'Novo Fornecedor'}</span>
          <button className={s.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={s.modalBody}>
          <div className={s.formGroup}>
            <label className={s.label}>Nome <span className={s.req}>*</span></label>
            <input className={s.input} placeholder="Razão social ou nome fantasia"
              value={form.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('name', e.target.value)} />
          </div>

          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Tipo <span className={s.req}>*</span></label>
              <select className={s.select}
                value={form.type}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('type', e.target.value as SupplierType)}>
                <option value="purchase">🛒 Compras</option>
                <option value="service">🔧 Serviços</option>
                <option value="both">🏢 Compras + Serviços</option>
              </select>
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>CNPJ</label>
              <input className={s.input} placeholder="00.000.000/0001-00"
                value={form.cnpj}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('cnpj', e.target.value)} />
            </div>
          </div>

          <div className={s.formRow}>
            <div className={s.formGroup}>
              <label className={s.label}>Contato</label>
              <input className={s.input} placeholder="Nome do responsável"
                value={form.contact}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('contact', e.target.value)} />
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>Telefone</label>
              <input className={s.input} placeholder="(00) 00000-0000"
                value={form.phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('phone', e.target.value)} />
            </div>
          </div>

          <div className={s.formGroup}>
            <label className={s.label}>E-mail</label>
            <input type="email" className={s.input} placeholder="contato@empresa.com"
              value={form.email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('email', e.target.value)} />
          </div>

          <div className={s.formGroup}>
            <label className={s.label}>Categorias atendidas</label>
            <div className={s.catsGrid}>
              {categories.map(cat => (
                <label key={cat.id} className={`${s.catLabel} ${form.categoryIds.includes(cat.id) ? s.catChecked : ''}`}>
                  <input type="checkbox"
                    checked={form.categoryIds.includes(cat.id)}
                    onChange={() => toggleCat(cat.id)} />
                  {cat.icon} {cat.name}
                </label>
              ))}
            </div>
          </div>

          <div className={s.formGroup}>
            <label className={s.label}>Observações</label>
            <textarea className={s.textarea} placeholder="Condições, prazo de entrega…"
              value={form.notes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setField('notes', e.target.value)} />
          </div>

          <label className={s.checkRow}>
            <input type="checkbox"
              checked={form.active}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('active', e.target.checked)} />
            Fornecedor ativo
          </label>
        </div>

        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={s.btnPrimary} disabled={saving} onClick={handleSave}>
            {saving ? 'Salvando…' : editId ? 'Salvar alterações' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// SuppliersPage
// ══════════════════════════════════════════════════════
export default function SuppliersPage() {
  const [params]               = useSearchParams()
  const catFilter              = params.get('cat') ?? ''
  const { suppliers, loading } = useSuppliers({ categoryId: catFilter || undefined })
  const { categories }         = useCategories()
  const categoryMap            = useStore(selectCategoryMap)
  const { upsertSupplier, removeSupplier } = useStore()

  const [search,    setSearch]    = useState<string>('')
  const [typeSel,   setTypeSel]   = useState<SupplierType | ''>('')
  const [activeSel, setActiveSel] = useState<'' | 'true' | 'false'>('')
  const [formId,    setFormId]    = useState<string | 'new' | null>(null)

  const editId     = formId === 'new' ? null : formId
  const contextCat = catFilter ? categoryMap[catFilter] : null

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return suppliers.filter(supplier => {
      if (typeSel   && supplier.type !== typeSel)                               return false
      if (activeSel && String(supplier.active !== false) !== activeSel)         return false
      if (q && !supplier.name.toLowerCase().includes(q)
            && !(supplier.contact ?? '').toLowerCase().includes(q))             return false
      return true
    })
  }, [suppliers, search, typeSel, activeSel])

  const handleSaved = useCallback((supplier: Supplier): void => {
    upsertSupplier(supplier)
    setFormId(null)
  }, [upsertSupplier])

  async function handleDelete(supplier: Supplier): Promise<void> {
    if (!confirm(`Excluir "${supplier.name}"?`)) return
    await deleteSupplier(supplier.id)
    removeSupplier(supplier.id)
  }

  return (
    <div className={s.page}>

      <div className={s.titleRow}>
        <h2 className={s.pageTitle}>🏢 Fornecedores</h2>
        <button className={s.btnPrimary} onClick={() => setFormId('new')}>+ Novo Fornecedor</button>
      </div>

      {contextCat && (
        <div className={s.catContext}>
          <span>{contextCat.icon}</span>
          <span>Fornecedores de <strong>{contextCat.name}</strong></span>
          <a href="/ativos/fornecedores" className={s.clearLink}>Ver todos</a>
        </div>
      )}

      <div className={s.filterRow}>
        <input className={s.filterInput} placeholder="Pesquisar por nome ou contato…"
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} />
        <select className={s.filterSelect}
          value={typeSel}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTypeSel(e.target.value as SupplierType | '')}>
          <option value="">Todos os tipos</option>
          <option value="purchase">🛒 Compras</option>
          <option value="service">🔧 Serviços</option>
          <option value="both">🏢 Ambos</option>
        </select>
        <select className={s.filterSelect}
          value={activeSel}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setActiveSel(e.target.value as typeof activeSel)}>
          <option value="">Todos</option>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
        </select>
      </div>

      <p className={s.resultCount}>{filtered.length} fornecedor{filtered.length !== 1 ? 'es' : ''}</p>

      {loading ? (
        <p className={s.loadMsg}>Carregando fornecedores…</p>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>🏢</div>
          <h3>Nenhum fornecedor encontrado</h3>
        </div>
      ) : (
        <div className={s.grid}>
          {filtered.map(supplier => (
            <div key={supplier.id} className={`${s.card} ${supplier.active === false ? s.inactive : ''}`}>
              <div className={s.cardHeader}>
                <div>
                  <div className={s.cardName}>{supplier.name}</div>
                  {supplier.contact && <div className={s.cardContact}>👤 {supplier.contact}</div>}
                </div>
                <SupplierTypeBadge type={supplier.type} />
              </div>

              {supplier.categoryIds.length > 0 && (
                <div className={s.catTags}>
                  {supplier.categoryIds.map(id => categoryMap[id] && (
                    <span key={id} className={s.catTag}>{categoryMap[id].icon} {categoryMap[id].name}</span>
                  ))}
                </div>
              )}

              <div className={s.cardInfo}>
                {supplier.phone && <span>📞 {supplier.phone}</span>}
                {supplier.email && <span>✉️ {supplier.email}</span>}
                {supplier.cnpj  && <span>🏛 {supplier.cnpj}</span>}
              </div>

              <div className={s.cardActions}>
                <button className={s.btnAction} onClick={() => setFormId(supplier.id)}>✏️ Editar</button>
                <button className={`${s.btnAction} ${s.btnDel}`} onClick={() => handleDelete(supplier)}>🗑️ Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formId !== null && (
        <SupplierForm
          editId={editId}
          presetCatId={catFilter}
          categories={categories}
          onClose={() => setFormId(null)}
          onSaved={handleSaved}
        />
      )}

    </div>
  )
}

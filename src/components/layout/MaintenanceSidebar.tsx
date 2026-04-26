import { useState, useMemo }               from 'react'
import { NavLink, Link, useSearchParams }  from 'react-router-dom'
import { useStore }                        from '@/store/useStore'
import { useCategories }                   from '@/hooks/useData'
import type { Category }                   from '@/types'
import s                                   from './MaintenanceSidebar.module.css'

function loadExpanded(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem('msb-exp') || '{}') }
  catch { return {} }
}

function saveExpanded(state: Record<string, boolean>) {
  localStorage.setItem('msb-exp', JSON.stringify(state))
}

export default function MaintenanceSidebar() {
  useCategories()
  const rawCategories = useStore(st => st.categories)

  const categories = useMemo(
    () => Array.from(new Map(rawCategories.map(c => [c.id, c])).values()),
    [rawCategories]
  )

  const [expanded, setExpanded] = useState<Record<string, boolean>>(loadExpanded)

  function toggleCat(id: string) {
    const next = { ...expanded, [id]: !expanded[id] }
    setExpanded(next)
    saveExpanded(next)
  }

  return (
    <aside className={s.sidebar} aria-label="Navegação de ativos">

      {/* ── Back to main menu ── */}
      <div className={s.header}>
        <Link to="/" className={s.backLink}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12,19 5,12 12,5"/>
          </svg>
          <span>Menu principal</span>
        </Link>
        <span className={s.moduleTitle}>Patrimônio &amp; Ativos</span>
      </div>

      {/* ── Category accordion ── */}
      <nav className={s.nav}>
        <div className={s.sectionLabel}>Categorias</div>
        {categories.length === 0 ? (
          <p className={s.loading}>Carregando categorias…</p>
        ) : (
          categories.map(cat => (
            <CategoryItem
              key={cat.id}
              category={cat}
              isOpen={!!expanded[cat.id]}
              onToggle={() => toggleCat(cat.id)}
            />
          ))
        )}

        {/* ── Utility links ── */}
        <div className={s.divider} />
        <NavLink
          to="/ativos/fornecedores"
          className={({ isActive }) => `${s.utilLink} ${isActive ? s.utilActive : ''}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
          </svg>
          Fornecedores
        </NavLink>
        <NavLink
          to="/ativos/inventario"
          className={({ isActive }) => `${s.utilLink} ${isActive ? s.utilActive : ''}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27,6.96 12,12.01 20.73,6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
          Inventário
        </NavLink>
      </nav>

      {/* ── Add asset button ── */}
      <div className={s.footer}>
        <NavLink to="/ativos/novo" className={s.addBtn}>
          + Novo Ativo
        </NavLink>
      </div>
    </aside>
  )
}

interface CategoryItemProps { category: Category; isOpen: boolean; onToggle: () => void }

function CategoryItem({ category, isOpen, onToggle }: CategoryItemProps) {
  const [params] = useSearchParams()
  const activeCat = params.get('cat')
  const isActive  = activeCat === category.id

  return (
    <div className={`${s.cat} ${isActive ? s.catActive : ''}`}>
      <button
        className={`${s.catBtn} ${isOpen ? s.open : ''}`}
        onClick={onToggle}
        title={category.name}
      >
        <span className={s.dot} style={{ background: category.color }} />
        <span className={s.catIcon}>{category.icon}</span>
        <span className={s.catName}>{category.name}</span>
        <span className={s.count}>{category.assetCount}</span>
        <span className={s.chevron}>▾</span>
      </button>

      {isOpen && (
        <div className={s.sub}>
          <SubItem to={`/ativos?cat=${category.id}`}                  label="Itens"       />
          <SubItem to={`/ativos/fornecedores?cat=${category.id}`}     label="Fornecedores"/>
          <SubItem to={`/ativos/manutencao?cat=${category.id}`}       label="Manutenções" />
        </div>
      )}
    </div>
  )
}

function SubItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `${s.subItem} ${isActive ? s.subActive : ''}`}
    >
      {label}
    </NavLink>
  )
}

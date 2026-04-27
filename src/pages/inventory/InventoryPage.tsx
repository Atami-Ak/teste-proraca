/**
 * InventoryPage.tsx
 *
 * Converted from: ativos/inventario.html + js/modules/app-inventario.js
 *
 * Logic preserved:
 *  - Sessions list → create new → active session view (two-panel pattern)
 *  - Scope: all / category / location
 *  - Mark each asset: found ✅ / missing ❌ / issue ⚠️ (with note modal)
 *  - Real-time counters + progress bar
 *  - Close session saves summary
 */

import { useState, useEffect, useMemo } from 'react'
import { useCategories, useAssets } from '@/hooks/useData'
import { useStore } from '@/store/useStore'
import {
  getInventorySessions, getInventorySession,
  createInventorySession, markInventoryItem, closeInventorySession,
  fmtDate,
  type InventorySession, type ItemAuditStatus, type InventoryScope,
} from '@/lib/db'
import type { Asset, Category } from '@/types'
import s from './InventoryPage.module.css'

// ─────────────────────────────────────────────────────
// Sessions list panel
// ─────────────────────────────────────────────────────
interface SessionsViewProps {
  sessions: InventorySession[]
  loading:  boolean
  onOpen:   (id: string) => void
  onNew:    () => void
}

function SessionsView({ sessions, loading, onOpen, onNew }: SessionsViewProps) {
  return (
    <div className={s.page}>
      <div className={s.titleRow}>
        <h1 className={s.pageTitle}>Inventário de Ativos</h1>
        <button className={s.btnPrimary} onClick={onNew}>+ Nova Sessão</button>
      </div>

      {loading ? (
        <div className={s.loadingMsg}>Carregando sessões…</div>
      ) : sessions.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>📋</div>
          <h3>Nenhuma sessão de inventário</h3>
          <p>Clique em "+ Nova Sessão" para iniciar o primeiro inventário.</p>
        </div>
      ) : (
        <div className={s.sessionList}>
          {sessions.map(sess => {
            const results = sess.results ?? {}
            const found   = Object.values(results).filter(r => r.status === 'found').length
            const missing = Object.values(results).filter(r => r.status === 'missing').length
            const issue   = Object.values(results).filter(r => r.status === 'issue').length
            const total   = Object.keys(results).length
            const isOpen  = sess.status === 'em_andamento'

            return (
              <div key={sess.id} className={s.sessionCard} onClick={() => onOpen(sess.id)}>
                <div className={s.sessionIcon}>{isOpen ? '🔄' : '📋'}</div>
                <div className={s.sessionInfo}>
                  <div className={s.sessionName}>{sess.name || 'Inventário'}</div>
                  <div className={s.sessionMeta}>
                    {fmtDate(sess.createdAt)}
                    {sess.responsible ? ` · 👤 ${sess.responsible}` : ''}
                    {total > 0 ? ` · ${total} registros` : ''}
                  </div>
                  {total > 0 && (
                    <div className={s.sessionCounters}>
                      <span className={`${s.pill} ${s.pillFound}`}>✅ {found}</span>
                      <span className={`${s.pill} ${s.pillMissing}`}>❌ {missing}</span>
                      <span className={`${s.pill} ${s.pillIssue}`}>⚠️ {issue}</span>
                    </div>
                  )}
                </div>
                <div>
                  <span className={isOpen ? s.badgeOpen : s.badgeDone}>
                    {isOpen ? '🔄 Em Andamento' : '✅ Concluída'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Active session panel
// ─────────────────────────────────────────────────────
interface ActiveViewProps {
  session:    InventorySession
  assets:     Asset[]
  categories: Category[]
  onBack:     () => void
  onClose:    (sess: InventorySession) => void
  onMark:     (assetId: string, status: ItemAuditStatus, note?: string) => Promise<void>
  localSess:  InventorySession
}

function ActiveView({ session, assets, categories, onBack, onClose, onMark, localSess }: ActiveViewProps) {
  const [filter, setFilter]             = useState<string>('all')
  const [search, setSearch]             = useState<string>('')
  const [issueAssetId, setIssueAssetId] = useState<string | null>(null)
  const [issueNote, setIssueNote]       = useState<string>('')

  const catName = categories.find(c => c.id === session.scopeValue)?.name ?? '—'
  const scopeText =
    session.scopeType === 'category' ? `Categoria: ${catName}` :
    session.scopeType === 'location' ? `Local: ${session.scopeValue}` :
    'Todos os ativos'

  // Scope assets
  const scopedAssets = useMemo(() => {
    if (session.scopeType === 'category' && session.scopeValue) {
      return assets.filter(a => a.categoryId === session.scopeValue)
    }
    if (session.scopeType === 'location' && session.scopeValue) {
      return assets.filter(a => a.location === session.scopeValue)
    }
    return assets
  }, [assets, session.scopeType, session.scopeValue])

  const results  = localSess.results ?? {}
  const isClosed = localSess.status === 'concluida'

  // Counters
  let cFound = 0, cMissing = 0, cIssue = 0, cPending = 0
  scopedAssets.forEach(a => {
    const st = results[a.id]?.status
    if (st === 'found')   cFound++
    else if (st === 'missing') cMissing++
    else if (st === 'issue')   cIssue++
    else cPending++
  })
  const done = cFound + cMissing + cIssue
  const pct  = scopedAssets.length > 0 ? Math.round((done / scopedAssets.length) * 100) : 0

  const visible = scopedAssets.filter(a => {
    const st: ItemAuditStatus | 'pending' = (results[a.id]?.status as ItemAuditStatus | undefined) ?? 'pending'
    if (filter === 'found'   && st !== 'found')   return false
    if (filter === 'missing' && st !== 'missing') return false
    if (filter === 'issue'   && st !== 'issue')   return false
    if (filter === 'pending' && st !== 'pending') return false
    if (search) {
      const hay = `${a.code ?? ''} ${a.name}`.toLowerCase()
      if (!hay.includes(search.toLowerCase())) return false
    }
    return true
  })

  function handleMarkIssue(assetId: string) {
    setIssueAssetId(assetId)
    setIssueNote('')
  }

  async function confirmIssue() {
    if (!issueAssetId) return
    await onMark(issueAssetId, 'issue', issueNote.trim())
    setIssueAssetId(null)
  }

  return (
    <div className={s.page}>

      {/* Header */}
      <div className={s.activeHeader}>
        <button className={s.backBtn} onClick={onBack}>← Voltar</button>
        <div>
          <h2 className={s.activeTitle}>{localSess.name || 'Inventário'}</h2>
          <div className={s.activeMeta}>{fmtDate(session.createdAt)} · {scopeText}{session.responsible ? ` · 👤 ${session.responsible}` : ''}</div>
        </div>
        {!isClosed && (
          <button className={s.btnDanger} onClick={() => onClose(localSess)}>Encerrar</button>
        )}
      </div>

      {/* Counters + progress */}
      <div className={s.counters}>
        <div className={`${s.counter} ${s.ctFound}`}><span className={s.ctVal}>{cFound}</span><span className={s.ctLbl}>Encontrados</span></div>
        <div className={`${s.counter} ${s.ctMissing}`}><span className={s.ctVal}>{cMissing}</span><span className={s.ctLbl}>Não encontrados</span></div>
        <div className={`${s.counter} ${s.ctIssue}`}><span className={s.ctVal}>{cIssue}</span><span className={s.ctLbl}>Com problema</span></div>
        <div className={`${s.counter} ${s.ctPending}`}><span className={s.ctVal}>{cPending}</span><span className={s.ctLbl}>Pendentes</span></div>
      </div>
      <div className={s.pbarWrap}>
        <div className={s.pbar} style={{ width: `${pct}%` }} />
      </div>
      <div className={s.pbarLabel}>{pct}% verificado ({done}/{scopedAssets.length})</div>

      {/* Filters */}
      <div className={s.filterRow}>
        <input className={s.filterInput} placeholder="Buscar código ou nome…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className={s.filterSelect} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">Todos</option>
          <option value="pending">Pendentes</option>
          <option value="found">Encontrados</option>
          <option value="missing">Não encontrados</option>
          <option value="issue">Com problema</option>
        </select>
      </div>

      {/* Item list */}
      {visible.length === 0 ? (
        <div className={s.empty}><div className={s.emptyIcon}>🔍</div><h3>Nenhum ativo encontrado</h3></div>
      ) : (
        <div className={s.itemList}>
          {visible.map(a => {
            const r  = results[a.id]
            const st = r?.status ?? 'pending'
            return (
              <div key={a.id} className={`${s.invItem} ${s[`st_${st}`]}`}>
                <div className={s.itemInfo}>
                  {a.code && <div className={s.itemCode}>{a.code}</div>}
                  <div className={s.itemName}>{a.name}</div>
                  <div className={s.itemLoc}>📍 {a.location || '—'}</div>
                  {r?.note && <div className={s.itemNote}>⚠️ {r.note}</div>}
                </div>
                {!isClosed ? (
                  <div className={s.markBtns}>
                    <button
                      className={`${s.markBtn} ${s.markFound} ${st === 'found' ? s.active : ''}`}
                      onClick={() => onMark(a.id, 'found')}
                      title="Encontrado"
                    >✅</button>
                    <button
                      className={`${s.markBtn} ${s.markMissing} ${st === 'missing' ? s.active : ''}`}
                      onClick={() => onMark(a.id, 'missing')}
                      title="Não encontrado"
                    >❌</button>
                    <button
                      className={`${s.markBtn} ${s.markIssue} ${st === 'issue' ? s.active : ''}`}
                      onClick={() => handleMarkIssue(a.id)}
                      title="Problema"
                    >⚠️</button>
                  </div>
                ) : (
                  <div>
                    {st === 'found'   && <span className={s.badgeDone}>✅ Encontrado</span>}
                    {st === 'missing' && <span className={s.badgeMissing}>❌ Não encontrado</span>}
                    {st === 'issue'   && <span className={s.badgeIssue}>⚠️ Problema</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Issue note modal */}
      {issueAssetId && (
        <div className={s.overlay}>
          <div className={s.modal}>
            <div className={s.modalHeader}>
              <span className={s.modalTitle}>⚠️ Descrever Problema</span>
              <button className={s.closeBtn} onClick={() => setIssueAssetId(null)}>×</button>
            </div>
            <div className={s.modalBody}>
              <label className={s.label}>Descrição do problema (opcional)</label>
              <textarea className={s.textarea} rows={3}
                placeholder="Ex.: equipamento danificado, número de série errado…"
                value={issueNote} onChange={e => setIssueNote(e.target.value)} />
              <div className={s.modalFooter}>
                <button className={s.btnSecondary} onClick={() => setIssueAssetId(null)}>Cancelar</button>
                <button className={s.btnWarning} onClick={confirmIssue}>Confirmar ⚠️</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────
// New session modal
// ─────────────────────────────────────────────────────
interface NewSessionForm {
  name:      string
  scopeType: InventoryScope
  scopeVal:  string
  resp:      string
}

interface NewSessionModalProps {
  categories: Category[]
  locations:  string[]
  onCancel:   () => void
  onCreate:   (data: { name: string; scopeType: InventoryScope; scopeValue: string | null; responsible: string | null }) => Promise<void>
}

function NewSessionModal({ categories, locations, onCancel, onCreate }: NewSessionModalProps) {
  const today = new Date().toLocaleDateString('pt-BR')

  const [form,   setForm]   = useState<NewSessionForm>({
    name: `Inventário ${today}`, scopeType: 'all', scopeVal: '', resp: '',
  })
  const [saving, setSaving] = useState<boolean>(false)

  function setField<K extends keyof NewSessionForm>(key: K, val: NewSessionForm[K]): void {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  async function handleCreate(): Promise<void> {
    if (!form.name.trim()) { alert('Informe o nome da sessão.'); return }
    if (form.scopeType !== 'all' && !form.scopeVal) { alert('Selecione o escopo.'); return }
    setSaving(true)
    try {
      await onCreate({
        name:        form.name.trim(),
        scopeType:   form.scopeType,
        scopeValue:  form.scopeVal  || null,
        responsible: form.resp.trim() || null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <span className={s.modalTitle}>Nova Sessão de Inventário</span>
          <button className={s.closeBtn} onClick={onCancel}>×</button>
        </div>
        <div className={s.modalBody}>
          <div className={s.formGroup}>
            <label className={s.label}>Nome da sessão</label>
            <input className={s.input}
              value={form.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('name', e.target.value)} />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Escopo</label>
            <select className={s.select}
              value={form.scopeType}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setForm(prev => ({ ...prev, scopeType: e.target.value as InventoryScope, scopeVal: '' }))
              }}>
              <option value="all">Todos os ativos</option>
              <option value="category">Por categoria</option>
              <option value="location">Por localização</option>
            </select>
          </div>
          {form.scopeType === 'category' && (
            <div className={s.formGroup}>
              <label className={s.label}>Categoria</label>
              <select className={s.select}
                value={form.scopeVal}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('scopeVal', e.target.value)}>
                <option value="">Selecione…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          )}
          {form.scopeType === 'location' && (
            <div className={s.formGroup}>
              <label className={s.label}>Localização</label>
              <select className={s.select}
                value={form.scopeVal}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('scopeVal', e.target.value)}>
                <option value="">Selecione…</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}
          <div className={s.formGroup}>
            <label className={s.label}>Responsável</label>
            <input className={s.input} placeholder="Nome do responsável…"
              value={form.resp}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('resp', e.target.value)} />
          </div>
          <div className={s.modalFooter}>
            <button className={s.btnSecondary} onClick={onCancel}>Cancelar</button>
            <button className={s.btnPrimary} disabled={saving} onClick={handleCreate}>
              {saving ? 'Criando…' : 'Iniciar Inventário'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════
// InventoryPage — root component
// ════════════════════════════════════════════════════
export default function InventoryPage() {
  useCategories()
  useAssets()
  const categories = useStore(s => s.categories)
  const assets     = useStore(s => s.assets)

  const [sessions,     setSessions]     = useState<InventorySession[]>([])
  const [activeSession, setActiveSession] = useState<InventorySession | null>(null)
  const [localSession,  setLocalSession]  = useState<InventorySession | null>(null)
  const [showNew,      setShowNew]      = useState(false)
  const [loading,      setLoading]      = useState(true)

  // Unique locations from loaded assets
  const locations = useMemo(() =>
    [...new Set(assets.map(a => a.location).filter(Boolean))].sort() as string[],
    [assets]
  )

  useEffect(() => {
    getInventorySessions().then(ss => { setSessions(ss); setLoading(false) })
  }, [])

  async function openSession(id: string) {
    const sess = await getInventorySession(id)
    if (!sess) return
    setActiveSession(sess)
    setLocalSession(sess)
  }

  async function handleMark(assetId: string, status: ItemAuditStatus, note = '') {
    if (!localSession || localSession.status === 'concluida') return
    await markInventoryItem(localSession.id, assetId, status, note)
    setLocalSession(prev => {
      if (!prev) return prev
      return {
        ...prev,
        results: { ...prev.results, [assetId]: { status, note, markedAt: new Date().toISOString() } },
      }
    })
  }

  async function handleClose(sess: InventorySession) {
    const results = sess.results ?? {}
    const scoped  = getScoped(sess)
    const total   = scoped.length
    const done    = Object.keys(results).length
    const pending = total - done

    const msg = pending > 0
      ? `Ainda há ${pending} ativo(s) sem verificação.\nDeseja encerrar mesmo assim?`
      : `Todos os ${total} ativos foram verificados.\nEncerrar inventário?`

    if (!confirm(msg)) return

    const summary = {
      total,
      found:   Object.values(results).filter(r => r.status === 'found').length,
      missing: Object.values(results).filter(r => r.status === 'missing').length,
      issue:   Object.values(results).filter(r => r.status === 'issue').length,
      closedBy: 'user',
    }
    await closeInventorySession(sess.id, summary)
    setLocalSession(prev => prev ? { ...prev, status: 'concluida' } : prev)
    setSessions(await getInventorySessions())
    alert('Inventário encerrado com sucesso!')
  }

  function getScoped(sess: InventorySession): Asset[] {
    if (sess.scopeType === 'category' && sess.scopeValue) return assets.filter(a => a.categoryId === sess.scopeValue)
    if (sess.scopeType === 'location' && sess.scopeValue) return assets.filter(a => a.location === sess.scopeValue)
    return assets
  }

  async function handleCreate(data: { name: string; scopeType: InventoryScope; scopeValue: string | null; responsible: string | null }) {
    const id = await createInventorySession({ ...data, createdBy: 'user' })
    setShowNew(false)
    const [sess, all] = await Promise.all([getInventorySession(id), getInventorySessions()])
    setSessions(all)
    if (sess) { setActiveSession(sess); setLocalSession(sess) }
  }

  if (activeSession && localSession) {
    return (
      <>
        <ActiveView
          session={activeSession}
          assets={assets}
          categories={categories}
          localSess={localSession}
          onBack={() => { setActiveSession(null); setLocalSession(null) }}
          onClose={handleClose}
          onMark={handleMark}
        />
      </>
    )
  }

  return (
    <>
      <SessionsView
        sessions={sessions}
        loading={loading}
        onOpen={openSession}
        onNew={() => setShowNew(true)}
      />
      {showNew && (
        <NewSessionModal
          categories={categories}
          locations={locations}
          onCancel={() => setShowNew(false)}
          onCreate={handleCreate}
        />
      )}
    </>
  )
}

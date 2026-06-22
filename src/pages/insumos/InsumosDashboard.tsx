import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import { escutarContagensInsumos } from '@/lib/db-insumos'
import type { ContagemInsumos } from '@/types/insumos'
import s from './InsumosDashboard.module.css'

// ── Icons ─────────────────────────────────────────────────────────────────────
function IcClipboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    </svg>
  )
}
function IcPackage() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  )
}
function IcHistory() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
    </svg>
  )
}
function IcSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(val: unknown): string {
  if (!val) return '—'
  try {
    const ts = val as { toDate?: () => Date }
    const d  = typeof ts.toDate === 'function' ? ts.toDate() : new Date(val as string)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return '—' }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function InsumosDashboard() {
  const navigate   = useNavigate()
  const user       = useStore(st => st.user)
  const isAdmin    = user?.role === 'admin'
  const isSup      = user?.role === 'supervisor' || isAdmin

  const [contagens, setContagens] = useState<ContagemInsumos[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    const unsub = escutarContagensInsumos((data) => {
      setContagens(data)
      setLoading(false)
    }, 50)
    return unsub
  }, [])

  const ultimaContagem   = contagens[0]
  const totalContagens   = contagens.length
  const contagensHoje    = contagens.filter(c => c.data === new Date().toISOString().slice(0, 10)).length

  return (
    <div className={s.page}>
      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerText}>
          <div className={s.breadcrumb}>Estoque CD</div>
          <h1 className={s.title}>Inventário de Insumos</h1>
          <p className={s.subtitle}>
            Gestão de contagens, lotes e movimentações de insumos do CD
          </p>
        </div>
        <span className={s.badge}>CD</span>
      </div>

      {/* ── KPI strip ── */}
      <div className={s.kpiRow}>
        <div className={s.kpiCard}>
          <div className={s.kpiVal}>{loading ? '…' : totalContagens}</div>
          <div className={s.kpiLabel}>Contagens realizadas</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiVal}>{loading ? '…' : contagensHoje}</div>
          <div className={s.kpiLabel}>Contagens hoje</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiVal}>
            {loading ? '…' : ultimaContagem ? fmtDate(ultimaContagem.createdAt) : '—'}
          </div>
          <div className={s.kpiLabel}>Última contagem</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiVal}>
            {loading ? '…' : ultimaContagem?.usuario ?? '—'}
          </div>
          <div className={s.kpiLabel}>Último responsável</div>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div className={s.sectionTitle}>Ações rápidas</div>
      <div className={s.actionGrid}>
        <button className={`${s.actionCard} ${s.actionPrimary}`} onClick={() => navigate('/insumos/nova-contagem')}>
          <div className={s.actionIcon}><IcClipboard /></div>
          <div className={s.actionInfo}>
            <div className={s.actionLabel}>Nova Contagem</div>
            <div className={s.actionDesc}>Iniciar contagem de inventário de insumos com lotes</div>
          </div>
        </button>

        <button className={s.actionCard} onClick={() => navigate('/insumos/historico')}>
          <div className={s.actionIcon}><IcHistory /></div>
          <div className={s.actionInfo}>
            <div className={s.actionLabel}>Histórico</div>
            <div className={s.actionDesc}>Visualizar e editar contagens anteriores</div>
          </div>
        </button>

        {(isAdmin || isSup) && (
          <button className={s.actionCard} onClick={() => navigate('/insumos/cadastro')}>
            <div className={s.actionIcon}><IcPackage /></div>
            <div className={s.actionInfo}>
              <div className={s.actionLabel}>Cadastro de Insumos</div>
              <div className={s.actionDesc}>Gerenciar catálogo, lotes e fornecedores</div>
            </div>
          </button>
        )}

        {isAdmin && (
          <button className={s.actionCard} onClick={() => navigate('/insumos/cadastro')}>
            <div className={s.actionIcon}><IcSettings /></div>
            <div className={s.actionInfo}>
              <div className={s.actionLabel}>Configurações</div>
              <div className={s.actionDesc}>Categorias, estoque mínimo e parâmetros</div>
            </div>
          </button>
        )}
      </div>

      {/* ── Recent countings ── */}
      <div className={s.sectionTitle}>Contagens recentes</div>
      {loading ? (
        <div className={s.loadMsg}>Carregando…</div>
      ) : contagens.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>📋</div>
          <h3>Nenhuma contagem registrada</h3>
          <p>Clique em "Nova Contagem" para iniciar o primeiro inventário.</p>
          <button className={s.btnPrimary} onClick={() => navigate('/insumos/nova-contagem')}>
            + Nova Contagem
          </button>
        </div>
      ) : (
        <div className={s.contagensList}>
          {contagens.slice(0, 8).map(c => (
            <div
              key={c.docId}
              className={s.contagemCard}
              onClick={() => navigate(`/insumos/contagens/${c.docId}`)}
            >
              <div className={s.contagemId}>#{c.id}</div>
              <div className={s.contagemInfo}>
                <div className={s.contagemData}>{c.data ? c.data.split('-').reverse().join('/') : '—'}</div>
                <div className={s.contagemUsuario}>{c.usuario}</div>
              </div>
              <div className={s.contagemItens}>
                {Object.keys(c.estoque ?? {}).length} itens
              </div>
              <div className={s.contagemHora}>{c.hora}</div>
            </div>
          ))}
          {contagens.length > 8 && (
            <button className={s.btnLink} onClick={() => navigate('/insumos/historico')}>
              Ver todas as {contagens.length} contagens →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

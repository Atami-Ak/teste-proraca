// src/pages/dashboard/recomendacoes/RecommendationsPage.tsx
// Centro de Recomendações Prescritivas — Phase 3 ERP Roadmap

import { useState, useEffect, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { getDataHubSnapshot, invalidateDataHub } from '@/lib/db-data-hub'
import {
  HEALTH_META, MODULE_META, ALERT_SEVERITY_META, REC_PRIORITY_META,
  type DataHubSnapshot, type HubRecommendation, type HubAlert,
  type RecommendationPriority, type ModuleKey,
} from '@/types/data-hub'
import s from './RecommendationsPage.module.css'

// ── Tipos auxiliares ──────────────────────────────────────
type PriorityFilter = 'all' | RecommendationPriority
type ModuleFilter   = 'all' | ModuleKey

// ── Componente principal ──────────────────────────────────

export default function RecommendationsPage() {
  const [snap,      setSnap]      = useState<DataHubSnapshot | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [prioFlt,   setPrioFlt]   = useState<PriorityFilter>('all')
  const [modFlt,    setModFlt]    = useState<ModuleFilter>('all')

  const load = async (force = false) => {
    setLoading(true)
    if (force) invalidateDataHub()
    try {
      setSnap(await getDataHubSnapshot(force))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const recs: HubRecommendation[] = snap?.recommendations ?? []
  const alerts: HubAlert[]        = snap?.alerts ?? []

  const filteredRecs = recs.filter(r =>
    (prioFlt === 'all' || r.priority === prioFlt) &&
    (modFlt  === 'all' || r.module   === modFlt)
  )

  const filteredAlerts = alerts.filter(a =>
    modFlt === 'all' || a.module === modFlt
  )

  const generatedAgo = snap?.generatedAt
    ? Math.round((Date.now() - snap.generatedAt.getTime()) / 60_000)
    : null

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.topBand}>
        <div className={s.topBandInner}>
          <div>
            <h1 className={s.pageTitle}>💡 Centro de Recomendações</h1>
            <p className={s.pageSub}>
              Recomendações prescritivas geradas por análise cruzada de todos os módulos
            </p>
          </div>
          <button
            className={s.refreshBtn}
            onClick={() => void load(true)}
            disabled={loading}
          >
            {loading ? '…' : '↺ Recalcular'}
          </button>
        </div>
      </div>

      <div className={s.body}>

        {/* ── Meta do snapshot ── */}
        {snap && (
          <div className={s.hubMeta}>
            <span>
              Snapshot gerado {generatedAgo !== null
                ? generatedAgo < 2 ? 'agora' : `há ${generatedAgo} min`
                : '—'}
            </span>
            <span className={s.hubComputeTime}>
              Computado em {snap.computationMs}ms
            </span>
            <span>{snap.collectionsRead.length} coleções lidas</span>
          </div>
        )}

        {/* ── Filtros ── */}
        <div className={s.filterBar}>
          <span className={s.filterLabel}>Prioridade:</span>
          {(['all', 'high', 'medium', 'low'] as PriorityFilter[]).map(p => (
            <button
              key={p}
              className={`${s.filterBtn} ${prioFlt === p ? s.filterBtnActive : ''}`}
              onClick={() => setPrioFlt(p)}
            >
              {p === 'all' ? 'Todas' : REC_PRIORITY_META[p].label}
            </button>
          ))}

          <select
            className={s.moduleSelect}
            value={modFlt}
            onChange={e => setModFlt(e.target.value as ModuleFilter)}
          >
            <option value="all">Todos os módulos</option>
            {(Object.keys(MODULE_META) as ModuleKey[]).map(k => (
              <option key={k} value={k}>
                {MODULE_META[k].icon} {MODULE_META[k].label}
              </option>
            ))}
          </select>
        </div>

        {/* ── Recomendações ── */}
        <div>
          <div className={s.sectionTitle}>
            Recomendações Prescritivas
            <span className={s.sectionBadge}>{filteredRecs.length}</span>
          </div>

          {loading ? (
            <div className={s.skeletonGrid}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={s.skeleton} />
              ))}
            </div>
          ) : filteredRecs.length === 0 ? (
            <div className={s.emptyState}>
              <div className={s.emptyIcon}>✅</div>
              <div className={s.emptyText}>Nenhuma recomendação para os filtros selecionados.</div>
            </div>
          ) : (
            <div className={s.recGrid}>
              {filteredRecs.map(rec => (
                <RecCard key={rec.id} rec={rec} />
              ))}
            </div>
          )}
        </div>

        {/* ── Alertas Cross-Module ── */}
        <div>
          <div className={s.sectionTitle}>
            Alertas Operacionais
            <span className={s.sectionBadge} style={{ background: '#dc2626' }}>
              {filteredAlerts.length}
            </span>
          </div>

          <div className={s.alertsSection}>
            {loading ? (
              <div className={s.emptyState}>
                <div className={s.emptyText}>Carregando alertas…</div>
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className={s.emptyState}>
                <div className={s.emptyIcon}>🟢</div>
                <div className={s.emptyText}>Nenhum alerta ativo no momento.</div>
              </div>
            ) : (
              <div className={s.alertList}>
                {filteredAlerts.map(alert => (
                  <AlertRow key={alert.id} alert={alert} />
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── RecCard ───────────────────────────────────────────────

function RecCard({ rec }: { rec: HubRecommendation }) {
  const pm   = REC_PRIORITY_META[rec.priority]
  const modM = MODULE_META[rec.module]

  return (
    <div className={s.recCard}>
      <div
        className={s.recCardAccent}
        style={{ background: pm.color } as CSSProperties}
      />
      <div className={s.recCardTop}>
        <span
          className={s.recPriorityBadge}
          style={{ background: pm.bg, color: pm.color } as CSSProperties}
        >
          {pm.label}
        </span>
        <span className={s.recModuleBadge}>
          {modM.icon} {modM.label}
        </span>
        {rec.estimatedValue !== undefined && rec.estimatedUnit && (
          <span className={s.recEstimate}>
            {rec.estimatedUnit === 'BRL'
              ? `R$ ${rec.estimatedValue.toLocaleString('pt-BR')}`
              : `${rec.estimatedValue}${rec.estimatedUnit}`} est.
          </span>
        )}
      </div>

      <div className={s.recTitle}>{rec.title}</div>
      <div className={s.recDesc}>{rec.description}</div>

      <div className={s.recImpact}>{rec.impact}</div>

      <div className={s.recFooter}>
        <span className={s.recConfidence}>
          Confiança: {rec.confidence}%
        </span>
        {rec.actionPath ? (
          <Link to={rec.actionPath} className={s.recAction}>
            {rec.actionLabel ?? 'Ver →'}
          </Link>
        ) : null}
      </div>
    </div>
  )
}

// ── AlertRow ──────────────────────────────────────────────

function AlertRow({ alert }: { alert: HubAlert }) {
  const sev  = ALERT_SEVERITY_META[alert.severity]
  const modM = MODULE_META[alert.module]

  const ago = Math.max(0, Math.round((Date.now() - alert.createdAt.getTime()) / 60_000))
  const agoLabel = ago < 60 ? `${ago}min atrás` : `${Math.round(ago / 60)}h atrás`

  const inner = (
    <>
      <div
        className={s.alertSevIcon}
        style={{ background: sev.bg } as CSSProperties}
      >
        {HEALTH_META[
          alert.severity === 'critical' ? 'critical' :
          alert.severity === 'urgent'   ? 'critical' :
          alert.severity === 'attention'? 'attention' : 'good'
        ].icon}
      </div>

      <div className={s.alertBody}>
        <div className={s.alertTitle}>{alert.title}</div>
        <div className={s.alertDesc}>{alert.description}</div>
        <div className={s.alertMeta}>
          <span
            className={s.alertSevTag}
            style={{ background: sev.bg, color: sev.color } as CSSProperties}
          >
            {sev.label}
          </span>
          <span className={s.alertModTag}>{modM.icon} {modM.label}</span>
          <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{agoLabel}</span>
        </div>
      </div>

      {alert.actionPath && (
        <Link
          to={alert.actionPath}
          className={s.alertActionLink}
          onClick={e => e.stopPropagation()}
        >
          {alert.actionLabel ?? 'Ver →'}
        </Link>
      )}
    </>
  )

  if (alert.actionPath) {
    return (
      <Link to={alert.actionPath} className={s.alertItem}>
        {inner}
      </Link>
    )
  }

  return <div className={s.alertItem}>{inner}</div>
}

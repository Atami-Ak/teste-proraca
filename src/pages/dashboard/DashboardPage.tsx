// src/pages/dashboard/DashboardPage.tsx

import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { PeriodProvider, usePeriod } from '@/context/PeriodContext'
import {
  readKpiCache,
  computeAndWriteKpiCache,
  subscribeToAlerts,
} from '@/lib/db-dashboard'
import {
  trendColor,
  trendIcon,
  type KpiCacheDoc,
  type AlertItem,
  type KpiSeverity,
} from '@/types/dashboard'
import s from './DashboardPage.module.css'

// ── KPI definitions ───────────────────────────────────────

type KpiKey = { [K in keyof KpiCacheDoc]: KpiCacheDoc[K] extends { value: number; prev: number } ? K : never }[keyof KpiCacheDoc]

interface KpiDef {
  key:      KpiKey
  label:    string
  icon:     string
  accent:   string
  severity: KpiSeverity
  linkTo:   string
}

const KPI_DEFS: KpiDef[] = [
  { key: 'ordensAbertas',        label: 'OS Abertas',            icon: '📑', accent: '#166534', severity: 'critical', linkTo: '/os' },
  { key: 'aprovacoesPendentes',  label: 'Aprovações Pendentes',  icon: '✅', accent: '#dc2626', severity: 'critical', linkTo: '/compras' },
  { key: 'manutencaoAtrasada',   label: 'Manutenção Atrasada',   icon: '🔧', accent: '#ea580c', severity: 'critical', linkTo: '/ativos/manutencao' },
  { key: 'comprasUrgentes',      label: 'Compras Urgentes',      icon: '🛒', accent: '#f59e0b', severity: 'warning',  linkTo: '/compras' },
  { key: 'falhasLimpeza',        label: 'Falhas Limpeza',        icon: '🧹', accent: '#dc2626', severity: 'critical', linkTo: '/limpeza' },
  { key: 'incidentesSeguranca',  label: 'Incidentes Segurança',  icon: '⚠️', accent: '#dc2626', severity: 'critical', linkTo: '/seguranca/ocorrencias' },
  { key: 'alertasColaboradores', label: 'Alertas Colaboradores', icon: '👥', accent: '#7c3aed', severity: 'critical', linkTo: '/colaboradores' },
  { key: 'empreiteirasCriticas', label: 'Empreiteiras Críticas', icon: '🏗️', accent: '#ea580c', severity: 'critical', linkTo: '/empreiteiras' },
]

// ── Alert severity config ─────────────────────────────────

const ALERT_CONFIG: Record<AlertItem['severity'], { color: string; bg: string; label: string }> = {
  critical:  { color: '#dc2626', bg: '#fef2f2', label: 'Crítico'  },
  urgent:    { color: '#ea580c', bg: '#fff7ed', label: 'Urgente'  },
  attention: { color: '#f59e0b', bg: '#fffbeb', label: 'Atenção'  },
}

// ── PeriodBar ─────────────────────────────────────────────

interface PeriodBarProps {
  loading:   boolean
  onRefresh: () => void
}

function PeriodBar({ loading, onRefresh }: PeriodBarProps) {
  const { period, setPeriod } = usePeriod()
  const options = [
    { value: '30d', label: '30 dias' },
    { value: '90d', label: '90 dias' },
    { value: '6m',  label: '6 meses' },
    { value: '1a',  label: '1 ano'   },
  ] as const

  return (
    <div className={s.periodBar}>
      {options.map(opt => (
        <button
          key={opt.value}
          aria-pressed={period === opt.value}
          className={`${s.periodBtn} ${period === opt.value ? s.periodBtnActive : ''}`}
          onClick={() => setPeriod(opt.value)}
          disabled={loading}
        >
          {opt.label}
        </button>
      ))}
      <button
        className={s.refreshBtn}
        onClick={onRefresh}
        disabled={loading}
        aria-label="Atualizar KPIs agora"
        title="Atualizar KPIs agora"
      >
        {loading ? '…' : '↺'}
      </button>
    </div>
  )
}

// ── KpiCard ───────────────────────────────────────────────

interface KpiCardProps {
  def:   KpiDef
  cache: KpiCacheDoc | null
}

function KpiCard({ def, cache }: KpiCardProps) {
  const kv    = cache ? cache[def.key] : null
  const value = kv?.value ?? 0
  const prev  = kv?.prev  ?? 0
  const trend = prev === 0 ? 0 : Math.round(((value - prev) / Math.max(1, prev)) * 100)
  const color = trendColor(def.severity, trend)

  if (!cache) {
    return (
      <div className={s.kpiSkeleton}>
        <div className={s.skeletonLine} style={{ height: 18, width: '50%' }} />
        <div className={s.skeletonLine} style={{ height: 40, width: '65%' }} />
        <div className={s.skeletonLine} style={{ height: 12, width: '80%' }} />
      </div>
    )
  }

  return (
    <Link to={def.linkTo} className={s.kpiCard}>
      <div className={s.kpiAccentBar} style={{ background: def.accent }} />
      <div className={s.kpiTop}>
        <div
          className={s.kpiIconWrap}
          style={{ background: `${def.accent}18`, color: def.accent } as CSSProperties}
        >
          {def.icon}
        </div>
        {trend !== 0 && (
          <span className={s.kpiTrend} style={{ color }}>
            {trendIcon(trend)} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className={s.kpiValue}>{value}</div>
      <div className={s.kpiLabel}>{def.label}</div>
    </Link>
  )
}

// ── AlertPanel ────────────────────────────────────────────

function AlertPanel({ alerts }: { alerts: AlertItem[] }) {
  return (
    <div className={s.alertPanel}>
      <div className={s.alertHeader}>
        <span className={s.alertTitle}>
          Alertas Ativos
          {alerts.length > 0 && (
            <span className={s.alertBadge}>{alerts.length}</span>
          )}
        </span>
      </div>

      {alerts.length === 0 ? (
        <div className={s.alertEmpty}>
          <div className={s.alertEmptyIcon}>✓</div>
          <p>Nenhum alerta ativo no momento.</p>
        </div>
      ) : (
        <div className={s.alertList}>
          {alerts.map(a => {
            const cfg = ALERT_CONFIG[a.severity]
            const ago = Math.max(0, Math.round((Date.now() - a.createdAt.getTime()) / 60_000))
            const agoLabel = ago < 60
              ? `${ago}min atrás`
              : `${Math.round(ago / 60)}h atrás`
            return (
              <Link key={a.id} to={a.linkTo} className={s.alertItem}>
                <div className={s.alertDot} style={{ background: cfg.color }} />
                <div className={s.alertBody}>
                  <div className={s.alertItemTitle}>{a.title}</div>
                  <div className={s.alertMeta}>{agoLabel}</div>
                </div>
                <span
                  className={s.alertSeverityTag}
                  style={{ background: cfg.bg, color: cfg.color } as CSSProperties}
                >
                  {cfg.label}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── DashboardContent (inside PeriodProvider) ──────────────

function DashboardContent() {
  const { period } = usePeriod()

  const [cache,   setCache]   = useState<KpiCacheDoc | null>(null)
  const [alerts,  setAlerts]  = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const loadKpis = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const cached = force ? null : await readKpiCache(period)
      const data   = cached ?? await computeAndWriteKpiCache(period)
      setCache(data)
    } catch (e) {
      setError('Erro ao carregar KPIs. Tente novamente.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [period])

  // Reload KPIs when period changes
  useEffect(() => {
    setCache(null)
    void loadKpis(false)
  }, [loadKpis])

  // Subscribe to live alerts
  useEffect(() => {
    const unsub = subscribeToAlerts(setAlerts)
    return unsub
  }, [])

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div className={s.page}>

      {/* ── Top band ── */}
      <div className={s.topBand}>
        <div className={s.topBandInner}>
          <div>
            <h1 className={s.pageTitle}>Painel de Gestão</h1>
            <p className={s.pageSub}>{today}</p>
          </div>
          <PeriodBar loading={loading} onRefresh={() => void loadKpis(true)} />
        </div>
      </div>

      <div className={s.body}>

        {/* ── Error ── */}
        {error && (
          <div className={s.errorBox}>
            <span className={s.errorMsg}>{error}</span>
            <button className={s.retryBtn} onClick={() => void loadKpis(false)}>
              Tentar novamente
            </button>
          </div>
        )}

        {/* ── KPI Grid ── */}
        <div className={s.kpiGrid}>
          {KPI_DEFS.map(def => (
            <KpiCard key={def.key} def={def} cache={loading ? null : cache} />
          ))}
        </div>

        {/* ── Alerts ── */}
        <AlertPanel alerts={alerts} />

      </div>
    </div>
  )
}

// ── DashboardPage (exported) ──────────────────────────────

export default function DashboardPage() {
  return (
    <PeriodProvider>
      <DashboardContent />
    </PeriodProvider>
  )
}

// src/pages/dashboard/DashboardPage.tsx
// Visão Geral + Command Center (Data Hub integrado)

import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import {
  ComposedChart, Area, Bar,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { PeriodProvider, usePeriod } from '@/context/PeriodContext'
import {
  readKpiCache,
  computeAndWriteKpiCache,
  subscribeToAlerts,
  fetchOverviewChartData,
  computeModuleHealth,
} from '@/lib/db-dashboard'
import {
  trendColor,
  trendIcon,
  getPeriodRanges,
  type KpiCacheDoc,
  type AlertItem,
  type KpiSeverity,
  type OverviewChartPoint,
  type ModuleHealth,
  type HealthStatus,
} from '@/types/dashboard'
import { getDataHubSnapshot, invalidateDataHub } from '@/lib/db-data-hub'
import {
  HEALTH_META, MODULE_META, REC_PRIORITY_META, TREND_META,
  type DataHubSnapshot, type ModuleKey,
} from '@/types/data-hub'
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

// ── Health status colors (legacy dashboard) ───────────────

const HEALTH_COLOR: Record<HealthStatus, string> = {
  ok:       '#16a34a',
  warning:  '#f59e0b',
  critical: '#dc2626',
}

const MODULE_LINK: Record<string, string> = {
  maquinario:    '/ativos',
  frota:         '/frota',
  limpeza:       '/limpeza',
  seguranca:     '/seguranca',
  colaboradores: '/colaboradores',
  obras:         '/empreiteiras',
  compras:       '/compras',
  aprovacoes:    '/compras',
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

// ── AlertPanel (live alerts) ──────────────────────────────

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

// ── OverviewChart ─────────────────────────────────────────

interface OverviewChartProps {
  data:    OverviewChartPoint[]
  loading: boolean
}

function OverviewChart({ data, loading }: OverviewChartProps) {
  return (
    <div className={s.chartPanel}>
      <div className={s.chartTitle}>Visão Geral do Período</div>
      {loading ? (
        <div className={s.chartSkeleton} />
      ) : data.length === 0 ? (
        <div className={s.chartEmpty}>Sem dados para o período selecionado.</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 4, right: 48, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
              formatter={(value, name) =>
                name === 'Custo (R$)'
                  ? [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, name]
                  : [value, name]
              }
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area yAxisId="left"  type="monotone" dataKey="abertas"    stroke="#ea580c" fill="#fff7ed" strokeWidth={2} name="OS Abertas"  dot={false} />
            <Area yAxisId="left"  type="monotone" dataKey="concluidas" stroke="#16a34a" fill="#f0fdf4" strokeWidth={2} name="Concluídas"  dot={false} />
            <Bar  yAxisId="right"                 dataKey="custo"      fill="#166534"   fillOpacity={0.5}             name="Custo (R$)" />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── ModuleHealthGrid (legacy) ─────────────────────────────

function ModuleHealthGrid({ health, loading }: { health: ModuleHealth[]; loading: boolean }) {
  return (
    <div className={s.healthPanel}>
      <div className={s.healthHeader}>Saúde dos Módulos</div>
      {loading ? (
        <div className={s.healthSkeletons}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={s.healthCardSkeleton} />
          ))}
        </div>
      ) : (
        <div className={s.healthGrid}>
          {health.map(h => (
            <Link key={h.module} to={MODULE_LINK[h.module] ?? '/'} className={s.healthCard}>
              <div className={s.healthDot} style={{ background: HEALTH_COLOR[h.status] }} />
              <div className={s.healthInfo}>
                <div className={s.healthLabel}>{h.label}</div>
                <div className={s.healthMetric}>{h.metric}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ── HubCommandCenter — Data Hub Score + Module Scores ─────

function HubCommandCenter({
  snap,
  loading,
  onRefresh,
}: {
  snap:      DataHubSnapshot | null
  loading:   boolean
  onRefresh: () => void
}) {
  const global = snap?.healthScores?.global
  const scores = snap?.healthScores

  return (
    <div className={s.hubSection}>
      <div className={s.hubHeader}>
        <span className={s.hubTitle}>Central de Comando</span>
        <button
          className={s.hubRefreshBtn}
          onClick={onRefresh}
          disabled={loading}
          title="Recalcular Data Hub"
        >
          {loading ? '…' : '↺ Recalcular'}
        </button>
      </div>

      <div className={s.hubBody}>

        {/* Score global */}
        <div className={s.hubGlobalCard}>
          {loading || !global ? (
            <div className={s.hubGlobalSkeleton} />
          ) : (
            <>
              <div className={s.hubGlobalLabel}>Saúde Global</div>
              <div
                className={s.hubGlobalScore}
                style={{ color: HEALTH_META[global.status].color } as CSSProperties}
              >
                {global.score}
              </div>
              <div className={s.hubGlobalSub}>/100</div>
              <div
                className={s.hubGlobalStatus}
                style={{
                  color:      HEALTH_META[global.status].color,
                  background: HEALTH_META[global.status].bg,
                } as CSSProperties}
              >
                {HEALTH_META[global.status].icon} {HEALTH_META[global.status].label}
              </div>
              <div className={s.hubGlobalTrend} style={{ color: TREND_META[global.trend].color } as CSSProperties}>
                {TREND_META[global.trend].icon} {TREND_META[global.trend].label}
              </div>
              {snap?.generatedAt && (
                <div className={s.hubGeneratedAt}>
                  {Math.round((Date.now() - snap.generatedAt.getTime()) / 60_000)} min atrás
                </div>
              )}
            </>
          )}
        </div>

        {/* Módulos */}
        <div className={s.hubModuleGrid}>
          {loading || !scores ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={s.hubModuleCardSkeleton} />
            ))
          ) : (
            (Object.keys(MODULE_META) as ModuleKey[]).map(key => {
              const ms   = scores[key]
              const meta = MODULE_META[key]
              const hm   = HEALTH_META[ms.status]
              return (
                <Link key={key} to={meta.dashPath} className={s.hubModuleCard}>
                  <div className={s.hubModuleIcon}>{meta.icon}</div>
                  <div className={s.hubModuleInfo}>
                    <div className={s.hubModuleName}>{meta.label}</div>
                    <div className={s.hubModuleBar}>
                      <div
                        className={s.hubModuleBarFill}
                        style={{
                          width:      `${ms.score}%`,
                          background: hm.color,
                        } as CSSProperties}
                      />
                    </div>
                  </div>
                  <div
                    className={s.hubModuleScore}
                    style={{ color: hm.color } as CSSProperties}
                  >
                    {ms.score}
                  </div>
                </Link>
              )
            })
          )}
        </div>

      </div>
    </div>
  )
}

// ── RecsPreview — top 3 recomendações ────────────────────

function RecsPreview({ snap, loading }: { snap: DataHubSnapshot | null; loading: boolean }) {
  const top3 = (snap?.recommendations ?? []).slice(0, 3)
  if (!loading && top3.length === 0) return null

  return (
    <div className={s.recsPreview}>
      <div className={s.recsPreviewHeader}>
        <span className={s.recsPreviewTitle}>💡 Recomendações Prescritivas</span>
        <Link to="/dashboard/recomendacoes" className={s.recsPreviewLink}>
          Ver todas ({snap?.recommendations?.length ?? 0}) →
        </Link>
      </div>

      <div className={s.recsPreviewGrid}>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={s.recPreviewCardSkeleton} />
          ))
        ) : (
          top3.map(rec => {
            const pm   = REC_PRIORITY_META[rec.priority]
            const modM = MODULE_META[rec.module]
            return (
              <div key={rec.id} className={s.recPreviewCard}>
                <div className={s.recPreviewAccent} style={{ background: pm.color } as CSSProperties} />
                <div className={s.recPreviewTop}>
                  <span
                    className={s.recPreviewPrioBadge}
                    style={{ color: pm.color, background: pm.bg } as CSSProperties}
                  >
                    {pm.label}
                  </span>
                  <span className={s.recPreviewMod}>{modM.icon}</span>
                </div>
                <div className={s.recPreviewTitle}>{rec.title}</div>
                <div className={s.recPreviewImpact}>{rec.impact}</div>
                {rec.actionPath && (
                  <Link to={rec.actionPath} className={s.recPreviewAction}>
                    {rec.actionLabel ?? 'Ver →'}
                  </Link>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── DashboardContent (inside PeriodProvider) ──────────────

function DashboardContent() {
  const { period } = usePeriod()

  const [cache,        setCache]        = useState<KpiCacheDoc | null>(null)
  const [alerts,       setAlerts]       = useState<AlertItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [chartData,    setChartData]    = useState<OverviewChartPoint[]>([])
  const [chartLoading, setChartLoading] = useState(true)
  const [hubSnap,      setHubSnap]      = useState<DataHubSnapshot | null>(null)
  const [hubLoading,   setHubLoading]   = useState(true)

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

  const loadHub = useCallback(async (force = false) => {
    setHubLoading(true)
    if (force) invalidateDataHub()
    try {
      setHubSnap(await getDataHubSnapshot(force))
    } catch (e) {
      console.error('[hub]', e)
    } finally {
      setHubLoading(false)
    }
  }, [])

  useEffect(() => {
    setCache(null)
    void loadKpis(false)
  }, [loadKpis])

  useEffect(() => {
    setChartLoading(true)
    const { current } = getPeriodRanges(period)
    fetchOverviewChartData(current, period)
      .then(setChartData)
      .catch(() => setChartData([]))
      .finally(() => setChartLoading(false))
  }, [period])

  useEffect(() => {
    const unsub = subscribeToAlerts(setAlerts)
    return unsub
  }, [])

  useEffect(() => {
    void loadHub()
  }, [loadHub])

  const moduleHealth = cache ? computeModuleHealth(cache) : []

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

        {/* ── Data Hub Command Center ── */}
        <HubCommandCenter
          snap={hubSnap}
          loading={hubLoading}
          onRefresh={() => void loadHub(true)}
        />

        {/* ── Chart + Module Health ── */}
        <div className={s.secondRow}>
          <OverviewChart data={chartData} loading={chartLoading} />
          <ModuleHealthGrid health={moduleHealth} loading={loading} />
        </div>

        {/* ── Live Alerts ── */}
        <AlertPanel alerts={alerts} />

        {/* ── Recommendations Preview ── */}
        <RecsPreview snap={hubSnap} loading={hubLoading} />

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

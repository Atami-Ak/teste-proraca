// src/pages/dashboard/limpeza/CleaningAnalyticsPage.tsx
// 5S Cleaning Analytics — executive quality control dashboard.

import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react'
import {
  ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ComposedChart, Area,
  BarChart, Bar, Cell,
  Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { fetchCleaningAnalytics, clearCleaningAnalyticsCache } from '@/lib/db-cleaning-analytics'
import type {
  AnalyticsPeriod,
  CleaningAnalyticsData,
  CleaningRiskLevel,
  FiveSItem,
  FiveSScore,
  InspectorMetrics,
  MonthlyTrend,
  NonConformityPattern,
  ZoneMetrics,
  ZoneTrend,
} from '@/types/cleaning-analytics'
import {
  RISK_COLORS, RISK_LABELS, TREND_COLOR, TREND_ICON, scoreColor,
} from '@/types/cleaning-analytics'
import s from './CleaningAnalyticsPage.module.css'

// ── Constants ─────────────────────────────────────────────────

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: '6m',  label: '6 meses' },
  { value: '1a',  label: '1 ano'   },
]

const S_KEYS: Array<keyof FiveSScore> = ['seiri','seiton','seiso','seiketsu','shitsuke']

// ── Formatters ────────────────────────────────────────────────

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

// ── KPI Card ──────────────────────────────────────────────────

function KpiCard({
  value, label, sub, accent, loading,
}: {
  value: string | number; label: string; sub?: string;
  accent: string; loading: boolean
}) {
  if (loading) {
    return (
      <div className={s.kpiCard}>
        <div className={s.kpiAccent} style={{ background: accent }} />
        <div className={s.skeletonCell} style={{ height: 32, width: '60%', marginBottom: 8 }} />
        <div className={s.skeletonCell} style={{ height: 10, width: '80%' }} />
      </div>
    )
  }
  return (
    <div className={s.kpiCard}>
      <div className={s.kpiAccent} style={{ background: accent }} />
      <div className={s.kpiValue}>{value}</div>
      <div className={s.kpiLabel}>{label}</div>
      {sub && <div className={s.kpiSub}>{sub}</div>}
    </div>
  )
}

// ── Risk Badge ────────────────────────────────────────────────

function RiskBadge({ level }: { level: CleaningRiskLevel }) {
  const cls = level === 'critical' ? s.riskCritical :
              level === 'high'     ? s.riskHigh     :
              level === 'medium'   ? s.riskMedium   : s.riskLow
  return <span className={`${s.riskBadge} ${cls}`}>{RISK_LABELS[level]}</span>
}

// ── Trend Chip ────────────────────────────────────────────────

function TrendChip({ trend, delta }: { trend: ZoneTrend; delta: number }) {
  const icon  = TREND_ICON[trend]
  const color = TREND_COLOR[trend]
  const abs   = Math.abs(delta)
  const label = trend === 'no_data' ? '—' :
                abs > 0 ? `${icon} ${abs}` : icon
  return (
    <span className={s.trendChip} style={{ color, borderColor: color + '40', background: color + '12' }}>
      {label}
    </span>
  )
}

// ── Score Bar ─────────────────────────────────────────────────

function ScoreBar({ score, max = 100, height = 5 }: { score: number; max?: number; height?: number }) {
  const pct   = Math.round((score / max) * 100)
  const color = scoreColor(score)
  return (
    <div className={s.scoreBar}>
      <div className={s.scoreBarTrack} style={{ height }}>
        <div
          className={s.scoreBarFill}
          style={{ width: `${pct}%`, background: color, height } as CSSProperties}
        />
      </div>
      <span className={s.scoreNum} style={{ color }}>{score}</span>
    </div>
  )
}

// ── 5S Radar Chart ────────────────────────────────────────────

function FiveSRadar({
  zone,
  global,
  height = 220,
}: {
  zone?:   ZoneMetrics | null
  global:  CleaningAnalyticsData['fiveSItems']
  height?: number
}) {
  const data = S_KEYS.map(key => {
    const item       = global.find(f => f.key === key)
    const globalAvg  = item?.avgScore ?? 0
    const zoneScore  = zone?.fiveSScores[key] ?? 0
    return {
      subject:    item?.short ?? key,
      globalAvg,
      zoneScore:  zone ? zoneScore : undefined,
      fullMark:   100,
    }
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} margin={{ top: 10, right: 24, bottom: 10, left: 24 }}>
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fontSize: 12, fontWeight: 700, fill: '#374151' }}
        />
        <PolarRadiusAxis
          angle={72}
          domain={[0, 100]}
          tick={{ fontSize: 9, fill: '#94a3b8' }}
          tickCount={4}
        />
        <Radar
          name="Média Global"
          dataKey="globalAvg"
          stroke="#94a3b8"
          fill="#94a3b8"
          fillOpacity={0.15}
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
        {zone && (
          <Radar
            name={zone.zoneName}
            dataKey="zoneScore"
            stroke="#16a34a"
            fill="#16a34a"
            fillOpacity={0.25}
            strokeWidth={2}
            dot={{ r: 3, fill: '#16a34a' }}
          />
        )}
        {!zone && (
          <Radar
            name="Score Global"
            dataKey="globalAvg"
            stroke="#16a34a"
            fill="#16a34a"
            fillOpacity={0.25}
            strokeWidth={2}
            dot={{ r: 3, fill: '#16a34a' }}
          />
        )}
        {zone && <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />}
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v) => [`${String(v)}/100`, '']}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}

// ── Zone Ranking Table ────────────────────────────────────────

function ZoneRanking({
  zones,
  query: q,
  selected,
  onSelect,
}: {
  zones:    ZoneMetrics[]
  query:    string
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const filtered = useMemo(() => {
    if (!q.trim()) return zones
    const lower = q.toLowerCase()
    return zones.filter(z =>
      z.zoneName.toLowerCase().includes(lower) ||
      z.sector.toLowerCase().includes(lower))
  }, [zones, q])

  if (zones.length === 0) {
    return (
      <div className={s.emptyState}>
        <div className={s.emptyIcon}>🧹</div>
        <div className={s.emptyText}>Sem inspeções registradas no período.</div>
        <div className={s.emptyHint}>Realize inspeções 5S nas zonas para gerar analytics.</div>
      </div>
    )
  }

  return (
    <table className={s.rankTable}>
      <thead>
        <tr>
          <th>#</th>
          <th>Zona / Setor</th>
          <th>Últ. Score</th>
          <th>Tendência</th>
          <th>Conformidade</th>
          <th>NCs</th>
          <th>Risco</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((z, i) => (
          <tr
            key={z.zoneId}
            className={`${s.rankRow} ${selected === z.zoneId ? s.rankRowActive : ''}`}
            onClick={() => onSelect(selected === z.zoneId ? null : z.zoneId)}
          >
            <td><span className={s.rankNum}>{i + 1}</span></td>

            <td>
              <div className={s.rankName}>
                <span style={{ marginRight: 6 }}>{z.zoneIcon}</span>
                {z.zoneName}
              </div>
              <div className={s.rankCode}>
                {z.sector}
                {z.latestTs ? ` · ${fmtDate(z.latestTs)}` : ' · Sem inspeção'}
              </div>
            </td>

            <td>
              {z.latestScore !== null ? (
                <ScoreBar score={z.latestScore} />
              ) : (
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>—</span>
              )}
            </td>

            <td style={{ textAlign: 'center' }}>
              <TrendChip trend={z.trend} delta={z.trendDelta} />
            </td>

            <td style={{ textAlign: 'center' }}>
              <span style={{
                fontWeight: 800, fontSize: '0.82rem',
                color: z.complianceRate >= 70 ? '#16a34a' : z.complianceRate >= 50 ? '#f59e0b' : '#dc2626',
              }}>
                {z.totalInspections > 0 ? `${z.complianceRate}%` : '—'}
              </span>
            </td>

            <td style={{ textAlign: 'center' }}>
              <span style={{
                fontWeight: 700, fontSize: '0.8rem',
                color: z.nonConformities > 0 ? '#ea580c' : '#16a34a',
              }}>
                {z.nonConformities}
              </span>
              {z.criticalIssues > 0 && (
                <div style={{ fontSize: '0.62rem', color: '#dc2626', fontWeight: 700 }}>
                  {z.criticalIssues} crítica{z.criticalIssues > 1 ? 's' : ''}
                </div>
              )}
            </td>

            <td>
              <RiskBadge level={z.riskLevel} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Alerts Panel ──────────────────────────────────────────────

function AlertsPanel({ alerts }: { alerts: CleaningAnalyticsData['alerts'] }) {
  if (alerts.length === 0) {
    return (
      <div className={s.emptyState} style={{ padding: '28px 20px' }}>
        <div className={s.emptyIcon} style={{ fontSize: '1.6rem' }}>✓</div>
        <div className={s.emptyText}>Nenhum alerta ativo.</div>
      </div>
    )
  }
  return (
    <div className={s.alertList}>
      {alerts.slice(0, 8).map((a, i) => (
        <div key={i} className={s.alertItem}>
          <div
            className={s.alertDot}
            style={{ background: a.severity === 'critical' ? '#dc2626' : '#ea580c' }}
          />
          <div className={s.alertBody}>
            <div className={s.alertMsg}>{a.message}</div>
          </div>
          <span className={`${s.alertSev} ${a.severity === 'critical' ? s.alertSevCritical : s.alertSevWarning}`}>
            {a.severity === 'critical' ? 'Crítico' : 'Atenção'}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Zone Drill-Down ───────────────────────────────────────────

function ZoneDrillDown({
  zone,
  globalFiveS,
  onClose,
}: {
  zone:          ZoneMetrics
  globalFiveS:   CleaningAnalyticsData['fiveSItems']
  onClose:       () => void
}) {
  const kpis = [
    { value: zone.totalInspections,                                 label: 'Inspeções',      accent: '#166534' },
    { value: zone.averageScore,                                     label: 'Score Médio',    accent: scoreColor(zone.averageScore) },
    { value: zone.latestScore ?? '—',                               label: 'Últ. Score',     accent: zone.latestScore ? scoreColor(zone.latestScore) : '#94a3b8' },
    { value: `${zone.complianceRate}%`,                             label: 'Conformidade',   accent: scoreColor(zone.complianceRate) },
    { value: zone.nonConformities,                                  label: 'Não-Conformid.', accent: zone.nonConformities > 0 ? '#ea580c' : '#16a34a' },
    { value: zone.daysSinceLastInspection !== null ? `${zone.daysSinceLastInspection}d` : '—', label: 'Dias s/ Inspeção', accent: zone.daysSinceLastInspection !== null && zone.daysSinceLastInspection > 14 ? '#dc2626' : '#3b82f6' },
  ]

  const hasHistory = zone.scoreHistory.length > 0

  return (
    <div className={s.drillDown}>
      <div className={s.drillHeader}>
        <div>
          <div className={s.drillTitle}>
            <span style={{
              background: RISK_COLORS[zone.riskLevel],
              color: '#fff', padding: '2px 8px', borderRadius: 6,
              fontSize: '0.68rem', fontWeight: 800, letterSpacing: 0.3,
            }}>
              {RISK_LABELS[zone.riskLevel].toUpperCase()}
            </span>
            <span>{zone.zoneIcon}</span>
            {zone.zoneName}
          </div>
          <div className={s.drillCode}>
            {zone.sector && `${zone.sector} · `}
            {zone.totalInspections} inspeções · Score de risco {zone.riskScore}/100
            {zone.latestTs && ` · Última: ${fmtDateTime(zone.latestTs)}`}
            {zone.latestInspector && ` · Inspector: ${zone.latestInspector}`}
          </div>
        </div>
        <button className={s.drillClose} onClick={onClose}>✕</button>
      </div>

      <div className={s.drillBody}>

        {/* KPI strip */}
        <div className={s.drillKpiGrid}>
          {kpis.map(k => (
            <div key={k.label} className={s.drillKpiItem} style={{ borderLeft: `3px solid ${k.accent}` }}>
              <div className={s.drillKpiValue} style={{ color: k.accent }}>{k.value}</div>
              <div className={s.drillKpiLabel}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* 5S Radar */}
        <div className={s.drillSection}>
          <div className={s.drillSectionTitle}>Breakdown 5S</div>
          <FiveSRadar zone={zone} global={globalFiveS} height={200} />
        </div>

        {/* Score history */}
        <div className={s.drillSection}>
          <div className={s.drillSectionTitle}>Histórico de Score</div>
          {hasHistory ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={zone.scoreHistory} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #EBF0F7' }}
                  formatter={(v) => [v ?? 0, 'Score 5S']}
                />
                <Bar
                  dataKey="score"
                  radius={[3, 3, 0, 0]}
                  name="Score"
                  fill="#16a34a"
                  fillOpacity={0.8}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', padding: '16px 0' }}>
              Sem histórico disponível.
            </div>
          )}
        </div>

        {/* 5S per-S scores */}
        <div className={s.drillSection}>
          <div className={s.drillSectionTitle}>Score por Pilar 5S</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {S_KEYS.map(key => {
              const item  = globalFiveS.find(f => f.key === key)
              const score = zone.fiveSScores[key]
              const color = scoreColor(score)
              return (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#374151' }}>
                      {item?.short ?? key}
                    </span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color }}>{score}</span>
                  </div>
                  <div style={{ height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top issues */}
        <div className={s.drillSection} style={{ gridColumn: '1 / -1' }}>
          <div className={s.drillSectionTitle}>Principais Não-Conformidades</div>
          {zone.topIssues.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', padding: '8px 0' }}>
              Sem não-conformidades registradas.
            </div>
          ) : (
            <div className={s.recurrentList}>
              {zone.topIssues.map((issue, i) => (
                <div key={i} className={s.recurrentItem}>
                  {issue.severity === 'critical' && (
                    <span className={s.issueCriticalDot} />
                  )}
                  <span className={s.recurrentDesc}>{issue.description}</span>
                  <span className={`${s.recurrentCount} ${issue.severity === 'critical' ? s.recurrentCritical : ''}`}>
                    {issue.count}×
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Monthly Score Trend Chart ─────────────────────────────────

function ScoreTrendChart({ data }: { data: MonthlyTrend[] }) {
  if (data.length === 0) {
    return (
      <div className={s.emptyState} style={{ padding: '40px 20px' }}>
        <div className={s.emptyText}>Sem dados de tendência no período.</div>
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#16a34a" stopOpacity={0.22} />
            <stop offset="95%" stopColor="#16a34a" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis
          yAxisId="score"
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28}
        />
        <YAxis
          yAxisId="insp"
          orientation="right"
          tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v, name) => {
            if (name === 'Score Médio' || name === 'Conformidade') return [`${String(v)}`, name as string]
            return [v ?? 0, name as string]
          }}
        />
        <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        <Area
          yAxisId="score"
          type="monotone" dataKey="avgScore" name="Score Médio"
          stroke="#16a34a" fill="url(#scoreGrad)" strokeWidth={2} dot={false}
        />
        <Area
          yAxisId="score"
          type="monotone" dataKey="compliance" name="Conformidade"
          stroke="#3b82f6" fill="url(#compGrad)" strokeWidth={1.5} strokeDasharray="4 4" dot={false}
        />
        <Line
          yAxisId="insp"
          type="monotone" dataKey="inspections" name="Inspeções"
          stroke="#ea580c" strokeWidth={1.5} dot={{ r: 3, fill: '#ea580c' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── 5S Breakdown Panel ────────────────────────────────────────

function FiveSBreakdown({ items }: { items: FiveSItem[] }) {
  return (
    <div className={s.fiveSBreakdown}>
      {items.map(item => {
        const color = scoreColor(item.avgScore)
        const pct   = item.avgScore
        return (
          <div key={item.key} className={s.fiveSRow}>
            <div className={s.fiveSLabel}>
              <span className={s.fiveSNum} style={{ background: item.color + '22', color: item.color }}>
                S{item.number}
              </span>
              <div>
                <div className={s.fiveSName}>{item.short}</div>
                <div className={s.fiveSDesc}>{item.description}</div>
              </div>
            </div>
            <div className={s.fiveSBar}>
              <div className={s.fiveSBarTrack}>
                <div
                  className={s.fiveSBarFill}
                  style={{ width: `${pct}%`, background: color } as CSSProperties}
                />
              </div>
              <span className={s.fiveSScore} style={{ color }}>{item.avgScore}</span>
            </div>
            <div className={s.fiveSWorst}>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Pior: </span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#374151' }}>
                {item.worstZone !== '—' ? `${item.worstZone} (${item.worstScore})` : '—'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Non-Conformity Panel ──────────────────────────────────────

function NonConformityPanel({ items }: { items: NonConformityPattern[] }) {
  if (items.length === 0) {
    return (
      <div className={s.emptyState} style={{ padding: '28px 20px' }}>
        <div className={s.emptyText}>Sem não-conformidades registradas.</div>
      </div>
    )
  }
  return (
    <div className={s.ncGrid}>
      {items.slice(0, 12).map((nc, i) => (
        <div
          key={i}
          className={`${s.ncPill} ${nc.severity === 'critical' ? s.ncPillCritical : ''}`}
        >
          <span className={s.ncPillCount}>{nc.count}×</span>
          <span className={s.ncPillDesc}>{nc.description}</span>
          {nc.zones.length > 1 && (
            <span className={s.ncPillZones}>{nc.zones.length} setores</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Inspector Table ───────────────────────────────────────────

function InspectorTable({ inspectors }: { inspectors: InspectorMetrics[] }) {
  if (inspectors.length === 0) {
    return (
      <div className={s.emptyState} style={{ padding: '28px 20px' }}>
        <div className={s.emptyText}>Sem inspeções registradas.</div>
      </div>
    )
  }
  return (
    <div className={s.inspectorList}>
      {inspectors.slice(0, 8).map((insp, i) => {
        const color = scoreColor(insp.avgScore)
        return (
          <div key={insp.employeeId} className={s.inspectorRow}>
            <div className={s.inspectorRank}>{i + 1}</div>
            <div className={s.inspectorInfo}>
              <div className={s.inspectorName}>{insp.employeeName}</div>
              <div className={s.inspectorCargo}>{insp.cargo}</div>
            </div>
            <div className={s.inspectorStats}>
              <span className={s.inspectorBadge} style={{ background: '#f0fdf4', color: '#166534' }}>
                {insp.totalInspections} insp.
              </span>
              {insp.criticalFound > 0 && (
                <span className={s.inspectorBadge} style={{ background: '#fef2f2', color: '#dc2626' }}>
                  {insp.criticalFound} crítica{insp.criticalFound > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className={s.inspectorScore} style={{ color }}>{insp.avgScore}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Compliance Bar Chart ──────────────────────────────────────

function ComplianceChart({ zones }: { zones: ZoneMetrics[] }) {
  const data = zones
    .filter(z => z.totalInspections > 0)
    .map(z => ({
      name:        z.zoneIcon + ' ' + z.zoneName.split('/')[0].trim(),
      conformidade: z.complianceRate,
      fill:        z.complianceRate >= 70 ? '#16a34a' : z.complianceRate >= 50 ? '#f59e0b' : '#dc2626',
    }))

  if (data.length === 0) {
    return (
      <div className={s.emptyState} style={{ padding: '40px 20px' }}>
        <div className={s.emptyText}>Sem dados de conformidade.</div>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }}
          axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151', fontWeight: 600 }}
          axisLine={false} tickLine={false} width={100} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #EBF0F7' }}
          formatter={(v) => [`${String(v)}%`, 'Conformidade']}
        />
        <Bar dataKey="conformidade" radius={[0, 4, 4, 0]} name="Conformidade" maxBarSize={20}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Main Page ─────────────────────────────────────────────────

export default function CleaningAnalyticsPage() {
  const [period,   setPeriod]   = useState<AnalyticsPeriod>('90d')
  const [data,     setData]     = useState<CleaningAnalyticsData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async (p: AnalyticsPeriod, force = false) => {
    setLoading(true)
    setError(null)
    try {
      if (force) clearCleaningAnalyticsCache()
      const result = await fetchCleaningAnalytics(p, force)
      setData(result)
    } catch (e) {
      console.error(e)
      setError('Erro ao carregar dados. Verifique a conexão e tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setSelected(null)
    void load(period)
  }, [period, load])

  const selectedZone = useMemo(
    () => data?.zones.find(z => z.zoneId === selected) ?? null,
    [data, selected],
  )

  const criticalAlerts = data?.alerts.filter(a => a.severity === 'critical') ?? []
  const warningAlerts  = data?.alerts.filter(a => a.severity === 'warning')  ?? []

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  const avgScoreAccent = data ? scoreColor(data.avgScore) : '#166534'
  const complianceAccent = data ? scoreColor(data.complianceRate) : '#166534'

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerInner}>
          <div className={s.headerLeft}>
            <h1 className={s.headerTitle}>
              <span className={s.headerTitleIcon}>🧹</span>
              Analytics 5S — Limpeza Industrial
            </h1>
            <p className={s.headerSub}>{today}</p>
          </div>
          <div className={s.headerControls}>
            {PERIODS.map(p => (
              <button
                key={p.value}
                className={`${s.periodBtn} ${period === p.value ? s.periodBtnActive : ''}`}
                onClick={() => setPeriod(p.value)}
                disabled={loading}
              >
                {p.label}
              </button>
            ))}
            <button
              className={s.refreshBtn}
              onClick={() => void load(period, true)}
              disabled={loading}
              title="Forçar recarregamento"
            >
              {loading ? '…' : '↺'}
            </button>
            {data && !loading && (
              <span className={s.lastUpdated}>
                {data.computedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Critical alert banner ── */}
      {!loading && criticalAlerts.length > 0 && (
        <div className={`${s.alertBanner} ${s.alertBannerCritical}`}>
          <span className={s.alertBannerIcon}>🔴</span>
          <span className={s.alertBannerText}>{criticalAlerts[0].message}</span>
          <span className={s.alertBannerCount}>
            {criticalAlerts.length} crítico{criticalAlerts.length > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* ── Warning banner ── */}
      {!loading && criticalAlerts.length === 0 && warningAlerts.length > 0 && (
        <div className={`${s.alertBanner} ${s.alertBannerWarning}`}>
          <span className={s.alertBannerIcon}>🟠</span>
          <span className={s.alertBannerText}>{warningAlerts[0].message}</span>
          <span className={`${s.alertBannerCount} ${s.alertBannerCountWarning}`}>
            {warningAlerts.length} atenção
          </span>
        </div>
      )}

      <div className={s.body}>

        {/* ── Error ── */}
        {error && (
          <div className={s.errorBox}>
            <span>{error}</span>
            <button onClick={() => void load(period)}>Tentar novamente</button>
          </div>
        )}

        {/* ── KPI Strip ── */}
        <div className={s.kpiStrip}>
          <KpiCard
            value={data?.totalZones ?? '—'}
            label="Zonas Monitoradas"
            accent="#166534"
            loading={loading}
            sub={data ? `${data.zones.filter(z => z.totalInspections > 0).length} com inspeções` : undefined}
          />
          <KpiCard
            value={data?.avgScore ?? '—'}
            label="Score Médio 5S"
            accent={avgScoreAccent}
            loading={loading}
            sub={data ? (data.avgScore >= 70 ? 'dentro do padrão' : 'abaixo do padrão') : undefined}
          />
          <KpiCard
            value={data ? `${data.complianceRate}%` : '—'}
            label="Conformidade Global"
            accent={complianceAccent}
            loading={loading}
            sub="inspeções com score ≥ 70"
          />
          <KpiCard
            value={data?.criticalZones ?? '—'}
            label="Zonas Críticas"
            accent="#dc2626"
            loading={loading}
            sub={data && data.criticalZones > 0 ? 'requerem ação imediata' : 'nenhuma em estado crítico'}
          />
          <KpiCard
            value={data?.totalNonConformities ?? '—'}
            label="Não-Conformidades"
            accent="#ea580c"
            loading={loading}
            sub={data ? `${data.criticalIssues} crítica${data.criticalIssues !== 1 ? 's' : ''}` : undefined}
          />
          <KpiCard
            value={data?.daysSinceMostRecentInspection !== null && data?.daysSinceMostRecentInspection !== undefined
              ? `${data.daysSinceMostRecentInspection}d`
              : '—'}
            label="Dias s/ Inspeção"
            accent={
              data?.daysSinceMostRecentInspection != null
                ? data.daysSinceMostRecentInspection > 14 ? '#dc2626'
                  : data.daysSinceMostRecentInspection > 7 ? '#f59e0b' : '#16a34a'
                : '#94a3b8'
            }
            loading={loading}
            sub="desde a última inspeção"
          />
        </div>

        {/* ── Main row ── */}
        <div className={s.mainRow}>

          {/* Zone ranking */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>
                📊 Ranking de Setores 5S
                {data && <span className={s.panelBadge}>{data.zones.length}</span>}
              </span>
            </div>
            <div className={s.searchBar}>
              <input
                className={s.searchInput}
                type="text"
                placeholder="Buscar zona ou setor…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <span className={s.searchCount}>
                  {data?.zones.filter(z =>
                    z.zoneName.toLowerCase().includes(search.toLowerCase()) ||
                    z.sector.toLowerCase().includes(search.toLowerCase())).length ?? 0} resultado{
                      (data?.zones.filter(z =>
                        z.zoneName.toLowerCase().includes(search.toLowerCase()) ||
                        z.sector.toLowerCase().includes(search.toLowerCase())).length ?? 0) !== 1 ? 's' : ''
                    }
                </span>
              )}
            </div>
            {loading ? (
              <div>
                {[1,2,3,4].map(i => (
                  <div key={i} className={s.skeletonRow}>
                    <div className={s.skeletonCell} style={{ width: 24, flexShrink: 0 }} />
                    <div className={s.skeletonCell} style={{ flex: 2 }} />
                    <div className={s.skeletonCell} style={{ flex: 1 }} />
                    <div className={s.skeletonCell} style={{ flex: 1 }} />
                  </div>
                ))}
              </div>
            ) : data ? (
              <ZoneRanking
                zones={data.zones}
                query={search}
                selected={selected}
                onSelect={setSelected}
              />
            ) : null}
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className={s.panel}>
              <div className={s.panelHeader}>
                <span className={s.panelTitle}>🕸️ Radar 5S Global</span>
              </div>
              <div className={s.panelBody}>
                {loading ? (
                  <div className={s.skeletonCell} style={{ height: 220, width: '100%' }} />
                ) : data ? (
                  <FiveSRadar global={data.fiveSItems} zone={null} height={220} />
                ) : null}
              </div>
              {data && !loading && (
                <div className={s.radarLegend}>
                  {data.fiveSItems.map(item => (
                    <div key={item.key} className={s.radarLegendItem}>
                      <div className={s.radarLegendDot} style={{ background: item.color }} />
                      <span>{item.short}</span>
                      <span style={{ fontWeight: 800, color: scoreColor(item.avgScore) }}>
                        {item.avgScore}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={s.panel}>
              <div className={s.panelHeader}>
                <span className={s.panelTitle}>
                  🚨 Alertas
                  {data && data.alerts.length > 0 && (
                    <span className={s.panelBadge}>{data.alerts.length}</span>
                  )}
                </span>
              </div>
              {loading ? (
                <div className={s.panelBody}>
                  <div className={s.skeletonCell} style={{ height: 14, width: '90%', marginBottom: 8 }} />
                  <div className={s.skeletonCell} style={{ height: 14, width: '70%' }} />
                </div>
              ) : data ? (
                <AlertsPanel alerts={data.alerts} />
              ) : null}
            </div>

          </div>
        </div>

        {/* ── Zone Drill-Down ── */}
        {selectedZone && data && (
          <ZoneDrillDown
            zone={selectedZone}
            globalFiveS={data.fiveSItems}
            onClose={() => setSelected(null)}
          />
        )}

        {/* ── Trend + 5S Breakdown row ── */}
        <div className={s.trendRow}>

          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>📈 Evolução do Score 5S</span>
            </div>
            <div className={s.panelBody}>
              {loading ? (
                <div className={s.skeletonCell} style={{ height: 220, width: '100%' }} />
              ) : data ? (
                <ScoreTrendChart data={data.monthlyTrend} />
              ) : null}
            </div>
          </div>

          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>🔬 Análise por Pilar 5S</span>
            </div>
            {loading ? (
              <div className={s.panelBody}>
                <div className={s.skeletonCell} style={{ height: 200, width: '100%' }} />
              </div>
            ) : data ? (
              <FiveSBreakdown items={data.fiveSItems} />
            ) : null}
          </div>

        </div>

        {/* ── Bottom row: NCs + Inspectors + Compliance ── */}
        <div className={s.bottomRow}>

          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>
                🔄 Não-Conformidades Recorrentes
                {data && data.topNonConformities.length > 0 && (
                  <span className={s.panelBadge}>{data.topNonConformities.length}</span>
                )}
              </span>
            </div>
            {loading ? (
              <div className={s.panelBody}>
                <div className={s.skeletonCell} style={{ height: 100, width: '100%' }} />
              </div>
            ) : data ? (
              <NonConformityPanel items={data.topNonConformities} />
            ) : null}
          </div>

          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>
                👤 Performance dos Inspetores
                {data && data.inspectors.length > 0 && (
                  <span className={s.panelBadge}>{data.inspectors.length}</span>
                )}
              </span>
            </div>
            {loading ? (
              <div className={s.panelBody}>
                <div className={s.skeletonCell} style={{ height: 120, width: '100%' }} />
              </div>
            ) : data ? (
              <InspectorTable inspectors={data.inspectors} />
            ) : null}
          </div>

          <div className={s.panel}>
            <div className={s.panelHeader}>
              <span className={s.panelTitle}>✅ Conformidade por Setor</span>
            </div>
            <div className={s.panelBody}>
              {loading ? (
                <div className={s.skeletonCell} style={{ height: 220, width: '100%' }} />
              ) : data ? (
                <ComplianceChart zones={data.zones} />
              ) : null}
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}

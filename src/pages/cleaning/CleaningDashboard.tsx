import { useMemo } from 'react'
import { useNavigate }       from 'react-router-dom'
import {
  useCleaningDashboard, computeKPIs,
} from '@/hooks/useCleaningData'
import ScoreRing from '@/components/cleaning/ScoreRing'
import { STATUS_META } from '@/types/cleaning'
import { scoreToColor, formatDate } from '@/lib/cleaning-scoring'
import type { ZonePerformance, EmployeePerformance, CleaningInspection } from '@/types/cleaning'
import s from './CleaningDashboard.module.css'

// ── KPI card ──────────────────────────────────────────

function KPICard({ icon, label, value, unit, color }: {
  icon: string; label: string; value: number | string; unit?: string; color: string
}) {
  return (
    <div className={s.kpiCard} style={{ borderTopColor: color }}>
      <div className={s.kpiIcon}>{icon}</div>
      <div className={s.kpiValue} style={{ color }}>
        {value}{unit && <span className={s.kpiUnit}>{unit}</span>}
      </div>
      <div className={s.kpiLabel}>{label}</div>
    </div>
  )
}

// ── Zone card ─────────────────────────────────────────

function ZoneCard({ zone, onInspect, onHistory }: {
  zone: ZonePerformance
  onInspect: (id: string) => void
  onHistory: (id: string) => void
}) {
  const hasData = zone.totalInspections > 0
  const score   = zone.latestScore ?? 0
  const meta    = hasData && zone.latestStatus !== 'no_data'
    ? STATUS_META[zone.latestStatus as keyof typeof STATUS_META]
    : null

  return (
    <div
      className={s.zoneCard}
      style={{ borderLeftColor: hasData ? scoreToColor(score) : '#e2e8f0' }}
    >
      <div className={s.zoneHeader}>
        <div className={s.zoneIcon}>{zone.zoneIcon}</div>
        <div className={s.zoneMeta}>
          <span className={s.zoneName}>{zone.zoneName}</span>
          {meta && (
            <span className={s.zoneBadge} style={{ color: meta.color, background: meta.bg }}>
              {meta.icon} {meta.label}
            </span>
          )}
          {!hasData && (
            <span className={s.zoneBadge} style={{ color: '#94a3b8', background: '#f8fafc' }}>
              ⚪ Sem dados
            </span>
          )}
        </div>
        {hasData && <ScoreRing score={score} size={64} stroke={6} />}
      </div>

      {hasData && (
        <div className={s.zoneDetails}>
          <span className={s.zoneDetail}>
            👤 {zone.latestEmployee}
          </span>
          <span className={s.zoneDetail}>
            📅 {formatDate(zone.latestTs)}
          </span>
          <span className={s.zoneDetail}>
            📋 {zone.totalInspections} inspeção{zone.totalInspections !== 1 ? 'ões' : ''}
          </span>
          {zone.issueCount > 0 && (
            <span className={s.zoneDetail} style={{ color: '#dc2626' }}>
              ⚠️ {zone.issueCount} ocorrência{zone.issueCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {hasData && zone.scoreHistory.length > 1 && (
        <div className={s.sparkline}>
          <MiniSparkline history={zone.scoreHistory} />
        </div>
      )}

      <div className={s.zoneActions}>
        <button className={s.btnPrimary} onClick={() => onInspect(zone.zoneId)}>
          + Nova Inspeção
        </button>
        <button className={s.btnSecondary} onClick={() => onHistory(zone.zoneId)}>
          Histórico
        </button>
      </div>
    </div>
  )
}

function MiniSparkline({ history }: { history: Array<{ ts: number; score: number }> }) {
  const w = 120, h = 28, pad = 2
  const scores = history.map(h => h.score)
  const min = Math.min(...scores), max = Math.max(...scores)
  const range = max - min || 1
  const pts = scores.map((sc, i) => {
    const x = pad + (i / (scores.length - 1)) * (w - pad * 2)
    const y = h - pad - ((sc - min) / range) * (h - pad * 2)
    return `${x},${y}`
  }).join(' ')
  const last = scores[scores.length - 1]
  return (
    <svg width={w} height={h} className={s.sparklineSvg}>
      <polyline points={pts} fill="none" stroke={scoreToColor(last)} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  )
}

// ── Employee row ─────────────────────────────────────

function EmployeeRow({ emp, rank }: { emp: EmployeePerformance; rank: number }) {
  const hasData = emp.status !== 'no_data'
  const medals  = ['🥇', '🥈', '🥉']

  return (
    <div className={s.empRow}>
      <div className={s.empRank}>
        {rank <= 3 && hasData ? medals[rank - 1] : <span className={s.rankNum}>{rank}</span>}
      </div>
      <div className={s.empInfo}>
        <span className={s.empName}>{emp.employeeName}</span>
        <span className={s.empCargo}>{emp.cargo}</span>
      </div>
      <div className={s.empRight}>
        {hasData ? (
          <>
            <span className={s.empScore} style={{ color: scoreToColor(emp.averageScore) }}>
              {emp.averageScore}%
            </span>
            <div className={s.empBar}>
              <div
                className={s.empBarFill}
                style={{ width: `${emp.averageScore}%`, background: scoreToColor(emp.averageScore) }}
              />
            </div>
            <span className={s.empInspCount}>{emp.totalInspections} insp.</span>
          </>
        ) : (
          <span className={s.empNoData}>Sem avaliação</span>
        )}
      </div>
    </div>
  )
}

// ── Alert banner ─────────────────────────────────────

function AlertBanner({ zonePerf }: { zonePerf: ZonePerformance[] }) {
  const critical  = zonePerf.filter(z => z.latestScore !== null && z.latestScore < 50)
  const attention = zonePerf.filter(z => z.latestScore !== null && z.latestScore >= 50 && z.latestScore < 75)

  if (critical.length > 0) {
    return (
      <div className={s.alert} style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
        <span>🔴</span>
        <span>
          <strong>{critical.length} zona{critical.length > 1 ? 's' : ''} crítica{critical.length > 1 ? 's' : ''}:</strong>{' '}
          {critical.map(z => z.zoneName).join(', ')} — Ação imediata necessária.
        </span>
      </div>
    )
  }
  if (attention.length > 0) {
    return (
      <div className={s.alert} style={{ background: '#fff7ed', borderColor: '#fed7aa' }}>
        <span>🟠</span>
        <span>
          <strong>{attention.length} zona{attention.length > 1 ? 's' : ''} em atenção:</strong>{' '}
          {attention.map(z => z.zoneName).join(', ')}
        </span>
      </div>
    )
  }
  return (
    <div className={s.alert} style={{ background: '#f0fdf4', borderColor: '#86efac' }}>
      <span>🟢</span>
      <span>Todas as zonas com avaliação estão dentro dos padrões aceitáveis.</span>
    </div>
  )
}

// ── Champion card ─────────────────────────────────────

function ChampionCard({ period, inspections, employeePerf }: {
  period: 'weekly' | 'monthly'
  inspections: CleaningInspection[]
  employeePerf: EmployeePerformance[]
}) {
  const days   = period === 'weekly' ? 7 : 30
  const label  = period === 'weekly' ? 'Destaque Semanal' : 'Destaque Mensal'
  const cutoff = Date.now() - days * 24 * 3_600_000
  const recent = inspections.filter(i => i.timestampEnvio >= cutoff)

  const champion = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const insp of recent) {
      if (!map.has(insp.employeeId)) map.set(insp.employeeId, [])
      map.get(insp.employeeId)!.push(insp.score)
    }
    let best: { id: string; avg: number; count: number } | null = null
    for (const [id, scores] of map) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      if (!best || avg > best.avg) best = { id, avg: Math.round(avg), count: scores.length }
    }
    if (!best) return null
    const emp = employeePerf.find(e => e.employeeId === best!.id)
    return { ...best, name: emp?.employeeName ?? '—', cargo: emp?.cargo ?? '—' }
  }, [recent, employeePerf])

  const accent = period === 'weekly' ? '#6366f1' : '#f59e0b'

  return (
    <div className={s.championCard} style={{ borderTopColor: accent }}>
      <div className={s.championLabel} style={{ color: accent }}>{label}</div>
      {champion ? (
        <>
          <div className={s.championMedal}>{period === 'weekly' ? '⭐' : '🏆'}</div>
          <div className={s.championName}>{champion.name}</div>
          <div className={s.championCargo}>{champion.cargo}</div>
          <div className={s.championScore} style={{ color: scoreToColor(champion.avg) }}>
            {champion.avg}%
          </div>
          <div className={s.championInsp}>{champion.count} inspeç{champion.count > 1 ? 'ões' : 'ão'}</div>
        </>
      ) : (
        <div className={s.championEmpty}>Sem inspeções no período</div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────

export default function CleaningDashboard() {
  const nav = useNavigate()
  const { inspections, zonePerf, employeePerf, loading, error, refresh } = useCleaningDashboard()
  const kpis = useMemo(() => computeKPIs(inspections, zonePerf), [inspections, zonePerf])

  const sortedZones = useMemo(
    () => [...zonePerf].sort((a, b) => {
      if (a.totalInspections === 0 && b.totalInspections > 0) return 1
      if (b.totalInspections === 0 && a.totalInspections > 0) return -1
      return (a.latestScore ?? 0) - (b.latestScore ?? 0)
    }),
    [zonePerf],
  )

  const rankedEmployees = useMemo(
    () => [...employeePerf].sort((a, b) => {
      if (a.status === 'no_data' && b.status !== 'no_data') return 1
      if (b.status === 'no_data' && a.status !== 'no_data') return -1
      return b.averageScore - a.averageScore
    }),
    [employeePerf],
  )

  return (
    <div className={s.page}>

      {/* Header */}
      <div className={s.header}>
        <div>
          <h1 className={s.title}>🧹 Limpeza 5S</h1>
          <p className={s.subtitle}>Gestão de limpeza e inspeções por zona</p>
        </div>
        <div className={s.headerActions}>
          <button className={s.btnSecondary} onClick={refresh} disabled={loading}>
            {loading ? 'Carregando…' : '↻ Atualizar'}
          </button>
          <button className={s.btnPrimary} onClick={() => nav('/limpeza/ranking')}>
            🏆 Rankings
          </button>
          <button className={s.btnPrimary} onClick={() => nav('/limpeza/historico')}>
            📋 Histórico
          </button>
        </div>
      </div>

      {error && <div className={s.errorBanner}>{error}</div>}

      {/* KPIs */}
      <div className={s.kpiRow}>
        <KPICard icon="📊" label="Média Geral (30d)"   value={kpis.avgScore}     unit="%"  color="#6366f1" />
        <KPICard icon="📋" label="Inspeções (30d)"     value={kpis.totalInsp}           color="#0ea5e9" />
        <KPICard icon="⚠️" label="Ações em Aberto"     value={kpis.openActions}         color="#f59e0b" />
        <KPICard icon="🔴" label="Zonas Críticas"      value={kpis.criticalZones}        color="#dc2626" />
        <KPICard icon="✅" label="Conformidade"         value={kpis.compliance}  unit="%"  color="#16a34a" />
      </div>

      {/* Alert */}
      {!loading && zonePerf.some(z => z.totalInspections > 0) && (
        <AlertBanner zonePerf={zonePerf} />
      )}

      {/* Champions */}
      <div className={s.championsRow}>
        <ChampionCard period="weekly"  inspections={inspections} employeePerf={employeePerf} />
        <ChampionCard period="monthly" inspections={inspections} employeePerf={employeePerf} />
      </div>

      {/* Zone grid */}
      <div className={s.sectionHeader}>
        <h2 className={s.sectionTitle}>Zonas</h2>
        <span className={s.sectionCount}>{zonePerf.length} zonas</span>
      </div>

      {loading ? (
        <div className={s.loading}>Carregando zonas…</div>
      ) : (
        <div className={s.zoneGrid}>
          {sortedZones.map(zone => (
            <ZoneCard
              key={zone.zoneId}
              zone={zone}
              onInspect={id => nav(`/limpeza/inspecao/${id}`)}
              onHistory={id => nav(`/limpeza/historico?zona=${id}`)}
            />
          ))}
        </div>
      )}

      {/* Rankings */}
      <div className={s.rankingSection}>
        <div className={s.sectionHeader}>
          <h2 className={s.sectionTitle}>Ranking de Funcionários</h2>
          <button className={s.linkBtn} onClick={() => nav('/limpeza/ranking')}>
            Ver completo →
          </button>
        </div>

        <div className={s.rankingList}>
          {rankedEmployees.slice(0, 6).map((emp, i) => (
            <EmployeeRow key={emp.employeeId} emp={emp} rank={i + 1} />
          ))}
        </div>
      </div>

    </div>
  )
}

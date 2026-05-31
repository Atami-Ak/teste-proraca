import { useMemo, type CSSProperties } from 'react'
import { useNavigate, Link }           from 'react-router-dom'
import { useCleaningDashboard, computeKPIs } from '@/hooks/useCleaningData'
import ScoreRing                        from '@/components/cleaning/ScoreRing'
import { STATUS_META }                  from '@/types/cleaning'
import { scoreToColor, formatDate }     from '@/lib/cleaning-scoring'
import type { ZonePerformance, EmployeePerformance, CleaningInspection } from '@/types/cleaning'
import s from './CleaningDashboard.module.css'

// ── SVG icons ──────────────────────────────────────────
const Ic = {
  Sparkles:   () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/></svg>,
  Chart:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Clipboard:  () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
  AlertTri:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  CheckCircle:() => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>,
  Trophy:     () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 13 8 19"/><polyline points="16 13 16 19"/><line x1="5" y1="19" x2="19" y2="19"/><path d="M17 3H7v7a5 5 0 0 0 10 0V3z"/><path d="M7 6H4a1 1 0 0 0-1 1v2a4 4 0 0 0 4 4"/><path d="M17 6h3a1 1 0 0 1 1 1v2a4 4 0 0 1-4 4"/></svg>,
  Star:       () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>,
  User:       () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Calendar:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Warning:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Plus:       () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  History:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>,
  Refresh:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23,4 23,10 17,10"/><polyline points="1,20 1,14 7,14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  Users:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  ChevRight:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>,
  ShieldOk:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9,12 11,14 15,10"/></svg>,
}

// ── KPI Card ───────────────────────────────────────────
function KPICard({ icon, label, value, unit, color }: {
  icon: React.ReactNode; label: string; value: number | string; unit?: string; color: string
}) {
  return (
    <div className={s.kpiCard} style={{ '--kpi-color': color } as CSSProperties}>
      <div className={s.kpiBar} />
      <div className={s.kpiIconWrap} style={{ background: color + '18', color }}>{icon}</div>
      <div className={s.kpiBody}>
        <div className={s.kpiValue} style={{ color }}>
          {value}{unit && <span className={s.kpiUnit}>{unit}</span>}
        </div>
        <div className={s.kpiLabel}>{label}</div>
      </div>
    </div>
  )
}

// ── Alert banner ───────────────────────────────────────
function AlertBanner({ zonePerf }: { zonePerf: ZonePerformance[] }) {
  const critical  = zonePerf.filter(z => z.latestScore !== null && z.latestScore < 50)
  const attention = zonePerf.filter(z => z.latestScore !== null && z.latestScore >= 50 && z.latestScore < 75)

  if (critical.length > 0) return (
    <div className={s.alertBanner} style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
      <span className={s.alertIcon}><Ic.AlertTri /></span>
      <div>
        <strong>{critical.length} zona{critical.length > 1 ? 's' : ''} crítica{critical.length > 1 ? 's' : ''} detectada{critical.length > 1 ? 's' : ''}:</strong>
        {' '}{critical.map(z => z.zoneName).join(', ')} — Ação imediata necessária.
      </div>
    </div>
  )

  if (attention.length > 0) return (
    <div className={s.alertBanner} style={{ background: '#fff7ed', borderColor: '#fed7aa', color: '#92400e' }}>
      <span className={s.alertIcon}><Ic.Warning /></span>
      <div>
        <strong>{attention.length} zona{attention.length > 1 ? 's' : ''} em atenção:</strong>
        {' '}{attention.map(z => z.zoneName).join(', ')} — Requer monitoramento.
      </div>
    </div>
  )

  return (
    <div className={s.alertBanner} style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#166534' }}>
      <span className={s.alertIcon}><Ic.ShieldOk /></span>
      <span>Todas as zonas avaliadas estão dentro dos padrões aceitáveis.</span>
    </div>
  )
}

// ── Champion card ──────────────────────────────────────
function ChampionCard({ period, inspections, employeePerf }: {
  period: 'weekly' | 'monthly'
  inspections: CleaningInspection[]
  employeePerf: EmployeePerformance[]
}) {
  const days  = period === 'weekly' ? 7 : 30
  const label = period === 'weekly' ? 'Destaque Semanal' : 'Destaque Mensal'
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
  const initial = champion?.name?.[0]?.toUpperCase() ?? '?'

  return (
    <div className={s.championCard} style={{ '--champion-accent': accent } as CSSProperties}>
      <div className={s.championAccent} />
      <div className={s.championTop}>
        <div className={s.championLabelWrap}>
          {period === 'weekly' ? <Ic.Star /> : <Ic.Trophy />}
          <span className={s.championLabel} style={{ color: accent }}>{label}</span>
        </div>
        <span className={s.championPeriod}>{days}d</span>
      </div>

      {champion ? (
        <div className={s.championBody}>
          <div className={s.championAvatar} style={{ background: accent + '20', color: accent }}>
            {initial}
          </div>
          <div className={s.championInfo}>
            <div className={s.championName}>{champion.name}</div>
            <div className={s.championCargo}>{champion.cargo}</div>
          </div>
          <div className={s.championRight}>
            <div className={s.championScore} style={{ color: scoreToColor(champion.avg) }}>
              {champion.avg}%
            </div>
            <div className={s.championInsp}>{champion.count} insp.</div>
          </div>
        </div>
      ) : (
        <div className={s.championEmpty}>Sem inspeções no período</div>
      )}
    </div>
  )
}

// ── Mini sparkline ─────────────────────────────────────
function MiniSparkline({ history }: { history: Array<{ ts: number; score: number }> }) {
  const w = 100, h = 28, pad = 2
  const scores = history.map(h => h.score)
  const min = Math.min(...scores), max = Math.max(...scores)
  const range = max - min || 1
  const pts = scores.map((sc, i) => {
    const x = pad + (i / Math.max(scores.length - 1, 1)) * (w - pad * 2)
    const y = h - pad - ((sc - min) / range) * (h - pad * 2)
    return `${x},${y}`
  }).join(' ')
  const last = scores[scores.length - 1]
  const color = scoreToColor(last)
  return (
    <svg width={w} height={h} className={s.sparklineSvg}>
      <defs>
        <linearGradient id={`sg-${last}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Zone card ──────────────────────────────────────────
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
  const color = hasData ? scoreToColor(score) : '#94a3b8'

  return (
    <div className={s.zoneCard} style={{ '--zone-color': color } as CSSProperties}>
      <div className={s.zoneAccent} />

      <div className={s.zoneHead}>
        <div className={s.zoneIconBox}>
          <span className={s.zoneEmoji}>{zone.zoneIcon}</span>
        </div>
        <div className={s.zoneTitleWrap}>
          <span className={s.zoneName}>{zone.zoneName}</span>
          {meta ? (
            <span className={s.zoneBadge} style={{ color: meta.color, background: meta.bg }}>
              {meta.label}
            </span>
          ) : (
            <span className={s.zoneBadge} style={{ color: '#94a3b8', background: '#f8fafc' }}>
              Sem dados
            </span>
          )}
        </div>
        {hasData && (
          <div className={s.zoneRing}>
            <ScoreRing score={score} size={60} stroke={6} />
          </div>
        )}
      </div>

      {hasData ? (
        <div className={s.zoneMeta}>
          <div className={s.zoneMetaRow}>
            <span className={s.zoneMetaIcon}><Ic.User /></span>
            <span className={s.zoneMetaText}>{zone.latestEmployee}</span>
          </div>
          <div className={s.zoneMetaRow}>
            <span className={s.zoneMetaIcon}><Ic.Calendar /></span>
            <span className={s.zoneMetaText}>{formatDate(zone.latestTs)}</span>
          </div>
          <div className={s.zoneMetaRow}>
            <span className={s.zoneMetaIcon}><Ic.Clipboard /></span>
            <span className={s.zoneMetaText}>
              {zone.totalInspections} inspeç{zone.totalInspections !== 1 ? 'ões' : 'ão'}
            </span>
          </div>
          {zone.issueCount > 0 && (
            <div className={s.zoneMetaRow}>
              <span className={s.zoneMetaIcon} style={{ color: '#dc2626' }}><Ic.Warning /></span>
              <span className={s.zoneMetaText} style={{ color: '#dc2626' }}>
                {zone.issueCount} ocorrência{zone.issueCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className={s.zoneNoData}>
          Nenhuma inspeção registrada ainda
        </div>
      )}

      {hasData && zone.scoreHistory.length > 1 && (
        <div className={s.zoneSparkline}>
          <span className={s.zoneSparkLabel}>Tendência</span>
          <MiniSparkline history={zone.scoreHistory} />
        </div>
      )}

      <div className={s.zoneActions}>
        <button className={s.zoneActPrimary} onClick={() => onInspect(zone.zoneId)}>
          <Ic.Plus /> Nova Inspeção
        </button>
        <button className={s.zoneActSecondary} onClick={() => onHistory(zone.zoneId)}>
          <Ic.History /> Histórico
        </button>
      </div>
    </div>
  )
}

// ── Employee row ───────────────────────────────────────
function EmployeeRow({ emp, rank }: { emp: EmployeePerformance; rank: number }) {
  const hasData = emp.status !== 'no_data'
  const initial = emp.employeeName?.[0]?.toUpperCase() ?? '?'
  const avatarBg = hasData ? scoreToColor(emp.averageScore) : '#94a3b8'

  return (
    <div className={s.empRow}>
      <div className={s.empRankNum}>
        {rank <= 3 && hasData ? (
          <span className={s.empMedal}>
            {['🥇','🥈','🥉'][rank - 1]}
          </span>
        ) : (
          <span className={s.empRankNum}>#{rank}</span>
        )}
      </div>
      <div className={s.empAvatar} style={{ background: avatarBg + '20', color: avatarBg }}>
        {initial}
      </div>
      <div className={s.empInfo}>
        <span className={s.empName}>{emp.employeeName}</span>
        <span className={s.empCargo}>{emp.cargo}</span>
      </div>
      <div className={s.empRight}>
        {hasData ? (
          <>
            <div className={s.empBarWrap}>
              <div className={s.empBar}>
                <div className={s.empBarFill}
                  style={{ width: `${emp.averageScore}%`, background: scoreToColor(emp.averageScore) }} />
              </div>
              <span className={s.empScore} style={{ color: scoreToColor(emp.averageScore) }}>
                {emp.averageScore}%
              </span>
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

// ══════════════════════════════════════════════════════
// CleaningDashboard
// ══════════════════════════════════════════════════════
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
        <div className={s.headerLeft}>
          <div className={s.headerIconBox}><Ic.Sparkles /></div>
          <div>
            <h1 className={s.title}>Limpeza 5S</h1>
            <p className={s.subtitle}>Gestão de limpeza e inspeções por zona</p>
          </div>
        </div>
        <div className={s.headerActions}>
          <button className={s.btnGhost} onClick={refresh} disabled={loading}>
            <Ic.Refresh /> {loading ? 'Carregando…' : 'Atualizar'}
          </button>
          <Link to="/limpeza/historico" className={s.btnGhost}>
            <Ic.History /> Histórico
          </Link>
          <Link to="/limpeza/ranking" className={s.btnPrimary}>
            <Ic.Trophy /> Rankings
          </Link>
        </div>
      </div>

      {error && <div className={s.errorBanner}>{error}</div>}

      {/* Alert */}
      {!loading && zonePerf.some(z => z.totalInspections > 0) && (
        <AlertBanner zonePerf={zonePerf} />
      )}

      {/* KPIs */}
      <div className={s.kpiRow}>
        <KPICard icon={<Ic.Chart />}       label="Média Geral (30d)"  value={kpis.avgScore}    unit="%" color="#6366f1" />
        <KPICard icon={<Ic.Clipboard />}   label="Inspeções (30d)"    value={kpis.totalInsp}        color="#0ea5e9" />
        <KPICard icon={<Ic.AlertTri />}    label="Ações em Aberto"    value={kpis.openActions}      color="#f59e0b" />
        <KPICard icon={<Ic.Warning />}     label="Zonas Críticas"     value={kpis.criticalZones}    color="#dc2626" />
        <KPICard icon={<Ic.CheckCircle />} label="Conformidade"       value={kpis.compliance}  unit="%" color="#16a34a" />
      </div>

      {/* Champions */}
      <div className={s.championsRow}>
        <ChampionCard period="weekly"  inspections={inspections} employeePerf={employeePerf} />
        <ChampionCard period="monthly" inspections={inspections} employeePerf={employeePerf} />
      </div>

      {/* Zones */}
      <div className={s.sectionHeader}>
        <div className={s.sectionLeft}>
          <h2 className={s.sectionTitle}>Zonas de Limpeza</h2>
          <span className={s.sectionCount}>{zonePerf.length} zonas</span>
        </div>
      </div>

      {loading ? (
        <div className={s.loadingBox}>
          <Ic.Sparkles />
          <span>Carregando zonas…</span>
        </div>
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

      {/* Employee ranking */}
      <div className={s.sectionHeader} style={{ marginTop: 8 }}>
        <div className={s.sectionLeft}>
          <h2 className={s.sectionTitle}>Ranking de Funcionários</h2>
          <span className={s.sectionCount}>{rankedEmployees.filter(e => e.status !== 'no_data').length} avaliados</span>
        </div>
        <button className={s.sectionLink} onClick={() => nav('/limpeza/ranking')}>
          Ver completo <Ic.ChevRight />
        </button>
      </div>

      <div className={s.rankingCard}>
        {rankedEmployees.length === 0 ? (
          <div className={s.rankingEmpty}>
            <Ic.Users />
            <span>Nenhum funcionário avaliado ainda.</span>
          </div>
        ) : (
          <div className={s.rankingList}>
            {rankedEmployees.slice(0, 6).map((emp, i) => (
              <EmployeeRow key={emp.employeeId} emp={emp} rank={i + 1} />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

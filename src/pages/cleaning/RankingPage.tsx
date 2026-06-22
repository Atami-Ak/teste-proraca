import { useState, useMemo, type CSSProperties } from 'react'
import { Link }                         from 'react-router-dom'
import { useCleaningHistory, CATALOGO_ZONAS, EQUIPE_LIMPEZA } from '@/hooks/useCleaningData'
import {
  computeEmployeeRanking, computeZoneRanking,
  scoreToColor,
  type RankedEmployee, type RankedZone,
} from '@/lib/cleaning-scoring'
import s from './RankingPage.module.css'

// ── SVG icons ──────────────────────────────────────────
const Ic = {
  Back:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6"/></svg>,
  Trophy:  () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 13 8 19"/><polyline points="16 13 16 19"/><line x1="5" y1="19" x2="19" y2="19"/><path d="M17 3H7v7a5 5 0 0 0 10 0V3z"/><path d="M7 6H4a1 1 0 0 0-1 1v2a4 4 0 0 0 4 4"/><path d="M17 6h3a1 1 0 0 1 1 1v2a4 4 0 0 1-4 4"/></svg>,
  Users:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  MapPin:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Trend:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/></svg>,
}

type Period = 'weekly' | 'monthly'

// ── Podium ─────────────────────────────────────────────
function Podium({ top3 }: { top3: RankedEmployee[] }) {
  const ORDER   = [1, 0, 2]
  const RANK_HEIGHTS = [70, 90, 60]  // original rank 0→90, 1→70, 2→60
  const LABELS  = ['2º', '1º', '3º']
  const MEDALS  = ['🥈', '🥇', '🥉']
  const COLORS  = ['#94a3b8', '#f59e0b', '#b45309']

  return (
    <div className={s.podium}>
      {ORDER.map((empIdx, posIdx) => {
        const emp    = top3[empIdx]
        const color  = emp ? scoreToColor(emp.averageScore) : '#e2e8f0'
        const height = RANK_HEIGHTS[empIdx]
        const initial = emp?.employeeName?.[0]?.toUpperCase() ?? '?'
        const medalColor = COLORS[empIdx]

        return (
          <div key={posIdx} className={s.podiumSlot}
            style={{ '--slot-height': `${height}px` } as CSSProperties}>

            {emp ? (
              <>
                <div className={s.podiumAvatar} style={{ background: color + '20', color, borderColor: color + '60' }}>
                  {initial}
                </div>
                <div className={s.podiumMedal}>{MEDALS[empIdx]}</div>
                <div className={s.podiumName}>{emp.employeeName}</div>
                <div className={s.podiumCargo}>{emp.cargo}</div>
                {emp.zoneNames.length > 0 && (
                  <div className={s.podiumZone}>{emp.zoneNames[0]}</div>
                )}
              </>
            ) : (
              <div className={s.podiumEmpty}>
                <span style={{ opacity: 0.3, fontSize: '1.5rem' }}>{MEDALS[empIdx]}</span>
              </div>
            )}

            <div className={s.podiumPlatform} style={{
              height,
              background: emp ? color : '#e2e8f0',
              boxShadow: emp ? `0 4px 20px ${color}30` : 'none',
            }}>
              {emp ? (
                <>
                  <div className={s.podiumScore}>{emp.averageScore}%</div>
                  <div className={s.podiumInsp}>{emp.totalInspections} insp.</div>
                </>
              ) : (
                <div className={s.podiumScore} style={{ color: '#94a3b8' }}>—</div>
              )}
              <div className={s.podiumLabel} style={{ color: medalColor }}>{LABELS[posIdx]}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Leaderboard row ────────────────────────────────────
function LeaderRow({ emp, rank }: { emp: RankedEmployee; rank: number }) {
  const color   = emp.hasData ? scoreToColor(emp.averageScore) : '#94a3b8'
  const initial = emp.employeeName?.[0]?.toUpperCase() ?? '?'

  const perfLabel = emp.hasData ? (() => {
    if (emp.averageScore >= 90) return { label: 'Excelente', color: '#16a34a' }
    if (emp.averageScore >= 75) return { label: 'Aceitável', color: '#d97706' }
    if (emp.averageScore >= 50) return { label: 'Atenção',   color: '#ea580c' }
    return { label: 'Crítico', color: '#dc2626' }
  })() : null

  return (
    <div className={s.leaderRow}>
      <div className={s.leaderRank}>#{rank}</div>
      <div className={s.leaderAvatar} style={{ background: color + '20', color }}>
        {initial}
      </div>
      <div className={s.leaderInfo}>
        <span className={s.leaderName}>{emp.employeeName}</span>
        <span className={s.leaderCargo}>{emp.cargo}</span>
        {emp.zoneNames.length > 0 && (
          <span className={s.leaderZone}>{emp.zoneNames.join(', ')}</span>
        )}
      </div>
      <div className={s.leaderRight}>
        {emp.hasData ? (
          <>
            <div className={s.leaderScoreRow}>
              <span className={s.leaderScore} style={{ color }}>{emp.averageScore}%</span>
              {perfLabel && (
                <span className={s.leaderPerf} style={{ color: perfLabel.color, background: perfLabel.color + '14' }}>
                  {perfLabel.label}
                </span>
              )}
            </div>
            <div className={s.leaderBarWrap}>
              <div className={s.leaderBar}>
                <div className={s.leaderBarFill}
                  style={{ width: `${emp.averageScore}%`, background: color }} />
              </div>
            </div>
            <span className={s.leaderInsp}>{emp.totalInspections} inspeç{emp.totalInspections !== 1 ? 'ões' : 'ão'}</span>
          </>
        ) : (
          <span className={s.leaderNoData}>Sem avaliação</span>
        )}
      </div>
    </div>
  )
}

// ── Zone ranking card ──────────────────────────────────
function ZoneCard({ zone, rank }: { zone: RankedZone; rank: number }) {
  const color = zone.hasData ? scoreToColor(zone.averageScore) : '#94a3b8'

  return (
    <div className={s.zoneCard} style={{ '--zone-color': color } as CSSProperties}>
      <div className={s.zoneCardAccent} />
      <div className={s.zoneCardHead}>
        <div className={s.zoneRankBadge}>#{rank}</div>
        <div className={s.zoneIconBox}>{zone.zoneIcon}</div>
        <div className={s.zoneCardInfo}>
          <span className={s.zoneCardName}>{zone.zoneName}</span>
          {zone.teamNames.length > 0 && (
            <span className={s.zoneCardTeam}>{zone.teamNames.join(' · ')}</span>
          )}
        </div>
        {zone.hasData ? (
          <span className={s.zoneCardScore} style={{ color }}>{zone.averageScore}%</span>
        ) : (
          <span className={s.zoneNoData}>—</span>
        )}
      </div>
      {zone.hasData && (
        <>
          <div className={s.zoneCardBar}>
            <div className={s.zoneCardBarFill}
              style={{ width: `${zone.averageScore}%`, background: color }} />
          </div>
          <div className={s.zoneCardMeta}>
            <span>{zone.totalInspections} inspeç{zone.totalInspections !== 1 ? 'ões' : 'ão'}</span>
          </div>
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// RankingPage
// ══════════════════════════════════════════════════════
export default function RankingPage() {
  const { inspections, loading } = useCleaningHistory()
  const [period, setPeriod] = useState<Period>('weekly')

  const days = period === 'weekly' ? 7 : 30

  const empRanking = useMemo(
    () => computeEmployeeRanking(inspections, EQUIPE_LIMPEZA, days),
    [inspections, days],
  )

  const zoneRanking = useMemo(
    () => computeZoneRanking(inspections, CATALOGO_ZONAS, EQUIPE_LIMPEZA, days),
    [inspections, days],
  )

  const top3    = empRanking.filter(e => e.hasData).slice(0, 3)
  const rest    = empRanking.filter(e => e.hasData).slice(3)
  const noData  = empRanking.filter(e => !e.hasData)

  return (
    <div className={s.page}>

      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <Link to="/limpeza" className={s.backBtn}><Ic.Back /> Limpeza</Link>
          <div className={s.divider} />
          <div className={s.headerTitleWrap}>
            <div className={s.headerIcon}><Ic.Trophy /></div>
            <div>
              <h1 className={s.title}>Rankings 5S</h1>
              <p className={s.subtitle}>Desempenho de funcionários e zonas</p>
            </div>
          </div>
        </div>

        {/* Period toggle */}
        <div className={s.periodToggle}>
          <button
            className={`${s.periodBtn} ${period === 'weekly' ? s.periodActive : ''}`}
            onClick={() => setPeriod('weekly')}
          >
            Semanal (7d)
          </button>
          <button
            className={`${s.periodBtn} ${period === 'monthly' ? s.periodActive : ''}`}
            onClick={() => setPeriod('monthly')}
          >
            Mensal (30d)
          </button>
        </div>
      </div>

      {loading ? (
        <div className={s.loading}>Calculando rankings…</div>
      ) : (
        <>
          {/* Podium */}
          <div className={s.section}>
            <div className={s.sectionHeader}>
              <h2 className={s.sectionTitle}>Pódio — Top 3 Funcionários</h2>
              <span className={s.sectionSub}>{period === 'weekly' ? 'Últimos 7 dias' : 'Últimos 30 dias'}</span>
            </div>
            {top3.length === 0 ? (
              <div className={s.empty}>
                <Ic.Users />
                <span>Sem inspeções no período selecionado.</span>
              </div>
            ) : (
              <div className={s.podiumWrap}>
                <Podium top3={top3} />
              </div>
            )}
          </div>

          {/* Full leaderboard */}
          {(rest.length > 0 || noData.length > 0) && (
            <div className={s.section}>
              <div className={s.sectionHeader}>
                <h2 className={s.sectionTitle}>Leaderboard Completo</h2>
                <span className={s.sectionSub}>{rest.length + noData.length} funcionários</span>
              </div>
              <div className={s.leaderCard}>
                {[...rest, ...noData].map((emp, i) => (
                  <LeaderRow key={emp.employeeId} emp={emp} rank={top3.length + i + 1} />
                ))}
              </div>
            </div>
          )}

          {/* Zone ranking */}
          <div className={s.section}>
            <div className={s.sectionHeader}>
              <h2 className={s.sectionTitle}>Ranking por Zona</h2>
              <span className={s.sectionSub}>{zoneRanking.length} zonas</span>
            </div>
            <div className={s.zoneGrid}>
              {zoneRanking.map((zone, i) => (
                <ZoneCard key={zone.zoneId} zone={zone} rank={i + 1} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

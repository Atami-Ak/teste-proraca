import { useState, useMemo }            from 'react'
import { useNavigate }                  from 'react-router-dom'
import { useCleaningHistory, CATALOGO_ZONAS, EQUIPE_LIMPEZA } from '@/hooks/useCleaningData'
import {
  computeEmployeeRanking, computeZoneRanking,
  scoreToColor, scoreToColorLight,
  type RankedEmployee, type RankedZone,
} from '@/lib/cleaning-scoring'
import s from './RankingPage.module.css'

// ── Period toggle ─────────────────────────────────────

type Period = 'weekly' | 'monthly'

// ── Podium ────────────────────────────────────────────

function Podium({ top3 }: { top3: RankedEmployee[] }) {
  const MEDALS = ['🥇', '🥈', '🥉']
  const ORDER  = [1, 0, 2]  // visual order: 2nd, 1st, 3rd
  const HEIGHTS = { 0: 90, 1: 70, 2: 60 }

  return (
    <div className={s.podium}>
      {ORDER.map(idx => {
        const emp = top3[idx]
        const isFirst = idx === 0
        return (
          <div key={idx} className={`${s.podiumSlot} ${isFirst ? s.podiumFirst : ''}`}>
            {emp ? (
              <>
                <div className={s.podiumMedal}>{MEDALS[idx]}</div>
                <div className={s.podiumName}>{emp.employeeName}</div>
                <div className={s.podiumCargo}>{emp.cargo}</div>
                {emp.zoneNames.length > 0 && (
                  <div className={s.podiumZone}>{emp.zoneNames[0]}</div>
                )}
                <div
                  className={s.podiumPlatform}
                  style={{
                    height: HEIGHTS[idx as keyof typeof HEIGHTS],
                    background: scoreToColor(emp.averageScore),
                  }}
                >
                  <span className={s.podiumScore}>{emp.averageScore}%</span>
                  <span className={s.podiumInsp}>{emp.totalInspections} insp.</span>
                </div>
              </>
            ) : (
              <div className={s.podiumEmpty}>
                <div className={s.podiumMedal} style={{ opacity: 0.25 }}>{MEDALS[idx]}</div>
                <div
                  className={s.podiumPlatform}
                  style={{ height: HEIGHTS[idx as keyof typeof HEIGHTS], background: '#e2e8f0' }}
                >
                  <span className={s.podiumScore} style={{ color: '#94a3b8' }}>—</span>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Leaderboard row ───────────────────────────────────

function LeaderRow({ emp, rank }: { emp: RankedEmployee; rank: number }) {
  const labels: Array<{ min: number; color: string; label: string }> = [
    { min: 90, color: '#16a34a', label: 'Excelente'    },
    { min: 75, color: '#d97706', label: 'Aceitável'    },
    { min: 50, color: '#ea580c', label: 'Atenção'      },
    { min: 0,  color: '#dc2626', label: 'Crítico'      },
  ]
  const perf = emp.hasData
    ? (labels.find(l => emp.averageScore >= l.min) ?? labels[labels.length - 1])
    : null

  return (
    <div className={s.leaderRow}>
      <span className={s.leaderRank}>#{rank}</span>
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
            <span className={s.leaderScore} style={{ color: scoreToColor(emp.averageScore) }}>
              {emp.averageScore}%
            </span>
            <div className={s.leaderBar}>
              <div
                className={s.leaderBarFill}
                style={{ width: `${emp.averageScore}%`, background: scoreToColor(emp.averageScore) }}
              />
            </div>
            <span className={s.leaderPerfBadge} style={{ color: perf!.color, background: scoreToColorLight(emp.averageScore) }}>
              {perf!.label}
            </span>
            <span className={s.leaderInsp}>{emp.totalInspections} insp.</span>
          </>
        ) : (
          <span className={s.leaderNoData}>⚫ Sem avaliação</span>
        )}
      </div>
    </div>
  )
}

// ── Zone ranking grid ─────────────────────────────────

function ZoneGrid({ zones }: { zones: RankedZone[] }) {
  return (
    <div className={s.zoneGrid}>
      {zones.map((zone, i) => (
        <div
          key={zone.zoneId}
          className={s.zoneRankCard}
          style={{ borderLeftColor: zone.hasData ? scoreToColor(zone.averageScore) : '#e2e8f0' }}
        >
          <div className={s.zoneRankHeader}>
            <span className={s.zoneRankPos}>#{i + 1}</span>
            <span className={s.zoneRankIcon}>{zone.zoneIcon}</span>
            <div className={s.zoneRankInfo}>
              <span className={s.zoneRankName}>{zone.zoneName}</span>
              {zone.teamNames.length > 0 && (
                <span className={s.zoneRankTeam}>{zone.teamNames.join(', ')}</span>
              )}
            </div>
            {zone.hasData ? (
              <span className={s.zoneRankScore} style={{ color: scoreToColor(zone.averageScore) }}>
                {zone.averageScore}%
              </span>
            ) : (
              <span className={s.zoneNoData}>—</span>
            )}
          </div>
          {zone.hasData && (
            <>
              <div className={s.zoneRankBar}>
                <div
                  className={s.zoneRankBarFill}
                  style={{ width: `${zone.averageScore}%`, background: scoreToColor(zone.averageScore) }}
                />
              </div>
              <span className={s.zoneRankInsp}>{zone.totalInspections} inspeção{zone.totalInspections > 1 ? 'ões' : ''}</span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────

export default function RankingPage() {
  const nav = useNavigate()
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
        <div>
          <button className={s.backBtn} onClick={() => nav('/limpeza')}>← Voltar</button>
          <h1 className={s.title}>🏆 Rankings 5S</h1>
          <p className={s.subtitle}>Desempenho de funcionários e zonas</p>
        </div>
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
            <h2 className={s.sectionTitle}>Pódio — Top 3 Funcionários</h2>
            {top3.length === 0 ? (
              <div className={s.empty}>Sem inspeções no período selecionado.</div>
            ) : (
              <Podium top3={top3} />
            )}
          </div>

          {/* Full leaderboard */}
          {(rest.length > 0 || noData.length > 0) && (
            <div className={s.section}>
              <h2 className={s.sectionTitle}>Leaderboard Completo</h2>
              <div className={s.leaderboard}>
                {[...rest, ...noData].map((emp, i) => (
                  <LeaderRow key={emp.employeeId} emp={emp} rank={top3.length + i + 1} />
                ))}
              </div>
            </div>
          )}

          {/* Zone ranking */}
          <div className={s.section}>
            <h2 className={s.sectionTitle}>Ranking por Zona</h2>
            <ZoneGrid zones={zoneRanking} />
          </div>
        </>
      )}

    </div>
  )
}

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getEmployeeKPISnapshot } from '@/lib/db-employees'
import type { EmployeeKPISnapshot } from '@/types/employee'
import { STATUS_PERFORMANCE_META } from '@/types/employee'
import s from './EmployeeDashboardPage.module.css'

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = score >= 90 ? '#166534' : score >= 75 ? '#16a34a' : score >= 60 ? '#2563eb' : score >= 40 ? '#d97706' : '#dc2626'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: `rotate(90deg) translate(0, -${size}px) translate(${size/2}px, ${size/2}px)`,
          transformOrigin: `${size/2}px ${size/2}px`, fill: color, fontSize: size * 0.22, fontWeight: 700 }}>
        {score}
      </text>
    </svg>
  )
}

export default function EmployeeDashboardPage() {
  const [kpi, setKpi]       = useState<EmployeeKPISnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getEmployeeKPISnapshot()
      .then(setKpi)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className={s.loadingWrap}><div className={s.spinnerLg} /></div>

  const k = kpi ?? {
    totalAtivos: 0, totalInAtivos: 0, totalAfastados: 0, totalTerceirizados: 0,
    avgScore: 0, excelentes: 0, criticos: 0, atencao: 0,
    totalAvisosNoMes: 0, totalReconhNoMes: 0, topPerformers: [], criticalList: [],
  }

  return (
    <div className={s.page}>

      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>👥 Gestão de Colaboradores</h1>
          <p className={s.pageSub}>Visão executiva do quadro de pessoal e desempenho</p>
        </div>
        <div className={s.headerActions}>
          <Link to="/colaboradores/novo" className={s.btnPrimary}>+ Novo Colaborador</Link>
          <Link to="/colaboradores" className={s.btnSecondary}>Ver Todos</Link>
        </div>
      </div>

      {/* ── Status KPIs ── */}
      <div className={s.statsGrid}>
        <div className={s.statCard}>
          <span className={s.statIcon}>✅</span>
          <div>
            <div className={s.statValue} style={{ color: '#166534' }}>{k.totalAtivos}</div>
            <div className={s.statLabel}>Ativos</div>
          </div>
        </div>
        <div className={s.statCard}>
          <span className={s.statIcon}>🏥</span>
          <div>
            <div className={s.statValue} style={{ color: '#d97706' }}>{k.totalAfastados}</div>
            <div className={s.statLabel}>Afastados</div>
          </div>
        </div>
        <div className={s.statCard}>
          <span className={s.statIcon}>🔗</span>
          <div>
            <div className={s.statValue} style={{ color: '#7c3aed' }}>{k.totalTerceirizados}</div>
            <div className={s.statLabel}>Terceirizados</div>
          </div>
        </div>
        <div className={s.statCard}>
          <span className={s.statIcon}>📊</span>
          <div>
            <div className={s.statValue} style={{ color: k.avgScore >= 75 ? '#166534' : k.avgScore >= 60 ? '#2563eb' : '#d97706' }}>{k.avgScore}</div>
            <div className={s.statLabel}>Score Médio</div>
          </div>
        </div>
        <div className={s.statCard}>
          <span className={s.statIcon}>⭐</span>
          <div>
            <div className={s.statValue} style={{ color: '#16a34a' }}>{k.excelentes}</div>
            <div className={s.statLabel}>Excelentes / M.Bons</div>
          </div>
        </div>
        <div className={s.statCard}>
          <span className={s.statIcon}>🚨</span>
          <div>
            <div className={s.statValue} style={{ color: '#dc2626' }}>{k.criticos}</div>
            <div className={s.statLabel}>Críticos</div>
          </div>
        </div>
        <div className={s.statCard}>
          <span className={s.statIcon}>⚠️</span>
          <div>
            <div className={s.statValue} style={{ color: '#ea580c' }}>{k.totalAvisosNoMes}</div>
            <div className={s.statLabel}>Advertências / Mês</div>
          </div>
        </div>
        <div className={s.statCard}>
          <span className={s.statIcon}>🏆</span>
          <div>
            <div className={s.statValue} style={{ color: '#166534' }}>{k.totalReconhNoMes}</div>
            <div className={s.statLabel}>Reconhecimentos / Mês</div>
          </div>
        </div>
      </div>

      {/* ── Two columns: top performers + critical ── */}
      <div className={s.twoCol}>

        <div className={s.panel}>
          <div className={s.panelHeader}>
            <span className={s.panelIcon}>🏅</span>
            <h2 className={s.panelTitle}>Top Performers</h2>
            <Link to="/colaboradores?sort=score_desc" className={s.panelLink}>Ver ranking →</Link>
          </div>
          {k.topPerformers.length === 0 ? (
            <div className={s.empty}>Nenhum colaborador cadastrado.</div>
          ) : (
            <div className={s.rankList}>
              {k.topPerformers.map((e, i) => {
                const meta = STATUS_PERFORMANCE_META[
                  e.score >= 90 ? 'excelente' : e.score >= 75 ? 'muito_bom' : e.score >= 60 ? 'bom' : e.score >= 40 ? 'atencao' : 'critico'
                ]
                return (
                  <Link key={e.id} to={`/colaboradores/${e.id}`} className={s.rankItem}>
                    <span className={s.rankPos}>{i + 1}°</span>
                    <div className={s.rankAvatar}>{e.nome[0]?.toUpperCase()}</div>
                    <div className={s.rankInfo}>
                      <div className={s.rankName}>{e.nome}</div>
                      <div className={s.rankCargo}>{e.cargo}</div>
                    </div>
                    <ScoreRing score={e.score} size={44} />
                    <span className={s.rankBadge} style={{ color: meta.color, background: meta.bg }}>
                      {meta.label}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        <div className={s.panel}>
          <div className={s.panelHeader}>
            <span className={s.panelIcon}>🚨</span>
            <h2 className={s.panelTitle}>Atenção Necessária</h2>
            <Link to="/colaboradores?filter=critico" className={s.panelLink}>Ver todos →</Link>
          </div>
          {k.criticalList.length === 0 ? (
            <div className={s.empty}>Nenhum colaborador em estado crítico.</div>
          ) : (
            <div className={s.rankList}>
              {k.criticalList.map(e => {
                const meta = STATUS_PERFORMANCE_META[
                  e.score >= 40 ? 'atencao' : 'critico'
                ]
                return (
                  <Link key={e.id} to={`/colaboradores/${e.id}`} className={s.rankItem}>
                    <div className={s.rankAvatar} style={{ background: `${meta.color}1a`, color: meta.color }}>
                      {e.nome[0]?.toUpperCase()}
                    </div>
                    <div className={s.rankInfo}>
                      <div className={s.rankName}>{e.nome}</div>
                      <div className={s.rankCargo}>{e.cargo}</div>
                    </div>
                    <ScoreRing score={e.score} size={44} />
                    <span className={s.rankBadge} style={{ color: meta.color, background: meta.bg }}>
                      {meta.label}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {/* ── Quick access modules ── */}
      <div className={s.modulesGrid}>
        <Link to="/colaboradores" className={s.moduleCard}>
          <span className={s.moduleIcon}>👤</span>
          <span className={s.moduleLabel}>Cadastro</span>
        </Link>
        <Link to="/colaboradores/avaliacoes" className={s.moduleCard}>
          <span className={s.moduleIcon}>📊</span>
          <span className={s.moduleLabel}>Avaliações</span>
        </Link>
        <Link to="/colaboradores/advertencias" className={s.moduleCard}>
          <span className={s.moduleIcon}>⚠️</span>
          <span className={s.moduleLabel}>Advertências</span>
        </Link>
        <Link to="/colaboradores/reconhecimentos" className={s.moduleCard}>
          <span className={s.moduleIcon}>🏆</span>
          <span className={s.moduleLabel}>Reconhecimentos</span>
        </Link>
        <Link to="/colaboradores/ranking" className={s.moduleCard}>
          <span className={s.moduleIcon}>🏅</span>
          <span className={s.moduleLabel}>Ranking</span>
        </Link>
      </div>

    </div>
  )
}

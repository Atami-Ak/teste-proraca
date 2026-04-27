import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSafetyKPISnapshot, getDDSList, getDDIList } from '@/lib/db-safety'
import type { DDS, DDI } from '@/types/safety'
import { STATUS_DDS_META, STATUS_DDI_META } from '@/types/safety'
import s from './SafetyDashboardPage.module.css'

function fmt(d: Date | undefined): string {
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const r = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={6} />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      <text x={size/2} y={size/2 + 5} textAnchor="middle" fontSize={size < 60 ? 11 : 14} fontWeight="700" fill={color}>
        {score}%
      </text>
    </svg>
  )
}

export default function SafetyDashboardPage() {
  const navigate = useNavigate()

  const [kpi, setKpi] = useState<{
    totalDDSMes: number
    totalDDIMes: number
    scoreMediaDDI: number
    episVencidos: number
    ocorrenciasAbertas: number
    permissoesAtivas: number
  } | null>(null)

  const [recentDDS, setRecentDDS] = useState<DDS[]>([])
  const [recentDDI, setRecentDDI] = useState<DDI[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [kpiData, ddsList, ddiList] = await Promise.all([
          getSafetyKPISnapshot(),
          getDDSList(),
          getDDIList(),
        ])
        setKpi(kpiData)
        setRecentDDS(ddsList.slice(0, 5))
        setRecentDDI(ddiList.slice(0, 5))
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className={s.loadingWrap}>
        <div className={s.spinner} />
        <span>Carregando painel de segurança…</span>
      </div>
    )
  }

  const cards = [
    { label: 'DDS no mês',           value: kpi?.totalDDSMes ?? 0,         icon: '📢', color: '#166534', bg: 'rgba(22,101,52,0.08)',   action: () => navigate('/seguranca/dds') },
    { label: 'Inspeções no mês',      value: kpi?.totalDDIMes ?? 0,         icon: '🔍', color: '#2563eb', bg: 'rgba(37,99,235,0.08)',   action: () => navigate('/seguranca/ddi') },
    { label: 'Score médio DDI',       value: `${kpi?.scoreMediaDDI ?? 0}%`, icon: '📊', color: '#d97706', bg: 'rgba(217,119,6,0.08)',   action: () => navigate('/seguranca/ddi') },
    { label: 'EPIs vencidos',         value: kpi?.episVencidos ?? 0,        icon: '⚠️', color: '#dc2626', bg: 'rgba(220,38,38,0.08)',   action: () => navigate('/seguranca/epi') },
    { label: 'Ocorrências abertas',   value: kpi?.ocorrenciasAbertas ?? 0,  icon: '🚨', color: '#7c3aed', bg: 'rgba(124,58,237,0.08)',  action: () => navigate('/seguranca/ocorrencias') },
    { label: 'Permissões ativas',     value: kpi?.permissoesAtivas ?? 0,    icon: '📋', color: '#ea580c', bg: 'rgba(234,88,12,0.08)',   action: () => navigate('/seguranca/permissoes') },
  ]

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Segurança do Trabalho</h1>
          <p className={s.pageSub}>Painel executivo de segurança — {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
        </div>
        <div className={s.headerActions}>
          <button className={s.btnOutline} onClick={() => navigate('/seguranca/dds/novo')}>+ DDS</button>
          <button className={s.btnOutline} onClick={() => navigate('/seguranca/ddi/novo')}>+ Inspeção</button>
          <button className={s.btnPrimary} onClick={() => navigate('/seguranca/ocorrencias/novo')}>🚨 Ocorrência</button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className={s.kpiGrid}>
        {cards.map(c => (
          <button key={c.label} className={s.kpiCard} onClick={c.action} style={{ '--card-color': c.color, '--card-bg': c.bg } as React.CSSProperties}>
            <div className={s.kpiIcon} style={{ background: c.bg, color: c.color }}>{c.icon}</div>
            <div className={s.kpiValue} style={{ color: c.color }}>{c.value}</div>
            <div className={s.kpiLabel}>{c.label}</div>
          </button>
        ))}
      </div>

      {/* ── Module quick access ── */}
      <div className={s.modulesGrid}>
        {[
          { icon: '📢', label: 'DDS',           sub: 'Diálogo Diário',      path: '/seguranca/dds',         color: '#166534' },
          { icon: '🔍', label: 'DDI',           sub: 'Inspeção Diária',     path: '/seguranca/ddi',         color: '#2563eb' },
          { icon: '🦺', label: 'EPI',           sub: 'Fichas de EPI',       path: '/seguranca/epi',         color: '#d97706' },
          { icon: '🚨', label: 'Ocorrências',   sub: 'Incidentes e RNC',    path: '/seguranca/ocorrencias', color: '#dc2626' },
          { icon: '📋', label: 'Permissões PT', sub: 'Trabalhos especiais',  path: '/seguranca/permissoes',  color: '#ea580c' },
        ].map(m => (
          <button key={m.path} className={s.moduleCard} onClick={() => navigate(m.path)}>
            <span className={s.moduleIcon} style={{ color: m.color }}>{m.icon}</span>
            <span className={s.moduleName}>{m.label}</span>
            <span className={s.moduleSub}>{m.sub}</span>
            <span className={s.moduleArrow}>→</span>
          </button>
        ))}
      </div>

      {/* ── Recent lists ── */}
      <div className={s.listsRow}>

        {/* Recent DDS */}
        <div className={s.listCard}>
          <div className={s.listHeader}>
            <span className={s.listTitle}>📢 Últimos DDS</span>
            <button className={s.listMore} onClick={() => navigate('/seguranca/dds')}>Ver todos →</button>
          </div>
          {recentDDS.length === 0 ? (
            <div className={s.empty}>Nenhum DDS registrado ainda.</div>
          ) : (
            <div className={s.listRows}>
              {recentDDS.map(d => {
                const meta = STATUS_DDS_META[d.status]
                return (
                  <div key={d.id} className={s.listRow} onClick={() => navigate(`/seguranca/dds/${d.id}`)}>
                    <div className={s.listRowMain}>
                      <span className={s.listRowCode}>{d.numero}</span>
                      <span className={s.listRowSub}>{d.tema}</span>
                    </div>
                    <div className={s.listRowRight}>
                      <span className={s.badge} style={{ color: meta.color, background: `${meta.color}1a` }}>{meta.label}</span>
                      <span className={s.listRowDate}>{fmt(d.data)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent DDI */}
        <div className={s.listCard}>
          <div className={s.listHeader}>
            <span className={s.listTitle}>🔍 Últimas Inspeções</span>
            <button className={s.listMore} onClick={() => navigate('/seguranca/ddi')}>Ver todas →</button>
          </div>
          {recentDDI.length === 0 ? (
            <div className={s.empty}>Nenhuma inspeção registrada ainda.</div>
          ) : (
            <div className={s.listRows}>
              {recentDDI.map(d => {
                const meta = STATUS_DDI_META[d.status]
                return (
                  <div key={d.id} className={s.listRow} onClick={() => navigate(`/seguranca/ddi/${d.id}`)}>
                    <ScoreRing score={d.scoreGeral} size={44} />
                    <div className={s.listRowMain}>
                      <span className={s.listRowCode}>{d.numero}</span>
                      <span className={s.listRowSub}>{d.setor} — {d.inspetor}</span>
                    </div>
                    <div className={s.listRowRight}>
                      <span className={s.badge} style={{ color: meta.color, background: `${meta.color}1a` }}>{meta.label}</span>
                      <span className={s.listRowDate}>{fmt(d.data)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  )
}

import { useState, useEffect, type CSSProperties } from 'react'
import { Link, useNavigate }                       from 'react-router-dom'
import { getSafetyKPISnapshot, getDDSList, getDDIList } from '@/lib/db-safety'
import type { DDS, DDI }                           from '@/types/safety'
import { STATUS_DDS_META, STATUS_DDI_META }        from '@/types/safety'
import s from './SafetyDashboardPage.module.css'

function fmt(d: Date | undefined, short = false): string {
  if (!d) return '—'
  if (short) return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isToday(d: Date | undefined): boolean {
  if (!d) return false
  const now = new Date()
  return d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
}

const Ic = {
  Shield:    () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Chat:      () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Inspect:   () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  HardHat:   () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a8 8 0 0 1 16 0v3"/></svg>,
  AlertTri:  () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Clipboard: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
  Plus:      () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  ChevRight: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>,
  Refresh:   () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23,4 23,10 17,10"/><polyline points="1,20 1,14 7,14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  Chart:     () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  EpiWarn:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Lock:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Users:     () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  CheckCirc: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>,
  Calendar:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Zap:       () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/></svg>,
  TrendUp:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/></svg>,
}

function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={4} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x={size/2} y={size/2 + 4} textAnchor="middle"
        fontSize={size < 50 ? 9 : 11} fontWeight="700" fill={color}>{score}%</text>
    </svg>
  )
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100))
  return (
    <div className={s.progressTrack}>
      <div className={s.progressFill} style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default function SafetyDashboardPage() {
  const navigate = useNavigate()

  const [kpi, setKpi] = useState<{
    totalDDSMes: number; totalDDIMes: number; scoreMediaDDI: number
    episVencidos: number; ocorrenciasAbertas: number; permissoesAtivas: number
  } | null>(null)

  const [recentDDS, setRecentDDS] = useState<DDS[]>([])
  const [recentDDI, setRecentDDI] = useState<DDI[]>([])
  const [loading,   setLoading]   = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [kpiData, ddsList, ddiList] = await Promise.all([
        getSafetyKPISnapshot(), getDDSList(), getDDIList(),
      ])
      setKpi(kpiData)
      setRecentDDS(ddsList.slice(0, 6))
      setRecentDDI(ddiList.slice(0, 6))
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const k = kpi ?? {
    totalDDSMes: 0, totalDDIMes: 0, scoreMediaDDI: 0,
    episVencidos: 0, ocorrenciasAbertas: 0, permissoesAtivas: 0,
  }

  const todayDDS   = recentDDS.filter(d => isToday(d.data))
  const todayTotal = todayDDS.reduce((a, d) => a + d.totalPresentes, 0)
  const hasTodayDDS = todayDDS.length > 0

  const KPI_CARDS = [
    { label: 'DDI no mês',            value: k.totalDDSMes,        color: '#166534', icon: <Ic.Chat />,     to: '/seguranca/dds' },
    { label: 'Inspeções no mês',      value: k.totalDDIMes,        color: '#2563eb', icon: <Ic.Inspect />,  to: '/seguranca/ddi' },
    { label: 'Score médio Inspeções', value: `${k.scoreMediaDDI}%`,color: '#d97706', icon: <Ic.Chart />,   to: '/seguranca/ddi' },
    { label: 'EPIs vencidos',    value: k.episVencidos,       color: k.episVencidos > 0 ? '#dc2626' : '#16a34a', icon: <Ic.EpiWarn />, to: '/seguranca/epi' },
    { label: 'Ocorrências abertas', value: k.ocorrenciasAbertas, color: k.ocorrenciasAbertas > 0 ? '#7c3aed' : '#16a34a', icon: <Ic.AlertTri />, to: '/seguranca/ocorrencias' },
    { label: 'Permissões ativas',value: k.permissoesAtivas,   color: '#ea580c', icon: <Ic.Lock />,    to: '/seguranca/permissoes' },
  ]

  const MODULES = [
    { icon: <Ic.Chat />,      label: 'DDI',                   sub: 'Diálogo Diário de Inspeção',       path: '/seguranca/dds',         color: '#166534', newPath: '/seguranca/dds/novo' },
    { icon: <Ic.Inspect />,   label: 'Inspeções de Segurança', sub: 'Checklist de conformidade e riscos', path: '/seguranca/ddi',         color: '#2563eb', newPath: '/seguranca/ddi/novo' },
    { icon: <Ic.HardHat />,   label: 'EPI',           sub: 'Fichas e controle de EPIs',       path: '/seguranca/epi',         color: '#d97706', newPath: '/seguranca/epi/novo' },
    { icon: <Ic.AlertTri />,  label: 'Ocorrências',   sub: 'Acidentes, quase-acidentes, RNC', path: '/seguranca/ocorrencias', color: '#dc2626', newPath: '/seguranca/ocorrencias/novo' },
    { icon: <Ic.Clipboard />, label: 'Permissões PT', sub: 'Trabalhos de risco especial',     path: '/seguranca/permissoes',  color: '#ea580c', newPath: '/seguranca/permissoes' },
  ]

  const now = new Date()
  const mesAtual = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const dataHoje = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const hasAlert = k.episVencidos > 0 || k.ocorrenciasAbertas > 0

  if (loading) {
    return (
      <div className={s.loadingWrap}>
        <div className={s.loadingInner}>
          <div className={s.loadingIcon}><Ic.Shield /></div>
          <div className={s.spinner} />
          <span className={s.loadingText}>Carregando painel de segurança…</span>
        </div>
      </div>
    )
  }

  return (
    <div className={s.page}>

      {/* ── Header ───────────────────────────────────────── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.headerIcon}><Ic.Shield /></div>
          <div>
            <h1 className={s.pageTitle}>Segurança do Trabalho</h1>
            <p className={s.pageSub}><Ic.Calendar /> {dataHoje}</p>
          </div>
        </div>
        <div className={s.headerActions}>
          <button className={s.btnGhost} onClick={load}>
            <Ic.Refresh /> Atualizar
          </button>
          <Link to="/seguranca/dds/novo" className={s.btnAction} style={{ '--btn-color': '#166534' } as CSSProperties}>
            <Ic.Plus /> Novo DDI
          </Link>
          <Link to="/seguranca/ddi/novo" className={s.btnAction} style={{ '--btn-color': '#2563eb' } as CSSProperties}>
            <Ic.Plus /> Nova Inspeção
          </Link>
          <Link to="/seguranca/ocorrencias/novo" className={s.btnDanger}>
            <Ic.AlertTri /> Ocorrência
          </Link>
        </div>
      </div>

      {/* ── Alert banner ─────────────────────────────────── */}
      {hasAlert && (
        <div className={s.alertBanner}>
          <div className={s.alertIconWrap}><Ic.AlertTri /></div>
          <div className={s.alertContent}>
            <span className={s.alertTitle}>Atenção requerida</span>
            <div className={s.alertItems}>
              {k.episVencidos > 0 && (
                <Link to="/seguranca/epi" className={s.alertItem}>
                  <span className={s.alertDot} style={{ background: '#dc2626' }} />
                  <strong>{k.episVencidos} EPI{k.episVencidos !== 1 ? 's' : ''} vencido{k.episVencidos !== 1 ? 's' : ''}</strong> — verificar fichas imediatamente
                </Link>
              )}
              {k.ocorrenciasAbertas > 0 && (
                <Link to="/seguranca/ocorrencias" className={s.alertItem}>
                  <span className={s.alertDot} style={{ background: '#7c3aed' }} />
                  <strong>{k.ocorrenciasAbertas} ocorrência{k.ocorrenciasAbertas !== 1 ? 's' : ''} em aberto</strong> — acompanhar investigação
                </Link>
              )}
            </div>
          </div>
          <Link to="/seguranca/epi" className={s.alertCta}>Ver detalhes <Ic.ChevRight /></Link>
        </div>
      )}

      {/* ── Today's DDS status ───────────────────────────── */}
      <div className={s.todayBanner} style={{
        background: hasTodayDDS ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : 'linear-gradient(135deg, #fff7ed, #ffedd5)',
        borderColor: hasTodayDDS ? '#86efac' : '#fdba74',
      }}>
        <div className={s.todayLeft}>
          <div className={s.todayDot} style={{ background: hasTodayDDS ? '#16a34a' : '#f59e0b' }} />
          <div>
            <div className={s.todayLabel}>DDI de hoje</div>
            <div className={s.todayStatus} style={{ color: hasTodayDDS ? '#15803d' : '#b45309' }}>
              {hasTodayDDS
                ? `${todayDDS.length} DDI realizado${todayDDS.length > 1 ? 's' : ''} · ${todayTotal} participante${todayTotal !== 1 ? 's' : ''}`
                : 'Nenhum DDI registrado hoje ainda'}
            </div>
          </div>
        </div>
        <div className={s.todayRight}>
          {hasTodayDDS ? (
            <div className={s.todayBadgeOk}><Ic.CheckCirc /> Realizado</div>
          ) : (
            <Link to="/seguranca/dds/novo" className={s.todayBadgePending}>
              <Ic.Zap /> Registrar agora
            </Link>
          )}
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────── */}
      <div className={s.kpiGrid}>
        {KPI_CARDS.map(c => (
          <Link key={c.label} to={c.to} className={s.kpiCard}
            style={{ '--kpi-color': c.color } as CSSProperties}>
            <div className={s.kpiAccent} />
            <div className={s.kpiIconWrap} style={{ background: c.color + '15', color: c.color }}>
              {c.icon}
            </div>
            <div className={s.kpiBody}>
              <div className={s.kpiValue} style={{ color: c.color }}>{c.value}</div>
              <div className={s.kpiLabel}>{c.label}</div>
            </div>
            <div className={s.kpiArrow} style={{ color: c.color }}><Ic.ChevRight /></div>
          </Link>
        ))}
      </div>

      {/* ── Module Navigation ────────────────────────────── */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionDot} style={{ background: '#dc2626' }} />
          <span className={s.sectionTitle}>Módulos de Segurança</span>
          <div className={s.sectionLine} />
        </div>
        <div className={s.modulesGrid}>
          {MODULES.map(m => (
            <div key={m.path} className={s.moduleCard} style={{ '--mod-color': m.color } as CSSProperties}>
              <div className={s.modTopBar} />
              <div className={s.modBody}>
                <div className={s.modIconWrap} style={{ background: m.color + '15', color: m.color }}>
                  {m.icon}
                </div>
                <div className={s.modContent}>
                  <div className={s.modName}>{m.label}</div>
                  <div className={s.modSub}>{m.sub}</div>
                </div>
              </div>
              <div className={s.modActions}>
                <Link to={m.path} className={s.modBtnView} style={{ color: m.color }}>
                  Ver lista <Ic.ChevRight />
                </Link>
                <Link to={m.newPath} className={s.modBtnNew} style={{ background: m.color + '15', color: m.color }}>
                  <Ic.Plus /> Novo
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recent Lists ─────────────────────────────────── */}
      <div className={s.listsRow}>

        {/* Recent DDI */}
        <div className={s.listCard}>
          <div className={s.listHeader}>
            <div className={s.listTitleWrap}>
              <div className={s.listDot} style={{ background: '#166534' }} />
              <span className={s.listTitle}>Últimos DDI</span>
              <span className={s.listCount}>{recentDDS.length}</span>
            </div>
            <Link to="/seguranca/dds" className={s.listMore}>
              Ver todos <Ic.ChevRight />
            </Link>
          </div>

          {recentDDS.length === 0 ? (
            <div className={s.listEmpty}>
              <div className={s.emptyIcon} style={{ color: '#166534' }}><Ic.Chat /></div>
              <p>Nenhum DDI registrado ainda</p>
              <Link to="/seguranca/dds/novo" className={s.emptyBtn} style={{ color: '#166534' }}>
                <Ic.Plus /> Criar primeiro DDI
              </Link>
            </div>
          ) : (
            <div className={s.listRows}>
              {recentDDS.map(d => {
                const meta = STATUS_DDS_META[d.status]
                const today = isToday(d.data)
                return (
                  <div key={d.id} className={s.listRow}
                    onClick={() => navigate(`/seguranca/dds/${d.id}`)}>
                    <div className={s.listRowLeft}>
                      {today && <div className={s.todayIndicator} />}
                      <div>
                        <div className={s.listRowTop}>
                          <span className={s.listCode} style={{ color: '#166534', background: 'rgba(22,101,52,0.08)' }}>{d.numero}</span>
                          <span className={s.listBadge} style={{ color: meta.color, background: meta.color + '18' }}>{meta.label}</span>
                        </div>
                        <div className={s.listRowSub}>{d.tema}</div>
                        <div className={s.listRowMeta}>
                          <span><Ic.Users /> {d.totalPresentes} presentes</span>
                          <span className={s.dot}>·</span>
                          <span>{d.setor}</span>
                        </div>
                      </div>
                    </div>
                    <div className={s.listRowDate}>{fmt(d.data, true)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent Inspeções de Segurança */}
        <div className={s.listCard}>
          <div className={s.listHeader}>
            <div className={s.listTitleWrap}>
              <div className={s.listDot} style={{ background: '#2563eb' }} />
              <span className={s.listTitle}>Últimas Inspeções de Segurança</span>
              <span className={s.listCount}>{recentDDI.length}</span>
            </div>
            <Link to="/seguranca/ddi" className={s.listMore}>
              Ver todas <Ic.ChevRight />
            </Link>
          </div>

          {recentDDI.length === 0 ? (
            <div className={s.listEmpty}>
              <div className={s.emptyIcon} style={{ color: '#2563eb' }}><Ic.Inspect /></div>
              <p>Nenhuma inspeção de segurança registrada ainda</p>
              <Link to="/seguranca/ddi/novo" className={s.emptyBtn} style={{ color: '#2563eb' }}>
                <Ic.Plus /> Nova Inspeção de Segurança
              </Link>
            </div>
          ) : (
            <div className={s.listRows}>
              {recentDDI.map(d => {
                const meta = STATUS_DDI_META[d.status]
                return (
                  <div key={d.id} className={s.listRow}
                    onClick={() => navigate(`/seguranca/ddi/${d.id}`)}>
                    <ScoreRing score={d.scoreGeral} size={42} />
                    <div className={s.listRowLeft} style={{ paddingLeft: 0 }}>
                      <div>
                        <div className={s.listRowTop}>
                          <span className={s.listCode} style={{ color: '#2563eb', background: 'rgba(37,99,235,0.08)' }}>{d.numero}</span>
                          <span className={s.listBadge} style={{ color: meta.color, background: meta.color + '18' }}>{meta.label}</span>
                        </div>
                        <div className={s.listRowSub}>{d.inspetor}</div>
                        <div className={s.listRowMeta}>
                          <span>{d.setor}</span>
                          <span className={s.dot}>·</span>
                          <span style={{ color: d.totalCriticosAbertos > 0 ? '#dc2626' : '#8898AA' }}>
                            {d.totalCriticosAbertos > 0 ? `${d.totalCriticosAbertos} crítico${d.totalCriticosAbertos > 1 ? 's' : ''}` : 'Sem críticos'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={s.listRowDate}>{fmt(d.data, true)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {/* ── Footer quick stats ───────────────────────────── */}
      <div className={s.footerStats}>
        <div className={s.footerStat}>
          <span className={s.footerStatLabel}>Competência</span>
          <span className={s.footerStatValue}>{mesAtual}</span>
        </div>
        <div className={s.footerDivider} />
        <div className={s.footerStat}>
          <span className={s.footerStatLabel}>Score DDI médio</span>
          <ProgressBar value={k.scoreMediaDDI} max={100} color={k.scoreMediaDDI >= 80 ? '#16a34a' : k.scoreMediaDDI >= 60 ? '#d97706' : '#dc2626'} />
          <span className={s.footerStatValue} style={{ fontSize: '0.75rem' }}>{k.scoreMediaDDI}%</span>
        </div>
        <div className={s.footerDivider} />
        <div className={s.footerStat}>
          <span className={s.footerStatLabel}>DDS / Inspeções no mês</span>
          <span className={s.footerStatValue}>{k.totalDDSMes} / {k.totalDDIMes}</span>
        </div>
        <div className={s.footerDivider} />
        <Link to="/dashboard/seguranca" className={s.footerAnalytics}>
          <Ic.Chart /> Ver analytics completo <Ic.ChevRight />
        </Link>
      </div>

    </div>
  )
}

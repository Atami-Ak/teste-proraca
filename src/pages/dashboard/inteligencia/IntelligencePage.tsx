// src/pages/dashboard/inteligencia/IntelligencePage.tsx
// Central de Inteligência 360° — Phase 2 ERP Roadmap
// Correlações cruzadas, saúde por módulo, KPIs consolidados

import { useState, useEffect, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { getDataHubSnapshot, invalidateDataHub } from '@/lib/db-data-hub'
import {
  HEALTH_META, MODULE_META, TREND_META,
  type DataHubSnapshot, type ModuleKey, type ModuleScore,
} from '@/types/data-hub'
import s from './IntelligencePage.module.css'

// ── Tipos de correlação cross-module ─────────────────────

interface Correlation {
  icon:    string
  iconBg:  string
  title:   string
  desc:    string
  value:   string | number
  color:   string
}

function buildCorrelations(snap: DataHubSnapshot): Correlation[] {
  const { kpis, healthScores: hs } = snap
  const list: Correlation[] = []

  // Segurança ↔ Colaboradores
  if (kpis.incidentesAbertos > 0) list.push({
    icon: '⚠️', iconBg: '#fef2f2',
    title: 'Incidentes → Colaboradores afetados',
    desc:  `${kpis.incidentesAbertos} incidente${kpis.incidentesAbertos > 1 ? 's' : ''} aberto${kpis.incidentesAbertos > 1 ? 's' : ''} podem refletir em desempenho de equipe. Score de segurança: ${hs.seguranca.score}/100.`,
    value: kpis.incidentesAbertos, color: '#dc2626',
  })

  // Manutenção ↔ OS
  if (kpis.manutencoesAtrasadas > 0) list.push({
    icon: '🔧', iconBg: '#fff7ed',
    title: 'Manutenções atrasadas → Risco de OS corretiva',
    desc:  `${kpis.manutencoesAtrasadas} manutenção${kpis.manutencoesAtrasadas > 1 ? 'ões' : ''} vencida${kpis.manutencoesAtrasadas > 1 ? 's' : ''} elevam risco de parada e geração de O.S. não programada.`,
    value: `${hs.maquinario.score}/100`, color: '#ea580c',
  })

  // Compras ↔ Aprovações
  if (kpis.pcUrgentes > 0) list.push({
    icon: '🛒', iconBg: '#fefce8',
    title: 'Compras urgentes bloqueadas em aprovação',
    desc:  `${kpis.pcUrgentes} compra${kpis.pcUrgentes > 1 ? 's' : ''} urgente${kpis.pcUrgentes > 1 ? 's' : ''} aguardando aprovação. Cada dia de atraso pode parar a operação.`,
    value: kpis.pcUrgentes, color: '#d97706',
  })

  // EPI ↔ Segurança
  if (kpis.epiVencidos > 0) list.push({
    icon: '🛡️', iconBg: '#fef2f2',
    title: 'EPIs vencidos → Risco legal e de acidente',
    desc:  `${kpis.epiVencidos} EPI${kpis.epiVencidos > 1 ? 's' : ''} vencido${kpis.epiVencidos > 1 ? 's' : ''} exigem substituição imediata para conformidade com NRs.`,
    value: kpis.epiVencidos, color: '#dc2626',
  })

  // Certificações ↔ Segurança
  if (kpis.certVencidas > 0) list.push({
    icon: '📋', iconBg: '#f0f9ff',
    title: 'Certificações vencidas → Risco de autuação',
    desc:  `${kpis.certVencidas} certificação${kpis.certVencidas > 1 ? 'ões' : ''} vencida${kpis.certVencidas > 1 ? 's' : ''}. Colaboradores sem NRs válidas não podem operar equipamentos.`,
    value: kpis.certVencidas, color: '#0284c7',
  })

  // Obras ↔ Empreiteiras
  if (kpis.obrasAtrasadas > 0) list.push({
    icon: '🏗️', iconBg: '#fff7ed',
    title: 'Obras atrasadas → Impacto nos contratos',
    desc:  `${kpis.obrasAtrasadas} obra${kpis.obrasAtrasadas > 1 ? 's' : ''} atrasada${kpis.obrasAtrasadas > 1 ? 's' : ''}. Verifique cláusulas de multa e performance das empreiteiras.`,
    value: `${hs.obras.score}/100`, color: '#ea580c',
  })

  // Limpeza 5S
  if (kpis.zonasCriticas > 0) list.push({
    icon: '🧹', iconBg: '#f0fdf4',
    title: `${kpis.zonasCriticas} zona${kpis.zonasCriticas > 1 ? 's' : ''} crítica${kpis.zonasCriticas > 1 ? 's' : ''} 5S`,
    desc:  `Zonas com score abaixo de 60 — risco de não conformidade em auditorias e queda de produtividade.`,
    value: `${kpis.scoreMediaLimpeza}/100`, color: '#16a34a',
  })

  // Banco de Horas
  if (kpis.bancoHorasAlerta > 0) list.push({
    icon: '⏱️', iconBg: '#faf5ff',
    title: 'Banco de horas negativo → Passivo trabalhista',
    desc:  `${kpis.bancoHorasAlerta} colaborador${kpis.bancoHorasAlerta > 1 ? 'es' : ''} com saldo negativo. Regularize para evitar reclamações trabalhistas.`,
    value: kpis.bancoHorasAlerta, color: '#7c3aed',
  })

  return list.slice(0, 6)
}

// ── Componente principal ──────────────────────────────────

export default function IntelligencePage() {
  const [snap,    setSnap]    = useState<DataHubSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async (force = false) => {
    setLoading(true)
    if (force) invalidateDataHub()
    try {
      setSnap(await getDataHubSnapshot(force))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const hs = snap?.healthScores
  const kpis = snap?.kpis
  const correlations = snap ? buildCorrelations(snap) : []
  const moduleKeys = Object.keys(MODULE_META) as ModuleKey[]

  const generatedAgo = snap?.generatedAt
    ? Math.round((Date.now() - snap.generatedAt.getTime()) / 60_000)
    : null

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <div className={s.topBand}>
        <div className={s.topBandInner}>
          <div>
            <h1 className={s.pageTitle}>🧠 Central de Inteligência 360°</h1>
            <p className={s.pageSub}>
              Visão cruzada de todos os módulos — correlações, scores e KPIs consolidados
            </p>
          </div>
          <div className={s.headerRight}>
            {snap && generatedAgo !== null && (
              <span className={s.hubMeta}>
                Atualizado {generatedAgo < 2 ? 'agora' : `há ${generatedAgo} min`}
                {' · '}{snap.computationMs}ms
              </span>
            )}
            <button
              className={s.refreshBtn}
              onClick={() => void load(true)}
              disabled={loading}
            >
              {loading ? '…' : '↺ Recalcular'}
            </button>
          </div>
        </div>
      </div>

      <div className={s.body}>

        {/* ── Global Score Banner ── */}
        {loading ? (
          <div className={s.skeleton} style={{ height: 96 }} />
        ) : hs ? (
          <div className={s.globalBanner}>
            <div
              className={s.globalBannerScore}
              style={{ color: HEALTH_META[hs.global.status].color } as CSSProperties}
            >
              {hs.global.score}
            </div>
            <div className={s.globalBannerInfo}>
              <div className={s.globalBannerTitle}>
                {HEALTH_META[hs.global.status].icon} Saúde Operacional Global
              </div>
              <div className={s.globalBannerLabel}>
                {HEALTH_META[hs.global.status].label} · {TREND_META[hs.global.trend].icon} {TREND_META[hs.global.trend].label}
              </div>
            </div>
            {kpis && (
              <div className={s.globalBannerKpis}>
                <div className={s.globalBannerKpi}>
                  <div className={s.globalBannerKpiVal}>{kpis.osAbertas}</div>
                  <div className={s.globalBannerKpiLabel}>OS Abertas</div>
                </div>
                <div className={s.globalBannerKpi}>
                  <div className={s.globalBannerKpiVal}>{kpis.incidentesAbertos}</div>
                  <div className={s.globalBannerKpiLabel}>Incidentes</div>
                </div>
                <div className={s.globalBannerKpi}>
                  <div className={s.globalBannerKpiVal}>{kpis.colaboradoresAtivos}</div>
                  <div className={s.globalBannerKpiLabel}>Colaboradores</div>
                </div>
                <div className={s.globalBannerKpi}>
                  <div className={s.globalBannerKpiVal}>{kpis.obrasAtivas}</div>
                  <div className={s.globalBannerKpiLabel}>Obras Ativas</div>
                </div>
                <div className={s.globalBannerKpi}>
                  <div className={s.globalBannerKpiVal}>{snap?.recommendations?.length ?? 0}</div>
                  <div className={s.globalBannerKpiLabel}>Recomendações</div>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* ── KPIs Consolidados ── */}
        {kpis && !loading && (
          <div>
            <div className={s.sectionHead}>KPIs Operacionais</div>
            <div className={s.kpiRow}>
              <KpiMini value={kpis.osAbertas}        label="OS Abertas"       />
              <KpiMini value={kpis.osCriticas}       label="OS Críticas"      danger />
              <KpiMini value={kpis.epiVencidos}      label="EPIs Vencidos"    danger />
              <KpiMini value={kpis.pcPendentes}      label="Compras Pend."    />
              <KpiMini value={kpis.manutencoesAtrasadas} label="Manut. Atras."  danger />
              <KpiMini value={kpis.zonasCriticas}    label="Zonas 5S Críticas" danger />
            </div>
          </div>
        )}

        {/* ── Módulos 360° ── */}
        <div>
          <div className={s.sectionHead}>
            Saúde por Módulo
            <span className={s.sectionBadge}>{moduleKeys.length}</span>
          </div>

          {loading ? (
            <div className={s.skeletonGrid}>
              {moduleKeys.map((k) => (
                <div key={k} className={s.skeleton} style={{ height: 160 }} />
              ))}
            </div>
          ) : hs ? (
            <div className={s.moduleGrid}>
              {moduleKeys.map(key => (
                <ModuleCard360 key={key} moduleKey={key} score={hs[key]} />
              ))}
            </div>
          ) : null}
        </div>

        {/* ── Correlações Cross-Module ── */}
        {correlations.length > 0 && (
          <div>
            <div className={s.sectionHead}>
              Correlações Cross-Module
              <span className={s.sectionBadge} style={{ background: '#ea580c' }}>
                {correlations.length}
              </span>
            </div>
            <div className={s.correlationsGrid}>
              {correlations.map((c, i) => (
                <CorrelationCard key={i} c={c} />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── ModuleCard360 ─────────────────────────────────────────

function ModuleCard360({ moduleKey, score }: { moduleKey: ModuleKey; score: ModuleScore }) {
  const meta  = MODULE_META[moduleKey]
  const hm    = HEALTH_META[score.status]
  const tm    = TREND_META[score.trend]
  const top3  = Object.entries(score.metrics).slice(0, 3)

  return (
    <Link to={meta.dashPath} className={s.moduleCard}>
      <div className={s.moduleCardTop}>
        <div className={s.moduleCardIcon}>{meta.icon}</div>
        <div
          className={s.moduleCardScore}
          style={{ color: hm.color } as CSSProperties}
        >
          {score.score}
        </div>
      </div>

      <div>
        <div className={s.moduleCardName}>{meta.label}</div>
        <div
          className={s.moduleCardStatus}
          style={{ background: hm.bg, color: hm.color } as CSSProperties}
        >
          {hm.label}
        </div>
        <div
          className={s.moduleCardTrend}
          style={{ color: tm.color } as CSSProperties}
        >
          {tm.icon} {tm.label}
        </div>
      </div>

      <div className={s.moduleCardBar}>
        <div
          className={s.moduleCardBarFill}
          style={{ width: `${score.score}%`, background: hm.color } as CSSProperties}
        />
      </div>

      {top3.length > 0 && (
        <div className={s.moduleCardMetrics}>
          {top3.map(([key, val]) => (
            <div key={key} className={s.moduleCardMetric}>
              <span>{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
              <span className={s.moduleCardMetricVal}>{val}</span>
            </div>
          ))}
        </div>
      )}
    </Link>
  )
}

// ── CorrelationCard ───────────────────────────────────────

function CorrelationCard({ c }: { c: Correlation }) {
  return (
    <div className={s.correlationCard}>
      <div
        className={s.correlationIcon}
        style={{ background: c.iconBg } as CSSProperties}
      >
        {c.icon}
      </div>
      <div className={s.correlationBody}>
        <div className={s.correlationTitle}>{c.title}</div>
        <div className={s.correlationDesc}>{c.desc}</div>
      </div>
      <div
        className={s.correlationValue}
        style={{ color: c.color } as CSSProperties}
      >
        {c.value}
      </div>
    </div>
  )
}

// ── KpiMini ───────────────────────────────────────────────

function KpiMini({ value, label, danger }: { value: number; label: string; danger?: boolean }) {
  return (
    <div className={s.kpiMini}>
      <div
        className={s.kpiMiniVal}
        style={{ color: danger && value > 0 ? '#dc2626' : undefined } as CSSProperties}
      >
        {value}
      </div>
      <div className={s.kpiMiniLabel}>{label}</div>
    </div>
  )
}

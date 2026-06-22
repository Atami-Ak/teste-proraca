// src/pages/dashboard/noc/NOCPage.tsx
// Centro de Operações (NOC) — CIP V1. Read-only, reaproveita fetchObrasAnalytics
// (mesma fonte de dados do ObrasAnalyticsPage) para evitar recálculo duplicado.

import { useState, useEffect, useCallback } from 'react'
import { fetchObrasAnalytics } from '@/lib/db-obras-analytics'
import type { ObrasAnalyticsData } from '@/types/obras-analytics'
import s from './NOCPage.module.css'

const fmtCurrency = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toFixed(1)}M`
  : v >= 1_000    ? `R$ ${(v / 1_000).toFixed(0)}K`
  : `R$ ${v.toLocaleString('pt-BR')}`

function Card({
  loading, accent, icon, value, label,
}: { loading: boolean; accent: string; icon: string; value: string | number; label: string }) {
  if (loading) return <div className={s.card}><div className={s.cardSkeleton} /></div>
  return (
    <div className={s.card}>
      <div className={s.cardAccent} style={{ background: accent }} />
      <div className={s.cardIcon}>{icon}</div>
      <div className={s.cardValue}>{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</div>
      <div className={s.cardLabel}>{label}</div>
    </div>
  )
}

export default function NOCPage() {
  const [data,    setData]    = useState<ObrasAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetchObrasAnalytics('90d')
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const obras       = data?.obras ?? []
  const empreiteiras = data?.empreiteiras ?? []

  const emRisco       = obras.filter(o => o.riskLevel === 'alto' || o.riskLevel === 'critico')
  const empEmRisco    = empreiteiras.filter(e => e.riskLevel === 'alto' || e.riskLevel === 'critico')
  const dentroDoPrazo = (data?.emAndamento ?? 0) - (data?.atrasadas ?? 0)

  const valorExecutado = obras.reduce(
    (sum, o) => sum + (o.valorContrato ?? 0) * (o.percentualConcluido / 100), 0,
  )
  const valorEmRisco = emRisco.reduce((sum, o) => sum + (o.valorContrato ?? 0), 0)

  const scoreOperacional = obras.length > 0
    ? Math.max(0, Math.round(100 - obras.reduce((sum, o) => sum + o.riskScore, 0) / obras.length))
    : 100

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.headerBadge}>🛰️</div>
          <div>
            <div className={s.headerTitle}>Centro de Operações — Obras & Empreiteiras</div>
            <div className={s.headerSub}>Visão executiva em tempo real · CIP V1</div>
          </div>
        </div>
        {data && <div className={s.lastUpdated}>Atualizado {data.computedAt.toLocaleTimeString('pt-BR')}</div>}
      </div>

      <div className={s.body}>

        <div>
          <div className={s.sectionTitle}>Status Operacional</div>
          <div className={s.sectionSub}>Visão consolidada de todas as obras (últimos 90 dias para inspeções/avaliações)</div>
        </div>
        <div className={s.cardGrid}>
          <Card loading={loading} accent="#3b82f6" icon="🏗️" value={data?.emAndamento ?? 0} label="Obras Ativas" />
          <Card loading={loading} accent="#dc2626" icon="🚨" value={obras.filter(o => o.riskLevel === 'critico').length} label="Obras Críticas" />
          <Card loading={loading} accent="#7c3aed" icon="⏸️" value={data?.paralisadas ?? 0} label="Obras Paralisadas" />
          <Card loading={loading} accent="#ea580c" icon="⏰" value={data?.atrasadas ?? 0} label="Obras Atrasadas" />
          <Card loading={loading} accent="#f59e0b" icon="⚠️" value={emRisco.length} label="Obras em Risco" />
          <Card loading={loading} accent="#16a34a" icon="✅" value={Math.max(dentroDoPrazo, 0)} label="Dentro do Prazo" />
        </div>

        <div>
          <div className={s.sectionTitle}>Financeiro</div>
          <div className={s.sectionSub}>Contratado vs. executado vs. pago — todas as obras com valor de contrato</div>
        </div>
        <div className={s.financeGrid}>
          <Card loading={loading} accent="#3b82f6" icon="📑" value={fmtCurrency(data?.totalContrato ?? 0)} label="Valor Contratado" />
          <Card loading={loading} accent="#0891b2" icon="⚙️" value={fmtCurrency(valorExecutado)} label="Valor Executado" />
          <Card loading={loading} accent="#16a34a" icon="💰" value={fmtCurrency(data?.totalPago ?? 0)} label="Valor Pago" />
          <Card loading={loading} accent="#dc2626" icon="🔴" value={fmtCurrency(valorEmRisco)} label="Valor em Risco" />
        </div>

        <div>
          <div className={s.sectionTitle}>Empreiteiras & Score Global</div>
        </div>
        <div className={s.cardGrid}>
          <Card loading={loading} accent="#ea580c" icon="👷" value={empEmRisco.length} label="Empreiteiras em Risco" />
          <Card loading={loading} accent="#4f46e5" icon="🧮" value={scoreOperacional} label="Score Operacional Global" />
        </div>

        <div className={s.placeholderNote}>
          ℹ️ Documentos vencidos, SLAs estourados e contratos a vencer ainda não têm dados próprios no sistema —
          chegam com o Compliance Center e o SLA Engine (V2/V3 do roadmap CIP, ver <code>docs/modules/obras-cip-vision.md</code>).
        </div>

        <div>
          <div className={s.sectionTitle}>🚨 War Room — Alertas Críticos</div>
          <div className={s.sectionSub}>Mesmos alertas computados pelo Analytics de Obras, priorizados por severidade</div>
        </div>
        <div className={s.alertFeed}>
          {loading ? (
            <div className={s.alertEmpty}>Carregando…</div>
          ) : (data?.alerts.length ?? 0) === 0 ? (
            <div className={s.alertEmpty}>✅ Nenhum alerta crítico no momento.</div>
          ) : (
            data!.alerts.map((a, i) => (
              <div key={i} className={`${s.alertItem} ${a.severity === 'critical' ? s.alertCritical : s.alertWarning}`}>
                <span className={s.alertIcon}>{a.severity === 'critical' ? '🚨' : '⚠️'}</span>
                {a.message}
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  )
}

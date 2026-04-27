/**
 * VehicleHistoryPage.tsx — Vehicle History & KPI Page
 * React migration of /frota/historico-frota.html
 *
 * Shows: vehicle header, KPI cards, alert section, unified timeline
 * (inspections + WOs + POs linked in a parent-child tree).
 */

import { useMemo }               from 'react'
import { useParams, Link }       from 'react-router-dom'
import { useVehicleHistory }     from '@/hooks/useFleetData'
import { FROTA_DB }              from '@/data/fleet-catalog'
import { getEffectiveVehicleStatus } from '@/lib/db-fleet'
import { VEHICLE_STATUS_META, TREND_META } from '@/types/vehicle'
import s from './VehicleHistoryPage.module.css'

export default function VehicleHistoryPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>()
  const vehicle       = useMemo(() => FROTA_DB.find(v => v.id === vehicleId) ?? null, [vehicleId])
  const { kpis, wos, pos, inspections, loading } = useVehicleHistory(vehicleId ?? null)

  if (!vehicle) {
    return (
      <div className={s.notFound}>
        <p>Veículo não encontrado.</p>
        <Link to="/frota">← Voltar à frota</Link>
      </div>
    )
  }

  // Build a virtual vehicle state from KPIs for status display
  const virtualState = kpis ? {
    id: vehicleId ?? '',
    vehicleId: vehicleId ?? '',
    currentStatus: 'operational' as const,
    lastEventDate: 0,
    lastEventDesc: null,
    lastMaintenanceType: null,
    lastWorkOrderId: null,
    totalDowntimeHours: kpis.totalDowntimeHours,
    failureCount: kpis.totalParadas,
    mtbfHours: kpis.mtbfHours,
    mttrHours: kpis.mttrHours,
    recentFailures: kpis.recentFailures,
    trend: kpis.trend,
    updatedBy: '',
  } : null

  const effectiveStatus = getEffectiveVehicleStatus(virtualState)
  const statusMeta      = VEHICLE_STATUS_META[effectiveStatus]
  const trendMeta       = kpis?.trend ? TREND_META[kpis.trend] : null

  // ── Alert detection ──
  const criticalPOs    = pos.filter(po => po['urgencia'] === 'critico' && po['status'] !== 'received' && po['status'] !== 'cancelled')
  const recentFailures = kpis?.recentFailures ?? 0

  // ── Timeline: merge inspections + WOs + POs ──
  const timeline = useMemo(() => {
    type TimelineEntry = {
      type:      'inspection' | 'wo' | 'po'
      id:        string
      timestamp: number
      data:      Record<string, unknown>
    }
    const entries: TimelineEntry[] = []

    inspections.forEach(insp => entries.push({
      type:      'inspection',
      id:        insp.id,
      timestamp: insp.timestampEnvio,
      data:      insp as unknown as Record<string, unknown>,
    }))

    wos.forEach(wo => entries.push({
      type:      'wo',
      id:        wo['id'] as string,
      timestamp: (wo['timestampEnvio'] as number) || 0,
      data:      wo,
    }))

    return entries.sort((a, b) => b.timestamp - a.timestamp)
  }, [inspections, wos])

  function fmtDate(ts: number) {
    if (!ts) return '—'
    return new Date(ts).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className={s.page}>
      {/* Back */}
      <Link to="/frota" className={s.back}>← Voltar à frota</Link>

      {/* Vehicle header */}
      <div className={s.vehicleHeader}>
        <div className={s.vehicleIcon}>{vehicle.icone}</div>
        <div className={s.vehicleInfo}>
          <h1 className={s.plate}>{vehicle.placa}</h1>
          <p className={s.model}>{vehicle.modelo}</p>
          <p className={s.category}>{vehicle.categoria}</p>
          {vehicle.motoristaPadrao && <p className={s.driver}>👤 {vehicle.motoristaPadrao}</p>}
        </div>
        <div className={s.headerRight}>
          <span className={s.statusBadge} style={{ color: statusMeta.color, background: statusMeta.bg }}>
            {statusMeta.icon} {statusMeta.label}
          </span>
          <Link to={`/frota/inspecao/${vehicle.id}`} className={s.btnInspect}>
            + Nova Inspeção
          </Link>
        </div>
      </div>

      {/* Alerts */}
      {(recentFailures >= 3 || criticalPOs.length > 0) && (
        <div className={s.alerts}>
          {recentFailures >= 3 && (
            <div className={s.alertRed}>
              ⚠️ {recentFailures} falhas nos últimos 7 dias. Atenção crítica recomendada.
            </div>
          )}
          {criticalPOs.length > 0 && (
            <div className={s.alertYellow}>
              📦 {criticalPOs.length} pedido(s) de compra crítico(s) em aberto.
            </div>
          )}
        </div>
      )}

      {/* KPI cards */}
      {loading ? (
        <div className={s.loading}>Carregando histórico…</div>
      ) : (
        <div className={s.kpiGrid}>
          <KpiCard label="Total Registros"    value={kpis?.totalRegistros ?? 0}    />
          <KpiCard label="Total Paradas"      value={kpis?.totalParadas ?? 0}      accent="#dc2626" />
          <KpiCard label="Downtime Total"     value={kpis ? `${kpis.totalDowntimeHours.toFixed(1)}h` : '—'} />
          <KpiCard label="MTBF"               value={kpis?.mtbfHours != null ? `${kpis.mtbfHours}h` : '—'} />
          <KpiCard label="MTTR"               value={kpis?.mttrHours != null ? `${kpis.mttrHours}h` : '—'} />
          <KpiCard
            label="Tendência NC"
            value={trendMeta ? `${trendMeta.icon} ${trendMeta.label}` : '—'}
            accent={trendMeta?.color}
          />
        </div>
      )}

      {/* Timeline */}
      <div className={s.timelineSection}>
        <div className={s.sectionHeader}>
          <span className={s.sectionTitle}>Histórico ({timeline.length})</span>
        </div>

        {timeline.length === 0 ? (
          <div className={s.empty}>Sem registros para este veículo.</div>
        ) : (
          <div className={s.timeline}>
            {timeline.map(entry => (
              <TimelineItem key={`${entry.type}-${entry.id}`} entry={entry} fmtDate={fmtDate} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────

function KpiCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className={s.kpiCard}>
      <div className={s.kpiValue} style={{ color: accent }}>{value}</div>
      <div className={s.kpiLabel}>{label}</div>
    </div>
  )
}

// Safely extract a string from a field that may be a plain string or { name: string }
function str(val: unknown, fallback = '—'): string {
  if (typeof val === 'string') return val || fallback
  if (val != null && typeof val === 'object' && 'name' in val) return String((val as Record<string, unknown>)['name']) || fallback
  return fallback
}

function TimelineItem({
  entry,
  fmtDate,
}: {
  entry: { type: string; id: string; timestamp: number; data: Record<string, unknown> }
  fmtDate: (ts: number) => string
}) {
  const isInspection = entry.type === 'inspection'
  const isWO         = entry.type === 'wo'

  if (isInspection) {
    const nc    = (entry.data['nonConformities'] as number) ?? 0
    const tipo  = entry.data['inspectionType'] === 'departure' ? '🛫 Saída' : '🛬 Retorno'
    const hasNC = nc > 0
    const header = entry.data['header'] != null && typeof entry.data['header'] === 'object'
      ? entry.data['header'] as Record<string, unknown>
      : null
    return (
      <div className={`${s.tlItem} ${s.tlInspection}`}>
        <div className={`${s.tlDot} ${hasNC ? s.tlDotNc : s.tlDotOk}`} />
        <div className={s.tlBody}>
          <div className={s.tlTitle}>
            🔍 Inspeção de {tipo}
            <span className={`${s.tlBadge} ${hasNC ? s.badgeNc : s.badgeOk}`}>
              {hasNC ? `${nc} NC` : 'Conforme'}
            </span>
          </div>
          <div className={s.tlMeta}>
            {header && (
              <span>
                Km: {(header['mileage'] as number) ?? '—'}
                {header['location'] ? ` · ${String(header['location'])}` : ''}
              </span>
            )}
            {' · '}{str(entry.data['inspector']) !== '—' ? str(entry.data['inspector']) : str(entry.data['createdBy'])}
            {' · '}{fmtDate(entry.timestamp)}
          </div>
        </div>
      </div>
    )
  }

  if (isWO) {
    const status      = str(entry.data['status'], 'open')
    const priority    = str(entry.data['priority'], '')
    const statusColor = ({ open: '#d97706', in_progress: '#3b82f6', completed: '#16a34a', cancelled: '#94a3b8' } as Record<string, string>)[status] ?? '#64748b'
    return (
      <div className={`${s.tlItem} ${s.tlWo}`}>
        <div className={s.tlDot} style={{ background: statusColor }} />
        <div className={s.tlBody}>
          <div className={s.tlTitle}>
            🔧 {str(entry.data['title'], 'Ordem de Serviço')}
            <span className={s.tlBadge} style={{ background: `${statusColor}22`, color: statusColor }}>
              {status}
            </span>
            {priority === 'high' && <span className={s.priorityHigh}>Alta prioridade</span>}
          </div>
          <div className={s.tlMeta}>
            {str(entry.data['criadoPor'])} · {fmtDate(entry.timestamp)}
          </div>
        </div>
      </div>
    )
  }

  return null
}

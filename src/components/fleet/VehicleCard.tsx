import { Link }  from 'react-router-dom'
import type { VehicleWithState } from '@/types/vehicle'
import { VEHICLE_STATUS_META, TREND_META } from '@/types/vehicle'
import s from './VehicleCard.module.css'

interface Props {
  data: VehicleWithState
}

export default function VehicleCard({ data }: Props) {
  const { vehicle, state, effectiveStatus } = data
  const meta  = VEHICLE_STATUS_META[effectiveStatus]
  const trend = state?.trend ? TREND_META[state.trend] : null

  function fmtDate(ms: number | undefined | null): string {
    if (!ms) return '—'
    return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  return (
    <div className={s.card}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.vehicleIcon}>{vehicle.icone}</div>
        <div className={s.vehicleInfo}>
          <div className={s.plate}>{vehicle.placa}</div>
          <div className={s.model}>{vehicle.modelo}</div>
          <div className={s.category}>{vehicle.categoria}</div>
        </div>
        <span className={s.statusBadge} style={{ color: meta.color, background: meta.bg }}>
          {meta.icon} {meta.label}
        </span>
      </div>

      {/* KPI row */}
      {state && (
        <div className={s.kpiRow}>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>MTBF</span>
            <span className={s.kpiValue}>{state.mtbfHours != null ? `${state.mtbfHours}h` : '—'}</span>
          </div>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>MTTR</span>
            <span className={s.kpiValue}>{state.mttrHours != null ? `${state.mttrHours}h` : '—'}</span>
          </div>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>NCs/7d</span>
            <span className={s.kpiValue} style={{ color: state.recentFailures > 0 ? '#dc2626' : undefined }}>
              {state.recentFailures}
            </span>
          </div>
          {trend && (
            <div className={s.kpi}>
              <span className={s.kpiLabel}>Tendência</span>
              <span className={s.kpiValue} style={{ color: trend.color }}>
                {trend.icon} {trend.label}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Last event */}
      <div className={s.lastEvent}>
        {state?.lastEventDesc ? (
          <>
            <span className={s.lastEventLabel}>Último evento</span>
            <span className={s.lastEventText}>{state.lastEventDesc}</span>
            <span className={s.lastEventDate}>{fmtDate(state.lastEventDate)}</span>
          </>
        ) : (
          <span className={s.noEvent}>Sem registros</span>
        )}
        {vehicle.motoristaPadrao && (
          <div className={s.driver}>👤 {vehicle.motoristaPadrao}</div>
        )}
      </div>

      {/* Actions */}
      <div className={s.actions}>
        <Link
          to={`/frota/inspecao/${vehicle.id}`}
          className={s.btnPrimary}
        >
          + Inspeção
        </Link>
        <Link
          to={`/frota/historico/${vehicle.id}`}
          className={s.btnSecondary}
        >
          Histórico
        </Link>
      </div>
    </div>
  )
}

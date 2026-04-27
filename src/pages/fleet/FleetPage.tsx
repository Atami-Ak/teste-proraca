/**
 * FleetPage.tsx — Fleet Dashboard
 * React migration of /frota/painel-frota.html
 *
 * Shows: summary cards, search/filter bar, vehicle grid.
 * Preserves: all status states, KPI display, filter logic.
 */

import { useState, useMemo }  from 'react'
import { Link }               from 'react-router-dom'
import { useFleetDashboard }  from '@/hooks/useFleetData'
import { VEHICLE_STATUS_META } from '@/types/vehicle'
import type { VehicleStatus } from '@/types/vehicle'
import VehicleCard            from '@/components/fleet/VehicleCard'
import s                      from './FleetPage.module.css'

type StatusFilter = 'all' | VehicleStatus
type CategoryFilter = 'all' | string

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all',           label: 'Todos'             },
  { value: 'operational',   label: 'Operacional'        },
  { value: 'attention',     label: 'Atenção'            },
  { value: 'preventive_due',label: 'Preventiva Devida'  },
  { value: 'in_maintenance',label: 'Em Manutenção'      },
  { value: 'stopped',       label: 'Parado'             },
  { value: 'critical',      label: 'Crítico'            },
]

const CATEGORY_FILTERS = [
  'all',
  'Caminhões Leves (3/4)',
  'Carretas',
  'Caminhões Toco/Truck',
  'Caminhões 4º Eixo',
  'Caminhões Bitruck',
  'Rodotrem',
  'Carros Leves',
  'Motos',
]

export default function FleetPage() {
  const { vehicles, loading, error, refresh } = useFleetDashboard()

  const [search,   setSearch]   = useState('')
  const [statusF,  setStatusF]  = useState<StatusFilter>('all')
  const [categoryF,setCategoryF]= useState<CategoryFilter>('all')

  // ── Summary stats ──
  const summary = useMemo(() => {
    const total        = vehicles.length
    const operational  = vehicles.filter(v => v.effectiveStatus === 'operational' || v.effectiveStatus === 'preventive_due').length
    const maintenance  = vehicles.filter(v => v.effectiveStatus === 'in_maintenance' || v.effectiveStatus === 'attention').length
    const critical     = vehicles.filter(v => v.effectiveStatus === 'stopped' || v.effectiveStatus === 'critical').length
    return { total, operational, maintenance, critical }
  }, [vehicles])

  // ── Filtered list ──
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return vehicles.filter(({ vehicle, effectiveStatus }) => {
      if (statusF !== 'all' && effectiveStatus !== statusF) return false
      if (categoryF !== 'all' && vehicle.categoria !== categoryF) return false
      if (q) {
        const hay = `${vehicle.placa} ${vehicle.modelo} ${vehicle.id} ${vehicle.motoristaPadrao ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [vehicles, search, statusF, categoryF])

  return (
    <div className={s.page}>

      {/* Page header */}
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Frota de Veículos</h1>
          <p className={s.subtitle}>{vehicles.length} veículos · atualizado agora</p>
        </div>
        <div className={s.headerActions}>
          <Link to="/frota/inspecao" className={s.btnPrimary}>+ Nova Inspeção</Link>
          <button className={s.btnSecondary} onClick={refresh} disabled={loading}>
            {loading ? 'Carregando…' : '↻ Atualizar'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className={s.summaryRow}>
        <SummaryCard label="Total Frota"   value={summary.total}       color="#0f4c75" icon="🚛" />
        <SummaryCard label="Operacional"   value={summary.operational} color="#16a34a" icon="🟢" />
        <SummaryCard label="Manutenção"    value={summary.maintenance} color="#d97706" icon="🔧" />
        <SummaryCard label="Crítico/Parado"value={summary.critical}    color="#dc2626" icon="🔴" />
      </div>

      {/* Error */}
      {error && <div className={s.error}>{error}</div>}

      {/* Filters */}
      <div className={s.filters}>
        <input
          type="search"
          className={s.searchInput}
          placeholder="Buscar por placa, modelo, motorista…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className={s.filterChips}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
              className={`${s.chip} ${statusF === f.value ? s.chipActive : ''}`}
              onClick={() => setStatusF(f.value)}
            >
              {f.value !== 'all' && <span style={{ color: VEHICLE_STATUS_META[f.value as VehicleStatus]?.color }}>{VEHICLE_STATUS_META[f.value as VehicleStatus]?.icon} </span>}
              {f.label}
            </button>
          ))}
        </div>
        <select
          className={s.categorySelect}
          value={categoryF}
          onChange={e => setCategoryF(e.target.value)}
        >
          {CATEGORY_FILTERS.map(c => (
            <option key={c} value={c}>{c === 'all' ? 'Todas as categorias' : c}</option>
          ))}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className={s.loading}>Carregando frota…</div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>🚛</div>
          <p>{search || statusF !== 'all' ? 'Nenhum veículo encontrado para os filtros aplicados.' : 'Nenhum veículo cadastrado.'}</p>
        </div>
      ) : (
        <div className={s.grid}>
          {filtered.map(v => (
            <VehicleCard key={v.vehicle.id} data={v} />
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div className={s.summaryCard} style={{ borderTopColor: color }}>
      <div className={s.summaryIcon}>{icon}</div>
      <div className={s.summaryValue} style={{ color }}>{value}</div>
      <div className={s.summaryLabel}>{label}</div>
    </div>
  )
}

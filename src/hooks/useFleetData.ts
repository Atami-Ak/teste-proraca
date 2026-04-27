/**
 * useFleetData.ts — React hooks for the Fleet module
 *
 * Fleet state is kept locally (not in the global Zustand store)
 * to keep the module self-contained.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getAllVehicleStates, getVehicleState, obterInspecoesRecentes,
  calcularKPIsVehicle, getVehicleWorkOrders, getVehiclePurchaseOrders,
  getEffectiveVehicleStatus,
} from '@/lib/db-fleet'
import { FROTA_DB } from '@/data/fleet-catalog'
import type { VehicleWithState, VehicleState, FleetInspection, VehicleKPIs } from '@/types/vehicle'

// ── Fleet dashboard ───────────────────────────────────

export function useFleetDashboard() {
  const [vehicles, setVehicles] = useState<VehicleWithState[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const stateMap = await getAllVehicleStates()
      const result: VehicleWithState[] = FROTA_DB.map(vehicle => {
        const state = stateMap[vehicle.id] ?? null
        return {
          vehicle,
          state,
          effectiveStatus: getEffectiveVehicleStatus(state),
        }
      })
      setVehicles(result)
    } catch (e) {
      setError('Erro ao carregar dados da frota.')
      console.error('[useFleetDashboard]', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { vehicles, loading, error, refresh: load }
}

// ── Single vehicle state ──────────────────────────────

export function useVehicleState(vehicleId: string | null) {
  const [state,   setState]   = useState<VehicleState | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!vehicleId) return
    setLoading(true)
    getVehicleState(vehicleId)
      .then(s => setState(s))
      .finally(() => setLoading(false))
  }, [vehicleId])

  return { state, loading }
}

// ── Vehicle inspections ───────────────────────────────

export function useVehicleInspections(vehicleId: string | null) {
  const [inspections, setInspections] = useState<FleetInspection[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    if (!vehicleId) return
    setLoading(true)
    setError(null)
    obterInspecoesRecentes(vehicleId)
      .then(data => setInspections(data))
      .catch(e => { setError('Erro ao carregar inspeções.'); console.error(e) })
      .finally(() => setLoading(false))
  }, [vehicleId])

  return { inspections, loading, error }
}

// ── Vehicle KPIs + history ────────────────────────────

export function useVehicleHistory(vehicleId: string | null) {
  const [kpis,    setKpis]    = useState<VehicleKPIs | null>(null)
  const [wos,     setWos]     = useState<Record<string, unknown>[]>([])
  const [pos,     setPos]     = useState<Record<string, unknown>[]>([])
  const [inspections, setInspections] = useState<FleetInspection[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!vehicleId) return
    setLoading(true)
    Promise.all([
      calcularKPIsVehicle(vehicleId),
      getVehicleWorkOrders(vehicleId),
      getVehiclePurchaseOrders(vehicleId),
      obterInspecoesRecentes(vehicleId, 30),
    ])
      .then(([k, w, p, i]) => {
        setKpis(k)
        setWos(w)
        setPos(p)
        setInspections(i)
      })
      .catch(e => console.error('[useVehicleHistory]', e))
      .finally(() => setLoading(false))
  }, [vehicleId])

  return { kpis, wos, pos, inspections, loading }
}

// ── Inspection draft (localStorage persistence) ────────
// Preserves form data between page refreshes.
// Photos are kept in React state only (not persisted — acceptable trade-off).

const DRAFT_KEY_PREFIX = 'draft_frota_react_'

export interface InspectionDraft {
  vehicleId:              string
  vehiclePlate:           string
  vehicleModel:           string
  vehicleCategory:        string
  inspectionType:         'departure' | 'return'
  location:               string
  destination:            string
  mileage:                string
  date:                   string
  time:                   string
  fueling:                boolean
  includeAdvancedLighting:boolean
  oilLevel:               'ok' | 'baixo' | 'critico'
  coolantLevel:           'ok' | 'baixo' | 'critico'
  brakeFluid:             'ok' | 'baixo' | 'critico'
  tiresPressure:          string
  maintenanceObs:         string
  inspectorName:          string
  driverName:             string
  generalNotes:               string
  responsibilityTermAccepted: boolean
  checklistAnswers:           Record<string, { status: 'C' | 'NC' | null; notes: string }>
  savedAt:                    number
}

export function emptyDraft(vehicleId = ''): InspectionDraft {
  const now  = new Date()
  return {
    vehicleId,
    vehiclePlate:            '',
    vehicleModel:            '',
    vehicleCategory:         '',
    inspectionType:          'departure',
    location:                '',
    destination:             '',
    mileage:                 '',
    date:                    now.toISOString().slice(0, 10),
    time:                    now.toTimeString().slice(0, 5),
    fueling:                 false,
    includeAdvancedLighting: false,
    oilLevel:                'ok',
    coolantLevel:            'ok',
    brakeFluid:              'ok',
    tiresPressure:           '',
    maintenanceObs:          '',
    inspectorName:           '',
    driverName:              '',
    generalNotes:               '',
    responsibilityTermAccepted: false,
    checklistAnswers:           {},
    savedAt:                    0,
  }
}

export function useInspectionDraft(vehicleId: string | null) {
  const draftKey = vehicleId ? `${DRAFT_KEY_PREFIX}${vehicleId}` : null

  function loadDraft(): InspectionDraft | null {
    if (!draftKey) return null
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as InspectionDraft
      // Discard drafts older than 7 days
      if (Date.now() - parsed.savedAt > 7 * 24 * 3_600_000) {
        localStorage.removeItem(draftKey)
        return null
      }
      return parsed
    } catch {
      return null
    }
  }

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function saveDraft(draft: InspectionDraft) {
    if (!draftKey) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ ...draft, savedAt: Date.now() }))
      } catch {
        // quota exceeded — silently fail
      }
    }, 400)
  }

  function clearDraft() {
    if (!draftKey) return
    localStorage.removeItem(draftKey)
  }

  return { loadDraft, saveDraft, clearDraft }
}

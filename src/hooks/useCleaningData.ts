import { useState, useEffect, useCallback } from 'react'
import {
  fetchAllInspections, fetchZonePerformance, fetchEmployeePerformance,
  type ZonePerfRow, type EmployeePerfRow,
} from '@/lib/db-cleaning'
import { CATALOGO_ZONAS, EQUIPE_LIMPEZA, ZONE_MAP, EMPLOYEE_MAP } from '@/data/cleaning-catalog'
import type { CleaningInspection, ZonePerformance, EmployeePerformance, EmployeeStatus } from '@/types/cleaning'
import { scoreToStatus } from '@/lib/cleaning-scoring'

// ── Dashboard hook ─────────────────────────────────────

export interface CleaningDashboardData {
  inspections:    CleaningInspection[]
  zonePerf:       ZonePerformance[]
  employeePerf:   EmployeePerformance[]
  loading:        boolean
  error:          string | null
  refresh:        () => void
}

function empStatusFromRow(row: EmployeePerfRow): EmployeeStatus {
  if (row.totalInspections === 0) return 'no_data'
  if (row.averageScore >= 75)     return 'top'
  if (row.averageScore >= 50)     return 'needs_improvement'
  return 'critical'
}

function mergeZonePerf(perfRows: ZonePerfRow[]): ZonePerformance[] {
  const rowMap = new Map(perfRows.map(r => [r.zoneId, r]))

  return CATALOGO_ZONAS.map(zone => {
    const row = rowMap.get(zone.id)
    if (!row) {
      return {
        zoneId:          zone.id,
        zoneName:        zone.nome,
        zoneIcon:        zone.icone,
        totalInspections: 0,
        averageScore:    0,
        latestScore:     null,
        latestStatus:    'no_data' as const,
        latestEmployee:  '—',
        latestTs:        0,
        scoreHistory:    [],
        issueCount:      0,
      }
    }
    return {
      zoneId:          zone.id,
      zoneName:        zone.nome,
      zoneIcon:        zone.icone,
      totalInspections: row.totalInspections,
      averageScore:    row.averageScore,
      latestScore:     row.latestScore,
      latestStatus:    row.latestStatus,
      latestEmployee:  row.latestEmployee,
      latestTs:        row.latestTs,
      scoreHistory:    row.scoreHistory,
      issueCount:      row.issueCount,
    }
  })
}

function mergeEmployeePerf(perfRows: EmployeePerfRow[]): EmployeePerformance[] {
  const rowMap = new Map(perfRows.map(r => [r.employeeId, r]))

  return EQUIPE_LIMPEZA.map(emp => {
    const row = rowMap.get(emp.id)
    if (!row) {
      return {
        employeeId:       emp.id,
        employeeName:     emp.nome,
        cargo:            emp.cargo,
        totalInspections: 0,
        averageScore:     0,
        failures:         0,
        criticalIssues:   0,
        status:           'no_data' as const,
        latestTs:         0,
      }
    }
    return {
      employeeId:       emp.id,
      employeeName:     emp.nome,
      cargo:            emp.cargo,
      totalInspections: row.totalInspections,
      averageScore:     row.averageScore,
      failures:         row.failures,
      criticalIssues:   row.criticalIssues,
      status:           empStatusFromRow(row),
      latestTs:         row.latestTs,
    }
  })
}

export function useCleaningDashboard(): CleaningDashboardData {
  const [inspections,  setInspections]  = useState<CleaningInspection[]>([])
  const [zonePerf,     setZonePerf]     = useState<ZonePerformance[]>([])
  const [employeePerf, setEmployeePerf] = useState<EmployeePerformance[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [allInsp, zRows, eRows] = await Promise.all([
        fetchAllInspections(),
        fetchZonePerformance(),
        fetchEmployeePerformance(),
      ])
      setInspections(allInsp)
      setZonePerf(mergeZonePerf(zRows))
      setEmployeePerf(mergeEmployeePerf(eRows))
    } catch (e) {
      setError('Erro ao carregar dados de limpeza.')
      console.error('[useCleaningDashboard]', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { inspections, zonePerf, employeePerf, loading, error, refresh: load }
}

// ── KPIs (30-day window) ─────────────────────────────

export interface CleaningKPIs {
  avgScore:      number
  totalInsp:     number
  openActions:   number
  criticalZones: number
  compliance:    number  // % zones with avgScore >= 75
}

export function computeKPIs(
  inspections: CleaningInspection[],
  zonePerf:    ZonePerformance[],
): CleaningKPIs {
  const cutoff  = Date.now() - 30 * 24 * 3_600_000
  const recent  = inspections.filter(i => i.timestampEnvio >= cutoff)

  const avgScore    = recent.length > 0
    ? Math.round(recent.reduce((s, i) => s + i.score, 0) / recent.length)
    : 0
  const openActions = recent.reduce((s, i) => s + i.issues.filter(is => !is.linkedWOId).length, 0)
  const criticalZones = zonePerf.filter(z => z.latestScore !== null && z.latestScore < 50).length
  const zonesWithData = zonePerf.filter(z => z.totalInspections > 0)
  const compliance  = zonesWithData.length > 0
    ? Math.round(zonesWithData.filter(z => (z.latestScore ?? 0) >= 75).length / zonesWithData.length * 100)
    : 0

  return { avgScore, totalInsp: recent.length, openActions, criticalZones, compliance }
}

// ── History hook ───────────────────────────────────────

export interface CleaningHistoryData {
  inspections: CleaningInspection[]
  loading:     boolean
  error:       string | null
  refresh:     () => void
}

export function useCleaningHistory(): CleaningHistoryData {
  const [inspections, setInspections] = useState<CleaningInspection[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setInspections(await fetchAllInspections())
    } catch (e) {
      setError('Erro ao carregar histórico.')
      console.error('[useCleaningHistory]', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  return { inspections, loading, error, refresh: load }
}

// ── Catalog helpers (re-exported for convenience) ──────

export { CATALOGO_ZONAS, EQUIPE_LIMPEZA, ZONE_MAP, EMPLOYEE_MAP }
export { scoreToStatus }

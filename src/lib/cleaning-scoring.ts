import type { Zone, ScoringResult, FormScores, InspectionStatus, SectionScore } from '@/types/cleaning'

// ── Score conversion ──────────────────────────────────

export function scoreToStatus(score: number): InspectionStatus {
  if (score >= 90) return 'excellent'
  if (score >= 75) return 'acceptable'
  if (score >= 50) return 'attention'
  return 'critical'
}

export function scoreToColor(score: number): string {
  if (score >= 90) return '#16a34a'
  if (score >= 75) return '#d97706'
  if (score >= 50) return '#ea580c'
  return '#dc2626'
}

export function scoreToColorLight(score: number): string {
  if (score >= 90) return '#f0fdf4'
  if (score >= 75) return '#fffbeb'
  if (score >= 50) return '#fff7ed'
  return '#fef2f2'
}

// ── Core scoring algorithm (matches legacy calcularPontuacao) ──────────────

export function calcularPontuacao(zone: Zone, scores: FormScores): ScoringResult {
  let totalObtido   = 0
  let totalPossivel = 0
  const sections: SectionScore[] = []

  for (const sec of zone.sections) {
    let secObtido   = 0
    let secPossivel = 0
    const items: SectionScore['items'] = []

    for (const item of sec.items) {
      const score = scores[item.id] ?? null
      if (score === null) continue  // N/A — excluded from calculation
      secObtido   += score
      secPossivel += 5
      items.push({ ...item, scoreGiven: score })
    }

    const secScore = secPossivel > 0 ? Math.round((secObtido / secPossivel) * 100) : 100
    sections.push({ id: sec.id, nome: sec.nome, score: secScore, items })
    totalObtido   += secObtido
    totalPossivel += secPossivel
  }

  const finalScore    = totalPossivel > 0 ? Math.round((totalObtido / totalPossivel) * 100) : 0
  const hasLowSection = sections.some(s => s.score < 60)

  return { finalScore, sections, hasLowSection }
}

// ── Effective status (applies section cap rule) ────────────────────────────

export function effectiveStatus(finalScore: number, hasLowSection: boolean): InspectionStatus {
  const raw = scoreToStatus(finalScore)
  if (!hasLowSection) return raw
  // Cap at "attention" when any section < 60%
  if (raw === 'excellent' || raw === 'acceptable') return 'attention'
  return raw
}

// ── Format helpers ─────────────────────────────────────

export function formatScore(score: number): string {
  return `${score.toFixed(0)}%`
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Ranking computation (matches legacy computeRanking) ───────────────────

export interface RankedEmployee {
  employeeId:       string
  employeeName:     string
  cargo:            string
  zoneNames:        string[]
  totalInspections: number
  averageScore:     number
  hasData:          boolean
}

export interface RankedZone {
  zoneId:           string
  zoneName:         string
  zoneIcon:         string
  teamNames:        string[]
  totalInspections: number
  averageScore:     number
  hasData:          boolean
}

export function computeEmployeeRanking(
  inspections: Array<{ employeeId: string; employeeName: string; score: number; zoneId: string; zoneName: string; timestampEnvio: number }>,
  employees: Array<{ id: string; nome: string; cargo: string }>,
  days: number,
): RankedEmployee[] {
  const cutoff  = Date.now() - days * 24 * 3_600_000
  const recent  = inspections.filter(i => i.timestampEnvio >= cutoff)

  const map = new Map<string, { scores: number[]; zones: Set<string> }>()
  for (const insp of recent) {
    if (!map.has(insp.employeeId)) map.set(insp.employeeId, { scores: [], zones: new Set() })
    map.get(insp.employeeId)!.scores.push(insp.score)
    map.get(insp.employeeId)!.zones.add(insp.zoneName)
  }

  const withData: RankedEmployee[] = []
  const withoutData: RankedEmployee[] = []

  for (const emp of employees) {
    const entry = map.get(emp.id)
    if (entry && entry.scores.length > 0) {
      const avg = entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length
      withData.push({
        employeeId:       emp.id,
        employeeName:     emp.nome,
        cargo:            emp.cargo,
        zoneNames:        [...entry.zones],
        totalInspections: entry.scores.length,
        averageScore:     Math.round(avg),
        hasData:          true,
      })
    } else {
      withoutData.push({
        employeeId:       emp.id,
        employeeName:     emp.nome,
        cargo:            emp.cargo,
        zoneNames:        [],
        totalInspections: 0,
        averageScore:     0,
        hasData:          false,
      })
    }
  }

  withData.sort((a, b) => b.averageScore - a.averageScore)
  return [...withData, ...withoutData]
}

export function computeZoneRanking(
  inspections: Array<{ zoneId: string; zoneName: string; score: number; timestampEnvio: number }>,
  zones: Array<{ id: string; nome: string; icone: string; responsaveis: string[] }>,
  employees: Array<{ id: string; nome: string }>,
  days: number,
): RankedZone[] {
  const cutoff = Date.now() - days * 24 * 3_600_000
  const recent = inspections.filter(i => i.timestampEnvio >= cutoff)

  const map = new Map<string, number[]>()
  for (const insp of recent) {
    if (!map.has(insp.zoneId)) map.set(insp.zoneId, [])
    map.get(insp.zoneId)!.push(insp.score)
  }

  const empMap = new Map(employees.map(e => [e.id, e.nome]))

  const withData: RankedZone[] = []
  const withoutData: RankedZone[] = []

  for (const zone of zones) {
    const scores = map.get(zone.id)
    const teamNames = zone.responsaveis.map(id => empMap.get(id) ?? id)
    if (scores && scores.length > 0) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      withData.push({
        zoneId:           zone.id,
        zoneName:         zone.nome,
        zoneIcon:         zone.icone,
        teamNames,
        totalInspections: scores.length,
        averageScore:     Math.round(avg),
        hasData:          true,
      })
    } else {
      withoutData.push({
        zoneId:           zone.id,
        zoneName:         zone.nome,
        zoneIcon:         zone.icone,
        teamNames,
        totalInspections: 0,
        averageScore:     0,
        hasData:          false,
      })
    }
  }

  withData.sort((a, b) => b.averageScore - a.averageScore)
  return [...withData, ...withoutData]
}

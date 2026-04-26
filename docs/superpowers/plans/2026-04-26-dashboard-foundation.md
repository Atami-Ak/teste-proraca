# Dashboard Executivo — Sub-projeto A: Fundação + Visão Executiva

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o iframe legado em `/dashboard` por um dashboard React com shell de tabs, seletor de período compartilhado, cache Firebase e módulo de Visão Executiva com 12 KPIs, alertas em tempo real e 2 gráficos Recharts.

**Architecture:** Sub-rotas React Router (`/dashboard/*`) com `DashboardLayout` como layout wrapper. Dados híbridos: `onSnapshot` para alertas/aprovações em tempo real, cache Firestore com TTL 15min para KPIs agregados computados client-side. `PeriodContext` compartilhado entre todos os módulos filhos.

**Tech Stack:** React 18, React Router v6, TypeScript strict, Recharts 2.x, Firebase Firestore (onSnapshot + getDocs), CSS Modules, Zustand (leitura), Vite

---

## File Map

| Ação | Arquivo |
|------|---------|
| Instalar | `recharts` via yarn |
| Criar | `src/types/dashboard.ts` |
| Criar | `src/context/PeriodContext.tsx` |
| Criar | `src/lib/db-dashboard.ts` |
| Criar | `src/hooks/useDashboardOverview.ts` |
| Criar | `src/pages/dashboard/overview/components/KpiCard.tsx` |
| Criar | `src/pages/dashboard/overview/components/KpiCard.module.css` |
| Criar | `src/pages/dashboard/overview/components/AlertFeed.tsx` |
| Criar | `src/pages/dashboard/overview/components/AlertFeed.module.css` |
| Criar | `src/pages/dashboard/overview/components/ModuleHealthBar.tsx` |
| Criar | `src/pages/dashboard/overview/components/ModuleHealthBar.module.css` |
| Criar | `src/pages/dashboard/overview/components/OverviewCharts.tsx` |
| Criar | `src/pages/dashboard/overview/components/OverviewCharts.module.css` |
| Criar | `src/pages/dashboard/overview/OverviewPage.tsx` |
| Criar | `src/pages/dashboard/overview/OverviewPage.module.css` |
| Criar | `src/pages/dashboard/PlaceholderPage.tsx` |
| Criar | `src/pages/dashboard/PlaceholderPage.module.css` |
| Criar | `src/pages/dashboard/DashboardLayout.tsx` |
| Criar | `src/pages/dashboard/DashboardLayout.module.css` |
| Modificar | `src/App.tsx` (substituir rota /dashboard) |
| Modificar | `firestore.rules` (adicionar regras dashboard_kpi_cache) |

---

## Task 1: Install Recharts

**Files:**
- Modify: `package.json` (via yarn add)

- [ ] **Step 1: Install recharts**

```bash
cd "C:/Users/Atami/Desktop/Pro Raça - Sistema/proraca v2.0-pr/teste-pr-main"
yarn add recharts
```

Expected output: recharts added to dependencies. Recharts 2.x includes TypeScript types natively — no `@types/recharts` needed.

- [ ] **Step 2: Verify TypeScript can resolve Recharts types**

```bash
npx tsc --noEmit 2>&1 | head -5
```

Expected: 0 errors (or only the pre-existing `@ts-expect-error` lines — no new errors).

- [ ] **Step 3: Commit**

```bash
git add package.json yarn.lock
git commit -m "deps: add recharts 2.x for dashboard charts"
```

---

## Task 2: Dashboard TypeScript types

**Files:**
- Create: `src/types/dashboard.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/types/dashboard.ts

import type { Timestamp } from 'firebase/firestore'

// ── Period ────────────────────────────────────────────

export type Period = '30d' | '90d' | '6m' | '1a'

export interface DateRange {
  from: Date
  to:   Date
}

export function periodToDays(p: Period): number {
  return p === '30d' ? 30 : p === '90d' ? 90 : p === '6m' ? 180 : 365
}

export function getPeriodRanges(period: Period): { current: DateRange; prev: DateRange } {
  const days = periodToDays(period)
  const now  = new Date()
  const from = new Date(now.getTime() - days * 86_400_000)
  const prevTo   = new Date(from.getTime() - 1)
  const prevFrom = new Date(prevTo.getTime() - days * 86_400_000)
  return {
    current: { from, to: now },
    prev:    { from: prevFrom, to: prevTo },
  }
}

// ── KPI ───────────────────────────────────────────────

export type DashboardModule =
  | 'overview' | 'maquinario' | 'frota' | 'limpeza'
  | 'seguranca' | 'colaboradores' | 'obras' | 'compras'
  | 'aprovacoes' | 'documentos' | 'acesso'

export type KpiSeverity = 'neutral' | 'good' | 'warning' | 'critical'

export interface KpiMetric {
  key:      string
  label:    string
  value:    number
  prev:     number
  trend:    number          // ((value - prev) / max(1, prev)) * 100, rounded
  unit?:    string          // 'R$', '%', etc.
  module:   DashboardModule
  severity: KpiSeverity     // determines trend color direction
  detail?:  string          // ex: "2 críticas", "atualizado há 3min"
}

// trend color logic (exported for KpiCard):
// severity=critical → trend>0 = red (bad), trend<0 = green (good)
// severity=good     → trend>0 = green, trend<0 = red
// severity=neutral  → always gray
export function trendColor(severity: KpiSeverity, trend: number): string {
  if (severity === 'neutral' || trend === 0) return '#94a3b8'
  if (severity === 'critical') return trend > 0 ? '#dc2626' : '#16a34a'
  return trend > 0 ? '#16a34a' : '#dc2626'
}

export function trendIcon(trend: number): string {
  if (trend > 0) return '▲'
  if (trend < 0) return '▼'
  return '—'
}

// ── Alert ─────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'urgent' | 'attention'

export interface AlertItem {
  id:        string
  severity:  AlertSeverity
  title:     string
  module:    DashboardModule
  createdAt: Date
  linkTo:    string
}

// ── Module Health ─────────────────────────────────────

export type HealthStatus = 'ok' | 'warning' | 'critical'

export interface ModuleHealth {
  module:  DashboardModule
  label:   string
  status:  HealthStatus
  metric:  string
}

// ── KPI Cache (Firestore document) ────────────────────

export interface KpiValue {
  value: number
  prev:  number
}

export interface KpiCacheDoc {
  generatedAt:          Timestamp
  period:               Period
  ordensAbertas:        KpiValue
  aprovacoesPendentes:  KpiValue
  manutencaoAtrasada:   KpiValue
  comprasUrgentes:      KpiValue
  alertasMaquinario:    KpiValue
  alertasFrota:         KpiValue
  falhasLimpeza:        KpiValue
  incidentesSeguranca:  KpiValue
  alertasColaboradores: KpiValue
  empreiteirasCriticas: KpiValue
  problemsFornecedores: KpiValue
  itensAuditoriaPend:   KpiValue
}

// ── Chart Data ────────────────────────────────────────

export interface OverviewChartPoint {
  date:       string   // 'DD/MM' for display
  abertas:    number   // OS abertas
  concluidas: number   // OS concluídas
  custo:      number   // custo operacional R$
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/dashboard.ts
git commit -m "feat(dashboard): add TypeScript types for dashboard foundation"
```

---

## Task 3: PeriodContext

**Files:**
- Create: `src/context/PeriodContext.tsx`

- [ ] **Step 1: Create the context**

```tsx
// src/context/PeriodContext.tsx

import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import type { Period, DateRange } from '@/types/dashboard'
import { getPeriodRanges }        from '@/types/dashboard'

const STORAGE_KEY = 'dashboard-period'

interface PeriodContextValue {
  period:    Period
  setPeriod: (p: Period) => void
  current:   DateRange
  prev:      DateRange
}

const PeriodContext = createContext<PeriodContextValue | null>(null)

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const [period, setPeriodState] = useState<Period>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return (stored as Period | null) ?? '30d'
  })

  function setPeriod(p: Period) {
    localStorage.setItem(STORAGE_KEY, p)
    setPeriodState(p)
  }

  const ranges = useMemo(() => getPeriodRanges(period), [period])

  return (
    <PeriodContext.Provider value={{
      period,
      setPeriod,
      current: ranges.current,
      prev:    ranges.prev,
    }}>
      {children}
    </PeriodContext.Provider>
  )
}

export function usePeriod(): PeriodContextValue {
  const ctx = useContext(PeriodContext)
  if (!ctx) throw new Error('usePeriod must be used inside PeriodProvider')
  return ctx
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/context/PeriodContext.tsx
git commit -m "feat(dashboard): add PeriodContext with localStorage persistence"
```

---

## Task 4: Data layer — db-dashboard.ts

**Files:**
- Create: `src/lib/db-dashboard.ts`

- [ ] **Step 1: Create the data layer**

```typescript
// src/lib/db-dashboard.ts
//
// Collections used:
//   work_orders, purchase_orders, asset_maintenance  — from db.ts domain
//   vehicle_state                                    — from db-fleet.ts domain
//   cleaning_inspections                             — from db-cleaning.ts domain
//   safety_occurrences                               — from db-safety.ts domain
//   employees                                        — from db-employees.ts domain
//   avaliacoes_empreiteira                           — from db-obras.ts domain
//   dashboard_kpi_cache                              — new cache collection

import {
  collection, doc, getDoc, getDocs, setDoc, onSnapshot,
  query, where, orderBy, limit, serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db }            from './firebase'
import type {
  Period, DateRange, KpiCacheDoc, KpiValue,
  AlertItem, AlertSeverity, DashboardModule, OverviewChartPoint,
} from '@/types/dashboard'
import { getPeriodRanges } from '@/types/dashboard'

// ── Constants ─────────────────────────────────────────────
const KPI_CACHE_COLLECTION = 'dashboard_kpi_cache'
const KPI_CACHE_DOC        = 'current'
const KPI_TTL_MS           = 15 * 60 * 1000  // 15 minutes

// ── Timestamp helper ──────────────────────────────────────
function tsToDate(ts: unknown): Date | undefined {
  if (!ts) return undefined
  if (ts instanceof Date) return ts
  const t = ts as { toDate?: () => Date; seconds?: number }
  if (typeof t.toDate === 'function') return t.toDate()
  if (typeof t.seconds === 'number') return new Date(t.seconds * 1000)
  return undefined
}

function calcTrend(value: number, prev: number): number {
  if (prev === 0) return value > 0 ? 100 : 0
  return Math.round(((value - prev) / prev) * 100)
}

function kv(value: number, prev: number): KpiValue {
  return { value, prev }
}

// ─────────────────────────────────────────────────────────
// KPI CACHE
// ─────────────────────────────────────────────────────────

export async function readKpiCache(period: Period): Promise<KpiCacheDoc | null> {
  try {
    const snap = await getDoc(doc(db, KPI_CACHE_COLLECTION, KPI_CACHE_DOC))
    if (!snap.exists()) return null
    const data = snap.data() as KpiCacheDoc
    const age  = Date.now() - (tsToDate(data.generatedAt)?.getTime() ?? 0)
    if (age > KPI_TTL_MS || data.period !== period) return null
    return data
  } catch {
    return null
  }
}

export async function computeAndWriteKpiCache(period: Period): Promise<KpiCacheDoc> {
  const { current, prev } = getPeriodRanges(period)
  const now = new Date()

  // ── Parallel queries ──────────────────────────────────
  const [
    openOrdersSnap,
    pendingPOsSnap,
    lateMaintSnap,
    prevLateMaintSnap,
    fleetStateSnap,
    cleaningCurrSnap,
    cleaningPrevSnap,
    safetyOccCurrSnap,
    safetyOccPrevSnap,
    employeesSnap,
    empreiteirasCurrSnap,
    empreiteirasPrevSnap,
    cancelledPOsCurrSnap,
    cancelledPOsPrevSnap,
    workPermitsSnap,
  ] = await Promise.all([
    getDocs(query(collection(db, 'work_orders'), where('status', 'in', ['open', 'in_progress']))),
    getDocs(query(collection(db, 'purchase_orders'), where('status', '==', 'pending'))),
    getDocs(query(collection(db, 'asset_maintenance'), where('status', 'in', ['pendente', 'andamento']))),
    getDocs(query(collection(db, 'asset_maintenance'), where('status', 'in', ['pendente', 'andamento']), where('scheduledDate', '>=', prev.from), where('scheduledDate', '<=', prev.to))),
    getDocs(collection(db, 'vehicle_state')),
    getDocs(query(collection(db, 'cleaning_inspections'), where('timestampEnvio', '>=', current.from.getTime()))),
    getDocs(query(collection(db, 'cleaning_inspections'), where('timestampEnvio', '>=', prev.from.getTime()), where('timestampEnvio', '<=', prev.to.getTime()))),
    getDocs(query(collection(db, 'safety_occurrences'), where('createdAt', '>=', current.from))),
    getDocs(query(collection(db, 'safety_occurrences'), where('createdAt', '>=', prev.from), where('createdAt', '<=', prev.to))),
    getDocs(query(collection(db, 'employees'), where('status', '==', 'ativo'))),
    getDocs(query(collection(db, 'avaliacoes_empreiteira'), where('createdAt', '>=', current.from))),
    getDocs(query(collection(db, 'avaliacoes_empreiteira'), where('createdAt', '>=', prev.from), where('createdAt', '<=', prev.to))),
    getDocs(query(collection(db, 'purchase_orders'), where('status', '==', 'cancelled'), where('updatedAt', '>=', current.from))),
    getDocs(query(collection(db, 'purchase_orders'), where('status', '==', 'cancelled'), where('updatedAt', '>=', prev.from), where('updatedAt', '<=', prev.to))),
    getDocs(query(collection(db, 'work_permits'), where('status', '==', 'pendente'))),
  ])

  // ── Ordenes abertas ───────────────────────────────────
  const ordensAbertas = kv(openOrdersSnap.size, 0)  // current state, no prev

  // ── Aprovações pendentes ──────────────────────────────
  const aprovacoesPendentes = kv(pendingPOsSnap.size, 0)

  // ── Manutenção atrasada ───────────────────────────────
  const lateMaintCount = lateMaintSnap.docs.filter(d => {
    const sd = tsToDate(d.data().scheduledDate)
    return sd && sd < now
  }).length
  const prevLateMaintCount = prevLateMaintSnap.docs.filter(d => {
    const sd = tsToDate(d.data().scheduledDate)
    return sd && sd < prev.to
  }).length
  const manutencaoAtrasada = kv(lateMaintCount, prevLateMaintCount)

  // ── Compras urgentes ──────────────────────────────────
  const comprasUrgentes = kv(pendingPOsSnap.size, 0)

  // ── Alertas maquinário ────────────────────────────────
  const maintAlerts = lateMaintSnap.docs.length
  const prevMaintAlerts = prevLateMaintSnap.docs.length
  const alertasMaquinario = kv(maintAlerts, prevMaintAlerts)

  // ── Alertas frota ─────────────────────────────────────
  const fleetAlerts = fleetStateSnap.docs.filter(d => {
    const s = d.data().status as string
    return s === 'danger' || s === 'warning'
  }).length
  const alertasFrota = kv(fleetAlerts, 0)

  // ── Falhas limpeza (score < 60) ───────────────────────
  const cleaningFails = cleaningCurrSnap.docs.filter(d => (d.data().score as number ?? 0) < 60).length
  const prevCleaningFails = cleaningPrevSnap.docs.filter(d => (d.data().score as number ?? 0) < 60).length
  const falhasLimpeza = kv(cleaningFails, prevCleaningFails)

  // ── Incidentes segurança ──────────────────────────────
  const incidentesSeguranca = kv(safetyOccCurrSnap.size, safetyOccPrevSnap.size)

  // ── Alertas colaboradores (crítico/atenção) ───────────
  const criticalEmps = employeesSnap.docs.filter(d => {
    const sp = d.data().statusPerformance as string
    return sp === 'critico' || sp === 'atencao'
  }).length
  const alertasColaboradores = kv(criticalEmps, 0)

  // ── Empreiteiras críticas (score < 60) ───────────────
  const emprCrit = empreiteirasCurrSnap.docs.filter(d => (d.data().score as number ?? 100) < 60).length
  const prevEmprCrit = empreiteirasPrevSnap.docs.filter(d => (d.data().score as number ?? 100) < 60).length
  const empreiteirasCriticas = kv(emprCrit, prevEmprCrit)

  // ── Problemas fornecedores (POs canceladas) ──────────
  const problemsFornecedores = kv(cancelledPOsCurrSnap.size, cancelledPOsPrevSnap.size)

  // ── Itens auditoria pendentes (PT pendentes) ──────────
  const itensAuditoriaPend = kv(workPermitsSnap.size, 0)

  const cacheData: Omit<KpiCacheDoc, 'generatedAt'> = {
    period,
    ordensAbertas,
    aprovacoesPendentes,
    manutencaoAtrasada,
    comprasUrgentes,
    alertasMaquinario,
    alertasFrota,
    falhasLimpeza,
    incidentesSeguranca,
    alertasColaboradores,
    empreiteirasCriticas,
    problemsFornecedores,
    itensAuditoriaPend,
  }

  await setDoc(doc(db, KPI_CACHE_COLLECTION, KPI_CACHE_DOC), {
    ...cacheData,
    generatedAt: serverTimestamp(),
  })

  return { ...cacheData, generatedAt: { toDate: () => new Date(), seconds: Date.now() / 1000, nanoseconds: 0 } as unknown as import('firebase/firestore').Timestamp }
}

// ─────────────────────────────────────────────────────────
// LIVE ALERTS (onSnapshot)
// ─────────────────────────────────────────────────────────

export function subscribeToAlerts(
  cb: (alerts: AlertItem[]) => void
): Unsubscribe {
  const now = new Date()

  // Subscribe to overdue OS (scheduled >5 days ago, still open)
  const cutoff5d = new Date(now.getTime() - 5 * 86_400_000)

  const unsubs: Unsubscribe[] = []
  const state: Record<string, AlertItem[]> = {
    os:       [],
    maint:    [],
    safety:   [],
  }

  function emit() {
    const all = [...state.os, ...state.maint, ...state.safety]
    all.sort((a, b) => {
      const order: Record<string, number> = { critical: 0, urgent: 1, attention: 2 }
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
    })
    cb(all.slice(0, 30))  // max 30 alerts in feed
  }

  // Overdue work orders
  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'work_orders'),
        where('status', 'in', ['open', 'in_progress']),
        limit(50)
      ),
      snap => {
        state.os = snap.docs
          .filter(d => {
            const sd = tsToDate(d.data().scheduledDate)
            return sd && sd < cutoff5d
          })
          .map(d => ({
            id:        d.id,
            severity:  'urgent' as AlertSeverity,
            title:     `OS atrasada: ${(d.data().title as string) ?? d.id}`,
            module:    'maquinario' as DashboardModule,
            createdAt: tsToDate(d.data().createdAt) ?? new Date(),
            linkTo:    '/os',
          }))
        emit()
      }
    )
  )

  // Overdue maintenance
  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'asset_maintenance'),
        where('status', 'in', ['pendente', 'andamento']),
        limit(50)
      ),
      snap => {
        state.maint = snap.docs
          .filter(d => {
            const sd = tsToDate(d.data().scheduledDate)
            return sd && sd < now
          })
          .map(d => ({
            id:        d.id,
            severity:  'attention' as AlertSeverity,
            title:     `Manutenção pendente: ${(d.data().description as string)?.slice(0, 50) ?? d.id}`,
            module:    'maquinario' as DashboardModule,
            createdAt: tsToDate(d.data().createdAt) ?? new Date(),
            linkTo:    '/ativos/manutencao',
          }))
        emit()
      }
    )
  )

  // Unresolved safety incidents
  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'safety_occurrences'),
        where('resolvido', '==', false),
        limit(20)
      ),
      snap => {
        state.safety = snap.docs.map(d => ({
          id:        d.id,
          severity:  'critical' as AlertSeverity,
          title:     `Incidente não resolvido: ${(d.data().titulo as string) ?? d.id}`,
          module:    'seguranca' as DashboardModule,
          createdAt: tsToDate(d.data().createdAt) ?? new Date(),
          linkTo:    '/seguranca/ocorrencias',
        }))
        emit()
      }
    )
  )

  return () => unsubs.forEach(u => u())
}

// ─────────────────────────────────────────────────────────
// PENDING APPROVALS COUNT (for tab badge)
// ─────────────────────────────────────────────────────────

export function subscribeToPendingCount(cb: (count: number) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'purchase_orders'), where('status', '==', 'pending')),
    snap => cb(snap.size)
  )
}

// ─────────────────────────────────────────────────────────
// CHART DATA
// ─────────────────────────────────────────────────────────

export async function fetchOverviewChartData(
  current: DateRange,
  period:  Period
): Promise<OverviewChartPoint[]> {
  const [osSnap, maintSnap] = await Promise.all([
    getDocs(query(
      collection(db, 'work_orders'),
      where('createdAt', '>=', current.from),
      orderBy('createdAt', 'asc'),
    )),
    getDocs(query(
      collection(db, 'asset_maintenance'),
      where('createdAt', '>=', current.from),
      orderBy('createdAt', 'asc'),
    )),
  ])

  // Group by day or week based on period
  const useWeekly = period === '90d' || period === '6m' || period === '1a'
  const buckets   = new Map<string, { abertas: number; concluidas: number; custo: number }>()

  function bucketKey(date: Date): string {
    if (!useWeekly) {
      return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}`
    }
    // Weekly: use Monday of the week
    const d = new Date(date)
    d.setDate(d.getDate() - d.getDay() + 1)
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
  }

  function ensureBucket(key: string) {
    if (!buckets.has(key)) buckets.set(key, { abertas: 0, concluidas: 0, custo: 0 })
  }

  osSnap.docs.forEach(d => {
    const data   = d.data()
    const date   = tsToDate(data.createdAt)
    if (!date) return
    const key = bucketKey(date)
    ensureBucket(key)
    const bucket = buckets.get(key)!
    if (data.status === 'open' || data.status === 'in_progress') bucket.abertas++
    else if (data.status === 'completed') bucket.concluidas++
  })

  maintSnap.docs.forEach(d => {
    const data  = d.data()
    const date  = tsToDate(data.completedDate ?? data.createdAt)
    if (!date) return
    const key = bucketKey(date)
    ensureBucket(key)
    const bucket = buckets.get(key)!
    bucket.custo += (data.cost as number) ?? 0
  })

  return Array.from(buckets.entries())
    .sort(([a], [b]) => {
      const [da, ma] = a.split('/').map(Number)
      const [db2, mb] = b.split('/').map(Number)
      return ma !== mb ? ma - mb : da - db2
    })
    .map(([date, vals]) => ({ date, ...vals }))
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db-dashboard.ts
git commit -m "feat(dashboard): add db-dashboard.ts — KPI cache, live alerts, chart data"
```

---

## Task 5: useDashboardOverview hook

**Files:**
- Create: `src/hooks/useDashboardOverview.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useDashboardOverview.ts

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  readKpiCache, computeAndWriteKpiCache,
  subscribeToAlerts, fetchOverviewChartData,
} from '@/lib/db-dashboard'
import type {
  KpiMetric, AlertItem, ModuleHealth, OverviewChartPoint,
  KpiCacheDoc, Period, DateRange, KpiSeverity,
} from '@/types/dashboard'
import { trendColor, trendIcon } from '@/types/dashboard'

// ── KPI definition map ────────────────────────────────
interface KpiDef {
  key:      keyof Omit<KpiCacheDoc, 'generatedAt' | 'period'>
  label:    string
  module:   KpiMetric['module']
  severity: KpiSeverity
  unit?:    string
}

const KPI_DEFS: KpiDef[] = [
  { key: 'ordensAbertas',        label: 'OS Abertas',              module: 'aprovacoes',    severity: 'warning'  },
  { key: 'aprovacoesPendentes',  label: 'Aprovações Pendentes',    module: 'aprovacoes',    severity: 'warning'  },
  { key: 'manutencaoAtrasada',   label: 'Manutenção Atrasada',     module: 'maquinario',    severity: 'critical' },
  { key: 'comprasUrgentes',      label: 'Compras Urgentes',        module: 'compras',       severity: 'warning'  },
  { key: 'alertasMaquinario',    label: 'Alertas Maquinário',      module: 'maquinario',    severity: 'critical' },
  { key: 'alertasFrota',         label: 'Alertas Frota',           module: 'frota',         severity: 'critical' },
  { key: 'falhasLimpeza',        label: 'Falhas Limpeza 5S',       module: 'limpeza',       severity: 'critical' },
  { key: 'incidentesSeguranca',  label: 'Incidentes Segurança',    module: 'seguranca',     severity: 'critical' },
  { key: 'alertasColaboradores', label: 'Alertas Colaboradores',   module: 'colaboradores', severity: 'warning'  },
  { key: 'empreiteirasCriticas', label: 'Empreiteiras Críticas',   module: 'obras',         severity: 'critical' },
  { key: 'problemsFornecedores', label: 'Prob. Fornecedores',      module: 'compras',       severity: 'warning'  },
  { key: 'itensAuditoriaPend',   label: 'Auditoria Pendente',      module: 'seguranca',     severity: 'warning'  },
]

function cacheToMetrics(cache: KpiCacheDoc): KpiMetric[] {
  return KPI_DEFS.map(def => {
    const { value, prev } = cache[def.key]
    const trend = prev === 0 ? (value > 0 ? 100 : 0) : Math.round(((value - prev) / prev) * 100)
    return {
      key:      def.key,
      label:    def.label,
      value,
      prev,
      trend,
      unit:     def.unit,
      module:   def.module,
      severity: def.severity,
    }
  })
}

function cacheToModuleHealth(cache: KpiCacheDoc): ModuleHealth[] {
  const h = (v: number, warnThreshold: number, critThreshold: number) =>
    v >= critThreshold ? 'critical' : v >= warnThreshold ? 'warning' : 'ok'

  return [
    { module: 'maquinario',    label: 'Maquinário',       status: h(cache.alertasMaquinario.value, 1, 5),    metric: `${cache.alertasMaquinario.value} alertas`       },
    { module: 'frota',         label: 'Frota',             status: h(cache.alertasFrota.value, 1, 3),         metric: `${cache.alertasFrota.value} alertas`            },
    { module: 'limpeza',       label: 'Limpeza 5S',        status: h(cache.falhasLimpeza.value, 1, 3),        metric: `${cache.falhasLimpeza.value} falhas`            },
    { module: 'seguranca',     label: 'Segurança',         status: h(cache.incidentesSeguranca.value, 1, 2),  metric: `${cache.incidentesSeguranca.value} incidentes`  },
    { module: 'colaboradores', label: 'Colaboradores',     status: h(cache.alertasColaboradores.value, 3, 8), metric: `${cache.alertasColaboradores.value} em atenção` },
    { module: 'obras',         label: 'Obras',             status: h(cache.empreiteirasCriticas.value, 1, 3), metric: `${cache.empreiteirasCriticas.value} críticas`   },
    { module: 'compras',       label: 'Compras',           status: h(cache.aprovacoesPendentes.value, 2, 5),  metric: `${cache.aprovacoesPendentes.value} pendentes`   },
    { module: 'aprovacoes',    label: 'Aprovações',        status: h(cache.aprovacoesPendentes.value, 1, 3),  metric: `${cache.aprovacoesPendentes.value} aguardando`  },
  ]
}

// ── Hook ──────────────────────────────────────────────

export interface DashboardOverviewData {
  kpis:        KpiMetric[]
  alerts:      AlertItem[]
  moduleHealth: ModuleHealth[]
  chartData:   OverviewChartPoint[]
  loading:     boolean
  error:       string | null
  lastUpdated: Date | null
  refresh:     () => Promise<void>
}

export function useDashboardOverview(
  period: Period,
  current: DateRange
): DashboardOverviewData {
  const [kpis,        setKpis]        = useState<KpiMetric[]>([])
  const [alerts,      setAlerts]      = useState<AlertItem[]>([])
  const [moduleHealth,setModuleHealth]= useState<ModuleHealth[]>([])
  const [chartData,   setChartData]   = useState<OverviewChartPoint[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const loadingRef = useRef(false)

  const loadData = useCallback(async (forceRefresh = false) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(null)

    try {
      let cache: KpiCacheDoc | null = forceRefresh ? null : await readKpiCache(period)

      if (!cache) {
        cache = await computeAndWriteKpiCache(period)
      }

      setKpis(cacheToMetrics(cache))
      setModuleHealth(cacheToModuleHealth(cache))
      setLastUpdated(new Date())

      const charts = await fetchOverviewChartData(current, period)
      setChartData(charts)
    } catch (e) {
      setError('Falha ao carregar dados do dashboard. Tente novamente.')
      console.error('[useDashboardOverview]', e)
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [period, current])

  // Load KPIs + chart data on mount and period change
  useEffect(() => {
    loadData()
  }, [loadData])

  // Live alert subscription
  useEffect(() => {
    const unsub = subscribeToAlerts(setAlerts)
    return unsub
  }, [])

  const refresh = useCallback(() => loadData(true), [loadData])

  return { kpis, alerts, moduleHealth, chartData, loading, error, lastUpdated, refresh }
}

// Re-export for consumers
export { trendColor, trendIcon }
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDashboardOverview.ts
git commit -m "feat(dashboard): add useDashboardOverview hook with KPI cache + live alerts"
```

---

## Task 6: KpiCard component

**Files:**
- Create: `src/pages/dashboard/overview/components/KpiCard.tsx`
- Create: `src/pages/dashboard/overview/components/KpiCard.module.css`

- [ ] **Step 1: Create the CSS module**

```css
/* src/pages/dashboard/overview/components/KpiCard.module.css */

.card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--r-lg);
  padding: 20px;
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  transition: box-shadow var(--t-base), transform var(--t-base), border-color var(--t-base);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  position: relative;
  overflow: hidden;
}

.card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: var(--accent-line, var(--brand-accent));
  border-radius: var(--r-lg) var(--r-lg) 0 0;
}

.card.critical::before { background: #dc2626; }
.card.warning::before  { background: #ea580c; }
.card.good::before     { background: #16a34a; }
.card.neutral::before  { background: #94a3b8; }

.card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.value {
  font-size: 2rem;
  font-weight: 800;
  color: var(--text);
  line-height: 1;
  letter-spacing: -1px;
}

.trend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  font-weight: 600;
}

.trendIcon { font-size: 0.65rem; }

.detail {
  font-size: 0.72rem;
  color: var(--text-3);
  margin-top: 2px;
}

/* Skeleton */
.skeleton .value,
.skeleton .label,
.skeleton .trend {
  background: linear-gradient(90deg, var(--border-light) 25%, var(--border) 50%, var(--border-light) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 4px;
  color: transparent;
}
.skeleton .value  { height: 2rem; width: 60%; }
.skeleton .label  { height: 0.72rem; width: 80%; }
.skeleton .trend  { height: 0.78rem; width: 50%; }

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

- [ ] **Step 2: Create the component**

```tsx
// src/pages/dashboard/overview/components/KpiCard.tsx

import { useNavigate }    from 'react-router-dom'
import type { KpiMetric } from '@/types/dashboard'
import { trendColor, trendIcon } from '@/types/dashboard'
import s from './KpiCard.module.css'

interface Props {
  metric?:  KpiMetric   // undefined = skeleton state
  loading?: boolean
}

export default function KpiCard({ metric, loading }: Props) {
  const navigate = useNavigate()

  if (loading || !metric) {
    return (
      <div className={`${s.card} ${s.skeleton}`}>
        <div className={s.header}>
          <span className={s.label}>Carregando…</span>
        </div>
        <div className={s.value}>—</div>
        <div className={s.trend}>—</div>
      </div>
    )
  }

  const color    = trendColor(metric.severity, metric.trend)
  const icon     = trendIcon(metric.trend)
  const absT     = Math.abs(metric.trend)
  const modRoute = `/dashboard/${metric.module}`

  return (
    <div
      className={`${s.card} ${s[metric.severity]}`}
      onClick={() => navigate(modRoute)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && navigate(modRoute)}
      aria-label={`${metric.label}: ${metric.value}${metric.unit ?? ''}`}
    >
      <div className={s.header}>
        <span className={s.label}>{metric.label}</span>
      </div>

      <div className={s.value}>
        {metric.unit === 'R$' ? `R$ ${metric.value.toLocaleString('pt-BR')}` : metric.value}
      </div>

      <div className={s.trend} style={{ color }}>
        <span className={s.trendIcon}>{icon}</span>
        {absT > 0 && <span>{absT}%</span>}
        {absT === 0 && <span>Estável</span>}
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 4 }}>vs período ant.</span>
      </div>

      {metric.detail && <div className={s.detail}>{metric.detail}</div>}
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard/overview/components/KpiCard.tsx src/pages/dashboard/overview/components/KpiCard.module.css
git commit -m "feat(dashboard): add KpiCard component with skeleton, trend indicator, severity color"
```

---

## Task 7: AlertFeed component

**Files:**
- Create: `src/pages/dashboard/overview/components/AlertFeed.tsx`
- Create: `src/pages/dashboard/overview/components/AlertFeed.module.css`

- [ ] **Step 1: Create the CSS module**

```css
/* src/pages/dashboard/overview/components/AlertFeed.module.css */

.feed {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-xs);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 300px;
  max-height: 520px;
  overflow: hidden;
}

.feedHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.feedTitle {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--text-2);
}

.feedBadge {
  background: #dc2626;
  color: #fff;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  min-width: 20px;
  text-align: center;
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.list::-webkit-scrollbar       { width: 3px; }
.list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

.item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 10px;
  border-radius: var(--r-md);
  cursor: pointer;
  transition: background var(--t-fast);
  text-decoration: none;
  color: inherit;
  border-bottom: 1px solid var(--border-light);
}
.item:last-child { border-bottom: none; }
.item:hover { background: rgba(234,88,12,0.04); }

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
}
.critical .dot { background: #dc2626; box-shadow: 0 0 0 3px rgba(220,38,38,0.15); }
.urgent .dot   { background: #ea580c; box-shadow: 0 0 0 3px rgba(234,88,12,0.15); }
.attention .dot{ background: #d97706; box-shadow: 0 0 0 3px rgba(217,119,6,0.15); }

.itemBody { flex: 1; min-width: 0; }
.itemTitle {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.itemMeta {
  font-size: 0.7rem;
  color: var(--text-3);
  margin-top: 2px;
  display: flex;
  gap: 8px;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-3);
  font-size: 0.82rem;
  padding: 32px;
}
.emptyIcon { font-size: 2rem; }
```

- [ ] **Step 2: Create the component**

```tsx
// src/pages/dashboard/overview/components/AlertFeed.tsx

import { useNavigate }     from 'react-router-dom'
import type { AlertItem }  from '@/types/dashboard'
import s from './AlertFeed.module.css'

const MODULE_LABEL: Record<string, string> = {
  maquinario:    'Maquinário',
  frota:         'Frota',
  limpeza:       'Limpeza',
  seguranca:     'Segurança',
  colaboradores: 'Colaboradores',
  obras:         'Obras',
  compras:       'Compras',
  aprovacoes:    'Aprovações',
}

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (diff < 1)   return 'agora'
  if (diff < 60)  return `${diff}min atrás`
  if (diff < 1440)return `${Math.floor(diff / 60)}h atrás`
  return `${Math.floor(diff / 1440)}d atrás`
}

interface Props { alerts: AlertItem[] }

export default function AlertFeed({ alerts }: Props) {
  const navigate = useNavigate()
  const criticalCount = alerts.filter(a => a.severity === 'critical').length

  return (
    <div className={s.feed}>
      <div className={s.feedHeader}>
        <span className={s.feedTitle}>Alertas Ativos</span>
        {alerts.length > 0 && (
          <span className={s.feedBadge}>{alerts.length}</span>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>✅</div>
          <span>Nenhum alerta ativo</span>
        </div>
      ) : (
        <div className={s.list}>
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`${s.item} ${s[alert.severity]}`}
              onClick={() => navigate(alert.linkTo)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && navigate(alert.linkTo)}
            >
              <div className={s.dot} />
              <div className={s.itemBody}>
                <div className={s.itemTitle}>{alert.title}</div>
                <div className={s.itemMeta}>
                  <span>{MODULE_LABEL[alert.module] ?? alert.module}</span>
                  <span>·</span>
                  <span>{timeAgo(alert.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard/overview/components/AlertFeed.tsx src/pages/dashboard/overview/components/AlertFeed.module.css
git commit -m "feat(dashboard): add AlertFeed component with live severity-sorted alerts"
```

---

## Task 8: ModuleHealthBar component

**Files:**
- Create: `src/pages/dashboard/overview/components/ModuleHealthBar.tsx`
- Create: `src/pages/dashboard/overview/components/ModuleHealthBar.module.css`

- [ ] **Step 1: Create the CSS module**

```css
/* src/pages/dashboard/overview/components/ModuleHealthBar.module.css */

.bar {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--r-lg);
  padding: 14px 16px;
  box-shadow: var(--shadow-xs);
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  transition: box-shadow var(--t-base), transform var(--t-base);
}
.card:hover { box-shadow: var(--shadow-sm); transform: translateY(-1px); }

.cardTop {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cardLabel {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-2);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot.ok       { background: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,0.15); }
.dot.warning  { background: #ea580c; box-shadow: 0 0 0 3px rgba(234,88,12,0.15); }
.dot.critical { background: #dc2626; box-shadow: 0 0 0 3px rgba(220,38,38,0.15); animation: pulse 2s ease-in-out infinite; }

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(220,38,38,0.15); }
  50%       { box-shadow: 0 0 0 6px rgba(220,38,38,0.08); }
}

.cardMetric {
  font-size: 0.72rem;
  color: var(--text-3);
}
```

- [ ] **Step 2: Create the component**

```tsx
// src/pages/dashboard/overview/components/ModuleHealthBar.tsx

import { useNavigate }        from 'react-router-dom'
import type { ModuleHealth }  from '@/types/dashboard'
import s from './ModuleHealthBar.module.css'

interface Props { modules: ModuleHealth[]; loading?: boolean }

const PLACEHOLDER_MODULES: ModuleHealth[] = [
  'maquinario', 'frota', 'limpeza', 'seguranca',
  'colaboradores', 'obras', 'compras', 'aprovacoes',
].map(module => ({
  module: module as ModuleHealth['module'],
  label:  module,
  status: 'ok' as const,
  metric: '—',
}))

export default function ModuleHealthBar({ modules, loading }: Props) {
  const navigate = useNavigate()
  const items = loading || modules.length === 0 ? PLACEHOLDER_MODULES : modules

  return (
    <div className={s.bar}>
      {items.map(mod => (
        <div
          key={mod.module}
          className={s.card}
          onClick={() => navigate(`/dashboard/${mod.module}`)}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && navigate(`/dashboard/${mod.module}`)}
          aria-label={`${mod.label}: ${mod.status}`}
        >
          <div className={s.cardTop}>
            <span className={s.cardLabel}>{mod.label}</span>
            <span className={`${s.dot} ${s[mod.status]}`} />
          </div>
          <span className={s.cardMetric}>{loading ? '—' : mod.metric}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard/overview/components/ModuleHealthBar.tsx src/pages/dashboard/overview/components/ModuleHealthBar.module.css
git commit -m "feat(dashboard): add ModuleHealthBar with pulsing critical dots"
```

---

## Task 9: OverviewCharts component

**Files:**
- Create: `src/pages/dashboard/overview/components/OverviewCharts.tsx`
- Create: `src/pages/dashboard/overview/components/OverviewCharts.module.css`

- [ ] **Step 1: Create the CSS module**

```css
/* src/pages/dashboard/overview/components/OverviewCharts.module.css */

.charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

@media (max-width: 900px) {
  .charts { grid-template-columns: 1fr; }
}

.chart {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--r-lg);
  padding: 20px;
  box-shadow: var(--shadow-xs);
}

.chartTitle {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--text-2);
  margin-bottom: 16px;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 240px;
  color: var(--text-3);
  font-size: 0.82rem;
}
```

- [ ] **Step 2: Create the component**

```tsx
// src/pages/dashboard/overview/components/OverviewCharts.tsx

import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import type { OverviewChartPoint } from '@/types/dashboard'
import s from './OverviewCharts.module.css'

interface Props {
  data:    OverviewChartPoint[]
  loading: boolean
}

const PLACEHOLDER: OverviewChartPoint[] = Array.from({ length: 7 }, (_, i) => ({
  date:      `0${i + 1}/04`,
  abertas:   0,
  concluidas:0,
  custo:     0,
}))

function fmtCurrency(v: number): string {
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`
  return `R$ ${v.toFixed(0)}`
}

export default function OverviewCharts({ data, loading }: Props) {
  const chartData = loading || data.length === 0 ? PLACEHOLDER : data

  return (
    <div className={s.charts}>
      {/* Chart 1 — OS abertas vs concluídas */}
      <div className={s.chart}>
        <div className={s.chartTitle}>OS Abertas vs Concluídas</div>
        {chartData.length === 0 ? (
          <div className={s.empty}>Sem dados no período</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ fontSize: '0.78rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                formatter={(v: number, name: string) => [v, name === 'abertas' ? 'Abertas' : 'Concluídas']}
              />
              <Area
                type="monotone"
                dataKey="abertas"
                stroke="#ea580c"
                fill="rgba(234,88,12,0.12)"
                strokeWidth={2}
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="concluidas"
                stroke="#16a34a"
                fill="rgba(22,163,74,0.08)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart 2 — Custo operacional */}
      <div className={s.chart}>
        <div className={s.chartTitle}>Custo Operacional (R$)</div>
        {chartData.length === 0 ? (
          <div className={s.empty}>Sem dados no período</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ fontSize: '0.78rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                formatter={(v: number) => [fmtCurrency(v), 'Custo']}
              />
              <Line
                type="monotone"
                dataKey="custo"
                stroke="#166534"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#166534' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard/overview/components/OverviewCharts.tsx src/pages/dashboard/overview/components/OverviewCharts.module.css
git commit -m "feat(dashboard): add OverviewCharts with Recharts AreaChart + LineChart"
```

---

## Task 10: OverviewPage

**Files:**
- Create: `src/pages/dashboard/overview/OverviewPage.tsx`
- Create: `src/pages/dashboard/overview/OverviewPage.module.css`

- [ ] **Step 1: Create the CSS module**

```css
/* src/pages/dashboard/overview/OverviewPage.module.css */

.page {
  padding: 24px 28px 48px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Critical banner */
.banner {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: var(--r-md);
  padding: 12px 16px;
  font-size: 0.83rem;
  font-weight: 500;
  color: #991b1b;
}
.bannerDot { color: #dc2626; font-size: 1rem; flex-shrink: 0; }
.bannerText { flex: 1; }
.bannerLink {
  font-size: 0.78rem;
  font-weight: 700;
  color: #dc2626;
  cursor: pointer;
  text-decoration: underline;
  flex-shrink: 0;
}

/* Main grid */
.mainGrid {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 1100px) {
  .mainGrid { grid-template-columns: 1fr; }
}

/* KPI grid inside main grid */
.kpiGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

@media (max-width: 1400px) {
  .kpiGrid { grid-template-columns: repeat(3, 1fr); }
}

@media (max-width: 900px) {
  .kpiGrid { grid-template-columns: repeat(2, 1fr); }
}

.kpiAndCharts {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Section title */
.sectionTitle {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-3);
  margin-bottom: 4px;
}

/* Error */
.error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: var(--r-md);
  padding: 16px 20px;
  color: #991b1b;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 10px;
}
```

- [ ] **Step 2: Create the page component**

```tsx
// src/pages/dashboard/overview/OverviewPage.tsx

import { useRef }          from 'react'
import { usePeriod }       from '@/context/PeriodContext'
import { useDashboardOverview } from '@/hooks/useDashboardOverview'
import KpiCard             from './components/KpiCard'
import AlertFeed           from './components/AlertFeed'
import ModuleHealthBar     from './components/ModuleHealthBar'
import OverviewCharts      from './components/OverviewCharts'
import s from './OverviewPage.module.css'

export default function OverviewPage() {
  const { period, current }   = usePeriod()
  const alertFeedRef = useRef<HTMLDivElement>(null)

  const {
    kpis, alerts, moduleHealth, chartData,
    loading, error,
  } = useDashboardOverview(period, current)

  const criticalAlerts = alerts.filter(a => a.severity === 'critical')

  function scrollToAlerts() {
    alertFeedRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  if (error) {
    return (
      <div className={s.page}>
        <div className={s.error}>
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      </div>
    )
  }

  // Build skeleton KPIs while loading
  const displayKpis = loading
    ? Array.from({ length: 12 }, (_, i) => undefined as typeof kpis[0] | undefined)
    : kpis

  return (
    <div className={s.page}>

      {/* Critical banner */}
      {criticalAlerts.length > 0 && (
        <div className={s.banner}>
          <span className={s.bannerDot}>🔴</span>
          <span className={s.bannerText}>
            {criticalAlerts.length} alerta{criticalAlerts.length > 1 ? 's' : ''} crítico{criticalAlerts.length > 1 ? 's' : ''} ativo{criticalAlerts.length > 1 ? 's' : ''} —&nbsp;
            {criticalAlerts.slice(0, 2).map(a => a.title).join(' · ')}
            {criticalAlerts.length > 2 ? ` · +${criticalAlerts.length - 2} mais` : ''}
          </span>
          <button className={s.bannerLink} onClick={scrollToAlerts}>
            Ver detalhes →
          </button>
        </div>
      )}

      {/* Main: alert feed + KPIs + charts */}
      <div className={s.mainGrid}>

        {/* Left: alert feed */}
        <div ref={alertFeedRef}>
          <div className={s.sectionTitle}>Alertas em Tempo Real</div>
          <AlertFeed alerts={alerts} />
        </div>

        {/* Right: KPIs + charts */}
        <div className={s.kpiAndCharts}>
          <div>
            <div className={s.sectionTitle}>KPIs Globais</div>
            <div className={s.kpiGrid}>
              {displayKpis.map((metric, i) => (
                <KpiCard
                  key={metric?.key ?? `skeleton-${i}`}
                  metric={metric}
                  loading={loading}
                />
              ))}
            </div>
          </div>

          <OverviewCharts data={chartData} loading={loading} />
        </div>
      </div>

      {/* Module health bar */}
      <div>
        <div className={s.sectionTitle}>Status dos Módulos</div>
        <ModuleHealthBar modules={moduleHealth} loading={loading} />
      </div>

    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard/overview/OverviewPage.tsx src/pages/dashboard/overview/OverviewPage.module.css
git commit -m "feat(dashboard): add OverviewPage — KPI grid, alert feed, charts, module health"
```

---

## Task 11: PlaceholderPage

**Files:**
- Create: `src/pages/dashboard/PlaceholderPage.tsx`
- Create: `src/pages/dashboard/PlaceholderPage.module.css`

- [ ] **Step 1: Create the CSS module**

```css
/* src/pages/dashboard/PlaceholderPage.module.css */

.page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 40px;
  gap: 16px;
  color: var(--text-3);
  text-align: center;
}

.icon  { font-size: 3rem; }
.title { font-size: 1.25rem; font-weight: 700; color: var(--text-2); }
.sub   { font-size: 0.88rem; max-width: 400px; line-height: 1.6; }

.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 14px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  background: rgba(234,88,12,0.08);
  color: var(--brand-accent);
  letter-spacing: 0.3px;
  margin-top: 8px;
}
```

- [ ] **Step 2: Create the component**

```tsx
// src/pages/dashboard/PlaceholderPage.tsx

import s from './PlaceholderPage.module.css'

interface Props { label: string }

export default function PlaceholderPage({ label }: Props) {
  return (
    <div className={s.page}>
      <div className={s.icon}>🚧</div>
      <div className={s.title}>{label}</div>
      <div className={s.sub}>
        Este módulo de analytics será implementado no próximo sub-projeto.
        Os dados e infraestrutura já estão prontos.
      </div>
      <span className={s.badge}>Em construção — Sub-projeto B/C</span>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/dashboard/PlaceholderPage.tsx src/pages/dashboard/PlaceholderPage.module.css
git commit -m "feat(dashboard): add PlaceholderPage for B/C/D modules"
```

---

## Task 12: DashboardLayout

**Files:**
- Create: `src/pages/dashboard/DashboardLayout.tsx`
- Create: `src/pages/dashboard/DashboardLayout.module.css`

- [ ] **Step 1: Create the CSS module**

```css
/* src/pages/dashboard/DashboardLayout.module.css */

.layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100%;
  background: var(--bg, #F5F7FA);
}

/* ── Header ── */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 28px;
  height: 60px;
  background: var(--brand-deep, #052e16);
  border-bottom: 1px solid rgba(234,88,12,0.2);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 50;
}

.headerLeft {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.headerTitle {
  font-size: 0.9rem;
  font-weight: 800;
  color: #F8FAFC;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

.headerSub {
  font-size: 0.68rem;
  color: rgba(148,163,184,0.6);
  white-space: nowrap;
}

.headerRight {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.periodSelect {
  padding: 6px 10px;
  border-radius: var(--r-md);
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  color: #F8FAFC;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  transition: background var(--t-fast);
}
.periodSelect:hover  { background: rgba(255,255,255,0.13); }
.periodSelect option { background: #052e16; color: #F8FAFC; }

.refreshBtn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--r-md);
  background: rgba(234,88,12,0.15);
  border: 1px solid rgba(234,88,12,0.3);
  color: #fb923c;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: background var(--t-fast);
}
.refreshBtn:hover    { background: rgba(234,88,12,0.25); }
.refreshBtn:disabled { opacity: 0.5; cursor: not-allowed; }

.lastUpdate {
  font-size: 0.68rem;
  color: rgba(148,163,184,0.5);
  white-space: nowrap;
}

/* ── Tabs ── */
.tabs {
  display: flex;
  align-items: stretch;
  gap: 2px;
  background: #fff;
  border-bottom: 1px solid var(--border-light);
  padding: 0 20px;
  overflow-x: auto;
  flex-shrink: 0;
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar { display: none; }

.tab {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 14px;
  height: 44px;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-3);
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  transition: color var(--t-fast), border-color var(--t-fast);
  flex-shrink: 0;
  position: relative;
}

.tab:hover      { color: var(--text); }
.tab.active     { color: var(--brand-accent, #ea580c); border-bottom-color: var(--brand-accent, #ea580c); font-weight: 700; }
.tabStar        { font-size: 0.6rem; color: var(--brand-accent); }

.badge {
  background: #dc2626;
  color: #fff;
  font-size: 0.62rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  min-width: 18px;
  text-align: center;
}

/* ── Content ── */
.content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
```

- [ ] **Step 2: Create the layout component**

```tsx
// src/pages/dashboard/DashboardLayout.tsx

import { useEffect, useState }            from 'react'
import { Outlet, NavLink, useLocation }   from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db }                             from '@/lib/firebase'
import { PeriodProvider, usePeriod }      from '@/context/PeriodContext'
import type { Period }                    from '@/types/dashboard'
import s from './DashboardLayout.module.css'

// ── Tab definitions ───────────────────────────────────
interface TabDef {
  path:  string
  label: string
  star?: boolean
  badge?: boolean
}

const TABS: TabDef[] = [
  { path: 'overview',      label: 'Visão Geral'         },
  { path: 'maquinario',    label: 'Maquinário', star: true },
  { path: 'frota',         label: 'Frota'               },
  { path: 'limpeza',       label: 'Limpeza 5S'          },
  { path: 'seguranca',     label: 'Segurança'           },
  { path: 'colaboradores', label: 'Colaboradores'       },
  { path: 'obras',         label: 'Obras'               },
  { path: 'compras',       label: 'Compras'             },
  { path: 'aprovacoes',    label: 'Aprovações', badge: true },
  { path: 'documentos',    label: 'Documentos'          },
  { path: 'acesso',        label: 'Acesso'              },
]

// ── Inner layout (has access to PeriodContext) ────────
function DashboardInner() {
  const { period, setPeriod } = usePeriod()
  const [pendingCount, setPendingCount] = useState(0)
  const location = useLocation()

  // Live pending approvals count for badge
  useEffect(() => {
    const q = query(collection(db, 'purchase_orders'), where('status', '==', 'pending'))
    return onSnapshot(q, snap => setPendingCount(snap.size))
  }, [])

  const currentPath = location.pathname.split('/').pop() ?? 'overview'

  return (
    <div className={s.layout}>

      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <div>
            <div className={s.headerTitle}>Dashboard Executivo</div>
            <div className={s.headerSub}>Pro Raça Rações · Gestão Industrial</div>
          </div>
        </div>

        <div className={s.headerRight}>
          <select
            className={s.periodSelect}
            value={period}
            onChange={e => setPeriod(e.target.value as Period)}
            aria-label="Período de análise"
          >
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="6m">Últimos 6 meses</option>
            <option value="1a">Último ano</option>
          </select>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className={s.tabs} role="tablist">
        {TABS.map(tab => (
          <NavLink
            key={tab.path}
            to={`/dashboard/${tab.path}`}
            className={({ isActive }) => `${s.tab} ${isActive ? s.active : ''}`}
            role="tab"
            aria-selected={currentPath === tab.path}
          >
            {tab.label}
            {tab.star && <span className={s.tabStar}>★</span>}
            {tab.badge && pendingCount > 0 && (
              <span className={s.badge}>{pendingCount}</span>
            )}
          </NavLink>
        ))}
      </div>

      {/* ── Content ── */}
      <div className={s.content}>
        <Outlet />
      </div>

    </div>
  )
}

// ── Wrapper that provides PeriodContext ───────────────
export default function DashboardLayout() {
  return (
    <PeriodProvider>
      <DashboardInner />
    </PeriodProvider>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard/DashboardLayout.tsx src/pages/dashboard/DashboardLayout.module.css
git commit -m "feat(dashboard): add DashboardLayout — sticky header, tabs, period selector, approval badge"
```

---

## Task 13: Update App.tsx routes

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add lazy imports for dashboard pages**

Read `src/App.tsx`. At the `// ── Admin & Ranking` section (around line 57), add new lazy imports:

```tsx
// ── Dashboard (Sub-projeto A) ──────────────────────
const DashboardLayout    = lazy(() => import('@/pages/dashboard/DashboardLayout'))
const OverviewPage       = lazy(() => import('@/pages/dashboard/overview/OverviewPage'))
const PlaceholderPage    = lazy(() => import('@/pages/dashboard/PlaceholderPage'))
```

Note: `DashboardLayout` is a layout route, but lazy-loading layout routes works fine in React Router v6 with Suspense.

- [ ] **Step 2: Replace the /dashboard route**

Find and replace this block in `src/App.tsx`:

```tsx
{/* ── Admin-only routes ── */}
<Route element={<ProtectedRoute requiredRole="admin" />}>
  <Route path="admin"     element={<Lazy page={<AdminPage />} />} />
  <Route path="dashboard" element={<LegacyPage src="/dashboard/dashboard.html" label="Painel de Gestão" />} />
</Route>
```

Replace with:

```tsx
{/* ── Admin-only routes ── */}
<Route element={<ProtectedRoute requiredRole="admin" />}>
  <Route path="admin" element={<Lazy page={<AdminPage />} />} />
  <Route
    path="dashboard"
    element={
      <Suspense fallback={<PageLoader />}>
        <DashboardLayout />
      </Suspense>
    }
  >
    <Route index element={<Navigate to="overview" replace />} />
    <Route path="overview"       element={<Lazy page={<OverviewPage />} />} />
    <Route path="maquinario"     element={<Lazy page={<PlaceholderPage label="Maquinário Analytics" />} />} />
    <Route path="frota"          element={<Lazy page={<PlaceholderPage label="Frota Analytics" />} />} />
    <Route path="limpeza"        element={<Lazy page={<PlaceholderPage label="Limpeza 5S Analytics" />} />} />
    <Route path="seguranca"      element={<Lazy page={<PlaceholderPage label="Segurança Analytics" />} />} />
    <Route path="colaboradores"  element={<Lazy page={<PlaceholderPage label="Colaboradores Analytics" />} />} />
    <Route path="obras"          element={<Lazy page={<PlaceholderPage label="Obras & Empreiteiras Analytics" />} />} />
    <Route path="compras"        element={<Lazy page={<PlaceholderPage label="Compras & Fornecedores Analytics" />} />} />
    <Route path="aprovacoes"     element={<Lazy page={<PlaceholderPage label="Centro de Aprovações" />} />} />
    <Route path="documentos"     element={<Lazy page={<PlaceholderPage label="Centro de Documentos" />} />} />
    <Route path="acesso"         element={<Lazy page={<PlaceholderPage label="Controle de Acesso" />} />} />
  </Route>
</Route>
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 4: Verify in browser at localhost:5173/dashboard**

Navigate to `localhost:5173/dashboard`. Expected:
- Redirects to `/dashboard/overview`
- Shows dark header with "Dashboard Executivo" title
- Shows tab bar with 11 tabs
- Shows OverviewPage loading skeletons then KPI cards
- Period selector changes data
- Clicking a tab shows PlaceholderPage for non-overview modules

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(dashboard): wire dashboard sub-routes in App.tsx, replace LegacyPage iframe"
```

---

## Task 14: Update Firestore rules

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Read current firestore.rules to find the right place to add the new rule**

Open `firestore.rules`. Find the section where collection-level rules are defined (after the helper functions). Add the new rule for `dashboard_kpi_cache`.

- [ ] **Step 2: Add the rule**

After the existing collection rules (before the closing `}` of `match /databases/{database}/documents {`), add:

```js
// ── Dashboard KPI Cache ──────────────────────────────────────────────────
// Only admin can read/write the pre-computed KPI cache.
match /dashboard_kpi_cache/{docId} {
  allow read:  if isAuthenticated() && isAdmin();
  allow write: if isAuthenticated() && isAdmin();
}
```

- [ ] **Step 3: Run TypeScript check (no TS changes, verify nothing else broke)**

```bash
npx tsc --noEmit 2>&1 | head -5
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat(dashboard): add Firestore rules for dashboard_kpi_cache collection"
```

---

## Self-Review

**1. Spec coverage:**

| Spec requirement | Task |
|-----------------|------|
| New React page replacing iframe | Task 13 |
| Sub-routes `/dashboard/*` | Task 13 |
| `DashboardLayout` with tabs | Task 12 |
| Period selector with localStorage | Task 3, 12 |
| Hybrid data: onSnapshot + cache | Task 4, 5 |
| `dashboard_kpi_cache` collection | Task 4 |
| TTL 15min cache refresh | Task 4, 5 |
| 12 KPI cards with trends | Task 6, 10 |
| Alert feed (live, severity-sorted) | Task 7, 10 |
| Critical banner | Task 10 |
| Module health bar | Task 8, 10 |
| AreaChart OS abertas/concluídas | Task 9 |
| LineChart custo operacional | Task 9 |
| Recharts installed | Task 1 |
| Placeholder pages for B/C/D | Task 11 |
| Firestore rules for cache | Task 14 |
| Admin-only via ProtectedRoute | Already in App.tsx from ROM update |

All spec requirements covered.

**2. Placeholder scan:** No TBD, TODO, or "implement later" in any task. All code blocks are complete.

**3. Type consistency:**
- `Period` type defined in `dashboard.ts` (Task 2), used in `PeriodContext` (Task 3), `db-dashboard.ts` (Task 4), `useDashboardOverview` (Task 5), `DashboardLayout` (Task 12) — consistent throughout.
- `KpiMetric.key` is `string` (not `keyof KpiCacheDoc`) to avoid complexity — `cacheToMetrics` handles the mapping.
- `OverviewChartPoint.abertas/concluidas/custo` fields match between `db-dashboard.ts` (Task 4) and `OverviewCharts` (Task 9) — both use `{ date, abertas, concluidas, custo }`.
- `AlertItem` shape defined in Task 2, populated in Task 4, consumed in Task 7 — consistent.
- `useDashboardOverview` returns `refresh: () => Promise<void>` — defined in Task 5, destructured in Task 10 (not used but available).

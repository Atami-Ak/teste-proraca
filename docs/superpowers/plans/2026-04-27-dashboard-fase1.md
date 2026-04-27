# Dashboard Principal — Fase 1: KPIs + Alertas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o legacy `dashboard/dashboard.html` por uma `DashboardPage` React na rota `/dashboard`, exibindo 8 KPI cards e um painel de alertas live.

**Architecture:** `DashboardPage` envolve-se com `PeriodProvider` internamente e contém `KpiCard`, `AlertPanel` e `PeriodBar` como funções locais. Dados de KPI vêm de `readKpiCache`/`computeAndWriteKpiCache` do `db-dashboard.ts`; alertas vêm de `subscribeToAlerts` (onSnapshot). A rota `/dashboard` em `App.tsx` é atualizada de `LegacyPage` para o novo componente.

**Tech Stack:** React 18, TypeScript, CSS Modules, Firebase Firestore, React Router v6, Vite (type check: `tsc --noEmit`)

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/pages/dashboard/DashboardPage.tsx` | Criar | Página + KpiCard + AlertPanel + PeriodBar |
| `src/pages/dashboard/DashboardPage.module.css` | Criar | Todos os estilos do dashboard |
| `src/App.tsx` | Modificar (linha 159) | Trocar LegacyPage por DashboardPage na rota `/dashboard` |

---

## Task 1: CSS Module — estilos completos

**Files:**
- Create: `src/pages/dashboard/DashboardPage.module.css`

- [ ] **Step 1.1: Criar o arquivo CSS**

```css
/* src/pages/dashboard/DashboardPage.module.css */

.page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  animation: fadeUp 0.25s ease;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Top band ── */
.topBand {
  background: linear-gradient(135deg, var(--brand-deep, #052e16) 0%, var(--brand-main, #166534) 100%);
  padding: 24px 36px;
  border-bottom: 1px solid rgba(234,88,12,0.2);
  position: relative;
  overflow: hidden;
}

.topBand::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: 32px 32px;
  pointer-events: none;
}

.topBand::after {
  content: '';
  position: absolute;
  right: -40px;
  top: -40px;
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(234,88,12,0.2) 0%, transparent 70%);
  pointer-events: none;
}

.topBandInner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.pageTitle {
  font-size: 1.5rem;
  font-weight: 800;
  color: #F8FAFC;
  letter-spacing: -0.5px;
  line-height: 1.2;
}

.pageSub {
  font-size: 0.82rem;
  color: rgba(148,163,184,0.75);
  font-weight: 500;
  margin-top: 3px;
}

/* ── Period bar ── */
.periodBar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.periodBtn {
  padding: 7px 14px;
  border-radius: var(--r-md, 10px);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.07);
  color: rgba(248,250,252,0.75);
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.periodBtn:hover {
  background: rgba(255,255,255,0.14);
  color: #f8fafc;
}

.periodBtnActive {
  background: var(--brand-accent, #ea580c);
  color: #fff;
  border-color: var(--brand-accent, #ea580c);
  box-shadow: 0 2px 8px rgba(234,88,12,0.4);
}

.refreshBtn {
  padding: 7px 12px;
  border-radius: var(--r-md, 10px);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.07);
  color: rgba(248,250,252,0.75);
  transition: background 0.15s, color 0.15s;
  margin-left: 4px;
}

.refreshBtn:hover:not(:disabled) {
  background: rgba(255,255,255,0.14);
  color: #f8fafc;
}

.refreshBtn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* ── Body ── */
.body {
  flex: 1;
  padding: 28px 36px 48px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

/* ── KPI Grid ── */
.kpiGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

/* ── KPI Card ── */
.kpiCard {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-light, #EBF0F7);
  border-radius: var(--r-lg, 14px);
  padding: 18px 18px 16px;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  text-decoration: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: var(--shadow-xs);
  transition: box-shadow 0.18s, transform 0.12s, border-color 0.18s;
}

.kpiCard:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.kpiAccentBar {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  border-radius: 0 var(--r-sm, 6px) var(--r-sm, 6px) 0;
}

.kpiTop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.kpiIconWrap {
  width: 36px;
  height: 36px;
  border-radius: var(--r-md, 10px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.kpiTrend {
  font-size: 0.78rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 2px;
}

.kpiValue {
  font-size: 2rem;
  font-weight: 800;
  color: var(--text, #1B2430);
  letter-spacing: -1.5px;
  line-height: 1;
}

.kpiLabel {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-3, #8898AA);
}

.kpiDetail {
  font-size: 0.72rem;
  color: var(--text-3, #8898AA);
  margin-top: 2px;
}

/* ── KPI Skeleton ── */
.kpiSkeleton {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-light, #EBF0F7);
  border-radius: var(--r-lg, 14px);
  padding: 18px 18px 16px;
  box-shadow: var(--shadow-xs);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skeletonLine {
  border-radius: 6px;
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── Alert Panel ── */
.alertPanel {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-light, #EBF0F7);
  border-radius: var(--r-lg, 14px);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.alertHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-light, #EBF0F7);
}

.alertTitle {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text, #1B2430);
  display: flex;
  align-items: center;
  gap: 8px;
}

.alertBadge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 800;
  background: #dc2626;
  color: #fff;
}

.alertEmpty {
  padding: 36px 20px;
  text-align: center;
  color: var(--text-3, #8898AA);
  font-size: 0.85rem;
}

.alertEmptyIcon {
  font-size: 2rem;
  margin-bottom: 8px;
  color: #16a34a;
}

.alertList { display: flex; flex-direction: column; }

.alertItem {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-light, #EBF0F7);
  text-decoration: none;
  color: inherit;
  transition: background 0.12s;
}

.alertItem:last-child { border-bottom: none; }
.alertItem:hover { background: var(--bg, #F5F7FA); }

.alertDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
}

.alertBody { flex: 1; min-width: 0; }

.alertItemTitle {
  font-size: 0.83rem;
  font-weight: 600;
  color: var(--text, #1B2430);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.alertMeta {
  font-size: 0.72rem;
  color: var(--text-3, #8898AA);
  margin-top: 2px;
}

.alertSeverityTag {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  flex-shrink: 0;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

/* ── Error state ── */
.errorBox {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: var(--r-lg, 14px);
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.errorMsg {
  font-size: 0.85rem;
  color: #991b1b;
  font-weight: 500;
}

.retryBtn {
  padding: 8px 16px;
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: var(--r-md, 10px);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.retryBtn:hover { background: #b91c1c; }

/* ═══════════════ Responsive ═══════════════ */

@media (max-width: 1200px) {
  .kpiGrid { grid-template-columns: repeat(4, 1fr); }
}

@media (max-width: 1000px) {
  .kpiGrid { grid-template-columns: repeat(2, 1fr); }
  .body { padding: 20px 24px 40px; }
  .topBand { padding: 22px 24px; }
}

@media (max-width: 680px) {
  .kpiGrid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .body { padding: 16px 16px 32px; gap: 20px; }
  .topBand { padding: 20px 16px; }
  .pageTitle { font-size: 1.25rem; }
}

@media (max-width: 420px) {
  .kpiGrid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 1.2: Verificar tipo (nenhum erro esperado — é CSS puro)**

```bash
# Confirma que o arquivo foi criado
ls src/pages/dashboard/
```
Esperado: `DashboardPage.module.css` listado.

---

## Task 2: DashboardPage.tsx — componente completo

**Files:**
- Create: `src/pages/dashboard/DashboardPage.tsx`

- [ ] **Step 2.1: Criar o arquivo**

```tsx
// src/pages/dashboard/DashboardPage.tsx

import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { PeriodProvider, usePeriod } from '@/context/PeriodContext'
import {
  readKpiCache,
  computeAndWriteKpiCache,
  subscribeToAlerts,
} from '@/lib/db-dashboard'
import {
  trendColor,
  trendIcon,
  type KpiCacheDoc,
  type AlertItem,
  type KpiSeverity,
} from '@/types/dashboard'
import s from './DashboardPage.module.css'

// ── KPI definitions ───────────────────────────────────────

interface KpiDef {
  key:      keyof KpiCacheDoc
  label:    string
  icon:     string
  accent:   string
  severity: KpiSeverity
  linkTo:   string
}

const KPI_DEFS: KpiDef[] = [
  { key: 'ordensAbertas',        label: 'OS Abertas',            icon: '📑', accent: '#166534', severity: 'critical', linkTo: '/os' },
  { key: 'aprovacoesPendentes',  label: 'Aprovações Pendentes',  icon: '✅', accent: '#dc2626', severity: 'critical', linkTo: '/compras' },
  { key: 'manutencaoAtrasada',   label: 'Manutenção Atrasada',   icon: '🔧', accent: '#ea580c', severity: 'critical', linkTo: '/ativos/manutencao' },
  { key: 'comprasUrgentes',      label: 'Compras Urgentes',      icon: '🛒', accent: '#f59e0b', severity: 'warning',  linkTo: '/compras' },
  { key: 'falhasLimpeza',        label: 'Falhas Limpeza',        icon: '🧹', accent: '#dc2626', severity: 'critical', linkTo: '/limpeza' },
  { key: 'incidentesSeguranca',  label: 'Incidentes Segurança',  icon: '⚠️', accent: '#dc2626', severity: 'critical', linkTo: '/seguranca/ocorrencias' },
  { key: 'alertasColaboradores', label: 'Alertas Colaboradores', icon: '👥', accent: '#7c3aed', severity: 'critical', linkTo: '/colaboradores' },
  { key: 'empreiteirasCriticas', label: 'Empreiteiras Críticas', icon: '🏗️', accent: '#ea580c', severity: 'critical', linkTo: '/empreiteiras' },
]

// ── Alert severity config ─────────────────────────────────

const ALERT_CONFIG: Record<AlertItem['severity'], { color: string; bg: string; label: string }> = {
  critical:  { color: '#dc2626', bg: '#fef2f2', label: 'Crítico'  },
  urgent:    { color: '#ea580c', bg: '#fff7ed', label: 'Urgente'  },
  attention: { color: '#f59e0b', bg: '#fffbeb', label: 'Atenção'  },
}

// ── PeriodBar ─────────────────────────────────────────────

interface PeriodBarProps {
  loading:   boolean
  onRefresh: () => void
}

function PeriodBar({ loading, onRefresh }: PeriodBarProps) {
  const { period, setPeriod } = usePeriod()
  const options = [
    { value: '30d', label: '30 dias' },
    { value: '90d', label: '90 dias' },
    { value: '6m',  label: '6 meses' },
    { value: '1a',  label: '1 ano'   },
  ] as const

  return (
    <div className={s.periodBar}>
      {options.map(opt => (
        <button
          key={opt.value}
          className={`${s.periodBtn} ${period === opt.value ? s.periodBtnActive : ''}`}
          onClick={() => setPeriod(opt.value)}
          disabled={loading}
        >
          {opt.label}
        </button>
      ))}
      <button
        className={s.refreshBtn}
        onClick={onRefresh}
        disabled={loading}
        title="Atualizar KPIs agora"
      >
        {loading ? '…' : '↺'}
      </button>
    </div>
  )
}

// ── KpiCard ───────────────────────────────────────────────

interface KpiCardProps {
  def:   KpiDef
  cache: KpiCacheDoc | null
}

function KpiCard({ def, cache }: KpiCardProps) {
  const kv    = cache ? (cache[def.key] as { value: number; prev: number }) : null
  const value = kv?.value ?? 0
  const prev  = kv?.prev  ?? 0
  const trend = prev === 0 ? 0 : Math.round(((value - prev) / Math.max(1, prev)) * 100)
  const color = trendColor(def.severity, trend)

  if (!cache) {
    return (
      <div className={s.kpiSkeleton}>
        <div className={s.skeletonLine} style={{ height: 18, width: '50%' }} />
        <div className={s.skeletonLine} style={{ height: 40, width: '65%' }} />
        <div className={s.skeletonLine} style={{ height: 12, width: '80%' }} />
      </div>
    )
  }

  return (
    <Link to={def.linkTo} className={s.kpiCard}>
      <div className={s.kpiAccentBar} style={{ background: def.accent }} />
      <div className={s.kpiTop}>
        <div
          className={s.kpiIconWrap}
          style={{ background: `${def.accent}18`, color: def.accent } as CSSProperties}
        >
          {def.icon}
        </div>
        {trend !== 0 && (
          <span className={s.kpiTrend} style={{ color }}>
            {trendIcon(trend)} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className={s.kpiValue}>{value}</div>
      <div className={s.kpiLabel}>{def.label}</div>
    </Link>
  )
}

// ── AlertPanel ────────────────────────────────────────────

function AlertPanel({ alerts }: { alerts: AlertItem[] }) {
  return (
    <div className={s.alertPanel}>
      <div className={s.alertHeader}>
        <span className={s.alertTitle}>
          Alertas Ativos
          {alerts.length > 0 && (
            <span className={s.alertBadge}>{alerts.length}</span>
          )}
        </span>
      </div>

      {alerts.length === 0 ? (
        <div className={s.alertEmpty}>
          <div className={s.alertEmptyIcon}>✓</div>
          <p>Nenhum alerta ativo no momento.</p>
        </div>
      ) : (
        <div className={s.alertList}>
          {alerts.map(a => {
            const cfg = ALERT_CONFIG[a.severity]
            const ago = Math.round((Date.now() - a.createdAt.getTime()) / 60_000)
            const agoLabel = ago < 60
              ? `${ago}min atrás`
              : `${Math.round(ago / 60)}h atrás`
            return (
              <Link key={a.id} to={a.linkTo} className={s.alertItem}>
                <div className={s.alertDot} style={{ background: cfg.color }} />
                <div className={s.alertBody}>
                  <div className={s.alertItemTitle}>{a.title}</div>
                  <div className={s.alertMeta}>{agoLabel}</div>
                </div>
                <span
                  className={s.alertSeverityTag}
                  style={{ background: cfg.bg, color: cfg.color } as CSSProperties}
                >
                  {cfg.label}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── DashboardContent (inside PeriodProvider) ──────────────

function DashboardContent() {
  const { period } = usePeriod()

  const [cache,   setCache]   = useState<KpiCacheDoc | null>(null)
  const [alerts,  setAlerts]  = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const loadKpis = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const cached = force ? null : await readKpiCache(period)
      const data   = cached ?? await computeAndWriteKpiCache(period)
      setCache(data)
    } catch (e) {
      setError('Erro ao carregar KPIs. Tente novamente.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [period])

  // Reload KPIs when period changes
  useEffect(() => {
    setCache(null)
    void loadKpis(false)
  }, [loadKpis])

  // Subscribe to live alerts
  useEffect(() => {
    const unsub = subscribeToAlerts(setAlerts)
    return unsub
  }, [])

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div className={s.page}>

      {/* ── Top band ── */}
      <div className={s.topBand}>
        <div className={s.topBandInner}>
          <div>
            <h1 className={s.pageTitle}>Painel de Gestão</h1>
            <p className={s.pageSub}>{today}</p>
          </div>
          <PeriodBar loading={loading} onRefresh={() => void loadKpis(true)} />
        </div>
      </div>

      <div className={s.body}>

        {/* ── Error ── */}
        {error && (
          <div className={s.errorBox}>
            <span className={s.errorMsg}>{error}</span>
            <button className={s.retryBtn} onClick={() => void loadKpis(false)}>
              Tentar novamente
            </button>
          </div>
        )}

        {/* ── KPI Grid ── */}
        <div className={s.kpiGrid}>
          {KPI_DEFS.map(def => (
            <KpiCard key={def.key} def={def} cache={loading ? null : cache} />
          ))}
        </div>

        {/* ── Alerts ── */}
        <AlertPanel alerts={alerts} />

      </div>
    </div>
  )
}

// ── DashboardPage (exported) ──────────────────────────────

export default function DashboardPage() {
  return (
    <PeriodProvider>
      <DashboardContent />
    </PeriodProvider>
  )
}
```

- [ ] **Step 2.2: Verificar tipos TypeScript**

```bash
npx tsc --noEmit
```
Esperado: sem erros.

---

## Task 3: Atualizar App.tsx — trocar rota `/dashboard`

**Files:**
- Modify: `src/App.tsx` (linha ~11 para import, linha ~159 para rota)

- [ ] **Step 3.1: Adicionar import**

No topo de `src/App.tsx`, logo após a linha `const AdminPage = lazy(...)`, adicionar:

```tsx
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
```

- [ ] **Step 3.2: Substituir a rota legacy**

Localizar (linha ~159):
```tsx
<Route path="dashboard" element={<LegacyPage src="/dashboard/dashboard.html" label="Painel de Gestão" />} />
```

Substituir por:
```tsx
<Route path="dashboard" element={<Lazy page={<DashboardPage />} />} />
```

- [ ] **Step 3.3: Verificar tipos**

```bash
npx tsc --noEmit
```
Esperado: sem erros.

---

## Task 4: Verificação visual e commit final

- [ ] **Step 4.1: Iniciar o servidor de dev**

```bash
npm run dev
```

- [ ] **Step 4.2: Verificar na rota `/dashboard`**

Acessar `http://localhost:5173/dashboard` (login necessário — usar conta admin).

Checar:
- Top band verde com título "Painel de Gestão" e data do dia
- Botões de período 30d/90d/6m/1a visíveis e o botão ↺
- 8 cards no grid mostrando skeletons ou valores
- Painel de alertas abaixo dos cards
- Sem erros no console do browser

- [ ] **Step 4.3: Testar troca de período**

Clicar em "90d" — deve recomputar KPIs (loading skeleton visível brevemente).
Recarregar página — deve manter "90d" selecionado (localStorage).

- [ ] **Step 4.4: Commit**

```bash
git add src/pages/dashboard/DashboardPage.tsx src/pages/dashboard/DashboardPage.module.css src/App.tsx
git commit -m "feat(dashboard): add DashboardPage — KPI grid + live alert panel, replaces legacy HTML"
```

---

## Self-Review

**Cobertura do spec:**
- ✅ Substitui legacy `/dashboard` → Task 3
- ✅ PeriodProvider interno → Task 2 (`DashboardPage` envolve `PeriodProvider`)
- ✅ 8 KPI cards com trend e link → `KpiCard` + `KPI_DEFS`
- ✅ Skeleton loading → `KpiCard` retorna `kpiSkeleton` quando `cache=null`
- ✅ Botão ↺ força recompute → `loadKpis(true)` via `PeriodBar`
- ✅ alertas live (onSnapshot) → `subscribeToAlerts` em `useEffect` com cleanup
- ✅ Estado vazio de alertas → `AlertPanel` mostra "Nenhum alerta ativo"
- ✅ Estado de erro com retry → `errorBox` + `retryBtn`
- ✅ Responsivo → Task 1 CSS com breakpoints 1000px/680px/420px

**Placeholders:** nenhum TBD/TODO encontrado.

**Type consistency:**
- `KpiCacheDoc` keys acessados via `def.key as keyof KpiCacheDoc` → ✅
- `trendColor(def.severity, trend)` — `severity` é `KpiSeverity` ✅
- `subscribeToAlerts(setAlerts)` — `setAlerts` é `Dispatch<SetStateAction<AlertItem[]>>` compatível com `(alerts: AlertItem[]) => void` ✅

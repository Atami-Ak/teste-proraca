# ROM Update — Pro Raça Rações Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the navigation system (routes, sidebar, role access, missing pages, desktop layout) so all modules are connected, properly guarded by role, and the system feels like one unified enterprise platform.

**Architecture:** Three phases — Phase 1 fixes the routing skeleton and sidebar; Phase 2 adds the two missing pages (EmployeeRankingPage, AdminPage); Phase 3 fixes desktop layout. Each phase is independently testable. DocumentViewer is already a modal in both OS and Compras pages — no new routes needed for it (spec correction).

**Tech Stack:** React 18, React Router v6, TypeScript, CSS Modules, Zustand, Firebase/Firestore, Vite

---

## File Map

### Phase 1 — Routes + Sidebar

| File | Action |
|------|--------|
| `src/App.tsx` | Modify — remove legacy routes, add /colaboradores/ranking + /admin, add requiredRole="admin" to /dashboard |
| `src/components/layout/GlobalSidebar.tsx` | Full rewrite — SVG icons, role-based groups, Dashboard admin-only, Admin gear at bottom, Infra removed |
| `src/components/layout/AppLayout.tsx` | Modify — swap GlobalSidebar ↔ MaintenanceSidebar based on /ativos path |
| `src/components/layout/MaintenanceSidebar.tsx` | Modify — add Voltar link at top, Fornecedores + Inventário standalone links |

### Phase 2 — Missing Pages

| File | Action |
|------|--------|
| `src/pages/employees/EmployeeRankingPage.tsx` | Create |
| `src/pages/employees/EmployeeRankingPage.module.css` | Create |
| `src/pages/admin/AdminPage.tsx` | Create |
| `src/pages/admin/AdminPage.module.css` | Create |

### Phase 3 — Desktop Layout

| File | Action |
|------|--------|
| `src/styles/globals.css` | Modify — add max-width + margin to .page-container, add .content-grid utility |
| `src/pages/assets/AssetsPage.module.css` | Audit + fix restrictive max-width |
| `src/pages/fleet/FleetPage.module.css` | Audit + fix restrictive max-width |
| `src/pages/employees/EmployeeDashboardPage.module.css` | Audit + fix restrictive max-width |
| `src/pages/safety/SafetyDashboardPage.module.css` | Audit + fix restrictive max-width |
| `src/pages/obras/ObrasPage.module.css` | Audit + fix restrictive max-width |
| `src/pages/cleaning/CleaningDashboard.module.css` | Audit + fix restrictive max-width |
| `src/pages/home/HomePage.module.css` | Audit + fix restrictive max-width |

---

## PHASE 1 — Routes + Sidebar

---

### Task 1: Clean App.tsx — remove legacy, add guarded routes

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add lazy imports for new pages**

At the top of `src/App.tsx`, after the existing lazy imports, add:

```tsx
const EmployeeRankingPage = lazy(() => import('@/pages/employees/EmployeeRankingPage'))
const AdminPage            = lazy(() => import('@/pages/admin/AdminPage'))
```

- [ ] **Step 2: Shrink LEGACY_ROUTES to dashboard only**

Replace the current `LEGACY_ROUTES` array with:

```tsx
const LEGACY_ROUTES: Array<{ path: string; src: string; label: string }> = [
  { path: '/dashboard', src: '/dashboard/dashboard.html', label: 'Painel de Gestão' },
]
```

- [ ] **Step 3: Remove LEGACY_REDIRECTS entirely**

Delete the entire `LEGACY_REDIRECTS` array and the JSX block that maps it:

```tsx
// DELETE this entire block:
const LEGACY_REDIRECTS: Array<{ from: string; to: string }> = [
  { from: '/infra', to: '/legacy/infra' },
]
```

And inside `<Routes>`, delete:

```tsx
// DELETE this block:
{LEGACY_REDIRECTS.map(({ from, to }) => (
  <Route key={from} path={from.slice(1)} element={<Navigate to={to} replace />} />
))}
```

- [ ] **Step 4: Add /colaboradores/ranking route**

After the existing `/colaboradores/:id/avaliacao` route, add:

```tsx
<Route path="colaboradores/ranking" element={<Lazy page={<EmployeeRankingPage />} />} />
```

- [ ] **Step 5: Add /admin route with requiredRole guard**

After the obras/empreiteiras block, before the legacy routes block, add:

```tsx
{/* ── Admin (admin-only) ── */}
<Route element={<ProtectedRoute requiredRole="admin" />}>
  <Route path="admin" element={<Lazy page={<AdminPage />} />} />
</Route>
```

- [ ] **Step 6: Add requiredRole="admin" to dashboard**

The dashboard is in `LEGACY_ROUTES` which maps to `<LegacyPage>`. Wrap it with a ProtectedRoute. Replace the `LEGACY_ROUTES.map(...)` block with:

```tsx
{/* ── Dashboard (admin-only legacy iframe) ── */}
<Route element={<ProtectedRoute requiredRole="admin" />}>
  <Route path="dashboard" element={<LegacyPage src="/dashboard/dashboard.html" label="Painel de Gestão" />} />
</Route>
```

And remove the old `LEGACY_ROUTES.map(...)` block entirely since it's now replaced.

- [ ] **Step 7: Verify the full routes section**

The protected routes block inside `<Route element={<AppLayout />}>` should now look like this (verify against actual file):

```tsx
<Route index element={<Lazy page={<HomePage />} />} />

{/* Assets */}
<Route path="ativos" element={<Lazy page={<AssetsPage />} />} />
<Route path="ativos/novo" element={<Lazy page={<AssetFormPage />} />} />
<Route path="ativos/manutencao" element={<Lazy page={<MaintenancePage />} />} />
<Route path="ativos/fornecedores" element={<Lazy page={<SuppliersPage />} />} />
<Route path="ativos/inventario" element={<Lazy page={<InventoryPage />} />} />
<Route path="ativos/categorias" element={<Lazy page={<CategoriesPage />} />} />

{/* Operations */}
<Route path="os"      element={<Lazy page={<ServiceOrdersPage />} />} />
<Route path="compras" element={<Lazy page={<PurchaseOrdersPage />} />} />

{/* Fleet */}
<Route path="frota"                          element={<Lazy page={<FleetPage />} />} />
<Route path="frota/inspecao"                 element={<Lazy page={<InspectionPage />} />} />
<Route path="frota/inspecao/:vehicleId"      element={<Lazy page={<InspectionPage />} />} />
<Route path="frota/historico/:vehicleId"     element={<Lazy page={<VehicleHistoryPage />} />} />

{/* Cleaning */}
<Route path="limpeza"                        element={<Lazy page={<CleaningDashboard />} />} />
<Route path="limpeza/inspecao/:zoneId"       element={<Lazy page={<CleaningInspForm />} />} />
<Route path="limpeza/historico"              element={<Lazy page={<CleaningHistory />} />} />
<Route path="limpeza/ranking"                element={<Lazy page={<CleaningRanking />} />} />

{/* Safety */}
<Route path="seguranca"                      element={<Lazy page={<SafetyDashboardPage />} />} />
<Route path="seguranca/dds"                  element={<Lazy page={<DDSPage />} />} />
<Route path="seguranca/dds/novo"             element={<Lazy page={<DDSFormPage />} />} />
<Route path="seguranca/dds/:id"              element={<Lazy page={<DDSFormPage />} />} />
<Route path="seguranca/dds/:id/editar"       element={<Lazy page={<DDSFormPage />} />} />
<Route path="seguranca/ddi"                  element={<Lazy page={<DDIPage />} />} />
<Route path="seguranca/ddi/novo"             element={<Lazy page={<DDIFormPage />} />} />
<Route path="seguranca/ddi/:id"              element={<Lazy page={<DDIFormPage />} />} />
<Route path="seguranca/ddi/:id/editar"       element={<Lazy page={<DDIFormPage />} />} />
<Route path="seguranca/epi"                  element={<Lazy page={<EPIPage />} />} />
<Route path="seguranca/epi/novo"             element={<Lazy page={<EPIFichaPage />} />} />
<Route path="seguranca/epi/:id"              element={<Lazy page={<EPIFichaPage />} />} />
<Route path="seguranca/ocorrencias"          element={<Lazy page={<OcorrenciasPage />} />} />
<Route path="seguranca/ocorrencias/novo"     element={<Lazy page={<OcorrenciasPage />} />} />
<Route path="seguranca/permissoes"           element={<Lazy page={<PermissoesPage />} />} />

{/* Employees */}
<Route path="colaboradores"                  element={<Lazy page={<EmployeeDashboardPage />} />} />
<Route path="colaboradores/lista"            element={<Lazy page={<EmployeeListPage />} />} />
<Route path="colaboradores/novo"             element={<Lazy page={<EmployeeFormPage />} />} />
<Route path="colaboradores/ranking"          element={<Lazy page={<EmployeeRankingPage />} />} />
<Route path="colaboradores/:id"              element={<Lazy page={<EmployeeProfilePage />} />} />
<Route path="colaboradores/:id/editar"       element={<Lazy page={<EmployeeFormPage />} />} />
<Route path="colaboradores/:id/avaliacao"    element={<Lazy page={<EmployeeEvaluationFormPage />} />} />

{/* Obras */}
<Route path="obras"                          element={<Lazy page={<ObrasPage />} />} />
<Route path="obras/nova"                     element={<Lazy page={<ObraFormPage />} />} />
<Route path="obras/:obraId"                  element={<Lazy page={<ObraDetailPage />} />} />
<Route path="obras/:obraId/editar"           element={<Lazy page={<ObraFormPage />} />} />
<Route path="obras/:obraId/inspecao"         element={<Lazy page={<InspecaoObraPage />} />} />
<Route path="obras/:obraId/inspecao/:inspecaoId" element={<Lazy page={<InspecaoObraPage />} />} />
<Route path="empreiteiras"                   element={<Lazy page={<EmpreiteirasPage />} />} />
<Route path="empreiteiras/:empreiteiraId"    element={<Lazy page={<EmpreiteiraDetailPage />} />} />

{/* Admin (admin-only) */}
<Route element={<ProtectedRoute requiredRole="admin" />}>
  <Route path="admin" element={<Lazy page={<AdminPage />} />} />
</Route>

{/* Dashboard (admin-only legacy iframe) */}
<Route element={<ProtectedRoute requiredRole="admin" />}>
  <Route path="dashboard" element={<LegacyPage src="/dashboard/dashboard.html" label="Painel de Gestão" />} />
</Route>

{/* 404 → Home */}
<Route path="*" element={<Navigate to="/" replace />} />
```

- [ ] **Step 8: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors (EmployeeRankingPage and AdminPage don't exist yet — if TS errors for missing modules, add `// @ts-ignore` on those two lazy imports temporarily until Phase 2 creates the files).

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx
git commit -m "feat(rom): clean routes — remove legacy, add /admin + /colaboradores/ranking, guard /dashboard"
```

---

### Task 2: Rebuild GlobalSidebar — role-based nav with SVG icons

**Files:**
- Modify: `src/components/layout/GlobalSidebar.tsx`

- [ ] **Step 1: Replace the entire file with the new implementation**

```tsx
import { NavLink, useNavigate } from 'react-router-dom'
import { useStore }             from '@/store/useStore'
import { logout }               from '@/lib/auth'
import { toast }                from '@/components/ui/Toast'
import type { UserRole }        from '@/types'
import s                        from './GlobalSidebar.module.css'

// ── Role helpers ──────────────────────────────────────
const ROLE_LEVEL: Record<UserRole, number> = {
  visualizador: 1, operador: 2, supervisor: 3, admin: 4,
}

function hasRole(role: UserRole | undefined, min: UserRole): boolean {
  if (!role) return false
  return ROLE_LEVEL[role] >= ROLE_LEVEL[min]
}

// ── SVG icon set (Heroicons-style, MIT) ───────────────
const Ic = {
  Home: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9,22 9,12 15,12 15,22"/>
    </svg>
  ),
  Chart: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  Clipboard: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    </svg>
  ),
  Cart: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
  ),
  Tag: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  ),
  Wrench: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  Package: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27,6.96 12,12.01 20.73,6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  ),
  Building: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  ),
  Truck: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13"/>
      <polygon points="16,8 20,8 23,11 23,16 16,16 16,8"/>
      <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  ),
  Sparkles: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
    </svg>
  ),
  Users: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  Shield: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  Hammer: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 12l-8.5 8.5a2.12 2.12 0 0 1-3-3L12 9"/>
      <path d="M17.64 15L22 10.64"/>
      <path d="M20.91 11.7l-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91"/>
    </svg>
  ),
  HardHat: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/>
      <path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3"/>
    </svg>
  ),
  Cog: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  Power: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
      <line x1="12" y1="2" x2="12" y2="12"/>
    </svg>
  ),
}

// ── Nav types ─────────────────────────────────────────
interface NavItem  { to: string; icon: React.ReactNode; label: string; end?: boolean }
interface NavGroup { label?: string; minRole?: UserRole; items: NavItem[] }

function getNavGroups(role: UserRole | undefined): NavGroup[] {
  const groups: NavGroup[] = [
    {
      items: [
        { to: '/', icon: <Ic.Home />, label: 'Home', end: true },
        ...(hasRole(role, 'admin')
          ? [{ to: '/dashboard', icon: <Ic.Chart />, label: 'Dashboard' }]
          : []
        ),
      ],
    },
    {
      label: 'Operações',
      minRole: 'operador',
      items: [
        { to: '/os',      icon: <Ic.Clipboard />, label: 'Ordens de Serviço' },
        { to: '/compras', icon: <Ic.Cart />,      label: 'Compras'           },
      ],
    },
    {
      label: 'Patrimônio',
      minRole: 'operador',
      items: [
        { to: '/ativos',              icon: <Ic.Tag />,      label: 'Ativos',       end: true },
        { to: '/ativos/manutencao',   icon: <Ic.Wrench />,   label: 'Manutenções'             },
        { to: '/ativos/inventario',   icon: <Ic.Package />,  label: 'Inventário'              },
        { to: '/ativos/fornecedores', icon: <Ic.Building />, label: 'Fornecedores'            },
      ],
    },
    {
      label: 'Facilities',
      items: [
        { to: '/frota',   icon: <Ic.Truck />,     label: 'Frota'       },
        { to: '/limpeza', icon: <Ic.Sparkles />,  label: 'Limpeza 5S'  },
      ],
    },
    {
      label: 'Pessoas',
      minRole: 'supervisor',
      items: [
        { to: '/colaboradores', icon: <Ic.Users />,  label: 'Colaboradores', end: true },
        { to: '/seguranca',     icon: <Ic.Shield />, label: 'Segurança',     end: true },
      ],
    },
    {
      label: 'Obras',
      minRole: 'supervisor',
      items: [
        { to: '/obras',        icon: <Ic.Hammer />,  label: 'Obras & Contratos', end: true },
        { to: '/empreiteiras', icon: <Ic.HardHat />, label: 'Empreiteiras'                 },
      ],
    },
  ]

  return groups.filter(g => !g.minRole || hasRole(role, g.minRole))
}

// ── Component ─────────────────────────────────────────
interface Props { mobileOpen: boolean; onMobileClose: () => void }

export default function GlobalSidebar({ mobileOpen, onMobileClose }: Props) {
  const user     = useStore(st => st.user)
  const navigate = useNavigate()

  const firstName = user?.nome?.split(' ')[0] ?? '—'
  const initial   = firstName[0]?.toUpperCase() ?? '?'
  const groups    = getNavGroups(user?.role)

  async function handleLogout() {
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch {
      toast.error('Erro ao sair. Tente novamente.')
    }
  }

  return (
    <aside
      className={`${s.sidebar} ${mobileOpen ? s.mobileOpen : ''}`}
      aria-label="Menu principal"
    >
      {/* ── Logo ── */}
      <div className={s.header}>
        <NavLink to="/" className={s.logo} onClick={onMobileClose}>
          <div className={s.logoMark}>PR</div>
          <div className={s.logoText}>
            <span className={s.logoName}>PRO RAÇA</span>
            <span className={s.logoSub}>Rações · Gestão Industrial</span>
          </div>
        </NavLink>
        <button className={s.mobileCloseBtn} onClick={onMobileClose} aria-label="Fechar menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      {/* ── Main nav ── */}
      <nav className={s.nav}>
        {groups.map((group, gi) => (
          <div key={gi} className={s.navGroup}>
            {group.label && (
              <div className={s.groupLabel} aria-hidden="true">{group.label}</div>
            )}
            {gi > 0 && !group.label && <div className={s.groupDivider} />}

            {group.items.map(({ to, icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `${s.item} ${isActive ? s.active : ''}`}
                data-tip={label}
                onClick={onMobileClose}
              >
                <span className={s.icon}>{icon}</span>
                <span className={s.label}>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* ── Bottom nav ── */}
      <div className={s.bottomNav}>
        <div className={s.groupDivider} />
        {hasRole(user?.role, 'admin') && (
          <NavLink
            to="/admin"
            className={({ isActive }) => `${s.item} ${s.itemSm} ${isActive ? s.active : ''}`}
            data-tip="Administração"
            onClick={onMobileClose}
          >
            <span className={s.icon}><Ic.Cog /></span>
            <span className={s.label}>Administração</span>
          </NavLink>
        )}
      </div>

      {/* ── User footer ── */}
      <div className={s.footer}>
        <div className={s.userRow}>
          <div className={s.avatar}>{initial}</div>
          <div className={s.userMeta}>
            <span className={s.userName}>{user?.nome ?? 'Carregando…'}</span>
            <span className={s.userRole}>{user?.role ?? '—'}</span>
          </div>
          <button
            className={s.logoutBtn}
            onClick={handleLogout}
            aria-label="Sair do sistema"
            title="Sair"
          >
            <Ic.Power />
          </button>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Open the app in browser and verify sidebar**

```bash
npx vite --open
```

Check: Home visible to all, Dashboard hidden for non-admin, groups collapse correctly on mobile, SVG icons render, Infra is gone, Admin gear shows only for admin user.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/GlobalSidebar.tsx
git commit -m "feat(rom): rebuild GlobalSidebar — SVG icons, role-based groups, admin gear, remove infra"
```

---

### Task 3: Update AppLayout — dual-sidebar based on /ativos path

**Files:**
- Modify: `src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Add useLocation import and dual-sidebar logic**

Replace the entire `src/components/layout/AppLayout.tsx` with:

```tsx
import { useState }         from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useStore }         from '@/store/useStore'
import GlobalSidebar        from './GlobalSidebar'
import MaintenanceSidebar   from './MaintenanceSidebar'
import s                    from './AppLayout.module.css'

export default function AppLayout() {
  const authReady   = useStore(st => st.authReady)
  const location    = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isAtivosModule = location.pathname.startsWith('/ativos')

  if (!authReady) {
    return (
      <div className={s.loadingScreen}>
        <div className={s.loadingSpinner} />
        <span className={s.loadingText}>Carregando SIGA…</span>
      </div>
    )
  }

  return (
    <div className={s.shell}>
      {isAtivosModule ? (
        <MaintenanceSidebar />
      ) : (
        <GlobalSidebar
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
      )}

      {/* Backdrop — closes mobile drawer */}
      {mobileOpen && !isAtivosModule && (
        <div className={s.backdrop} onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <main className={s.content}>
        {/* Mobile top bar */}
        {!isAtivosModule && (
          <div className={s.mobileBar}>
            <button
              className={s.hamburger}
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
              </svg>
            </button>
            <span className={s.mobileBrand}>PRO RAÇA</span>
          </div>
        )}

        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Manual test in browser**

Navigate to `/ativos` — verify MaintenanceSidebar appears. Navigate to `/frota` — verify GlobalSidebar appears. Navigate back to `/ativos/manutencao` — verify MaintenanceSidebar stays.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/AppLayout.tsx
git commit -m "feat(rom): AppLayout dual-sidebar — MaintenanceSidebar on /ativos, GlobalSidebar elsewhere"
```

---

### Task 4: Update MaintenanceSidebar — add Voltar link and utility nav

**Files:**
- Modify: `src/components/layout/MaintenanceSidebar.tsx`

- [ ] **Step 1: Add Voltar link and utility nav items**

Replace the current component with:

```tsx
import { useState, useMemo }               from 'react'
import { NavLink, Link, useSearchParams }  from 'react-router-dom'
import { useStore }                        from '@/store/useStore'
import { useCategories }                   from '@/hooks/useData'
import type { Category }                   from '@/types'
import s                                   from './MaintenanceSidebar.module.css'

function loadExpanded(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem('msb-exp') || '{}') }
  catch { return {} }
}

function saveExpanded(state: Record<string, boolean>) {
  localStorage.setItem('msb-exp', JSON.stringify(state))
}

export default function MaintenanceSidebar() {
  useCategories()
  const rawCategories = useStore(st => st.categories)

  const categories = useMemo(
    () => Array.from(new Map(rawCategories.map(c => [c.id, c])).values()),
    [rawCategories]
  )

  const [expanded, setExpanded] = useState<Record<string, boolean>>(loadExpanded)

  function toggleCat(id: string) {
    const next = { ...expanded, [id]: !expanded[id] }
    setExpanded(next)
    saveExpanded(next)
  }

  return (
    <aside className={s.sidebar} aria-label="Navegação de ativos">

      {/* ── Back to main menu ── */}
      <div className={s.header}>
        <Link to="/" className={s.backLink}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12,19 5,12 12,5"/>
          </svg>
          <span>Menu principal</span>
        </Link>
        <span className={s.moduleTitle}>Patrimônio &amp; Ativos</span>
      </div>

      {/* ── Category accordion ── */}
      <nav className={s.nav}>
        <div className={s.sectionLabel}>Categorias</div>
        {categories.length === 0 ? (
          <p className={s.loading}>Carregando categorias…</p>
        ) : (
          categories.map(cat => (
            <CategoryItem
              key={cat.id}
              category={cat}
              isOpen={!!expanded[cat.id]}
              onToggle={() => toggleCat(cat.id)}
            />
          ))
        )}

        {/* ── Utility links ── */}
        <div className={s.divider} />
        <NavLink
          to="/ativos/fornecedores"
          className={({ isActive }) => `${s.utilLink} ${isActive ? s.utilActive : ''}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
          </svg>
          Fornecedores
        </NavLink>
        <NavLink
          to="/ativos/inventario"
          className={({ isActive }) => `${s.utilLink} ${isActive ? s.utilActive : ''}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27,6.96 12,12.01 20.73,6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
          Inventário
        </NavLink>
      </nav>

      {/* ── Add asset button ── */}
      <div className={s.footer}>
        <NavLink to="/ativos/novo" className={s.addBtn}>
          + Novo Ativo
        </NavLink>
      </div>
    </aside>
  )
}

interface CategoryItemProps { category: Category; isOpen: boolean; onToggle: () => void }

function CategoryItem({ category, isOpen, onToggle }: CategoryItemProps) {
  const [params] = useSearchParams()
  const activeCat = params.get('cat')
  const isActive  = activeCat === category.id

  return (
    <div className={`${s.cat} ${isActive ? s.catActive : ''}`}>
      <button
        className={`${s.catBtn} ${isOpen ? s.open : ''}`}
        onClick={onToggle}
        title={category.name}
      >
        <span className={s.dot} style={{ background: category.color }} />
        <span className={s.catIcon}>{category.icon}</span>
        <span className={s.catName}>{category.name}</span>
        <span className={s.count}>{category.assetCount}</span>
        <span className={s.chevron}>▾</span>
      </button>

      {isOpen && (
        <div className={s.sub}>
          <SubItem to={`/ativos?cat=${category.id}`}                  label="Itens"       />
          <SubItem to={`/ativos/fornecedores?cat=${category.id}`}     label="Fornecedores"/>
          <SubItem to={`/ativos/manutencao?cat=${category.id}`}       label="Manutenções" />
        </div>
      )}
    </div>
  )
}

function SubItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `${s.subItem} ${isActive ? s.subActive : ''}`}
    >
      {label}
    </NavLink>
  )
}
```

- [ ] **Step 2: Add CSS for new elements to MaintenanceSidebar.module.css**

Open `src/components/layout/MaintenanceSidebar.module.css` and append at the end:

```css
/* ── Back link ── */
.backLink {
  display: flex;
  align-items: center;
  gap: 7px;
  color: rgba(148,163,184,0.7);
  text-decoration: none;
  font-size: 0.75rem;
  font-weight: 500;
  padding: 4px 0;
  transition: color var(--t-fast);
  white-space: nowrap;
  overflow: hidden;
}
.backLink:hover { color: #F8FAFC; }
.backLink svg   { flex-shrink: 0; }

.moduleTitle {
  display: block;
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(234,88,12,0.75);
  margin-top: 8px;
  white-space: nowrap;
  overflow: hidden;
}

.sectionLabel {
  font-size: 0.55rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.1px;
  color: rgba(234,88,12,0.75);
  padding: 10px 16px 5px;
}

.divider {
  border: none;
  border-top: 1px solid rgba(255,255,255,0.07);
  margin: 8px 12px;
}

.utilLink {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px 8px 14px;
  margin: 1px 8px;
  border-radius: 10px;
  color: rgba(148,163,184,0.8);
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 500;
  transition: background var(--t-fast), color var(--t-fast);
  white-space: nowrap;
  overflow: hidden;
}
.utilLink:hover   { background: rgba(255,255,255,0.06); color: #F8FAFC; }
.utilActive       { background: rgba(234,88,12,0.15); color: #fb923c; }
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Manual test**

Navigate to `/ativos` in browser. Verify: "← Menu principal" link at top, categories accordion works, Fornecedores + Inventário links appear below categories, "+ Novo Ativo" button at bottom.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/MaintenanceSidebar.tsx src/components/layout/MaintenanceSidebar.module.css
git commit -m "feat(rom): MaintenanceSidebar — add Voltar link, utility nav (Fornecedores/Inventário)"
```

---

## PHASE 2 — Missing Pages

---

### Task 5: Create EmployeeRankingPage

**Files:**
- Create: `src/pages/employees/EmployeeRankingPage.tsx`
- Create: `src/pages/employees/EmployeeRankingPage.module.css`

- [ ] **Step 1: Create the CSS module**

Create `src/pages/employees/EmployeeRankingPage.module.css`:

```css
.page { padding: 28px 32px 48px; width: 100%; }

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}

.titleBlock {}
.pageTitle  { font-size: 1.5rem; font-weight: 800; color: var(--text); margin-bottom: 4px; }
.pageSub    { font-size: 0.85rem; color: var(--text-3); }

.filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filterSelect {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--bg-card);
  color: var(--text);
  font-size: 0.85rem;
  cursor: pointer;
  outline: none;
  transition: border-color var(--t-fast);
}
.filterSelect:focus { border-color: var(--brand-accent); }

/* ── KPI bar ── */
.kpiBar {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
  margin-bottom: 28px;
}

.kpiCard {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--r-lg);
  padding: 16px 20px;
  box-shadow: var(--shadow-xs);
}
.kpiValue { font-size: 1.75rem; font-weight: 800; color: var(--text); line-height: 1; }
.kpiLabel { font-size: 0.75rem; color: var(--text-3); margin-top: 4px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }

/* ── Ranking table ── */
.tableWrap {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-xs);
  overflow: hidden;
}

.table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }

.table thead th {
  padding: 12px 16px;
  text-align: left;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--text-3);
  background: var(--bg);
  border-bottom: 1px solid var(--border-light);
  white-space: nowrap;
}

.table tbody tr {
  border-bottom: 1px solid var(--border-light);
  transition: background var(--t-fast);
}
.table tbody tr:last-child { border-bottom: none; }
.table tbody tr:hover { background: rgba(234,88,12,0.03); }

.table td { padding: 14px 16px; color: var(--text); vertical-align: middle; }

/* Rank badge */
.rankCell { text-align: center; font-weight: 800; font-size: 1rem; width: 52px; }
.rankMedal { font-size: 1.25rem; }

/* Score */
.scoreCell  { min-width: 140px; }
.scoreWrap  { display: flex; align-items: center; gap: 10px; }
.scoreBar   { flex: 1; height: 6px; background: var(--border-light); border-radius: 999px; overflow: hidden; }
.scoreBarFill { height: 100%; border-radius: 999px; transition: width 0.4s ease; }
.scoreNum   { font-size: 0.85rem; font-weight: 700; min-width: 36px; text-align: right; }

/* Status badge */
.statusBadge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
  border: 1px solid transparent;
}

/* Name cell */
.nameCell   { font-weight: 600; }
.nameRole   { font-size: 0.78rem; color: var(--text-3); margin-top: 2px; }

/* Meta cells */
.metaNum    { font-weight: 600; color: var(--text-2); text-align: center; }

/* Empty */
.empty { text-align: center; padding: 60px 24px; color: var(--text-3); }
.emptyIcon { font-size: 2.5rem; margin-bottom: 12px; }

/* Responsive */
@media (max-width: 768px) {
  .page { padding: 16px 16px 40px; }
  .table thead th:nth-child(4),
  .table td:nth-child(4),
  .table thead th:nth-child(5),
  .table td:nth-child(5)  { display: none; }
}
```

- [ ] **Step 2: Create the page component**

Create `src/pages/employees/EmployeeRankingPage.tsx`:

```tsx
import { useEffect, useState, useMemo } from 'react'
import { getEmployees }                 from '@/lib/db-employees'
import type { Employee }                from '@/types/employee'
import { STATUS_PERFORMANCE_META }      from '@/types/employee'
import s                                from './EmployeeRankingPage.module.css'

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

const SCORE_COLOR: Record<string, string> = {
  excelente: '#166534',
  muito_bom: '#16a34a',
  bom:       '#2563eb',
  atencao:   '#d97706',
  critico:   '#dc2626',
}

export default function EmployeeRankingPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading,   setLoading]   = useState(true)
  const [deptFilter, setDept]     = useState('')
  const [statusFilter, setStatus] = useState('')

  useEffect(() => {
    getEmployees(true)
      .then(list => {
        setEmployees(list.sort((a, b) => b.scorePerformance - a.scorePerformance))
      })
      .finally(() => setLoading(false))
  }, [])

  const departments = useMemo(() => {
    const set = new Set(employees.map(e => e.departamento).filter(Boolean))
    return Array.from(set).sort()
  }, [employees])

  const ranked = useMemo(() => {
    return employees.filter(e => {
      if (deptFilter && e.departamento !== deptFilter) return false
      if (statusFilter && e.statusPerformance !== statusFilter) return false
      return true
    })
  }, [employees, deptFilter, statusFilter])

  const avgScore   = ranked.length > 0 ? Math.round(ranked.reduce((s, e) => s + e.scorePerformance, 0) / ranked.length) : 0
  const excelentes = ranked.filter(e => e.statusPerformance === 'excelente' || e.statusPerformance === 'muito_bom').length
  const criticos   = ranked.filter(e => e.statusPerformance === 'critico').length

  if (loading) {
    return <div className={s.page}><p style={{ color: 'var(--text-3)' }}>Carregando ranking…</p></div>
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.titleBlock}>
          <h1 className={s.pageTitle}>Ranking de Colaboradores</h1>
          <p className={s.pageSub}>{ranked.length} colaborador{ranked.length !== 1 ? 'es' : ''} · Score médio: {avgScore}/100</p>
        </div>

        <div className={s.filters}>
          <select className={s.filterSelect} value={deptFilter} onChange={e => setDept(e.target.value)}>
            <option value="">Todos os departamentos</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className={s.filterSelect} value={statusFilter} onChange={e => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="excelente">Excelente</option>
            <option value="muito_bom">Muito Bom</option>
            <option value="bom">Bom</option>
            <option value="atencao">Atenção</option>
            <option value="critico">Crítico</option>
          </select>
        </div>
      </div>

      {/* KPI bar */}
      <div className={s.kpiBar}>
        <div className={s.kpiCard}>
          <div className={s.kpiValue}>{ranked.length}</div>
          <div className={s.kpiLabel}>Colaboradores</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiValue}>{avgScore}</div>
          <div className={s.kpiLabel}>Score Médio</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiValue} style={{ color: '#166534' }}>{excelentes}</div>
          <div className={s.kpiLabel}>Excelente / Muito Bom</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiValue} style={{ color: '#dc2626' }}>{criticos}</div>
          <div className={s.kpiLabel}>Críticos</div>
        </div>
      </div>

      {/* Table */}
      {ranked.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>👥</div>
          <p>Nenhum colaborador encontrado para os filtros selecionados.</p>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Colaborador</th>
                <th>Setor</th>
                <th>Avaliações</th>
                <th>Status</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((emp, idx) => {
                const pos    = idx + 1
                const meta   = STATUS_PERFORMANCE_META[emp.statusPerformance]
                const color  = SCORE_COLOR[emp.statusPerformance] ?? '#64748b'

                return (
                  <tr key={emp.id}>
                    <td className={s.rankCell}>
                      {pos <= 3
                        ? <span className={s.rankMedal}>{MEDAL[pos]}</span>
                        : <span style={{ color: 'var(--text-3)', fontSize: '0.9rem' }}>{pos}º</span>
                      }
                    </td>
                    <td>
                      <div className={s.nameCell}>{emp.nome}</div>
                      <div className={s.nameRole}>{emp.cargo}</div>
                    </td>
                    <td style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>{emp.setor}</td>
                    <td className={s.metaNum}>{emp.totalEvaluacoes}</td>
                    <td>
                      <span
                        className={s.statusBadge}
                        style={{ background: meta.bg, color: meta.color, borderColor: meta.color + '44' }}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className={s.scoreCell}>
                      <div className={s.scoreWrap}>
                        <div className={s.scoreBar}>
                          <div
                            className={s.scoreBarFill}
                            style={{ width: `${emp.scorePerformance}%`, background: color }}
                          />
                        </div>
                        <span className={s.scoreNum} style={{ color }}>{emp.scorePerformance}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Manual test**

Navigate to `/colaboradores/ranking` in browser. Verify: table renders with ranked employees, score bar fills proportionally, medals show for top 3, department filter filters the list, KPI cards update when filtering.

- [ ] **Step 5: Commit**

```bash
git add src/pages/employees/EmployeeRankingPage.tsx src/pages/employees/EmployeeRankingPage.module.css
git commit -m "feat(rom): create EmployeeRankingPage — ranked table, KPIs, filters, medals for top 3"
```

---

### Task 6: Create AdminPage

**Files:**
- Create: `src/pages/admin/AdminPage.tsx`
- Create: `src/pages/admin/AdminPage.module.css`

- [ ] **Step 1: Create the CSS module**

Create `src/pages/admin/AdminPage.module.css`:

```css
.page    { padding: 28px 32px 48px; width: 100%; }

.header  { margin-bottom: 32px; }
.title   { font-size: 1.5rem; font-weight: 800; color: var(--text); margin-bottom: 6px; }
.sub     { font-size: 0.9rem; color: var(--text-3); }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--r-lg);
  padding: 24px;
  box-shadow: var(--shadow-xs);
  text-decoration: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: box-shadow var(--t-base), transform var(--t-base), border-color var(--t-base);
  cursor: pointer;
}
.card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
  border-color: rgba(234,88,12,0.25);
}

.cardPlaceholder {
  opacity: 0.55;
  cursor: default;
}
.cardPlaceholder:hover { transform: none; box-shadow: var(--shadow-xs); border-color: var(--border-light); }

.cardIcon {
  width: 44px;
  height: 44px;
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  background: rgba(234,88,12,0.08);
  flex-shrink: 0;
}

.cardTitle { font-size: 1rem; font-weight: 700; color: var(--text); }
.cardDesc  { font-size: 0.83rem; color: var(--text-3); line-height: 1.5; }

.comingSoon {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  background: rgba(234,88,12,0.08);
  color: var(--brand-accent);
  letter-spacing: 0.3px;
  align-self: flex-start;
  margin-top: auto;
}
```

- [ ] **Step 2: Create the page component**

Create `src/pages/admin/AdminPage.tsx`:

```tsx
import { Link } from 'react-router-dom'
import s        from './AdminPage.module.css'

interface AdminCard {
  icon:    string
  title:   string
  desc:    string
  to?:     string
  soon?:   boolean
}

const CARDS: AdminCard[] = [
  {
    icon:  '🏷️',
    title: 'Categorias de Ativos',
    desc:  'Gerencie as categorias do módulo de Patrimônio: ícones, cores, campos customizados e configurações de manutenção.',
    to:    '/ativos/categorias',
  },
  {
    icon:  '👥',
    title: 'Gestão de Usuários',
    desc:  'Cadastro, roles e permissões de acesso dos usuários do sistema.',
    soon:  true,
  },
  {
    icon:  '🔐',
    title: 'Permissões de Acesso',
    desc:  'Configure níveis de acesso por módulo e por perfil de usuário.',
    soon:  true,
  },
  {
    icon:  '📋',
    title: 'Logs de Auditoria',
    desc:  'Histórico de ações críticas realizadas no sistema por todos os usuários.',
    soon:  true,
  },
  {
    icon:  '⚙️',
    title: 'Configurações do Sistema',
    desc:  'Parâmetros globais, integrações e configurações gerais da plataforma.',
    soon:  true,
  },
  {
    icon:  '📊',
    title: 'Dashboard Executivo',
    desc:  'Acesse o painel de KPIs e analytics da gestão industrial.',
    to:    '/dashboard',
  },
]

export default function AdminPage() {
  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Administração</h1>
        <p className={s.sub}>Configurações do sistema e controles administrativos — visível apenas para administradores.</p>
      </div>

      <div className={s.grid}>
        {CARDS.map(card => {
          const inner = (
            <>
              <div className={s.cardIcon}>{card.icon}</div>
              <div className={s.cardTitle}>{card.title}</div>
              <div className={s.cardDesc}>{card.desc}</div>
              {card.soon && <span className={s.comingSoon}>Em breve — integração com Dashboard</span>}
            </>
          )

          if (card.to) {
            return (
              <Link key={card.title} to={card.to} className={s.card}>
                {inner}
              </Link>
            )
          }

          return (
            <div key={card.title} className={`${s.card} ${s.cardPlaceholder}`}>
              {inner}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Manual test**

Navigate to `/admin` as admin user. Verify: card grid renders, "Categorias de Ativos" card links to `/ativos/categorias`, "Dashboard Executivo" links to `/dashboard`, placeholder cards show "Em breve" badge, non-admin users are redirected to `/` by ProtectedRoute.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminPage.tsx src/pages/admin/AdminPage.module.css
git commit -m "feat(rom): create AdminPage — card grid with Categorias, Dashboard links, placeholders for future features"
```

---

## PHASE 3 — Desktop Layout

---

### Task 7: Update globals.css — desktop-first layout tokens

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Update .page-container with max-width and centering**

Find this block in `src/styles/globals.css`:

```css
.page-container {
  padding: 28px 32px 48px;
  width: 100%;
}
```

Replace with:

```css
.page-container {
  padding: 28px 32px 48px;
  width: 100%;
  max-width: 1600px;
  margin-inline: auto;
}
```

- [ ] **Step 2: Add .content-grid utility class**

After the `.page-container` block, add:

```css
/* ═══════════════ Utility: responsive card grid ═══════════════ */
.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.content-grid-sm {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat(layout): page-container max-width 1600px, add content-grid utility"
```

---

### Task 8: Audit CSS Modules — remove restrictive max-width

**Files:**
- Modify (if needed): 7 CSS module files

- [ ] **Step 1: Check each file for restrictive max-width**

Run this command to find max-width declarations below 1200px across page CSS modules:

```bash
grep -rn "max-width" src/pages/ --include="*.css"
```

For each result where the value is below `1200px` (e.g. `max-width: 960px`, `max-width: 1100px`) on an outer container or `.page` wrapper, change it to `width: 100%` or remove it entirely. The `.page-container` in globals.css now handles the global bound at 1600px.

- [ ] **Step 2: Fix AssetsPage.module.css**

Open `src/pages/assets/AssetsPage.module.css`. Find any `.page`, `.container`, `.wrap`, or root-level class with `max-width`. Remove or replace with `width: 100%`.

- [ ] **Step 3: Fix FleetPage.module.css**

Open `src/pages/fleet/FleetPage.module.css`. Same audit — remove restrictive `max-width` on outer wrappers.

- [ ] **Step 4: Fix EmployeeDashboardPage.module.css**

Open `src/pages/employees/EmployeeDashboardPage.module.css`. Same audit.

- [ ] **Step 5: Fix SafetyDashboardPage.module.css**

Open `src/pages/safety/SafetyDashboardPage.module.css`. Same audit.

- [ ] **Step 6: Fix ObrasPage.module.css**

Open `src/pages/obras/ObrasPage.module.css`. Same audit.

- [ ] **Step 7: Fix CleaningDashboard.module.css**

Open `src/pages/cleaning/CleaningDashboard.module.css`. Same audit.

- [ ] **Step 8: Fix HomePage.module.css**

Open `src/pages/home/HomePage.module.css`. Same audit.

- [ ] **Step 9: Visual verification on wide screen**

Open the app at 1440px+ viewport width. Navigate to: Home, Ativos, Frota, Colaboradores, Segurança, Obras, Limpeza. Each should fill available width with no large white areas on sides.

- [ ] **Step 10: Commit**

```bash
git add src/pages/
git commit -m "feat(layout): remove restrictive max-width from page CSS Modules — full desktop width"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All spec requirements mapped to tasks. Route removals (Task 1), sidebar (Task 2), AppLayout dual-sidebar (Task 3), MaintenanceSidebar (Task 4), EmployeeRankingPage (Task 5), AdminPage (Task 6), desktop layout (Tasks 7-8).
- [x] **Correction noted:** DocumentViewer is already a modal in ServiceOrdersPage and PurchaseOrdersPage — no new routes needed (confirmed by reading source files).
- [x] **No placeholders:** All code steps contain complete implementations.
- [x] **Type consistency:** `Employee.scorePerformance`, `Employee.statusPerformance`, `STATUS_PERFORMANCE_META` — all match the actual `src/types/employee.ts`. `UserRole` and `ROLE_LEVEL` match `src/components/auth/ProtectedRoute.tsx`. `getEmployees()` signature matches `src/lib/db-employees.ts`.
- [x] **Icon type change:** `NavItem.icon` changed from `string` to `React.ReactNode` in GlobalSidebar to support SVG elements — no other files consume `NavItem` type directly.
- [x] **MaintenanceSidebar:** Changed emoji labels ("📦 Itens", "🏢 Fornecedores", "🔧 Manutenções") to plain text in SubItem for cleaner look — consistent with the new SVG icon approach.

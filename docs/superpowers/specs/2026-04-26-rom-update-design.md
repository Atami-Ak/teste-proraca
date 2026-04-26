# ROM Update — Pro Raça Rações
**Date:** 2026-04-26
**Approach:** Option B — Phase-by-phase (Routes + Sidebar → Missing Pages → Desktop Layout)

---

## Context

The system has 9 fully-migrated React modules with 40+ routes, but the navigation structure (ROM) was never updated to match. Symptoms: broken sidebar links, missing routes, no role-based visibility, legacy iframes still in menu, desktop layout underutilizing screen width.

---

## Phase 1 — Route Map + Sidebar Rebuild

### Routes to KEEP (no changes)

```
/                           → HomePage
/ativos                     → AssetsPage
/ativos/novo                → AssetFormPage
/ativos/manutencao          → MaintenancePage
/ativos/fornecedores        → SuppliersPage
/ativos/inventario          → InventoryPage
/ativos/categorias          → CategoriesPage
/frota                      → FleetPage
/frota/inspecao             → InspectionPage
/frota/inspecao/:vehicleId  → InspectionPage
/frota/historico/:vehicleId → VehicleHistoryPage
/limpeza                    → CleaningDashboard
/limpeza/inspecao/:zoneId   → InspectionFormPage
/limpeza/historico          → HistoryPage
/limpeza/ranking            → RankingPage
/seguranca                  → SafetyDashboardPage
/seguranca/dds              → DDSPage
/seguranca/dds/novo         → DDSFormPage
/seguranca/dds/:id          → DDSFormPage
/seguranca/ddi              → DDIPage
/seguranca/ddi/novo         → DDIFormPage
/seguranca/epi              → EPIPage
/seguranca/epi/:id          → EPIFichaPage
/seguranca/ocorrencias      → OcorrenciasPage
/seguranca/permissoes       → PermissoesPage
/colaboradores              → EmployeeDashboardPage
/colaboradores/lista        → EmployeeListPage
/colaboradores/novo         → EmployeeFormPage
/colaboradores/:id          → EmployeeProfilePage
/colaboradores/:id/editar   → EmployeeFormPage
/colaboradores/:id/avaliacao→ EmployeeEvaluationFormPage
/obras                      → ObrasPage
/obras/nova                 → ObraFormPage
/obras/:id                  → ObraDetailPage
/obras/:id/editar           → ObraFormPage
/obras/:id/inspecao         → InspecaoObraPage
/empreiteiras               → EmpreiteirasPage
/empreiteiras/:id           → EmpreiteiraDetailPage
/os                         → ServiceOrdersPage
/compras                    → PurchaseOrdersPage
/dashboard                  → LegacyPage (iframe) — requiredRole="admin"
/login                      → LoginPage
```

### Routes to ADD

```
/colaboradores/ranking      → EmployeeRankingPage   (new page — Phase 2)
/os/:id/documento           → DocumentViewer        (connect existing component)
/compras/:id/documento      → DocumentViewer        (connect existing component)
/admin                      → AdminPage             (new page — Phase 2, requiredRole="admin")
```

### Routes to REMOVE

```
/infra                      → delete (redirect removed from LEGACY_REDIRECTS)
/legacy/infra               → delete
/legacy/os                  → delete (React /os exists)
/legacy/compras             → delete (React /compras exists)
/legacy/documentos          → delete (DocumentViewer connected contextually)
```

`LEGACY_ROUTES` array shrinks to only `/dashboard`. `LEGACY_REDIRECTS` array is emptied.

---

## Phase 1 — Sidebar Rebuild

### Global Sidebar structure

```
┌─────────────────────────────┐
│  [Logo] Pro Raça Rações      │
├─────────────────────────────┤
│  Home                        │  — all roles
│  Dashboard         (admin)   │  — admin only
├── OPERAÇÕES ────────────────┤
│  Ordens de Serviço           │  — operador+
│  Compras                     │  — operador+
├── PATRIMÔNIO ───────────────┤
│  Ativos                      │  — operador+ (triggers category sidebar)
│  Manutenções                 │  — operador+
│  Inventário                  │  — operador+
│  Fornecedores                │  — operador+
├── FACILITIES ───────────────┤
│  Frota                       │  — all roles
│  Limpeza 5S                  │  — all roles
├── PESSOAS ──────────────────┤
│  Colaboradores               │  — supervisor+
│  Segurança                   │  — supervisor+
├── OBRAS ────────────────────┤
│  Obras & Contratos           │  — supervisor+
│  Empreiteiras                │  — supervisor+
├─────────────────────────────┤
│  [gear] Admin      (admin)   │  — admin only, bottom
│  [power] Sair                │
└─────────────────────────────┘
```

### Role visibility rules

| Role | Sees |
|------|------|
| visualizador | Home, Facilities |
| operador | + Operações, Patrimônio |
| supervisor | + Pessoas, Obras |
| admin | everything + Dashboard + Admin gear |

### Role level constants (already in ProtectedRoute)

```
visualizador: 1 / operador: 2 / supervisor: 3 / admin: 4
```

Sidebar uses `user.role` from `useStore` to conditionally render groups.

### Implementation: GlobalSidebar.tsx

- Replace emoji icons with inline SVG icons (16×16, currentColor) for professional look
- `NAV_GROUPS` becomes a function `getNavGroups(role: UserRole): NavGroup[]` that filters by role
- Dashboard item added to top section, `admin`-only
- Admin gear added to `BOTTOM_NAV`, `admin`-only
- Groups: Operações, Patrimônio, Facilities, Pessoas, Obras
- `Infra` item removed entirely

### Asset Category Sidebar

`AppLayout.tsx` detects if current path starts with `/ativos` using `useLocation()`. When true, renders `MaintenanceSidebar` instead of `GlobalSidebar`. `MaintenanceSidebar` structure:

```
← Voltar ao menu principal
── CATEGORIAS ────────────────
  [icon] <category.name>       (dynamic from useStore categories)
── ───────────────────────────
  Fornecedores
  Inventário
[+] Novo Ativo                 (sticky bottom button)
```

Clicking a category sets `activeCategoryId` in store and navigates to `/ativos?categoria=<id>`.

---

## Phase 2 — Missing Pages

### EmployeeRankingPage (`src/pages/employees/EmployeeRankingPage.tsx`)

- Reads employee evaluation data from `db-employees.ts`
- Computes average score per employee across all evaluation criteria (10 criteria)
- Displays ranked table: position badge (gold/silver/bronze for top 3), name, role/cargo, department, average score (0–10), evaluation count, trend indicator (up/down/stable vs previous period)
- Filter bar: department dropdown, period selector (last 30/60/90 days)
- Sorting: by score (default), by name, by evaluations count
- Responsive: table on desktop, card stack on mobile
- CSS Module: `EmployeeRankingPage.module.css`

### DocumentViewer route connections

- `DocumentViewer` already at `src/pages/orders/DocumentViewer.tsx`
- Add routes `/os/:id/documento` and `/compras/:id/documento` in `App.tsx`
- Component receives `id` from `useParams()` and detects order type from the URL prefix (`/os` vs `/compras`)
- If DocumentViewer already uses a different prop shape, add a thin wrapper or adjust `useParams` usage — minimal change

### AdminPage (`src/pages/admin/AdminPage.tsx`)

- `requiredRole="admin"` enforced at route level via `ProtectedRoute`
- Layout: page header + card grid
- Cards linking to existing admin areas (user management, permissions, system config, audit logs)
- Where functionality doesn't exist yet: elegant placeholder card with "Em breve — será integrado ao Dashboard"
- No new Firestore collections needed
- CSS Module: `AdminPage.module.css`

---

## Phase 3 — Desktop Layout

### globals.css changes

```css
.page-container {
  padding: 28px 32px 48px;
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}
```

### CSS Module audit

Files to check for restrictive `max-width` values below 1200px (replace with `100%`):
- `AssetsPage.module.css`
- `FleetPage.module.css`
- `EmployeeDashboardPage.module.css`
- `SafetyDashboardPage.module.css`
- `ObrasPage.module.css`
- `CleaningDashboard.module.css`
- `HomePage.module.css`

Any `max-width` below 1200px inside these files is replaced with `100%` — the `.page-container` global token handles the outer bound at 1600px.

### Responsive breakpoints (no changes to existing)

| Breakpoint | Behavior |
|-----------|----------|
| <900px | mobile drawer sidebar, stacked layout |
| 900–1280px | collapsed sidebar 68px, fluid content |
| 1280–1600px | full content width |
| >1600px | centered at max 1600px |

---

## Files to Create

| File | Phase |
|------|-------|
| `src/pages/employees/EmployeeRankingPage.tsx` | 2 |
| `src/pages/employees/EmployeeRankingPage.module.css` | 2 |
| `src/pages/admin/AdminPage.tsx` | 2 |
| `src/pages/admin/AdminPage.module.css` | 2 |

## Files to Modify

| File | Phase | Change |
|------|-------|--------|
| `src/App.tsx` | 1 | Add routes, remove legacy routes, add requiredRole guards |
| `src/components/layout/GlobalSidebar.tsx` | 1 | Full rebuild with role-based groups, SVG icons |
| `src/components/layout/AppLayout.tsx` | 1 | Dual-sidebar logic based on `/ativos` path |
| `src/components/layout/MaintenanceSidebar.tsx` | 1 | Add "Voltar" link, Fornecedores/Inventário links, Novo Ativo button |
| `src/styles/globals.css` | 3 | Add max-width to page-container, add content-grid utility |
| `src/pages/assets/AssetsPage.module.css` | 3 | Remove restrictive max-width |
| `src/pages/fleet/FleetPage.module.css` | 3 | Remove restrictive max-width |
| `src/pages/employees/EmployeeDashboardPage.module.css` | 3 | Remove restrictive max-width |
| `src/pages/safety/SafetyDashboardPage.module.css` | 3 | Remove restrictive max-width |
| `src/pages/obras/ObrasPage.module.css` | 3 | Remove restrictive max-width |
| `src/pages/cleaning/CleaningDashboard.module.css` | 3 | Remove restrictive max-width |
| `src/pages/home/HomePage.module.css` | 3 | Remove restrictive max-width |

---

## Constraints

- Dashboard stays as `LegacyPage` iframe — no React migration in this update
- Infra removed from nav entirely — no placeholder, no redirect
- Admin page organizes existing features only — no new Firestore collections
- `LEGACY_ROUTES` kept only for `/dashboard`
- DocumentViewer connected via params — no prop API changes if avoidable
- All role checks use existing `ROLE_LEVEL` constants from `ProtectedRoute.tsx`

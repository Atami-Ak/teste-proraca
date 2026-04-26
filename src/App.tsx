import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout      from '@/components/layout/AppLayout'
import LegacyPage     from '@/pages/legacy/LegacyPage'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import LoginPage      from '@/pages/auth/LoginPage'
import { useAuth }    from '@/hooks/useData'

// ── React pages (code-split) ───────────────────────────
const HomePage              = lazy(() => import('@/pages/home/HomePage'))
const AssetsPage            = lazy(() => import('@/pages/assets/AssetsPage'))
const AssetFormPage         = lazy(() => import('@/pages/assets/AssetFormPage'))
const MaintenancePage       = lazy(() => import('@/pages/maintenance/MaintenancePage'))
const SuppliersPage         = lazy(() => import('@/pages/suppliers/SuppliersPage'))
const InventoryPage         = lazy(() => import('@/pages/inventory/InventoryPage'))
const CategoriesPage        = lazy(() => import('@/pages/categories/CategoriesPage'))
const ServiceOrdersPage     = lazy(() => import('@/pages/orders/ServiceOrdersPage'))
const PurchaseOrdersPage    = lazy(() => import('@/pages/orders/PurchaseOrdersPage'))

// ── Fleet module (React — migrated from legacy iframe) ─
const FleetPage             = lazy(() => import('@/pages/fleet/FleetPage'))
const InspectionPage        = lazy(() => import('@/pages/fleet/InspectionPage'))
const VehicleHistoryPage    = lazy(() => import('@/pages/fleet/VehicleHistoryPage'))

// ── Cleaning / 5S module (React — migrated from legacy) ─
const CleaningDashboard     = lazy(() => import('@/pages/cleaning/CleaningDashboard'))
const CleaningInspForm      = lazy(() => import('@/pages/cleaning/InspectionFormPage'))
const CleaningHistory       = lazy(() => import('@/pages/cleaning/HistoryPage'))
const CleaningRanking       = lazy(() => import('@/pages/cleaning/RankingPage'))

// ── Safety Management module ───────────────────────────
const SafetyDashboardPage   = lazy(() => import('@/pages/safety/SafetyDashboardPage'))
const DDSPage               = lazy(() => import('@/pages/safety/DDSPage'))
const DDSFormPage           = lazy(() => import('@/pages/safety/DDSFormPage'))
const DDIPage               = lazy(() => import('@/pages/safety/DDIPage'))
const DDIFormPage           = lazy(() => import('@/pages/safety/DDIFormPage'))
const EPIPage               = lazy(() => import('@/pages/safety/EPIPage'))
const EPIFichaPage          = lazy(() => import('@/pages/safety/EPIFichaPage'))
const OcorrenciasPage       = lazy(() => import('@/pages/safety/OcorrenciasPage'))
const PermissoesPage        = lazy(() => import('@/pages/safety/PermissoesPage'))

// ── Employee Management module ─────────────────────────
const EmployeeDashboardPage     = lazy(() => import('@/pages/employees/EmployeeDashboardPage'))
const EmployeeListPage          = lazy(() => import('@/pages/employees/EmployeeListPage'))
const EmployeeFormPage          = lazy(() => import('@/pages/employees/EmployeeFormPage'))
const EmployeeProfilePage       = lazy(() => import('@/pages/employees/EmployeeProfilePage'))
const EmployeeEvaluationFormPage = lazy(() => import('@/pages/employees/EmployeeEvaluationFormPage'))

// ── Obras & Empreiteiras module ────────────────────────
const ObrasPage             = lazy(() => import('@/pages/obras/ObrasPage'))
const ObraFormPage          = lazy(() => import('@/pages/obras/ObraFormPage'))
const ObraDetailPage        = lazy(() => import('@/pages/obras/ObraDetailPage'))
const InspecaoObraPage      = lazy(() => import('@/pages/obras/InspecaoObraPage'))
const EmpreiteirasPage      = lazy(() => import('@/pages/empreiteiras/EmpreiteirasPage'))
const EmpreiteiraDetailPage = lazy(() => import('@/pages/empreiteiras/EmpreiteiraDetailPage'))

// ── Admin & Ranking ───────────────────────────────────
// @ts-expect-error — created in Phase 2, Task 5
const EmployeeRankingPage   = lazy(() => import('@/pages/employees/EmployeeRankingPage'))
// @ts-expect-error — created in Phase 2, Task 6
const AdminPage             = lazy(() => import('@/pages/admin/AdminPage'))

// ── Shared loading fallback ────────────────────────────
function PageLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 60, color: '#94a3b8', fontSize: '0.9rem',
    }}>
      Carregando…
    </div>
  )
}

function Lazy({ page }: { page: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{page}</Suspense>
}

// ─────────────────────────────────────────────────────
export default function App() {
  // Must be at root so onAuthStateChanged fires even on the /login page.
  // Without this, a successful login never updates the store and redirect never happens.
  useAuth()

  return (
    <Routes>

      {/* ── Public routes ── */}
      <Route path="/login" element={<LoginPage />} />

      {/* ── Protected routes ── */}
      <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>

        {/* ── Home ── */}
        <Route index element={<Lazy page={<HomePage />} />} />

        {/* ── Assets module (fully React) ── */}
        <Route path="ativos" element={<Lazy page={<AssetsPage />} />} />
        <Route path="ativos/novo" element={<Lazy page={<AssetFormPage />} />} />
        <Route path="ativos/manutencao" element={<Lazy page={<MaintenancePage />} />} />
        <Route path="ativos/fornecedores" element={<Lazy page={<SuppliersPage />} />} />
        <Route path="ativos/inventario" element={<Lazy page={<InventoryPage />} />} />
        <Route path="ativos/categorias" element={<Lazy page={<CategoriesPage />} />} />

        {/* ── Operations module (fully React) ── */}
        <Route path="os"      element={<Lazy page={<ServiceOrdersPage />} />} />
        <Route path="compras" element={<Lazy page={<PurchaseOrdersPage />} />} />

        {/* ── Fleet module (fully React — migrated) ── */}
        <Route path="frota"                          element={<Lazy page={<FleetPage />} />} />
        <Route path="frota/inspecao"                 element={<Lazy page={<InspectionPage />} />} />
        <Route path="frota/inspecao/:vehicleId"      element={<Lazy page={<InspectionPage />} />} />
        <Route path="frota/historico/:vehicleId"     element={<Lazy page={<VehicleHistoryPage />} />} />

        {/* ── Cleaning / 5S module (fully React — migrated) ── */}
        <Route path="limpeza"                        element={<Lazy page={<CleaningDashboard />} />} />
        <Route path="limpeza/inspecao/:zoneId"       element={<Lazy page={<CleaningInspForm />} />} />
        <Route path="limpeza/historico"              element={<Lazy page={<CleaningHistory />} />} />
        <Route path="limpeza/ranking"                element={<Lazy page={<CleaningRanking />} />} />

        {/* ── Safety module ── */}
        <Route path="seguranca"                          element={<Lazy page={<SafetyDashboardPage />} />} />
        <Route path="seguranca/dds"                      element={<Lazy page={<DDSPage />} />} />
        <Route path="seguranca/dds/novo"                 element={<Lazy page={<DDSFormPage />} />} />
        <Route path="seguranca/dds/:id"                  element={<Lazy page={<DDSFormPage />} />} />
        <Route path="seguranca/dds/:id/editar"           element={<Lazy page={<DDSFormPage />} />} />
        <Route path="seguranca/ddi"                      element={<Lazy page={<DDIPage />} />} />
        <Route path="seguranca/ddi/novo"                 element={<Lazy page={<DDIFormPage />} />} />
        <Route path="seguranca/ddi/:id"                  element={<Lazy page={<DDIFormPage />} />} />
        <Route path="seguranca/ddi/:id/editar"           element={<Lazy page={<DDIFormPage />} />} />
        <Route path="seguranca/epi"                      element={<Lazy page={<EPIPage />} />} />
        <Route path="seguranca/epi/novo"                 element={<Lazy page={<EPIFichaPage />} />} />
        <Route path="seguranca/epi/:id"                  element={<Lazy page={<EPIFichaPage />} />} />
        <Route path="seguranca/ocorrencias"              element={<Lazy page={<OcorrenciasPage />} />} />
        <Route path="seguranca/ocorrencias/novo"         element={<Lazy page={<OcorrenciasPage />} />} />
        <Route path="seguranca/permissoes"               element={<Lazy page={<PermissoesPage />} />} />

        {/* ── Employee Management module ── */}
        <Route path="colaboradores"                        element={<Lazy page={<EmployeeDashboardPage />} />} />
        <Route path="colaboradores/lista"                  element={<Lazy page={<EmployeeListPage />} />} />
        <Route path="colaboradores/novo"                   element={<Lazy page={<EmployeeFormPage />} />} />
        <Route path="colaboradores/ranking"                element={<Lazy page={<EmployeeRankingPage />} />} />
        <Route path="colaboradores/:id"                    element={<Lazy page={<EmployeeProfilePage />} />} />
        <Route path="colaboradores/:id/editar"             element={<Lazy page={<EmployeeFormPage />} />} />
        <Route path="colaboradores/:id/avaliacao"          element={<Lazy page={<EmployeeEvaluationFormPage />} />} />

        {/* ── Obras & Empreiteiras module ── */}
        <Route path="obras"                                      element={<Lazy page={<ObrasPage />} />} />
        <Route path="obras/nova"                                 element={<Lazy page={<ObraFormPage />} />} />
        <Route path="obras/:obraId"                              element={<Lazy page={<ObraDetailPage />} />} />
        <Route path="obras/:obraId/editar"                       element={<Lazy page={<ObraFormPage />} />} />
        <Route path="obras/:obraId/inspecao"                     element={<Lazy page={<InspecaoObraPage />} />} />
        <Route path="obras/:obraId/inspecao/:inspecaoId"         element={<Lazy page={<InspecaoObraPage />} />} />
        <Route path="empreiteiras"                               element={<Lazy page={<EmpreiteirasPage />} />} />
        <Route path="empreiteiras/:empreiteiraId"                element={<Lazy page={<EmpreiteiraDetailPage />} />} />

        {/* ── Admin-only routes ── */}
        <Route element={<ProtectedRoute requiredRole="admin" />}>
          <Route path="admin"     element={<Lazy page={<AdminPage />} />} />
          <Route path="dashboard" element={<LegacyPage src="/dashboard/dashboard.html" label="Painel de Gestão" />} />
        </Route>

        {/* ── 404 → Home ── */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Route>
      </Route>
    </Routes>
  )
}

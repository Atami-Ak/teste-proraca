import { Navigate, Outlet } from 'react-router-dom'
import { useStore }         from '@/store/useStore'
import type { UserRole }    from '@/types'

interface ProtectedRouteProps {
  requiredRole?: UserRole
}

const ROLE_LEVEL: Record<UserRole, number> = {
  visualizador: 1,
  operador:     2,
  supervisor:   3,
  admin:        4,
}

export default function ProtectedRoute({ requiredRole }: ProtectedRouteProps) {
  const user      = useStore(s => s.user)
  const authReady = useStore(s => s.authReady)

  // Still resolving auth state — render nothing (AppLayout shows its own spinner)
  if (!authReady) return null

  // Not authenticated → redirect to login
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Role check
  if (requiredRole && ROLE_LEVEL[user.role] < ROLE_LEVEL[requiredRole]) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

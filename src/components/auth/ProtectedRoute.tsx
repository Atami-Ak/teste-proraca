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

  // Still resolving auth state — show spinner while Firebase Auth initializes
  if (!authReady) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#052e16',
    }}>
      <div style={{
        width: 40, height: 40,
        border: '3px solid rgba(255,255,255,0.15)',
        borderTopColor: '#ea580c',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

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

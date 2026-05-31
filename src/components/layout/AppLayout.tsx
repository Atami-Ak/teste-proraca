import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useStore }            from '@/store/useStore'
import GlobalSidebar           from './GlobalSidebar'
import s                       from './AppLayout.module.css'

export default function AppLayout() {
  const authReady      = useStore(st => st.authReady)
  const location       = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile drawer on every navigation
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

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
      <GlobalSidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Backdrop — closes mobile drawer */}
      {mobileOpen && (
        <div className={s.backdrop} onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <main className={s.content}>
        {/* Mobile top bar */}
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

        <Outlet />
      </main>
    </div>
  )
}

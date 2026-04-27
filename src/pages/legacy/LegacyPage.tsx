/**
 * LegacyPage.tsx
 *
 * Iframe wrapper for legacy HTML modules.
 * Keeps old pages accessible inside the React shell until each is migrated.
 *
 * LEGACY - TO BE MIGRATED (each module individually)
 */

import s from './LegacyPage.module.css'

interface LegacyPageProps {
  /** Absolute path from server root, e.g. "/limpeza/limpeza.html" */
  src: string
  /** Human-readable module name shown while loading */
  label?: string
}

export default function LegacyPage({ src, label }: LegacyPageProps) {
  return (
    <div className={s.wrapper}>
      {label && (
        <div className={s.banner}>
          <span className={s.bannerBadge}>LEGACY</span>
          {label} — em migração para React
        </div>
      )}
      <iframe
        src={src}
        className={s.frame}
        title={label ?? 'Módulo legado'}
        // Sandbox allows scripts (needed for Firebase auth) but restricts navigation
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
      />
    </div>
  )
}

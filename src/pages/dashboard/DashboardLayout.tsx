// src/pages/dashboard/DashboardLayout.tsx

import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { subscribeToPendingCount } from '@/lib/db-dashboard'
import s from './DashboardLayout.module.css'

interface TabDef {
  path:   string
  label:  string
  icon:   string
  star?:  boolean
  badge?: boolean
}

const TABS: TabDef[] = [
  { path: 'overview',       label: 'Visão Geral',   icon: '📊'              },
  { path: 'maquinario',     label: 'Maquinário',    icon: '⚙️', star: true  },
  { path: 'frota',          label: 'Frota',         icon: '🚛'              },
  { path: 'limpeza',        label: 'Limpeza 5S',    icon: '🧹'              },
  { path: 'seguranca',      label: 'Segurança',     icon: '🛡️'             },
  { path: 'colaboradores',  label: 'Colaboradores', icon: '👥'              },
  { path: 'obras',          label: 'Obras',         icon: '🏗️'             },
  { path: 'compras',        label: 'Compras',       icon: '🛒'              },
  { path: 'aprovacoes',     label: 'Aprovações',    icon: '✅', badge: true  },
  { path: 'documentos',     label: 'Documentos',    icon: '📄'              },
  { path: 'acesso',         label: 'Acesso',        icon: '🔐'              },
]

export default function DashboardLayout() {
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    const unsub = subscribeToPendingCount(setPendingCount)
    return unsub
  }, [])

  return (
    <div className={s.layout}>
      <nav className={s.tabBar} role="tablist" aria-label="Módulos do dashboard">
        <div className={s.tabScroll}>
          {TABS.map(tab => (
            <NavLink
              key={tab.path}
              to={tab.path}
              role="tab"
              className={({ isActive }) => `${s.tab} ${isActive ? s.tabActive : ''}`}
            >
              <span className={s.tabIcon} aria-hidden="true">{tab.icon}</span>
              <span className={s.tabLabel}>{tab.label}</span>
              {tab.badge && pendingCount > 0 && (
                <span className={s.tabBadge} aria-label={`${pendingCount} aprovações pendentes`}>
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
              {tab.star && (
                <span className={s.tabStar} aria-hidden="true">★</span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className={s.content}>
        <Outlet />
      </div>
    </div>
  )
}

import type { CSSProperties } from 'react'
import type { AssetStatus, MaintenanceType, MaintenanceStatus, SupplierType } from '@/types'
import {
  ASSET_STATUS_META, MAINT_TYPE_META, MAINT_STATUS_META, SUPPLIER_TYPE_META,
} from '@/types'
import s from './Badge.module.css'

interface BadgeProps {
  label?:    string
  icon?:     string
  colorCls?: string
  style?:    CSSProperties
}

export function Badge({ label, icon, colorCls, style }: BadgeProps) {
  return (
    <span className={`${s.badge} ${colorCls ? s[colorCls] ?? '' : ''}`} style={style}>
      {icon && <span>{icon}</span>}
      {label}
    </span>
  )
}

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const m = ASSET_STATUS_META[status]
  return <Badge label={m.label} icon={m.icon} colorCls={m.cls} />
}

export function MaintTypeBadge({ type }: { type: MaintenanceType }) {
  const m = MAINT_TYPE_META[type]
  return <Badge label={m.label} icon={m.icon} colorCls={m.cls} />
}

export function MaintStatusBadge({ status }: { status: MaintenanceStatus }) {
  const m = MAINT_STATUS_META[status]
  return <Badge label={m.label} icon={m.icon} />
}

export function SupplierTypeBadge({ type }: { type: SupplierType }) {
  const m = SUPPLIER_TYPE_META[type]
  return <Badge label={m.label} icon={m.icon} colorCls={m.cls} />
}

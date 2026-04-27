import { useMemo } from 'react'
import type { MaintenanceRecord, Asset, Category } from '@/types'
import { MAINT_TYPE_META, MAINT_STATUS_META, isMachineryMaintenance } from '@/types'
import { fmtDate } from '@/lib/db'
import s from './MaintenanceList.module.css'

// ── Type colors (dot on timeline) ─────────────────────
const TYPE_COLOR: Record<string, string> = {
  preventiva: '#3b82f6',
  corretiva:  '#ef4444',
  inspecao:   '#22c55e',
}

// ── Monthly group key ─────────────────────────────────
function monthKey(r: MaintenanceRecord): string {
  const d = r.createdAt instanceof Date
    ? r.createdAt
    : r.createdAt && 'toDate' in r.createdAt
      ? r.createdAt.toDate()
      : null
  if (!d) return 'Sem data'
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

// ── Total cost helper ─────────────────────────────────
function totalCostOf(r: MaintenanceRecord): number {
  let c = r.cost ?? 0
  if (isMachineryMaintenance(r)) c += r.replacedParts.reduce((s, p) => s + p.quantity * p.cost, 0)
  return c
}

// ══════════════════════════════════════════════════════
// MaintenanceList
// ══════════════════════════════════════════════════════

export interface MaintenanceListProps {
  records:            MaintenanceRecord[]
  assetMap:           Record<string, Asset>
  categoryMap:        Record<string, Category>
  onView:             (r: MaintenanceRecord) => void
  onEdit:             (r: MaintenanceRecord) => void
  onDelete:           (id: string) => void
  criticalThreshold?: number
}

export default function MaintenanceList({
  records, assetMap, categoryMap, onView, onEdit, onDelete, criticalThreshold = 5,
}: MaintenanceListProps) {

  // Group by month
  const groups = useMemo(() => {
    const map = new Map<string, MaintenanceRecord[]>()
    for (const r of records) {
      const k = monthKey(r)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(r)
    }
    return [...map.entries()]
  }, [records])

  // Cost aggregate
  const totalCost = useMemo(
    () => records.reduce((sum, r) => sum + totalCostOf(r), 0),
    [records]
  )

  // Critical check (>= threshold unique assets with corrective records)
  const criticalAssets = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of records) {
      if (r.type === 'corretiva') counts.set(r.assetId, (counts.get(r.assetId) ?? 0) + 1)
    }
    return [...counts.entries()].filter(([, n]) => n >= criticalThreshold)
  }, [records, criticalThreshold])

  if (records.length === 0) {
    return (
      <div className={s.empty}>
        <div className={s.emptyIcon}>🔧</div>
        <h3>Nenhuma manutenção registrada</h3>
        <p>Clique em "+ Nova Manutenção" para começar.</p>
      </div>
    )
  }

  return (
    <div className={s.wrap}>

      {/* Critical alert */}
      {criticalAssets.length > 0 && (
        <div className={s.criticalAlert}>
          <span className={s.criticalIcon}>⚠️</span>
          <div>
            <strong>Ativos Críticos:</strong>{' '}
            {criticalAssets.map(([assetId, count]) => {
              const asset = assetMap[assetId]
              return (
                <span key={assetId} className={s.criticalTag}>
                  {asset?.code ?? assetId} ({count} corretivas)
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className={s.timeline}>
        {groups.map(([month, group]) => (
          <div key={month} className={s.monthGroup}>
            <div className={s.monthLabel}>{month.charAt(0).toUpperCase() + month.slice(1)}</div>

            {group.map(r => {
              const asset    = assetMap[r.assetId]
              const category = asset ? categoryMap[asset.categoryId] : undefined
              const typeMeta   = MAINT_TYPE_META[r.type]   ?? { label: r.type,   icon: '🔧' }
              const statusMeta = MAINT_STATUS_META[r.status] ?? { label: r.status, icon: '❓' }
              const color = TYPE_COLOR[r.type] ?? '#94a3b8'
              const cost  = totalCostOf(r)

              return (
                <div key={r.id} className={s.item} onClick={() => onView(r)}>

                  {/* Timeline dot + line */}
                  <div className={s.dotCol}>
                    <div className={s.dot} style={{ background: color, boxShadow: `0 0 0 3px ${color}22` }} />
                    <div className={s.line} />
                  </div>

                  {/* Content */}
                  <div className={s.content}>
                    <div className={s.contentHeader}>
                      <div className={s.badges}>
                        <span className={s.typeBadge} style={{ background: color + '22', color }}>
                          {typeMeta.icon} {typeMeta.label}
                        </span>
                        <span className={s.statusBadge}>{statusMeta.icon} {statusMeta.label}</span>
                      </div>
                      <div className={s.itemActions} onClick={e => e.stopPropagation()}>
                        <button className={s.iconBtn} title="Editar" onClick={() => onEdit(r)}>✏️</button>
                        <button className={s.iconBtn} title="Excluir" onClick={() => onDelete(r.id)}>🗑️</button>
                      </div>
                    </div>

                    <div className={s.desc}>{r.description}</div>

                    <div className={s.meta}>
                      {asset && (
                        <span className={s.metaChip}>
                          {category?.icon} <code>{asset.code}</code> {asset.name}
                        </span>
                      )}
                      {r.technician && (
                        <span className={s.metaChip}>👷 {r.technician}</span>
                      )}
                      <span className={s.metaChip}>📅 {fmtDate(r.scheduledDate ?? r.createdAt)}</span>
                      {cost > 0 && (
                        <span className={s.costChip}>
                          R$ {cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      {r.serviceOrderId  && <span className={s.linkChip} title="OS vinculada">📋 OS</span>}
                      {r.purchaseOrderId && <span className={s.linkChip} title="PO vinculada">🛒 PO</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      {totalCost > 0 && (
        <div className={s.costFooter}>
          <span>Custo total ({records.length} registro{records.length !== 1 ? 's' : ''})</span>
          <strong>R$ {totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
        </div>
      )}
    </div>
  )
}

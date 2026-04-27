import type { MaintenanceRecord, Asset, Category } from '@/types'
import {
  MAINT_TYPE_META, MAINT_STATUS_META,
  isMachineryMaintenance, isITMaintenance, resolveEngine,
} from '@/types'
import { fmtDate } from '@/lib/db'
import s from './MaintenanceDetails.module.css'

// ── Helper ────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0) return null
  return (
    <div className={s.row}>
      <span className={s.rowLabel}>{label}</span>
      <span className={s.rowValue}>{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={s.section}>
      <div className={s.sectionTitle}>{title}</div>
      {children}
    </div>
  )
}

// ── MachinerySection ──────────────────────────────────

function MachinerySection({ r }: { r: MaintenanceRecord }) {
  if (!isMachineryMaintenance(r)) return null
  const totalPartsCost = r.replacedParts.reduce((sum, p) => sum + p.quantity * p.cost, 0)

  return (
    <Section title="⚙️ Detalhes de Maquinário">
      <Row label="Tipo de Falha"    value={r.failureType} />
      <Row label="Tempo Parado"     value={r.downtime != null ? `${r.downtime} h` : undefined} />
      <Row label="Causa Raiz"       value={r.rootCause} />
      <Row label="Requer Compra"    value={r.requiresPurchase ? '✅ Sim' : '❌ Não'} />

      {r.replacedParts.length > 0 && (
        <div className={s.partsBlock}>
          <div className={s.partsTitle}>Peças Substituídas</div>
          <table className={s.partsTable}>
            <thead>
              <tr><th>Peça</th><th>Qtd</th><th>Custo Unit.</th><th>Subtotal</th></tr>
            </thead>
            <tbody>
              {r.replacedParts.map((p, i) => (
                <tr key={i}>
                  <td>{p.name}</td>
                  <td className={s.num}>{p.quantity}</td>
                  <td className={s.num}>R$ {p.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className={s.num}>R$ {(p.quantity * p.cost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className={s.totalLabel}>Total em Peças</td>
                <td className={s.totalValue}>R$ {totalPartsCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Section>
  )
}

// ── ITSection ─────────────────────────────────────────

const DEVICE_LABEL: Record<string, string> = {
  computer: 'Computador / Servidor',
  printer:  'Impressora',
  network:  'Rede / Switch / Roteador',
  other:    'Outro',
}

function ITSection({ r }: { r: MaintenanceRecord }) {
  if (!isITMaintenance(r)) return null
  return (
    <Section title="💻 Detalhes de TI">
      <Row label="Tipo de Dispositivo" value={DEVICE_LABEL[r.deviceType] ?? r.deviceType} />
      <Row label="Tipo de Problema"    value={r.issueType} />
      <Row label="Usuário Afetado"     value={r.assignedUser} />
      {r.replacedParts && r.replacedParts.length > 0 && (
        <Row label="Componentes Trocados" value={r.replacedParts.join(', ')} />
      )}
    </Section>
  )
}

// ══════════════════════════════════════════════════════
// MaintenanceDetails
// ══════════════════════════════════════════════════════

export interface MaintenanceDetailsProps {
  record:    MaintenanceRecord
  asset?:    Asset
  category?: Category
  onClose:   () => void
  onEdit:    () => void
}

export default function MaintenanceDetails({ record: r, asset, category, onClose, onEdit }: MaintenanceDetailsProps) {
  const typeMeta   = MAINT_TYPE_META[r.type]   ?? { label: r.type,   icon: '🔧', cls: '' }
  const statusMeta = MAINT_STATUS_META[r.status] ?? { label: r.status, icon: '❓' }
  const engine     = category ? resolveEngine(category) : 'standard'

  const totalCost = (() => {
    let c = r.cost ?? 0
    if (isMachineryMaintenance(r)) {
      c += r.replacedParts.reduce((sum, p) => sum + p.quantity * p.cost, 0)
    }
    return c
  })()

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>

        {/* Header */}
        <div className={s.header}>
          <div className={s.headerLeft}>
            <div className={s.badges}>
              <span className={s.typeBadge} style={{
                background: '#' + (typeMeta.cls === 'type-preventiva' ? '3b82f6' : typeMeta.cls === 'type-corretiva' ? 'ef4444' : '22c55e') + '22',
                color:      '#' + (typeMeta.cls === 'type-preventiva' ? '3b82f6' : typeMeta.cls === 'type-corretiva' ? 'ef4444' : '22c55e'),
              }}>
                {typeMeta.icon} {typeMeta.label}
              </span>
              <span className={s.statusBadge}>{statusMeta.icon} {statusMeta.label}</span>
            </div>
            <div className={s.description}>{r.description}</div>
          </div>
          <button className={s.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={s.body}>

          {/* Asset info */}
          {asset && (
            <div className={s.assetCard}>
              {category && <span className={s.catIcon}>{category.icon}</span>}
              <div>
                <div className={s.assetCode}>{asset.code}</div>
                <div className={s.assetName}>{asset.name} · {asset.location}</div>
              </div>
              {engine !== 'standard' && (
                <span className={s.enginePill}>{engine === 'legacy_machinery' ? '⚙️ Maquinário' : '💻 TI'}</span>
              )}
            </div>
          )}

          {/* Base info */}
          <Section title="Informações Gerais">
            <Row label="Técnico"         value={r.technician} />
            <Row label="Tipo de Serviço" value={r.serviceType === 'external' ? 'Externo (Terceirizado)' : 'Interno'} />
            <Row label="Data Prevista"   value={fmtDate(r.scheduledDate)} />
            <Row label="Data Conclusão"  value={fmtDate(r.completedDate)} />
            <Row label="Custo"           value={r.cost != null ? `R$ ${r.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : undefined} />
          </Section>

          {/* Category-specific sections */}
          <MachinerySection r={r} />
          <ITSection r={r} />

          {/* Notes */}
          {r.notes && (
            <Section title="Observações">
              <p className={s.notes}>{r.notes}</p>
            </Section>
          )}

          {/* Cost summary */}
          {totalCost > 0 && (
            <div className={s.costBar}>
              <span className={s.costLabel}>Custo Total desta Manutenção</span>
              <span className={s.costValue}>R$ {totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          )}

          {/* Linked orders */}
          {(r.serviceOrderId || r.purchaseOrderId) && (
            <Section title="Vínculos">
              {r.serviceOrderId  && <Row label="Ordem de Serviço"   value={<code className={s.orderId}>{r.serviceOrderId}</code>} />}
              {r.purchaseOrderId && <Row label="Pedido de Compra"   value={<code className={s.orderId}>{r.purchaseOrderId}</code>} />}
            </Section>
          )}

        </div>

        <div className={s.footer}>
          <button className={s.btnSecondary} onClick={onClose}>Fechar</button>
          <button className={s.btnPrimary}   onClick={onEdit}>✏️ Editar</button>
        </div>
      </div>
    </div>
  )
}

import type { OrderDocument, ServiceDocumentContent, PurchaseDocumentContent } from '@/types'
import { SERVICE_ORDER_STATUS_META, PURCHASE_ORDER_STATUS_META, PRIORITY_META, SERVICE_TYPE_META } from '@/types'
import { fmtCurrency, fmtDocDate } from '@/lib/document-generator'
import s from './DocumentViewer.module.css'

// ── Type guards ───────────────────────────────────────

function isServiceContent(
  doc: OrderDocument,
  _c: ServiceDocumentContent | PurchaseDocumentContent
): _c is ServiceDocumentContent {
  return doc.orderType === 'service'
}

function isPurchaseContent(
  doc: OrderDocument,
  _c: ServiceDocumentContent | PurchaseDocumentContent
): _c is PurchaseDocumentContent {
  return doc.orderType === 'purchase'
}

// ── Sub-renderers ─────────────────────────────────────

function Row({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className={s.row}>
      <span className={s.rowLabel}>{label}</span>
      <span className={s.rowValue}>{value ?? '—'}</span>
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

function ServiceDocView({ doc, content }: { doc: OrderDocument; content: ServiceDocumentContent }) {
  const statusMeta   = SERVICE_ORDER_STATUS_META[content.status]   ?? { label: content.status,      color: '#94a3b8' }
  const priorityMeta = content.priority ? (PRIORITY_META[content.priority] ?? { label: content.priority, color: '#94a3b8' }) : undefined
  const typeMeta     = SERVICE_TYPE_META[content.serviceType]      ?? { label: content.serviceType }

  return (
    <>
      <div className={s.docHeader}>
        <div className={s.docType}>Ordem de Serviço</div>
        <div className={s.docNumber}>{doc.documentNumber}</div>
        <div className={s.orderRef}>Ref: {content.orderNumber}</div>
        <div
          className={s.statusBadge}
          style={{ background: statusMeta.color + '22', color: statusMeta.color, borderColor: statusMeta.color + '44' }}
        >
          {statusMeta.label}
        </div>
      </div>

      <Section title="Identificação">
        <Row label="Título"       value={content.title} />
        <Row label="Tipo"         value={typeMeta.label} />
        <Row label="Prioridade"   value={priorityMeta?.label} />
        <Row label="Solicitante"  value={content.requestedBy} />
        <Row label="Técnico"      value={content.technician} />
        <Row label="Ativo (ID)"   value={content.assetId} />
        <Row label="Manutenção"   value={content.maintenanceId} />
      </Section>

      <Section title="Descrição do Serviço">
        <p className={s.descText}>{content.description}</p>
      </Section>

      <Section title="Datas e Custos">
        <Row label="Data Prevista"    value={fmtDocDate(content.scheduledDate)} />
        <Row label="Data Conclusão"   value={fmtDocDate(content.completedDate)} />
        <Row label="Custo"            value={content.cost != null ? fmtCurrency(content.cost) : undefined} />
      </Section>

      {content.notes && (
        <Section title="Observações">
          <p className={s.descText}>{content.notes}</p>
        </Section>
      )}
    </>
  )
}

function PurchaseDocView({ doc, content }: { doc: OrderDocument; content: PurchaseDocumentContent }) {
  const statusMeta = PURCHASE_ORDER_STATUS_META[content.status] ?? { label: content.status, color: '#94a3b8' }

  return (
    <>
      <div className={s.docHeader}>
        <div className={s.docType}>Pedido de Compra</div>
        <div className={s.docNumber}>{doc.documentNumber}</div>
        <div className={s.orderRef}>Ref: {content.orderNumber}</div>
        <div
          className={s.statusBadge}
          style={{ background: statusMeta.color + '22', color: statusMeta.color, borderColor: statusMeta.color + '44' }}
        >
          {statusMeta.label}
        </div>
      </div>

      <Section title="Identificação">
        <Row label="Título"       value={content.title} />
        <Row label="Solicitante"  value={content.requestedBy} />
        <Row label="Aprovado por" value={content.approvedBy} />
        <Row label="Fornecedor"   value={content.supplierId} />
        <Row label="Ativo (ID)"   value={content.assetId} />
      </Section>

      {content.description && (
        <Section title="Descrição">
          <p className={s.descText}>{content.description}</p>
        </Section>
      )}

      <Section title="Itens">
        <table className={s.itemsTable}>
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Qtd</th>
              <th>Unid.</th>
              <th>Preço Unit.</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {content.items.map((item, i) => (
              <tr key={i}>
                <td>{item.description}</td>
                <td className={s.numCell}>{item.quantity}</td>
                <td>{item.unit}</td>
                <td className={s.numCell}>{fmtCurrency(item.unitPrice)}</td>
                <td className={s.numCell}>{fmtCurrency(item.quantity * (item.unitPrice ?? 0))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className={s.totalLabel}>Total Geral</td>
              <td className={s.totalValue}>{fmtCurrency(content.totalValue)}</td>
            </tr>
          </tfoot>
        </table>
      </Section>

      {content.notes && (
        <Section title="Observações">
          <p className={s.descText}>{content.notes}</p>
        </Section>
      )}
    </>
  )
}

// ══════════════════════════════════════════════════════
// DocumentViewer
// ══════════════════════════════════════════════════════

interface DocumentViewerProps {
  document: OrderDocument | null
  onClose:  () => void
}

export default function DocumentViewer({ document: orderDoc, onClose }: DocumentViewerProps) {
  if (!orderDoc) return null

  const { content } = orderDoc

  function handlePrint() {
    window.print()
  }

  const generatedAt = orderDoc.createdAt
    ? new Date(orderDoc.createdAt as unknown as string).toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR')

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>

      {/* Print controls — hidden in @media print */}
      <div className={s.controls} aria-hidden="true">
        <button className={s.printBtn} onClick={handlePrint}>🖨 Imprimir</button>
        <button className={s.closeBtn} onClick={onClose}>✕ Fechar</button>
      </div>

      {/* The printable document */}
      <div className={s.doc}>

        <div className={s.letterhead}>
          <div className={s.brand}>
            <div className={s.brandMark}>S</div>
            <div>
              <div className={s.brandName}>SIGA</div>
              <div className={s.brandSub}>Sistema de Gestão Industrial</div>
            </div>
          </div>
          <div className={s.docMeta}>
            <div className={s.metaLine}>Emitido em: {generatedAt}</div>
            <div className={s.metaLine}>Nº: {orderDoc.documentNumber}</div>
          </div>
        </div>

        <hr className={s.divider} />

        {isServiceContent(orderDoc, content) && (
          <ServiceDocView doc={orderDoc} content={content} />
        )}
        {isPurchaseContent(orderDoc, content) && (
          <PurchaseDocView doc={orderDoc} content={content} />
        )}

        <div className={s.signature}>
          <div className={s.sigLine}>
            <div className={s.sigBox} />
            <div className={s.sigLabel}>Solicitante</div>
          </div>
          <div className={s.sigLine}>
            <div className={s.sigBox} />
            <div className={s.sigLabel}>Responsável / Aprovação</div>
          </div>
        </div>

        <div className={s.footer}>
          Documento gerado pelo SIGA — Sistema de Gestão Industrial · {orderDoc.documentNumber}
        </div>
      </div>
    </div>
  )
}

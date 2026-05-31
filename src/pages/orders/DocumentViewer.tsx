// src/pages/orders/DocumentViewer.tsx
// Official document renderer — Service Orders and Purchase Orders.
// Produces a print-ready, branded document for Pro Raça Rações.
// No internal system references are exposed in the rendered output.

import type { ReactNode } from 'react'
import type { OrderDocument, ServiceDocumentContent, PurchaseDocumentContent } from '@/types'
import {
  SERVICE_ORDER_STATUS_META, PURCHASE_ORDER_STATUS_META,
  PRIORITY_META, SERVICE_TYPE_META,
} from '@/types'
import { fmtCurrency, fmtDocDate } from '@/lib/document-generator'
import s from './DocumentViewer.module.css'

// ── Company identity ──────────────────────────────────────────
// To add a logo: replace <div className={s.logoPlaceholder}> with
// <img src={logoUrl} alt="Pro Raça Rações" className={s.logoImg} />

const COMPANY = {
  name:    'Pro Raça Rações',
  cnpj:    '08.474.088/0001-95',
  address: '',
  phone:   '',
}

// ── Type guards ───────────────────────────────────────────────

function isServiceContent(
  doc: OrderDocument,
  _c: ServiceDocumentContent | PurchaseDocumentContent,
): _c is ServiceDocumentContent {
  return doc.orderType === 'service'
}

function isPurchaseContent(
  doc: OrderDocument,
  _c: ServiceDocumentContent | PurchaseDocumentContent,
): _c is PurchaseDocumentContent {
  return doc.orderType === 'purchase'
}

// ── Shared primitives ─────────────────────────────────────────

function Row({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null
  return (
    <div className={s.row}>
      <span className={s.rowLabel}>{label}</span>
      <span className={s.rowValue}>{value}</span>
    </div>
  )
}

function StatusRow({ statusMeta }: { statusMeta: { label: string; color: string } }) {
  return (
    <div className={s.row}>
      <span className={s.rowLabel}>Status</span>
      <span className={s.rowValue}>
        <span
          className={s.statusDot}
          style={{ background: statusMeta.color }}
          aria-hidden="true"
        />
        {statusMeta.label}
      </span>
    </div>
  )
}

function PriorityRow({ priorityMeta }: { priorityMeta: { label: string; color: string } }) {
  return (
    <div className={s.row}>
      <span className={s.rowLabel}>Prioridade</span>
      <span className={s.rowValue}>
        <span
          className={s.statusDot}
          style={{ background: priorityMeta.color }}
          aria-hidden="true"
        />
        {priorityMeta.label}
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={s.section}>
      <div className={s.sectionTitle}>{title}</div>
      {children}
    </div>
  )
}

// ── Service Order body ────────────────────────────────────────

function ServiceDocBody({
  content,
  issuedAt,
}: {
  content:  ServiceDocumentContent
  issuedAt: string
}) {
  const statusMeta   = SERVICE_ORDER_STATUS_META[content.status]
    ?? { label: content.status, color: '#64748b' }
  const priorityMeta = content.priority
    ? (PRIORITY_META[content.priority] ?? { label: content.priority, color: '#64748b' })
    : undefined
  const typeMeta = SERVICE_TYPE_META[content.serviceType] ?? { label: content.serviceType }

  return (
    <>
      {/* 1 — Informações Gerais */}
      <Section title="Informações Gerais">
        <Row label="Número da O.S."  value={content.orderNumber} />
        <Row label="Data de Emissão" value={issuedAt} />
        <Row label="Solicitante"     value={content.requestedBy} />
        <Row label="Tipo de Serviço" value={typeMeta.label} />
        <StatusRow statusMeta={statusMeta} />
        {priorityMeta && <PriorityRow priorityMeta={priorityMeta} />}
      </Section>

      {/* 2 — Detalhes do Serviço */}
      <Section title="Detalhes do Serviço">
        <Row label="Assunto"             value={content.title} />
        <Row label="Técnico Responsável" value={content.technician} />
        <Row label="Data Prevista"       value={fmtDocDate(content.scheduledDate)} />
        <Row label="Data de Conclusão"   value={fmtDocDate(content.completedDate)} />
        {content.description && (
          <>
            <div className={s.descLabel}>Descrição</div>
            <p className={s.descText}>{content.description}</p>
          </>
        )}
      </Section>

      {/* 3 — Valores */}
      {content.cost != null && (
        <Section title="Valores">
          <Row label="Custo Estimado" value={fmtCurrency(content.cost)} />
        </Section>
      )}

      {/* 4 — Referências */}
      {(content.assetId || content.maintenanceId) && (
        <Section title="Referências">
          <Row label="Ativo / Equipamento" value={content.assetId} />
          <Row label="Ref. Manutenção"     value={content.maintenanceId} />
        </Section>
      )}

      {/* 5 — Observações */}
      {content.notes && (
        <Section title="Observações">
          <p className={s.descText}>{content.notes}</p>
        </Section>
      )}
    </>
  )
}

// ── Purchase Order body ───────────────────────────────────────

function PurchaseDocBody({
  content,
  issuedAt,
}: {
  content:  PurchaseDocumentContent
  issuedAt: string
}) {
  const statusMeta   = PURCHASE_ORDER_STATUS_META[content.status]
    ?? { label: content.status, color: '#64748b' }
  const priorityMeta = content.priority
    ? (PRIORITY_META[content.priority] ?? { label: content.priority, color: '#64748b' })
    : undefined

  return (
    <>
      {/* 1 — Informações Gerais */}
      <Section title="Informações Gerais">
        <Row label="Número do Pedido"   value={content.orderNumber} />
        <Row label="Data de Emissão"    value={issuedAt} />
        <Row label="Solicitante"        value={content.requestedBy} />
        <Row label="Setor / C. Custo"   value={content.sector} />
        <Row label="Categoria"          value={content.purchaseCategory} />
        <Row label="Prazo de Entrega"   value={fmtDocDate(content.deliveryDate)} />
        <StatusRow statusMeta={statusMeta} />
        {priorityMeta && <PriorityRow priorityMeta={priorityMeta} />}
      </Section>

      {/* 2 — Objeto da Compra */}
      <Section title="Objeto da Compra">
        <Row label="Assunto" value={content.title} />
        {content.description && (
          <>
            <div className={s.descLabel}>Justificativa</div>
            <p className={s.descText}>{content.description}</p>
          </>
        )}
      </Section>

      {/* 3 — Itens do Pedido */}
      <Section title="Itens do Pedido">
        <table className={s.itemsTable}>
          <thead>
            <tr>
              <th>Descrição</th>
              <th className={s.numCell}>Qtd</th>
              <th>Unid.</th>
              <th className={s.numCell}>Preço Unit.</th>
              <th className={s.numCell}>Total</th>
            </tr>
          </thead>
          <tbody>
            {content.items.map((item, i) => (
              <tr key={i}>
                <td>{item.description}</td>
                <td className={s.numCell}>{item.quantity}</td>
                <td>{item.unit}</td>
                <td className={s.numCell}>{fmtCurrency(item.unitPrice)}</td>
                <td className={s.numCell}>
                  {fmtCurrency(item.quantity * (item.unitPrice ?? 0))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className={s.totalLabel}>Valor Total</td>
              <td className={s.totalValue}>{fmtCurrency(content.totalValue)}</td>
            </tr>
          </tfoot>
        </table>
      </Section>

      {/* 4 — Fornecedor e Referências */}
      {(content.supplierId || content.assetId) && (
        <Section title="Fornecedor e Referências">
          <Row label="Fornecedor"  value={content.supplierId} />
          <Row label="Ativo / Bem" value={content.assetId} />
        </Section>
      )}

      {/* 5 — Observações */}
      {content.notes && (
        <Section title="Observações">
          <p className={s.descText}>{content.notes}</p>
        </Section>
      )}
    </>
  )
}

// ── Document Viewer ───────────────────────────────────────────

interface DocumentViewerProps {
  document: OrderDocument | null
  onClose:  () => void
}

function handlePrint() {
  const STYLE_ID = '__doc_print_isolation'
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        #doc-print-root, #doc-print-root * { visibility: visible !important; }
        #doc-print-root {
          position: fixed !important;
          inset: 0 !important;
          width: 100% !important;
          padding: 44px 52px 40px !important;
          margin: 0 !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          background: #fff !important;
        }
      }
    `
    document.head.appendChild(style)
  }
  window.print()
}

export default function DocumentViewer({ document: orderDoc, onClose }: DocumentViewerProps) {
  if (!orderDoc) return null

  const { content } = orderDoc

  const docTitle = orderDoc.orderType === 'service'
    ? 'Ordem de Serviço'
    : 'Ordem de Compra'

  const generatedAt = (() => {
    const d = orderDoc.createdAt
      ? new Date(orderDoc.createdAt as unknown as string)
      : new Date()
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  })()

  // Both content types expose orderNumber — safe to read via ServiceDocumentContent
  const orderNumber = (content as ServiceDocumentContent).orderNumber

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>

      {/* ── Controls bar (hidden at print time) ── */}
      <div className={s.controls}>
        <button className={s.printBtn} onClick={handlePrint}>
          🖨 Imprimir / Salvar PDF
        </button>
        <button className={s.closeBtn} onClick={onClose}>✕ Fechar</button>
      </div>

      {/* ══════════════════════════════════════════
          Printable document
      ══════════════════════════════════════════ */}
      <article id="doc-print-root" className={s.doc} aria-label={`${docTitle} ${orderDoc.documentNumber}`}>

        {/* ── Company letterhead ── */}
        <header className={s.letterhead}>

          {/* Left: logo + identity */}
          <div className={s.companyBlock}>
            {/*
              Logo placeholder.
              To use a real logo, replace the div below with:
              <img src={logoUrl} alt="Pro Raça Rações" className={s.logoImg} />
            */}
            <div className={s.logoPlaceholder} aria-hidden="true">PR</div>

            <div className={s.companyInfo}>
              <div className={s.companyName}>{COMPANY.name}</div>
              {COMPANY.cnpj    && <div className={s.companyDetail}>CNPJ: {COMPANY.cnpj}</div>}
              {COMPANY.address && <div className={s.companyDetail}>{COMPANY.address}</div>}
              {COMPANY.phone   && <div className={s.companyDetail}>Tel: {COMPANY.phone}</div>}
            </div>
          </div>

          {/* Right: document reference meta */}
          <div className={s.docMeta}>
            <div className={s.metaRow}>
              <span className={s.metaLabel}>Nº do Documento</span>
              <code className={s.metaCode}>{orderDoc.documentNumber}</code>
            </div>
            <div className={s.metaRow}>
              <span className={s.metaLabel}>Emitido em</span>
              <span className={s.metaValue}>{generatedAt}</span>
            </div>
          </div>
        </header>

        {/* ── Brand accent line — flows directly into title box (no gap) ── */}
        <div className={s.accentLine} aria-hidden="true" />

        {/* ── Document title block ── */}
        <div className={s.titleBlock}>
          <h1 className={s.docTitle}>{docTitle}</h1>
          <div className={s.titleMeta}>
            <code className={s.docCode}>{orderDoc.documentNumber}</code>
            {orderNumber && (
              <span className={s.orderRef}>Ref.: {orderNumber}</span>
            )}
          </div>
        </div>

        {/* ── Document body ── */}
        {isServiceContent(orderDoc, content) && (
          <ServiceDocBody content={content} issuedAt={generatedAt} />
        )}
        {isPurchaseContent(orderDoc, content) && (
          <PurchaseDocBody content={content} issuedAt={generatedAt} />
        )}

        {/* ── Signature area ── */}
        <div className={s.signature}>
          <div className={s.sigCol}>
            <div className={s.sigBox} />
            <div className={s.sigLabel}>Solicitante</div>
            <div className={s.sigDate}>Data: ____/____/________</div>
          </div>
          <div className={s.sigCol}>
            <div className={s.sigBox} />
            <div className={s.sigLabel}>Responsável Técnico</div>
            <div className={s.sigDate}>Data: ____/____/________</div>
          </div>
          <div className={s.sigCol}>
            <div className={s.sigBox} />
            <div className={s.sigLabel}>Aprovação / Diretoria</div>
            <div className={s.sigDate}>Data: ____/____/________</div>
          </div>
        </div>

        {/* ── Footer ── */}
        <footer className={s.footer}>
          <span>Documento gerado oficialmente pelo sistema interno</span>
          <span className={s.footerSep}>·</span>
          <span>{orderDoc.documentNumber}</span>
          <span className={s.footerSep}>·</span>
          <span>{generatedAt}</span>
        </footer>

      </article>
    </div>
  )
}

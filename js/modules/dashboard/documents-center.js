/**
 * documents-center.js — Documents Center panel
 *
 * Renders the full document list (SRV + PO) inside the dashboard.
 * Clicking a document opens the side panel with a preview.
 */

import { obterTodosDocumentos } from "../../core/db-compras.js";
import { formatarData, formatarMoeda } from "../../core/db-os.js";
import { abrirSidePanel } from "./dashboard-core.js";

let _toast = null;
let _todosDocumentos = [];
let _filtroAtivo = "all";

export async function iniciarDocumentosCenter(mostrarToast) {
  _toast = mostrarToast;
  _renderizarLoading();
  _configurarFiltros();

  try {
    _todosDocumentos = await Promise.race([
      obterTodosDocumentos(),
      new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), 8000)),
    ]);
    _renderizarListaDocs();
  } catch (err) {
    console.error("[DOC CENTER]", err);
    _renderizarErro(err.message);
  }
}

// ============================================================
// RENDER LIST
// ============================================================
function _renderizarLoading() {
  const el = document.getElementById("docs-lista-container");
  if (!el) return;
  el.innerHTML = `
    <div class="panel-loading">
      <div class="panel-spinner"></div>
      <span>Carregando documentos...</span>
    </div>`;
}

function _renderizarErro(msg) {
  const el = document.getElementById("docs-lista-container");
  if (!el) return;
  el.innerHTML = `
    <div class="panel-empty-state">
      <div class="panel-empty-icon">⚠️</div>
      <div class="panel-empty-title">Erro ao carregar documentos</div>
      <div class="panel-empty-sub">${msg || "Verifique a ligação."}</div>
    </div>`;
}

function _docsFiltrados() {
  if (_filtroAtivo === "srv") return _todosDocumentos.filter((d) => d.tipo === "service_report");
  if (_filtroAtivo === "po")  return _todosDocumentos.filter((d) => d.tipo === "purchase_document");
  return _todosDocumentos;
}

function _renderizarListaDocs() {
  const el = document.getElementById("docs-lista-container");
  if (!el) return;

  const lista = _docsFiltrados();

  _atualizarContadores();

  if (!lista.length) {
    el.innerHTML = `
      <div class="panel-empty-state">
        <div class="panel-empty-icon">📄</div>
        <div class="panel-empty-title">Nenhum documento encontrado</div>
        <div class="panel-empty-sub">Os documentos são gerados a partir das Ordens de Serviço e Pedidos de Compra.</div>
      </div>`;
    return;
  }

  el.innerHTML = lista.map((doc) => _docCardHtml(doc)).join("");
  el.addEventListener("click", _onDocListaClick);
}

function _onDocListaClick(e) {
  const card = e.target.closest(".doc-list-card");
  if (!card) return;
  const docId = card.dataset.docId;
  const doc   = _todosDocumentos.find((d) => d.id === docId);
  if (doc) _abrirDocSidePanel(doc);
}

function _docCardHtml(doc) {
  const sd     = doc.sourceData || {};
  const isSRV  = doc.tipo === "service_report";
  const label  = isSRV ? "📄 SRV — Serviço" : "🛒 PO — Compra";
  const titulo = isSRV
    ? (sd.title || sd.description || "Documento de Serviço")
    : (sd.justificativa || sd.titulo || "Pedido de Compra");
  const resumo = titulo.length > 90 ? titulo.substring(0, 90) + "…" : titulo;
  const data   = formatarData(doc.emitidoEm || doc.timestampEnvio);
  const total  = isSRV ? formatarMoeda(sd.totalCost) : formatarMoeda(sd.totalEstimado);

  return `
    <div class="doc-list-card tipo-${doc.tipo}" data-doc-id="${doc.id}">
      <div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="doc-list-numero">${doc.numero || doc.id.slice(-6).toUpperCase()}</span>
          <span class="badge-sm" style="${isSRV ? "background:#ede9fe;color:#5b21b6;" : "background:#fef3c7;color:#92400e;"}">${label}</span>
        </div>
        <div class="doc-list-titulo">${resumo}</div>
        <div class="doc-list-meta">📅 ${data} · ${doc.emissor || "Sistema"} · ${total}</div>
      </div>
      <div style="display:flex;align-items:center;">
        <button class="os-card-open-btn">Ver →</button>
      </div>
    </div>
  `;
}

// ============================================================
// FILTER BAR
// ============================================================
function _configurarFiltros() {
  const filterBtns = document.querySelectorAll(".docs-filter-btn");
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      _filtroAtivo = btn.dataset.filter;
      _renderizarListaDocs();
    });
  });
}

function _atualizarContadores() {
  const total = _todosDocumentos.length;
  const srv   = _todosDocumentos.filter((d) => d.tipo === "service_report").length;
  const po    = _todosDocumentos.filter((d) => d.tipo === "purchase_document").length;

  _setCont("cnt-docs-all", total);
  _setCont("cnt-docs-srv", srv);
  _setCont("cnt-docs-po",  po);
}

function _setCont(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ============================================================
// DOCUMENT SIDE PANEL
// ============================================================
function _abrirDocSidePanel(doc) {
  const panel    = document.getElementById("side-panel");
  const spTitle  = document.getElementById("sp-topbar-title");
  const spHeader = document.getElementById("sp-os-header");
  const spCtx    = document.getElementById("sp-contexto");
  const spDesc   = document.getElementById("sp-descricao");
  const spDados  = document.getElementById("sp-dados-especificos");
  const spMat    = document.getElementById("sp-materiais");
  const spTL     = document.getElementById("sp-timeline");
  const spStatus = document.getElementById("sp-status-change");
  const spFoot   = document.getElementById("sp-footer-actions");

  if (!panel) return;

  const isSRV = doc.tipo === "service_report";
  const sd    = doc.sourceData || {};
  const num   = doc.numero || doc.id.slice(-6).toUpperCase();
  const titulo = isSRV ? (sd.title || "Documento de Serviço") : (sd.justificativa || "Pedido de Compra");

  if (spTitle)  spTitle.textContent = num;
  if (spStatus) spStatus.innerHTML  = ""; // No status buttons for documents

  // Header
  if (spHeader) {
    const gradColor = isSRV ? "#5b21b6, #7c3aed" : "#d97706, #f59e0b";
    spHeader.innerHTML = `
      <div class="sp-doc-header" style="background:linear-gradient(135deg, ${gradColor});">
        <div class="sp-doc-tipo">${isSRV ? "📄 DOCUMENTO DE SERVIÇO" : "🛒 PEDIDO DE COMPRA"}</div>
        <div class="sp-doc-numero">${num}</div>
        <div class="sp-doc-titulo">${titulo}</div>
        <div class="sp-doc-badges">
          <span class="badge-sm" style="background:rgba(255,255,255,0.2);color:white;">Emitido em ${formatarData(doc.emitidoEm || doc.timestampEnvio)}</span>
          <span class="badge-sm" style="background:rgba(255,255,255,0.15);color:white;">Por: ${doc.emissor || "Sistema"}</span>
        </div>
      </div>
    `;
  }

  // Context
  if (spCtx) {
    if (isSRV) {
      spCtx.innerHTML = `
        <div class="sp-info-grid">
          <div class="sp-info-item"><span class="sp-info-label">Origem</span><span class="sp-info-valor">${sd.origin || "—"}${sd.originNome ? ` — ${sd.originNome}` : ""}</span></div>
          <div class="sp-info-item"><span class="sp-info-label">Setor</span><span class="sp-info-valor">${sd.sector || "—"}</span></div>
          <div class="sp-info-item"><span class="sp-info-label">Solicitante</span><span class="sp-info-valor">${sd.solicitante || "—"}</span></div>
          <div class="sp-info-item"><span class="sp-info-label">Responsável</span><span class="sp-info-valor">${sd.technician || sd.executor || "—"}</span></div>
        </div>
      `;
    } else {
      spCtx.innerHTML = `
        <div class="sp-info-grid">
          <div class="sp-info-item"><span class="sp-info-label">Categoria</span><span class="sp-info-valor">${sd.categoria || "—"}</span></div>
          <div class="sp-info-item"><span class="sp-info-label">Setor</span><span class="sp-info-valor">${sd.setor || "—"}</span></div>
          <div class="sp-info-item"><span class="sp-info-label">Solicitante</span><span class="sp-info-valor">${sd.solicitante || "—"}</span></div>
          <div class="sp-info-item"><span class="sp-info-label">Fornecedor</span><span class="sp-info-valor">${sd.fornecedor || "—"}</span></div>
        </div>
      `;
    }
  }

  // Description
  if (spDesc) {
    const descText = isSRV ? (sd.description || sd.observations || "—") : (sd.justificativa || "—");
    spDesc.innerHTML = `
      <div class="sp-info-item full">
        <span class="sp-info-label">${isSRV ? "Descrição" : "Justificativa"}</span>
        <span class="sp-info-valor" style="font-size:0.84rem;font-weight:400;line-height:1.6;color:#334155;">${descText}</span>
      </div>
    `;
  }

  // Dados específicos (hide for documents)
  if (spDados) spDados.innerHTML = "";

  // Materials / items
  if (spMat) {
    const mats = isSRV ? (sd.materials || []) : (sd.items || []);
    if (mats.length > 0) {
      spMat.classList.remove("modal-hidden");
      const rows = mats.map((m) => {
        const desc  = isSRV ? m.description : m.descricao;
        const qty   = isSRV ? m.quantity    : m.quantidade;
        const unit  = isSRV ? m.unitPrice   : m.precoUnitario;
        const total = isSRV ? m.totalPrice  : m.precoTotal;
        return `<tr><td>${desc}</td><td style="text-align:center;">${qty}</td><td style="text-align:right;">${formatarMoeda(unit)}</td><td style="text-align:right;font-weight:700;">${formatarMoeda(total)}</td></tr>`;
      }).join("");

      const totalGeral = isSRV ? sd.totalCost : sd.totalEstimado;
      spMat.innerHTML = `
        <table class="sp-mat-table">
          <thead><tr><th>Item</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="sp-cost-row" style="grid-template-columns:1fr 1fr;">
          ${isSRV ? `<div class="sp-cost-card"><div class="sp-cost-label">📦 Materiais</div><div class="sp-cost-value">${formatarMoeda(sd.materialsCost)}</div></div>
          <div class="sp-cost-card"><div class="sp-cost-label">👷 Mão de Obra</div><div class="sp-cost-value">${formatarMoeda(sd.laborCost)}</div></div>` : ""}
          <div class="sp-cost-card total" style="grid-column:1/-1;"><div class="sp-cost-label">💰 Total Geral</div><div class="sp-cost-value">${formatarMoeda(totalGeral)}</div></div>
        </div>
      `;
    } else {
      spMat.classList.add("modal-hidden");
    }
  }

  // Timeline (doc doesn't have one; show origin info instead)
  if (spTL) {
    const osId = doc.sourceId;
    spTL.innerHTML = osId
      ? `<li class="sp-timeline-item"><div class="sp-timeline-dot">🔗</div><div class="sp-timeline-info"><div class="sp-timeline-acao">Origem: ${doc.tipo === "service_report" ? "O.S" : "Pedido de Compra"} #${osId.slice(-6).toUpperCase()}</div><div class="sp-timeline-meta">Documento gerado por ${doc.emissor || "Sistema"}</div></div></li>`
      : `<li class="sp-timeline-item"><div class="sp-timeline-dot">📄</div><div class="sp-timeline-info"><div class="sp-timeline-acao">Documento gerado</div><div class="sp-timeline-meta">${doc.emissor || "Sistema"}</div></div></li>`;
  }

  // Footer — Print button only
  if (spFoot) {
    const btnDoc  = document.getElementById("sp-btn-gerar-doc");
    const btnPO   = document.getElementById("sp-btn-criar-po");
    if (btnDoc) btnDoc.classList.add("modal-hidden");
    if (btnPO)  btnPO.classList.add("modal-hidden");
  }

  abrirSidePanel();
}

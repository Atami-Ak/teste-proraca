/**
 * os-center.js — OS Control Center
 *
 * Manages:
 *  - OS list rendering with filter bar
 *  - OS side panel (full details, status change, timeline, doc gen, PO creation)
 *  - Create OS modal with full form
 *  - materiais array declared at module top level to avoid TDZ bug
 */

import {
  criarOS,
  atualizarOS,
  adicionarLog,
  gerarDocumentoServico,
  criarPedidoFromOS,
  OS_TIPOS,
  OS_STATUS,
  OS_PRIORIDADE,
  OS_ORIGEM,
  SERVICE_CATEGORIAS,
  OS_MANUTENCAO_TIPO,
  formatarData,
  formatarMoeda,
} from "../../core/db-os.js";

import { abrirSidePanel, fecharSidePanel } from "./dashboard-core.js";

// ============================================================
// MODULE-LEVEL STATE
// CRITICAL: materiais MUST be declared here, before ANY function
// that references it. This prevents the TDZ "before initialization" bug.
// ============================================================
let materiais = [];
let osAtual = null;
let _perfil = null;
let _toast  = null;
let _todosOS = [];
let _filtroAtivo = "all";
let _termoBusca  = "";

// ============================================================
// INIT
// ============================================================
export function iniciarOSCenter(rawWorkOrders, perfil, mostrarToast) {
  _perfil = perfil;
  _toast  = mostrarToast;
  _todosOS = rawWorkOrders || [];

  _renderizarListaOS();
  _configurarFiltros();
  _configurarCriarOSModal();
  _configurarSidePanel();

  // "Nova O.S" button inside OS panel
  const btnNova = document.getElementById("btn-nova-os-panel");
  btnNova?.addEventListener("click", () => _abrirCriarModal());

  // Listen for pre-filled OS creation from fleet/cleaning panels
  document.addEventListener("siga:criar-os", (e) => {
    _abrirCriarModalPrefill(e.detail || {});
  });
}

// ============================================================
// OS LIST
// ============================================================
function _osVisiveis() {
  let lista = [..._todosOS];

  // Filter by status/priority
  if (_filtroAtivo === "open")        lista = lista.filter((o) => ["open", "pending"].includes(o.status));
  else if (_filtroAtivo === "in_progress") lista = lista.filter((o) => o.status === "in_progress");
  else if (_filtroAtivo === "critica")     lista = lista.filter((o) => o.prioridade === "critica" || o.priority === "critica");
  else if (_filtroAtivo === "completed")   lista = lista.filter((o) => o.status === "completed");

  // Search filter
  if (_termoBusca) {
    const q = _termoBusca.toLowerCase();
    lista = lista.filter((o) =>
      (o.title || "").toLowerCase().includes(q) ||
      (o.numero || "").toLowerCase().includes(q) ||
      (o.originNome || "").toLowerCase().includes(q) ||
      (o.sector || "").toLowerCase().includes(q)
    );
  }

  return lista;
}

function _renderizarListaOS() {
  const container = document.getElementById("os-lista-container");
  if (!container) return;

  const lista = _osVisiveis();

  _atualizarContadoresFiltros();

  if (!lista.length) {
    container.innerHTML = `
      <div class="panel-empty-state">
        <div class="panel-empty-icon">📋</div>
        <div class="panel-empty-title">Nenhuma O.S encontrada</div>
        <div class="panel-empty-sub">Tente ajustar os filtros ou crie uma nova O.S.</div>
      </div>`;
    return;
  }

  container.innerHTML = lista.map((os) => _osCardHtml(os)).join("");

  // Delegate click events to cards and buttons
  container.addEventListener("click", _onListaClick);
}

function _onListaClick(e) {
  const card = e.target.closest(".os-card");
  if (!card) return;

  const osId = card.dataset.osId;
  const os   = _todosOS.find((o) => o.id === osId);
  if (!os) return;

  _abrirSidePanelOS(os);
}

function _osCardHtml(os) {
  const numero    = os.numero || os.id.substring(0, 8).toUpperCase();
  const statusCls = `status-${os.status}`;
  const priorCls  = (os.prioridade === "critica" || os.priority === "critica") ? "priority-critica"
                  : (os.priority === "high") ? "priority-high" : "";
  const tipoLabel = OS_TIPOS[os.type] || os.type || "—";
  const statusLabel = OS_STATUS[os.status] || os.status || "—";
  const priorLabel  = OS_PRIORIDADE[os.priority] || os.priority || "—";
  const origem = os.originNome ? `${OS_ORIGEM[os.origin] || os.origin || "Manual"} — ${os.originNome}` : (OS_ORIGEM[os.origin] || os.origin || "Manual");
  const data = formatarData(os.createdAt || os.timestampEnvio);

  return `
    <div class="os-card ${statusCls} ${priorCls}" data-os-id="${os.id}">
      <div>
        <div class="os-card-top">
          <span class="os-card-numero">#${numero}</span>
          <span class="badge-sm tipo-${os.type}">${tipoLabel}</span>
          <span class="badge-sm status-${os.status}">${statusLabel}</span>
          ${os.prioridade === "critica" || os.priority === "critica" ? '<span class="badge-sm priority-critica">🔴 Crítica</span>' : ""}
        </div>
        <div class="os-card-titulo">${os.title || "Sem título"}</div>
        <div class="os-card-meta">
          <span class="os-card-meta-item">⚙️ ${origem}</span>
          <span class="os-card-meta-item">📂 ${os.sector || "—"}</span>
          <span class="os-card-meta-item">📅 ${data}</span>
          ${os.solicitante ? `<span class="os-card-meta-item">👤 ${os.solicitante}</span>` : ""}
        </div>
      </div>
      <div class="os-card-actions">
        <button class="os-card-open-btn">Detalhes →</button>
        ${os.documentoNumero ? `<span class="badge-sm" style="background:#f3e8ff;color:#6b21a8;">📄 ${os.documentoNumero}</span>` : ""}
      </div>
    </div>
  `;
}

// ============================================================
// FILTER BAR
// ============================================================
function _configurarFiltros() {
  const filterBtns = document.querySelectorAll(".os-filter-btn");
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      _filtroAtivo = btn.dataset.filter;
      _renderizarListaOS();
    });
  });

  const searchInput = document.getElementById("os-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      _termoBusca = e.target.value.trim();
      _renderizarListaOS();
    });
  }
}

function _atualizarContadoresFiltros() {
  const total  = _todosOS.length;
  const abertos = _todosOS.filter((o) => ["open", "pending"].includes(o.status)).length;
  const andamento = _todosOS.filter((o) => o.status === "in_progress").length;
  const criticas = _todosOS.filter((o) => o.prioridade === "critica" || o.priority === "critica").length;
  const concluidas = _todosOS.filter((o) => o.status === "completed").length;

  _setCont("cnt-all",        total);
  _setCont("cnt-open",       abertos);
  _setCont("cnt-in_progress",andamento);
  _setCont("cnt-critica",    criticas);
  _setCont("cnt-completed",  concluidas);
}

function _setCont(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ============================================================
// OS SIDE PANEL
// ============================================================
function _configurarSidePanel() {
  // Status change buttons
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-status-change");
    if (!btn || !osAtual) return;
    _alterarStatus(osAtual.id, btn.dataset.status);
  });

  // Generate document button
  document.getElementById("sp-btn-gerar-doc")?.addEventListener("click", () => {
    if (osAtual) _gerarDocumento(osAtual);
  });

  // Create PO button
  document.getElementById("sp-btn-criar-po")?.addEventListener("click", () => {
    if (osAtual) _criarPedidoCompra(osAtual);
  });
}

function _abrirSidePanelOS(os) {
  osAtual = os;
  const panel = document.getElementById("side-panel");
  if (!panel) return;

  // Populate side panel content
  _renderSidePanelOS(os);
  abrirSidePanel();
}

function _renderSidePanelOS(os) {
  const numero = os.numero || os.id.substring(0, 8).toUpperCase();
  const statusLabel = OS_STATUS[os.status] || os.status;
  const priorLabel  = OS_PRIORIDADE[os.priority] || os.priority;

  // Header
  const headerEl = document.getElementById("sp-os-header");
  if (headerEl) {
    headerEl.innerHTML = `
      <div class="sp-doc-header">
        <div class="sp-doc-tipo">${os.type === "maintenance" ? "🔧 MANUTENÇÃO" : "🛠️ SERVIÇO"}</div>
        <div class="sp-doc-numero">#${numero}</div>
        <div class="sp-doc-titulo">${os.title || "Sem título"}</div>
        <div class="sp-doc-badges">
          <span class="badge-sm status-${os.status}" style="background:rgba(255,255,255,0.2);color:white;">${statusLabel}</span>
          <span class="badge-sm" style="background:rgba(255,255,255,0.15);color:white;">${priorLabel}</span>
          ${os.documentoNumero ? `<span class="badge-sm" style="background:rgba(255,255,255,0.2);color:white;">📄 ${os.documentoNumero}</span>` : ""}
        </div>
      </div>
    `;
  }

  // Status change
  const statusEl = document.getElementById("sp-status-change");
  if (statusEl) {
    statusEl.innerHTML = `
      <div class="status-change-row">
        <button class="btn-status-change ${os.status === "open" ? "ativo" : ""}" data-status="open">🔵 Aberta</button>
        <button class="btn-status-change ${os.status === "in_progress" ? "ativo" : ""}" data-status="in_progress">🟡 Em Andamento</button>
        <button class="btn-status-change ${os.status === "completed" ? "ativo" : ""}" data-status="completed">🟢 Concluída</button>
      </div>
    `;
  }

  // Contexto operacional
  const ctxEl = document.getElementById("sp-contexto");
  if (ctxEl) {
    const origem = `${OS_ORIGEM[os.origin] || os.origin || "Manual"}${os.originNome ? ` — ${os.originNome}` : ""}`;
    ctxEl.innerHTML = `
      <div class="sp-info-grid">
        <div class="sp-info-item"><span class="sp-info-label">Origem</span><span class="sp-info-valor">${origem}</span></div>
        <div class="sp-info-item"><span class="sp-info-label">Ativo / ID</span><span class="sp-info-valor">${os.originId || "—"}</span></div>
        <div class="sp-info-item"><span class="sp-info-label">Setor</span><span class="sp-info-valor">${os.sector || "—"}</span></div>
        <div class="sp-info-item"><span class="sp-info-label">Solicitante</span><span class="sp-info-valor">${os.solicitante || "—"}</span></div>
        <div class="sp-info-item"><span class="sp-info-label">Criado em</span><span class="sp-info-valor">${formatarData(os.createdAt || os.timestampEnvio)}</span></div>
        <div class="sp-info-item"><span class="sp-info-label">Criado por</span><span class="sp-info-valor">${os.criadoPor || "—"}</span></div>
      </div>
    `;
  }

  // Descrição técnica
  const descEl = document.getElementById("sp-descricao");
  if (descEl) {
    descEl.innerHTML = `
      <div class="sp-info-item full" style="margin-bottom:8px;">
        <span class="sp-info-label">Descrição</span>
        <span class="sp-info-valor" style="font-size:0.84rem;font-weight:400;line-height:1.6;color:#334155;">${os.description || "Sem descrição."}</span>
      </div>
    `;
  }

  // Dados específicos (maintenance vs service)
  const dadosEl = document.getElementById("sp-dados-especificos");
  if (dadosEl) {
    if (os.type === "maintenance") {
      const downtimeHtml = os.downtime
        ? `<span class="sp-downtime">⛔ Equipamento Parado</span>`
        : `<span class="sp-downtime ok">✅ Sem Parada de Produção</span>`;
      dadosEl.innerHTML = `
        <div class="sp-info-grid">
          <div class="sp-info-item"><span class="sp-info-label">Tipo</span><span class="sp-info-valor">${OS_MANUTENCAO_TIPO[os.maintenanceType] || "—"}</span></div>
          <div class="sp-info-item"><span class="sp-info-label">Técnico</span><span class="sp-info-valor">${os.technician || "—"}</span></div>
          <div class="sp-info-item full"><span class="sp-info-label">Impacto</span><span class="sp-info-valor">${downtimeHtml}</span></div>
          ${os.observations ? `<div class="sp-info-item full"><span class="sp-info-label">Obs.</span><span class="sp-info-valor">${os.observations}</span></div>` : ""}
        </div>
      `;
    } else if (os.type === "service") {
      dadosEl.innerHTML = `
        <div class="sp-info-grid">
          <div class="sp-info-item"><span class="sp-info-label">Categoria</span><span class="sp-info-valor">${SERVICE_CATEGORIAS[os.serviceCategory] || "—"}</span></div>
          <div class="sp-info-item"><span class="sp-info-label">Executor</span><span class="sp-info-valor">${os.executor || "—"}</span></div>
          <div class="sp-info-item"><span class="sp-info-label">Início</span><span class="sp-info-valor">${os.startDate || "—"}</span></div>
          <div class="sp-info-item"><span class="sp-info-label">Término</span><span class="sp-info-valor">${os.endDate || "—"}</span></div>
          ${os.observations ? `<div class="sp-info-item full"><span class="sp-info-label">Obs.</span><span class="sp-info-valor">${os.observations}</span></div>` : ""}
        </div>
      `;
    }
  }

  // Materials & costs
  const matEl = document.getElementById("sp-materiais");
  if (matEl) {
    const mats = os.materials || [];
    if (mats.length > 0) {
      matEl.classList.remove("modal-hidden");
      const rows = mats.map((m) => `
        <tr>
          <td>${m.description}</td>
          <td style="text-align:center;">${m.quantity}</td>
          <td style="text-align:right;">${formatarMoeda(m.unitPrice)}</td>
          <td style="text-align:right;font-weight:700;">${formatarMoeda(m.totalPrice)}</td>
        </tr>
      `).join("");
      matEl.innerHTML = `
        <table class="sp-mat-table">
          <thead><tr><th>Material</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="sp-cost-row">
          <div class="sp-cost-card"><div class="sp-cost-label">📦 Materiais</div><div class="sp-cost-value">${formatarMoeda(os.materialsCost)}</div></div>
          <div class="sp-cost-card"><div class="sp-cost-label">👷 Mão de Obra</div><div class="sp-cost-value">${formatarMoeda(os.laborCost)}</div></div>
          <div class="sp-cost-card total"><div class="sp-cost-label">💰 Total</div><div class="sp-cost-value">${formatarMoeda(os.totalCost)}</div></div>
        </div>
      `;
    } else {
      matEl.classList.add("modal-hidden");
    }
  }

  // Timeline
  const timelineEl = document.getElementById("sp-timeline");
  if (timelineEl) {
    const tl = os.timeline || [];
    if (!tl.length) {
      timelineEl.innerHTML = `<li class="sp-timeline-item"><div class="sp-timeline-dot">📋</div><div class="sp-timeline-info"><div class="sp-timeline-acao">Nenhum evento registrado.</div></div></li>`;
    } else {
      timelineEl.innerHTML = [...tl]
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .map((ev) => `
          <li class="sp-timeline-item">
            <div class="sp-timeline-dot">${ev.icone || "📝"}</div>
            <div class="sp-timeline-info">
              <div class="sp-timeline-acao">${ev.acao}</div>
              <div class="sp-timeline-meta">${ev.usuario} · ${formatarData(ev.timestamp)}</div>
            </div>
          </li>
        `).join("");
    }
  }

  // Action buttons
  const btnDoc = document.getElementById("sp-btn-gerar-doc");
  const btnPO  = document.getElementById("sp-btn-criar-po");

  if (btnDoc) {
    if (os.type === "service" && !os.documentoNumero) {
      btnDoc.classList.remove("modal-hidden");
      btnDoc.disabled = false;
      btnDoc.textContent = "📄 Gerar Documento SRV";
    } else if (os.documentoNumero) {
      btnDoc.classList.remove("modal-hidden");
      btnDoc.disabled = true;
      btnDoc.textContent = `📄 ${os.documentoNumero} (gerado)`;
    } else {
      btnDoc.classList.add("modal-hidden");
    }
  }

  if (btnPO) {
    const temMateriais = (os.materials || []).length > 0;
    if (os.type === "service" && temMateriais && !os.pedidoCompraId) {
      btnPO.classList.remove("modal-hidden");
      btnPO.disabled = false;
    } else {
      btnPO.classList.add("modal-hidden");
    }
  }

  // Update topbar title of side panel
  const spTitle = document.getElementById("sp-topbar-title");
  if (spTitle) spTitle.textContent = `O.S #${numero}`;
}

// ============================================================
// INLINE ACTIONS
// ============================================================
async function _alterarStatus(id, novoStatus) {
  if (!osAtual || osAtual.status === novoStatus) return;
  try {
    await atualizarOS(id, { status: novoStatus });
    await adicionarLog(id, `Status → ${OS_STATUS[novoStatus]}`, _perfil.nome, "🔄");
    osAtual.status = novoStatus;
    // Update in-memory list
    const idx = _todosOS.findIndex((o) => o.id === id);
    if (idx >= 0) _todosOS[idx].status = novoStatus;
    // Re-render status buttons
    document.querySelectorAll(".btn-status-change").forEach((b) => {
      b.classList.toggle("ativo", b.dataset.status === novoStatus);
    });
    // Re-render the list card
    _renderizarListaOS();
    _toast(`Status: ${OS_STATUS[novoStatus]}`, "sucesso");
  } catch (err) {
    console.error(err);
    _toast("Erro ao atualizar status.", "erro");
  }
}

async function _gerarDocumento(os) {
  const btn = document.getElementById("sp-btn-gerar-doc");
  if (btn) { btn.disabled = true; btn.textContent = "Gerando..."; }
  try {
    const res = await gerarDocumentoServico(os.id, os, _perfil.nome);
    osAtual.documentoNumero = res.numero;
    osAtual.documentoId     = res.id;
    const idx = _todosOS.findIndex((o) => o.id === os.id);
    if (idx >= 0) { _todosOS[idx].documentoNumero = res.numero; _todosOS[idx].documentoId = res.id; }
    if (btn) { btn.textContent = `📄 ${res.numero} (gerado)`; }
    _renderizarListaOS();
    _toast(`Documento ${res.numero} gerado!`, "sucesso");
    // Refresh timeline in side panel
    const osAtualizado = _todosOS.find((o) => o.id === os.id) || os;
    _abrirSidePanelOS({ ...osAtual, ...osAtualizado });
  } catch (err) {
    console.error(err);
    _toast("Erro ao gerar documento.", "erro");
    if (btn) { btn.disabled = false; btn.textContent = "📄 Gerar Documento SRV"; }
  }
}

async function _criarPedidoCompra(os) {
  if (!confirm(`Criar Pedido de Compra a partir dos ${(os.materials || []).length} materiais desta O.S?`)) return;
  const btn = document.getElementById("sp-btn-criar-po");
  if (btn) { btn.disabled = true; btn.textContent = "Criando..."; }
  try {
    const poId = await criarPedidoFromOS(os.id, os, _perfil.nome);
    osAtual.pedidoCompraId = poId;
    const idx = _todosOS.findIndex((o) => o.id === os.id);
    if (idx >= 0) _todosOS[idx].pedidoCompraId = poId;
    if (btn) { btn.classList.add("modal-hidden"); }
    _toast("Pedido de Compra criado!", "sucesso");
  } catch (err) {
    console.error(err);
    _toast("Erro ao criar pedido.", "erro");
    if (btn) { btn.disabled = false; btn.textContent = "🛒 Criar Pedido de Compra"; }
  }
}

// ============================================================
// CREATE OS MODAL
// ============================================================
function _abrirCriarModal() {
  // Reset state before opening
  materiais = [];
  const modal = document.getElementById("modal-criar-os");
  if (!modal) return;

  // Clear form
  const form = document.getElementById("form-criar-os");
  if (form) form.reset();

  // Reset materials list (keep one empty row)
  const matList = document.getElementById("modal-mat-lista");
  if (matList) matList.innerHTML = "";
  _adicionarLinhaModal(); // first empty row

  // Reset cost display
  _recalcularCustosModal();

  // Show/hide conditional sections
  _mostrarSecaoModalTipo("");

  modal.classList.add("visible");
}

function _fecharCriarModal() {
  document.getElementById("modal-criar-os")?.classList.remove("visible");
  materiais = []; // Reset on close
}

function _abrirCriarModalPrefill(data) {
  _abrirCriarModal();
  // Pre-fill form fields after the reset settles (next animation frame)
  requestAnimationFrame(() => {
    if (data.tipo) {
      const el = document.getElementById("modal-os-tipo");
      if (el) { el.value = data.tipo; _mostrarSecaoModalTipo(data.tipo); }
    }
    if (data.origin) {
      const el = document.getElementById("modal-os-origem");
      if (el) el.value = data.origin;
    }
    if (data.originNome) {
      const el = document.getElementById("modal-os-origin-nome");
      if (el) el.value = data.originNome;
    }
    if (data.titulo) {
      const el = document.getElementById("modal-os-titulo");
      if (el) el.value = data.titulo;
    }
  });
}

function _configurarCriarOSModal() {
  // Open button (top bar FAB)
  document.getElementById("btn-fab-nova-os")?.addEventListener("click", () => _abrirCriarModal());

  // Close button
  document.getElementById("modal-criar-os-close")?.addEventListener("click", _fecharCriarModal);
  document.getElementById("modal-criar-os-cancel")?.addEventListener("click", _fecharCriarModal);

  // Close on overlay click
  document.getElementById("modal-criar-os")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-criar-os") _fecharCriarModal();
  });

  // Type change
  document.getElementById("modal-os-tipo")?.addEventListener("change", (e) => {
    _mostrarSecaoModalTipo(e.target.value);
  });

  // Add material button
  document.getElementById("modal-btn-add-mat")?.addEventListener("click", () => _adicionarLinhaModal());

  // Labor cost input
  document.getElementById("modal-labor-cost")?.addEventListener("input", _recalcularCustosModal);

  // Submit
  document.getElementById("form-criar-os")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await _salvarNovaOS();
  });
}

function _mostrarSecaoModalTipo(tipo) {
  document.getElementById("modal-secao-manutencao")?.classList.toggle("modal-hidden", tipo !== "maintenance");
  document.getElementById("modal-secao-servico")?.classList.toggle("modal-hidden", tipo !== "service");
}

function _adicionarLinhaModal(desc = "", qty = 1, unitPrice = 0) {
  // SAFE: materiais is always initialized at module level before this runs
  const idx = materiais.length;
  materiais.push({ desc, qty, unitPrice, total: 0 });

  const lista = document.getElementById("modal-mat-lista");
  if (!lista) return;

  const row = document.createElement("div");
  row.className = "modal-mat-row";
  row.dataset.idx = idx;
  row.innerHTML = `
    <input type="text"   class="mat-desc" placeholder="Descrição" value="${desc}" />
    <input type="number" class="mat-qty"  placeholder="Qtd" min="1" value="${qty}" />
    <input type="number" class="mat-unit" placeholder="Unit R$" min="0" step="0.01" value="${unitPrice > 0 ? unitPrice : ""}" />
    <input type="text"   class="mat-total" readonly placeholder="0,00" />
    <button type="button" class="btn-mat-remove" title="Remover">✕</button>
  `;

  row.querySelector(".mat-qty").addEventListener("input",  () => _atualizarLinhaModal(row, idx));
  row.querySelector(".mat-unit").addEventListener("input", () => _atualizarLinhaModal(row, idx));
  row.querySelector(".btn-mat-remove").addEventListener("click", () => {
    row.remove();
    materiais[idx] = null;
    _recalcularCustosModal();
  });

  lista.appendChild(row);
  _atualizarLinhaModal(row, idx);
}

function _atualizarLinhaModal(row, idx) {
  const qty   = parseFloat(row.querySelector(".mat-qty").value)  || 0;
  const unit  = parseFloat(row.querySelector(".mat-unit").value) || 0;
  const total = qty * unit;
  row.querySelector(".mat-total").value = total.toFixed(2).replace(".", ",");
  if (materiais[idx] !== null) {
    materiais[idx] = { desc: row.querySelector(".mat-desc").value, qty, unitPrice: unit, total };
  }
  _recalcularCustosModal();
}

function _recalcularCustosModal() {
  const matTotal = materiais.filter(Boolean).reduce((s, m) => s + (m.total || 0), 0);
  const labor    = parseFloat(document.getElementById("modal-labor-cost")?.value || 0) || 0;
  const grand    = matTotal + labor;

  const elMat   = document.getElementById("modal-display-mat");
  const elLabor = document.getElementById("modal-display-labor");
  const elTotal = document.getElementById("modal-display-total");

  if (elMat)   elMat.textContent   = `R$ ${matTotal.toFixed(2).replace(".", ",")}`;
  if (elLabor) elLabor.textContent = `R$ ${labor.toFixed(2).replace(".", ",")}`;
  if (elTotal) elTotal.textContent = `R$ ${grand.toFixed(2).replace(".", ",")}`;
}

function _coletarMateriais() {
  return materiais
    .filter(Boolean)
    .filter((m) => m.desc && m.qty > 0)
    .map((m) => ({
      description: m.desc,
      quantity:    m.qty,
      unitPrice:   m.unitPrice,
      totalPrice:  m.total,
    }));
}

async function _salvarNovaOS() {
  const g = (id) => document.getElementById(id);

  const tipo        = g("modal-os-tipo")?.value;
  const title       = g("modal-os-titulo")?.value.trim();
  const description = g("modal-os-descricao")?.value.trim();
  const sector      = g("modal-os-setor")?.value;
  const priority    = g("modal-os-prioridade")?.value;
  const origin      = g("modal-os-origem")?.value;
  const originNome  = g("modal-os-origin-nome")?.value.trim();
  const solicitante = g("modal-os-solicitante")?.value.trim();

  if (!tipo || !title || !description || !sector) {
    _toast("Preencha os campos obrigatórios.", "erro");
    return;
  }

  const payload = {
    type: tipo,
    title,
    description,
    sector,
    priority: priority || "medium",
    origin:   origin   || "manual",
    originNome,
    solicitante,
    status: "open",
    criadoPor: _perfil.nome,
  };

  if (tipo === "maintenance") {
    payload.maintenanceType = g("modal-maint-type")?.value;
    payload.technician      = g("modal-maint-tech")?.value.trim();
    payload.downtime        = g("modal-maint-downtime")?.checked || false;
    payload.observations    = g("modal-maint-obs")?.value.trim();
  }

  if (tipo === "service") {
    const mats     = _coletarMateriais();
    const matsCost = mats.reduce((s, m) => s + (m.totalPrice || 0), 0);
    const labor    = parseFloat(g("modal-labor-cost")?.value || 0) || 0;
    payload.serviceCategory = g("modal-srv-category")?.value;
    payload.executor        = g("modal-srv-executor")?.value.trim();
    payload.startDate       = g("modal-srv-start")?.value;
    payload.endDate         = g("modal-srv-end")?.value;
    payload.materials       = mats;
    payload.laborCost       = labor;
    payload.materialsCost   = matsCost;
    payload.totalCost       = labor + matsCost;
    payload.observations    = g("modal-srv-obs")?.value.trim();
  }

  const btnSalvar = document.getElementById("modal-criar-os-save");
  if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.textContent = "Salvando..."; }

  try {
    const novoId = await criarOS(payload);
    const novaOS = { id: novoId, ...payload, timestampEnvio: Date.now(), timeline: [{ acao: "O.S criada", usuario: _perfil.nome, icone: "📋", timestamp: Date.now() }] };
    _todosOS.unshift(novaOS);
    _fecharCriarModal();
    _renderizarListaOS();
    _toast("O.S criada com sucesso!", "sucesso");
    // Optionally open side panel for the new OS
    _abrirSidePanelOS(novaOS);
  } catch (err) {
    console.error(err);
    _toast("Erro ao criar O.S.", "erro");
  } finally {
    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.textContent = "Salvar O.S"; }
  }
}

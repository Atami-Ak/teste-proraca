/**
 * dashboard-core.js — SIGA Industrial Control Center v3
 *
 * Entry point for the dashboard. Handles:
 *  - Auth guard
 *  - Panel switching
 *  - Sidebar / topbar / mobile hamburger
 *  - Refresh + 5s timeout
 *  - Toast notifications
 *  - Delegates rendering to sub-modules
 */

import { checkAuth, hasRole, logout, ROLES, ROLE_LABELS } from "../../core/db-auth.js";
import { carregarDashboard, formatarMoeda, formatarHoras } from "../../core/db-dashboard.js";
import { criarPedidoCompra, atualizarPedido, PO_CATEGORIAS } from "../../core/db-compras.js";
import { atualizarOS, adicionarLog } from "../../core/db-os.js";
import { statusMigracao, migrarHistoricoParaWorkOrders } from "../../core/db-bridge.js";

import { iniciarOSCenter }          from "./os-center.js";
import { iniciarDocumentosCenter }  from "./documents-center.js";
import { iniciarMachineryCenter }   from "./machinery-center.js";
import { iniciarFleetCenter }       from "./fleet-center.js";
import { iniciarCleaningCenter }    from "./cleaning-center.js";

// ============================================================
// AUTH
// ============================================================
const perfil = await checkAuth("dashboard");
if (!perfil) throw new Error("Unreachable — checkAuth already redirected");

if (perfil.role === ROLES.ADMIN) {
  document.body.classList.add("is-admin");
}

// Users that can see and act on approval queues
const isPrivileged = [ROLES.ADMIN, "purchasing"].includes(perfil.role);

// ============================================================
// TOAST (exported for sub-modules via callback)
// ============================================================
const toastEl = document.getElementById("toast");

export function mostrarToast(msg, tipo = "sucesso") {
  if (!toastEl) { console.warn("[TOAST]", msg); return; }
  toastEl.textContent = msg;
  toastEl.className = `toast ${tipo} show`;
  setTimeout(() => toastEl.classList.remove("show"), 3500);
}

// ============================================================
// DOM REFS
// ============================================================
const topbarTitle    = document.getElementById("topbar-title");
const topbarAvatar   = document.getElementById("topbar-avatar");
const timestampEl    = document.getElementById("dash-timestamp");
const btnRefresh     = document.getElementById("btn-refresh");
const btnLogout      = document.getElementById("btn-logout");
const btnHamburger   = document.getElementById("btn-hamburger");
const sidebar        = document.getElementById("dash-sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const sidePanelOverlay = document.getElementById("side-panel-overlay");

// ============================================================
// PANEL TITLES
// ============================================================
const PANEL_TITLES = {
  overview:   "Dashboard",
  os:         "Ordens de Serviço",
  maquinario: "Maquinário",
  compras:    "Pedidos de Compra",
  documentos: "Documentos",
  frota:      "Frota de Veículos",
  limpeza:    "Limpeza 5S",
  admin:      "Administração",
};

// ============================================================
// USER INFO
// ============================================================
(function iniciarUserInfo() {
  const inicial    = (perfil.nome || "U")[0].toUpperCase();
  const role       = ROLE_LABELS[perfil.role] || perfil.role;

  const sidebarAvatar = document.getElementById("sidebar-avatar");
  const sidebarName   = document.getElementById("sidebar-user-name");
  const sidebarRole   = document.getElementById("sidebar-user-role");

  if (sidebarAvatar) sidebarAvatar.textContent = inicial;
  if (sidebarName)   sidebarName.textContent   = perfil.nome || "—";
  if (sidebarRole)   sidebarRole.textContent   = role;
  if (topbarAvatar)  topbarAvatar.textContent  = inicial;
  if (topbarTitle)   topbarTitle.textContent   = "Dashboard";
})();

// ============================================================
// SIDEBAR — mobile toggle
// ============================================================
btnHamburger?.addEventListener("click", () => {
  sidebar.classList.toggle("open");
  sidebarOverlay.classList.toggle("visible");
});

sidebarOverlay?.addEventListener("click", () => {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("visible");
});

// ============================================================
// PANEL SWITCHING
// ============================================================
export function ativarPanel(panelId) {
  document.querySelectorAll(".sidebar-link[data-panel]").forEach((link) => {
    link.classList.toggle("active", link.dataset.panel === panelId);
  });
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  const target = document.getElementById(`panel-${panelId}`);
  if (target) target.classList.add("active");
  if (topbarTitle) topbarTitle.textContent = PANEL_TITLES[panelId] || "Dashboard";
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("visible");
  // Close any open side panel when switching panels
  fecharSidePanel();
}

document.querySelectorAll(".sidebar-link[data-panel]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    ativarPanel(link.dataset.panel);
  });
});

// Panel-link anchors (data-panel-link) inside overview content
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-panel-link]");
  if (el) { e.preventDefault(); ativarPanel(el.dataset.panelLink); }
});

// Secondary "Nova O.S" button on overview panel
document.getElementById("btn-fab-nova-os-overview")?.addEventListener("click", () => {
  // Activate OS panel then open create modal
  ativarPanel("os");
  // Small delay so the OS panel is visible when the modal opens
  setTimeout(() => document.getElementById("btn-nova-os-panel")?.click(), 80);
});

// Main FAB in topbar also goes to OS panel create modal
document.getElementById("btn-fab-nova-os")?.addEventListener("click", () => {
  ativarPanel("os");
  setTimeout(() => document.getElementById("btn-nova-os-panel")?.click(), 80);
});

// ============================================================
// SIDE PANEL — global open/close (used by sub-modules)
// ============================================================
export function abrirSidePanel() {
  sidePanelOverlay?.classList.add("visible");
  document.getElementById("side-panel")?.classList.add("open");
}

export function fecharSidePanel() {
  sidePanelOverlay?.classList.remove("visible");
  document.getElementById("side-panel")?.classList.remove("open");
}

sidePanelOverlay?.addEventListener("click", fecharSidePanel);
document.getElementById("side-panel-close")?.addEventListener("click", fecharSidePanel);

// ============================================================
// MAIN LOADER — 5s timeout guard
// ============================================================
let dadosGlobais = null;

async function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout (${ms / 1000}s): ${label}`)), ms)
    ),
  ]);
}

btnRefresh?.addEventListener("click", () => carregarTudo());
carregarTudo();
if (perfil.role === ROLES.ADMIN) iniciarAdminSection();
_configurarModalNovoPedido();

async function carregarTudo() {
  if (btnRefresh) {
    btnRefresh.disabled = true;
    btnRefresh.textContent = "↻ Carregando...";
  }

  // Show skeleton
  const skeleton = document.getElementById("overview-skeleton");
  const content  = document.getElementById("overview-content");
  if (skeleton) skeleton.classList.remove("hidden");
  if (content)  content.classList.add("hidden");

  try {
    const dados = await withTimeout(carregarDashboard(), 10000, "carregarDashboard");
    dadosGlobais = dados;

    renderOverview(dados);
    renderPanelOS(dados);
    renderPanelCompras(dados);
    atualizarBadgesSidebar(dados);
    _renderFilaAprovacaoPO(dados.rawPurchaseOrders || []);
    _renderFilaAprovacaoOS(dados.rawWorkOrders || []);

    // Sub-modules receive data
    iniciarMachineryCenter(dados.rawWorkOrders, mostrarToast, perfil);
    iniciarFleetCenter(dados, mostrarToast, perfil);
    iniciarCleaningCenter(dados, mostrarToast, perfil);
    renderPanelFrota(dados);
    renderPanelLimpeza(dados);

    // Documents and OS center fetch their own data (or use raw)
    iniciarOSCenter(dados.rawWorkOrders, perfil, mostrarToast);
    iniciarDocumentosCenter(mostrarToast);

    if (skeleton) skeleton.classList.add("hidden");
    if (content)  content.classList.remove("hidden");

    if (timestampEl) {
      const hora = new Date(dados.timestamp).toLocaleTimeString("pt-BR", {
        hour: "2-digit", minute: "2-digit",
      });
      timestampEl.textContent = `Atualizado às ${hora}`;
    }
  } catch (err) {
    console.error("[DASHBOARD] Erro:", err);
    mostrarToast("Erro ao carregar painel.", "erro");

    if (skeleton) {
      skeleton.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:#94a3b8;">
          <div style="font-size:3rem;margin-bottom:14px;">⚠️</div>
          <div style="font-size:1rem;font-weight:700;color:#475569;margin-bottom:8px;">Falha ao carregar indicadores</div>
          <div style="font-size:0.85rem;margin-bottom:20px;">${err.message || "Verifique a ligação."}</div>
          <button onclick="location.reload()" style="background:#0f4c75;color:white;border:none;padding:10px 22px;border-radius:8px;font-weight:700;cursor:pointer;">
            ↻ Recarregar
          </button>
        </div>
      `;
    }
  } finally {
    if (btnRefresh) {
      btnRefresh.disabled = false;
      btnRefresh.textContent = "↻ Atualizar";
    }
  }
}

// ============================================================
// RENDER — OVERVIEW
// ============================================================
function renderOverview(dados) {
  const wo    = dados.workOrders;
  const po    = dados.compras;
  const custos = dados.custos;
  const feed  = dados.atividadeRecente;

  const kpiRow = document.getElementById("kpi-row-main");
  if (kpiRow) {
    const dispTrend = wo.disponibilidade !== null
      ? (wo.disponibilidade >= 95 ? "ok" : wo.disponibilidade >= 80 ? "warn" : "danger")
      : "neutral";

    const limpTrend = dados.limpeza.tendencia !== null
      ? (dados.limpeza.tendencia >= 0 ? "ok" : "danger")
      : "neutral";

    kpiRow.innerHTML = `
      ${kpiCard("kpi-blue",   "📋", wo.abertas,     "O.S Abertas",      trendHtml(po.pendentes > 5 ? "warn" : "neutral", ""))}
      ${kpiCard("kpi-amber",  "🟡", wo.emAndamento, "Em Andamento",     "")}
      ${kpiCard("kpi-red",    "🔴", wo.criticas,    "Críticas",         trendHtml(wo.criticas > 3 ? "danger" : wo.criticas > 0 ? "warn" : "ok", wo.criticas > 0 ? `${wo.criticas} ativas` : "OK"))}
      ${kpiCard("kpi-green",  "🟢", wo.concluidas,  "Concluídas",       "")}
      ${kpiCard("kpi-amber",  "⏳", po.pendentes,   "POs Pendentes",    trendHtml(po.pendentes > 5 ? "danger" : po.pendentes > 2 ? "warn" : "ok", po.urgentes > 0 ? `${po.urgentes} urgentes` : ""))}
      ${kpiCard("kpi-cyan",   "⏱️", wo.mttr > 0 ? formatarHoras(wo.mttr) : "—", "MTTR (h)", "")}
      ${kpiCard("kpi-purple", "📈", wo.disponibilidade !== null ? `${wo.disponibilidade}%` : "—", "Disponibilidade", trendHtml(dispTrend, wo.disponibilidade !== null ? `${wo.disponibilidade}%` : "—"))}
      ${kpiCard("kpi-green",  "🧹", dados.limpeza.mediaGeral !== null ? dados.limpeza.mediaGeral.toFixed(1) : "—", "Score 5S (/10)", trendHtml(limpTrend, dados.limpeza.tendencia !== null ? (dados.limpeza.tendencia >= 0 ? `↑ +${Math.abs(dados.limpeza.tendencia).toFixed(1)}` : `↓ ${dados.limpeza.tendencia.toFixed(1)}`) : ""))}
    `;
  }

  renderAlertas(dados);
  renderFeed(feed, "feed-lista");
  renderCustos(custos);
  renderTopFalhas(dados.workOrders.topFalhas, "top-falhas-lista");
}

function kpiCard(colorClass, icon, value, label, trend) {
  return `
    <div class="kpi-card-v2 ${colorClass}">
      <div class="kpi-top"><div class="kpi-icon-circle">${icon}</div>${trend}</div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-label">${label}</div>
    </div>
  `;
}

function trendHtml(cls, label) {
  if (!label) return "";
  return `<span class="kpi-trend ${cls}">${label}</span>`;
}

// ============================================================
// RENDER — ALERTAS
// ============================================================
function renderAlertas(dados) {
  const el = document.getElementById("alertas-lista");
  if (!el) return;
  const alertas = [];

  if (dados.workOrders.criticas > 0) alertas.push({ tipo: "critical", texto: `${dados.workOrders.criticas} O.S crítica(s) em aberto`, link: "#", linkText: "Ver O.S", panel: "os" });
  if (dados.compras.urgentes > 0)    alertas.push({ tipo: "critical", texto: `${dados.compras.urgentes} PO(s) urgente(s) pendente(s)`, link: "#", linkText: "Ver Compras", panel: "compras" });
  if (dados.compras.pendentes > 0)   alertas.push({ tipo: "warning",  texto: `${dados.compras.pendentes} PO(s) aguardando aprovação`, link: "#", linkText: "Aprovar", panel: "compras" });
  if (dados.frota.taxaNaoConformidade > 15) alertas.push({ tipo: "critical", texto: `NC frota em ${dados.frota.taxaNaoConformidade}% — acima do limite`, link: "#", linkText: "Frota", panel: "frota" });
  else if (dados.frota.taxaNaoConformidade > 5) alertas.push({ tipo: "warning", texto: `NC frota em ${dados.frota.taxaNaoConformidade}% — atenção`, link: "#", linkText: "Frota", panel: "frota" });
  if (dados.limpeza.zonasCriticas.length > 0) alertas.push({ tipo: "warning", texto: `${dados.limpeza.zonasCriticas.length} zona(s) com score < 5`, link: "#", linkText: "Limpeza", panel: "limpeza" });

  if (alertas.length === 0) {
    el.innerHTML = `<div class="alert-item ok"><div class="alert-dot"></div><div class="alert-content"><div class="alert-text">✅ Sem alertas críticos</div><div class="alert-meta">Todos os indicadores dentro do esperado</div></div></div>`;
    return;
  }

  el.innerHTML = alertas.slice(0, 6).map((a) => `
    <div class="alert-item ${a.tipo}">
      <div class="alert-dot"></div>
      <div class="alert-content"><div class="alert-text">${a.texto}</div></div>
      <button class="alert-action" data-panel="${a.panel}">${a.linkText}</button>
    </div>
  `).join("");

  el.querySelectorAll(".alert-action[data-panel]").forEach((btn) => {
    btn.addEventListener("click", () => ativarPanel(btn.dataset.panel));
  });
}

// ============================================================
// RENDER — FEED
// ============================================================
const STATUS_LABELS = {
  open: "Aberta", pending: "Pendente", in_progress: "Em andamento",
  completed: "Concluída", cancelled: "Cancelada", approved: "Aprovado",
  ordered: "Em pedido", received: "Recebido",
};

function renderFeed(feed, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const feedCount = document.getElementById("feed-count");
  if (feedCount) feedCount.textContent = `${feed.length} eventos`;

  if (!feed.length) {
    el.innerHTML = `<div class="empty-state-sm"><div class="empty-icon">📭</div><p>Sem atividade recente.</p></div>`;
    return;
  }

  el.innerHTML = feed.map((item) => {
    const data = new Date(item.timestamp).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
    const dotClass = item.tipo === "work_order" ? "wo" : "po";
    const statusLabel = STATUS_LABELS[item.status] || item.status || "—";
    const panelTarget = item.tipo === "work_order" ? "os" : "compras";

    return `
      <div class="feed-item-v2 feed-clickable" data-panel="${panelTarget}" style="cursor:pointer;">
        <div class="feed-dot-v2 ${dotClass}">${item.icone || "📋"}</div>
        <div class="feed-body">
          <div class="feed-desc-v2">${item.descricao}</div>
          <div class="feed-meta-v2">${data}</div>
        </div>
        <span class="feed-status-badge">${statusLabel}</span>
      </div>
    `;
  }).join("");

  el.querySelectorAll(".feed-clickable[data-panel]").forEach((item) => {
    item.addEventListener("click", () => ativarPanel(item.dataset.panel));
  });
}

// ============================================================
// RENDER — CUSTOS
// ============================================================
function renderCustos(custos) {
  const max = Math.max(custos.manutencaoMes, custos.comprasMes, 1);
  const barrasEl = document.getElementById("custos-barras");
  if (barrasEl) {
    barrasEl.innerHTML = `
      ${barraHtml("🔧 Manutenção", custos.manutencaoMes, max, "")}
      ${barraHtml("🛒 Compras", custos.comprasMes, max, "compras")}
    `;
  }
  const totalEl = document.getElementById("custo-total-mes");
  if (totalEl) totalEl.textContent = formatarMoeda(custos.totalMes);

  const poBarrasEl = document.getElementById("po-custos-barras");
  if (poBarrasEl) {
    poBarrasEl.innerHTML = `
      ${barraHtml("Este mês", custos.comprasMes, Math.max(custos.comprasMes, custos.comprasTrimestre / 3, 1), "compras")}
      ${barraHtml("Trimestre", custos.comprasTrimestre, Math.max(custos.comprasMes * 3, custos.comprasTrimestre, 1), "compras")}
    `;
  }
  const poTotalEl = document.getElementById("po-custo-total");
  if (poTotalEl) poTotalEl.textContent = formatarMoeda(custos.totalMes);
}

function barraHtml(label, valor, max, extraClass) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  return `
    <div class="custo-bar-linha">
      <span class="custo-bar-label">${label}</span>
      <div class="custo-bar-track"><div class="custo-bar-fill ${extraClass}" style="width:${pct}%"></div></div>
      <span class="custo-bar-valor">${formatarMoeda(valor)}</span>
    </div>
  `;
}

// ============================================================
// RENDER — TOP FALHAS
// ============================================================
function renderTopFalhas(topFalhas, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!topFalhas || !topFalhas.length) {
    el.innerHTML = `<div class="empty-state-sm"><div class="empty-icon">✅</div><p>Sem falhas registadas.</p></div>`;
    return;
  }

  el.innerHTML = topFalhas.map((m, i) => {
    const posCls = i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : "";
    return `
      <div class="ranking-item-v2">
        <div class="ranking-pos-v2 ${posCls}">${i + 1}</div>
        <span class="ranking-nome-v2">${m.maquinaNome}</span>
        <span class="ranking-val-v2 danger">${m.falhas} falha${m.falhas !== 1 ? "s" : ""}</span>
      </div>
    `;
  }).join("");
}

// ============================================================
// RENDER — SIDEBAR BADGES
// ============================================================
function atualizarBadgesSidebar(dados) {
  const badgeOsCriticas = document.getElementById("badge-os-criticas");
  if (badgeOsCriticas) {
    badgeOsCriticas.textContent = dados.workOrders.criticas;
    badgeOsCriticas.classList.toggle("hidden", dados.workOrders.criticas === 0);
  }
  const badgePoPendentes = document.getElementById("badge-po-pendentes");
  if (badgePoPendentes) {
    badgePoPendentes.textContent = dados.compras.pendentes;
    badgePoPendentes.classList.toggle("hidden", dados.compras.pendentes === 0);
  }
}

// ============================================================
// RENDER — PANEL: ORDENS DE SERVIÇO (KPIs)
// ============================================================
function renderPanelOS(dados) {
  const wo  = dados.workOrders;
  const feed = dados.atividadeRecente;
  const el  = (id) => document.getElementById(id);

  if (el("os-kpi-abertas"))     el("os-kpi-abertas").textContent     = wo.abertas;
  if (el("os-kpi-andamento"))   el("os-kpi-andamento").textContent   = wo.emAndamento;
  if (el("os-kpi-criticas"))    el("os-kpi-criticas").textContent    = wo.criticas;
  if (el("os-kpi-concluidas"))  el("os-kpi-concluidas").textContent  = wo.concluidas;
  if (el("os-mttr"))            el("os-mttr").textContent            = wo.mttr > 0 ? formatarHoras(wo.mttr) : "—";
  if (el("os-disponibilidade")) el("os-disponibilidade").textContent = wo.disponibilidade !== null ? `${wo.disponibilidade}%` : "—";

  renderTopFalhas(wo.topFalhas, "os-top-falhas");

  const woFeed = feed.filter((f) => f.tipo === "work_order").slice(0, 8);
  renderFeed(woFeed.length ? woFeed : feed.slice(0, 6), "os-recent-feed");
}

// ============================================================
// RENDER — PANEL: COMPRAS
// ============================================================
function renderPanelCompras(dados) {
  const po  = dados.compras;
  const feed = dados.atividadeRecente;
  const el  = (id) => document.getElementById(id);

  if (el("po-kpi-pendentes"))  el("po-kpi-pendentes").textContent  = po.pendentes;
  if (el("po-kpi-aprovados"))  el("po-kpi-aprovados").textContent  = po.aprovados;
  if (el("po-kpi-empedido"))   el("po-kpi-empedido").textContent   = po.emPedido;
  if (el("po-kpi-urgentes"))   el("po-kpi-urgentes").textContent   = po.urgentes;
  if (el("po-avg-aprov"))      el("po-avg-aprov").textContent      = po.avgAprovacaoHoras > 0 ? formatarHoras(po.avgAprovacaoHoras) : "—";

  const trendEl = el("po-trend-pendentes");
  if (trendEl) {
    if (po.pendentes === 0)  { trendEl.textContent = "OK";   trendEl.className = "kpi-trend ok"; }
    else if (po.pendentes > 5){ trendEl.textContent = "Alta"; trendEl.className = "kpi-trend danger"; }
    else                     { trendEl.textContent = `${po.pendentes}p`; trendEl.className = "kpi-trend warn"; }
  }

  const poFeed = feed.filter((f) => f.tipo === "purchase_order").slice(0, 8);
  renderFeed(poFeed.length ? poFeed : feed.slice(0, 6), "po-recent-feed");
}

// ============================================================
// RENDER — PANEL: FROTA (KPI cards + top NCs ranking)
// ============================================================
function renderPanelFrota(dados) {
  const frota = dados.frota;
  const el    = (id) => document.getElementById(id);

  const rateEl = el("frota-nc-rate");
  if (rateEl) {
    rateEl.textContent = `${frota.taxaNaoConformidade}`;
    rateEl.style.color = frota.taxaNaoConformidade > 15 ? "#ef4444"
      : frota.taxaNaoConformidade > 5 ? "#f59e0b"
      : "#10b981";
  }
  const totalEl = el("frota-total-checklists");
  if (totalEl) totalEl.textContent = `${frota.totalChecklists} checklist(s)`;

  const listaEl = el("frota-veiculos-lista");
  if (listaEl) {
    if (!frota.veiculosCriticos.length) {
      listaEl.innerHTML = `<div class="empty-state-sm"><div class="empty-icon">✅</div><p>Sem veículos críticos.</p></div>`;
    } else {
      listaEl.innerHTML = frota.veiculosCriticos.map((v, i) => `
        <div class="ranking-item-v2">
          <div class="ranking-pos-v2 ${i === 0 ? "top1" : i === 1 ? "top2" : ""}">${i + 1}</div>
          <span class="ranking-nome-v2">🚛 ${v.veiculoNome}</span>
          <span class="ranking-val-v2 danger">${v.nc} NC</span>
        </div>
      `).join("");
    }
  }
}

// ============================================================
// RENDER — PANEL: LIMPEZA (score + zonas críticas KPI)
// ============================================================
function renderPanelLimpeza(dados) {
  const limpeza = dados.limpeza;
  const el      = (id) => document.getElementById(id);

  const scoreEl = el("limpeza-media-score");
  if (scoreEl) {
    if (limpeza.mediaGeral !== null) {
      scoreEl.textContent = limpeza.mediaGeral.toFixed(1);
      scoreEl.style.color = limpeza.mediaGeral >= 8 ? "#10b981" : limpeza.mediaGeral >= 5 ? "#f59e0b" : "#ef4444";
    } else {
      scoreEl.textContent = "—";
    }
  }
  const totalEl = el("limpeza-total-auditorias");
  if (totalEl) totalEl.textContent = `${limpeza.totalAuditorias} auditoria(s)`;

  const tendEl = el("limpeza-tendencia");
  if (tendEl && limpeza.tendencia !== null) {
    if (limpeza.tendencia > 0)      { tendEl.textContent = `↑ Melhoria +${limpeza.tendencia.toFixed(1)}`; tendEl.style.color = "#10b981"; }
    else if (limpeza.tendencia < 0) { tendEl.textContent = `↓ Queda ${limpeza.tendencia.toFixed(1)}`; tendEl.style.color = "#ef4444"; }
    else                             { tendEl.textContent = "→ Estável"; tendEl.style.color = "#94a3b8"; }
  }

  const zonasEl = el("limpeza-zonas-lista");
  if (zonasEl) {
    if (!limpeza.zonasCriticas.length) {
      zonasEl.innerHTML = `<div class="empty-state-sm"><div class="empty-icon">✅</div><p>Sem zonas críticas.</p></div>`;
    } else {
      zonasEl.innerHTML = `<div class="zona-grid-v2">
        ${limpeza.zonasCriticas.slice(0, 8).map((z) => `
          <div class="zona-card-v2 baixa">
            <span class="zona-nota-v2">${z.media.toFixed(1)}</span>
            <span class="zona-id-v2">${z.zonaId}</span>
          </div>
        `).join("")}
      </div>`;
    }
  }
}

// ============================================================
// ADMIN — MIGRATION
// ============================================================
async function iniciarAdminSection() {
  const statusEls = [
    document.getElementById("migracao-status"),
    document.getElementById("migracao-status-admin"),
  ].filter(Boolean);

  const btnMigrar      = document.getElementById("btn-migrar");
  const btnMigrarAdmin = document.getElementById("btn-migrar-admin");
  const progressoEl    = document.getElementById("migracao-progresso");
  const progressoAdminEl = document.getElementById("migracao-progresso-admin");

  try {
    const estado = await statusMigracao();
    const html = `Migração <strong>historico_manutencao → work_orders</strong><br>
      Total: <strong>${estado.totalLegacy}</strong> | Migrado: <strong>${estado.totalMigrado}</strong> | Pendentes: <strong style="color:${estado.pendentes > 0 ? "#f59e0b" : "#10b981"};">${estado.pendentes}</strong>`;
    statusEls.forEach((el) => { el.innerHTML = html; });

    const executar = async (btnEl, progressEl) => {
      if (!confirm(`Migrar ${estado.pendentes} registos pendentes?`)) return;
      btnEl.disabled = true;
      btnEl.textContent = "A migrar...";
      if (progressEl) progressEl.classList.remove("hidden");
      try {
        const res = await migrarHistoricoParaWorkOrders({
          onProgress: (cur, tot) => { if (progressEl) progressEl.textContent = `A processar ${cur} / ${tot}...`; },
        });
        if (progressEl) progressEl.textContent = `✅ Migrados: ${res.migrated} | Ignorados: ${res.skipped} | Erros: ${res.errors}`;
        btnEl.textContent = "✓ Migração concluída";
        mostrarToast("Migração concluída!", "sucesso");
      } catch (e) {
        if (progressEl) progressEl.textContent = `Erro: ${e.message}`;
        btnEl.disabled = false;
        btnEl.textContent = "Tentar novamente";
        mostrarToast("Erro na migração.", "erro");
      }
    };

    if (estado.pendentes > 0) {
      btnMigrar?.addEventListener("click", () => executar(btnMigrar, progressoEl));
      btnMigrarAdmin?.addEventListener("click", () => executar(btnMigrarAdmin, progressoAdminEl));
      [btnMigrar, btnMigrarAdmin].forEach((b) => b?.classList.add("visible"));
    } else {
      statusEls.forEach((el) => { el.innerHTML += `<br><span style="color:#10b981;">✓ BD totalmente migrada.</span>`; });
    }
  } catch (e) {
    statusEls.forEach((el) => { el.textContent = "Erro ao verificar migração."; });
  }
}

// ============================================================
// APPROVAL QUEUE — PURCHASE ORDERS
// ============================================================
function _renderFilaAprovacaoPO(rawPOs) {
  const wrapper = document.getElementById("fila-po-wrapper");
  if (!wrapper) return;

  if (!isPrivileged) {
    wrapper.innerHTML = "";
    return;
  }

  const pendentes = rawPOs.filter((p) => p.status === "pending");
  if (!pendentes.length) {
    wrapper.innerHTML = "";
    return;
  }

  wrapper.innerHTML = `
    <div class="dash-card">
      <div class="dash-card-header">
        <h3 class="dash-card-title">⏳ Fila de Aprovação — Pedidos (${pendentes.length})</h3>
      </div>
      <div class="dash-card-body" id="fila-po-lista">
        ${pendentes.map(_filaPoItemHtml).join("")}
      </div>
    </div>
  `;

  document.getElementById("fila-po-lista")?.addEventListener("click", _onFilaPoClick);
}

function _filaPoItemHtml(po) {
  const num   = po.documentoNumero || po.id.substring(0, 8).toUpperCase();
  const cat   = PO_CATEGORIAS[po.categoria] || po.categoria || "—";
  const urgCls = po.urgencia === "critico" ? "critico" : "";
  const urgLabel = po.urgencia === "critico" ? "🔴 Crítico" : po.urgencia === "urgente" ? "🟡 Urgente" : "Normal";
  const total = formatarMoeda(po.totalEstimado || 0);
  const data  = new Date(po.timestampEnvio || po.criadoEm || 0).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  return `
    <div class="fila-aprov-item ${urgCls}" data-po-id="${po.id}">
      <div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:3px;">
          <span class="fila-aprov-num">#${num}</span>
          <span class="badge-sm" style="font-size:.65rem;">${urgLabel}</span>
        </div>
        <div class="fila-aprov-titulo">${po.titulo || po.title || "Sem título"}</div>
        <div class="fila-aprov-meta">📂 ${cat} · 💰 ${total} · 👤 ${po.solicitante || "—"} · 📅 ${data}</div>
      </div>
      <div class="fila-aprov-actions">
        <button class="btn-aprovar"  data-po-action="approve"       data-po-id="${po.id}">✅ Aprovar</button>
        <button class="btn-rejeitar" data-po-action="reject-toggle" data-po-id="${po.id}">❌ Rejeitar</button>
      </div>
      <div class="fila-reject-area" id="reject-area-po-${po.id}">
        <textarea placeholder="Motivo da rejeição (obrigatório)..." id="reject-reason-po-${po.id}"></textarea>
        <button class="fila-reject-confirm" data-po-action="reject-confirm" data-po-id="${po.id}">Confirmar</button>
      </div>
    </div>
  `;
}

async function _onFilaPoClick(e) {
  const action = e.target.dataset.poAction;
  const poId   = e.target.dataset.poId;
  if (!action || !poId) return;

  if (action === "approve") {
    await _aprovPO(poId);
  } else if (action === "reject-toggle") {
    const area = document.getElementById(`reject-area-po-${poId}`);
    if (area) area.classList.toggle("visible");
  } else if (action === "reject-confirm") {
    const reason = document.getElementById(`reject-reason-po-${poId}`)?.value.trim();
    if (!reason) { mostrarToast("Informe o motivo da rejeição.", "aviso"); return; }
    await _rejeitarPO(poId, reason);
  }
}

async function _aprovPO(poId) {
  try {
    await atualizarPedido(poId, { status: "approved", aprovadoEm: Date.now(), aprovadoPor: perfil.nome });
    _fadeOutFilaItem(`[data-po-id="${poId}"]`);
    if (dadosGlobais) {
      const idx = dadosGlobais.rawPurchaseOrders.findIndex((p) => p.id === poId);
      if (idx >= 0) dadosGlobais.rawPurchaseOrders[idx].status = "approved";
    }
    _atualizarBadgePO();
    mostrarToast("Pedido aprovado!", "sucesso");
  } catch (err) {
    console.error(err);
    mostrarToast("Erro ao aprovar pedido.", "erro");
  }
}

async function _rejeitarPO(poId, reason) {
  try {
    await atualizarPedido(poId, { status: "cancelled", motivoRejeicao: reason, rejeitadoEm: Date.now(), rejeitadoPor: perfil.nome });
    _fadeOutFilaItem(`[data-po-id="${poId}"]`);
    if (dadosGlobais) {
      const idx = dadosGlobais.rawPurchaseOrders.findIndex((p) => p.id === poId);
      if (idx >= 0) dadosGlobais.rawPurchaseOrders[idx].status = "cancelled";
    }
    _atualizarBadgePO();
    mostrarToast("Pedido rejeitado.", "aviso");
  } catch (err) {
    console.error(err);
    mostrarToast("Erro ao rejeitar pedido.", "erro");
  }
}

// ============================================================
// APPROVAL QUEUE — SERVICE OS
// ============================================================
function _renderFilaAprovacaoOS(rawWOs) {
  const wrapper = document.getElementById("fila-os-wrapper");
  if (!wrapper) return;

  if (!isPrivileged) {
    wrapper.innerHTML = "";
    return;
  }

  const pendentes = rawWOs.filter((w) => w.status === "pending_approval" && w.type === "service");
  if (!pendentes.length) {
    wrapper.innerHTML = "";
    return;
  }

  wrapper.innerHTML = `
    <div class="dash-card">
      <div class="dash-card-header">
        <h3 class="dash-card-title">⏳ OS Aguardando Aprovação (${pendentes.length})</h3>
      </div>
      <div class="dash-card-body" id="fila-os-lista">
        ${pendentes.map(_filaOsItemHtml).join("")}
      </div>
    </div>
  `;

  document.getElementById("fila-os-lista")?.addEventListener("click", _onFilaOsClick);
}

function _filaOsItemHtml(os) {
  const num  = os.numero || os.id.substring(0, 8).toUpperCase();
  const data = new Date(os.timestampEnvio || os.createdAt || 0).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  return `
    <div class="fila-aprov-item" data-os-id="${os.id}">
      <div>
        <span class="fila-aprov-num">#${num}</span>
        <div class="fila-aprov-titulo">${os.title || "Sem título"}</div>
        <div class="fila-aprov-meta">🛠️ Serviço · 📂 ${os.sector || "—"} · 👤 ${os.solicitante || "—"} · 📅 ${data}</div>
      </div>
      <div class="fila-aprov-actions">
        <button class="btn-aprovar"  data-os-action="approve"       data-os-id="${os.id}">✅ Aprovar</button>
        <button class="btn-rejeitar" data-os-action="reject-toggle" data-os-id="${os.id}">❌ Rejeitar</button>
      </div>
      <div class="fila-reject-area" id="reject-area-os-${os.id}">
        <textarea placeholder="Motivo da rejeição (obrigatório)..." id="reject-reason-os-${os.id}"></textarea>
        <button class="fila-reject-confirm" data-os-action="reject-confirm" data-os-id="${os.id}">Confirmar</button>
      </div>
    </div>
  `;
}

async function _onFilaOsClick(e) {
  const action = e.target.dataset.osAction;
  const osId   = e.target.dataset.osId;
  if (!action || !osId) return;

  if (action === "approve") {
    await _aprovOS(osId);
  } else if (action === "reject-toggle") {
    const area = document.getElementById(`reject-area-os-${osId}`);
    if (area) area.classList.toggle("visible");
  } else if (action === "reject-confirm") {
    const reason = document.getElementById(`reject-reason-os-${osId}`)?.value.trim();
    if (!reason) { mostrarToast("Informe o motivo da rejeição.", "aviso"); return; }
    await _rejeitarOS(osId, reason);
  }
}

async function _aprovOS(osId) {
  try {
    await atualizarOS(osId, { status: "open" });
    await adicionarLog(osId, "OS aprovada — status → Aberta", perfil.nome, "✅");
    _fadeOutFilaItem(`[data-os-id="${osId}"]`);
    if (dadosGlobais) {
      const idx = dadosGlobais.rawWorkOrders.findIndex((w) => w.id === osId);
      if (idx >= 0) dadosGlobais.rawWorkOrders[idx].status = "open";
    }
    mostrarToast("OS aprovada!", "sucesso");
  } catch (err) {
    console.error(err);
    mostrarToast("Erro ao aprovar OS.", "erro");
  }
}

async function _rejeitarOS(osId, reason) {
  try {
    await atualizarOS(osId, { status: "cancelled", motivoRejeicao: reason });
    await adicionarLog(osId, `OS rejeitada — ${reason}`, perfil.nome, "❌");
    _fadeOutFilaItem(`[data-os-id="${osId}"]`);
    if (dadosGlobais) {
      const idx = dadosGlobais.rawWorkOrders.findIndex((w) => w.id === osId);
      if (idx >= 0) dadosGlobais.rawWorkOrders[idx].status = "cancelled";
    }
    mostrarToast("OS rejeitada.", "aviso");
  } catch (err) {
    console.error(err);
    mostrarToast("Erro ao rejeitar OS.", "erro");
  }
}

function _fadeOutFilaItem(selector) {
  const item = document.querySelector(`.fila-aprov-item${selector}`);
  if (!item) return;
  item.classList.add("fade-out");
  setTimeout(() => item.remove(), 350);
}

function _atualizarBadgePO() {
  if (!dadosGlobais) return;
  const pendentes = (dadosGlobais.rawPurchaseOrders || []).filter((p) => p.status === "pending").length;
  const badge = document.getElementById("badge-po-pendentes");
  if (badge) {
    badge.textContent = pendentes;
    badge.classList.toggle("hidden", pendentes === 0);
  }
}

// ============================================================
// INLINE PO CREATION MODAL (Problem 3)
// ============================================================
let _poItens = [];

function _configurarModalNovoPedido() {
  document.getElementById("btn-fab-novo-pedido-overview")?.addEventListener("click", _abrirModalNovoPedido);
  document.getElementById("btn-novo-pedido-panel")?.addEventListener("click", _abrirModalNovoPedido);

  document.getElementById("modal-criar-po-close")?.addEventListener("click", _fecharModalNovoPedido);
  document.getElementById("modal-criar-po-cancel")?.addEventListener("click", _fecharModalNovoPedido);
  document.getElementById("modal-criar-po")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-criar-po") _fecharModalNovoPedido();
  });

  document.getElementById("po-btn-add-item")?.addEventListener("click", () => _adicionarItemPO());

  document.getElementById("form-criar-po")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await _salvarNovoPedido();
  });
}

function _abrirModalNovoPedido() {
  _poItens = [];
  const modal = document.getElementById("modal-criar-po");
  if (!modal) return;
  document.getElementById("form-criar-po")?.reset();
  const lista = document.getElementById("po-itens-lista");
  if (lista) lista.innerHTML = "";
  _adicionarItemPO(); // first empty row
  _recalcularTotalPO();
  modal.classList.add("visible");
}

function _fecharModalNovoPedido() {
  document.getElementById("modal-criar-po")?.classList.remove("visible");
  _poItens = [];
}

function _adicionarItemPO(desc = "", qty = 1, unit = 0) {
  const idx = _poItens.length;
  _poItens.push({ desc, qty, unit, total: 0 });

  const lista = document.getElementById("po-itens-lista");
  if (!lista) return;

  const row = document.createElement("div");
  row.className = "modal-mat-row";
  row.dataset.idx = idx;
  row.innerHTML = `
    <input type="text"   class="mat-desc"  placeholder="Descrição" value="${desc}" />
    <input type="number" class="mat-qty"   placeholder="Qtd" min="1" value="${qty}" />
    <input type="number" class="mat-unit"  placeholder="Unit R$" min="0" step="0.01" value="${unit > 0 ? unit : ""}" />
    <input type="text"   class="mat-total" readonly placeholder="0,00" />
    <button type="button" class="btn-mat-remove" title="Remover">✕</button>
  `;

  row.querySelector(".mat-qty").addEventListener("input",  () => _atualizarItemPO(row, idx));
  row.querySelector(".mat-unit").addEventListener("input", () => _atualizarItemPO(row, idx));
  row.querySelector(".btn-mat-remove").addEventListener("click", () => {
    row.remove();
    _poItens[idx] = null;
    _recalcularTotalPO();
  });

  lista.appendChild(row);
  _atualizarItemPO(row, idx);
}

function _atualizarItemPO(row, idx) {
  const qty  = parseFloat(row.querySelector(".mat-qty").value)  || 0;
  const unit = parseFloat(row.querySelector(".mat-unit").value) || 0;
  const tot  = qty * unit;
  row.querySelector(".mat-total").value = tot.toFixed(2).replace(".", ",");
  if (_poItens[idx] !== null) {
    _poItens[idx] = { desc: row.querySelector(".mat-desc").value, qty, unit, total: tot };
  }
  _recalcularTotalPO();
}

function _recalcularTotalPO() {
  const total = _poItens.filter(Boolean).reduce((s, i) => s + (i.total || 0), 0);
  const el = document.getElementById("po-display-total");
  if (el) el.textContent = formatarMoeda(total);
}

function _coletarItensPO() {
  return _poItens
    .filter(Boolean)
    .filter((i) => i.desc && i.qty > 0)
    .map((i) => ({
      descricao: i.desc,
      quantidade: i.qty,
      precoUnitario: i.unit,
      precoTotal: i.total,
    }));
}

async function _salvarNovoPedido() {
  const titulo    = document.getElementById("po-titulo")?.value.trim();
  const categoria = document.getElementById("po-categoria")?.value;
  const urgencia  = document.getElementById("po-urgencia")?.value || "normal";
  const justific  = document.getElementById("po-justificativa")?.value.trim();

  if (!titulo || !categoria) {
    mostrarToast("Preencha Título e Categoria.", "erro");
    return;
  }

  const itens = _coletarItensPO();
  const total = itens.reduce((s, i) => s + (i.precoTotal || 0), 0);

  const payload = {
    titulo,
    categoria,
    urgencia,
    justificativa: justific,
    items: itens,
    totalEstimado: total,
    solicitante: perfil.nome,
    criadoPor: perfil.nome,
    status: "pending",
  };

  const btnSave = document.getElementById("modal-criar-po-save");
  if (btnSave) { btnSave.disabled = true; btnSave.textContent = "Salvando..."; }

  try {
    const novoId = await criarPedidoCompra(payload);
    const novoPO = { id: novoId, ...payload, timestampEnvio: Date.now() };

    if (dadosGlobais) {
      dadosGlobais.rawPurchaseOrders = [novoPO, ...(dadosGlobais.rawPurchaseOrders || [])];
      _renderFilaAprovacaoPO(dadosGlobais.rawPurchaseOrders);
      _atualizarBadgePO();
    }

    _fecharModalNovoPedido();
    mostrarToast("Pedido de Compra criado!", "sucesso");
  } catch (err) {
    console.error(err);
    mostrarToast("Erro ao criar pedido.", "erro");
  } finally {
    if (btnSave) { btnSave.disabled = false; btnSave.textContent = "Salvar Pedido"; }
  }
}

// ============================================================
// LOGOUT
// ============================================================
btnLogout?.addEventListener("click", () => {
  if (confirm("Terminar a sessão?")) logout();
});

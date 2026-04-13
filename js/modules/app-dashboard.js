/**
 * app-dashboard.js — SIGA Industrial Control Center
 *
 * Painel de controlo com sidebar, múltiplos painéis e KPIs em tempo real.
 * Usa carregarDashboard() de db-dashboard.js para todos os dados.
 */

import { checkAuth, hasRole, logout, ROLES, ROLE_LABELS } from "../core/db-auth.js";
import {
  carregarDashboard,
  formatarMoeda,
  formatarHoras,
} from "../core/db-dashboard.js";
import { statusMigracao, migrarHistoricoParaWorkOrders } from "../core/db-bridge.js";

// ============================================================
// AUTH
// ============================================================
const perfil = await checkAuth("dashboard");
if (!perfil) throw new Error("Unreachable — checkAuth already redirected");

if (perfil.role === ROLES.ADMIN) {
  document.body.classList.add("is-admin");
}

// ============================================================
// ELEMENTOS DOM
// ============================================================
const toast         = document.getElementById("toast");
const topbarTitle   = document.getElementById("topbar-title");
const topbarAvatar  = document.getElementById("topbar-avatar");
const timestampEl   = document.getElementById("dash-timestamp");
const btnRefresh    = document.getElementById("btn-refresh");
const btnLogout     = document.getElementById("btn-logout");
const btnHamburger  = document.getElementById("btn-hamburger");
const sidebar       = document.getElementById("dash-sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");

// ============================================================
// PANEL TITLES
// ============================================================
const PANEL_TITLES = {
  overview:   "Dashboard",
  os:         "Ordens de Serviço",
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
  const inicial = (perfil.nome || "U")[0].toUpperCase();
  const role    = ROLE_LABELS[perfil.role] || perfil.role;
  const firstName = (perfil.nome || "Utilizador").split(" ")[0];

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
function ativarPanel(panelId) {
  // Update sidebar links
  document.querySelectorAll(".sidebar-link[data-panel]").forEach((link) => {
    link.classList.toggle("active", link.dataset.panel === panelId);
  });

  // Update panels
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  const target = document.getElementById(`panel-${panelId}`);
  if (target) target.classList.add("active");

  // Update topbar title
  if (topbarTitle) topbarTitle.textContent = PANEL_TITLES[panelId] || "Dashboard";

  // Close mobile sidebar
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("visible");
}

document.querySelectorAll(".sidebar-link[data-panel]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    ativarPanel(link.dataset.panel);
  });
});

// ============================================================
// MAIN LOADER
// ============================================================
let dadosGlobais = null;

btnRefresh?.addEventListener("click", () => carregarTudo());

carregarTudo();
if (perfil.role === ROLES.ADMIN) iniciarAdminSection();

async function carregarTudo() {
  if (btnRefresh) {
    btnRefresh.disabled = true;
    btnRefresh.textContent = "↻ Carregando...";
  }

  try {
    const dados = await carregarDashboard();
    dadosGlobais = dados;

    renderOverview(dados);
    renderPanelOS(dados);
    renderPanelCompras(dados);
    renderPanelFrota(dados);
    renderPanelLimpeza(dados);
    atualizarBadgesSidebar(dados);

    // Hide skeleton, show content
    const skeleton = document.getElementById("overview-skeleton");
    const content  = document.getElementById("overview-content");
    if (skeleton) skeleton.classList.add("hidden");
    if (content)  content.classList.remove("hidden");

    if (timestampEl) {
      const hora = new Date(dados.timestamp).toLocaleTimeString("pt-BR", {
        hour: "2-digit", minute: "2-digit",
      });
      timestampEl.textContent = `Atualizado às ${hora}`;
    }
  } catch (err) {
    console.error("[DASHBOARD] Erro ao carregar dados:", err);
    mostrarToast("Erro ao carregar painel. Tente novamente.", "erro");

    // Show error state instead of infinite skeleton
    const skeleton = document.getElementById("overview-skeleton");
    if (skeleton) {
      skeleton.innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:#94a3b8;">
          <div style="font-size:3rem;margin-bottom:14px;">⚠️</div>
          <div style="font-size:1rem;font-weight:700;color:#475569;margin-bottom:8px;">Falha ao carregar indicadores</div>
          <div style="font-size:0.85rem;margin-bottom:20px;">${err.message || "Verifique a ligação e tente novamente."}</div>
          <button onclick="location.reload()" style="background:#0f4c75;color:white;border:none;padding:10px 22px;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.88rem;">
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

  // Build KPI row
  const kpiRow = document.getElementById("kpi-row-main");
  if (kpiRow) {
    const dispTrend = wo.disponibilidade !== null
      ? (wo.disponibilidade >= 95 ? { label: `${wo.disponibilidade}%`, cls: "ok" }
       : wo.disponibilidade >= 80 ? { label: `${wo.disponibilidade}%`, cls: "warn" }
       : { label: `${wo.disponibilidade}%`, cls: "danger" })
      : { label: "—", cls: "neutral" };

    const limpTrend = dados.limpeza.tendencia !== null
      ? (dados.limpeza.tendencia >= 0
          ? { label: `↑ ${Math.abs(dados.limpeza.tendencia).toFixed(1)}`, cls: "ok" }
          : { label: `↓ ${Math.abs(dados.limpeza.tendencia).toFixed(1)}`, cls: "danger" })
      : { label: "—", cls: "neutral" };

    const frotaTrend = dados.frota.taxaNaoConformidade > 15
      ? { label: "⚠️ Alta NC", cls: "danger" }
      : dados.frota.taxaNaoConformidade > 5
        ? { label: "Atenção", cls: "warn" }
        : { label: "OK", cls: "ok" };

    kpiRow.innerHTML = `
      ${kpiCardV2("kpi-blue",   "📋", wo.abertas,     "O.S Abertas",        trendHtml(po.pendentes > 5 ? "warn" : "neutral", ""), "")}
      ${kpiCardV2("kpi-amber",  "🟡", wo.emAndamento, "Em Andamento",       "", "")}
      ${kpiCardV2("kpi-red",    "🔴", wo.criticas,    "Críticas",           trendHtml(wo.criticas > 3 ? "danger" : wo.criticas > 0 ? "warn" : "ok", wo.criticas > 0 ? `${wo.criticas} ativas` : "OK"), "")}
      ${kpiCardV2("kpi-green",  "🟢", wo.concluidas,  "Concluídas",         "", "")}
      ${kpiCardV2("kpi-amber",  "⏳", po.pendentes,   "POs Pendentes",      trendHtml(po.pendentes > 5 ? "danger" : po.pendentes > 2 ? "warn" : "ok", po.urgentes > 0 ? `${po.urgentes} urgentes` : ""), "")}
      ${kpiCardV2("kpi-cyan",   "⏱️", wo.mttr > 0 ? formatarHoras(wo.mttr) : "—", "MTTR (h)",   "", "")}
      ${kpiCardV2("kpi-purple", "📈", wo.disponibilidade !== null ? `${wo.disponibilidade}%` : "—", "Disponibilidade", trendHtml(dispTrend.cls, dispTrend.label), "")}
      ${kpiCardV2("kpi-green",  "🧹", dados.limpeza.mediaGeral !== null ? dados.limpeza.mediaGeral.toFixed(1) : "—", "Score 5S (/10)", trendHtml(limpTrend.cls, limpTrend.label), "")}
    `;
  }

  // Alertas
  renderAlertas(dados);

  // Feed
  renderFeed(feed, "feed-lista");

  // Custos
  renderCustos(custos);

  // Top Falhas (overview)
  renderTopFalhas(dados.workOrders.topFalhas, "top-falhas-lista");
}

function kpiCardV2(colorClass, icon, value, label, trendMarkup, extraClass) {
  return `
    <div class="kpi-card-v2 ${colorClass} ${extraClass}">
      <div class="kpi-top">
        <div class="kpi-icon-circle">${icon}</div>
        ${trendMarkup}
      </div>
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
// RENDER — ALERTAS CRÍTICOS
// ============================================================
function renderAlertas(dados) {
  const el = document.getElementById("alertas-lista");
  if (!el) return;

  const alertas = [];

  // OS críticas
  if (dados.workOrders.criticas > 0) {
    alertas.push({
      tipo: "critical",
      texto: `${dados.workOrders.criticas} ordem(ns) de serviço crítica(s) em aberto`,
      meta: "Requer atenção imediata",
      link: "../os/os.html",
      linkText: "Ver O.S",
    });
  }

  // POs urgentes
  if (dados.compras.urgentes > 0) {
    alertas.push({
      tipo: "critical",
      texto: `${dados.compras.urgentes} pedido(s) de compra urgente(s) pendente(s)`,
      meta: "Aprovação necessária",
      link: "../compras/compras.html",
      linkText: "Ver Compras",
    });
  }

  // POs pendentes
  if (dados.compras.pendentes > 0) {
    alertas.push({
      tipo: "warning",
      texto: `${dados.compras.pendentes} pedido(s) de compra aguardando aprovação`,
      meta: "Pedidos de compra pendentes",
      link: "../compras/compras.html",
      linkText: "Aprovar",
    });
  }

  // Frota NC alta
  if (dados.frota.taxaNaoConformidade > 15) {
    alertas.push({
      tipo: "critical",
      texto: `Taxa de NC da frota em ${dados.frota.taxaNaoConformidade}% — acima do limite`,
      meta: "Risco operacional na frota",
      link: "../frota/painel-frota.html",
      linkText: "Ver Frota",
    });
  } else if (dados.frota.taxaNaoConformidade > 5) {
    alertas.push({
      tipo: "warning",
      texto: `Taxa de NC da frota em ${dados.frota.taxaNaoConformidade}% — atenção recomendada`,
      meta: "Verificar checklists",
      link: "../frota/painel-frota.html",
      linkText: "Ver Frota",
    });
  }

  // Limpeza crítica
  if (dados.limpeza.zonasCriticas.length > 0) {
    alertas.push({
      tipo: "warning",
      texto: `${dados.limpeza.zonasCriticas.length} zona(s) de limpeza com score abaixo de 5`,
      meta: dados.limpeza.zonasCriticas.map((z) => z.zonaId).slice(0, 3).join(", "),
      link: "../limpeza/limpeza.html",
      linkText: "Ver Limpeza",
    });
  }

  // Tudo OK
  if (alertas.length === 0) {
    el.innerHTML = `
      <div class="alert-item ok">
        <div class="alert-dot"></div>
        <div class="alert-content">
          <div class="alert-text">✅ Sem alertas críticos</div>
          <div class="alert-meta">Todos os indicadores dentro do esperado</div>
        </div>
      </div>
    `;
    return;
  }

  el.innerHTML = alertas.slice(0, 6).map((a) => `
    <div class="alert-item ${a.tipo}">
      <div class="alert-dot"></div>
      <div class="alert-content">
        <div class="alert-text">${a.texto}</div>
        ${a.meta ? `<div class="alert-meta">${a.meta}</div>` : ""}
      </div>
      <a href="${a.link}" class="alert-action">${a.linkText}</a>
    </div>
  `).join("");
}

// ============================================================
// RENDER — ACTIVITY FEED
// ============================================================
const STATUS_LABELS = {
  open: "Aberta", pending: "Pendente", in_progress: "Em andamento",
  completed: "Concluída", cancelled: "Cancelada", approved: "Aprovado",
  ordered: "Em pedido", received: "Recebido", waiting_parts: "Ag. Peças",
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
    const link = item.tipo === "work_order"
      ? `../os/os-detalhe.html?id=${item.id}`
      : `../compras/compra-detalhe.html?id=${item.id}`;
    const dotClass = item.tipo === "work_order" ? "wo" : "po";
    const statusLabel = STATUS_LABELS[item.status] || item.status || "—";

    return `
      <a href="${link}" class="feed-item-v2" style="text-decoration:none;">
        <div class="feed-dot-v2 ${dotClass}">${item.icone || "📋"}</div>
        <div class="feed-body">
          <div class="feed-desc-v2">${item.descricao}</div>
          <div class="feed-meta-v2">${data}</div>
        </div>
        <span class="feed-status-badge">${statusLabel}</span>
      </a>
    `;
  }).join("");
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

  // Compras panel cost
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
      <div class="custo-bar-track">
        <div class="custo-bar-fill ${extraClass}" style="width:${pct}%"></div>
      </div>
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

  if (!topFalhas.length) {
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
    if (dados.workOrders.criticas > 0) {
      badgeOsCriticas.textContent = dados.workOrders.criticas;
      badgeOsCriticas.classList.remove("hidden");
    } else {
      badgeOsCriticas.classList.add("hidden");
    }
  }

  const badgePoPendentes = document.getElementById("badge-po-pendentes");
  if (badgePoPendentes) {
    if (dados.compras.pendentes > 0) {
      badgePoPendentes.textContent = dados.compras.pendentes;
      badgePoPendentes.classList.remove("hidden");
    } else {
      badgePoPendentes.classList.add("hidden");
    }
  }
}

// ============================================================
// RENDER — PANEL: ORDENS DE SERVIÇO
// ============================================================
function renderPanelOS(dados) {
  const wo   = dados.workOrders;
  const feed = dados.atividadeRecente;

  const el = (id) => document.getElementById(id);

  if (el("os-kpi-abertas"))    el("os-kpi-abertas").textContent    = wo.abertas;
  if (el("os-kpi-andamento"))  el("os-kpi-andamento").textContent  = wo.emAndamento;
  if (el("os-kpi-criticas"))   el("os-kpi-criticas").textContent   = wo.criticas;
  if (el("os-kpi-concluidas")) el("os-kpi-concluidas").textContent = wo.concluidas;
  if (el("os-mttr"))           el("os-mttr").textContent           = wo.mttr > 0 ? formatarHoras(wo.mttr) : "—";
  if (el("os-disponibilidade"))el("os-disponibilidade").textContent = wo.disponibilidade !== null ? `${wo.disponibilidade}%` : "—";

  renderTopFalhas(wo.topFalhas, "os-top-falhas");

  // Filter feed to WO only
  const woFeed = feed.filter((f) => f.tipo === "work_order").slice(0, 10);
  renderFeed(woFeed.length ? woFeed : feed.slice(0, 8), "os-recent-feed");
}

// ============================================================
// RENDER — PANEL: COMPRAS
// ============================================================
function renderPanelCompras(dados) {
  const po   = dados.compras;
  const feed = dados.atividadeRecente;
  const el   = (id) => document.getElementById(id);

  if (el("po-kpi-pendentes"))  el("po-kpi-pendentes").textContent  = po.pendentes;
  if (el("po-kpi-aprovados"))  el("po-kpi-aprovados").textContent  = po.aprovados;
  if (el("po-kpi-empedido"))   el("po-kpi-empedido").textContent   = po.emPedido;
  if (el("po-kpi-urgentes"))   el("po-kpi-urgentes").textContent   = po.urgentes;
  if (el("po-avg-aprov"))      el("po-avg-aprov").textContent      = po.avgAprovacaoHoras > 0 ? formatarHoras(po.avgAprovacaoHoras) : "—";

  // Trend badge
  const trendEl = el("po-trend-pendentes");
  if (trendEl) {
    if (po.pendentes === 0)  { trendEl.textContent = "OK"; trendEl.className = "kpi-trend ok"; }
    else if (po.pendentes > 5){ trendEl.textContent = "Alta"; trendEl.className = "kpi-trend danger"; }
    else                     { trendEl.textContent = `${po.pendentes}p`; trendEl.className = "kpi-trend warn"; }
  }

  // Filter feed to PO only
  const poFeed = feed.filter((f) => f.tipo === "purchase_order").slice(0, 10);
  renderFeed(poFeed.length ? poFeed : feed.slice(0, 8), "po-recent-feed");
}

// ============================================================
// RENDER — PANEL: FROTA
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
  if (totalEl) totalEl.textContent = `${frota.totalChecklists} checklist(s) recente(s)`;

  const listaEl = el("frota-veiculos-lista");
  if (listaEl) {
    if (!frota.veiculosCriticos.length) {
      listaEl.innerHTML = `<div class="empty-state-sm"><div class="empty-icon">✅</div><p>Sem veículos críticos. Frota operacional.</p></div>`;
      return;
    }
    listaEl.innerHTML = frota.veiculosCriticos.map((v, i) => {
      const posCls = i === 0 ? "top1" : i === 1 ? "top2" : "";
      return `
        <div class="ranking-item-v2">
          <div class="ranking-pos-v2 ${posCls}">${i + 1}</div>
          <span class="ranking-nome-v2">🚛 ${v.veiculoNome}</span>
          <span class="ranking-val-v2 danger">${v.nc} NC</span>
        </div>
      `;
    }).join("");
  }
}

// ============================================================
// RENDER — PANEL: LIMPEZA
// ============================================================
function renderPanelLimpeza(dados) {
  const limpeza = dados.limpeza;
  const el      = (id) => document.getElementById(id);

  const scoreEl = el("limpeza-media-score");
  if (scoreEl) {
    if (limpeza.mediaGeral !== null) {
      scoreEl.textContent = limpeza.mediaGeral.toFixed(1);
      scoreEl.style.color = limpeza.mediaGeral >= 8 ? "#10b981"
        : limpeza.mediaGeral >= 5 ? "#f59e0b"
        : "#ef4444";
    } else {
      scoreEl.textContent = "—";
    }
  }

  const totalEl = el("limpeza-total-auditorias");
  if (totalEl) totalEl.textContent = `${limpeza.totalAuditorias} auditoria(s)`;

  const tendEl = el("limpeza-tendencia");
  if (tendEl && limpeza.tendencia !== null) {
    if (limpeza.tendencia > 0) {
      tendEl.textContent = `↑ Melhoria de +${limpeza.tendencia.toFixed(1)}`;
      tendEl.style.color = "#10b981";
    } else if (limpeza.tendencia < 0) {
      tendEl.textContent = `↓ Queda de ${limpeza.tendencia.toFixed(1)}`;
      tendEl.style.color = "#ef4444";
    } else {
      tendEl.textContent = "→ Estável";
      tendEl.style.color = "#94a3b8";
    }
  }

  const zonasEl = el("limpeza-zonas-lista");
  if (zonasEl) {
    if (!limpeza.zonasCriticas.length) {
      zonasEl.innerHTML = `<div class="empty-state-sm"><div class="empty-icon">✅</div><p>Sem zonas críticas. Todas as zonas com score ≥ 5.</p></div>`;
    } else {
      zonasEl.innerHTML = `
        <div class="zona-grid-v2">
          ${limpeza.zonasCriticas.slice(0, 8).map((z) => `
            <div class="zona-card-v2 baixa">
              <span class="zona-nota-v2">${z.media.toFixed(1)}</span>
              <span class="zona-id-v2">${z.zonaId}</span>
            </div>
          `).join("")}
        </div>
      `;
    }

    // Also show all zones with their scores (media zone grid)
    if (limpeza.mediasPorZona && limpeza.mediasPorZona.length > 0) {
      const nonCritical = limpeza.mediasPorZona.filter((z) => z.media >= 5);
      if (nonCritical.length > 0) {
        zonasEl.innerHTML += `
          <div class="section-divider" style="margin-top:16px;">
            <span class="section-divider-title">Outras Zonas</span>
            <div class="section-divider-line"></div>
          </div>
          <div class="zona-grid-v2">
            ${nonCritical.slice(0, 6).map((z) => {
              const cls = z.media >= 8 ? "ok" : "media";
              return `
                <div class="zona-card-v2 ${cls}">
                  <span class="zona-nota-v2">${z.media.toFixed(1)}</span>
                  <span class="zona-id-v2">${z.zonaId}</span>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }
    }
  }
}

// ============================================================
// ADMIN — MIGRATION
// ============================================================
async function iniciarAdminSection() {
  // Two possible containers (OS panel and Admin panel)
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
    const statusHtml = `
      Migração <strong>historico_manutencao → work_orders</strong><br>
      Total legado: <strong>${estado.totalLegacy}</strong> &nbsp;|&nbsp;
      Migrado: <strong>${estado.totalMigrado}</strong> &nbsp;|&nbsp;
      Pendentes: <strong style="color:${estado.pendentes > 0 ? "#f59e0b" : "#10b981"};">${estado.pendentes}</strong>
    `;

    statusEls.forEach((el) => { el.innerHTML = statusHtml; });

    const executarMigracao = async (btnEl, progressEl) => {
      if (!confirm(`Migrar ${estado.pendentes} registos pendentes para work_orders?`)) return;
      btnEl.disabled = true;
      btnEl.textContent = "A migrar...";
      if (progressEl) progressEl.classList.remove("hidden");

      try {
        const resultado = await migrarHistoricoParaWorkOrders({
          onProgress: (cur, tot) => {
            if (progressEl) progressEl.textContent = `A processar ${cur} / ${tot}...`;
          },
        });
        if (progressEl) progressEl.textContent = `✅ Migrados: ${resultado.migrated} | Ignorados: ${resultado.skipped} | Erros: ${resultado.errors}`;
        btnEl.textContent = "✓ Migração concluída";
        mostrarToast("Migração concluída com sucesso!", "sucesso");
      } catch (e) {
        if (progressEl) progressEl.textContent = `Erro: ${e.message}`;
        btnEl.disabled = false;
        btnEl.textContent = "Tentar novamente";
        mostrarToast("Erro na migração.", "erro");
      }
    };

    if (estado.pendentes > 0) {
      if (btnMigrar) {
        btnMigrar.classList.add("visible");
        btnMigrar.addEventListener("click", () => executarMigracao(btnMigrar, progressoEl));
      }
      if (btnMigrarAdmin) {
        btnMigrarAdmin.classList.add("visible");
        btnMigrarAdmin.addEventListener("click", () => executarMigracao(btnMigrarAdmin, progressoAdminEl));
      }
    } else {
      statusEls.forEach((el) => {
        el.innerHTML += `<br><span style="color:#10b981;">✓ Base de dados totalmente migrada.</span>`;
      });
    }
  } catch (e) {
    statusEls.forEach((el) => { el.textContent = "Erro ao verificar estado de migração."; });
    console.error("[ADMIN]", e);
  }
}

// ============================================================
// LOGOUT
// ============================================================
btnLogout?.addEventListener("click", () => {
  if (confirm("Terminar a sessão?")) logout();
});

// ============================================================
// TOAST
// ============================================================
function mostrarToast(msg, tipo = "sucesso") {
  if (!toast) { console.warn("[TOAST]", msg); return; }
  toast.textContent = msg;
  toast.className = `toast ${tipo} show`;
  setTimeout(() => toast.classList.remove("show"), 3500);
}

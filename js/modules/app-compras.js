/**
 * app-compras.js - Lógica da listagem de Pedidos de Compra
 * Página: compras/compras.html
 */
import { checkAuth } from "../core/db-auth.js";
import {
  obterTodosPedidos,
  PO_CATEGORIAS,
  PO_STATUS,
  PO_STATUS_CLASS,
  PO_URGENCIA,
  formatarData,
  formatarMoeda,
} from "../core/db-compras.js";

await checkAuth("compras");

// ============================================================
// ESTADO LOCAL
// ============================================================
let todosPedidos = [];
let filtroCategoriaAtivo = "todos";
let filtroStatusAtivo = "todos";

// ============================================================
// ELEMENTOS DO DOM
// ============================================================
const overlay = document.getElementById("overlay");
const listaEl = document.getElementById("compras-lista");
const statTotal = document.getElementById("stat-total");
const statPendente = document.getElementById("stat-pendente");
const statAprovado = document.getElementById("stat-aprovado");
const statRecebido = document.getElementById("stat-recebido");
const toast = document.getElementById("toast");

// ============================================================
// INICIALIZAÇÃO
// ============================================================
configurarFiltros();
carregarPedidos();

async function carregarPedidos() {
  if (overlay) overlay.classList.remove("hidden");
  console.log("[COMPRAS] Carregando pedidos...");
  try {
    const data = await obterTodosPedidos();
    todosPedidos = Array.isArray(data) ? data : [];
    console.log("[COMPRAS] Pedidos carregados:", todosPedidos.length);
    atualizarStats();
    try {
      renderizarLista();
    } catch (renderErr) {
      console.error("[COMPRAS] Erro ao renderizar:", renderErr);
      mostrarToast("Erro ao exibir pedidos.", "erro");
    }
  } catch (err) {
    console.error("[COMPRAS] Erro ao carregar pedidos:", err);
    mostrarToast("Erro ao carregar pedidos de compra.", "erro");
    if (listaEl) listaEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <h3>Erro ao carregar pedidos</h3>
        <p>Verifique a sua ligação e recarregue a página.</p>
      </div>`;
  } finally {
    if (overlay) overlay.classList.add("hidden");
  }
}

// ============================================================
// STATS
// ============================================================
function atualizarStats() {
  if (statTotal) statTotal.textContent = todosPedidos.length;
  if (statPendente) statPendente.textContent = todosPedidos.filter((p) => p.status === "pending").length;
  if (statAprovado) statAprovado.textContent = todosPedidos.filter((p) => p.status === "approved" || p.status === "ordered").length;
  if (statRecebido) statRecebido.textContent = todosPedidos.filter((p) => p.status === "received").length;
}

// ============================================================
// FILTROS
// ============================================================
function configurarFiltros() {
  document.querySelectorAll("[data-filtro-categoria]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-filtro-categoria]").forEach((b) => b.classList.remove("ativo"));
      btn.classList.add("ativo");
      filtroCategoriaAtivo = btn.dataset.filtroCategoria;
      renderizarLista();
    });
  });

  document.querySelectorAll("[data-filtro-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-filtro-status]").forEach((b) => b.classList.remove("ativo"));
      btn.classList.add("ativo");
      filtroStatusAtivo = btn.dataset.filtroStatus;
      renderizarLista();
    });
  });
}

function filtrarPedidos() {
  return todosPedidos.filter((p) => {
    const passaCategoria = filtroCategoriaAtivo === "todos" || p.categoria === filtroCategoriaAtivo;
    const passaStatus = filtroStatusAtivo === "todos" || p.status === filtroStatusAtivo;
    return passaCategoria && passaStatus;
  });
}

// ============================================================
// RENDERIZAÇÃO
// ============================================================
function renderizarLista() {
  if (!listaEl) return;
  const lista = filtrarPedidos();

  if (!Array.isArray(lista) || lista.length === 0) {
    listaEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🛒</div>
        <h3>Nenhum pedido encontrado</h3>
        <p>Tente ajustar os filtros ou crie um novo Pedido de Compra.</p>
      </div>
    `;
    return;
  }

  listaEl.innerHTML = lista.map((p) => renderizarCardPedido(p)).join("");
}

function renderizarCardPedido(p) {
  const badgeCategoria = getBadgeCategoria(p.categoria);
  const badgeStatus = getBadgeStatus(p.status);
  const badgeUrgencia = p.urgencia && p.urgencia !== "normal"
    ? `<span class="badge badge-aguardando">${PO_URGENCIA[p.urgencia] || p.urgencia}</span>`
    : "";
  const total = formatarMoeda(p.totalEstimado || 0);
  const data = formatarData(p.createdAt || p.timestampEnvio);
  const justificativa = p.justificativa?.substring(0, 80) || "Sem justificativa";
  const itensCount = (p.items || []).length;

  return `
    <a href="compra-detalhe.html?id=${p.id}" class="os-card">
      <div class="os-card-top">
        <div class="os-card-badges">
          ${badgeCategoria}
          ${badgeStatus}
          ${badgeUrgencia}
        </div>
        <span class="os-card-numero">${p.documentoNumero || "#PO"}</span>
      </div>
      <div class="os-card-descricao">${justificativa}</div>
      <div class="os-card-meta">
        <span class="os-meta-item">👤 ${p.solicitante || "—"}</span>
        <span class="os-meta-item">🏭 ${p.setor || "—"}</span>
        <span class="os-meta-item">📦 ${itensCount} item(s)</span>
        <span class="os-meta-item">💰 ${total}</span>
        <span class="os-meta-item">🕐 ${data}</span>
      </div>
    </a>
  `;
}

function getBadgeCategoria(categoria) {
  const classes = {
    peca: "badge-manutencao",
    equipamento: "badge-servico",
    servico: "badge-andamento",
    operacional: "badge-aberta",
  };
  const icons = { peca: "🔩", equipamento: "⚙️", servico: "🛠️", operacional: "📦" };
  const cls = classes[categoria] || "badge-manutencao";
  const ic = icons[categoria] || "🛒";
  const label = PO_CATEGORIAS[categoria] || categoria || "—";
  return `<span class="badge ${cls}">${ic} ${label}</span>`;
}

function getBadgeStatus(status) {
  const cls = PO_STATUS_CLASS[status] || "badge-aberta";
  const label = PO_STATUS[status] || status || "—";
  return `<span class="badge ${cls}">${label}</span>`;
}

// ============================================================
// TOAST
// ============================================================
function mostrarToast(msg, tipo = "sucesso") {
  if (!toast) { console.warn("[TOAST]", msg); return; }
  toast.textContent = msg;
  toast.className = `toast ${tipo} show`;
  setTimeout(() => toast.classList.remove("show"), 3500);
}

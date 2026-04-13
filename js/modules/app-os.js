/**
 * app-os.js - Lógica da listagem de Ordens de Serviço
 * Página: os/os.html
 */
import { checkAuth } from "../core/db-auth.js";
import {
  obterTodasOS,
  OS_TIPOS,
  OS_STATUS,
  OS_PRIORIDADE,
  OS_ORIGEM,
  ICONS_TIPO,
  formatarData,
} from "../core/db-os.js";

await checkAuth("os");

// ============================================================
// ESTADO LOCAL
// ============================================================
let todasOS = [];
let filtroTipoAtivo = "todos";
let filtroStatusAtivo = "todos";
let filtroMaquinaAtivo = "Todos";
let modoAgrupado = false;

// ============================================================
// ELEMENTOS DO DOM
// ============================================================
const overlay = document.getElementById("overlay");
const listaEl = document.getElementById("os-lista");
const statTotal = document.getElementById("stat-total");
const statAberta = document.getElementById("stat-aberta");
const statAndamento = document.getElementById("stat-andamento");
const statConcluida = document.getElementById("stat-concluida");
const toast = document.getElementById("toast");

// ============================================================
// INICIALIZAÇÃO
// ============================================================
// DOMContentLoaded already fired before this module resumes after
// await checkAuth() — call directly instead of registering a listener.
configurarFiltros();
carregarOS();

async function carregarOS() {
  overlay.classList.remove("hidden");
  try {
    todasOS = await obterTodasOS();
    atualizarStats();
    popularFiltroMaquina(todasOS);
    renderizarLista();
  } catch (err) {
    console.error("Erro ao carregar O.S:", err);
    mostrarToast("Erro ao carregar ordens de serviço.", "erro");
  } finally {
    overlay.classList.add("hidden");
  }
}

// ============================================================
// STATS
// ============================================================
function atualizarStats() {
  statTotal.textContent = todasOS.length;
  statAberta.textContent = todasOS.filter((o) => o.status === "open").length;
  statAndamento.textContent = todasOS.filter(
    (o) => o.status === "in_progress" || o.status === "waiting_parts"
  ).length;
  statConcluida.textContent = todasOS.filter((o) => o.status === "completed").length;
}

// ============================================================
// FILTROS
// ============================================================
function configurarFiltros() {
  document.querySelectorAll("[data-filtro-tipo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-filtro-tipo]").forEach((b) => b.classList.remove("ativo"));
      btn.classList.add("ativo");
      filtroTipoAtivo = btn.dataset.filtroTipo;
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

function filtrarOS() {
  return todasOS.filter((os) => {
    const passaTipo = filtroTipoAtivo === "todos" || os.type === filtroTipoAtivo;
    const passaStatus = filtroStatusAtivo === "todos" || os.status === filtroStatusAtivo;
    const passaMaquina = filtroMaquinaAtivo === "Todos" || os.originId === filtroMaquinaAtivo;
    return passaTipo && passaStatus && passaMaquina;
  });
}

// ============================================================
// FILTRO POR MÁQUINA
// ============================================================
function popularFiltroMaquina(lista) {
  const secao = document.getElementById("secao-filtro-maquina");
  const container = document.getElementById("filtro-maquinas");
  const btnAgrupar = document.getElementById("btn-agrupar");
  if (!secao || !container) return;

  const maquinas = [
    ...new Map(
      lista
        .filter((os) => os.origin === "machine" && os.originId)
        .map((os) => [os.originId, { id: os.originId, nome: os.originNome || os.originId }])
    ).values(),
  ];

  if (maquinas.length === 0) return; // no machine WOs → hide filter bar
  secao.style.display = "block";

  const chips = [
    `<button class="btn-filtro chip-maquina ativo" data-maquina-id="Todos">Todos</button>`,
    ...maquinas.map(
      (m) => `<button class="btn-filtro chip-maquina" data-maquina-id="${m.id}" title="${m.nome}">${m.id}${m.nome !== m.id ? ` · ${m.nome.split(" ").slice(0, 2).join(" ")}` : ""}</button>`
    ),
  ];
  container.innerHTML = chips.join("");

  container.querySelectorAll(".chip-maquina").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".chip-maquina").forEach((b) => b.classList.remove("ativo"));
      btn.classList.add("ativo");
      filtroMaquinaAtivo = btn.dataset.maquinaId;
      renderizarLista();
    });
  });

  if (btnAgrupar) {
    btnAgrupar.addEventListener("click", () => {
      modoAgrupado = !modoAgrupado;
      btnAgrupar.classList.toggle("ativo", modoAgrupado);
      btnAgrupar.textContent = modoAgrupado ? "☰ Visão Linear" : "⊞ Agrupar por Máquina";
      renderizarLista();
    });
  }
}

// ============================================================
// RENDERIZAÇÃO
// ============================================================
function renderizarLista() {
  const lista = filtrarOS();

  if (lista.length === 0) {
    listaEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <h3>Nenhuma O.S encontrada</h3>
        <p>Tente ajustar os filtros ou crie uma nova Ordem de Serviço.</p>
      </div>
    `;
    return;
  }

  if (modoAgrupado) {
    listaEl.innerHTML = renderizarListaAgrupada(lista);
  } else {
    listaEl.innerHTML = lista.map((os) => renderizarCardOS(os)).join("");
  }
}

function renderizarListaAgrupada(lista) {
  // Group by origin — machine WOs grouped, others in "Outros" bucket
  const grupos = new Map();
  lista.forEach((os) => {
    const key = os.origin === "machine" && os.originId ? os.originId : "__outros__";
    if (!grupos.has(key)) grupos.set(key, { id: key, nome: os.originNome || key, itens: [] });
    grupos.get(key).itens.push(os);
  });

  return [...grupos.entries()].map(([key, grupo]) => {
    const headerLabel = key === "__outros__" ? "📋 Outras O.S" : `⚙️ ${grupo.id} — ${grupo.nome}`;
    return `
      <div class="grupo-maquina">
        <div class="grupo-maquina-header">
          <span>${headerLabel}</span>
          <span class="section-badge">${grupo.itens.length}</span>
        </div>
        <div class="grupo-maquina-body">
          ${grupo.itens.map((os) => renderizarCardOS(os)).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function renderizarCardOS(os) {
  const badgeTipo = getBadgeTipo(os.type);
  const badgeStatus = getBadgeStatus(os.status);
  const badgePrioridade = getBadgePrioridade(os.priority);
  const classePrioridade = `prioridade-${os.priority || "low"}`;
  const numero = os.numero || os.id.substring(0, 8).toUpperCase();
  const titulo = os.title || os.description?.substring(0, 80) || "Sem descrição";
  const origem = OS_ORIGEM[os.origin] || os.origin || "—";
  const originNome = os.originNome || os.originId || "—";
  const setor = os.sector || "—";
  const data = formatarData(os.createdAt || os.timestampEnvio);

  return `
    <a href="os-detalhe.html?id=${os.id}" class="os-card ${classePrioridade}">
      <div class="os-card-top">
        <div class="os-card-badges">
          ${badgeTipo}
          ${badgeStatus}
          ${badgePrioridade}
        </div>
        <span class="os-card-numero">#${numero}</span>
      </div>
      <div class="os-card-descricao">${titulo}</div>
      <div class="os-card-meta">
        <span class="os-meta-item">📍 ${origem}${originNome !== "—" ? ` · ${originNome}` : ""}</span>
        <span class="os-meta-item">🏭 ${setor}</span>
        <span class="os-meta-item">🕐 ${data}</span>
        ${os.solicitante ? `<span class="os-meta-item">👤 ${os.solicitante}</span>` : ""}
      </div>
    </a>
  `;
}

function getBadgeTipo(tipo) {
  const classes = { maintenance: "badge-manutencao", service: "badge-servico" };
  const ic = ICONS_TIPO[tipo] || "📋";
  const cls = classes[tipo] || "badge-manutencao";
  const label = OS_TIPOS[tipo] || tipo || "O.S";
  return `<span class="badge ${cls}">${ic} ${label}</span>`;
}

function getBadgeStatus(status) {
  const classes = {
    open: "badge-aberta",
    in_progress: "badge-andamento",
    waiting_parts: "badge-aguardando",
    completed: "badge-concluida",
  };
  const cls = classes[status] || "badge-aberta";
  const label = OS_STATUS[status] || status || "—";
  return `<span class="badge ${cls}">${label}</span>`;
}

function getBadgePrioridade(priority) {
  const classes = {
    low: "badge-prioridade-baixa",
    medium: "badge-prioridade-media",
    high: "badge-prioridade-alta",
  };
  const cls = classes[priority] || "badge-prioridade-baixa";
  const label = OS_PRIORIDADE[priority] || priority || "—";
  return `<span class="badge ${cls}">${label}</span>`;
}

// ============================================================
// TOAST
// ============================================================
function mostrarToast(msg, tipo = "sucesso") {
  toast.textContent = msg;
  toast.className = `toast ${tipo} show`;
  setTimeout(() => toast.classList.remove("show"), 3500);
}

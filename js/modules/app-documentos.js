/**
 * app-documentos.js — Centro de Documentos (SRV + PO)
 * Página: os/documentos.html
 *
 * Modos:
 *   documentos.html        → lista de documentos
 *   documentos.html?id=ID  → viewer completo de um documento
 */
import { checkAuth } from "../core/db-auth.js";
import {
  obterTodosDocumentos,
  obterDocumentoPorId,
  PO_STATUS,
  PO_STATUS_CLASS,
  PO_CATEGORIAS,
  PO_URGENCIA,
  formatarData,
  formatarMoeda,
} from "../core/db-compras.js";

await checkAuth("documentos");

// ============================================================
// LABELS LOCAIS (OS)
// ============================================================
const OS_STATUS = {
  open: "Aberta",
  in_progress: "Em Andamento",
  waiting_parts: "Aguardando Peças",
  completed: "Concluída",
};
const OS_STATUS_CLASS = {
  open: "badge-aberta",
  in_progress: "badge-andamento",
  waiting_parts: "badge-aguardando",
  completed: "badge-concluida",
};
const OS_MANUTENCAO_TIPO = { corrective: "⚡ Corretiva", preventive: "🛡️ Preventiva" };
const SERVICE_CATEGORIAS = {
  maquina: "🔩 Manutenção de Máquina",
  instalacao: "🔌 Instalação de Equipamento",
  ti: "💻 TI / Sistemas",
  administrativo: "📁 Administrativo",
  outros: "📦 Outros",
};
const OS_ORIGEM = { manual: "✍️ Manual", machine: "⚙️ Maquinário", fleet: "🚛 Frota" };
const OS_PRIORIDADE = { low: "🟢 Baixa", medium: "🟡 Média", high: "🔴 Alta" };
const OS_PRIORIDADE_CLASS = {
  low: "badge-prioridade-baixa",
  medium: "badge-prioridade-media",
  high: "badge-prioridade-alta",
};

// ============================================================
// ESTADO LOCAL (lista)
// ============================================================
let todosDocumentos = [];
let filtroTipoAtivo = "todos";

// ============================================================
// ELEMENTOS DO DOM
// ============================================================
const overlay    = document.getElementById("overlay");
const overlayMsg = document.getElementById("overlay-msg");
const toast      = document.getElementById("toast");
const secaoLista = document.getElementById("secao-lista");
const secaoVis   = document.getElementById("secao-visualizacao");
const listaEl    = document.getElementById("docs-lista");
const statTotal  = document.getElementById("stat-total");
const statSrv    = document.getElementById("stat-srv");
const statPo     = document.getElementById("stat-po");

// ============================================================
// ROUTER — lista vs. viewer
// ============================================================
const params = new URLSearchParams(window.location.search);
const docIdParam = params.get("id");

if (docIdParam) {
  iniciarModoVisualizacao(docIdParam);
} else {
  iniciarModoLista();
}

// ============================================================
// MODO LISTA
// ============================================================
function iniciarModoLista() {
  secaoLista.classList.remove("hidden");
  configurarFiltros();
  carregarDocumentos();
}

async function carregarDocumentos() {
  mostrarOverlay("Carregando documentos...");
  console.log("[DOCUMENTOS] Carregando documentos...");
  try {
    const data = await obterTodosDocumentos();
    todosDocumentos = Array.isArray(data) ? data : [];
    console.log("[DOCUMENTOS] Total carregado:", todosDocumentos.length);
    atualizarStats();
    try {
      renderizarLista();
    } catch (renderErr) {
      console.error("[DOCUMENTOS] Erro ao renderizar lista:", renderErr);
      mostrarToast("Erro ao exibir documentos.", "erro");
    }
  } catch (err) {
    console.error("[DOCUMENTOS] Erro ao carregar:", err);
    mostrarToast("Erro ao carregar documentos.", "erro");
    if (listaEl) listaEl.innerHTML = renderEmptyState("⚠️", "Erro ao carregar documentos", "Verifique a sua ligação e recarregue a página.");
  } finally {
    esconderOverlay();
  }
}

function atualizarStats() {
  if (statTotal) statTotal.textContent = todosDocumentos.length;
  if (statSrv) statSrv.textContent = todosDocumentos.filter((d) => d.tipo === "service_report").length;
  if (statPo) statPo.textContent = todosDocumentos.filter((d) => d.tipo === "purchase_document").length;
}

function configurarFiltros() {
  document.querySelectorAll("[data-filtro-tipo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-filtro-tipo]").forEach((b) => b.classList.remove("ativo"));
      btn.classList.add("ativo");
      filtroTipoAtivo = btn.dataset.filtroTipo;
      renderizarLista();
    });
  });
}

// Event delegation — wired once, never re-registered
if (listaEl) {
  listaEl.addEventListener("click", (e) => {
    const card = e.target.closest("[data-doc-id]");
    if (!card) return;
    // If user clicked the "Ver Documento" link, let native navigation handle it
    if (e.target.closest(".doc-entry-link")) return;
    const id = card.dataset.docId;
    if (id) window.location.href = `documentos.html?id=${id}`;
  });
}

function renderizarLista() {
  if (!listaEl) return;

  const lista = filtroTipoAtivo === "todos"
    ? todosDocumentos
    : todosDocumentos.filter((d) => d.tipo === filtroTipoAtivo);

  if (!Array.isArray(lista) || lista.length === 0) {
    listaEl.innerHTML = renderEmptyState(
      filtroTipoAtivo === "todos" ? "📄" : (filtroTipoAtivo === "service_report" ? "📄" : "🛒"),
      "Nenhum documento encontrado",
      filtroTipoAtivo === "todos"
        ? "Os documentos gerados em O.S e Pedidos de Compra aparecerão aqui."
        : "Nenhum documento deste tipo foi emitido ainda."
    );
    return;
  }

  listaEl.innerHTML = lista.map(renderizarCardLista).join("");
}

function renderizarCardLista(doc) {
  const isSRV = doc.tipo === "service_report";
  const sd = doc.sourceData || {};

  const tipoClass = isSRV ? "srv" : "po";
  const tipoBadge = isSRV
    ? `<span class="badge badge-servico">📄 SRV</span>`
    : `<span class="badge badge-compra">🛒 PO</span>`;

  // Resumo (primeira linha de texto relevante)
  const resumo = isSRV
    ? (sd.title || sd.description || "Documento de Serviço")
    : (sd.justificativa || "Pedido de Compra");
  const resumoCurto = resumo.length > 110 ? resumo.substring(0, 110) + "…" : resumo;

  // Custo
  let custoHtml = "";
  if (isSRV && sd.totalCost > 0) {
    custoHtml = `<span class="doc-entry-cost">💰 ${formatarMoeda(sd.totalCost)}</span>`;
  } else if (!isSRV && sd.totalEstimado > 0) {
    custoHtml = `<span class="doc-entry-cost">💰 ${formatarMoeda(sd.totalEstimado)}</span>`;
  }

  // Status badge (se disponível)
  let statusBadge = "";
  if (isSRV && sd.status) {
    statusBadge = `<span class="badge ${OS_STATUS_CLASS[sd.status] || "badge-aberta"}">${OS_STATUS[sd.status] || sd.status}</span>`;
  } else if (!isSRV && sd.status) {
    statusBadge = `<span class="badge ${PO_STATUS_CLASS[sd.status] || "badge-andamento"}">${PO_STATUS[sd.status] || sd.status}</span>`;
  }

  // Link de origem
  const linkOrigem = isSRV
    ? `os-detalhe.html?id=${doc.sourceId}`
    : `../compras/compra-detalhe.html?id=${doc.sourceId}`;
  const textoOrigem = isSRV ? "Ver O.S →" : "Ver Pedido →";

  const setor = sd.sector || sd.setor || "";

  return `
    <div class="doc-entry ${tipoClass}" data-doc-id="${doc.id}" style="cursor:pointer;">
      <div class="doc-entry-body">
        <div class="doc-entry-top">
          <span class="doc-entry-number">${doc.numero || "—"}</span>
          <div class="doc-entry-badges">
            ${tipoBadge}
            ${statusBadge}
          </div>
        </div>
        <div class="doc-entry-summary">${resumoCurto}</div>
        <div class="doc-entry-meta">
          ${setor ? `<span>🏭 ${setor}</span>` : ""}
          <span>✍️ ${doc.emissor || "—"}</span>
          <span>🕐 ${formatarData(doc.emitidoEm || doc.timestampEnvio)}</span>
        </div>
      </div>
      <div class="doc-entry-footer">
        ${custoHtml}
        <div style="display:flex;gap:8px;margin-left:auto;">
          <a href="${linkOrigem}" class="doc-entry-link" onclick="event.stopPropagation()">${textoOrigem}</a>
          <a href="documentos.html?id=${doc.id}" class="doc-entry-link" onclick="event.stopPropagation()">Ver Documento →</a>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// MODO VISUALIZAÇÃO
// ============================================================
async function iniciarModoVisualizacao(id) {
  secaoVis.classList.remove("hidden");
  document.getElementById("header-subtitulo").textContent = "Visualizando Documento";
  document.getElementById("btn-back").href = "documentos.html";
  mostrarOverlay("Carregando documento...");

  try {
    const documento = await obterDocumentoPorId(id);
    renderizarDocumentoCompleto(documento);
  } catch (err) {
    console.error("[DOCUMENTOS] Erro ao carregar documento:", err);
    const el = document.getElementById("documento-completo");
    if (el) el.innerHTML = `
      <div class="empty-state" style="padding:60px 20px;text-align:center;">
        <div style="font-size:3rem;">⚠️</div>
        <h3>Documento não encontrado</h3>
        <p style="color:#64748b;margin:12px 0 24px;">${err.message || "Verifique a ligação e tente novamente."}</p>
        <a href="documentos.html" style="background:var(--primary);color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
          ← Voltar à Lista
        </a>
      </div>
    `;
  } finally {
    esconderOverlay();
  }

  document.getElementById("btn-voltar-lista")?.addEventListener("click", () => {
    window.location.href = "documentos.html";
  });
  document.getElementById("btn-imprimir")?.addEventListener("click", () => window.print());
}

function renderizarDocumentoCompleto(doc) {
  const el = document.getElementById("documento-completo");
  if (!el) return;

  const isSRV = doc.tipo === "service_report";
  const html = isSRV ? renderDocumentoSRV(doc) : renderDocumentoPO(doc);
  el.innerHTML = html;

  // Atualiza o título da tab do browser
  document.title = `SIGA — ${doc.numero || "Documento"}`;
}

// ============================================================
// RENDERER SRV (service_report)
// ============================================================
function renderDocumentoSRV(doc) {
  const sd = doc.sourceData || {};
  const mats = sd.materials || [];
  const timeline = sd.timeline || [];

  // Header
  const statusBadge = sd.status
    ? `<span class="badge ${OS_STATUS_CLASS[sd.status] || "badge-aberta"}">${OS_STATUS[sd.status] || sd.status}</span>`
    : "";
  const prioridadeBadge = sd.priority
    ? `<span class="badge ${OS_PRIORIDADE_CLASS[sd.priority] || ""}">${OS_PRIORIDADE[sd.priority] || sd.priority}</span>`
    : "";
  const tipoOSBadge = sd.type === "maintenance"
    ? `<span class="badge badge-manutencao">🔧 Manutenção</span>`
    : `<span class="badge badge-servico">🛠️ Serviço</span>`;

  const origemTexto = `${OS_ORIGEM[sd.origin] || sd.origin || "Manual"}${sd.originNome ? ` — ${sd.originNome}` : ""}`;

  // Seção técnica (manutenção vs serviço)
  const dadosTecnicosHtml = sd.type === "maintenance"
    ? renderSecaoManutencoeSRV(sd)
    : renderSecaoServicoSRV(sd);

  // Materiais
  const matsSectionHtml = mats.length > 0 ? renderTabelaMateriais(mats, sd) : "";

  // Timeline
  const timelineHtml = timeline.length > 0 ? renderTimeline(timeline) : "";

  return `
    <!-- HEADER DO DOCUMENTO -->
    <div class="doc-full-header srv">
      <div class="doc-full-header-top">
        <div>
          <span class="doc-full-tipo-label">Documento de Serviço — SIGA</span>
          <div class="doc-full-numero">${doc.numero || "SRV-?????"}</div>
        </div>
        <div class="doc-full-siga-stamp">SIGA</div>
      </div>
      <div class="doc-full-titulo">${sd.title || "Ordem de Serviço"}</div>
      <div class="doc-full-badges">
        ${tipoOSBadge}
        ${statusBadge}
        ${prioridadeBadge}
      </div>
      <div class="doc-full-meta-grid">
        <div class="doc-full-meta-item">
          <span class="doc-full-meta-label">Emitido por</span>
          <span class="doc-full-meta-valor">${doc.emissor || "—"}</span>
        </div>
        <div class="doc-full-meta-item">
          <span class="doc-full-meta-label">Data de Emissão</span>
          <span class="doc-full-meta-valor">${formatarData(doc.emitidoEm || doc.timestampEnvio)}</span>
        </div>
        <div class="doc-full-meta-item">
          <span class="doc-full-meta-label">Setor</span>
          <span class="doc-full-meta-valor">${sd.sector || "—"}</span>
        </div>
        <div class="doc-full-meta-item">
          <span class="doc-full-meta-label">Criado por</span>
          <span class="doc-full-meta-valor">${sd.criadoPor || sd.solicitante || "—"}</span>
        </div>
      </div>
    </div>

    <!-- SEÇÃO: CONTEXTO OPERACIONAL -->
    <div class="doc-full-section srv">
      <div class="doc-full-section-header">
        <span>📍</span>
        <h3 class="doc-full-section-title">Contexto Operacional</h3>
      </div>
      <div class="doc-full-section-body">
        <div class="doc-info-grid">
          <div class="doc-info-item">
            <span class="doc-info-label">Origem</span>
            <span class="doc-info-valor">${origemTexto}</span>
          </div>
          <div class="doc-info-item">
            <span class="doc-info-label">Ativo / Equipamento</span>
            <span class="doc-info-valor">${sd.originId ? `${sd.originId}${sd.originNome ? ` (${sd.originNome})` : ""}` : "—"}</span>
          </div>
          <div class="doc-info-item">
            <span class="doc-info-label">Setor</span>
            <span class="doc-info-valor">${sd.sector || "—"}</span>
          </div>
          <div class="doc-info-item">
            <span class="doc-info-label">Solicitante</span>
            <span class="doc-info-valor">${sd.solicitante || "—"}</span>
          </div>
          <div class="doc-info-item">
            <span class="doc-info-label">Prioridade</span>
            <span class="doc-info-valor">${OS_PRIORIDADE[sd.priority] || "—"}</span>
          </div>
          <div class="doc-info-item">
            <span class="doc-info-label">Status da O.S</span>
            <span class="doc-info-valor">${OS_STATUS[sd.status] || "—"}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- SEÇÃO: DESCRIÇÃO TÉCNICA -->
    <div class="doc-full-section srv">
      <div class="doc-full-section-header">
        <span>📝</span>
        <h3 class="doc-full-section-title">Descrição Técnica</h3>
      </div>
      <div class="doc-full-section-body" style="display:flex;flex-direction:column;gap:14px;">
        <div class="doc-text-block">
          <div class="doc-text-block-label">Título da O.S</div>
          <div class="doc-text-block-content">${sd.title || "—"}</div>
        </div>
        <div class="doc-text-block">
          <div class="doc-text-block-label">Descrição Detalhada</div>
          <div class="doc-text-block-content${!sd.description ? " vazio" : ""}">${sd.description || "Sem descrição registrada."}</div>
        </div>
      </div>
    </div>

    <!-- SEÇÃO: DADOS TÉCNICOS (manutenção ou serviço) -->
    ${dadosTecnicosHtml}

    <!-- SEÇÃO: MATERIAIS (se existirem) -->
    ${matsSectionHtml}

    <!-- SEÇÃO: DADOS VINCULADOS -->
    <div class="doc-full-section srv">
      <div class="doc-full-section-header">
        <span>🔗</span>
        <h3 class="doc-full-section-title">Origem do Documento</h3>
      </div>
      <div class="doc-full-section-body">
        <div class="doc-linked-card">
          <div class="doc-linked-icon">📋</div>
          <div class="doc-linked-info">
            <span class="doc-linked-tipo">Ordem de Serviço Original</span>
            <span class="doc-linked-titulo">${sd.title || doc.sourceId || "Ver O.S"}</span>
          </div>
          <a href="os-detalhe.html?id=${doc.sourceId}" class="doc-linked-btn">
            Abrir O.S →
          </a>
        </div>
      </div>
    </div>

    <!-- SEÇÃO: TIMELINE (se existir) -->
    ${timelineHtml ? `
    <div class="doc-full-section srv">
      <div class="doc-full-section-header">
        <span>📅</span>
        <h3 class="doc-full-section-title">Timeline de Eventos <span class="doc-full-section-badge">${timeline.length}</span></h3>
      </div>
      <div class="doc-full-section-body">
        <ul class="doc-timeline">
          ${timelineHtml}
        </ul>
      </div>
    </div>` : ""}
  `;
}

function renderSecaoManutencoeSRV(sd) {
  const downtimeHtml = sd.downtime
    ? `<span class="doc-downtime-badge sim">⛔ Equipamento Parado (Downtime)</span>`
    : `<span class="doc-downtime-badge nao">✅ Sem Parada de Produção</span>`;

  return `
    <div class="doc-full-section srv">
      <div class="doc-full-section-header">
        <span>🔧</span>
        <h3 class="doc-full-section-title">Dados de Manutenção</h3>
      </div>
      <div class="doc-full-section-body">
        <div class="doc-info-grid">
          <div class="doc-info-item">
            <span class="doc-info-label">Tipo de Manutenção</span>
            <span class="doc-info-valor">${OS_MANUTENCAO_TIPO[sd.maintenanceType] || "—"}</span>
          </div>
          <div class="doc-info-item">
            <span class="doc-info-label">Técnico Responsável</span>
            <span class="doc-info-valor">${sd.technician || "—"}</span>
          </div>
          <div class="doc-info-item">
            <span class="doc-info-label">Impacto Operacional</span>
            <span class="doc-info-valor">${downtimeHtml}</span>
          </div>
          ${sd.observations ? `
          <div class="doc-info-item doc-info-grid-full">
            <span class="doc-info-label">Observações</span>
            <span class="doc-info-valor">${sd.observations}</span>
          </div>` : ""}
        </div>
      </div>
    </div>
  `;
}

function renderSecaoServicoSRV(sd) {
  return `
    <div class="doc-full-section srv">
      <div class="doc-full-section-header">
        <span>🛠️</span>
        <h3 class="doc-full-section-title">Dados do Serviço</h3>
      </div>
      <div class="doc-full-section-body">
        <div class="doc-info-grid">
          <div class="doc-info-item">
            <span class="doc-info-label">Categoria</span>
            <span class="doc-info-valor">${SERVICE_CATEGORIAS[sd.serviceCategory] || "—"}</span>
          </div>
          <div class="doc-info-item">
            <span class="doc-info-label">Executor / Responsável</span>
            <span class="doc-info-valor">${sd.executor || "—"}</span>
          </div>
          <div class="doc-info-item">
            <span class="doc-info-label">Data de Início</span>
            <span class="doc-info-valor">${sd.startDate || "—"}</span>
          </div>
          <div class="doc-info-item">
            <span class="doc-info-label">Data de Término</span>
            <span class="doc-info-valor">${sd.endDate || "—"}</span>
          </div>
          ${sd.observations ? `
          <div class="doc-info-item doc-info-grid-full">
            <span class="doc-info-label">Observações</span>
            <span class="doc-info-valor">${sd.observations}</span>
          </div>` : ""}
        </div>
      </div>
    </div>
  `;
}

function renderTabelaMateriais(mats, sd) {
  const subtotalMats = mats.reduce((s, m) => s + (m.totalPrice || 0), 0);
  const laborCost = sd.laborCost || 0;
  const totalCost = sd.totalCost || (subtotalMats + laborCost);

  return `
    <div class="doc-full-section srv">
      <div class="doc-full-section-header">
        <span>📦</span>
        <h3 class="doc-full-section-title">Materiais Utilizados <span class="doc-full-section-badge">${mats.length}</span></h3>
      </div>
      <div class="doc-full-section-body" style="padding:0;">
        <table class="doc-full-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th class="right">Qtd.</th>
              <th class="right">Preço Unit.</th>
              <th class="right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${mats.map((m) => `
              <tr>
                <td>${m.description || "—"}</td>
                <td class="right">${m.quantity || 0}</td>
                <td class="right">${formatarMoeda(m.unitPrice)}</td>
                <td class="right td-total">${formatarMoeda(m.totalPrice)}</td>
              </tr>
            `).join("")}
            <tr class="doc-table-subtotal">
              <td colspan="3">Subtotal de Materiais</td>
              <td class="right">${formatarMoeda(subtotalMats)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- RESUMO DE CUSTOS -->
    <div class="doc-full-section srv">
      <div class="doc-full-section-header">
        <span>💰</span>
        <h3 class="doc-full-section-title">Resumo de Custos</h3>
      </div>
      <div class="doc-full-section-body">
        <div class="doc-cost-grid">
          <div class="doc-cost-card">
            <span class="doc-cost-label">📦 Materiais</span>
            <span class="doc-cost-valor">${formatarMoeda(subtotalMats)}</span>
          </div>
          <div class="doc-cost-card">
            <span class="doc-cost-label">👷 Mão de Obra</span>
            <span class="doc-cost-valor">${formatarMoeda(laborCost)}</span>
          </div>
          <div class="doc-cost-card total">
            <span class="doc-cost-label">💰 Total Geral</span>
            <span class="doc-cost-valor">${formatarMoeda(totalCost)}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// RENDERER PO (purchase_document)
// ============================================================
function renderDocumentoPO(doc) {
  const sd = doc.sourceData || {};
  const items = sd.items || [];
  const timeline = sd.timeline || [];

  // Badges
  const statusBadge = sd.status
    ? `<span class="badge ${PO_STATUS_CLASS[sd.status] || "badge-andamento"}">${PO_STATUS[sd.status] || sd.status}</span>`
    : "";
  const categoriaBadge = sd.categoria
    ? `<span class="badge badge-manutencao">${PO_CATEGORIAS[sd.categoria] || sd.categoria}</span>`
    : "";
  const urgenciaBadge = sd.urgencia && sd.urgencia !== "normal"
    ? `<span class="badge badge-aguardando">${PO_URGENCIA[sd.urgencia] || sd.urgencia}</span>`
    : "";

  const totalEstimado = sd.totalEstimado || items.reduce((s, i) => s + (i.precoTotal || 0), 0);

  // Timeline
  const timelineHtml = timeline.length > 0 ? renderTimeline(timeline) : "";

  return `
    <!-- HEADER DO DOCUMENTO -->
    <div class="doc-full-header po">
      <div class="doc-full-header-top">
        <div>
          <span class="doc-full-tipo-label">Documento de Compra — SIGA</span>
          <div class="doc-full-numero">${doc.numero || "PO-?????"}</div>
        </div>
        <div class="doc-full-siga-stamp">SIGA</div>
      </div>
      <div class="doc-full-titulo">${sd.justificativa?.substring(0, 100) || "Pedido de Compra"}</div>
      <div class="doc-full-badges">
        ${categoriaBadge}
        ${statusBadge}
        ${urgenciaBadge}
      </div>
      <div class="doc-full-meta-grid">
        <div class="doc-full-meta-item">
          <span class="doc-full-meta-label">Emitido por</span>
          <span class="doc-full-meta-valor">${doc.emissor || "—"}</span>
        </div>
        <div class="doc-full-meta-item">
          <span class="doc-full-meta-label">Data de Emissão</span>
          <span class="doc-full-meta-valor">${formatarData(doc.emitidoEm || doc.timestampEnvio)}</span>
        </div>
        <div class="doc-full-meta-item">
          <span class="doc-full-meta-label">Setor</span>
          <span class="doc-full-meta-valor">${sd.setor || "—"}</span>
        </div>
        <div class="doc-full-meta-item">
          <span class="doc-full-meta-label">Solicitante</span>
          <span class="doc-full-meta-valor">${sd.solicitante || "—"}</span>
        </div>
      </div>
    </div>

    <!-- SEÇÃO: IDENTIFICAÇÃO DO PEDIDO -->
    <div class="doc-full-section po">
      <div class="doc-full-section-header">
        <span>📋</span>
        <h3 class="doc-full-section-title">Identificação do Pedido</h3>
      </div>
      <div class="doc-full-section-body">
        <div class="doc-info-grid">
          <div class="doc-info-item">
            <span class="doc-info-label">Solicitante</span>
            <span class="doc-info-valor">${sd.solicitante || "—"}</span>
          </div>
          <div class="doc-info-item">
            <span class="doc-info-label">Setor</span>
            <span class="doc-info-valor">${sd.setor || "—"}</span>
          </div>
          <div class="doc-info-item">
            <span class="doc-info-label">Categoria</span>
            <span class="doc-info-valor">${PO_CATEGORIAS[sd.categoria] || "—"}</span>
          </div>
          <div class="doc-info-item">
            <span class="doc-info-label">Urgência</span>
            <span class="doc-info-valor">${PO_URGENCIA[sd.urgencia] || "Normal"}</span>
          </div>
          <div class="doc-info-item">
            <span class="doc-info-label">Fornecedor</span>
            <span class="doc-info-valor">${sd.fornecedor || "—"}</span>
          </div>
          <div class="doc-info-item">
            <span class="doc-info-label">Criado por</span>
            <span class="doc-info-valor">${sd.criadoPor || "—"}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- SEÇÃO: JUSTIFICATIVA -->
    <div class="doc-full-section po">
      <div class="doc-full-section-header">
        <span>📝</span>
        <h3 class="doc-full-section-title">Justificativa</h3>
      </div>
      <div class="doc-full-section-body">
        <div class="doc-text-block">
          <div class="doc-text-block-label">Motivo / Justificativa do Pedido</div>
          <div class="doc-text-block-content${!sd.justificativa ? " vazio" : ""}">${sd.justificativa || "Sem justificativa registrada."}</div>
        </div>
      </div>
    </div>

    <!-- SEÇÃO: ITENS DO PEDIDO -->
    ${items.length > 0 ? `
    <div class="doc-full-section po">
      <div class="doc-full-section-header">
        <span>🛒</span>
        <h3 class="doc-full-section-title">Itens do Pedido <span class="doc-full-section-badge">${items.length}</span></h3>
      </div>
      <div class="doc-full-section-body" style="padding:0;">
        <table class="doc-full-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th class="right">Qtd.</th>
              <th class="right">Preço Unit.</th>
              <th class="right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((i) => `
              <tr>
                <td>${i.descricao || "—"}</td>
                <td class="right">${i.quantidade || 0}</td>
                <td class="right">${formatarMoeda(i.precoUnitario)}</td>
                <td class="right td-total">${formatarMoeda(i.precoTotal)}</td>
              </tr>
            `).join("")}
            <tr class="doc-table-subtotal">
              <td colspan="3">Total Estimado</td>
              <td class="right">${formatarMoeda(totalEstimado)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>` : ""}

    <!-- SEÇÃO: RESUMO FINANCEIRO -->
    <div class="doc-full-section po">
      <div class="doc-full-section-header">
        <span>💰</span>
        <h3 class="doc-full-section-title">Resumo Financeiro</h3>
      </div>
      <div class="doc-full-section-body">
        <div class="doc-cost-grid doc-cost-grid-2">
          <div class="doc-cost-card">
            <span class="doc-cost-label">📦 Total de Itens</span>
            <span class="doc-cost-valor">${items.length} item(s)</span>
          </div>
          <div class="doc-cost-card total-amber">
            <span class="doc-cost-label">💰 Total Estimado</span>
            <span class="doc-cost-valor">${formatarMoeda(totalEstimado)}</span>
          </div>
        </div>
        ${sd.aprovadoPor ? `
        <div style="margin-top:14px;padding:12px 16px;background:#d1fae5;border:1px solid #6ee7b7;border-radius:8px;font-size:0.88rem;color:#065f46;font-weight:600;">
          ✅ Aprovado por: ${sd.aprovadoPor}${sd.aprovadoTimestamp ? ` · ${formatarData(sd.aprovadoTimestamp)}` : ""}
        </div>` : ""}
        ${sd.motivoRejeicao ? `
        <div style="margin-top:14px;padding:12px 16px;background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;font-size:0.88rem;color:#991b1b;font-weight:600;">
          ❌ Rejeitado: ${sd.motivoRejeicao}
        </div>` : ""}
      </div>
    </div>

    <!-- SEÇÃO: ORIGEM DO PEDIDO -->
    <div class="doc-full-section po">
      <div class="doc-full-section-header">
        <span>🔗</span>
        <h3 class="doc-full-section-title">Origem do Documento</h3>
      </div>
      <div class="doc-full-section-body">
        <div class="doc-linked-card">
          <div class="doc-linked-icon">🛒</div>
          <div class="doc-linked-info">
            <span class="doc-linked-tipo">Pedido de Compra Original</span>
            <span class="doc-linked-titulo">${sd.justificativa?.substring(0, 80) || doc.sourceId || "Ver Pedido"}</span>
          </div>
          <a href="../compras/compra-detalhe.html?id=${doc.sourceId}" class="doc-linked-btn amber">
            Abrir Pedido →
          </a>
        </div>
      </div>
    </div>

    <!-- SEÇÃO: TIMELINE (se existir) -->
    ${timelineHtml ? `
    <div class="doc-full-section po">
      <div class="doc-full-section-header">
        <span>📅</span>
        <h3 class="doc-full-section-title">Histórico de Eventos <span class="doc-full-section-badge">${timeline.length}</span></h3>
      </div>
      <div class="doc-full-section-body">
        <ul class="doc-timeline">
          ${timelineHtml}
        </ul>
      </div>
    </div>` : ""}
  `;
}

// ============================================================
// HELPERS — TIMELINE E EMPTY STATE
// ============================================================
function renderTimeline(timeline) {
  if (!Array.isArray(timeline) || timeline.length === 0) return "";
  return [...timeline]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .map((ev) => `
      <li class="doc-timeline-item">
        <span class="doc-timeline-dot">${ev.icone || "📝"}</span>
        <div class="doc-timeline-content">
          <span class="doc-timeline-acao">${ev.acao || "Evento"}</span>
          ${ev.nota ? `<span class="doc-timeline-nota">${ev.nota}</span>` : ""}
          <span class="doc-timeline-meta">${ev.usuario || "—"} · ${formatarData(ev.timestamp)}</span>
        </div>
      </li>
    `).join("");
}

function renderEmptyState(icone, titulo, descricao) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icone}</div>
      <h3>${titulo}</h3>
      <p>${descricao}</p>
    </div>
  `;
}

// ============================================================
// OVERLAY / TOAST
// ============================================================
function mostrarOverlay(msg = "Processando...") {
  if (overlayMsg) overlayMsg.textContent = msg;
  if (overlay) overlay.classList.remove("hidden");
}

function esconderOverlay() {
  if (overlay) overlay.classList.add("hidden");
}

function mostrarToast(msg, tipo = "sucesso") {
  if (!toast) { console.warn("[TOAST]", msg); return; }
  toast.textContent = msg;
  toast.className = `toast ${tipo} show`;
  setTimeout(() => toast.classList.remove("show"), 3500);
}

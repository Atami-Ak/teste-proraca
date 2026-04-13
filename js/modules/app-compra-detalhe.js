/**
 * app-compra-detalhe.js - Criar / Visualizar Pedido de Compra
 * Página: compras/compra-detalhe.html
 * Modos: ?modo=criar  |  ?id=FIREBASE_ID
 */
import { checkAuth } from "../core/db-auth.js";
import {
  criarPedidoCompra,
  obterPedidoPorId,
  atualizarPedido,
  gerarDocumentoCompra,
  PO_CATEGORIAS,
  PO_STATUS,
  PO_STATUS_CLASS,
  PO_URGENCIA,
  formatarData,
  formatarMoeda,
  calcularTotalItens,
} from "../core/db-compras.js";

// ============================================================
// AUTENTICAÇÃO
// ============================================================
const sessaoAtual = await checkAuth("compra-detalhe");

// ============================================================
// ELEMENTOS DO DOM
// ============================================================
const overlay = document.getElementById("overlay");
const overlayMsg = document.getElementById("overlay-msg");
const toast = document.getElementById("toast");
const secaoCriar = document.getElementById("secao-criar");
const secaoVis = document.getElementById("secao-visualizacao");

// ============================================================
// ESTADO — must be declared before the IIFE runs to avoid TDZ
// ============================================================
let itens = [];
let pedidoAtual = null;

// ============================================================
// INICIALIZAÇÃO
// ============================================================
(async () => {
  const params = new URLSearchParams(window.location.search);
  const modo = params.get("modo");
  const id = params.get("id");

  if (modo === "criar") {
    initModoCriar(params);
  } else if (id) {
    await initModoVisualizar(id);
  } else {
    // No valid params — go to create mode as fallback
    initModoCriar(new URLSearchParams("modo=criar"));
  }
})();

// ============================================================
// MODO CRIAÇÃO
// ============================================================
function initModoCriar(params) {
  esconderOverlay(); // Clear any initial spinner — no async fetch needed in create mode
  secaoCriar.classList.remove("hidden");

  // Pré-preencher se vier de uma O.S (osId param)
  const osId = params.get("osId");
  if (osId) {
    // Pode ser usado para pré-vincular a O.S de origem
    document.getElementById("justificativa").value = `Gerado a partir da O.S: ${osId}`;
  }

  configurarItens();

  document.getElementById("form-compra").addEventListener("submit", async (e) => {
    e.preventDefault();
    await salvarPedido();
  });
}

// ============================================================
// ITENS — lista dinâmica
// ============================================================

function configurarItens() {
  document.getElementById("btn-add-item").addEventListener("click", () => adicionarLinhaItem());
  adicionarLinhaItem(); // começa com 1 linha
}

function adicionarLinhaItem(desc = "", qty = 1, unitPrice = 0) {
  const idx = itens.length;
  itens.push({ desc, qty, unitPrice, total: 0 });

  const lista = document.getElementById("itens-lista");
  const row = document.createElement("div");
  row.className = "material-row";
  row.dataset.idx = idx;
  row.innerHTML = `
    <input type="text" class="mat-desc" placeholder="Descrição do item" value="${desc}" />
    <input type="number" class="mat-qty" placeholder="0" min="1" step="1" value="${qty}" />
    <input type="number" class="mat-unit" placeholder="0.00" min="0" step="0.01" value="${unitPrice > 0 ? unitPrice : ''}" />
    <input type="text" class="mat-total" readonly placeholder="0,00" style="background:#f8fafc;color:#0f4c75;font-weight:600;" />
    <button type="button" class="btn-remover-mat" title="Remover">✕</button>
  `;

  row.querySelector(".mat-qty").addEventListener("input", () => atualizarLinhaItem(row, idx));
  row.querySelector(".mat-unit").addEventListener("input", () => atualizarLinhaItem(row, idx));
  row.querySelector(".btn-remover-mat").addEventListener("click", () => {
    row.remove();
    itens[idx] = null;
    recalcularTotal();
  });

  lista.appendChild(row);
  atualizarLinhaItem(row, idx);
}

function atualizarLinhaItem(row, idx) {
  const qty = parseFloat(row.querySelector(".mat-qty").value) || 0;
  const unit = parseFloat(row.querySelector(".mat-unit").value) || 0;
  const total = qty * unit;
  row.querySelector(".mat-total").value = total.toFixed(2).replace(".", ",");
  if (itens[idx] !== null) {
    itens[idx] = {
      desc: row.querySelector(".mat-desc").value,
      qty,
      unitPrice: unit,
      total,
    };
  }
  recalcularTotal();
}

function recalcularTotal() {
  const total = itens.filter(Boolean).reduce((s, i) => s + (i.total || 0), 0);
  document.getElementById("totalEstimado").value = `R$ ${total.toFixed(2).replace(".", ",")}`;
}

function coletarItens() {
  return itens.filter(Boolean).filter((i) => i.desc && i.qty > 0).map((i) => ({
    descricao: i.desc,
    quantidade: i.qty,
    precoUnitario: i.unitPrice,
    precoTotal: i.total,
  }));
}

// ============================================================
// SALVAR PEDIDO
// ============================================================
async function salvarPedido() {
  const categoria = document.getElementById("categoria").value;
  const solicitante = document.getElementById("solicitante").value.trim();
  const setor = document.getElementById("setor").value;
  const justificativa = document.getElementById("justificativa").value.trim();

  if (!categoria || !solicitante || !setor || !justificativa) {
    return mostrarToast("Preencha todos os campos obrigatórios.", "erro");
  }

  const itensList = coletarItens();
  if (itensList.length === 0) {
    return mostrarToast("Adicione pelo menos um item ao pedido.", "erro");
  }

  const payload = {
    categoria,
    solicitante,
    setor,
    justificativa,
    fornecedor: document.getElementById("fornecedor").value.trim(),
    urgencia: document.getElementById("urgencia").value,
    items: itensList,
    criadoPor: sessaoAtual.nome,
    status: "pending",
  };

  mostrarOverlay("Salvando pedido de compra...");
  try {
    const id = await criarPedidoCompra(payload);
    mostrarToast("Pedido criado com sucesso!", "sucesso");
    setTimeout(() => {
      window.location.href = `compra-detalhe.html?id=${id}`;
    }, 800);
  } catch (err) {
    console.error(err);
    mostrarToast("Erro ao criar pedido.", "erro");
  } finally {
    esconderOverlay();
  }
}

// ============================================================
// MODO VISUALIZAÇÃO
// ============================================================

async function initModoVisualizar(id) {
  secaoVis.classList.remove("hidden");
  mostrarOverlay("Carregando pedido...");

  try {
    pedidoAtual = await obterPedidoPorId(id);
    renderizarDetalhe(pedidoAtual);
    configurarAcoes(pedidoAtual);
  } catch (err) {
    console.error("Erro ao carregar pedido:", err);
    secaoVis.innerHTML = `
      <div class="empty-state" style="padding: 60px 20px; text-align: center;">
        <div style="font-size: 3rem;">⚠️</div>
        <h3>Não foi possível carregar este pedido.</h3>
        <p style="color: var(--text-muted); margin: 12px 0 24px;">
          ${err.message || "Verifique a sua ligação e tente novamente."}
        </p>
        <a href="compras.html" style="background: var(--primary); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          ← Voltar à lista de Compras
        </a>
      </div>
    `;
  } finally {
    esconderOverlay();
  }
}

function renderizarDetalhe(p) {
  document.getElementById("header-subtitulo").textContent = "Pedido de Compra";

  document.getElementById("detalhe-numero").textContent = p.documentoNumero || "#PO";
  document.getElementById("detalhe-titulo").textContent = p.justificativa?.substring(0, 80) || "Sem descrição";
  document.getElementById("detalhe-badges").innerHTML = `
    ${getBadgeCategoria(p.categoria)}
    ${getBadgeStatus(p.status)}
    ${p.urgencia && p.urgencia !== "normal" ? `<span class="badge badge-aguardando">${PO_URGENCIA[p.urgencia] || p.urgencia}</span>` : ""}
  `;
  document.getElementById("detalhe-meta").innerHTML = `
    <span>👤 ${p.solicitante || "—"}</span>
    <span>🏭 ${p.setor || "—"}</span>
    <span>💰 ${formatarMoeda(p.totalEstimado)}</span>
    <span>🕐 ${formatarData(p.createdAt || p.timestampEnvio)}</span>
  `;

  // Marcar status ativo
  document.querySelectorAll(".btn-status").forEach((btn) => {
    btn.classList.toggle("ativo", btn.dataset.status === p.status);
  });

  // Dados do pedido
  document.getElementById("dados-compra").innerHTML = `
    <div class="info-grid">
      <div class="info-item"><span class="info-label">Categoria</span><span>${PO_CATEGORIAS[p.categoria] || p.categoria}</span></div>
      <div class="info-item"><span class="info-label">Urgência</span><span>${PO_URGENCIA[p.urgencia] || "Normal"}</span></div>
      <div class="info-item"><span class="info-label">Solicitante</span><span>${p.solicitante || "—"}</span></div>
      <div class="info-item"><span class="info-label">Setor</span><span>${p.setor || "—"}</span></div>
      <div class="info-item"><span class="info-label">Fornecedor</span><span>${p.fornecedor || "—"}</span></div>
      <div class="info-item"><span class="info-label">Criado por</span><span>${p.criadoPor || "—"}</span></div>
      <div class="info-item info-item-full"><span class="info-label">Justificativa</span><span>${p.justificativa || "—"}</span></div>
    </div>
  `;

  // Itens
  const items = p.items || [];
  if (items.length > 0) {
    document.getElementById("itens-view").innerHTML = `
      <table class="materiais-table">
        <thead>
          <tr><th>Descrição</th><th>Qtd.</th><th>Preço Unit.</th><th>Total</th></tr>
        </thead>
        <tbody>
          ${items.map((i) => `
            <tr>
              <td>${i.descricao}</td>
              <td>${i.quantidade}</td>
              <td>${formatarMoeda(i.precoUnitario)}</td>
              <td>${formatarMoeda(i.precoTotal)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    document.getElementById("total-view").innerHTML = `
      <div class="custo-linha custo-total">
        <span>Total Estimado:</span>
        <strong>${formatarMoeda(p.totalEstimado || calcularTotalItens(items))}</strong>
      </div>
    `;
  }

  // O.S de origem
  if (p.osId) {
    document.getElementById("secao-os-origem").classList.remove("hidden");
    document.getElementById("info-os-origem").innerHTML = `
      <div class="doc-vinculado">
        <span class="doc-tipo">Gerado a partir de O.S</span>
        <a href="../os/os-detalhe.html?id=${p.osId}" class="btn-link-doc">Ver O.S →</a>
      </div>
    `;
  }

  // Documento vinculado
  if (p.documentoNumero) {
    document.getElementById("secao-documento-vinculado").classList.remove("hidden");
    document.getElementById("info-documento").innerHTML = `
      <div class="doc-vinculado">
        <span class="doc-numero">${p.documentoNumero}</span>
        <span class="doc-tipo">Documento de Compra</span>
        <a href="../os/documentos.html" class="btn-link-doc">Ver Documentos →</a>
      </div>
    `;
  }
}

// ============================================================
// CONFIGURAR AÇÕES
// ============================================================
function configurarAcoes(p) {
  // Botões de status
  document.querySelectorAll(".btn-status").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.status === p.status) return;
      await alterarStatus(p.id, btn.dataset.status);
    });
  });

  // Gerar documento PO
  const btnDoc = document.getElementById("btn-gerar-documento");
  if (!p.documentoNumero) {
    btnDoc.addEventListener("click", () => gerarDocumento(p));
  } else {
    btnDoc.textContent = `📄 ${p.documentoNumero}`;
    btnDoc.disabled = true;
  }

  // Modal documento
  document.getElementById("fechar-modal-doc").addEventListener("click", fecharModalDoc);
  document.getElementById("fechar-modal-doc-btn").addEventListener("click", fecharModalDoc);
  document.getElementById("btn-imprimir-doc").addEventListener("click", () => window.print());
}

async function alterarStatus(id, novoStatus) {
  mostrarOverlay("Atualizando status...");
  try {
    await atualizarPedido(id, { status: novoStatus });
    pedidoAtual.status = novoStatus;
    document.querySelectorAll(".btn-status").forEach((b) => {
      b.classList.toggle("ativo", b.dataset.status === novoStatus);
    });
    mostrarToast(`Status: ${PO_STATUS[novoStatus]}`, "sucesso");
  } catch (err) {
    console.error(err);
    mostrarToast("Erro ao atualizar status.", "erro");
  } finally {
    esconderOverlay();
  }
}

async function gerarDocumento(p) {
  mostrarOverlay("Gerando documento PO...");
  try {
    const resultado = await gerarDocumentoCompra(p.id, p, sessaoAtual.nome);
    pedidoAtual.documentoNumero = resultado.numero;
    pedidoAtual.documentoId = resultado.id;

    const btn = document.getElementById("btn-gerar-documento");
    btn.textContent = `📄 ${resultado.numero}`;
    btn.disabled = true;

    document.getElementById("secao-documento-vinculado").classList.remove("hidden");
    document.getElementById("info-documento").innerHTML = `
      <div class="doc-vinculado">
        <span class="doc-numero">${resultado.numero}</span>
        <span class="doc-tipo">Documento de Compra gerado</span>
        <a href="../os/documentos.html" class="btn-link-doc">Ver Documentos →</a>
      </div>
    `;
    mostrarToast(`Documento ${resultado.numero} gerado!`, "sucesso");
  } catch (err) {
    console.error(err);
    mostrarToast("Erro ao gerar documento.", "erro");
  } finally {
    esconderOverlay();
  }
}

function fecharModalDoc() {
  document.getElementById("modal-documento").classList.add("hidden");
}

// ============================================================
// BADGES
// ============================================================
function getBadgeCategoria(categoria) {
  const classes = {
    peca: "badge-manutencao", equipamento: "badge-servico",
    servico: "badge-andamento", operacional: "badge-aberta",
  };
  const icons = { peca: "🔩", equipamento: "⚙️", servico: "🛠️", operacional: "📦" };
  return `<span class="badge ${classes[categoria] || "badge-manutencao"}">${icons[categoria] || "🛒"} ${PO_CATEGORIAS[categoria] || categoria}</span>`;
}

function getBadgeStatus(status) {
  const cls = PO_STATUS_CLASS[status] || "badge-aberta";
  return `<span class="badge ${cls}">${PO_STATUS[status] || status}</span>`;
}

// ============================================================
// OVERLAY / TOAST
// ============================================================
function mostrarOverlay(msg = "Processando...") {
  overlayMsg.textContent = msg;
  overlay.classList.remove("hidden");
}

function esconderOverlay() {
  overlay.classList.add("hidden");
}

function mostrarToast(msg, tipo = "sucesso") {
  toast.textContent = msg;
  toast.className = `toast ${tipo} show`;
  setTimeout(() => toast.classList.remove("show"), 3500);
}

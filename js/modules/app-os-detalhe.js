/**
 * app-os-detalhe.js - Criar / Visualizar Ordem de Serviço
 * Página: os/os-detalhe.html
 * Modos: ?modo=criar  |  ?id=FIREBASE_ID
 */
import { checkAuth } from "../core/db-auth.js";
import {
  criarOS,
  obterOSPorId,
  atualizarOS,
  adicionarLog,
  gerarDocumentoServico,
  criarPedidoFromOS,
  registrarInicioReal,
  registrarFimReal,
  OS_TIPOS,
  OS_STATUS,
  OS_PRIORIDADE,
  OS_ORIGEM,
  SERVICE_CATEGORIAS,
  OS_MANUTENCAO_TIPO,
  formatarData,
  formatarDataCurta,
  formatarMoeda,
} from "../core/db-os.js";
import { updateMachineState } from "../core/machine-state-engine.js";

// ============================================================
// AUTENTICAÇÃO
// ============================================================
const sessaoAtual = await checkAuth("os-detalhe");

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
let materiais = [];
let pecas = [];
let modeParamGlobal = null; // "execute" when arriving from pending WO action
let osAtual = null;

// ============================================================
// INICIALIZAÇÃO
// ============================================================
// DOMContentLoaded already fired before this module resumes after
// await checkAuth() — call directly instead of registering a listener.
(async () => {
  const params = new URLSearchParams(window.location.search);
  const modo = params.get("modo");
  const id = params.get("id");

  if (modo === "criar") {
    await initModoCriar(params);
  } else if (id) {
    await initModoVisualizar(id);
  } else {
    // No valid params — go to create mode as fallback instead of redirect loop
    await initModoCriar(new URLSearchParams("modo=criar"));
  }
})();

// ============================================================
// MODO CRIAÇÃO
// ============================================================
async function initModoCriar(params) {
  esconderOverlay(); // Clear any initial spinner — no async fetch needed in create mode
  secaoCriar.classList.remove("hidden");

  // ── Pre-fill fields from URL params (machine/fleet context) ──
  const origin     = params.get("origin");
  const originId   = params.get("originId");
  const originNome = params.get("originNome") || params.get("nome"); // accept both param names
  const tipoParam  = params.get("tipo");
  const sectorParam = params.get("sector");
  const modeParam  = params.get("mode");     // "execute" → arriving from a pending WO action
  const legacyId   = params.get("legacyId"); // traceability link to historico_manutencao record
  modeParamGlobal  = modeParam;

  if (origin)     document.getElementById("origin").value  = origin;
  if (originId)   document.getElementById("originId").value = originId;
  if (originNome) document.getElementById("originNome").value = decodeURIComponent(originNome);
  if (sectorParam) {
    const sel = document.getElementById("sector");
    if (sel) sel.value = decodeURIComponent(sectorParam);
  }
  if (tipoParam) {
    document.getElementById("tipo").value = tipoParam;
    mostrarSecaoEspecifica(tipoParam);
  }

  // ── Machine context banner (shown when arriving from machine history) ──
  if (origin === "machine" && originId) {
    const machineName = originNome ? decodeURIComponent(originNome) : originId;
    const isExecution = modeParam === "execute";
    const bannerBg    = isExecution ? "#eff6ff" : "#f0fdf4";
    const bannerBdr   = isExecution ? "#bfdbfe" : "#86efac";
    const bannerColor = isExecution ? "#1e40af" : "#166534";
    const bannerIcon  = isExecution ? "▶" : "⚙️";
    const bannerText  = isExecution
      ? `Executando O.S. para: <strong>${machineName}</strong> (${originId})`
      : `Criando O.S. para o ativo: <strong>${machineName}</strong> (${originId})`;

    const banner = document.createElement("div");
    banner.style.cssText = `background:${bannerBg};border:1.5px solid ${bannerBdr};border-radius:8px;
      padding:12px 16px;margin-bottom:16px;font-size:.88rem;color:${bannerColor};display:flex;align-items:center;gap:10px;`;
    banner.innerHTML = `<span style="font-size:1.2rem;">${bannerIcon}</span><span>${bannerText}</span>`;

    const formEl = document.getElementById("form-os");
    if (formEl) formEl.insertAdjacentElement("beforebegin", banner);

    // Lock asset fields so user can't accidentally change machine context
    const originIdEl   = document.getElementById("originId");
    const originNomeEl = document.getElementById("originNome");
    const originEl     = document.getElementById("origin");
    if (originIdEl)   { originIdEl.readOnly   = true; originIdEl.style.background   = "#f8fafc"; }
    if (originNomeEl) { originNomeEl.readOnly  = true; originNomeEl.style.background = "#f8fafc"; }
    if (originEl)     { originEl.disabled      = true; }

    // In execution mode: pre-set status to in_progress
    if (isExecution) {
      const statusSel = document.getElementById("status");
      if (statusSel) statusSel.value = "in_progress";
    }
  }

  // ── Traceability: if this WO was created from a legacy record, store the link ──
  if (legacyId) {
    // Attach as a hidden input so salvarOS() can include it in the payload
    const hidden = document.createElement("input");
    hidden.type  = "hidden";
    hidden.id    = "legacyRecordId";
    hidden.value = decodeURIComponent(legacyId);
    document.getElementById("form-os")?.appendChild(hidden);
  }

  // Listener: tipo de O.S muda a seção condicional
  document.getElementById("tipo").addEventListener("change", (e) => {
    mostrarSecaoEspecifica(e.target.value);
  });

  // Materiais (serviço) e Peças (manutenção)
  configurarMateriais();
  configurarPecas();

  // Submit
  document.getElementById("form-os").addEventListener("submit", async (e) => {
    e.preventDefault();
    await salvarOS();
  });
}

function mostrarSecaoEspecifica(tipo) {
  document.getElementById("secao-manutencao").classList.add("hidden");
  document.getElementById("secao-servico").classList.add("hidden");
  document.getElementById("secao-pecas-criar").classList.add("hidden");

  if (tipo === "maintenance") {
    document.getElementById("secao-manutencao").classList.remove("hidden");
    document.getElementById("secao-pecas-criar").classList.remove("hidden");
  } else if (tipo === "service") {
    document.getElementById("secao-servico").classList.remove("hidden");
  }
}

// ============================================================
// MATERIAIS — lista dinâmica (modo criação)
// ============================================================

function configurarMateriais() {
  document.getElementById("btn-add-material").addEventListener("click", () => adicionarLinhaMateria());
  document.getElementById("laborCost").addEventListener("input", recalcularCustos);
  adicionarLinhaMateria(); // começa com 1 linha vazia
}

function adicionarLinhaMateria(desc = "", qty = 1, unitPrice = 0) {
  const idx = materiais.length;
  materiais.push({ desc, qty, unitPrice, total: 0 });

  const lista = document.getElementById("materiais-lista");
  const row = document.createElement("div");
  row.className = "material-row";
  row.dataset.idx = idx;
  row.innerHTML = `
    <input type="text" class="mat-desc" placeholder="Descrição do material" value="${desc}" />
    <input type="number" class="mat-qty" placeholder="0" min="1" step="1" value="${qty}" />
    <input type="number" class="mat-unit" placeholder="0.00" min="0" step="0.01" value="${unitPrice > 0 ? unitPrice : ''}" />
    <input type="text" class="mat-total" readonly placeholder="0,00" style="background:#f8fafc;color:#0f4c75;font-weight:600;" />
    <button type="button" class="btn-remover-mat" title="Remover">✕</button>
  `;

  row.querySelector(".mat-qty").addEventListener("input", () => atualizarLinhaMaterial(row, idx));
  row.querySelector(".mat-unit").addEventListener("input", () => atualizarLinhaMaterial(row, idx));
  row.querySelector(".btn-remover-mat").addEventListener("click", () => {
    row.remove();
    materiais[idx] = null; // marca como removido
    recalcularCustos();
  });

  lista.appendChild(row);
  atualizarLinhaMaterial(row, idx);
}

function atualizarLinhaMaterial(row, idx) {
  const qty = parseFloat(row.querySelector(".mat-qty").value) || 0;
  const unit = parseFloat(row.querySelector(".mat-unit").value) || 0;
  const total = qty * unit;
  row.querySelector(".mat-total").value = total.toFixed(2).replace(".", ",");
  if (materiais[idx] !== null) {
    materiais[idx] = {
      desc: row.querySelector(".mat-desc").value,
      qty,
      unitPrice: unit,
      total,
    };
  }
  recalcularCustos();
}

function recalcularCustos() {
  const matTotal = materiais.filter(Boolean).reduce((s, m) => s + (m.total || 0), 0);
  const labor = parseFloat(document.getElementById("laborCost").value) || 0;
  const grand = matTotal + labor;

  document.getElementById("materialsCost").value = matTotal.toFixed(2).replace(".", ",");
  document.getElementById("totalCost").value = grand.toFixed(2).replace(".", ",");
}

function coletarMateriais() {
  return materiais.filter(Boolean).filter((m) => m.desc && m.qty > 0).map((m) => ({
    description: m.desc,
    quantity: m.qty,
    unitPrice: m.unitPrice,
    totalPrice: m.total,
  }));
}

// ============================================================
// PEÇAS — lista dinâmica para manutenção (modo criação)
// ============================================================

function configurarPecas() {
  const btn = document.getElementById("btn-add-peca");
  if (btn) btn.addEventListener("click", () => adicionarLinhaPeca());
}

function adicionarLinhaPeca(nome = "", qty = 1, unidade = "un") {
  const idx = pecas.length;
  pecas.push({ nome, qty, unidade });

  const lista = document.getElementById("pecas-lista");
  if (!lista) return;

  const row = document.createElement("div");
  row.className = "peca-row";
  row.dataset.idx = idx;
  row.innerHTML = `
    <input type="text" class="peca-nome" placeholder="Nome da peça ou material" value="${nome}" />
    <input type="number" class="peca-qty" placeholder="1" min="1" step="1" value="${qty}" />
    <input type="text" class="peca-unid" placeholder="un" value="${unidade}" style="width:70px;" />
    <button type="button" class="btn-remover-mat" title="Remover">✕</button>
  `;

  row.querySelector(".peca-nome").addEventListener("input", (e) => { if (pecas[idx]) pecas[idx].nome = e.target.value; });
  row.querySelector(".peca-qty").addEventListener("input", (e) => { if (pecas[idx]) pecas[idx].qty = parseFloat(e.target.value) || 1; });
  row.querySelector(".peca-unid").addEventListener("input", (e) => { if (pecas[idx]) pecas[idx].unidade = e.target.value; });
  row.querySelector(".btn-remover-mat").addEventListener("click", () => {
    row.remove();
    pecas[idx] = null;
  });

  lista.appendChild(row);
}

function coletarPecas() {
  return pecas.filter(Boolean).filter((p) => p.nome).map((p) => ({
    nome: p.nome,
    quantidade: p.qty || 1,
    unidade: p.unidade || "un",
  }));
}

// ============================================================
// SALVAR O.S
// ============================================================
async function salvarOS() {
  const tipo = document.getElementById("tipo").value;
  if (!tipo) return mostrarToast("Selecione o tipo de O.S.", "erro");

  const title = document.getElementById("title").value.trim();
  const description = document.getElementById("description").value.trim();
  const sector = document.getElementById("sector").value;
  if (!title || !description || !sector) {
    return mostrarToast("Preencha os campos obrigatórios.", "erro");
  }

  const payload = {
    type: tipo,
    title,
    description,
    priority: document.getElementById("priority").value,
    origin: document.getElementById("origin").value,
    originId: document.getElementById("originId").value.trim(),
    originNome: document.getElementById("originNome").value.trim(),
    sector,
    solicitante: document.getElementById("solicitante").value.trim(),
    status: document.getElementById("status").value,
    criadoPor: sessaoAtual.nome,
    // Traceability: link to legacy historico_manutencao record if this WO migrates one
    ...(document.getElementById("legacyRecordId")?.value
      ? { legacyRecordId: document.getElementById("legacyRecordId").value }
      : {}),
  };

  // Scheduling (both types)
  const plannedStart = document.getElementById("plannedStart")?.value;
  const plannedEnd   = document.getElementById("plannedEnd")?.value;
  payload.scheduling = {
    plannedStart: plannedStart ? new Date(plannedStart).getTime() : null,
    plannedEnd:   plannedEnd   ? new Date(plannedEnd).getTime()   : null,
    actualStart:  null,
    actualEnd:    null,
    durationHours: null,
  };

  if (tipo === "maintenance") {
    payload.maintenanceType = document.getElementById("maintenanceType").value;
    payload.technician = document.getElementById("technician").value.trim();
    payload.downtime = document.getElementById("downtime").checked;
    payload.observations = document.getElementById("obs-manutencao").value.trim();
    payload.resources = { parts: coletarPecas(), laborHours: null, notes: "" };
  }

  if (tipo === "service") {
    const mats = coletarMateriais();
    const matsCost = mats.reduce((s, m) => s + (m.totalPrice || 0), 0);
    const labor = parseFloat(document.getElementById("laborCost").value) || 0;
    payload.serviceCategory = document.getElementById("serviceCategory").value;
    payload.executor = document.getElementById("executor").value.trim();
    payload.startDate = document.getElementById("startDate").value;
    payload.endDate = document.getElementById("endDate").value;
    payload.materials = mats;
    payload.laborCost = labor;
    payload.materialsCost = matsCost;
    payload.totalCost = labor + matsCost;
    payload.observations = document.getElementById("observations").value.trim();
  }

  mostrarOverlay("Salvando Ordem de Serviço...");
  try {
    const id = await criarOS(payload);
    // If arriving from execution flow, register the actual start time immediately
    if (modeParamGlobal === "execute" && payload.status === "in_progress") {
      await registrarInicioReal(id);
    }
    mostrarToast("O.S criada com sucesso!", "sucesso");
    setTimeout(() => {
      window.location.href = `os-detalhe.html?id=${id}`;
    }, 800);
  } catch (err) {
    console.error(err);
    mostrarToast("Erro ao criar O.S.", "erro");
  } finally {
    esconderOverlay();
  }
}

// ============================================================
// MODO VISUALIZAÇÃO
// ============================================================

async function initModoVisualizar(id) {
  secaoVis.classList.remove("hidden");
  mostrarOverlay("Carregando O.S...");

  try {
    osAtual = await obterOSPorId(id);
    renderizarDetalhe(osAtual);
    configurarAcoes(osAtual);
  } catch (err) {
    console.error("Erro ao carregar O.S:", err);
    secaoVis.innerHTML = `
      <div class="empty-state" style="padding: 60px 20px; text-align: center;">
        <div style="font-size: 3rem;">⚠️</div>
        <h3>Não foi possível carregar esta O.S.</h3>
        <p style="color: var(--text-muted); margin: 12px 0 24px;">
          ${err.message || "Verifique a sua ligação e tente novamente."}
        </p>
        <a href="os.html" style="background: var(--primary); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          ← Voltar à lista de O.S.
        </a>
      </div>
    `;
  } finally {
    esconderOverlay();
  }
}

function renderizarDetalhe(os) {
  document.getElementById("header-subtitulo").textContent =
    os.type === "maintenance" ? "Manutenção" : "Serviço";

  const numero = os.numero || os.id.substring(0, 8).toUpperCase();

  // Doc header
  const el = (id) => document.getElementById(id);
  if (el("doc-tipo-label")) el("doc-tipo-label").textContent =
    os.type === "maintenance" ? "🔧 MANUTENÇÃO" : "🛠️ SERVIÇO";
  el("detalhe-numero").textContent = `#${numero}`;
  el("detalhe-titulo").textContent = os.title || "Sem título";
  el("detalhe-badges").innerHTML = `
    ${getBadgeTipo(os.type)}
    ${getBadgeStatus(os.status)}
    ${getBadgePrioridade(os.priority)}
  `;
  if (el("doc-created-at")) el("doc-created-at").textContent = formatarData(os.createdAt || os.timestampEnvio);
  if (el("doc-completed-at")) el("doc-completed-at").textContent = os.completedAt ? formatarData(os.completedAt) : "—";
  if (el("doc-solicitante")) el("doc-solicitante").textContent = os.solicitante || "—";
  if (el("doc-criado-por")) el("doc-criado-por").textContent = os.criadoPor || "—";

  // Marcar botão de status ativo
  document.querySelectorAll(".btn-status").forEach((btn) => {
    btn.classList.toggle("ativo", btn.dataset.status === os.status);
  });

  // Contexto Operacional
  const origemTexto = `${OS_ORIGEM[os.origin] || os.origin || "Manual"}${os.originNome ? ` — ${os.originNome}` : ""}`;
  const ativoTexto = os.originId ? `${os.originId}${os.originNome ? ` (${os.originNome})` : ""}` : "—";
  el("contexto-operacional").innerHTML = `
    <div class="info-grid">
      <div class="info-item"><span class="info-label">Origem</span><span>${origemTexto}</span></div>
      <div class="info-item"><span class="info-label">Ativo / Equipamento</span><span>${ativoTexto}</span></div>
      <div class="info-item"><span class="info-label">Setor</span><span>${os.sector || "—"}</span></div>
      <div class="info-item"><span class="info-label">Prioridade</span><span>${OS_PRIORIDADE[os.priority] || os.priority}</span></div>
    </div>
  `;

  // Descrição Técnica
  el("descricao-tecnica").innerHTML = `
    <div class="descricao-block">
      <div class="descricao-block-item">
        <div class="descricao-block-label">Título da O.S</div>
        <div class="descricao-block-texto">${os.title || "—"}</div>
      </div>
      <div class="descricao-block-item">
        <div class="descricao-block-label">Descrição Detalhada</div>
        <div class="descricao-block-texto${!os.description ? " vazio" : ""}">${os.description || "Sem descrição registrada."}</div>
      </div>
    </div>
  `;

  if (os.type === "maintenance") {
    renderizarDadosManutencao(os);
    renderizarPecas(os);
  } else if (os.type === "service") {
    renderizarDadosServico(os);
  }

  renderizarAgendamento(os);

  // Report button — always visible once the WO exists
  const btnRelatorio = document.getElementById("btn-gerar-relatorio");
  if (btnRelatorio) {
    btnRelatorio.href = `os-report.html?id=${os.id}`;
    btnRelatorio.classList.remove("hidden");
  }

  // Documento vinculado
  if (os.documentoNumero) {
    document.getElementById("secao-documento-vinculado").classList.remove("hidden");
    document.getElementById("info-documento").innerHTML = `
      <div class="doc-vinculado">
        <span class="doc-numero">${os.documentoNumero}</span>
        <span class="doc-tipo">Documento de Serviço</span>
        <a href="documentos.html" class="btn-link-doc">Ver Documentos →</a>
      </div>
    `;
  }

  // Pedido de compra vinculado
  if (os.pedidoCompraId) {
    document.getElementById("secao-pedido-vinculado").classList.remove("hidden");
    document.getElementById("info-pedido-compra").innerHTML = `
      <div class="doc-vinculado">
        <span class="doc-numero">Pedido vinculado</span>
        <a href="../compras/compra-detalhe.html?id=${os.pedidoCompraId}" class="btn-link-doc">Ver Pedido de Compra →</a>
      </div>
    `;
  }

  renderizarTimeline(os.timeline || []);
}

function renderizarDadosManutencao(os) {
  document.getElementById("secao-dados-especificos").classList.remove("hidden");
  document.getElementById("icone-especifico").textContent = "🔧";
  document.getElementById("titulo-especifico").textContent = "Dados de Manutenção";

  const downtimeHtml = os.downtime
    ? `<span class="downtime-badge">⛔ Equipamento Parado (Downtime)</span>`
    : `<span class="downtime-badge ok">✅ Sem Parada de Produção</span>`;

  document.getElementById("dados-especificos").innerHTML = `
    <div class="info-grid">
      <div class="info-item"><span class="info-label">Tipo de Manutenção</span><span>${OS_MANUTENCAO_TIPO[os.maintenanceType] || "—"}</span></div>
      <div class="info-item"><span class="info-label">Técnico Responsável</span><span>${os.technician || "—"}</span></div>
      <div class="info-item info-item-full"><span class="info-label">Impacto Operacional</span><span>${downtimeHtml}</span></div>
      ${os.observations ? `<div class="info-item info-item-full"><span class="info-label">Observações</span><span>${os.observations}</span></div>` : ""}
    </div>
  `;
}

function renderizarDadosServico(os) {
  document.getElementById("secao-dados-especificos").classList.remove("hidden");
  document.getElementById("icone-especifico").textContent = "🛠️";
  document.getElementById("titulo-especifico").textContent = "Dados do Serviço";
  document.getElementById("dados-especificos").innerHTML = `
    <div class="info-grid">
      <div class="info-item"><span class="info-label">Categoria</span><span>${SERVICE_CATEGORIAS[os.serviceCategory] || "—"}</span></div>
      <div class="info-item"><span class="info-label">Executor / Responsável</span><span>${os.executor || "—"}</span></div>
      <div class="info-item"><span class="info-label">Data de Início</span><span>${os.startDate || "—"}</span></div>
      <div class="info-item"><span class="info-label">Data de Término</span><span>${os.endDate || "—"}</span></div>
      ${os.observations ? `<div class="info-item info-item-full"><span class="info-label">Observações</span><span>${os.observations}</span></div>` : ""}
    </div>
  `;

  const mats = os.materials || [];
  if (mats.length > 0) {
    document.getElementById("secao-materiais-view").classList.remove("hidden");
    const countBadge = document.getElementById("materiais-count-badge");
    if (countBadge) countBadge.textContent = mats.length;

    document.getElementById("materiais-view").innerHTML = `
      <table class="materiais-table">
        <thead>
          <tr><th>Descrição</th><th>Qtd.</th><th>Preço Unit.</th><th>Total</th></tr>
        </thead>
        <tbody>
          ${mats.map((m) => `
            <tr>
              <td>${m.description}</td>
              <td>${m.quantity}</td>
              <td>${formatarMoeda(m.unitPrice)}</td>
              <td>${formatarMoeda(m.totalPrice)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    document.getElementById("secao-custos").classList.remove("hidden");
    document.getElementById("resumo-custos").innerHTML = `
      <div class="custo-cards">
        <div class="custo-card">
          <span class="custo-card-label">📦 Materiais</span>
          <span class="custo-card-valor">${formatarMoeda(os.materialsCost)}</span>
        </div>
        <div class="custo-card">
          <span class="custo-card-label">👷 Mão de Obra</span>
          <span class="custo-card-valor">${formatarMoeda(os.laborCost)}</span>
        </div>
        <div class="custo-card total">
          <span class="custo-card-label">💰 Total Geral</span>
          <span class="custo-card-valor">${formatarMoeda(os.totalCost)}</span>
        </div>
      </div>
    `;
  }
}

function renderizarAgendamento(os) {
  const sec = document.getElementById("vis-agendamento");
  const body = document.getElementById("agendamento-body");
  if (!sec || !body) return;

  const sch = os.scheduling || {};
  const hasData = sch.plannedStart || sch.actualStart;
  if (!hasData) return;

  sec.classList.remove("hidden");

  const fmtTs = (ts) => ts ? formatarData(ts) : "—";

  let durationBadge = "";
  if (sch.durationHours != null) {
    durationBadge = `<span class="badge badge-andamento">⏱ ${sch.durationHours}h executado</span>`;
  }

  let delayBadge = "";
  if (sch.plannedEnd && sch.actualEnd && sch.actualEnd > sch.plannedEnd) {
    const delayHours = Math.round((sch.actualEnd - sch.plannedEnd) / 3_600_000 * 10) / 10;
    delayBadge = `<span class="badge badge-atraso">⚠️ +${delayHours}h de atraso</span>`;
  }

  body.innerHTML = `
    <div class="info-grid">
      <div class="info-item"><span class="info-label">Início Previsto</span><span>${fmtTs(sch.plannedStart)}</span></div>
      <div class="info-item"><span class="info-label">Término Previsto</span><span>${fmtTs(sch.plannedEnd)}</span></div>
      <div class="info-item"><span class="info-label">Início Real</span><span>${fmtTs(sch.actualStart)}</span></div>
      <div class="info-item"><span class="info-label">Término Real</span><span>${fmtTs(sch.actualEnd)}</span></div>
    </div>
    ${durationBadge || delayBadge ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">${durationBadge}${delayBadge}</div>` : ""}
  `;
}

function renderizarPecas(os) {
  const sec = document.getElementById("vis-pecas");
  const body = document.getElementById("pecas-body");
  if (!sec || !body) return;

  const parts = os.resources?.parts || [];
  if (!parts.length) return;

  sec.classList.remove("hidden");
  const badge = document.getElementById("pecas-count-badge");
  if (badge) badge.textContent = parts.length;

  body.innerHTML = `
    <table class="materiais-table">
      <thead><tr><th>Peça / Material</th><th>Qtd.</th><th>Unidade</th></tr></thead>
      <tbody>
        ${parts.map((p) => `
          <tr>
            <td>${p.nome || "—"}</td>
            <td>${p.quantidade || 1}</td>
            <td>${p.unidade || "un"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderizarTimeline(timeline) {
  const el = document.getElementById("timeline-os");
  if (!el) return;
  const countBadge = document.getElementById("timeline-count-badge");
  if (countBadge) countBadge.textContent = timeline.length || 0;

  if (!timeline.length) {
    el.innerHTML = `<li class="timeline-item"><span class="timeline-icone">📋</span><div class="timeline-info"><span class="timeline-acao">Nenhum evento registrado.</span></div></li>`;
    return;
  }
  el.innerHTML = [...timeline]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .map((ev) => `
      <li class="timeline-item">
        <span class="timeline-icone">${ev.icone || "📝"}</span>
        <div class="timeline-info">
          <span class="timeline-acao">${ev.acao}</span>
          <span class="timeline-meta">${ev.usuario} · ${formatarData(ev.timestamp)}</span>
        </div>
      </li>
    `).join("");
}

// ============================================================
// CONFIGURAR AÇÕES
// ============================================================
function configurarAcoes(os) {
  // Botões de status — intercept "completed" → controlled closure modal
  document.querySelectorAll(".btn-status").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.status === os.status) return;
      if (btn.dataset.status === "completed") {
        abrirModalConcluir(os.id);
      } else {
        await alterarStatus(os.id, btn.dataset.status);
      }
    });
  });

  // Gerar documento SRV
  const btnDoc = document.getElementById("btn-gerar-documento");
  if (os.type === "service" && !os.documentoNumero) {
    btnDoc.addEventListener("click", () => gerarDocumento(os));
  } else if (os.documentoNumero) {
    btnDoc.textContent = `📄 ${os.documentoNumero}`;
    btnDoc.disabled = true;
  } else {
    btnDoc.style.display = "none";
  }

  // Criar Pedido de Compra (serviço com materiais, sem pedido já criado)
  const btnPedido = document.getElementById("btn-criar-pedido-compra");
  if (os.type === "service" && (os.materials || []).length > 0 && !os.pedidoCompraId) {
    btnPedido.classList.remove("hidden");
    btnPedido.addEventListener("click", abrirModalPedido);
  }

  // Modais — SRV + Pedido
  document.getElementById("fechar-modal-doc").addEventListener("click", fecharModalDoc);
  document.getElementById("fechar-modal-doc-btn").addEventListener("click", fecharModalDoc);
  document.getElementById("btn-imprimir-doc").addEventListener("click", () => window.print());
  document.getElementById("fechar-modal-pedido").addEventListener("click", fecharModalPedido);
  document.getElementById("fechar-modal-pedido-btn").addEventListener("click", fecharModalPedido);
  document.getElementById("btn-confirmar-pedido").addEventListener("click", () => confirmarCriacaoPedido(os));

  // Modal de conclusão controlada
  document.getElementById("fechar-modal-concluir").addEventListener("click", fecharModalConcluir);
  document.getElementById("fechar-modal-concluir-btn").addEventListener("click", fecharModalConcluir);
  document.getElementById("btn-confirmar-conclusao").addEventListener("click", () => confirmarConclusao(os.id));
}

async function alterarStatus(id, novoStatus) {
  mostrarOverlay("Atualizando status...");
  try {
    await atualizarOS(id, { status: novoStatus });
    await adicionarLog(id, `Status → ${OS_STATUS[novoStatus]}`, sessaoAtual.nome, "🔄");
    osAtual.status = novoStatus;
    document.querySelectorAll(".btn-status").forEach((b) => {
      b.classList.toggle("ativo", b.dataset.status === novoStatus);
    });
    mostrarToast(`Status: ${OS_STATUS[novoStatus]}`, "sucesso");
  } catch (err) {
    console.error(err);
    mostrarToast("Erro ao atualizar status.", "erro");
  } finally {
    esconderOverlay();
  }
}

async function gerarDocumento(os) {
  mostrarOverlay("Gerando documento SRV...");
  try {
    const resultado = await gerarDocumentoServico(os.id, os, sessaoAtual.nome);
    osAtual.documentoNumero = resultado.numero;
    osAtual.documentoId = resultado.id;

    const btn = document.getElementById("btn-gerar-documento");
    btn.textContent = `📄 ${resultado.numero}`;
    btn.disabled = true;

    document.getElementById("secao-documento-vinculado").classList.remove("hidden");
    document.getElementById("info-documento").innerHTML = `
      <div class="doc-vinculado">
        <span class="doc-numero">${resultado.numero}</span>
        <span class="doc-tipo">Documento de Serviço gerado</span>
        <a href="documentos.html" class="btn-link-doc">Ver Documentos →</a>
      </div>
    `;
    mostrarToast(`Documento ${resultado.numero} gerado!`, "sucesso");

    // Recarrega timeline do Firestore
    const osAtualizado = await obterOSPorId(os.id);
    renderizarTimeline(osAtualizado.timeline || []);
  } catch (err) {
    console.error(err);
    mostrarToast("Erro ao gerar documento.", "erro");
  } finally {
    esconderOverlay();
  }
}

function abrirModalPedido() {
  document.getElementById("modal-pedido").classList.remove("hidden");
}

function fecharModalPedido() {
  document.getElementById("modal-pedido").classList.add("hidden");
}

function fecharModalDoc() {
  document.getElementById("modal-documento").classList.add("hidden");
}

async function confirmarCriacaoPedido(os) {
  fecharModalPedido();
  mostrarOverlay("Criando Pedido de Compra...");
  try {
    const poId = await criarPedidoFromOS(os.id, os, sessaoAtual.nome);
    osAtual.pedidoCompraId = poId;

    document.getElementById("btn-criar-pedido-compra").classList.add("hidden");
    document.getElementById("secao-pedido-vinculado").classList.remove("hidden");
    document.getElementById("info-pedido-compra").innerHTML = `
      <div class="doc-vinculado">
        <span class="doc-numero">Pedido criado</span>
        <a href="../compras/compra-detalhe.html?id=${poId}" class="btn-link-doc">Ver Pedido de Compra →</a>
      </div>
    `;
    mostrarToast("Pedido de Compra criado com sucesso!", "sucesso");
  } catch (err) {
    console.error(err);
    mostrarToast("Erro ao criar pedido.", "erro");
  } finally {
    esconderOverlay();
  }
}

function abrirModalConcluir(osId) {
  // Reset checklist
  ["check-servicos", "check-teste", "check-limpeza"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  const obsEl = document.getElementById("obs-conclusao");
  if (obsEl) obsEl.value = "";
  document.getElementById("modal-concluir").classList.remove("hidden");
}

function fecharModalConcluir() {
  document.getElementById("modal-concluir").classList.add("hidden");
}

async function confirmarConclusao(osId) {
  const checks = ["check-servicos", "check-teste", "check-limpeza"];
  const allChecked = checks.every((id) => document.getElementById(id)?.checked);
  if (!allChecked) {
    mostrarToast("Marque todos os itens do checklist para concluir.", "erro");
    return;
  }

  const obsFinal = document.getElementById("obs-conclusao")?.value.trim() || "";
  fecharModalConcluir();
  mostrarOverlay("Registrando conclusão...");

  try {
    const { durationHours } = await registrarFimReal(osId);
    await atualizarOS(osId, {
      status: "completed",
      ...(obsFinal ? { observacoesConclusao: obsFinal } : {}),
    });
    await adicionarLog(
      osId,
      `O.S concluída${durationHours ? ` em ${durationHours}h` : ""}${obsFinal ? ` — ${obsFinal}` : ""}`,
      sessaoAtual.nome,
      "✅"
    );

    // Update machine state to operational if this WO was for a machine asset
    if (osAtual?.origin === "machine" && osAtual?.originId) {
      try {
        await updateMachineState(osAtual.originId, {
          newStatusLegacy: "Operacional",
          woId: osId,
          woType: osAtual.maintenanceType === "preventive" ? "Preventiva" : "Corretiva",
          downtimeHours: osAtual.downtime ? (osAtual.scheduling?.durationHours || 0) : 0,
          perfil: sessaoAtual,
        });
      } catch (e) {
        console.warn("[OS] Não foi possível atualizar machine_state:", e);
      }
    }

    mostrarToast("O.S concluída com sucesso!", "sucesso");

    // Reload view to reflect all changes
    const osAtualizado = await obterOSPorId(osId);
    osAtual = osAtualizado;
    renderizarDetalhe(osAtualizado);
    configurarAcoes(osAtualizado);
  } catch (err) {
    console.error(err);
    mostrarToast("Erro ao concluir O.S.", "erro");
  } finally {
    esconderOverlay();
  }
}

// ============================================================
// BADGES
// ============================================================
function getBadgeTipo(tipo) {
  const classes = { maintenance: "badge-manutencao", service: "badge-servico" };
  const icons = { maintenance: "🔧", service: "🛠️" };
  return `<span class="badge ${classes[tipo] || "badge-manutencao"}">${icons[tipo] || "📋"} ${OS_TIPOS[tipo] || tipo}</span>`;
}

function getBadgeStatus(status) {
  const classes = {
    open: "badge-aberta", in_progress: "badge-andamento",
    waiting_parts: "badge-aguardando", completed: "badge-concluida",
  };
  return `<span class="badge ${classes[status] || "badge-aberta"}">${OS_STATUS[status] || status}</span>`;
}

function getBadgePrioridade(priority) {
  const classes = { low: "badge-prioridade-baixa", medium: "badge-prioridade-media", high: "badge-prioridade-alta" };
  return `<span class="badge ${classes[priority] || "badge-prioridade-baixa"}">${OS_PRIORIDADE[priority] || priority}</span>`;
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

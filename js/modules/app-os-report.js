/**
 * app-os-report.js — Relatório de Ordem de Serviço (print/PDF)
 * Página: os/os-report.html
 * Parâmetro: ?id=FIREBASE_ID
 */
import { checkAuth } from "../core/db-auth.js";
import {
  obterOSPorId,
  OS_TIPOS,
  OS_STATUS,
  OS_PRIORIDADE,
  OS_ORIGEM,
  OS_MANUTENCAO_TIPO,
  SERVICE_CATEGORIAS,
  formatarData,
  formatarMoeda,
} from "../core/db-os.js";

await checkAuth("os-report");

const overlay      = document.getElementById("overlay");
const reportContent = document.getElementById("report-content");
const btnBack      = document.getElementById("btn-back-os");

const params = new URLSearchParams(window.location.search);
const osId   = params.get("id");

if (!osId) {
  reportContent.innerHTML = `<div class="report-error">⚠️ Nenhuma O.S especificada. Acesse este relatório a partir da página de detalhe da O.S.</div>`;
  overlay?.classList.add("hidden");
} else {
  btnBack.href = `os-detalhe.html?id=${osId}`;
  try {
    const os = await obterOSPorId(osId);
    renderizarRelatorio(os);
  } catch (err) {
    console.error(err);
    reportContent.innerHTML = `<div class="report-error">⚠️ Não foi possível carregar a O.S: ${err.message}</div>`;
  } finally {
    overlay?.classList.add("hidden");
  }
}

// ============================================================
// RENDERIZAÇÃO PRINCIPAL
// ============================================================

function renderizarRelatorio(os) {
  document.title = `Relatório O.S — ${os.titulo || os.id.substring(0, 8).toUpperCase()}`;

  const numero = os.numero || os.id.substring(0, 8).toUpperCase();
  const emitidoEm = new Date().toLocaleString("pt-BR");

  reportContent.innerHTML = `
    ${secaoHeader(os, numero, emitidoEm)}
    ${secaoTitulo(os, numero)}
    ${secaoIdentificacao(os)}
    ${secaoEquipamento(os)}
    ${secaoAgendamento(os)}
    ${secaoMateriais(os)}
    ${secaoChecklistConclusao(os)}
    ${secaoTimeline(os)}
    ${secaoAssinaturas(os)}
  `;
}

// ── Seção 1: Cabeçalho do documento ─────────────────────────
function secaoHeader(os, numero, emitidoEm) {
  return `
    <div class="report-header">
      <div>
        <div class="report-logo">SIGA <span>Sistema de Gestão de Ativos</span></div>
      </div>
      <div class="report-meta">
        <strong>Relatório de ${os.type === "maintenance" ? "Manutenção" : "Serviço"}</strong><br>
        Nº: #${numero}<br>
        Emitido: ${emitidoEm}
      </div>
    </div>
  `;
}

// ── Seção 2: Título e badges ─────────────────────────────────
function secaoTitulo(os, numero) {
  return `
    <div class="report-title-block">
      <div class="report-os-numero">O.S #${numero}</div>
      <div class="report-os-title">${os.title || "Sem título"}</div>
      <div class="report-badges">
        ${badgeTipo(os.type)}
        ${badgeStatus(os.status)}
        ${badgePrioridade(os.priority)}
      </div>
    </div>
  `;
}

// ── Seção 3: Identificação ───────────────────────────────────
function secaoIdentificacao(os) {
  return `
    <div class="report-section">
      <div class="report-section-header">📋 Identificação</div>
      <div class="report-section-body">
        <div class="report-info-grid">
          <div class="report-info-item"><span class="report-info-label">Tipo</span><span class="report-info-value">${OS_TIPOS[os.type] || os.type}</span></div>
          <div class="report-info-item"><span class="report-info-label">Prioridade</span><span class="report-info-value">${OS_PRIORIDADE[os.priority] || os.priority || "—"}</span></div>
          <div class="report-info-item"><span class="report-info-label">Status</span><span class="report-info-value">${OS_STATUS[os.status] || os.status || "—"}</span></div>
          <div class="report-info-item"><span class="report-info-label">Setor</span><span class="report-info-value">${os.sector || "—"}</span></div>
          <div class="report-info-item"><span class="report-info-label">Solicitante</span><span class="report-info-value">${os.solicitante || "—"}</span></div>
          <div class="report-info-item"><span class="report-info-label">Criado por</span><span class="report-info-value">${os.criadoPor || "—"}</span></div>
          <div class="report-info-item"><span class="report-info-label">Criado em</span><span class="report-info-value">${formatarData(os.createdAt || os.timestampEnvio)}</span></div>
          <div class="report-info-item"><span class="report-info-label">Concluído em</span><span class="report-info-value">${os.completedAt ? formatarData(os.completedAt) : "—"}</span></div>
          ${os.title ? `<div class="report-info-item full"><span class="report-info-label">Título</span><span class="report-info-value">${os.title}</span></div>` : ""}
          ${os.description ? `<div class="report-info-item full"><span class="report-info-label">Descrição Detalhada</span><span class="report-info-value">${os.description}</span></div>` : ""}
        </div>
      </div>
    </div>
  `;
}

// ── Seção 4: Equipamento ─────────────────────────────────────
function secaoEquipamento(os) {
  if (!os.originId && !os.originNome) return "";
  const origemTexto = OS_ORIGEM[os.origin] || os.origin || "—";

  const extraFields = os.type === "maintenance" ? `
    <div class="report-info-item"><span class="report-info-label">Tipo de Manutenção</span><span class="report-info-value">${OS_MANUTENCAO_TIPO[os.maintenanceType] || "—"}</span></div>
    <div class="report-info-item"><span class="report-info-label">Técnico Responsável</span><span class="report-info-value">${os.technician || "—"}</span></div>
    <div class="report-info-item"><span class="report-info-label">Downtime</span><span class="report-info-value">${os.downtime ? "⛔ Sim — equipamento parado" : "✅ Não"}</span></div>
  ` : `
    <div class="report-info-item"><span class="report-info-label">Categoria</span><span class="report-info-value">${SERVICE_CATEGORIAS[os.serviceCategory] || "—"}</span></div>
    <div class="report-info-item"><span class="report-info-label">Executor</span><span class="report-info-value">${os.executor || "—"}</span></div>
  `;

  return `
    <div class="report-section">
      <div class="report-section-header">⚙️ Equipamento / Ativo</div>
      <div class="report-section-body">
        <div class="report-info-grid">
          <div class="report-info-item"><span class="report-info-label">ID do Ativo</span><span class="report-info-value">${os.originId || "—"}</span></div>
          <div class="report-info-item"><span class="report-info-label">Nome do Ativo</span><span class="report-info-value">${os.originNome || "—"}</span></div>
          <div class="report-info-item"><span class="report-info-label">Origem</span><span class="report-info-value">${origemTexto}</span></div>
          ${extraFields}
          ${os.observations ? `<div class="report-info-item full"><span class="report-info-label">Observações</span><span class="report-info-value">${os.observations}</span></div>` : ""}
          ${os.observacoesConclusao ? `<div class="report-info-item full"><span class="report-info-label">Observações de Conclusão</span><span class="report-info-value">${os.observacoesConclusao}</span></div>` : ""}
        </div>
      </div>
    </div>
  `;
}

// ── Seção 5: Agendamento ─────────────────────────────────────
function secaoAgendamento(os) {
  const sch = os.scheduling || {};
  const hasData = sch.plannedStart || sch.actualStart;
  if (!hasData) return "";

  const fmtTs = (ts) => ts ? formatarData(ts) : "—";
  const durationInfo = sch.durationHours != null ? ` (${sch.durationHours}h)` : "";
  const delayInfo = sch.plannedEnd && sch.actualEnd && sch.actualEnd > sch.plannedEnd
    ? ` ⚠️ Atraso de ${Math.round((sch.actualEnd - sch.plannedEnd) / 3_600_000 * 10) / 10}h`
    : "";

  return `
    <div class="report-section">
      <div class="report-section-header">📅 Agendamento</div>
      <div class="report-section-body">
        <div class="report-info-grid">
          <div class="report-info-item"><span class="report-info-label">Início Previsto</span><span class="report-info-value">${fmtTs(sch.plannedStart)}</span></div>
          <div class="report-info-item"><span class="report-info-label">Término Previsto</span><span class="report-info-value">${fmtTs(sch.plannedEnd)}</span></div>
          <div class="report-info-item"><span class="report-info-label">Início Real</span><span class="report-info-value">${fmtTs(sch.actualStart)}</span></div>
          <div class="report-info-item"><span class="report-info-label">Término Real${durationInfo}</span><span class="report-info-value">${fmtTs(sch.actualEnd)}${delayInfo}</span></div>
        </div>
      </div>
    </div>
  `;
}

// ── Seção 6: Materiais ───────────────────────────────────────
function secaoMateriais(os) {
  // Maintenance parts
  const parts = os.resources?.parts || [];
  // Service materials
  const mats  = os.materials || [];

  if (!parts.length && !mats.length) return "";

  let tableHtml = "";

  if (parts.length) {
    tableHtml += `
      <table class="report-table" style="margin-bottom:${mats.length ? "14px" : "0"}">
        <thead><tr><th>Peça / Material</th><th>Qtd.</th><th>Unidade</th></tr></thead>
        <tbody>
          ${parts.map((p) => `<tr><td>${p.nome || "—"}</td><td>${p.quantidade || 1}</td><td>${p.unidade || "un"}</td></tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  if (mats.length) {
    tableHtml += `
      <table class="report-table">
        <thead><tr><th>Descrição</th><th>Qtd.</th><th>Preço Unit.</th><th>Total</th></tr></thead>
        <tbody>
          ${mats.map((m) => `<tr><td>${m.description || "—"}</td><td>${m.quantity}</td><td>${formatarMoeda(m.unitPrice)}</td><td>${formatarMoeda(m.totalPrice)}</td></tr>`).join("")}
        </tbody>
      </table>
      ${os.totalCost != null ? `
        <div style="display:flex;gap:16px;margin-top:10px;font-size:0.82rem;">
          <span><strong>Materiais:</strong> ${formatarMoeda(os.materialsCost)}</span>
          <span><strong>Mão de obra:</strong> ${formatarMoeda(os.laborCost)}</span>
          <span><strong>Total:</strong> ${formatarMoeda(os.totalCost)}</span>
        </div>
      ` : ""}
    `;
  }

  return `
    <div class="report-section">
      <div class="report-section-header">🔩 Materiais e Peças</div>
      <div class="report-section-body">${tableHtml}</div>
    </div>
  `;
}

// ── Seção 7: Checklist de Conclusão ─────────────────────────
function secaoChecklistConclusao(os) {
  if (os.status !== "completed") return "";

  const items = [
    "Todos os serviços/reparos foram executados",
    "Equipamento testado e funcionando",
    "Área de trabalho limpa e organizada",
  ];

  return `
    <div class="report-section">
      <div class="report-section-header">✅ Checklist de Conclusão</div>
      <div class="report-section-body">
        <div class="report-checklist">
          ${items.map((item) => `
            <div class="report-check-item">
              <span class="report-check-box checked">✓</span>
              <span>${item}</span>
            </div>
          `).join("")}
        </div>
        ${os.observacoesConclusao ? `<p style="margin-top:10px;font-size:0.82rem;color:#475569;"><strong>Observações:</strong> ${os.observacoesConclusao}</p>` : ""}
      </div>
    </div>
  `;
}

// ── Seção 8: Timeline ────────────────────────────────────────
function secaoTimeline(os) {
  const timeline = os.timeline || [];
  if (!timeline.length) return "";

  const sorted = [...timeline].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  return `
    <div class="report-section">
      <div class="report-section-header">📅 Timeline de Eventos (${timeline.length})</div>
      <div class="report-section-body">
        <div class="report-timeline">
          ${sorted.map((ev) => `
            <div class="report-tl-item">
              <span class="report-tl-icon">${ev.icone || "📝"}</span>
              <div>
                <div class="report-tl-acao">${ev.acao}</div>
                <div class="report-tl-meta">${ev.usuario} · ${formatarData(ev.timestamp)}</div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

// ── Seção 9: Assinaturas ─────────────────────────────────────
function secaoAssinaturas(os) {
  return `
    <div class="report-section">
      <div class="report-section-header">✍️ Assinaturas</div>
      <div class="report-section-body">
        <div class="report-signatures">
          <div class="report-sig-box">
            <div style="height:40px;"></div>
            <div class="report-sig-name">${os.criadoPor || "Responsável"}</div>
            <div>Solicitante / Abertura</div>
          </div>
          <div class="report-sig-box">
            <div style="height:40px;"></div>
            <div class="report-sig-name">${os.technician || os.executor || "Técnico"}</div>
            <div>Executor</div>
          </div>
          <div class="report-sig-box">
            <div style="height:40px;"></div>
            <div class="report-sig-name">Supervisor / Aprovação</div>
            <div>Aprovação</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// HELPERS — BADGES
// ============================================================

function badgeTipo(tipo) {
  const classes = { maintenance: "report-badge-manutencao", service: "report-badge-servico" };
  return `<span class="report-badge ${classes[tipo] || "report-badge-manutencao"}">${OS_TIPOS[tipo] || tipo}</span>`;
}

function badgeStatus(status) {
  const classes = {
    open: "report-badge-aberta",
    in_progress: "report-badge-andamento",
    waiting_parts: "report-badge-aguardando",
    completed: "report-badge-concluida",
  };
  return `<span class="report-badge ${classes[status] || "report-badge-aberta"}">${OS_STATUS[status] || status}</span>`;
}

function badgePrioridade(priority) {
  const classes = { low: "report-badge-baixa", medium: "report-badge-media", high: "report-badge-alta" };
  return `<span class="report-badge ${classes[priority] || "report-badge-baixa"}">${OS_PRIORIDADE[priority] || priority}</span>`;
}

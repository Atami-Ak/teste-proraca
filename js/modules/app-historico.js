/**
 * app-historico.js — Machine History & KPI Dashboard Controller
 *
 * Single Source of Truth: work_orders + machine_inspections
 *
 * Timeline shows:
 *   - Work Orders from work_orders (maintenance, corrective, preventive)
 *   - Inspections from machine_inspections
 *   - Legacy records from historico_manutencao (backward-compat, read-only)
 *
 * WO items navigate directly to os-report.html (no modal).
 * Inspection items open a detail modal.
 * Legacy items open the existing detail modal.
 *
 * KPI calculation: calcularKPIsFromWOs (work_orders) with fallback to
 * calcularKPIsLegacy (historico_manutencao) when no WO data exists.
 */

import { checkAuth } from "../core/db-auth.js";
import { getWorkOrdersByMachine } from "../core/db-os.js";
import { obterHistoricoMaquina as obterInspecoesMaquina } from "../core/db-maquinas.js";
import { obterHistoricoMaquina as obterLegadoMaquina } from "../core/db.js";
import {
  getMachineState,
  calcularKPIsFromWOs,
  calcularKPIsLegacy,
  gerarAlertas,
  STATUS_META,
  TIPO_META,
  PRIORIDADE_META,
  getEffectiveStatus,
  trendLabel,
} from "../core/machine-state-engine.js";

await checkAuth("historico-maquina");

// ─── URL params ───────────────────────────────────────────────────────────────
const params         = new URLSearchParams(window.location.search);
const idMaquinaURL   = params.get("id");
const nomeMaquinaURL = params.get("nome");

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const displayId      = document.getElementById("display-id");
const displayNome    = document.getElementById("display-nome");
const statusBadge    = document.getElementById("status-atual-badge");
const listaHistorico = document.getElementById("lista-historico-completo");
const overlay        = document.getElementById("overlay");
const filtroStatus   = document.getElementById("filtro-status");
const filtroTipo     = document.getElementById("filtro-tipo");
const alertSection   = document.getElementById("alert-section");

// KPI elements
const kpiIntervencoes = document.getElementById("kpi-intervencoes");
const kpiParadas      = document.getElementById("kpi-paradas");
const kpiHorasParadas = document.getElementById("kpi-horas-paradas");
const kpiMtbf         = document.getElementById("kpi-mtbf");
const kpiMttr         = document.getElementById("kpi-mttr");
const kpiTrendEl      = document.getElementById("kpi-trend");

// Modal (for inspections + legacy records)
const modal          = document.getElementById("modal-relatorio");
const btnFecharModal = document.getElementById("btn-fechar-modal");
const modalCorpo     = document.getElementById("modal-corpo");
const modalTitulo    = document.getElementById("modal-titulo");

// ─── State ────────────────────────────────────────────────────────────────────
let historicoGlobal   = []; // normalized unified list
let historicoFiltrado = [];
let paginaAtual       = 1;
const ITENS_POR_PAGINA = 10;

// ─── Guard ────────────────────────────────────────────────────────────────────
if (btnFecharModal && modal) {
  btnFecharModal.addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
}

if (!idMaquinaURL) {
  window.location.href = "maquinario.html";
} else {
  if (displayId)   displayId.textContent  = idMaquinaURL;
  if (displayNome) displayNome.textContent = nomeMaquinaURL || "Equipamento";

  const btnNovaOs = document.getElementById("btn-nova-os-maquina");
  if (btnNovaOs) {
    btnNovaOs.href = `../os/os-detalhe.html?modo=criar&origin=machine&originId=${encodeURIComponent(idMaquinaURL)}&originNome=${encodeURIComponent(nomeMaquinaURL || "")}&tipo=maintenance`;
  }

  carregarHistoricoInvestigacao();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDataHora(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ─── Data Normalization ───────────────────────────────────────────────────────

/**
 * Normalizes a work_order document into the unified timeline format.
 */
function normalizeWO(wo) {
  const ts = wo.scheduling?.actualEnd
    || wo.scheduling?.actualStart
    || wo.timestampEnvio
    || 0;

  const tipoLabel = wo.type === "inspection" ? "Inspecao"
    : wo.maintenanceType === "preventive" ? "Preventiva"
    : wo.maintenanceType === "corrective" ? "Corretiva"
    : wo.type === "service" ? "Serviço"
    : "Manutenção";

  return {
    _type:         "work_order",
    id:            wo.id,
    _ts:           ts,
    title:         wo.title || tipoLabel,
    description:   wo.description || "",
    status:        wo.status,
    maintenanceType: wo.maintenanceType || "corrective",
    tipoLabel,
    technician:    wo.technician || wo.executor || wo.criadoPor || "—",
    durationHours: wo.scheduling?.durationHours ?? null,
    downtime:      !!wo.downtime,
    priority:      wo.priority,
    inspecaoId:    wo.inspecaoId || null,
    _raw:          wo,
  };
}

/**
 * Normalizes a machine_inspections document into the unified timeline format.
 */
function normalizeInspection(insp) {
  const statusLabel = { OK: "✅ Conforme", ATTENTION: "⚠️ Atenção", CRITICAL: "⛔ Crítico" };

  return {
    _type:       "inspection",
    id:          insp.id,
    _ts:         insp.timestampEnvio || 0,
    title:       `Inspeção — ${statusLabel[insp.status] || insp.status || "—"}`,
    description: insp.diagnosis || insp.recommendation || "",
    status:      insp.status,     // "OK" | "ATTENTION" | "CRITICAL"
    tipoLabel:   "Inspecao",
    technician:  insp.inspector || "—",
    durationHours: null,
    downtime:    insp.status === "CRITICAL",
    priority:    null,
    issues:      insp.issues || [],
    diagnosis:   insp.diagnosis || "",
    recommendation: insp.recommendation || "",
    _raw:        insp,
  };
}

/**
 * Normalizes a legacy historico_manutencao document into the unified timeline format.
 */
function normalizeLegacy(reg) {
  const statusLabel = reg.diagnostico?.statusFinal || reg.status;
  const legacyTipoMap = { Inspecao: "Inspecao", Preventiva: "Preventiva", Corretiva: "Corretiva" };
  const tipoLabel = legacyTipoMap[reg.diagnostico?.tipoManutencao] || reg.diagnostico?.tipoManutencao || "—";

  const downtimeH = parseFloat(reg.diagnostico?.tempoParada) || 0;

  return {
    _type:         "legacy",
    id:            reg.id,
    _ts:           reg.timestampEnvio || 0,
    title:         (reg.diagnostico?.relatorio || reg.relatorio || "").substring(0, 80) || "Registro legado",
    description:   reg.diagnostico?.relatorio || reg.relatorio || "",
    status:        statusLabel,
    tipoLabel,
    technician:    reg.dadosOperador?.nome || "—",
    durationHours: downtimeH || null,
    downtime:      downtimeH > 0 || statusLabel === "Parada" || statusLabel === "Troca",
    priority:      reg.analiseFalha?.urgencia || null,
    workOrderId:   reg.workOrderId || null,
    _raw:          reg,
  };
}

// ─── Status metadata for display ─────────────────────────────────────────────

function getItemStatusMeta(item) {
  if (item._type === "work_order") {
    const map = {
      open:          { label: "🔵 Aberta",        color: "#2563eb", bg: "" },
      in_progress:   { label: "🟡 Em Andamento",  color: "#d97706", bg: "status-revisao" },
      waiting_parts: { label: "⏳ Ag. Peças",     color: "#7c3aed", bg: "" },
      completed:     { label: "✅ Concluída",      color: "#16a34a", bg: "status-operacional" },
    };
    return map[item.status] || { label: item.status, color: "#6c757d", bg: "" };
  }

  if (item._type === "inspection") {
    const map = {
      OK:        { label: "✅ Conforme",  color: "#16a34a", bg: "status-operacional" },
      ATTENTION: { label: "⚠️ Atenção",  color: "#d97706", bg: "status-revisao" },
      CRITICAL:  { label: "⛔ Crítico",  color: "#dc2626", bg: "status-parada" },
    };
    return map[item.status] || { label: item.status, color: "#6c757d", bg: "" };
  }

  // legacy
  const legacyMap = {
    Operacional: { label: "✅ Concluído",    color: "#16a34a", bg: "status-operacional" },
    Revisão:     { label: "🟡 Pendente",     color: "#d97706", bg: "status-revisao"     },
    Parada:      { label: "🔴 Parado",       color: "#dc2626", bg: "status-parada"      },
    Troca:       { label: "🔧 Em Manutenção",color: "#7c3aed", bg: "status-troca"       },
    open:        { label: "🔵 Aberta",       color: "#2563eb", bg: "" },
    in_progress: { label: "🟡 Em Andamento", color: "#d97706", bg: "status-revisao" },
    completed:   { label: "✅ Concluída",    color: "#16a34a", bg: "status-operacional" },
  };
  return legacyMap[item.status] || { label: item.status, color: "#6c757d", bg: "" };
}

function getTipoBadgeHtml(item) {
  const tipoMeta = {
    Inspecao:   { label: "👁 Inspeção",    bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
    Preventiva: { label: "🛡 Preventiva",  bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
    Corretiva:  { label: "⚡ Corretiva",   bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
    Serviço:    { label: "🛠 Serviço",     bg: "#f5f3ff", color: "#7c3aed", border: "#ddd6fe" },
    Manutenção: { label: "🔧 Manutenção",  bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  };
  const m = tipoMeta[item.tipoLabel] || { label: item.tipoLabel || "—", bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" };
  return `<span class="badge-tipo" style="background:${m.bg};color:${m.color};border:1px solid ${m.border};">${m.label}</span>`;
}

function getDowntimeBadgeHtml(item) {
  if (!item.durationHours) return "";
  return `<span class="badge-downtime">⏱ ${item.durationHours}h</span>`;
}

function getPrioridadeBadgeHtml(item) {
  if (!item.priority) return "";
  const map = {
    high:    { label: "🔴 Alta",   bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
    critica: { label: "⛔ Crítica", bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
    medium:  { label: "🟡 Média",  bg: "#fffbeb", color: "#92400e", border: "#fde68a" },
    Alta:    { label: "🔴 Alta",   bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
    Média:   { label: "🟡 Média",  bg: "#fffbeb", color: "#92400e", border: "#fde68a" },
  };
  const m = map[item.priority];
  if (!m) return "";
  return `<span class="badge-prioridade" style="background:${m.bg};color:${m.color};border:1px solid ${m.border};">${m.label}</span>`;
}

// ─── KPI Rendering ────────────────────────────────────────────────────────────
function renderKPIs(filteredList, kpis) {
  const totalDowntime = filteredList.reduce(
    (acc, r) => acc + (r.durationHours && r.downtime ? r.durationHours : 0), 0
  );
  const totalParadas = filteredList.filter((r) => r.downtime).length;

  if (kpiIntervencoes) kpiIntervencoes.textContent = filteredList.length;
  if (kpiParadas)      kpiParadas.textContent      = totalParadas;
  if (kpiHorasParadas) kpiHorasParadas.textContent = totalDowntime > 0 ? `${totalDowntime.toFixed(1)}h` : "0h";

  if (kpiMtbf) {
    kpiMtbf.textContent = kpis?.mtbfHours != null ? `${kpis.mtbfHours}h` : "—";
    if (kpis?.mtbfHours != null && kpis.mtbfHours < 24) kpiMtbf.style.color = "#dc2626";
  }
  if (kpiMttr) {
    kpiMttr.textContent = kpis?.mttrHours != null ? `${kpis.mttrHours}h` : "—";
    if (kpis?.mttrHours != null && kpis.mttrHours > 8) kpiMttr.style.color = "#dc2626";
  }
  if (kpiTrendEl && kpis) {
    const tl = trendLabel(kpis.trend);
    kpiTrendEl.textContent = tl.label;
    kpiTrendEl.style.color = tl.color;
  }
}

// ─── Alert Section ────────────────────────────────────────────────────────────
function renderAlertas(kpis, machineState) {
  if (!alertSection) return;
  const alerts = gerarAlertas(kpis, machineState);
  if (!alerts.length) { alertSection.style.display = "none"; return; }
  alertSection.style.display = "flex";
  alertSection.innerHTML = alerts.map((a) => `
    <div class="alert-item ${a.tipo === "critical" ? "alert-critical" : "alert-warning"}">
      <span style="font-size:1.1rem;line-height:1;">${a.icon}</span>
      <div>
        <strong>${a.titulo}</strong>
        <div style="font-size:.8rem;margin-top:2px;">${a.descricao}</div>
      </div>
    </div>
  `).join("");
}

// ─── Filter Logic ─────────────────────────────────────────────────────────────
function aplicarFiltros() {
  const fStatus = filtroStatus?.value || "Todos";
  const fTipo   = filtroTipo?.value   || "Todos";

  historicoFiltrado = historicoGlobal.filter((item) => {
    // ── Status filter ──
    let statusOk = fStatus === "Todos";
    if (!statusOk) {
      if (item._type === "work_order") {
        if (fStatus === "pendente")   statusOk = item.status === "open" || item.status === "in_progress";
        if (fStatus === "concluido")  statusOk = item.status === "completed";
        if (fStatus === "parada")     statusOk = item.downtime === true;
        if (fStatus === "aguardando") statusOk = item.status === "waiting_parts";
      } else if (item._type === "inspection") {
        if (fStatus === "pendente")   statusOk = item.status === "ATTENTION";
        if (fStatus === "concluido")  statusOk = item.status === "OK";
        if (fStatus === "parada")     statusOk = item.status === "CRITICAL";
        if (fStatus === "aguardando") statusOk = false;
      } else {
        // legacy
        const s = item.status;
        if (fStatus === "pendente")   statusOk = s === "Revisão";
        if (fStatus === "concluido")  statusOk = s === "Operacional" || s === "completed";
        if (fStatus === "parada")     statusOk = s === "Parada" || s === "Troca" || item.downtime;
        if (fStatus === "aguardando") statusOk = false;
      }
    }

    // ── Tipo filter ──
    let tipoOk = fTipo === "Todos";
    if (!tipoOk) {
      if (fTipo === "inspection") tipoOk = item._type === "inspection" || item.tipoLabel === "Inspecao";
      if (fTipo === "preventive") tipoOk = item.maintenanceType === "preventive" || item.tipoLabel === "Preventiva";
      if (fTipo === "corrective") tipoOk = item.maintenanceType === "corrective" || item.tipoLabel === "Corretiva";
    }

    return statusOk && tipoOk;
  });
}

if (filtroStatus) filtroStatus.addEventListener("change", () => { aplicarFiltros(); renderizarPagina(1); });
if (filtroTipo)   filtroTipo.addEventListener("change",   () => { aplicarFiltros(); renderizarPagina(1); });

// ─── Main data loader ─────────────────────────────────────────────────────────
async function carregarHistoricoInvestigacao() {
  const timeoutId = setTimeout(() => {
    if (overlay) overlay.classList.add("hidden");
    listaHistorico.innerHTML = `
      <li style="text-align:center;padding:30px;background:#fef2f2;border-radius:8px;color:#dc2626;">
        ⚠️ Tempo esgotado. <a href="" style="color:var(--primary);">Tentar novamente</a>
      </li>`;
  }, 12_000);

  try {
    // Parallel load: WOs + inspections + legacy + machine state + KPIs
    const [workOrders, inspections, legacyRecs, machineState, kpisFromWOs] = await Promise.all([
      getWorkOrdersByMachine(idMaquinaURL).catch(() => []),
      obterInspecoesMaquina(idMaquinaURL).catch(() => []),
      obterLegadoMaquina(idMaquinaURL).catch(() => []),
      getMachineState(idMaquinaURL).catch(() => null),
      calcularKPIsFromWOs(idMaquinaURL).catch(() => null),
    ]);

    clearTimeout(timeoutId);
    if (overlay) overlay.classList.add("hidden");

    // Use WO KPIs if available; fall back to legacy KPIs
    const kpis = kpisFromWOs ?? await calcularKPIsLegacy(idMaquinaURL).catch(() => null);

    // ── Status badge ──
    if (statusBadge && machineState) {
      const statusKey = getEffectiveStatus(machineState);
      const meta = STATUS_META[statusKey] || STATUS_META.operational;
      statusBadge.textContent = `${meta.icon} ${meta.label}`;
      statusBadge.style.background = meta.bg;
      statusBadge.style.color      = meta.color;
      statusBadge.style.border     = `1.5px solid ${meta.border}`;
      statusBadge.style.display    = "inline-block";
    }

    // ── Normalize + merge all records ──
    const normalized = [
      ...workOrders.map(normalizeWO),
      ...inspections.map(normalizeInspection),
      // Only include legacy if NOT already covered by a WO (by workOrderId or by id match)
      ...legacyRecs
        .filter((r) => !workOrders.some((wo) => wo.legacyRecordId === r.id))
        .map(normalizeLegacy),
    ].sort((a, b) => b._ts - a._ts);

    if (!normalized.length) {
      listaHistorico.innerHTML = `
        <li style="text-align:center;padding:30px;color:#64748b;background:#f8fafc;border-radius:8px;">
          Nenhum registro encontrado para esta máquina.<br>
          <a href="../os/os-detalhe.html?modo=criar&origin=machine&originId=${encodeURIComponent(idMaquinaURL)}&originNome=${encodeURIComponent(nomeMaquinaURL || "")}&tipo=maintenance"
             style="color:var(--primary);font-weight:700;">
            + Criar primeiro registro
          </a>
        </li>`;
      renderKPIs([], kpis);
      return;
    }

    historicoGlobal   = normalized;
    historicoFiltrado = [...normalized];

    renderKPIs(historicoFiltrado, kpis);
    renderAlertas(kpis, machineState);
    renderizarPagina(1);

  } catch (error) {
    clearTimeout(timeoutId);
    console.error("[Histórico] Erro ao carregar:", error);
    if (overlay) overlay.classList.add("hidden");
    listaHistorico.innerHTML = `
      <li style="color:#dc2626;text-align:center;padding:20px;background:#fef2f2;border-radius:8px;">
        Falha ao conectar com o banco de dados. <a href="" style="color:var(--primary);">Recarregar</a>
      </li>`;
  }
}

// ─── Page Renderer ────────────────────────────────────────────────────────────
function renderizarPagina(pagina) {
  paginaAtual = pagina;
  listaHistorico.innerHTML = "";

  if (!historicoFiltrado.length) {
    listaHistorico.innerHTML = `
      <li style="text-align:center;padding:30px;color:#64748b;background:#f8fafc;border-radius:8px;">
        Nenhum registro encontrado com os filtros aplicados.
      </li>`;
    renderizarPaginacao();
    return;
  }

  const inicio      = (pagina - 1) * ITENS_POR_PAGINA;
  const itensPagina = historicoFiltrado.slice(inicio, inicio + ITENS_POR_PAGINA);

  itensPagina.forEach((item) => {
    const sc = getItemStatusMeta(item);

    const li = document.createElement("li");
    li.className = `timeline-item ${sc.bg}`;

    const relato = item.title.length > 110 ? item.title.slice(0, 110) + "…" : item.title;

    // Source badge — inspection (blue) vs maintenance O.S. (orange)
    const isWOInspection = item._type === "work_order" && item.tipoLabel === "Inspecao";
    const sourceBadge = item._type === "work_order"
      ? isWOInspection
        ? `<span style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;padding:1px 6px;border-radius:4px;font-size:.65rem;font-weight:700;">👁 Inspeção</span>`
        : `<span style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;padding:1px 6px;border-radius:4px;font-size:.65rem;font-weight:700;">🔧 O.S. Manutenção</span>`
      : item._type === "inspection"
        ? `<span style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;padding:1px 6px;border-radius:4px;font-size:.65rem;font-weight:700;">👁 Inspeção</span>`
        : `<span style="background:#f8fafc;color:#64748b;border:1px solid #e2e8f0;padding:1px 6px;border-radius:4px;font-size:.65rem;font-weight:600;">Legado</span>`;

    li.innerHTML = `
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin-bottom:5px;">
        <span class="timeline-data">${fmtDataHora(item._ts)}</span>
        <span class="timeline-status" style="background:${sc.color};">${sc.label}</span>
        ${getTipoBadgeHtml(item)}
        ${getPrioridadeBadgeHtml(item)}
        ${getDowntimeBadgeHtml(item)}
        ${sourceBadge}
      </div>
      <div class="timeline-tecnico">${item._type === "inspection" ? "🔍" : "👷"} ${item.technician}</div>
      <div class="timeline-relato">${relato || "Sem relato"}</div>
      ${item._type === "work_order"
        ? `<a href="../os/os-report.html?id=${item.id}"
              style="display:inline-block;margin-top:8px;padding:6px 12px;background:${item.tipoLabel === "Inspecao" ? "#1e40af" : "#7c3aed"};color:#fff;
                     border-radius:6px;font-size:.75rem;font-weight:700;text-decoration:none;">
             ${item.tipoLabel === "Inspecao" ? "👁 Ver Inspeção" : "📋 Ver Relatório"}
           </a>
           <a href="../os/os-detalhe.html?id=${item.id}"
              style="display:inline-block;margin-top:8px;margin-left:6px;padding:6px 12px;
                     background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;
                     border-radius:6px;font-size:.75rem;font-weight:700;text-decoration:none;">
             📄 Ver O.S
           </a>`
        : ""}
    `;

    // All items open detail on click; WO button links navigate directly
    li.style.cursor = "pointer";
    li.addEventListener("click", (e) => {
      if (e.target.tagName === "A") return; // let button links navigate normally
      abrirModalDetalhes(item);
    });

    listaHistorico.appendChild(li);
  });

  renderizarPaginacao();
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function renderizarPaginacao() {
  const totalPaginas = Math.ceil(historicoFiltrado.length / ITENS_POR_PAGINA);
  let container = document.getElementById("paginacao-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "paginacao-container";
    container.style.cssText = "display:flex;justify-content:center;gap:8px;margin:20px 0;flex-wrap:wrap;";
    listaHistorico.parentNode.appendChild(container);
  }
  container.innerHTML = "";
  if (totalPaginas <= 1) return;

  for (let i = 1; i <= totalPaginas; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.style.cssText = `
      padding:8px 14px;border-radius:6px;border:1px solid var(--primary);
      background:${i === paginaAtual ? "var(--primary)" : "white"};
      color:${i === paginaAtual ? "white" : "var(--primary)"};
      cursor:pointer;font-weight:700;transition:.15s;
    `;
    btn.addEventListener("click", () => {
      renderizarPagina(i);
      document.querySelector(".cabecalho-maquina")?.scrollIntoView({ behavior: "smooth" });
    });
    container.appendChild(btn);
  }
}

// ─── Detail Modal ────────────────────────────────────────────────────────────
function abrirModalDetalhes(item) {
  const sc = getItemStatusMeta(item);

  if (item._type === "work_order") {
    const wo = item._raw;
    if (modalTitulo) modalTitulo.textContent = "Detalhes da O.S";

    const tipoLabel = item.tipoLabel || "Manutenção";
    const dtBadge   = item.durationHours ? `<span class="badge-downtime">⏱ ${item.durationHours}h</span>` : "";
    const parts     = wo.resources?.parts || [];
    const partsHtml = parts.length
      ? `<div style="margin-top:10px;padding:10px;background:#f8fafc;border-radius:6px;">
           <strong>Peças utilizadas (${parts.length}):</strong>
           <ul style="margin:4px 0 0 14px;">
             ${parts.map((p) => `<li>${p.quantidade || 1}× ${p.nome} (${p.unidade || "un"})</li>`).join("")}
           </ul>
         </div>`
      : "";

    const schedulingHtml = (wo.scheduling?.plannedStart || wo.scheduling?.actualStart)
      ? `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:8px 12px;margin-top:8px;font-size:.82rem;">
           📅 <strong>Início previsto:</strong> ${fmtDataHora(wo.scheduling?.plannedStart)}
           ${wo.scheduling?.actualStart ? `<br>▶ <strong>Início real:</strong> ${fmtDataHora(wo.scheduling.actualStart)}` : ""}
           ${wo.scheduling?.actualEnd   ? `<br>✅ <strong>Término real:</strong> ${fmtDataHora(wo.scheduling.actualEnd)}`   : ""}
         </div>`
      : "";

    const obsHtml = wo.observations
      ? `<p style="margin:6px 0;font-size:.85rem;"><strong>Observações:</strong><br>${wo.observations}</p>`
      : "";

    modalCorpo.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <span style="background:${sc.color};color:#fff;padding:4px 12px;border-radius:99px;font-weight:700;font-size:.82rem;">${sc.label}</span>
        ${getTipoBadgeHtml(item)}
        ${getPrioridadeBadgeHtml(item)}
        ${dtBadge}
      </div>
      <p style="margin:4px 0;"><strong>Título:</strong> ${wo.title || "—"}</p>
      <p style="margin:4px 0;"><strong>Data:</strong> ${fmtDataHora(item._ts)}</p>
      <p style="margin:4px 0;"><strong>Técnico:</strong> ${item.technician}</p>
      <p style="margin:4px 0;"><strong>Setor:</strong> ${wo.sector || "—"}</p>
      ${wo.downtime ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:7px 12px;margin-top:6px;font-size:.83rem;">⛔ Equipamento parado (downtime)</div>` : ""}
      ${schedulingHtml}
      <hr style="margin:10px 0;border:0;border-top:1px solid #e2e8f0;">
      <p style="margin:4px 0;font-size:.85rem;"><strong>Descrição:</strong><br>${wo.description || "Sem descrição"}</p>
      ${obsHtml}
      ${partsHtml}
      <a href="../os/os-detalhe.html?id=${item.id}"
         style="display:block;text-align:center;background:var(--primary);color:white;
                padding:12px;border-radius:8px;font-weight:bold;margin-top:14px;text-decoration:none;">
        📄 Abrir Ordem de Serviço ➔
      </a>
      <a href="../os/os-report.html?id=${item.id}"
         style="display:block;text-align:center;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;
                padding:12px;border-radius:8px;font-weight:700;margin-top:8px;text-decoration:none;">
        📋 Gerar Relatório
      </a>
    `;
    modal.classList.remove("hidden");
    return;
  }

  if (item._type === "inspection") {
    const insp = item._raw;
    const issuesList = item.issues.length
      ? `<div style="margin-top:10px;padding:10px;background:#f8fafc;border-radius:6px;">
           <strong>Itens não conformes (${item.issues.length}):</strong>
           <ul style="margin:6px 0 0 14px;">
             ${item.issues.map((iss) => `<li><strong>${iss.item}</strong> — ${iss.severity === "critical" ? "🔴 Crítico" : "🟡 Atenção"}: ${iss.description || "—"}</li>`).join("")}
           </ul>
         </div>`
      : `<p style="color:#64748b;margin-top:8px;">Nenhum item não conforme.</p>`;

    modalCorpo.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <span style="background:${sc.color};color:#fff;padding:4px 12px;border-radius:99px;font-weight:700;font-size:.82rem;">${sc.label}</span>
        ${getTipoBadgeHtml(item)}
      </div>
      <p style="margin:4px 0;"><strong>Data:</strong> ${fmtDataHora(item._ts)}</p>
      <p style="margin:4px 0;"><strong>Inspetor:</strong> ${item.technician}</p>
      ${item.diagnosis ? `<p style="margin:8px 0;"><strong>Diagnóstico:</strong><br>${item.diagnosis}</p>` : ""}
      ${item.recommendation ? `<p style="margin:4px 0;"><strong>Recomendação:</strong><br>${item.recommendation}</p>` : ""}
      ${issuesList}
    `;
  } else {
    // Legacy record
    const reg = item._raw;
    const relato = (reg.diagnostico?.relatorio || reg.relatorio || "Sem relatório").trim();
    const tipoManu = reg.diagnostico?.tipoManutencao || "—";
    const tipoM = TIPO_META[tipoManu] || { label: tipoManu, bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" };

    const htmlPecas = reg.estoque?.itens?.length
      ? `<div style="margin-top:10px;padding:10px;background:#f8fafc;border-radius:6px;">
           <strong>Peças:</strong>
           <ul style="margin:4px 0 0 14px;">${reg.estoque.itens.map((p) => `<li>${p.quantidade}× ${p.nome}</li>`).join("")}</ul>
         </div>`
      : "";

    const htmlCausa = reg.analiseFalha?.causaRaiz && reg.analiseFalha.causaRaiz !== "Nao Aplicavel"
      ? `<p style="margin:5px 0;"><strong>Causa Raiz:</strong> ${reg.analiseFalha.causaRaiz}</p>
         <p style="margin:5px 0;"><strong>Ação Tomada:</strong> ${reg.analiseFalha.acaoTomada || "—"}</p>`
      : "";

    const downtime = reg.diagnostico?.tempoParada > 0
      ? `<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:6px;padding:8px 12px;margin-top:8px;font-size:.85rem;">
           ⏱ <strong>Downtime:</strong> ${reg.diagnostico.tempoParada}h
         </div>`
      : "";

    // WO link for legacy records that have a linked WO, or migration link for pending ones
    let woBtn = "";
    if (item.workOrderId) {
      woBtn = `<a href="../os/os-detalhe.html?id=${encodeURIComponent(item.workOrderId)}"
                  style="display:block;text-align:center;background:#1e40af;color:#fff;
                         padding:12px;border-radius:8px;font-weight:800;margin-top:14px;text-decoration:none;">
                📄 Ver O.S. Vinculada
              </a>`;
    } else if (item.status === "Revisão") {
      const machineId   = reg.dadosEquipamento?.id   || idMaquinaURL;
      const machineName = reg.dadosEquipamento?.nome  || nomeMaquinaURL || "";
      const machineSetor = reg.dadosEquipamento?.setor || "";
      const novaOsUrl = `../os/os-detalhe.html?modo=criar&mode=execute&origin=machine`
        + `&originId=${encodeURIComponent(machineId)}`
        + `&originNome=${encodeURIComponent(machineName)}`
        + `&sector=${encodeURIComponent(machineSetor)}`
        + `&tipo=maintenance&legacyId=${encodeURIComponent(reg.id)}`;
      woBtn = `
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;margin-top:14px;font-size:.78rem;color:#78350f;">
          ⚠️ Registro legado — a execução criará uma nova O.S. no sistema unificado.
        </div>
        <a href="${novaOsUrl}"
           style="display:block;text-align:center;background:#1e40af;color:#fff;
                  padding:12px;border-radius:8px;font-weight:800;margin-top:8px;text-decoration:none;">
          ▶ Executar Ordem de Serviço
        </a>`;
    }

    modalCorpo.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <span style="background:${sc.color};color:#fff;padding:4px 12px;border-radius:99px;font-weight:700;font-size:.82rem;">${sc.label}</span>
        <span style="background:${tipoM.bg};color:${tipoM.color};border:1px solid ${tipoM.border};padding:4px 12px;border-radius:99px;font-weight:700;font-size:.82rem;">${tipoM.label}</span>
      </div>
      <p style="margin:4px 0;"><strong>Data:</strong> ${fmtDataHora(item._ts)}</p>
      <p style="margin:4px 0;"><strong>Técnico:</strong> ${item.technician}</p>
      ${downtime}
      <hr style="margin:10px 0;border:0;border-top:1px solid #e2e8f0;">
      <p style="margin:4px 0;"><strong>Relatório:</strong><br>${relato}</p>
      ${htmlCausa}
      ${htmlPecas}
      ${woBtn}
    `;
  }

  modal.classList.remove("hidden");
}

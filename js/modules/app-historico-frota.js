/**
 * app-historico-frota.js — Fleet Vehicle Unified History & KPI Dashboard
 *
 * Architecture: Grouped Timeline (CMMS Traceability Standard)
 *
 *   INSPECTION (origin event)
 *     └─ WORK ORDER 1 (auto-created from NC)
 *     └─ WORK ORDER 2 (auto-created from NC)
 *   STANDALONE WORK ORDER (manually created)
 *
 * Data sources:
 *   - checklists_frota → inspections
 *   - work_orders (origin="inspection"|"fleet"|entityType="vehicle") → maintenance WOs
 *   - purchase_orders (linked via originWO) → purchase events
 *
 * Filter modes: all | inspections | work_orders
 * KPIs: computed from raw work_orders data
 */

import { checkAuth } from "../core/db-auth.js";
import { getWorkOrdersByVehicle } from "../core/db-os.js";
import { obterInspecoesRecentes, getPurchaseOrdersByVehicle } from "../core/db-frota.js";
import { frotaDB } from "../data/dados-frota.js";

await checkAuth("historico-frota");

// ─── URL params ───────────────────────────────────────────────────────────────
const params    = new URLSearchParams(window.location.search);
const vehicleId = params.get("id");

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const displayId      = document.getElementById("display-id");
const displayNome    = document.getElementById("display-nome");
const listaHistorico = document.getElementById("lista-historico-completo");
const overlay        = document.getElementById("overlay");
const alertSection   = document.getElementById("alert-section");

// KPI elements
const kpiIntervencoes = document.getElementById("kpi-intervencoes");
const kpiParadas      = document.getElementById("kpi-paradas");
const kpiHorasParadas = document.getElementById("kpi-horas-paradas");
const kpiMtbf         = document.getElementById("kpi-mtbf");
const kpiMttr         = document.getElementById("kpi-mttr");
const kpiTrendEl      = document.getElementById("kpi-trend");

// Modal
const modal          = document.getElementById("modal-relatorio");
const btnFecharModal = document.getElementById("btn-fechar-modal");
const modalCorpo     = document.getElementById("modal-corpo");
const modalTitulo    = document.getElementById("modal-titulo");

// Filter pills
const pillAll     = document.getElementById("pill-all");
const pillInsp    = document.getElementById("pill-inspections");
const pillWO      = document.getElementById("pill-work_orders");

// ─── State ────────────────────────────────────────────────────────────────────
let groupsGlobal   = [];   // all timeline groups
let groupsFiltered = [];   // after filter applied
let filterMode     = "all";
let paginaAtual    = 1;
const GROUPS_POR_PAGINA = 8;

// ─── Modal close ──────────────────────────────────────────────────────────────
if (btnFecharModal && modal) {
  btnFecharModal.addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
}

// ─── Guard ────────────────────────────────────────────────────────────────────
if (!vehicleId) {
  window.location.href = "painel-frota.html";
} else {
  const veiculoInfo = frotaDB.find((v) => v.id === vehicleId);
  const placa  = veiculoInfo?.placa  || vehicleId;
  const modelo = veiculoInfo?.modelo || "";
  const icone  = veiculoInfo?.icone  || "🚛";

  if (displayId)   displayId.textContent  = vehicleId;
  if (displayNome) displayNome.textContent = `${icone} ${placa}${modelo ? " — " + modelo : ""}`;

  const btnNovaOs = document.getElementById("btn-nova-os-veiculo");
  if (btnNovaOs) {
    btnNovaOs.href = `../os/os-detalhe.html?modo=criar&origin=fleet&originId=${encodeURIComponent(vehicleId)}&originNome=${encodeURIComponent(placa)}&tipo=maintenance`;
  }

  carregarHistorico();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDataHora(ts) {
  if (!ts) return "—";
  const d = new Date(ts.seconds ? ts.seconds * 1000 : ts);
  return d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtData(ts) {
  if (!ts) return "—";
  return new Date(ts.seconds ? ts.seconds * 1000 : ts).toLocaleDateString("pt-BR");
}

// ─── Data Normalization ───────────────────────────────────────────────────────

function normalizeWO(wo) {
  const ts = wo.scheduling?.actualEnd || wo.scheduling?.actualStart || wo.timestampEnvio || 0;
  const isPurchase = wo.type === "purchase";
  const tipoLabel = isPurchase ? "Compra de Peças"
    : wo.maintenanceType === "preventive" ? "Preventiva"
    : wo.maintenanceType === "corrective" ? "Corretiva"
    : wo.type === "service" ? "Serviço"
    : "Manutenção";

  return {
    _type:           "work_order",
    isPurchase,
    id:              wo.id,
    _ts:             ts,
    title:           wo.title || tipoLabel,
    description:     wo.description || "",
    status:          wo.status,
    maintenanceType: wo.maintenanceType || "corrective",
    tipoLabel,
    technician:      wo.technician || wo.executor || wo.criadoPor || "—",
    durationHours:   wo.scheduling?.durationHours ?? null,
    downtime:        !!wo.downtime,
    priority:        wo.priority,
    inspecaoId:      wo.inspecaoId || null,
    ncItemLabel:     wo.ncItemLabel || null,
    // Consolidated issues list (new — set when WO covers multiple NC items)
    issues:          wo.issues || [],
    issueCount:      wo.issues?.length || (wo.ncItemLabel ? 1 : 0),
    // Purchase-specific (legacy — kept for old WO records that had type=purchase)
    purchaseItems:   wo.items || [],
    _raw:            wo,
  };
}

function normalizeInspection(insp) {
  const tipo    = insp.header?.inspectionType === "departure" ? "Saída" : "Retorno";
  const avaria  = (insp.nonConformities || 0) > 0;
  const ncCount = insp.nonConformities || 0;
  const motorista = insp.driver?.name || insp.driver || insp.header?.driver || "—";

  // inspector can be a string OR an object {name: "..."} — handle both
  const inspectorRaw = insp.inspector;
  const inspectorName = typeof inspectorRaw === "object"
    ? (inspectorRaw?.name || "—")
    : (inspectorRaw || insp.createdBy || "—");

  // Determine severity for color coding
  let severity = "ok";
  if (ncCount >= 3) severity = "critical";
  else if (ncCount >= 1) severity = "attention";

  return {
    _type:       "inspection",
    id:          insp.id,
    _ts:         insp.timestampEnvio || 0,
    title:       `Inspeção de ${tipo}`,
    description: avaria
      ? `${ncCount} item(s) não conforme(s) detectado(s).`
      : "Todos os itens em conformidade.",
    status:      avaria ? "avaria" : "conforme",
    tipoLabel:   tipo,
    technician:  inspectorName,
    motorista,
    ncCount,
    avaria,
    severity,
    tipo,
    linkedWorkOrders: insp.linkedWorkOrders || [],
    kmAtual:  insp.header?.mileage || insp.header?.km || null,
    destino:  insp.header?.destination || insp.header?.destino || null,
    checklist: insp.checklist || [],
    _raw:     insp,
  };
}

function normalizePurchase(po) {
  const itemCount   = po.items?.length || 0;
  // Handle both "descricao" (current) and legacy "nome" field
  const firstItem   = po.items?.[0]?.descricao || po.items?.[0]?.nome || "Itens não especificados";
  const statusLabel = {
    pending:  "Pendente",
    approved: "Aprovado",
    ordered:  "Pedido Realizado",
    received: "Recebido",
    cancelled: "Cancelado",
  }[po.status] || po.status;

  return {
    _type:         "purchase",
    id:            po.id,
    _ts:           po.timestampEnvio || 0,
    title:         po.justificativa
      ? `Pedido de Compra — ${firstItem}`
      : `Compra: ${firstItem}`,
    description:   po.justificativa || "",
    status:        po.status,
    statusLabel,
    tipoLabel:     "Compra",
    technician:    po.criadoPor || po.solicitante || "—",
    durationHours: null,
    downtime:      false,
    priority:      po.urgencia === "critico" ? "high" : po.urgencia === "urgente" ? "medium" : null,
    originWO:      po.originWO   || null,
    ncItemLabel:   po.ncItemLabel || null,
    itemCount,
    // Expose items for card display (purchase_orders uses {nome, quantidade})
    items:         po.items || [],
    totalEstimado: po.totalEstimado || 0,
    _raw:          po,
  };
}

// ─── Group Builder ────────────────────────────────────────────────────────────

/**
 * Builds a grouped timeline from raw data arrays.
 *
 * Returns an array of groups sorted by primary timestamp (desc):
 *   { type: "inspection_group", _ts, inspection, children: [WO|PO, ...] }
 *   { type: "standalone_wo",    _ts, wo,         children: [PO, ...] }
 */
function buildGroups(workOrders, inspections, purchaseOrders) {
  // Index POs by originWO (legacy path: PO linked to a WO)
  const poByWO = new Map();
  // Index POs by originId when origem="inspection" (new path: PO linked directly to inspection)
  const poByInspId = new Map();

  purchaseOrders.forEach((po) => {
    const norm = normalizePurchase(po);
    // New path — PO linked directly to an inspection document
    if (po.origem === "inspection" && po.originId) {
      if (!poByInspId.has(po.originId)) poByInspId.set(po.originId, []);
      poByInspId.get(po.originId).push(norm);
    }
    // Legacy path — PO linked via a WO ID (kept for backwards compatibility)
    if (po.originWO) {
      if (!poByWO.has(po.originWO)) poByWO.set(po.originWO, []);
      poByWO.get(po.originWO).push(norm);
    }
  });

  // Index WOs by inspecaoId (maintenance WOs created from inspections)
  const woByInspId = new Map();
  workOrders.forEach((wo) => {
    const iid = wo.inspecaoId;
    if (iid) {
      if (!woByInspId.has(iid)) woByInspId.set(iid, []);
      woByInspId.get(iid).push(wo);
    }
  });

  const groups = [];

  // ── Inspection-led groups ──────────────────────────────────────────────────
  inspections.forEach((insp) => {
    const normInsp  = normalizeInspection(insp);
    const linkedRaw = woByInspId.get(insp.id) || [];
    const linkedWOs = linkedRaw.map(normalizeWO);

    // POs via legacy WO-link path
    const poViaWO = linkedWOs.flatMap((wo) => poByWO.get(wo.id) || []);
    // POs via direct inspection-link path (new)
    const poViaDirect = poByInspId.get(insp.id) || [];

    // Merge and deduplicate by PO id
    const seenPoIds = new Set();
    const linkedPOs = [...poViaWO, ...poViaDirect].filter((po) => {
      if (seenPoIds.has(po.id)) return false;
      seenPoIds.add(po.id);
      return true;
    });

    // Children sorted ascending (chronological under the inspection)
    const children = [...linkedWOs, ...linkedPOs].sort((a, b) => a._ts - b._ts);

    groups.push({
      type:       "inspection_group",
      _ts:        normInsp._ts,
      inspection: normInsp,
      children,
    });
  });

  // ── Standalone WOs (no inspection parent) ─────────────────────────────────
  const linkedWOIds = new Set(workOrders.filter((wo) => wo.inspecaoId).map((wo) => wo.id));
  workOrders
    .filter((wo) => !wo.inspecaoId && !linkedWOIds.has(wo.id))
    .forEach((wo) => {
      const normWO    = normalizeWO(wo);
      const linkedPOs = poByWO.get(wo.id) || [];
      groups.push({
        type:     "standalone_wo",
        _ts:      normWO._ts,
        wo:       normWO,
        children: linkedPOs,
      });
    });

  // ── Sort all groups desc by primary timestamp ──────────────────────────────
  return groups.sort((a, b) => b._ts - a._ts);
}

// ─── KPI Calculation ─────────────────────────────────────────────────────────

function calcularKPIs(workOrders, inspections) {
  const wosSorted    = [...workOrders].sort((a, b) => (a.timestampEnvio || 0) - (b.timestampEnvio || 0));
  const paradas      = workOrders.filter((wo) => wo.downtime);
  const totalDowntime = workOrders
    .filter((wo) => wo.downtime && wo.status === "completed" && wo.scheduling?.durationHours)
    .reduce((sum, wo) => sum + (wo.scheduling.durationHours || 0), 0);

  let mtbf = null;
  const downtimeWOs = wosSorted.filter((wo) => wo.downtime);
  if (downtimeWOs.length >= 2) {
    const spans = [];
    for (let i = 1; i < downtimeWOs.length; i++) {
      const diff = (downtimeWOs[i].timestampEnvio || 0) - (downtimeWOs[i - 1].timestampEnvio || 0);
      if (diff > 0) spans.push(diff);
    }
    if (spans.length) mtbf = Math.round(spans.reduce((s, v) => s + v, 0) / spans.length / 3_600_000 * 10) / 10;
  }

  let mttr = null;
  const completedDowntime = workOrders.filter((wo) => wo.downtime && wo.status === "completed" && wo.scheduling?.durationHours != null);
  if (completedDowntime.length) {
    mttr = Math.round(completedDowntime.reduce((s, wo) => s + wo.scheduling.durationHours, 0) / completedDowntime.length * 10) / 10;
  }

  const sortedInsp = [...inspections].sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0));
  let trend = "stable";
  if (sortedInsp.length >= 5) {
    const last5  = sortedInsp.slice(0, 5);
    const prior5 = sortedInsp.slice(5, 10);
    const ncLast  = last5.filter((i)  => (i.nonConformities || 0) > 0).length;
    const ncPrior = prior5.filter((i) => (i.nonConformities || 0) > 0).length;
    if (prior5.length) {
      if (ncLast > ncPrior + 1) trend = "degrading";
      else if (ncLast < ncPrior) trend = "improving";
    }
  }

  return { totalParadas: paradas.length, totalDowntime: Math.round(totalDowntime * 10) / 10, mtbf, mttr, trend };
}

// ─── KPI Rendering ────────────────────────────────────────────────────────────

function renderKPIs(workOrders, kpis) {
  const totalRegistros = groupsGlobal.length;
  const totalParadas   = workOrders.filter((r) => r.downtime).length;
  const totalDowntime  = workOrders.reduce((acc, r) => acc + (r.downtime && r.scheduling?.durationHours ? r.scheduling.durationHours : 0), 0);

  if (kpiIntervencoes) kpiIntervencoes.textContent = totalRegistros;
  if (kpiParadas)      kpiParadas.textContent      = totalParadas;
  if (kpiHorasParadas) kpiHorasParadas.textContent = totalDowntime > 0 ? `${totalDowntime.toFixed(1)}h` : "0h";

  if (kpiMtbf) {
    kpiMtbf.textContent = kpis?.mtbf != null ? `${kpis.mtbf}h` : "—";
    if (kpis?.mtbf != null && kpis.mtbf < 200) kpiMtbf.style.color = "#dc2626";
  }
  if (kpiMttr) {
    kpiMttr.textContent = kpis?.mttr != null ? `${kpis.mttr}h` : "—";
    if (kpis?.mttr != null && kpis.mttr > 8) kpiMttr.style.color = "#dc2626";
  }
  if (kpiTrendEl && kpis) {
    const trendMap = { improving: { label: "📈 Melhorando", color: "#16a34a" }, stable: { label: "➡ Estável", color: "#475569" }, degrading: { label: "📉 Piorando", color: "#dc2626" } };
    const tl = trendMap[kpis.trend] || trendMap.stable;
    kpiTrendEl.textContent = tl.label;
    kpiTrendEl.style.color = tl.color;
  }
}

// ─── Alert Rendering ──────────────────────────────────────────────────────────

function renderAlertas(kpis, openWOs, workOrders) {
  if (!alertSection) return;
  const alerts = [];

  if (kpis.mtbf != null && kpis.mtbf < 200) {
    alerts.push({ tipo: "critical", icon: "⚠️", titulo: "MTBF Crítico", descricao: `MTBF de ${kpis.mtbf}h — veículo com falhas muito frequentes.` });
  }
  if (openWOs >= 2) {
    alerts.push({ tipo: "warning", icon: "🔔", titulo: `${openWOs} O.S Abertas`, descricao: "Múltiplas ordens de serviço em aberto para este veículo." });
  }

  // Pending Purchase WO alerts
  const pendingPurchaseWOs = (workOrders || []).filter(
    (wo) => wo.type === "purchase" && wo.status !== "completed" && wo.status !== "cancelled"
  );
  if (pendingPurchaseWOs.length > 0) {
    const criticalParts = pendingPurchaseWOs.filter((wo) => wo.priority === "high");
    if (criticalParts.length > 0) {
      const partNames = criticalParts
        .flatMap((wo) => wo.items || [])
        .filter((i) => i.priority === "high")
        .map((i) => i.name)
        .slice(0, 3)
        .join(", ");
      alerts.push({
        tipo: "critical",
        icon: "🛒",
        titulo: `${criticalParts.length} Compra(s) de Peça Crítica Pendente(s)`,
        descricao: partNames
          ? `Peças críticas aguardando compra: ${partNames}.`
          : "Peças de alta prioridade aguardando compra.",
      });
    } else {
      alerts.push({
        tipo: "warning",
        icon: "🛒",
        titulo: `${pendingPurchaseWOs.length} Compra(s) de Peças Pendente(s)`,
        descricao: "Veículo possui pedidos de compra de peças em aberto.",
      });
    }
  }

  if (!alerts.length) { alertSection.style.display = "none"; return; }
  alertSection.style.display = "flex";
  alertSection.innerHTML = alerts.map((a) => `
    <div class="alert-item ${a.tipo === "critical" ? "alert-critical" : "alert-warning"}">
      <span style="font-size:1.1rem;line-height:1;">${a.icon}</span>
      <div><strong>${a.titulo}</strong><div style="font-size:.8rem;margin-top:2px;">${a.descricao}</div></div>
    </div>
  `).join("");
}

// ─── Filter Logic ─────────────────────────────────────────────────────────────

function aplicarFiltro() {
  if (filterMode === "inspections") {
    // Show only inspection groups (no standalone WOs)
    groupsFiltered = groupsGlobal.filter((g) => g.type === "inspection_group");
  } else if (filterMode === "work_orders") {
    // Flatten: all WOs (both standalone and inspection-children) as individual items
    // Represented as "standalone_wo" groups for uniform rendering
    const flatWOs = [];
    groupsGlobal.forEach((g) => {
      if (g.type === "standalone_wo") {
        flatWOs.push(g);
      } else if (g.type === "inspection_group") {
        // Expose each child WO as a standalone group (no inspection wrapper)
        g.children
          .filter((c) => c._type === "work_order")
          .forEach((wo) => flatWOs.push({ type: "standalone_wo", _ts: wo._ts, wo, children: [] }));
      }
    });
    groupsFiltered = flatWOs.sort((a, b) => b._ts - a._ts);
  } else {
    // "all" — full grouped view
    groupsFiltered = groupsGlobal;
  }
}

// ─── Filter Pill Handlers ─────────────────────────────────────────────────────

function setFilter(mode) {
  filterMode = mode;
  [pillAll, pillInsp, pillWO].forEach((p) => p?.classList.remove("pill-active"));
  const active = { all: pillAll, inspections: pillInsp, work_orders: pillWO }[mode];
  active?.classList.add("pill-active");
  aplicarFiltro();
  renderizarPagina(1);
}

pillAll?.addEventListener("click",  () => setFilter("all"));
pillInsp?.addEventListener("click", () => setFilter("inspections"));
pillWO?.addEventListener("click",   () => setFilter("work_orders"));

// ─── Main Data Loader ─────────────────────────────────────────────────────────

async function carregarHistorico() {
  const timeoutId = setTimeout(() => {
    if (overlay) overlay.classList.add("hidden");
    listaHistorico.innerHTML = `<li class="tl-empty" style="background:#fef2f2;color:#dc2626;">⚠️ Tempo esgotado. <a href="">Tentar novamente</a></li>`;
  }, 12_000);

  try {
    const [workOrders, inspections] = await Promise.all([
      getWorkOrdersByVehicle(vehicleId).catch((e) => { console.error("[historico-frota] getWorkOrdersByVehicle:", e); return []; }),
      obterInspecoesRecentes(vehicleId, 100).catch((e) => { console.error("[historico-frota] obterInspecoesRecentes:", e); return []; }),
    ]);

    const woIds          = workOrders.map((wo) => wo.id);
    const purchaseOrders = await getPurchaseOrdersByVehicle(vehicleId, woIds).catch(() => []);

    // Debug: log raw data to help diagnose empty state issues
    console.log(`[historico-frota] vehicleId="${vehicleId}" | inspections=${inspections.length} | workOrders=${workOrders.length} | purchaseOrders=${purchaseOrders.length}`);
    if (inspections.length === 0 && workOrders.length === 0) {
      console.warn("[historico-frota] Both sources returned empty. Check vehicleId match and Firestore rules.");
    }

    clearTimeout(timeoutId);
    if (overlay) overlay.classList.add("hidden");

    groupsGlobal = buildGroups(workOrders, inspections, purchaseOrders);

    console.log(`[historico-frota] groups built: ${groupsGlobal.length} (inspection_groups=${groupsGlobal.filter(g=>g.type==="inspection_group").length}, standalone_wos=${groupsGlobal.filter(g=>g.type==="standalone_wo").length})`);

    aplicarFiltro();

    const kpis   = calcularKPIs(workOrders, inspections);
    const openWOs = workOrders.filter((wo) => wo.status === "open" || wo.status === "in_progress").length;

    renderKPIs(workOrders, kpis);
    renderAlertas(kpis, openWOs, workOrders);

    if (!groupsGlobal.length) {
      const placa = frotaDB.find((v) => v.id === vehicleId)?.placa || vehicleId;
      listaHistorico.innerHTML = `
        <li class="tl-empty">
          Nenhum registro encontrado para este veículo.<br>
          <a href="../os/os-detalhe.html?modo=criar&origin=fleet&originId=${encodeURIComponent(vehicleId)}&originNome=${encodeURIComponent(placa)}&tipo=maintenance"
             style="color:var(--primary);font-weight:700;">+ Criar primeiro registro</a>
        </li>`;
      return;
    }

    renderizarPagina(1);

  } catch (error) {
    clearTimeout(timeoutId);
    console.error("[historico-frota]", error);
    if (overlay) overlay.classList.add("hidden");
    listaHistorico.innerHTML = `<li class="tl-empty" style="background:#fef2f2;color:#dc2626;">Falha ao carregar dados. <a href="">Recarregar</a></li>`;
  }
}

// ─── Group Renderers ──────────────────────────────────────────────────────────

function woStatusHtml(status) {
  const map = {
    open:          { label: "🔵 Aberta",         color: "#2563eb", bg: "#eff6ff",  border: "#bfdbfe" },
    in_progress:   { label: "🟡 Em Andamento",   color: "#d97706", bg: "#fffbeb",  border: "#fde68a" },
    waiting_parts: { label: "⏳ Ag. Peças",      color: "#7c3aed", bg: "#f5f3ff",  border: "#ddd6fe" },
    completed:     { label: "✅ Concluída",       color: "#16a34a", bg: "#f0fdf4",  border: "#86efac" },
  };
  const m = map[status] || { label: status, color: "#64748b", bg: "#f8fafc", border: "#e2e8f0" };
  return `<span style="background:${m.bg};color:${m.color};border:1px solid ${m.border};padding:2px 9px;border-radius:99px;font-size:.72rem;font-weight:700;">${m.label}</span>`;
}

function poStatusHtml(status) {
  const map = {
    pending:   { label: "⏳ Pendente",         color: "#d97706", bg: "#fffbeb",  border: "#fde68a" },
    approved:  { label: "✔ Aprovado",          color: "#2563eb", bg: "#eff6ff",  border: "#bfdbfe" },
    ordered:   { label: "📦 Pedido Realizado", color: "#7c3aed", bg: "#f5f3ff",  border: "#ddd6fe" },
    received:  { label: "✅ Recebido",          color: "#16a34a", bg: "#f0fdf4",  border: "#86efac" },
    cancelled: { label: "❌ Cancelado",         color: "#9ca3af", bg: "#f8fafc",  border: "#e2e8f0" },
  };
  const m = map[status] || { label: status, color: "#64748b", bg: "#f8fafc", border: "#e2e8f0" };
  return `<span style="background:${m.bg};color:${m.color};border:1px solid ${m.border};padding:2px 9px;border-radius:99px;font-size:.72rem;font-weight:700;">${m.label}</span>`;
}

/** Renders an inspection card (parent event) */
function renderInspectionCard(insp, childCount, children = []) {
  const severityConfig = {
    critical:  { border: "#dc2626", bg: "#fef2f2", icon: "🔴", badge: "#dc2626", badgeBg: "#fef2f2" },
    attention: { border: "#d97706", bg: "#fffbeb", icon: "🟡", badge: "#d97706", badgeBg: "#fffbeb" },
    ok:        { border: "#16a34a", bg: "#f0fdf4", icon: "🟢", badge: "#16a34a", badgeBg: "#f0fdf4" },
  };
  const cfg = severityConfig[insp.severity] || severityConfig.ok;

  const ncBadge = insp.avaria
    ? `<span style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:2px 9px;border-radius:99px;font-size:.72rem;font-weight:700;">🚨 ${insp.ncCount} NC</span>`
    : `<span style="background:#f0fdf4;color:#16a34a;border:1px solid #86efac;padding:2px 9px;border-radius:99px;font-size:.72rem;font-weight:700;">✅ Conforme</span>`;

  // Breakdown badge: maintenance WOs + purchase orders
  let generatedBadge = "";
  if (childCount > 0) {
    const woCount  = children.filter((c) => c._type === "work_order").length;
    const poCount  = children.filter((c) => c._type === "purchase").length;
    const parts = [];
    if (woCount > 0) parts.push(`🔧 ${woCount} O.S`);
    if (poCount > 0) parts.push(`🛒 ${poCount} Compra`);
    const label = parts.length ? parts.join(" · ") : `${childCount} ação(ões)`;
    generatedBadge = `<span style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;padding:2px 9px;border-radius:99px;font-size:.68rem;font-weight:700;">⚡ ${label}</span>`;
  }

  // NC items preview
  const ncItems = insp.checklist?.filter((i) => i.status === "NC") || [];
  const ncListHtml = ncItems.length > 0
    ? `<div style="margin-top:8px;padding:8px 10px;background:#fef2f2;border-radius:6px;border:1px solid #fecaca;">
         <div style="font-size:.7rem;font-weight:700;color:#9f1239;text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px;">Itens Não Conformes</div>
         ${ncItems.slice(0, 5).map((i) => `
           <div style="font-size:.78rem;color:#7f1d1d;display:flex;align-items:center;gap:5px;padding:2px 0;">
             <span style="color:#dc2626;">•</span> ${i.label}
             ${i.notes ? `<span style="color:#b91c1c;font-style:italic;">— ${i.notes}</span>` : ""}
           </div>`).join("")}
         ${ncItems.length > 5 ? `<div style="font-size:.72rem;color:#9ca3af;margin-top:3px;">+${ncItems.length - 5} item(s) adicional(is)</div>` : ""}
       </div>`
    : "";

  return `
    <div class="tl-inspection-card" style="border-left:4px solid ${cfg.border};background:${cfg.bg};">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;flex-wrap:wrap;">
            <span style="font-size:1rem;">${cfg.icon}</span>
            <span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">🔍 INSPEÇÃO DE ${insp.tipo.toUpperCase()}</span>
            ${ncBadge}
            ${generatedBadge}
          </div>
          <div style="font-weight:700;color:#1e293b;font-size:.9rem;">${insp.title}</div>
          <div style="font-size:.78rem;color:#475569;margin-top:3px;">${insp.description}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:.72rem;color:#94a3b8;font-weight:600;">${fmtDataHora(insp._ts)}</div>
          ${insp.kmAtual ? `<div style="font-size:.72rem;color:#64748b;margin-top:2px;">KM ${insp.kmAtual}</div>` : ""}
        </div>
      </div>

      <div style="margin-top:8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="font-size:.78rem;color:#64748b;">👷 ${insp.technician}</span>
        ${insp.motorista && insp.motorista !== "—" ? `<span style="font-size:.78rem;color:#64748b;">· 🚗 ${insp.motorista}</span>` : ""}
        ${insp.destino ? `<span style="font-size:.78rem;color:#64748b;">· 📍 ${insp.destino}</span>` : ""}
      </div>

      ${ncListHtml}
    </div>`;
}

/** Renders a WO card (child or standalone) */
function renderWOCard(wo, isChild = false) {
  const tipoIcon = wo.maintenanceType === "preventive" ? "🛡" : wo.maintenanceType === "corrective" ? "⚡" : "🔧";
  const tipoLabel = wo.maintenanceType === "preventive" ? "PREVENTIVA" : wo.maintenanceType === "corrective" ? "CORRETIVA" : "MANUTENÇÃO";
  const prioMap = { high: { label: "🔴 Alta", color: "#dc2626" }, medium: { label: "🟡 Média", color: "#d97706" }, low: { label: "🟢 Baixa", color: "#16a34a" } };
  const prio = prioMap[wo.priority];

  return `
    <div class="tl-wo-card${isChild ? " tl-child-card" : ""}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;flex-wrap:wrap;">
            <span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;">${tipoIcon} O.S ${tipoLabel}</span>
            ${woStatusHtml(wo.status)}
            ${prio ? `<span style="font-size:.68rem;font-weight:700;color:${prio.color};">${prio.label}</span>` : ""}
            ${wo.downtime ? `<span style="font-size:.68rem;background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;padding:1px 7px;border-radius:99px;font-weight:700;">⛔ Downtime</span>` : ""}
            ${wo.durationHours ? `<span style="font-size:.68rem;color:#64748b;">⏱ ${wo.durationHours}h</span>` : ""}
          </div>
          ${wo.issueCount > 1
            ? `<div style="font-size:.72rem;color:#7c3aed;margin-bottom:3px;font-weight:600;">📋 ${wo.issueCount} itens NC consolidados</div>`
            : wo.ncItemLabel
              ? `<div style="font-size:.72rem;color:#7c3aed;margin-bottom:3px;font-weight:600;">📋 NC: ${wo.ncItemLabel}</div>`
              : ""}
          <div style="font-weight:700;color:#1e293b;font-size:.88rem;">${wo.title}</div>
          ${wo.description ? `<div style="font-size:.77rem;color:#475569;margin-top:3px;white-space:pre-line;">${wo.description.slice(0, 200)}${wo.description.length > 200 ? "…" : ""}</div>` : ""}
          ${wo.issues?.length > 1 ? `
          <div style="margin-top:6px;padding:7px 10px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:6px;">
            <div style="font-size:.68rem;font-weight:700;color:#5b21b6;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Itens NC nesta O.S</div>
            ${wo.issues.slice(0, 5).map((i) => `
              <div style="font-size:.77rem;color:#4c1d95;padding:1px 0;">
                • ${i.label}${i.notes ? ` <span style="color:#6d28d9;font-style:italic;">— ${i.notes}</span>` : ""}
              </div>`).join("")}
            ${wo.issues.length > 5 ? `<div style="font-size:.7rem;color:#a78bfa;margin-top:2px;">+${wo.issues.length - 5} item(s) adicional(is)</div>` : ""}
          </div>` : ""}
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:.72rem;color:#94a3b8;font-weight:600;">${fmtDataHora(wo._ts)}</div>
          <div style="font-size:.72rem;color:#64748b;margin-top:2px;">👷 ${wo.technician}</div>
        </div>
      </div>
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
        <a href="../os/os-report.html?id=${wo.id}"
           style="padding:6px 12px;background:#1e40af;color:#fff;border-radius:6px;font-size:.73rem;font-weight:700;text-decoration:none;">
          📋 Ver Relatório
        </a>
        <a href="../os/os-detalhe.html?id=${wo.id}"
           style="padding:6px 12px;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:6px;font-size:.73rem;font-weight:700;text-decoration:none;">
          📄 Ver O.S
        </a>
      </div>
    </div>`;
}

/** Renders a Purchase WO card (child of inspection group — type=purchase in work_orders) */
function renderPurchaseWOCard(wo) {
  const statusMap = {
    open:          { label: "🔵 Aberta",         color: "#2563eb", bg: "#eff6ff",  border: "#bfdbfe" },
    in_progress:   { label: "🟡 Em Andamento",   color: "#d97706", bg: "#fffbeb",  border: "#fde68a" },
    waiting_parts: { label: "⏳ Ag. Peças",      color: "#7c3aed", bg: "#f5f3ff",  border: "#ddd6fe" },
    completed:     { label: "✅ Recebido",        color: "#16a34a", bg: "#f0fdf4",  border: "#86efac" },
    cancelled:     { label: "❌ Cancelada",       color: "#9ca3af", bg: "#f8fafc",  border: "#e2e8f0" },
  };
  const sm = statusMap[wo.status] || { label: wo.status, color: "#64748b", bg: "#f8fafc", border: "#e2e8f0" };
  const statusBadge = `<span style="background:${sm.bg};color:${sm.color};border:1px solid ${sm.border};padding:2px 9px;border-radius:99px;font-size:.72rem;font-weight:700;">${sm.label}</span>`;

  const prioMap = { high: { label: "🔴 Alta", color: "#dc2626" }, medium: { label: "🟡 Média", color: "#d97706" }, low: { label: "🟢 Baixa", color: "#16a34a" } };
  const prio = prioMap[wo.priority];

  const itemsHtml = wo.purchaseItems?.length
    ? `<div style="margin-top:8px;padding:8px 10px;background:#fff;border:1px solid #fde68a;border-radius:6px;">
         <div style="font-size:.68rem;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px;">Peças Necessárias</div>
         ${wo.purchaseItems.map((p) => `
           <div style="display:flex;justify-content:space-between;align-items:center;font-size:.78rem;color:#78350f;padding:2px 0;border-bottom:1px dashed #fde68a;">
             <span>📦 ${p.name}</span>
             <span style="font-weight:700;color:#92400e;">Qtd: ${p.quantity}</span>
           </div>`).join("")}
       </div>`
    : "";

  return `
    <div class="tl-wo-card tl-child-card" style="background:#fefce8;border-color:#fde68a;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;flex-wrap:wrap;">
            <span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#92400e;">🛒 O.S COMPRA DE PEÇAS</span>
            ${statusBadge}
            ${prio ? `<span style="font-size:.68rem;font-weight:700;color:${prio.color};">${prio.label}</span>` : ""}
          </div>
          ${wo.ncItemLabel ? `<div style="font-size:.72rem;color:#d97706;margin-bottom:3px;font-weight:600;">📋 NC Origem: ${wo.ncItemLabel}</div>` : ""}
          <div style="font-weight:700;color:#1e293b;font-size:.88rem;">${wo.title}</div>
          ${wo.description ? `<div style="font-size:.77rem;color:#475569;margin-top:3px;">${wo.description.slice(0, 160)}${wo.description.length > 160 ? "…" : ""}</div>` : ""}
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:.72rem;color:#94a3b8;font-weight:600;">${fmtDataHora(wo._ts)}</div>
          <div style="font-size:.72rem;color:#64748b;margin-top:2px;">👷 ${wo.technician}</div>
        </div>
      </div>
      ${itemsHtml}
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
        <a href="../os/os-detalhe.html?id=${wo.id}"
           style="padding:6px 12px;background:#854d0e;color:#fff;border-radius:6px;font-size:.73rem;font-weight:700;text-decoration:none;">
          🛒 Ver O.S de Compra
        </a>
      </div>
    </div>`;
}

/** Renders a Purchase Order card (child of inspection or standalone) */
function renderPOCard(po) {
  const prioMap = {
    high:   { label: "🔴 Crítico", color: "#dc2626" },
    medium: { label: "🟡 Urgente", color: "#d97706" },
  };
  const prio = prioMap[po.priority];

  // Items list — supports both current "descricao" and legacy "nome" / "name" fields
  const itemsHtml = po.items?.length
    ? `<div style="margin-top:8px;padding:8px 10px;background:#fff;border:1px solid #fde68a;border-radius:6px;">
         <div style="font-size:.68rem;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Peças Solicitadas</div>
         ${po.items.map((i) => `
           <div style="display:flex;justify-content:space-between;font-size:.78rem;color:#78350f;padding:2px 0;border-bottom:1px dashed #fde68a;">
             <span>📦 ${i.descricao || i.nome || i.name || "—"}</span>
             <span style="font-weight:700;">Qtd: ${i.quantidade ?? i.quantity ?? 1}</span>
           </div>`).join("")}
       </div>`
    : "";

  return `
    <div class="tl-wo-card tl-child-card" style="background:#fefce8;border-color:#fde68a;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;flex-wrap:wrap;">
            <span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#92400e;">🛒 PEDIDO DE COMPRA</span>
            ${poStatusHtml(po.status)}
            ${prio ? `<span style="font-size:.68rem;font-weight:700;color:${prio.color};">${prio.label}</span>` : ""}
          </div>
          ${po.ncItemLabel ? `<div style="font-size:.72rem;color:#d97706;margin-bottom:3px;font-weight:600;">📋 NC Origem: ${po.ncItemLabel}</div>` : ""}
          <div style="font-weight:700;color:#1e293b;font-size:.88rem;">${po.title}</div>
          ${po.description ? `<div style="font-size:.77rem;color:#475569;margin-top:3px;">${po.description.slice(0, 140)}${po.description.length > 140 ? "…" : ""}</div>` : ""}
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:.72rem;color:#94a3b8;font-weight:600;">${fmtDataHora(po._ts)}</div>
          <div style="font-size:.72rem;color:#64748b;margin-top:2px;">👷 ${po.technician}</div>
        </div>
      </div>
      ${itemsHtml}
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
        <a href="../compras/compra-detalhe.html?id=${po.id}"
           style="padding:6px 12px;background:#854d0e;color:#fff;border-radius:6px;font-size:.73rem;font-weight:700;text-decoration:none;">
          🛒 Ver Pedido de Compra
        </a>
      </div>
    </div>`;
}

/** Renders one timeline group */
function renderGrupo(group) {
  const wrapper = document.createElement("li");
  wrapper.className = "tl-group";

  if (group.type === "inspection_group") {
    const hasChildren = group.children.length > 0;
    wrapper.innerHTML = renderInspectionCard(group.inspection, group.children.length, group.children);

    if (hasChildren) {
      const childrenDiv = document.createElement("div");
      childrenDiv.className = "tl-children";

      const connectorLabel = `<div class="tl-connector-label">↓ ${group.children.length} ação(ões) gerada(s)</div>`;
      childrenDiv.innerHTML = connectorLabel;

      group.children.forEach((child) => {
        const childEl = document.createElement("div");
        // purchase_orders records (from compras system)
        if (child._type === "purchase") {
          childEl.innerHTML = renderPOCard(child);
        } else {
          // work_orders records (maintenance WOs)
          childEl.innerHTML = renderWOCard(child, true);
        }
        childrenDiv.appendChild(childEl.firstElementChild);
      });

      wrapper.appendChild(childrenDiv);
    }
  } else {
    // standalone_wo
    wrapper.innerHTML = renderWOCard(group.wo, false);
    if (group.children.length > 0) {
      const childrenDiv = document.createElement("div");
      childrenDiv.className = "tl-children";
      group.children.forEach((po) => {
        const el = document.createElement("div");
        el.innerHTML = renderPOCard(po);
        childrenDiv.appendChild(el.firstElementChild);
      });
      wrapper.appendChild(childrenDiv);
    }
  }

  return wrapper;
}

// ─── Page Renderer ────────────────────────────────────────────────────────────

function renderizarPagina(pagina) {
  paginaAtual = pagina;
  listaHistorico.innerHTML = "";

  if (!groupsFiltered.length) {
    listaHistorico.innerHTML = `<li class="tl-empty">Nenhum registro com os filtros aplicados.</li>`;
    renderizarPaginacao();
    return;
  }

  const inicio      = (pagina - 1) * GROUPS_POR_PAGINA;
  const itensPagina = groupsFiltered.slice(inicio, inicio + GROUPS_POR_PAGINA);

  itensPagina.forEach((group) => {
    listaHistorico.appendChild(renderGrupo(group));
  });

  renderizarPaginacao();
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function renderizarPaginacao() {
  const totalPaginas = Math.ceil(groupsFiltered.length / GROUPS_POR_PAGINA);
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

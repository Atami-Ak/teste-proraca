/**
 * app-painel-frota.js — Fleet Dashboard (Full Rebuild)
 *
 * Architecture: Single Source of Truth
 *  - vehicle_state/{vehicleId} → current status + pre-computed KPIs
 *  - frotaDB (static)          → vehicle metadata (plate, model, icon)
 *
 * Features:
 *  - Fleet summary header (Total / Operational / Maintenance / Critical)
 *  - Search + filter (by status, by category)
 *  - Grid / List view toggle
 *  - Vehicle cards with MTBF, MTTR, recent failures, last event
 *  - Quick actions: New Inspection / New WO / View History
 *  - Real-time: listens to "fleetUpdated" custom event
 *  - Critical vehicles sorted to top
 */

import { checkAuth } from "../core/db-auth.js";
import { frotaDB } from "../data/dados-frota.js";
import { getAllVehicleStates, getEffectiveVehicleStatus, STATUS_META } from "../core/vehicle-state-engine.js";
import { obterInspecoesRecentes, obterPendingPurchaseWOs } from "../core/db-frota.js";

const perfil = await checkAuth("painel-frota");

// ─── DOM refs ──────────────────────────────────────────────────────────────────
const container     = document.getElementById("frota-container");
const skeleton      = document.getElementById("skeleton-loader");
const searchInput   = document.getElementById("fleet-search");
const filterStatus  = document.getElementById("fleet-filter-status");
const filterCat     = document.getElementById("fleet-filter-cat");
const btnGrid       = document.getElementById("btn-grid");
const btnList       = document.getElementById("btn-list");

const sumTotal    = document.getElementById("sum-total");
const sumOk       = document.getElementById("sum-ok");
const sumMaint    = document.getElementById("sum-maint");
const sumCritical = document.getElementById("sum-critical");

// ─── User info in header ───────────────────────────────────────────────────────
const headerUser   = document.getElementById("header-user");
const headerAvatar = document.getElementById("header-avatar");
if (perfil?.nome) {
  if (headerUser)   headerUser.textContent   = perfil.nome;
  if (headerAvatar) headerAvatar.textContent = perfil.nome[0].toUpperCase();
}

// ─── Populate category filter ──────────────────────────────────────────────────
const categorias = [...new Set(frotaDB.map((v) => v.categoria))].sort();
categorias.forEach((cat) => {
  const opt = document.createElement("option");
  opt.value = cat;
  opt.textContent = cat;
  filterCat.appendChild(opt);
});

// ─── State ─────────────────────────────────────────────────────────────────────
let statesMap           = {};   // Map<vehicleId, vehicleStateDoc|null>
let lastInspByVehicle   = {};   // Map<vehicleId, most recent inspection> — fallback for empty vehicle_state
let pendingPOsByVehicle = {};   // Map<vehicleId, count of open purchase WOs>
let viewMode            = "grid";
let enrichedDB          = [];   // frotaDB + state data merged

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return null;
  return new Date(ts.seconds ? ts.seconds * 1000 : ts)
    .toLocaleDateString("pt-BR");
}

function criticityScore(status) {
  return { critical: 5, stopped: 4, in_maintenance: 3, attention: 2, preventive_due: 1, operational: 0 }[status] ?? 0;
}

// ─── Main load ─────────────────────────────────────────────────────────────────
async function carregarDashboard() {
  // Load vehicle_state + recent inspections + pending purchase WOs in parallel
  const [statesResult, inspectionsResult, purchaseResult] = await Promise.allSettled([
    getAllVehicleStates(),
    obterInspecoesRecentes(null, 200),
    obterPendingPurchaseWOs(),
  ]);

  statesMap = statesResult.status === "fulfilled" ? statesResult.value : {};
  if (statesResult.status === "rejected") {
    console.warn("[painel-frota] getAllVehicleStates falhou:", statesResult.reason);
  }

  // Build fallback map: most recent inspection per vehicle (already sorted desc)
  const allInspections = inspectionsResult.status === "fulfilled" ? inspectionsResult.value : [];
  if (inspectionsResult.status === "rejected") {
    console.warn("[painel-frota] obterInspecoesRecentes falhou:", inspectionsResult.reason);
  }
  lastInspByVehicle = {};
  allInspections.forEach((insp) => {
    const vid = insp.vehicleId;
    if (vid && !lastInspByVehicle[vid]) {
      lastInspByVehicle[vid] = insp; // first hit per vehicle = most recent
    }
  });

  // Build pending purchase orders count per vehicle (from purchase_orders collection)
  const allPurchaseOrders = purchaseResult.status === "fulfilled" ? purchaseResult.value : [];
  if (purchaseResult.status === "rejected") {
    console.warn("[painel-frota] obterPendingPurchaseWOs falhou:", purchaseResult.reason);
  }
  pendingPOsByVehicle = {};
  allPurchaseOrders.forEach((po) => {
    const vid = po.vehicleId;
    if (vid) pendingPOsByVehicle[vid] = (pendingPOsByVehicle[vid] || 0) + 1;
  });
  // Track vehicles with critical-urgency purchase orders for alert escalation
  const criticalPOVehicles = new Set();
  allPurchaseOrders.forEach((po) => {
    if (po.urgencia === "critico") {
      const vid = po.vehicleId;
      if (vid) criticalPOVehicles.add(vid);
    }
  });

  // Merge static DB with live state + inspection fallback + purchase counts
  enrichedDB = frotaDB.map((v) => {
    const state    = statesMap[v.id] || null;
    let   status   = getEffectiveVehicleStatus(state);
    const lastInsp = lastInspByVehicle[v.id] || null;
    const pendingPOs        = pendingPOsByVehicle[v.id] || 0;
    const hasCriticalParts  = criticalPOVehicles.has(v.id);

    // Escalate to critical if vehicle has high-priority parts awaiting purchase
    // and current status is not already worse
    if (hasCriticalParts && status === "operational") {
      status = "attention";
    }

    return { ...v, state, status, lastInsp, pendingPOs, hasCriticalParts };
  });

  // Sort: critical/stopped first, then by plate alpha
  enrichedDB.sort((a, b) => {
    const diff = criticityScore(b.status) - criticityScore(a.status);
    return diff !== 0 ? diff : a.placa.localeCompare(b.placa);
  });

  // Remove skeleton and render
  if (skeleton) skeleton.remove();
  renderSummary();
  renderCards();
}

// ─── Summary counters ──────────────────────────────────────────────────────────
function renderSummary() {
  const total    = enrichedDB.length;
  const ok       = enrichedDB.filter((v) => v.status === "operational" || v.status === "preventive_due").length;
  const maint    = enrichedDB.filter((v) => v.status === "in_maintenance" || v.status === "attention").length;
  const critical = enrichedDB.filter((v) => v.status === "stopped" || v.status === "critical").length;

  if (sumTotal)    sumTotal.textContent    = total;
  if (sumOk)       sumOk.textContent       = ok;
  if (sumMaint)    sumMaint.textContent    = maint;
  if (sumCritical) sumCritical.textContent = critical;
}

// ─── Filter logic ──────────────────────────────────────────────────────────────
function getFiltered() {
  const search = searchInput?.value.trim().toLowerCase() || "";
  const fStatus = filterStatus?.value || "";
  const fCat    = filterCat?.value    || "";

  return enrichedDB.filter((v) => {
    if (fStatus && v.status !== fStatus) return false;
    if (fCat    && v.categoria !== fCat) return false;
    if (search) {
      const haystack = `${v.placa} ${v.modelo} ${v.id} ${v.motoristaPadrao || ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

// ─── Card renderer ─────────────────────────────────────────────────────────────
function renderCards() {
  const filtered = getFiltered();
  container.innerHTML = "";
  container.className = viewMode === "list" ? "list-view" : "grid-view";

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        Nenhum veículo encontrado com os filtros aplicados.
      </div>`;
    return;
  }

  filtered.forEach((v) => {
    const meta   = STATUS_META[v.status] || STATUS_META.operational;
    const state  = v.state;

    // KPIs from pre-computed vehicle_state
    const mtbf   = state?.mtbfHours   != null ? `${state.mtbfHours}h`   : "—";
    const mttr   = state?.mttrHours   != null ? `${state.mttrHours}h`   : "—";
    const recent = state?.recentFailures != null ? state.recentFailures  : "—";

    // Last event — prefer vehicle_state, fallback to most recent inspection
    let lastDesc = state?.lastEventDesc || null;
    let lastDate = state?.lastEventDate ? fmtDate(state.lastEventDate) : null;

    if (!lastDesc && v.lastInsp) {
      const nc   = v.lastInsp.nonConformities || 0;
      const tipo = v.lastInsp.inspectionType === "departure" ? "Saída" : "Retorno";
      lastDesc = `Inspeção de ${tipo} — ${nc > 0 ? `${nc} NC` : "Conforme"}`;
      lastDate = v.lastInsp.timestampEnvio ? fmtDate(v.lastInsp.timestampEnvio) : null;
    }

    if (!lastDesc) lastDesc = "Sem eventos registados";

    const pendingPOs       = v.pendingPOs       || 0;
    const hasCriticalParts = v.hasCriticalParts || false;

    const mtbfColor  = state?.mtbfHours != null && state.mtbfHours < 200 ? "#dc2626" : "#0f4c75";
    const mttrColor  = state?.mttrHours != null && state.mttrHours > 8   ? "#dc2626" : "#7c3aed";
    const recentColor = (typeof recent === "number" && recent >= 2)       ? "#dc2626" : "#1e293b";

    const card = document.createElement("div");
    card.className = `vcard status-${v.status}`;
    card.dataset.vehicleId = v.id;

    card.innerHTML = `
      <div class="vcard-header">
        <div>
          <div class="vcard-id">${v.id} · ${v.categoria}</div>
          <h4 class="vcard-name">${v.icone} ${v.placa}</h4>
          <p class="vcard-model">${v.modelo}</p>
          ${v.motoristaPadrao ? `<p class="vcard-model" style="margin-top:2px;">👷 ${v.motoristaPadrao}</p>` : ""}
        </div>
        <span class="vcard-status-badge"
              style="background:${meta.bg};color:${meta.color};border:1px solid ${meta.border};">
          ${meta.icon} ${meta.label}
        </span>
      </div>

      <hr class="vcard-divider" />

      <div class="vcard-kpi-row">
        <div class="vcard-kpi">
          <span class="vcard-kpi-val" style="color:${mtbfColor};">${mtbf}</span>
          <span class="vcard-kpi-lbl">MTBF</span>
        </div>
        <div class="vcard-kpi">
          <span class="vcard-kpi-val" style="color:${mttrColor};">${mttr}</span>
          <span class="vcard-kpi-lbl">MTTR</span>
        </div>
        <div class="vcard-kpi">
          <span class="vcard-kpi-val" style="color:${recentColor};">${recent}</span>
          <span class="vcard-kpi-lbl">Falhas 7d</span>
        </div>
      </div>

      ${pendingPOs > 0 ? `
      <div style="margin:8px 0;padding:8px 12px;border-radius:8px;
                  background:${hasCriticalParts ? "#fef2f2" : "#fefce8"};
                  border:1.5px solid ${hasCriticalParts ? "#fecaca" : "#fde68a"};
                  display:flex;align-items:center;gap:8px;">
        <span style="font-size:1rem;">${hasCriticalParts ? "🚨" : "🛒"}</span>
        <div>
          <div style="font-size:.75rem;font-weight:700;color:${hasCriticalParts ? "#dc2626" : "#92400e"};">
            ${hasCriticalParts ? "Peça Crítica Pendente" : "Compras Pendentes"}
          </div>
          <div style="font-size:.7rem;color:${hasCriticalParts ? "#7f1d1d" : "#78350f"};">
            ${pendingPOs} pedido(s) de compra em aberto
          </div>
        </div>
        <a href="historico-frota.html?id=${v.id}"
           style="margin-left:auto;font-size:.7rem;font-weight:700;
                  color:${hasCriticalParts ? "#dc2626" : "#92400e"};text-decoration:none;">
          Ver →
        </a>
      </div>` : ""}

      <div class="vcard-last-event">
        <div class="vcard-last-event-lbl">Último Evento</div>
        <div class="vcard-last-event-desc" title="${lastDesc}">${lastDesc}</div>
        ${lastDate ? `<div class="vcard-last-event-date">📅 ${lastDate}</div>` : ""}
      </div>

      <div class="vcard-actions">
        <div class="vcard-actions-row">
          <a href="inspecao-frota.html?vehicleId=${v.id}"
             class="btn-vcard btn-insp"
             title="Nova Inspeção">
            👁 Inspeção
          </a>
          <a href="../os/os-detalhe.html?modo=criar&origin=fleet&originId=${encodeURIComponent(v.id)}&originNome=${encodeURIComponent(v.placa)}&tipo=maintenance"
             class="btn-vcard btn-wo"
             title="Nova O.S">
            🔧 Nova O.S
          </a>
        </div>
        <a href="historico-frota.html?id=${v.id}"
           class="btn-vcard btn-history"
           title="Ver Histórico Completo">
          📋 Ver Histórico
        </a>
      </div>
    `;

    // Card click → history (not on button clicks)
    card.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      window.location.href = `historico-frota.html?id=${v.id}`;
    });

    container.appendChild(card);
  });
}

// ─── View toggle ───────────────────────────────────────────────────────────────
btnGrid?.addEventListener("click", () => {
  viewMode = "grid";
  btnGrid.classList.add("active");
  btnList.classList.remove("active");
  renderCards();
});

btnList?.addEventListener("click", () => {
  viewMode = "list";
  btnList.classList.add("active");
  btnGrid.classList.remove("active");
  renderCards();
});

// ─── Filters ───────────────────────────────────────────────────────────────────
let debounceTimer;
searchInput?.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(renderCards, 250);
});
filterStatus?.addEventListener("change", renderCards);
filterCat?.addEventListener("change", renderCards);

// ─── Real-time: fleetUpdated event ─────────────────────────────────────────────
// Dispatched by db-frota.js / db-os.js after any fleet action
window.addEventListener("fleetUpdated", () => {
  carregarDashboard().catch(console.error);
});

// ─── Boot ──────────────────────────────────────────────────────────────────────
carregarDashboard().catch((e) => {
  console.error("[painel-frota]", e);
  if (skeleton) skeleton.remove();
  container.innerHTML = `
    <div class="empty-state" style="border-color:#fecaca;background:#fef2f2;color:#dc2626;">
      ⚠️ Falha ao carregar o painel.
      <br><a href="" style="color:var(--primary);">Tentar novamente</a>
    </div>`;
});

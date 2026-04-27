/**
 * app-inventario.js — Asset Inventory (Audit) Controller
 *
 * Flow:
 *  1. Sessions list view — shows all past inventory sessions
 *  2. Create new session — define scope (all / by category / by location)
 *  3. Active session view — list assets for verification
 *     - Each asset: Found ✅ / Not Found ❌ / Issue ⚠️
 *     - Real-time counter + progress bar
 *     - Filter: pending / found / missing / issue
 *  4. Close session — saves summary to Firestore
 */

import { checkAuth, getCurrentUser } from "../core/db-auth.js";
import {
  getInventorySessions,
  getInventorySession,
  createInventorySession,
  markInventoryItem,
  closeInventorySession,
  getAssets,
  getCategories,
  fmtDate,
  fmtDateTime,
} from "../core/db-ativos.js";
import { LOCATIONS } from "../data/ativos-categorias.js";

await checkAuth("ativos");
const perfil = await getCurrentUser();

// ─── Header ──────────────────────────────────────────
const $name   = document.getElementById("header-user-name");
const $avatar = document.getElementById("header-avatar");
if (perfil?.nome) {
  if ($name)   $name.textContent   = perfil.nome;
  if ($avatar) $avatar.textContent = perfil.nome.charAt(0).toUpperCase();
}

// ─── State ───────────────────────────────────────────
let allSessions   = [];
let allAssets     = [];
let allCategories = [];
let activeSession = null;
let activeAssets  = [];   // assets scoped to this session
let pendingIssueAssetId = null;

// ─── Views ───────────────────────────────────────────
const $viewSessions = document.getElementById("view-sessions");
const $viewActive   = document.getElementById("view-active");

// ─── Bootstrap ───────────────────────────────────────
[allSessions, allAssets, allCategories] = await Promise.all([
  getInventorySessions(),
  getAssets(),
  getCategories(),
]);

populateNewSessionSelects();
renderSessionsList();

// ─── Sessions list ────────────────────────────────────
function renderSessionsList() {
  const $list  = document.getElementById("sessions-list");
  const $empty = document.getElementById("sessions-empty");

  if (allSessions.length === 0) {
    $list.innerHTML = "";
    $empty.classList.remove("hidden");
    return;
  }

  $empty.classList.add("hidden");
  $list.innerHTML = allSessions.map(s => {
    const total   = Object.keys(s.results || {}).length;
    const found   = Object.values(s.results || {}).filter(r => r.status === "found").length;
    const missing = Object.values(s.results || {}).filter(r => r.status === "missing").length;
    const issue   = Object.values(s.results || {}).filter(r => r.status === "issue").length;
    const isActive = s.status === "em_andamento";

    return `
      <div class="session-card" onclick="openSession('${s.id}')">
        <div class="session-icon">${isActive ? "🔄" : "📋"}</div>
        <div class="session-info">
          <div class="session-name">${escHtml(s.name || "Inventário")}</div>
          <div class="session-meta">
            ${fmtDate(s.createdAt)}
            ${s.responsible ? ` · 👤 ${escHtml(s.responsible)}` : ""}
            ${total > 0 ? ` · ${total} registros` : ""}
          </div>
          ${total > 0 ? `
          <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">
            <span class="inv-counter found" style="font-size:.7rem;padding:2px 8px;">✅ ${found}</span>
            <span class="inv-counter missing" style="font-size:.7rem;padding:2px 8px;">❌ ${missing}</span>
            <span class="inv-counter issue" style="font-size:.7rem;padding:2px 8px;">⚠️ ${issue}</span>
          </div>` : ""}
        </div>
        <div class="session-right">
          <span class="badge ${isActive ? "badge-andamento" : "badge-concluida"}">
            ${isActive ? "🔄 Em Andamento" : "✅ Concluída"}
          </span>
        </div>
      </div>`;
  }).join("");
}

// ─── Open existing session ────────────────────────────
window.openSession = async function(id) {
  activeSession = await getInventorySession(id);
  if (!activeSession) return;

  loadActiveView();
};

// ─── Load active session view ─────────────────────────
async function loadActiveView() {
  if (!activeSession) return;

  $viewSessions.classList.add("hidden");
  $viewActive.classList.remove("hidden");

  document.getElementById("inv-title").textContent = activeSession.name || "Inventário";

  const scopeText =
    activeSession.scopeType === "category"
      ? `Categoria: ${allCategories.find(c => c.id === activeSession.scopeValue)?.name || "—"}`
      : activeSession.scopeType === "location"
      ? `Local: ${activeSession.scopeValue}`
      : "Todos os ativos";

  document.getElementById("inv-meta").textContent =
    `${fmtDate(activeSession.createdAt)} · ${scopeText}` +
    (activeSession.responsible ? ` · 👤 ${activeSession.responsible}` : "");

  // Scope assets
  if (activeSession.scopeType === "category" && activeSession.scopeValue) {
    activeAssets = allAssets.filter(a => a.categoryId === activeSession.scopeValue);
  } else if (activeSession.scopeType === "location" && activeSession.scopeValue) {
    activeAssets = allAssets.filter(a => a.location === activeSession.scopeValue);
  } else {
    activeAssets = [...allAssets];
  }

  // If session is closed, disable buttons
  const isClosed = activeSession.status === "concluida";
  const $closeBtn = document.getElementById("btn-close-session");
  if ($closeBtn) $closeBtn.style.display = isClosed ? "none" : "";

  renderInventoryItems("all", "");
  updateCounters();

  // Bind filters
  document.getElementById("inv-search").addEventListener("input", refreshInvList);
  document.getElementById("inv-filter").addEventListener("change", refreshInvList);
}

function refreshInvList() {
  const filterVal = document.getElementById("inv-filter").value;
  const search    = document.getElementById("inv-search").value.toLowerCase().trim();
  renderInventoryItems(filterVal, search);
}

function renderInventoryItems(filterVal, search) {
  const $list  = document.getElementById("inv-item-list");
  const $empty = document.getElementById("inv-empty");
  const results = activeSession.results || {};
  const isClosed = activeSession.status === "concluida";

  let assets = activeAssets.filter(a => {
    const r = results[a.id];
    const st = r?.status || "pending";

    if (filterVal === "found"   && st !== "found")   return false;
    if (filterVal === "missing" && st !== "missing")  return false;
    if (filterVal === "issue"   && st !== "issue")    return false;
    if (filterVal === "pending" && st !== "pending")  return false;

    if (search) {
      const hay = `${a.code || ""} ${a.name}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }

    return true;
  });

  if (assets.length === 0) {
    $list.innerHTML = "";
    $empty.classList.remove("hidden");
    return;
  }

  $empty.classList.add("hidden");

  $list.innerHTML = assets.map(a => {
    const r  = results[a.id];
    const st = r?.status || "pending";

    return `
      <div class="inv-item st-${st}" id="inv-row-${a.id}">
        <div class="inv-item-info">
          ${a.code ? `<div class="inv-item-code">${a.code}</div>` : ""}
          <div class="inv-item-name">${escHtml(a.name)}</div>
          <div class="inv-item-loc">📍 ${escHtml(a.location || "—")}</div>
          ${r?.note ? `<div style="font-size:.72rem;color:#854d0e;margin-top:2px;">⚠️ ${escHtml(r.note)}</div>` : ""}
        </div>
        ${!isClosed ? `
        <div class="inv-btn-group">
          <button class="btn-inv v-found   ${st === "found"   ? "active" : ""}"
                  onclick="markItem('${a.id}','found')">
            ✅
          </button>
          <button class="btn-inv v-missing ${st === "missing" ? "active" : ""}"
                  onclick="markItem('${a.id}','missing')">
            ❌
          </button>
          <button class="btn-inv v-issue   ${st === "issue"   ? "active" : ""}"
                  onclick="markItemIssue('${a.id}')">
            ⚠️
          </button>
        </div>` : `
        <div>
          ${st === "found"   ? '<span class="badge badge-concluida">✅ Encontrado</span>' : ""}
          ${st === "missing" ? '<span class="badge badge-avariado">❌ Não encontrado</span>' : ""}
          ${st === "issue"   ? '<span class="badge badge-pendente">⚠️ Problema</span>' : ""}
        </div>`}
      </div>`;
  }).join("");
}

function updateCounters() {
  const results = activeSession.results || {};
  let found = 0, missing = 0, issue = 0, pending = 0;

  activeAssets.forEach(a => {
    const st = results[a.id]?.status;
    if (st === "found")   found++;
    else if (st === "missing") missing++;
    else if (st === "issue")   issue++;
    else pending++;
  });

  document.getElementById("c-found").textContent   = found;
  document.getElementById("c-missing").textContent = missing;
  document.getElementById("c-issue").textContent   = issue;
  document.getElementById("c-pending").textContent = pending;

  const done = found + missing + issue;
  const pct  = activeAssets.length > 0 ? Math.round((done / activeAssets.length) * 100) : 0;
  document.getElementById("inv-pbar").style.width = pct + "%";
}

// ─── Mark item ────────────────────────────────────────
window.markItem = async function(assetId, status, note = "") {
  if (!activeSession || activeSession.status === "concluida") return;

  await markInventoryItem(activeSession.id, assetId, status, note);

  // Update local state
  if (!activeSession.results) activeSession.results = {};
  activeSession.results[assetId] = { status, note, markedAt: new Date().toISOString() };

  // Update just that row's buttons (fast UI)
  const $row = document.getElementById(`inv-row-${assetId}`);
  if ($row) {
    $row.className = `inv-item st-${status}`;
    $row.querySelectorAll(".btn-inv").forEach(b => b.classList.remove("active"));
    const $activeBtn = $row.querySelector(`.v-${status}`);
    if ($activeBtn) $activeBtn.classList.add("active");
    // Update note display
    const $note = $row.querySelector("[data-note]");
    if ($note) $note.remove();
  }

  updateCounters();
};

window.markItemIssue = function(assetId) {
  pendingIssueAssetId = assetId;
  document.getElementById("issue-note").value = "";
  document.getElementById("issue-modal").classList.remove("hidden");
};

window.confirmIssue = function() {
  const note = document.getElementById("issue-note").value.trim();
  document.getElementById("issue-modal").classList.add("hidden");
  if (pendingIssueAssetId) {
    markItem(pendingIssueAssetId, "issue", note);
    pendingIssueAssetId = null;
  }
};

// ─── Close session ────────────────────────────────────
window.confirmCloseSession = function() {
  const results = activeSession.results || {};
  const total   = activeAssets.length;
  const done    = Object.keys(results).length;
  const pending = total - done;

  const msg = pending > 0
    ? `Ainda há ${pending} ativo(s) sem verificação.\nDeseja encerrar mesmo assim?`
    : `Todos os ${total} ativos foram verificados.\nEncerrar inventário?`;

  if (!confirm(msg)) return;
  doCloseSession();
};

async function doCloseSession() {
  const results = activeSession.results || {};
  const summary = {
    total:   activeAssets.length,
    found:   Object.values(results).filter(r => r.status === "found").length,
    missing: Object.values(results).filter(r => r.status === "missing").length,
    issue:   Object.values(results).filter(r => r.status === "issue").length,
    closedBy: perfil?.nome || "—",
  };

  await closeInventorySession(activeSession.id, summary);
  activeSession.status = "concluida";

  allSessions = await getInventorySessions();
  renderInventoryItems(
    document.getElementById("inv-filter").value,
    document.getElementById("inv-search").value.toLowerCase().trim()
  );
  updateCounters();

  const $closeBtn = document.getElementById("btn-close-session");
  if ($closeBtn) $closeBtn.style.display = "none";
  alert("Inventário encerrado com sucesso!");
}

// ─── Back to sessions ─────────────────────────────────
window.backToSessions = function() {
  activeSession = null;
  activeAssets  = [];
  $viewActive.classList.add("hidden");
  $viewSessions.classList.remove("hidden");
  // Remove filter event listeners (they'll be re-bound on next open)
};

// ─── New session modal ────────────────────────────────
function populateNewSessionSelects() {
  // Pre-fill category options
  const $sel = document.getElementById("ns-scope-value");
  // populated dynamically when scope changes
}

window.openNewSessionModal = function() {
  document.getElementById("ns-name").value     = `Inventário ${new Date().toLocaleDateString("pt-BR")}`;
  document.getElementById("ns-scope-type").value = "all";
  document.getElementById("ns-responsible").value = perfil?.nome || "";
  document.getElementById("ns-scope-value-group").style.display = "none";
  document.getElementById("new-session-modal").classList.remove("hidden");
};

window.updateScopeOptions = function() {
  const type  = document.getElementById("ns-scope-type").value;
  const $grp  = document.getElementById("ns-scope-value-group");
  const $lbl  = document.getElementById("ns-scope-label");
  const $sel  = document.getElementById("ns-scope-value");

  if (type === "all") {
    $grp.style.display = "none";
    return;
  }

  $grp.style.display = "block";
  $sel.innerHTML = '<option value="">Selecione...</option>';

  if (type === "category") {
    $lbl.textContent = "Categoria";
    allCategories.forEach(c => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = `${c.icon || ""} ${c.name}`;
      $sel.appendChild(o);
    });
  } else {
    $lbl.textContent = "Localização";
    const locs = [...new Set(allAssets.map(a => a.location).filter(Boolean))].sort();
    locs.forEach(loc => {
      const o = document.createElement("option");
      o.value = o.textContent = loc;
      $sel.appendChild(o);
    });
  }
};

window.createSession = async function() {
  const name      = document.getElementById("ns-name").value.trim();
  const scopeType = document.getElementById("ns-scope-type").value;
  const scopeVal  = document.getElementById("ns-scope-value").value;
  const resp      = document.getElementById("ns-responsible").value.trim();

  if (!name) { alert("Informe o nome da sessão."); return; }
  if (scopeType !== "all" && !scopeVal) { alert("Selecione o escopo."); return; }

  const sessionId = await createInventorySession({
    name,
    scopeType,
    scopeValue:  scopeVal || null,
    responsible: resp     || null,
    createdBy:   perfil?.nome || "—",
  });

  document.getElementById("new-session-modal").classList.add("hidden");

  activeSession = await getInventorySession(sessionId);
  allSessions   = await getInventorySessions();
  await loadActiveView();
};

// ─── Utility ──────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

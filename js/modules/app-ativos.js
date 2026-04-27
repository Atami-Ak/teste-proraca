/**
 * app-ativos.js — Assets List Page Controller
 *
 * Responsibilities:
 *  - Load and display all assets in a filterable table
 *  - Render stats bar (total, by status)
 *  - Asset detail modal (read + quick maintenance creation)
 *  - CSV export
 *  - Seed default categories on first load
 */

import { checkAuth, getCurrentUser } from "../core/db-auth.js";
import {
  getAssets,
  getCategories,
  seedDefaultCategories,
  createMaintenance,
  ASSET_STATUS,
  fmtDate,
  fmtDateTime,
} from "../core/db-ativos.js";
import { DEFAULT_CATEGORIES, LOCATIONS } from "../data/ativos-categorias.js";

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
let allAssets = [];
let allCategories = [];
let categoryMap = {};     // id → category object
let currentAssetId = null;

// ─── DOM refs ─────────────────────────────────────────
const $tbody       = document.getElementById("assets-tbody");
const $resultCount = document.getElementById("result-count");
const $fSearch     = document.getElementById("f-search");
const $fCat        = document.getElementById("f-cat");
const $fLoc        = document.getElementById("f-loc");
const $fStatus     = document.getElementById("f-status");
const $btnExport   = document.getElementById("btn-export");

// Stats
const $sTotal  = document.getElementById("s-total");
const $sAtivo  = document.getElementById("s-ativo");
const $sMant   = document.getElementById("s-mant");
const $sAvaria = document.getElementById("s-avaria");
const $sInativo= document.getElementById("s-inativo");

// ─── Bootstrap ───────────────────────────────────────
await seedDefaultCategories(DEFAULT_CATEGORIES);
await loadData();

// Apply ?cat= URL param after data loads (e.g. redirect from maquinario.html)
const _urlParams = new URLSearchParams(window.location.search);
const _catParam  = _urlParams.get("cat");
if (_catParam && $fCat) {
  // Match by prefix (e.g. "MAQ") or by Firestore doc id
  const matched = allCategories.find(
    c => c.prefix === _catParam.toUpperCase() || c.id === _catParam
  );
  if (matched) {
    $fCat.value = matched.id;
    applyFilters();
  }
}

// ─── Load data ────────────────────────────────────────
async function loadData() {
  [allAssets, allCategories] = await Promise.all([
    getAssets(),
    getCategories(),
  ]);

  categoryMap = Object.fromEntries(allCategories.map(c => [c.id, c]));

  populateCategoryFilter();
  populateLocationFilter();
  renderStats();
  renderTable(allAssets);
}

function populateCategoryFilter() {
  const existing = $fCat.querySelectorAll("option:not([value=''])");
  existing.forEach(o => o.remove());
  allCategories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = `${cat.icon || ""} ${cat.name}`;
    $fCat.appendChild(opt);
  });
}

function populateLocationFilter() {
  const locs = [...new Set(allAssets.map(a => a.location).filter(Boolean))].sort();
  const existing = $fLoc.querySelectorAll("option:not([value=''])");
  existing.forEach(o => o.remove());
  locs.forEach(loc => {
    const opt = document.createElement("option");
    opt.value = loc;
    opt.textContent = loc;
    $fLoc.appendChild(opt);
  });
}

function renderStats() {
  const counts = { ativo: 0, manutencao: 0, avariado: 0, inativo: 0 };
  allAssets.forEach(a => {
    if (counts[a.status] !== undefined) counts[a.status]++;
  });
  $sTotal.textContent  = allAssets.length;
  $sAtivo.textContent  = counts.ativo;
  $sMant.textContent   = counts.manutencao;
  $sAvaria.textContent = counts.avariado;
  $sInativo.textContent= counts.inativo;
}

// ─── Table rendering ──────────────────────────────────
function renderTable(assets) {
  $resultCount.textContent = `${assets.length} ativo${assets.length !== 1 ? "s" : ""} encontrado${assets.length !== 1 ? "s" : ""}`;

  if (assets.length === 0) {
    $tbody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <div class="empty-icon">🏷️</div>
          <p class="empty-title">Nenhum ativo encontrado</p>
          <p class="empty-sub">Ajuste os filtros ou cadastre um novo ativo.</p>
        </div>
      </td></tr>`;
    return;
  }

  $tbody.innerHTML = assets.map(asset => {
    const cat      = categoryMap[asset.categoryId];
    const statusMeta = ASSET_STATUS[asset.status] || ASSET_STATUS.ativo;
    const catLabel = cat ? `${cat.icon || ""} ${cat.name}` : "—";

    return `
      <tr onclick="openDetail('${asset.id}')">
        <td><span class="asset-code">${asset.code || "—"}</span></td>
        <td><strong>${escHtml(asset.name)}</strong></td>
        <td><span class="cat-badge">${escHtml(catLabel)}</span></td>
        <td>${escHtml(asset.location || "—")}</td>
        <td><span class="badge ${statusMeta.css}">${statusMeta.icon} ${statusMeta.label}</span></td>
        <td class="col-actions">
          <a href="ativo-form.html?id=${asset.id}"
             class="btn btn-secondary btn-xs"
             onclick="event.stopPropagation()">✏️</a>
        </td>
      </tr>`;
  }).join("");
}

// ─── Filtering ────────────────────────────────────────
function applyFilters() {
  const search = $fSearch.value.toLowerCase().trim();
  const catId  = $fCat.value;
  const loc    = $fLoc.value;
  const status = $fStatus.value;

  const filtered = allAssets.filter(a => {
    if (catId  && a.categoryId !== catId)    return false;
    if (loc    && a.location   !== loc)      return false;
    if (status && a.status     !== status)   return false;
    if (search) {
      const hay = `${a.code} ${a.name} ${a.responsible || ""}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  renderTable(filtered);
}

[$fSearch, $fCat, $fLoc, $fStatus].forEach(el => {
  el.addEventListener("input",  applyFilters);
  el.addEventListener("change", applyFilters);
});

// ─── Detail modal ─────────────────────────────────────
window.openDetail = function(id) {
  const asset = allAssets.find(a => a.id === id);
  if (!asset) return;
  currentAssetId = id;

  const cat = categoryMap[asset.categoryId];
  const statusMeta = ASSET_STATUS[asset.status] || ASSET_STATUS.ativo;

  document.getElementById("m-code-cat").textContent =
    `${asset.code || "—"} · ${cat?.name || "Sem categoria"}`;
  document.getElementById("m-name").textContent = asset.name;

  const badge = document.getElementById("m-status-badge");
  badge.textContent = `${statusMeta.icon} ${statusMeta.label}`;
  badge.className   = `badge ${statusMeta.css}`;

  // Edit link
  document.getElementById("m-edit-link").href = `ativo-form.html?id=${id}`;

  // Build detail grid
  const fields = [
    ["Localização",    asset.location || "—"],
    ["Detalhe Local",  asset.locationDetail || "—"],
    ["Responsável",    asset.responsible || "—"],
    ["Data Aquisição", asset.acquisition ? fmtDate(asset.acquisition) : "—"],
    ["Valor",          asset.value ? `R$ ${Number(asset.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"],
    ["Cadastrado em",  fmtDate(asset.createdAt)],
  ];

  // Add dynamic fields
  if (cat?.fields?.length && asset.dynamicData) {
    cat.fields.forEach(f => {
      const val = asset.dynamicData[f.key];
      if (val !== undefined && val !== "") {
        fields.push([f.label, String(val)]);
      }
    });
  }

  if (asset.notes) fields.push(["Observações", asset.notes]);

  const grid = document.getElementById("m-fields-grid");
  grid.innerHTML = fields.map(([lbl, val]) => `
    <div>
      <div class="detail-field-label">${escHtml(lbl)}</div>
      <div class="detail-field-value">${escHtml(String(val))}</div>
    </div>`).join("");

  document.getElementById("detail-modal").classList.remove("hidden");
};

window.gotoMaint = function() {
  if (!currentAssetId) return;
  const asset = allAssets.find(a => a.id === currentAssetId);
  document.getElementById("maint-modal").classList.remove("hidden");
  document.getElementById("mm-asset-name").textContent = asset?.name || "—";
  // Set today as default date
  document.getElementById("mm-date").value = new Date().toISOString().split("T")[0];
};

window.confirmDelete = async function() {
  if (!currentAssetId) return;
  const asset = allAssets.find(a => a.id === currentAssetId);
  if (!asset) return;
  if (!confirm(`Excluir ativo "${asset.name}"?\nEsta ação não pode ser desfeita.`)) return;

  const { deleteAsset } = await import("../core/db-ativos.js");
  await deleteAsset(currentAssetId, asset.categoryId);
  document.getElementById("detail-modal").classList.add("hidden");
  await loadData();
};

// ─── Quick maintenance save (from list page) ──────────
window.saveMaint = async function() {
  if (!currentAssetId) return;
  const type   = document.getElementById("mm-type").value;
  const desc   = document.getElementById("mm-desc").value.trim();
  const date   = document.getElementById("mm-date").value;
  const status = document.getElementById("mm-status").value;
  const tech   = document.getElementById("mm-tech").value.trim();

  if (!desc) { alert("Informe a descrição da manutenção."); return; }

  const btn = document.getElementById("mm-save-btn");
  btn.disabled = true;
  btn.textContent = "Salvando...";

  try {
    await createMaintenance({
      assetId:       currentAssetId,
      assetName:     allAssets.find(a => a.id === currentAssetId)?.name || "—",
      type,
      description:   desc,
      scheduledDate: date || null,
      status,
      technician:    tech || null,
      createdBy:     perfil?.nome || "—",
    });
    document.getElementById("maint-modal").classList.add("hidden");
    document.getElementById("detail-modal").classList.add("hidden");
    // Reset form
    document.getElementById("mm-desc").value = "";
    document.getElementById("mm-tech").value = "";
    await loadData();
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar manutenção.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Salvar Manutenção";
  }
};

// ─── CSV Export ────────────────────────────────────────
$btnExport?.addEventListener("click", () => {
  const rows = [["Código", "Nome", "Categoria", "Localização", "Responsável", "Status", "Aquisição", "Valor"]];
  allAssets.forEach(a => {
    const cat = categoryMap[a.categoryId];
    rows.push([
      a.code || "",
      a.name,
      cat?.name || "",
      a.location || "",
      a.responsible || "",
      ASSET_STATUS[a.status]?.label || a.status,
      a.acquisition || "",
      a.value ? `R$${a.value}` : "",
    ]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `ativos_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ─── Utility ──────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

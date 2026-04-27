/**
 * app-fornecedores.js — Suppliers Page Controller
 *
 * Features:
 *  - List suppliers, filterable by category, type, active status
 *  - Add / Edit supplier via modal
 *  - Delete with confirmation
 *  - Supports ?cat= param to pre-filter by category
 */

import { checkAuth, getCurrentUser } from "../core/db-auth.js";
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getCategories,
  SUPPLIER_TYPE,
  fmtDate,
} from "../core/db-ativos.js";

await checkAuth("ativos");
const perfil = await getCurrentUser();

// ─── Header ──────────────────────────────────────────
if (perfil?.nome) {
  const $n = document.getElementById("header-user-name");
  const $a = document.getElementById("header-avatar");
  if ($n) $n.textContent = perfil.nome;
  if ($a) $a.textContent = perfil.nome.charAt(0).toUpperCase();
}

// ─── URL params ───────────────────────────────────────
const _params  = new URLSearchParams(window.location.search);
const _catId   = _params.get("cat");  // Firestore category doc ID

// ─── State ───────────────────────────────────────────
let allSuppliers  = [];
let allCategories = [];
let categoryMap   = {};   // id → category
let editingId     = null; // currently editing supplier ID

// ─── DOM refs ─────────────────────────────────────────
const $grid        = document.getElementById("suppliers-grid");
const $resultCount = document.getElementById("result-count");
const $fSearch     = document.getElementById("f-search");
const $fType       = document.getElementById("f-type");
const $fActive     = document.getElementById("f-active");
const $catsGrid    = document.getElementById("cats-grid");
const $saveBtn     = document.getElementById("save-btn");
const $modalTitle  = document.getElementById("modal-title");

// ─── Bootstrap ───────────────────────────────────────
await loadData();

// ─── Load data ────────────────────────────────────────
async function loadData() {
  [allSuppliers, allCategories] = await Promise.all([
    getSuppliers(),
    getCategories(),
  ]);
  categoryMap = Object.fromEntries(allCategories.map(c => [c.id, c]));

  // Show category context banner if ?cat= is present
  if (_catId && categoryMap[_catId]) {
    const cat = categoryMap[_catId];
    document.getElementById("cat-context").style.display = "flex";
    document.getElementById("ctx-icon").textContent  = cat.icon || "📎";
    document.getElementById("ctx-name").textContent  = cat.name;
  }

  renderSuppliers();
}

// ─── Render ───────────────────────────────────────────
function renderSuppliers() {
  const search  = ($fSearch?.value  || "").toLowerCase();
  const type    = $fType?.value    || "";
  const active  = $fActive?.value;

  let list = allSuppliers;

  // Pre-filter by ?cat= if active
  if (_catId) {
    list = list.filter(s => (s.categoryIds || []).includes(_catId));
  }

  if (search) {
    list = list.filter(s =>
      (s.name    || "").toLowerCase().includes(search) ||
      (s.contact || "").toLowerCase().includes(search) ||
      (s.email   || "").toLowerCase().includes(search)
    );
  }
  if (type)   list = list.filter(s => s.type === type);
  if (active) list = list.filter(s => String(s.active !== false) === active);

  $resultCount.textContent = `${list.length} fornecedor${list.length !== 1 ? "es" : ""}`;

  if (!list.length) {
    $grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state-icon">🏢</div>
        <h3>Nenhum fornecedor encontrado</h3>
        <p>Adicione o primeiro fornecedor para esta categoria.</p>
      </div>`;
    return;
  }

  $grid.innerHTML = list.map(s => _cardHTML(s)).join("");

  // Bind card buttons
  $grid.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); openModal(btn.dataset.edit); });
  });
  $grid.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); confirmDelete(btn.dataset.delete, btn.dataset.name); });
  });
}

function _cardHTML(s) {
  const typeInfo = SUPPLIER_TYPE[s.type] || SUPPLIER_TYPE.both;
  const cats = (s.categoryIds || [])
    .map(id => categoryMap[id])
    .filter(Boolean)
    .map(c => `<span class="sc-cat-tag">${c.icon || ""} ${c.name}</span>`)
    .join("");

  return `
  <div class="supplier-card${s.active === false ? " inactive" : ""}">
    <div class="sc-header">
      <div>
        <div class="sc-name">${esc(s.name || "—")}</div>
        ${s.contact ? `<div class="sc-contact">👤 ${esc(s.contact)}</div>` : ""}
      </div>
      <div class="sc-badges">
        <span class="badge ${typeInfo.css}">${typeInfo.icon} ${typeInfo.label}</span>
        ${s.active === false ? `<span class="badge badge-inactive">Inativo</span>` : ""}
      </div>
    </div>

    ${cats ? `<div class="sc-cats">${cats}</div>` : ""}

    <div class="sc-info">
      ${s.phone ? `<div class="sc-info-row">📞 ${esc(s.phone)}</div>` : ""}
      ${s.email ? `<div class="sc-info-row">✉️ ${esc(s.email)}</div>` : ""}
      ${s.cnpj  ? `<div class="sc-info-row">🏛 ${esc(s.cnpj)}</div>`  : ""}
      ${s.notes ? `<div class="sc-info-row" style="color:#94a3b8;font-style:italic;">${esc(s.notes)}</div>` : ""}
    </div>

    <div class="sc-actions">
      <button class="btn-sc-action edit" data-edit="${s.id}">✏️ Editar</button>
      <button class="btn-sc-action del"  data-delete="${s.id}" data-name="${esc(s.name)}">🗑️ Excluir</button>
    </div>
  </div>`;
}

// ─── Filters ──────────────────────────────────────────
$fSearch?.addEventListener("input",  renderSuppliers);
$fType?.addEventListener("change",   renderSuppliers);
$fActive?.addEventListener("change", renderSuppliers);

// ─── Modal ───────────────────────────────────────────
window.openModal = async function openModal(id = null) {
  editingId = id;
  $modalTitle.textContent = id ? "Editar Fornecedor" : "Novo Fornecedor";

  _buildCatsGrid(id ? null : _catId);

  if (id) {
    $saveBtn.textContent = "Salvar alterações";
    const s = await getSupplierById(id);
    if (!s) return;
    document.getElementById("f-name").value    = s.name    || "";
    document.getElementById("f-ftype").value   = s.type    || "purchase";
    document.getElementById("f-cnpj").value    = s.cnpj    || "";
    document.getElementById("f-contact").value = s.contact || "";
    document.getElementById("f-phone").value   = s.phone   || "";
    document.getElementById("f-email").value   = s.email   || "";
    document.getElementById("f-notes").value   = s.notes   || "";
    document.getElementById("f-active-chk").checked = s.active !== false;

    // Check relevant category boxes
    (s.categoryIds || []).forEach(cid => {
      const chk = document.querySelector(`#cats-grid input[value="${cid}"]`);
      if (chk) {
        chk.checked = true;
        chk.closest("label")?.classList.add("checked");
      }
    });
  } else {
    $saveBtn.textContent = "Salvar";
    document.getElementById("f-name").value    = "";
    document.getElementById("f-ftype").value   = "purchase";
    document.getElementById("f-cnpj").value    = "";
    document.getElementById("f-contact").value = "";
    document.getElementById("f-phone").value   = "";
    document.getElementById("f-email").value   = "";
    document.getElementById("f-notes").value   = "";
    document.getElementById("f-active-chk").checked = true;
  }

  document.getElementById("form-modal").classList.remove("hidden");
  document.getElementById("f-name").focus();
};

function _buildCatsGrid(preCheckId = null) {
  $catsGrid.innerHTML = allCategories.map(cat => `
    <label class="cat-check-label${preCheckId === cat.id ? " checked" : ""}">
      <input type="checkbox" value="${cat.id}"
             ${preCheckId === cat.id ? "checked" : ""}
             onchange="this.closest('label').classList.toggle('checked', this.checked)" />
      ${cat.icon || ""} ${cat.name}
    </label>`).join("");
}

window.closeModal = function closeModal() {
  document.getElementById("form-modal").classList.add("hidden");
  editingId = null;
};

window.saveSupplier = async function saveSupplier() {
  const name = document.getElementById("f-name").value.trim();
  if (!name) { alert("Nome é obrigatório."); return; }

  // Gather checked category IDs
  const categoryIds = [...$catsGrid.querySelectorAll("input[type=checkbox]:checked")]
    .map(el => el.value);

  const data = {
    name,
    type:        document.getElementById("f-ftype").value,
    cnpj:        document.getElementById("f-cnpj").value.trim(),
    contact:     document.getElementById("f-contact").value.trim(),
    phone:       document.getElementById("f-phone").value.trim(),
    email:       document.getElementById("f-email").value.trim(),
    notes:       document.getElementById("f-notes").value.trim(),
    active:      document.getElementById("f-active-chk").checked,
    categoryIds,
  };

  $saveBtn.disabled    = true;
  $saveBtn.textContent = "Salvando…";

  try {
    if (editingId) {
      await updateSupplier(editingId, data);
      const idx = allSuppliers.findIndex(s => s.id === editingId);
      if (idx >= 0) allSuppliers[idx] = { id: editingId, ...data };
    } else {
      const newId = await createSupplier(data);
      allSuppliers.unshift({ id: newId, ...data });
    }
    closeModal();
    renderSuppliers();
  } catch (err) {
    alert("Erro ao salvar: " + err.message);
  } finally {
    $saveBtn.disabled    = false;
    $saveBtn.textContent = editingId ? "Salvar alterações" : "Salvar";
  }
};

async function confirmDelete(id, name) {
  if (!confirm(`Excluir o fornecedor "${name}"?\nEsta ação não pode ser desfeita.`)) return;
  try {
    await deleteSupplier(id);
    allSuppliers = allSuppliers.filter(s => s.id !== id);
    renderSuppliers();
  } catch (err) {
    alert("Erro ao excluir: " + err.message);
  }
}

// ─── Helpers ─────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * app-categorias.js — Category Manager Controller
 *
 * Features:
 *  - View all categories as cards with icon + color + field count
 *  - Create / edit / delete categories
 *  - Dynamic field schema editor (add/remove fields with type, label, key)
 *  - Maintenance type checkboxes per category
 *  - Auto-seed defaults on first load
 */

import { checkAuth, getCurrentUser } from "../core/db-auth.js";
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  seedDefaultCategories,
  FIELD_TYPES,
} from "../core/db-ativos.js";
import { DEFAULT_CATEGORIES } from "../data/ativos-categorias.js";

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
let categories  = [];
let editCatId   = null;
let currentFields = [];   // field schema being edited
let editFieldIdx  = null; // index in currentFields when editing a field

// ─── Bootstrap ───────────────────────────────────────
await seedDefaultCategories(DEFAULT_CATEGORIES);
categories = await getCategories();
renderGrid();

// ─── Grid rendering ───────────────────────────────────
function renderGrid() {
  const $grid = document.getElementById("cat-grid");
  if (categories.length === 0) {
    $grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-icon">⚙️</div>
        <p class="empty-title">Nenhuma categoria cadastrada</p>
        <p class="empty-sub">Clique em "+ Nova Categoria" para começar.</p>
      </div>`;
    return;
  }

  $grid.innerHTML = categories.map(cat => {
    const fieldCount = cat.fields?.length || 0;
    const maintTypes = (cat.maintenanceTypes || []).join(", ");

    return `
      <div class="cat-card" onclick="openCatModal('${cat.id}')">
        <div class="cat-icon-box" style="background:${hexToAlpha(cat.color || '#64748b', 0.12)};">
          <span style="font-size:1.4rem;">${cat.icon || "📎"}</span>
        </div>
        <div class="cat-card-body">
          <div class="cat-name">${escHtml(cat.name)}</div>
          <div class="cat-meta">
            <span class="cat-prefix">${cat.prefix}</span>
            · ${fieldCount} campo${fieldCount !== 1 ? "s" : ""}
            · ${cat.assetCount || 0} ativo${cat.assetCount !== 1 ? "s" : ""}
          </div>
        </div>
        <div class="cat-card-actions">
          <button class="btn btn-secondary btn-sm"
                  onclick="event.stopPropagation();openCatModal('${cat.id}')">
            ✏️
          </button>
        </div>
      </div>`;
  }).join("");
}

// ─── Open modal ───────────────────────────────────────
window.openCatModal = async function(id) {
  editCatId      = id || null;
  currentFields  = [];
  editFieldIdx   = null;

  const $modal   = document.getElementById("cat-modal");
  const $modeLbl = document.getElementById("cat-modal-mode");
  const $modeName= document.getElementById("cat-modal-name");
  const $delBtn  = document.getElementById("cat-delete-btn");

  resetCatForm();

  if (id) {
    $modeLbl.textContent = "Editar Categoria";
    const cat = categories.find(c => c.id === id);
    if (!cat) return;

    $modeName.textContent = cat.name;
    document.getElementById("cat-name").value   = cat.name;
    document.getElementById("cat-prefix").value = cat.prefix;
    document.getElementById("cat-icon").value   = cat.icon || "";
    document.getElementById("cat-color").value  = cat.color || "#0f4c75";
    document.getElementById("cat-color-hex").textContent = cat.color || "#0f4c75";

    // Maintenance checkboxes
    const mt = cat.maintenanceTypes || [];
    document.getElementById("mt-prev").checked = mt.includes("preventiva");
    document.getElementById("mt-corr").checked = mt.includes("corretiva");
    document.getElementById("mt-insp").checked = mt.includes("inspecao");

    currentFields = JSON.parse(JSON.stringify(cat.fields || []));
    renderFieldList();

    $delBtn.style.display = (cat.assetCount || 0) === 0 ? "inline-flex" : "none";
  } else {
    $modeLbl.textContent  = "Nova Categoria";
    $modeName.textContent = "Nova Categoria";
    $delBtn.style.display = "none";
    renderFieldList();
  }

  // Color picker live update
  document.getElementById("cat-color").oninput = function() {
    document.getElementById("cat-color-hex").textContent = this.value;
  };

  $modal.classList.remove("hidden");
};

function resetCatForm() {
  document.getElementById("cat-name").value   = "";
  document.getElementById("cat-prefix").value = "";
  document.getElementById("cat-icon").value   = "";
  document.getElementById("cat-color").value  = "#0f4c75";
  document.getElementById("cat-color-hex").textContent = "#0f4c75";
  document.getElementById("mt-prev").checked  = true;
  document.getElementById("mt-corr").checked  = true;
  document.getElementById("mt-insp").checked  = false;
  currentFields = [];
}

// ─── Field list rendering ─────────────────────────────
function renderFieldList() {
  const $list  = document.getElementById("field-list");
  const $empty = document.getElementById("field-empty");

  if (currentFields.length === 0) {
    $list.innerHTML = "";
    $empty.style.display = "block";
    return;
  }

  $empty.style.display = "none";
  $list.innerHTML = currentFields.map((f, i) => `
    <div class="field-row">
      <span class="field-row-drag" title="Arrastar">⠿</span>
      <div class="field-row-info">
        <div class="field-row-label">${escHtml(f.label)}</div>
        <div class="field-row-type">
          <span class="field-type-badge">${FIELD_TYPES[f.type] || f.type}</span>
          · chave: <code style="font-size:.7rem;">${escHtml(f.key)}</code>
          ${f.required ? " · <strong>Obrigatório</strong>" : ""}
        </div>
      </div>
      <div style="display:flex;gap:5px;">
        <button class="btn btn-secondary btn-xs" onclick="editField(${i})">✏️</button>
        <button class="btn btn-danger btn-xs"    onclick="removeField(${i})">✕</button>
      </div>
    </div>`).join("");
}

// ─── Add / edit field ─────────────────────────────────
window.addField = function() {
  editFieldIdx = null;
  resetFieldForm();
  document.getElementById("fm-title").textContent = "Novo Campo";
  document.getElementById("field-modal").classList.remove("hidden");
};

window.editField = function(idx) {
  editFieldIdx = idx;
  const f = currentFields[idx];
  document.getElementById("fm-title").textContent = "Editar Campo";
  document.getElementById("fm-label").value    = f.label;
  document.getElementById("fm-key").value      = f.key;
  document.getElementById("fm-type").value     = f.type;
  document.getElementById("fm-required").checked = f.required || false;
  document.getElementById("fm-options").value  = (f.options || []).join("\n");
  toggleOptionsField();
  document.getElementById("field-modal").classList.remove("hidden");
};

window.removeField = function(idx) {
  currentFields.splice(idx, 1);
  renderFieldList();
};

window.saveField = function() {
  const label   = document.getElementById("fm-label").value.trim();
  const key     = document.getElementById("fm-key").value.trim().replace(/\s+/g, "_");
  const type    = document.getElementById("fm-type").value;
  const req     = document.getElementById("fm-required").checked;
  const optText = document.getElementById("fm-options").value.trim();

  if (!label) { alert("Informe o rótulo do campo."); return; }
  if (!key)   { alert("Informe a chave do campo."); return; }

  const field = { key, label, type, required: req };
  if (type === "select" && optText) {
    field.options = optText.split("\n").map(s => s.trim()).filter(Boolean);
  }

  if (editFieldIdx !== null) {
    currentFields[editFieldIdx] = field;
  } else {
    // Check for duplicate key
    if (currentFields.some(f => f.key === key)) {
      alert(`A chave "${key}" já existe nesta categoria.`);
      return;
    }
    currentFields.push(field);
  }

  renderFieldList();
  document.getElementById("field-modal").classList.add("hidden");
};

function resetFieldForm() {
  document.getElementById("fm-label").value    = "";
  document.getElementById("fm-key").value      = "";
  document.getElementById("fm-type").value     = "text";
  document.getElementById("fm-required").checked = false;
  document.getElementById("fm-options").value  = "";
  document.getElementById("fm-options-group").style.display = "none";
}

// ─── Save category ────────────────────────────────────
window.saveCat = async function() {
  const name   = document.getElementById("cat-name").value.trim();
  const prefix = document.getElementById("cat-prefix").value.trim().toUpperCase();
  const icon   = document.getElementById("cat-icon").value.trim() || "📎";
  const color  = document.getElementById("cat-color").value;

  if (!name)   { alert("Informe o nome da categoria."); return; }
  if (!prefix) { alert("Informe o prefixo do código."); return; }

  const maintTypes = [];
  if (document.getElementById("mt-prev").checked) maintTypes.push("preventiva");
  if (document.getElementById("mt-corr").checked) maintTypes.push("corretiva");
  if (document.getElementById("mt-insp").checked) maintTypes.push("inspecao");

  const data = { name, prefix, icon, color, maintenanceTypes: maintTypes, fields: currentFields };

  try {
    if (editCatId) {
      await updateCategory(editCatId, data);
    } else {
      await createCategory(data);
    }

    document.getElementById("cat-modal").classList.add("hidden");
    categories = await getCategories();
    renderGrid();
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar categoria: " + (err.message || err));
  }
};

// ─── Delete category ──────────────────────────────────
window.deleteCurrentCat = async function() {
  if (!editCatId) return;
  const cat = categories.find(c => c.id === editCatId);
  if (!cat) return;

  if ((cat.assetCount || 0) > 0) {
    alert(`Não é possível excluir: esta categoria possui ${cat.assetCount} ativo(s) vinculado(s).\nExclua ou reatribua os ativos primeiro.`);
    return;
  }

  if (!confirm(`Excluir a categoria "${cat.name}"?`)) return;

  await deleteCategory(editCatId);
  document.getElementById("cat-modal").classList.add("hidden");
  categories = await getCategories();
  renderGrid();
};

// ─── Utilities ────────────────────────────────────────
function hexToAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

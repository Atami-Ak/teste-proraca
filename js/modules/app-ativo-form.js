/**
 * app-ativo-form.js — Asset Create / Edit Form Controller
 *
 * Dynamic form engine:
 *  - Category selection drives the "dynamic fields" section
 *  - Asset code is previewed based on category prefix
 *  - On save: generates real sequential code and writes to Firestore
 *  - Edit mode: pre-fills all fields from existing asset
 */

import { checkAuth, getCurrentUser } from "../core/db-auth.js";
import {
  getCategories,
  getAssetById,
  createAsset,
  updateAsset,
  generateAssetCode,
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

// ─── Edit mode detection ──────────────────────────────
const params   = new URLSearchParams(location.search);
const editId   = params.get("id");
const isEdit   = !!editId;

document.getElementById("page-sub-title").textContent = isEdit ? "Editar Ativo" : "Novo Ativo";

// ─── State ───────────────────────────────────────────
let categories   = [];
let categoryMap  = {};
let editAsset    = null;

// ─── DOM refs ─────────────────────────────────────────
const $fCategory  = document.getElementById("f-category");
const $fName      = document.getElementById("f-name");
const $codePreview= document.getElementById("code-preview");
const $fLocation  = document.getElementById("f-location");
const $fLocDetail = document.getElementById("f-location-detail");
const $fResp      = document.getElementById("f-responsible");
const $fAcq       = document.getElementById("f-acquisition");
const $fValue     = document.getElementById("f-value");
const $fStatus    = document.getElementById("f-status");
const $fNotes     = document.getElementById("f-notes");
const $dynSection = document.getElementById("dynamic-section");
const $dynTitle   = document.getElementById("dynamic-section-title");
const $dynFields  = document.getElementById("dynamic-fields");
const $obsSectionNum = document.getElementById("obs-section-num");
const $saveBtn    = document.getElementById("btn-save");
const $overlay    = document.getElementById("save-overlay");
const $saveMsg    = document.getElementById("save-msg");

// ─── Bootstrap ───────────────────────────────────────
categories = await getCategories();
categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));

populateCategorySelect();
populateLocations();

if (isEdit) {
  editAsset = await getAssetById(editId);
  if (!editAsset) {
    alert("Ativo não encontrado.");
    location.href = "ativos.html";
  } else {
    fillForm(editAsset);
  }
}

// ─── Populate selects ─────────────────────────────────
function populateCategorySelect() {
  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value       = cat.id;
    opt.textContent = `${cat.icon || ""} ${cat.name}`;
    $fCategory.appendChild(opt);
  });
}

function populateLocations() {
  LOCATIONS.forEach(loc => {
    const opt = document.createElement("option");
    opt.value = loc;
    opt.textContent = loc;
    $fLocation.appendChild(opt);
  });
  // Option to add custom location
  const custom = document.createElement("option");
  custom.value = "__custom__";
  custom.textContent = "✏️ Digitar outro...";
  $fLocation.appendChild(custom);
}

// ─── Category change → dynamic fields ─────────────────
$fCategory.addEventListener("change", () => {
  const catId = $fCategory.value;
  if (!catId) {
    $dynSection.style.display = "none";
    $codePreview.textContent  = "Selecione a categoria";
    $obsSectionNum.textContent = "3";
    return;
  }
  const cat = categoryMap[catId];
  renderDynamicFields(cat);
  updateCodePreview(cat);
  $obsSectionNum.textContent = "4";
});

$fLocation.addEventListener("change", () => {
  if ($fLocation.value === "__custom__") {
    const val = prompt("Digite a localização:");
    if (val?.trim()) {
      const opt = document.createElement("option");
      opt.value = opt.textContent = val.trim();
      $fLocation.insertBefore(opt, $fLocation.lastElementChild);
      $fLocation.value = val.trim();
    } else {
      $fLocation.value = "";
    }
  }
});

async function updateCodePreview(cat) {
  if (!cat) return;
  if (isEdit && editAsset?.code) {
    $codePreview.textContent = editAsset.code;
    return;
  }
  $codePreview.textContent = "Gerando…";
  try {
    const code = await generateAssetCode(cat.prefix);
    $codePreview.textContent = code;
  } catch {
    $codePreview.textContent = `${cat.prefix}-????`;
  }
}

// ─── Dynamic form engine ──────────────────────────────
function renderDynamicFields(cat) {
  if (!cat?.fields?.length) {
    $dynSection.style.display = "none";
    return;
  }

  $dynSection.style.display = "block";
  $dynTitle.textContent = `Dados Técnicos — ${cat.name}`;

  const existingDyn = isEdit ? (editAsset?.dynamicData || {}) : {};

  // Build fields in rows of 2
  const rows = [];
  let row = [];
  cat.fields.forEach((field, i) => {
    row.push(field);
    if (row.length === 2 || field.type === "textarea" || i === cat.fields.length - 1) {
      rows.push([...row]);
      row = [];
    }
  });

  $dynFields.innerHTML = rows.map(rowFields => {
    if (rowFields.length === 1 && rowFields[0].type === "textarea") {
      return `<div class="form-row full">${buildField(rowFields[0], existingDyn)}</div>`;
    }
    return `<div class="form-row">${rowFields.map(f => buildField(f, existingDyn)).join("")}</div>`;
  }).join("");
}

function buildField(field, existingDyn) {
  const val = existingDyn[field.key] ?? "";
  const id  = `dyn-${field.key}`;
  const req = field.required ? `<span class="req">*</span>` : "";

  let input = "";

  switch (field.type) {
    case "select":
      const opts = (field.options || []).map(o =>
        `<option value="${escAttr(o)}" ${val === o ? "selected" : ""}>${escHtml(o)}</option>`
      ).join("");
      input = `<select id="${id}" class="form-select" data-key="${field.key}">
                 <option value="">Selecione...</option>${opts}
               </select>`;
      break;

    case "date":
      input = `<input type="date" id="${id}" class="form-input" value="${escAttr(String(val))}" data-key="${field.key}" />`;
      break;

    case "number":
      input = `<input type="number" id="${id}" class="form-input" value="${escAttr(String(val))}" data-key="${field.key}" placeholder="0" />`;
      break;

    case "textarea":
      input = `<textarea id="${id}" class="form-textarea" data-key="${field.key}" rows="3">${escHtml(String(val))}</textarea>`;
      break;

    default: // text
      input = `<input type="text" id="${id}" class="form-input" value="${escAttr(String(val))}" data-key="${field.key}" placeholder="${field.label}..." />`;
  }

  return `
    <div class="form-group">
      <label class="form-label" for="${id}">${escHtml(field.label)} ${req}</label>
      ${input}
    </div>`;
}

// ─── Fill form for edit ───────────────────────────────
function fillForm(asset) {
  $fName.value     = asset.name       || "";
  $fLocDetail.value= asset.locationDetail || "";
  $fResp.value     = asset.responsible || "";
  $fAcq.value      = asset.acquisition || "";
  $fValue.value    = asset.value      || "";
  $fNotes.value    = asset.notes      || "";
  $fStatus.value   = asset.status     || "ativo";

  // Location
  const locOpts = Array.from($fLocation.options).map(o => o.value);
  if (!locOpts.includes(asset.location) && asset.location) {
    const opt = document.createElement("option");
    opt.value = opt.textContent = asset.location;
    $fLocation.insertBefore(opt, $fLocation.lastElementChild);
  }
  $fLocation.value = asset.location || "";

  // Category
  if (asset.categoryId) {
    $fCategory.value = asset.categoryId;
    $fCategory.dispatchEvent(new Event("change"));
  }
}

// ─── Save ─────────────────────────────────────────────
window.saveAsset = async function() {
  const name      = $fName.value.trim();
  const catId     = $fCategory.value;
  const locValue  = $fLocation.value;
  const status    = $fStatus.value;

  // Validation
  if (!name)     { markErr($fName,     "Informe o nome do ativo.");     return; }
  if (!catId)    { markErr($fCategory, "Selecione a categoria.");       return; }
  if (!locValue) { markErr($fLocation, "Selecione a localização.");     return; }

  const locationStr = locValue === "__custom__" ? "" : locValue;

  // Collect dynamic fields
  const dynamicData = {};
  document.querySelectorAll("[data-key]").forEach(el => {
    const key = el.dataset.key;
    const val = el.value;
    if (val !== "" && val !== undefined) dynamicData[key] = val;
  });

  // Show overlay
  $overlay.classList.remove("hidden");

  try {
    if (isEdit) {
      $saveMsg.textContent = "Atualizando ativo...";
      await updateAsset(editId, {
        name,
        categoryId:      catId,
        location:        locationStr,
        locationDetail:  $fLocDetail.value.trim() || null,
        responsible:     $fResp.value.trim()   || null,
        acquisition:     $fAcq.value           || null,
        value:           $fValue.value ? Number($fValue.value) : null,
        status,
        notes:           $fNotes.value.trim()  || null,
        dynamicData,
        updatedBy:       perfil?.nome || "—",
      });
    } else {
      $saveMsg.textContent = "Gerando código...";
      const cat  = categoryMap[catId];
      const code = await generateAssetCode(cat.prefix);

      $saveMsg.textContent = "Salvando ativo...";
      await createAsset({
        code,
        codePrefix:      cat.prefix,
        name,
        categoryId:      catId,
        location:        locationStr,
        locationDetail:  $fLocDetail.value.trim() || null,
        responsible:     $fResp.value.trim()   || null,
        acquisition:     $fAcq.value           || null,
        value:           $fValue.value ? Number($fValue.value) : null,
        status,
        notes:           $fNotes.value.trim()  || null,
        dynamicData,
        createdBy:       perfil?.nome || "—",
      });
    }

    window.location.href = "ativos.html";
  } catch (err) {
    console.error(err);
    $overlay.classList.add("hidden");
    alert("Erro ao salvar: " + (err.message || err));
  }
};

// ─── Helpers ──────────────────────────────────────────
function markErr(el, msg) {
  el.classList.add("err");
  el.focus();
  alert(msg);
  setTimeout(() => el.classList.remove("err"), 3000);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escAttr(str) {
  return String(str).replace(/"/g, "&quot;");
}

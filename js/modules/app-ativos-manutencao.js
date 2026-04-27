/**
 * app-ativos-manutencao.js — Category-Enforced Maintenance Controller
 *
 * Category enforcement rules:
 *  1. Asset selection → restrict Type dropdown to category.maintenanceTypes
 *  2. Type = preventiva + category.maintenanceConfig.preventiveFrequencyDays
 *     → auto-suggest scheduled date
 *  3. category.maintenanceConfig.requiresTechnician = true
 *     → mark Technician field as required
 *  4. Show category notes as a hint in the modal
 *  5. Save enforced categoryId + categoryName on every maintenance record
 */

import { checkAuth, getCurrentUser } from "../core/db-auth.js";
import {
  getMaintenance,
  createMaintenance,
  updateMaintenance,
  deleteMaintenance,
  getAssets,
  getCategories,
  MAINT_TYPE,
  MAINT_STATUS,
  fmtDate,
} from "../core/db-ativos.js";

await checkAuth("ativos");
const perfil = await getCurrentUser();

// ─── Header ──────────────────────────────────────────
{
  const $n = document.getElementById("header-user-name");
  const $a = document.getElementById("header-avatar");
  if (perfil?.nome) {
    if ($n) $n.textContent = perfil.nome;
    if ($a) $a.textContent = perfil.nome.charAt(0).toUpperCase();
  }
}

// ─── State ───────────────────────────────────────────
let allMaint      = [];
let allAssets     = [];
let categoryMap   = {};   // id → category
let editMaintId   = null;
let _assetIdForMaint = null; // pre-selected asset when opening from ativos page

// ─── Bootstrap ───────────────────────────────────────
const [maints, assets, cats] = await Promise.all([
  getMaintenance(),
  getAssets(),
  getCategories(),
]);
allMaint  = maints;
allAssets = assets;
categoryMap = Object.fromEntries(cats.map(c => [c.id, c]));

// Check URL param: ?assetId=xxx (when opened from asset detail)
const _params = new URLSearchParams(location.search);
if (_params.get("assetId")) {
  _assetIdForMaint = _params.get("assetId");
}

renderStats();
renderList(allMaint);
populateAssetSelect();

// ─── Populate asset selector ──────────────────────────
function populateAssetSelect() {
  const $sel = document.getElementById("mm-asset");
  if (!$sel) return;
  $sel.innerHTML = '<option value="">Selecione o ativo...</option>';
  allAssets.forEach(a => {
    const opt = document.createElement("option");
    opt.value       = a.id;
    opt.textContent = `${a.code ? `[${a.code}] ` : ""}${a.name}`;
    opt.dataset.catId = a.categoryId || "";
    $sel.appendChild(opt);
  });

  // Wire category enforcement on change
  $sel.addEventListener("change", onAssetChange);

  // Pre-select if URL param
  if (_assetIdForMaint) {
    $sel.value = _assetIdForMaint;
    $sel.dispatchEvent(new Event("change"));
  }
}

// ─── Category enforcement on asset select ─────────────
function onAssetChange() {
  const assetId = document.getElementById("mm-asset").value;
  const asset   = allAssets.find(a => a.id === assetId);
  if (!asset) { resetTypeOptions(); return; }

  const cat = categoryMap[asset.categoryId];
  if (!cat) { resetTypeOptions(); return; }

  const cfg = cat.maintenanceConfig || {};

  // 1. Restrict type dropdown
  const $type   = document.getElementById("mm-type");
  const validTypes = cat.maintenanceTypes || ["preventiva", "corretiva", "inspecao"];

  Array.from($type.options).forEach(opt => {
    const ok = validTypes.includes(opt.value);
    opt.disabled = !ok;
    opt.style.display = ok ? "" : "none";
  });

  // Select default type from config, or first valid
  const preferred = cfg.defaultType || validTypes[0] || "corretiva";
  $type.value = validTypes.includes(preferred) ? preferred : validTypes[0];
  $type.dispatchEvent(new Event("change")); // auto-suggest date

  // 2. Technician required?
  const $techLabel = document.getElementById("mm-tech-label");
  if ($techLabel) {
    $techLabel.innerHTML = cfg.requiresTechnician
      ? `Técnico Responsável <span class="req">*</span>`
      : "Técnico Responsável";
  }

  // 3. Show category maintenance notes
  const $hint = document.getElementById("mm-cat-hint");
  if ($hint) {
    if (cfg.notes) {
      $hint.textContent = `💡 ${cfg.notes}`;
      $hint.style.display = "block";
    } else {
      $hint.style.display = "none";
    }
  }

  // 4. Update modal title
  const $title = document.getElementById("mm-asset-title");
  if ($title) {
    $title.textContent = `${cat.icon || ""} ${asset.name}`;
  }
}

// ─── Auto-suggest date when type = preventiva ─────────
function onTypeChange() {
  const assetId  = document.getElementById("mm-asset")?.value;
  const typeVal  = document.getElementById("mm-type")?.value;
  const $sched   = document.getElementById("mm-sched-date");
  if (!$sched || !assetId || !typeVal) return;

  if (typeVal !== "preventiva") return; // only auto-suggest for preventive

  const asset = allAssets.find(a => a.id === assetId);
  const cat   = asset ? categoryMap[asset.categoryId] : null;
  const days  = cat?.maintenanceConfig?.preventiveFrequencyDays;

  if (days && !$sched.value) {
    const next = new Date();
    next.setDate(next.getDate() + days);
    $sched.value = next.toISOString().split("T")[0];
  }
}

document.getElementById("mm-type")?.addEventListener("change", onTypeChange);

function resetTypeOptions() {
  const $type = document.getElementById("mm-type");
  if (!$type) return;
  Array.from($type.options).forEach(opt => {
    opt.disabled = false;
    opt.style.display = "";
  });
  const $hint = document.getElementById("mm-cat-hint");
  if ($hint) $hint.style.display = "none";
}

// ─── Stats bar ────────────────────────────────────────
function renderStats() {
  const c = { pendente: 0, andamento: 0, concluida: 0 };
  allMaint.forEach(m => { if (c[m.status] !== undefined) c[m.status]++; });
  const $t = document.getElementById("ms-total");
  const $p = document.getElementById("ms-pend");
  const $a = document.getElementById("ms-and");
  const $c = document.getElementById("ms-conc");
  if ($t) $t.textContent = allMaint.length;
  if ($p) $p.textContent = c.pendente;
  if ($a) $a.textContent = c.andamento;
  if ($c) $c.textContent = c.concluida;
}

// ─── List rendering ───────────────────────────────────
function renderList(records) {
  const $list  = document.getElementById("maint-list");
  const $count = document.getElementById("maint-count");
  if (!$list) return;

  if ($count) $count.textContent = `${records.length} registro${records.length !== 1 ? "s" : ""}`;

  if (records.length === 0) {
    $list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔧</div>
        <p class="empty-title">Nenhuma manutenção encontrada</p>
        <p class="empty-sub">Crie uma nova ou ajuste os filtros.</p>
      </div>`;
    return;
  }

  $list.innerHTML = records.map(m => {
    const typeMeta   = MAINT_TYPE[m.type]    || MAINT_TYPE.corretiva;
    const statusMeta = MAINT_STATUS[m.status] || MAINT_STATUS.pendente;
    const cat        = categoryMap[m.categoryId];
    const catLabel   = cat ? `${cat.icon || ""} ${cat.name}` : "";

    const dateStr = m.scheduledDate
      ? `📅 ${m.scheduledDate}`
      : (m.createdAt ? fmtDate(m.createdAt) : "—");

    return `
      <div class="maint-card type-${m.type}" onclick="openDetail('${m.id}')">
        <div class="maint-type-icon">${typeMeta.icon}</div>
        <div class="maint-body">
          <div class="maint-asset">${escHtml(m.assetName || "Ativo desconhecido")}</div>
          <div class="maint-desc">${escHtml(m.description || "—")}</div>
          <div style="display:flex;gap:6px;margin-top:5px;flex-wrap:wrap;">
            <span class="badge badge-${m.type}" style="font-size:.65rem;padding:2px 7px;">${typeMeta.label}</span>
            ${catLabel ? `<span class="cat-badge" style="font-size:.65rem;">${escHtml(catLabel)}</span>` : ""}
            ${m.technician ? `<span style="font-size:.72rem;color:#64748b;">👤 ${escHtml(m.technician)}</span>` : ""}
          </div>
        </div>
        <div class="maint-right">
          <span class="badge ${statusMeta.css}">${statusMeta.icon} ${statusMeta.label}</span>
          <span class="maint-date">${dateStr}</span>
        </div>
      </div>`;
  }).join("");
}

// ─── Filtering ────────────────────────────────────────
function applyFilters() {
  const search = (document.getElementById("mf-search")?.value || "").toLowerCase().trim();
  const type   = document.getElementById("mf-type")?.value   || "";
  const status = document.getElementById("mf-status")?.value || "";

  const filtered = allMaint.filter(m => {
    if (type   && m.type   !== type)   return false;
    if (status && m.status !== status) return false;
    if (search) {
      const hay = `${m.assetName} ${m.description} ${m.technician || ""}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  renderList(filtered);
}

["mf-search", "mf-type", "mf-status"].forEach(id => {
  const el = document.getElementById(id);
  el?.addEventListener("input",  applyFilters);
  el?.addEventListener("change", applyFilters);
});

// ─── New maintenance modal ────────────────────────────
window.openNewMaintModal = function() {
  editMaintId = null;
  document.getElementById("mm-mode-label").textContent  = "Nova Manutenção";
  document.getElementById("mm-asset-title").textContent = "Selecione um ativo";
  resetMaintForm();

  // Pre-select asset from URL param if available
  if (_assetIdForMaint) {
    const $sel = document.getElementById("mm-asset");
    if ($sel) {
      $sel.value = _assetIdForMaint;
      $sel.dispatchEvent(new Event("change"));
    }
  }

  document.getElementById("maint-modal").classList.remove("hidden");
};

function resetMaintForm() {
  ["mm-asset","mm-type","mm-status","mm-desc","mm-sched-date","mm-complete-date","mm-tech"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (el.tagName === "SELECT" && id === "mm-type") {
        // Reset all options
        resetTypeOptions();
        el.value = "preventiva";
      } else if (el.tagName === "SELECT") {
        el.selectedIndex = 0;
      } else {
        el.value = "";
      }
    }
  });
  const $hint = document.getElementById("mm-cat-hint");
  if ($hint) $hint.style.display = "none";
}

// ─── Save ─────────────────────────────────────────────
window.saveMaint = async function() {
  const assetId   = document.getElementById("mm-asset")?.value;
  const type      = document.getElementById("mm-type")?.value;
  const status    = document.getElementById("mm-status")?.value;
  const desc      = document.getElementById("mm-desc")?.value.trim();
  const schedDate = document.getElementById("mm-sched-date")?.value;
  const compDate  = document.getElementById("mm-complete-date")?.value;
  const tech      = document.getElementById("mm-tech")?.value.trim();

  if (!assetId) { alert("Selecione o ativo."); return; }
  if (!desc)    { alert("Informe a descrição."); return; }

  // Enforce technician if required
  const assetObj = allAssets.find(a => a.id === assetId);
  const cat      = assetObj ? categoryMap[assetObj.categoryId] : null;
  if (cat?.maintenanceConfig?.requiresTechnician && !tech) {
    alert("Esta categoria exige um técnico responsável informado.");
    document.getElementById("mm-tech")?.focus();
    return;
  }

  const $btn = document.getElementById("mm-save-btn");
  if ($btn) { $btn.disabled = true; $btn.textContent = "Salvando..."; }

  const payload = {
    assetId,
    assetName:     assetObj?.name     || "—",
    categoryId:    assetObj?.categoryId || null,
    categoryName:  cat?.name           || null,
    type,
    status,
    description:   desc,
    scheduledDate: schedDate || null,
    completedDate: compDate  || null,
    technician:    tech      || null,
    createdBy:     perfil?.nome || "—",
  };

  try {
    if (editMaintId) {
      await updateMaintenance(editMaintId, payload, assetId);
    } else {
      await createMaintenance(payload);
    }

    document.getElementById("maint-modal")?.classList.add("hidden");
    document.getElementById("detail-modal")?.classList.add("hidden");

    [allMaint] = await Promise.all([getMaintenance()]);
    renderStats();
    applyFilters();
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar: " + (err.message || err));
  } finally {
    if ($btn) { $btn.disabled = false; $btn.textContent = "Salvar"; }
  }
};

// ─── Detail modal ─────────────────────────────────────
window.openDetail = function(id) {
  const m = allMaint.find(x => x.id === id);
  if (!m) return;
  editMaintId = id;

  const typeMeta   = MAINT_TYPE[m.type]    || MAINT_TYPE.corretiva;
  const statusMeta = MAINT_STATUS[m.status] || MAINT_STATUS.pendente;

  document.getElementById("dm-asset-name").textContent = m.assetName || "—";

  const $badges = document.getElementById("dm-badges");
  if ($badges) {
    $badges.innerHTML = `
      <span class="badge badge-${m.type}">${typeMeta.icon} ${typeMeta.label}</span>
      <span class="badge ${statusMeta.css}">${statusMeta.icon} ${statusMeta.label}</span>
      ${m.categoryName ? `<span class="cat-badge">${escHtml(m.categoryName)}</span>` : ""}`;
  }

  const rows = [
    ["Ativo",             m.assetName     || "—"],
    ["Categoria",         m.categoryName  || "—"],
    ["Tipo",              typeMeta.label],
    ["Status",            statusMeta.label],
    ["Descrição",         m.description   || "—"],
    ["Data Prevista",     m.scheduledDate || "—"],
    ["Data de Conclusão", m.completedDate || "—"],
    ["Técnico",           m.technician    || "—"],
    ["Criado por",        m.createdBy     || "—"],
    ["Registrado em",     fmtDate(m.createdAt)],
  ];

  const $body = document.getElementById("dm-body");
  if ($body) {
    $body.innerHTML = `
      <div class="detail-grid">
        ${rows.map(([l, v]) => `
          <div>
            <div class="detail-field-label">${escHtml(l)}</div>
            <div class="detail-field-value">${escHtml(String(v))}</div>
          </div>`).join("")}
      </div>`;
  }

  const $editBtn   = document.getElementById("dm-edit-btn");
  const $deleteBtn = document.getElementById("dm-delete-btn");

  if ($editBtn) {
    $editBtn.onclick = () => {
      document.getElementById("detail-modal")?.classList.add("hidden");
      fillEditForm(m);
      document.getElementById("maint-modal")?.classList.remove("hidden");
    };
  }

  if ($deleteBtn) {
    $deleteBtn.onclick = async () => {
      if (!confirm("Excluir esta manutenção?\nEsta ação não pode ser desfeita.")) return;
      await deleteMaintenance(id);
      document.getElementById("detail-modal")?.classList.add("hidden");
      allMaint = await getMaintenance();
      renderStats();
      applyFilters();
    };
  }

  document.getElementById("detail-modal")?.classList.remove("hidden");
};

function fillEditForm(m) {
  document.getElementById("mm-mode-label").textContent  = "Editar Manutenção";
  document.getElementById("mm-asset-title").textContent = m.assetName || "—";

  const fields = {
    "mm-asset":         m.assetId     || "",
    "mm-type":          m.type        || "preventiva",
    "mm-status":        m.status      || "pendente",
    "mm-desc":          m.description || "",
    "mm-sched-date":    m.scheduledDate || "",
    "mm-complete-date": m.completedDate || "",
    "mm-tech":          m.technician   || "",
  };

  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });

  // Re-apply enforcement for this asset
  const $asset = document.getElementById("mm-asset");
  if ($asset) $asset.dispatchEvent(new Event("change"));
}

// ─── Utility ──────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

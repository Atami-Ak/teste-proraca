/**
 * app-inspecao-frota.js — Fleet Inspection Form Controller v2
 *
 * Integrates with draft-engine.js for zero-data-loss auto-save.
 *
 * DRAFT SYSTEM OVERVIEW:
 *  - Every form interaction triggers a debounced save (400ms)
 *  - Form state → localStorage | Photos → IndexedDB
 *  - On load: prune stale drafts, offer recovery if any found
 *  - On submit success: clear draft + photos from storage
 *  - beforeunload guard prevents accidental navigation loss
 *  - Save status pill shows live state: saving → saved / offline / error
 */

import { checkAuth, getCurrentUser } from "../core/db-auth.js";
import { frotaDB } from "../data/dados-frota.js";
import {
  buildChecklist,
  groupByCategory,
  checklistStats,
} from "../data/checklist-engine.js";
import { salvarInspecao } from "../core/db-frota.js";
import {
  draftKey,
  TEMP_KEY,
  saveDraft,
  loadDraft,
  deleteDraft,
  listDrafts,
  pruneOldDrafts,
  isStorageAvailable,
  storePhoto,
  loadPhotos,
  deletePhotos,
  deletePhotosForItem,
} from "../core/draft-engine.js";

// ============================================================
// MODULE STATE — all declared at top level to prevent TDZ
// ============================================================

let perfil             = null;
let veiculoSelecionado = null;
let checklistItems     = [];          // flat array from checklist-engine
let photoFiles         = new Map();   // Map<itemId, File[]|Blob[]>

let _draftKey          = null;        // current active localStorage key
let _saveTimeout       = null;        // debounce timer handle
let _isDirty           = false;       // unsaved changes exist
let _submitting        = false;       // submit in flight
let _restoring         = false;       // draft restore in progress (suppresses auto-save)
let _storageAvailable  = true;

// ============================================================
// ENTRY POINT
// ============================================================

await checkAuth("inspecao-frota");
perfil = await getCurrentUser();

_storageAvailable = isStorageAvailable();
pruneOldDrafts();
_initUI();
_initOnlineGuard();

// Draft check comes before URL auto-select — user decides what to do first
await _checkForDraftsOnLoad();

// ============================================================
// UI INIT
// ============================================================

function _initUI() {
  // Topbar user
  const topbarUser = document.getElementById("topbar-user");
  if (topbarUser && perfil?.nome) topbarUser.textContent = perfil.nome;

  // Vehicle search
  const searchInput = document.getElementById("vehicle-search");
  const searchBtn   = document.getElementById("btn-search-vehicle");
  const resultsList = document.getElementById("vehicle-results");

  if (searchInput) {
    searchInput.addEventListener("input", () => _filterVehicles(searchInput.value));
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); _filterVehicles(searchInput.value); }
    });
  }
  if (searchBtn) searchBtn.addEventListener("click", () => _filterVehicles(searchInput?.value || ""));

  if (resultsList) {
    resultsList.addEventListener("click", (e) => {
      const card = e.target.closest("[data-vehicle-id]");
      if (card) _selectVehicle(card.dataset.vehicleId);
    });
  }

  _renderVehicleList(frotaDB);

  // Section collapsible toggles
  document.addEventListener("click", (e) => {
    const toggle = e.target.closest(".section-toggle");
    if (toggle) {
      const section = toggle.closest(".insp-section, .checklist-group");
      if (section) section.classList.toggle("collapsed");
    }
  });

  // Advanced lighting toggle
  const advLightingToggle = document.getElementById("toggle-advanced-lighting");
  if (advLightingToggle) {
    advLightingToggle.addEventListener("change", () => {
      if (veiculoSelecionado) {
        _buildAndRenderChecklist();
        triggerAutoSave();
      }
    });
  }

  // Checklist container — delegated events
  const checklistContainer = document.getElementById("checklist-container");
  if (checklistContainer) {
    checklistContainer.addEventListener("change", (e) => {
      if (e.target.matches(".nc-photo-input")) _handlePhotoChange(e.target);
    });
    checklistContainer.addEventListener("click", (e) => {
      const removeBtn = e.target.closest(".photo-remove-btn");
      if (removeBtn) _removePhoto(removeBtn.dataset.itemId, parseInt(removeBtn.dataset.idx, 10));
    });
  }

  // Header form changes → auto-save
  const headerFields = [
    "inspection-type", "inspection-location", "destination-city",
    "mileage", "inspection-date", "inspection-time", "fueling-done",
  ];
  headerFields.forEach((id) => {
    document.getElementById(id)?.addEventListener("change", triggerAutoSave);
    document.getElementById(id)?.addEventListener("input",  triggerAutoSave);
  });

  // Maintenance fields
  const maintenanceFields = [
    "oil-level", "coolant-level", "brake-fluid", "tires-pressure", "maintenance-obs",
  ];
  maintenanceFields.forEach((id) => {
    document.getElementById(id)?.addEventListener("change", triggerAutoSave);
    document.getElementById(id)?.addEventListener("input",  triggerAutoSave);
  });

  // Finalization fields
  const finalizationFields = [
    "inspector-name", "driver-name", "general-notes", "responsibility-term",
  ];
  finalizationFields.forEach((id) => {
    document.getElementById(id)?.addEventListener("change", triggerAutoSave);
    document.getElementById(id)?.addEventListener("input",  triggerAutoSave);
  });

  // NC notes (delegated — rendered dynamically)
  document.addEventListener("input", (e) => {
    if (e.target.matches(".nc-notes")) {
      const itemId = e.target.dataset.itemId;
      const item   = checklistItems.find((i) => i.id === itemId);
      if (item) {
        item.notes = e.target.value;
        triggerAutoSave();
      }
    }
  });

  // Submit
  document.getElementById("btn-submit-inspecao")?.addEventListener("click", _handleSubmit);

  // Summary modal
  document.getElementById("btn-confirmar-envio")?.addEventListener("click", _confirmarEnvio);
  document.getElementById("btn-cancelar-envio")?.addEventListener("click", _fecharModalResumo);

  // Draft recovery modal
  document.getElementById("btn-draft-restore")?.addEventListener("click", () => {
    const key = document.getElementById("modal-draft-recovery")?.dataset.draftKey;
    if (key) {
      const draft = loadDraft(key);
      if (draft) _restoreDraft(key, draft);
    }
    _closeDraftModal("modal-draft-recovery");
  });

  document.getElementById("btn-draft-discard")?.addEventListener("click", () => {
    const key = document.getElementById("modal-draft-recovery")?.dataset.draftKey;
    if (key) {
      deleteDraft(key);
      deletePhotos(key).catch(() => {});
    }
    _closeDraftModal("modal-draft-recovery");
    _proceedWithUrlVehicle();
  });

  // Draft list modal
  document.getElementById("btn-draft-list-close")?.addEventListener("click", () => {
    _closeDraftModal("modal-draft-list");
    _proceedWithUrlVehicle();
  });

  // Incognito warning
  if (!_storageAvailable) {
    _mostrarToast(
      "Modo privado detectado — rascunhos não serão preservados entre sessões.",
      "aviso"
    );
  }

  // Default date/time
  _setDefaultDateTime();
}

// ============================================================
// ONLINE / OFFLINE GUARD
// ============================================================

function _initOnlineGuard() {
  window.addEventListener("online",  () => {
    if (_draftKey) _setSaveStatus("saved");
  });
  window.addEventListener("offline", () => _setSaveStatus("offline"));

  // beforeunload — flush pending save, then warn if still dirty
  window.addEventListener("beforeunload", (e) => {
    if (_saveTimeout) {
      clearTimeout(_saveTimeout);
      _saveDraftNow(); // flush immediately on unload
    }
    if (_isDirty) {
      e.preventDefault();
      e.returnValue = ""; // standard cross-browser
    }
  });
}

// ============================================================
// AUTO-SAVE ENGINE
// ============================================================

/**
 * Schedules a debounced draft save. Call after ANY form mutation.
 * Debounce window: 400ms — balances write frequency vs. responsiveness.
 */
function triggerAutoSave() {
  if (_restoring) return;
  _isDirty = true;
  _setSaveStatus("saving");
  clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(_saveDraftNow, 400);
}

/**
 * Immediately writes the current form state to localStorage.
 * Called by triggerAutoSave() after debounce, and synchronously on beforeunload.
 */
function _saveDraftNow() {
  if (_restoring) return;

  const key  = veiculoSelecionado ? draftKey(veiculoSelecionado.placa) : TEMP_KEY;
  _draftKey  = key;

  const data = _collectDraftSnapshot();
  const ok   = saveDraft(key, data);

  if (ok) {
    _isDirty = false;
    if (navigator.onLine === false) {
      _setSaveStatus("offline");
    } else {
      _setSaveStatus("saved");
    }
  } else {
    _setSaveStatus("error");
    _mostrarToast(
      "Armazenamento local cheio — libere espaço no navegador para continuar salvando.",
      "aviso"
    );
  }
}

/**
 * Serialises the entire form state into a plain object for localStorage.
 */
function _collectDraftSnapshot() {
  const header      = _collectHeader();
  const maintenance = _collectMaintenance();

  // Checklist — only store answered items (reduces payload size)
  const checklistMap = {};
  checklistItems.forEach((item) => {
    if (item.status !== null || item.notes) {
      checklistMap[item.id] = { status: item.status, notes: item.notes };
    }
  });

  // Photo metadata — how many photos each item has (blobs live in IDB)
  const photoFlags = {};
  photoFiles.forEach((files, itemId) => {
    if (files.length > 0) photoFlags[itemId] = files.length;
  });

  const stats = checklistStats(checklistItems);

  return {
    vehicleId:       veiculoSelecionado?.id       || null,
    vehiclePlate:    veiculoSelecionado?.placa     || null,
    vehicleModel:    veiculoSelecionado?.modelo    || null,
    vehicleCategory: veiculoSelecionado?.categoria || null,
    advancedLighting: document.getElementById("toggle-advanced-lighting")?.checked || false,
    header,
    checklist: checklistMap,
    maintenance,
    finalization: {
      inspectorName:     document.getElementById("inspector-name")?.value?.trim()  || "",
      driverName:        document.getElementById("driver-name")?.value?.trim()     || "",
      generalNotes:      document.getElementById("general-notes")?.value?.trim()   || "",
      responsibilityTerm: document.getElementById("responsibility-term")?.checked  || false,
    },
    photoFlags,
    stats,
  };
}

// ============================================================
// SAVE STATUS PILL
// ============================================================

function _setSaveStatus(state) {
  const pill = document.getElementById("save-status-pill");
  const dot  = document.getElementById("save-status-dot");
  const text = document.getElementById("save-status-text");
  if (!pill) return;

  const now  = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const STATES = {
    saving:  { dot: "●", label: "Salvando...",               cls: "saving"  },
    saved:   { dot: "✔", label: `Salvo às ${time}`,          cls: "saved"   },
    offline: { dot: "⚠", label: "Offline — salvo localmente", cls: "offline" },
    error:   { dot: "✕", label: "Falha ao salvar rascunho",   cls: "error"   },
  };

  const s = STATES[state] || STATES.saving;
  pill.className      = `save-status-pill save-status--${s.cls}`;
  pill.hidden         = false;
  dot.textContent     = s.dot;
  text.textContent    = s.label;
}

// ============================================================
// DRAFT CHECK ON LOAD
// ============================================================

async function _checkForDraftsOnLoad() {
  if (!_storageAvailable) {
    _proceedWithUrlVehicle();
    return;
  }

  const drafts = listDrafts();
  if (!drafts.length) {
    _proceedWithUrlVehicle();
    return;
  }

  if (drafts.length === 1) {
    _showSingleDraftModal(drafts[0].key, drafts[0].draft);
  } else {
    _showDraftListModal(drafts);
  }
}

function _proceedWithUrlVehicle() {
  const vehicleId = new URLSearchParams(window.location.search).get("vehicleId");
  if (vehicleId) setTimeout(() => _selectVehicle(vehicleId), 50);
}

// ============================================================
// DRAFT RECOVERY MODALS
// ============================================================

function _showSingleDraftModal(key, draft) {
  const modal = document.getElementById("modal-draft-recovery");
  if (!modal) {
    // Fallback if HTML not updated yet
    _promptRecoveryFallback(key, draft);
    return;
  }

  modal.dataset.draftKey = key;

  const lastUpdated  = new Date(draft.lastUpdated);
  const timeStr      = lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dateStr      = lastUpdated.toLocaleDateString("pt-BR");
  const isToday      = lastUpdated.toDateString() === new Date().toDateString();
  const whenStr      = isToday ? `hoje às ${timeStr}` : `${dateStr} às ${timeStr}`;

  const pct          = draft.stats?.pct ?? 0;
  const plate        = draft.vehiclePlate || "Veículo desconhecido";
  const model        = draft.vehicleModel  || "";
  const inspType     = draft.header?.inspectionType === "departure" ? "Saída" : "Retorno";

  document.getElementById("draft-recovery-plate").textContent = plate;
  document.getElementById("draft-recovery-model").textContent = model;
  document.getElementById("draft-recovery-type").textContent  = inspType;
  document.getElementById("draft-recovery-when").textContent  = whenStr;
  document.getElementById("draft-recovery-pct").textContent   = `${pct}% concluído`;
  document.getElementById("draft-recovery-pct-bar").style.width = `${pct}%`;

  modal.classList.add("open");
}

function _showDraftListModal(drafts) {
  const modal = document.getElementById("modal-draft-list");
  if (!modal) {
    // Fallback: pick the most recent draft and show single modal
    _showSingleDraftModal(drafts[0].key, drafts[0].draft);
    return;
  }

  const listContainer = document.getElementById("draft-list-container");
  if (listContainer) {
    listContainer.innerHTML = drafts.map(({ key, draft }) => {
      const lastUpdated = new Date(draft.lastUpdated);
      const isToday     = lastUpdated.toDateString() === new Date().toDateString();
      const whenStr     = isToday
        ? `hoje às ${lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
        : lastUpdated.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const pct         = draft.stats?.pct ?? 0;
      const vehicle     = frotaDB.find((v) => v.id === draft.vehicleId);

      return `
        <div class="draft-list-item" data-draft-key="${key}">
          <span class="draft-list-icon">${vehicle?.icone || "🚛"}</span>
          <div class="draft-list-info">
            <strong>${draft.vehiclePlate || "Sem placa"}</strong>
            <small>${draft.vehicleModel || ""}</small>
            <small>${draft.header?.inspectionType === "departure" ? "Saída" : "Retorno"} — ${whenStr}</small>
          </div>
          <div class="draft-list-pct">
            <span>${pct}%</span>
            <div class="draft-list-pct-bar"><div style="width:${pct}%"></div></div>
          </div>
          <div class="draft-list-actions">
            <button class="btn-draft-restore-item" data-draft-key="${key}" type="button">↩ Restaurar</button>
            <button class="btn-draft-discard-item" data-draft-key="${key}" type="button">✕</button>
          </div>
        </div>`;
    }).join("");

    // Wire list item buttons
    listContainer.addEventListener("click", (e) => {
      const restoreBtn = e.target.closest(".btn-draft-restore-item");
      if (restoreBtn) {
        const k     = restoreBtn.dataset.draftKey;
        const found = drafts.find((d) => d.key === k);
        if (found) _restoreDraft(found.key, found.draft);
        _closeDraftModal("modal-draft-list");
        return;
      }
      const discardBtn = e.target.closest(".btn-draft-discard-item");
      if (discardBtn) {
        const k = discardBtn.dataset.draftKey;
        deleteDraft(k);
        deletePhotos(k).catch(() => {});
        discardBtn.closest(".draft-list-item")?.remove();
        if (!listContainer.querySelector(".draft-list-item")) {
          _closeDraftModal("modal-draft-list");
          _proceedWithUrlVehicle();
        }
      }
    });
  }

  modal.classList.add("open");
}

function _closeDraftModal(id) {
  document.getElementById(id)?.classList.remove("open");
}

/** Fallback when HTML elements haven't been added yet */
function _promptRecoveryFallback(key, draft) {
  const plate   = draft.vehiclePlate || "sem placa";
  const when    = new Date(draft.lastUpdated).toLocaleString("pt-BR");
  const restore = confirm(
    `Rascunho encontrado para ${plate} (salvo em ${when}).\n\nDeseja restaurar?`
  );
  if (restore) {
    _restoreDraft(key, draft);
  } else {
    deleteDraft(key);
    deletePhotos(key).catch(() => {});
    _proceedWithUrlVehicle();
  }
}

// ============================================================
// DRAFT RESTORE
// ============================================================

/**
 * Restores a full draft snapshot into the form.
 * Order matters: vehicle → checklist render → field population → photos.
 */
async function _restoreDraft(key, draft) {
  _restoring = true;

  try {
    // 1. Select vehicle (builds fresh checklist, sets _draftKey)
    if (draft.vehicleId) {
      _selectVehicle(draft.vehicleId, { suppressSave: true });
      await _tick(80); // wait for checklist DOM to render
    }

    // 2. Advanced lighting → rebuild checklist if needed
    const advLightEl = document.getElementById("toggle-advanced-lighting");
    if (advLightEl && draft.advancedLighting) {
      advLightEl.checked = true;
      _buildAndRenderChecklist(true /* preserve photos */);
      await _tick(20);
    }

    // 3. Header fields
    const h = draft.header || {};
    _setVal("inspection-type",     h.inspectionType);
    _setVal("inspection-location", h.inspectionLocation);
    _setVal("destination-city",    h.destinationCity);
    _setVal("mileage",             h.mileage);
    _setVal("inspection-date",     h.date);
    _setVal("inspection-time",     h.time);
    _setCheck("fueling-done",      h.fuelingDone);

    // 4. Checklist statuses + notes
    if (draft.checklist) {
      for (const [itemId, data] of Object.entries(draft.checklist)) {
        const item = checklistItems.find((i) => i.id === itemId);
        if (!item) continue;

        item.status = data.status || null;
        item.notes  = data.notes  || "";

        const row = document.getElementById(`item-row-${itemId}`);
        if (row) {
          row.dataset.status = item.status || "";
          row.querySelectorAll(".btn-status").forEach((b) => b.classList.remove("active"));
          if (item.status) {
            row.querySelector(`.btn-status[data-value="${item.status}"]`)?.classList.add("active");
          }
        }

        const ncPanel = document.getElementById(`nc-panel-${itemId}`);
        if (ncPanel) {
          if (item.status === "NC") {
            ncPanel.hidden = false;
            const notesEl = ncPanel.querySelector(".nc-notes");
            if (notesEl) notesEl.value = item.notes;
          } else {
            ncPanel.hidden = true;
          }
        }
      }
    }

    // Update all group counts
    const categories = [...new Set(checklistItems.map((i) => i.category))];
    categories.forEach(_updateGroupCount);
    _updateProgress();

    // 5. Maintenance fields
    const m = draft.maintenance || {};
    _setVal("oil-level",       m.oilLevel);
    _setVal("coolant-level",   m.coolantLevel);
    _setVal("brake-fluid",     m.brakeFluid);
    _setVal("tires-pressure",  m.tiresPressure);
    _setVal("maintenance-obs", m.observations);

    // 6. Finalization fields
    const f = draft.finalization || {};
    _setVal("inspector-name",    f.inspectorName);
    _setVal("driver-name",       f.driverName);
    _setVal("general-notes",     f.generalNotes);
    _setCheck("responsibility-term", f.responsibilityTerm);

    // 7. Photos — load blobs from IndexedDB
    const restoredPhotos = await loadPhotos(key);

    if (restoredPhotos.size > 0) {
      restoredPhotos.forEach((blobs, itemId) => {
        photoFiles.set(itemId, blobs);
        _renderPhotoPreviews(itemId, blobs);
      });
    }

    // 8. Photo flags — show warning for items that had photos but IDB returned nothing
    if (draft.photoFlags) {
      for (const [itemId, count] of Object.entries(draft.photoFlags)) {
        if (!restoredPhotos.has(itemId) && count > 0) {
          const previewRow = document.getElementById(`photos-${itemId}`);
          if (previewRow) {
            previewRow.innerHTML = `
              <div class="photo-restore-warning">
                ⚠ ${count} foto(s) não recuperada(s) — adicione novamente se necessário
              </div>`;
          }
        }
      }
    }

    // 9. Establish draft key for future saves
    _draftKey = key;
    _isDirty  = false;

    _setSaveStatus("saved");
    _mostrarToast("Rascunho restaurado.", "sucesso");

  } catch (err) {
    console.error("[DRAFT] Restore error:", err);
    _mostrarToast("Erro ao restaurar rascunho — formulário resetado.", "erro");
  } finally {
    _restoring = false;
  }
}

// ============================================================
// VEHICLE SEARCH & SELECTION
// ============================================================

function _filterVehicles(term) {
  const q = (term || "").toLowerCase().trim();
  const filtered = q
    ? frotaDB.filter(
        (v) =>
          v.placa.toLowerCase().includes(q) ||
          v.modelo.toLowerCase().includes(q) ||
          v.categoria.toLowerCase().includes(q)
      )
    : frotaDB;
  _renderVehicleList(filtered);
}

function _renderVehicleList(list) {
  const container = document.getElementById("vehicle-results");
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `<p class="veh-empty">Nenhum veículo encontrado.</p>`;
    return;
  }

  container.innerHTML = list
    .map(
      (v) => `
    <div class="veh-result-card ${veiculoSelecionado?.id === v.id ? "selected" : ""}"
         data-vehicle-id="${v.id}"
         role="button" tabindex="0">
      <span class="veh-icon">${v.icone}</span>
      <div class="veh-info">
        <strong>${v.placa}</strong>
        <small>${v.modelo} &mdash; ${v.categoria}</small>
      </div>
      ${v.motoristaPadrao ? `<span class="veh-driver">👷 ${v.motoristaPadrao}</span>` : ""}
    </div>`
    )
    .join("");
}

/**
 * @param {string}  vehicleId
 * @param {Object}  opts
 * @param {boolean} opts.suppressSave — pass true during draft restore to avoid a premature save
 */
function _selectVehicle(vehicleId, opts = {}) {
  const veiculo = frotaDB.find((v) => v.id === vehicleId);
  if (!veiculo) return;

  veiculoSelecionado = veiculo;
  _draftKey          = draftKey(veiculo.placa);   // establish key immediately
  photoFiles.clear();

  // Refresh list with selection highlight
  const searchVal = document.getElementById("vehicle-search")?.value || "";
  _filterVehicles(searchVal);
  _renderVehicleList(
    searchVal
      ? frotaDB.filter(
          (v) =>
            v.placa.toLowerCase().includes(searchVal.toLowerCase()) ||
            v.modelo.toLowerCase().includes(searchVal.toLowerCase())
        )
      : frotaDB
  );

  // Banner
  const banner = document.getElementById("selected-vehicle-banner");
  if (banner) {
    banner.innerHTML = `
      <span class="sel-icon">${veiculo.icone}</span>
      <div>
        <strong>${veiculo.placa}</strong>
        <small>${veiculo.modelo} &mdash; ${veiculo.categoria}</small>
      </div>
      <button class="btn-clear-vehicle" id="btn-clear-vehicle" title="Trocar veículo">✕</button>`;
    banner.hidden = false;
    document.getElementById("btn-clear-vehicle")?.addEventListener("click", _clearVehicle);
  }

  // Pre-fill driver name
  if (veiculo.motoristaPadrao) {
    const driverInput = document.getElementById("driver-name");
    if (driverInput && !driverInput.value) driverInput.value = veiculo.motoristaPadrao;
  }

  // Reveal form sections
  ["section-header", "section-checklist", "section-maintenance", "section-finalization"].forEach((id) => {
    document.getElementById(id)?.removeAttribute("hidden");
  });
  document.getElementById("btn-submit-inspecao")?.removeAttribute("hidden");

  _buildAndRenderChecklist();
  _scrollTo("section-header");

  if (!opts.suppressSave) triggerAutoSave();
}

function _clearVehicle() {
  // Flush current draft before clearing so the old vehicle's data is preserved
  if (_draftKey && veiculoSelecionado && !_restoring) {
    clearTimeout(_saveTimeout);
    _saveDraftNow();
  }

  veiculoSelecionado = null;
  checklistItems     = [];
  photoFiles.clear();
  _draftKey          = null;
  _isDirty           = false;

  document.getElementById("selected-vehicle-banner").hidden = true;
  ["section-header", "section-checklist", "section-maintenance", "section-finalization"].forEach((id) => {
    document.getElementById(id)?.setAttribute("hidden", "");
  });
  document.getElementById("btn-submit-inspecao")?.setAttribute("hidden", "");
  document.getElementById("checklist-container").innerHTML = "";

  const pill = document.getElementById("save-status-pill");
  if (pill) pill.hidden = true;

  _updateProgress();
}

// ============================================================
// CHECKLIST BUILD & RENDER
// ============================================================

/**
 * @param {boolean} preservePhotos — true during draft restore to keep photoFiles intact
 */
function _buildAndRenderChecklist(preservePhotos = false) {
  if (!veiculoSelecionado) return;

  const advancedLighting = document.getElementById("toggle-advanced-lighting")?.checked || false;
  const overrides        = advancedLighting ? { advanced_lighting: true } : {};

  checklistItems = buildChecklist(veiculoSelecionado, overrides);
  if (!preservePhotos) photoFiles.clear();

  const groups    = groupByCategory(checklistItems);
  const container = document.getElementById("checklist-container");
  if (!container) return;

  container.innerHTML = groups.map((group) => _renderGroup(group)).join("");
  _updateProgress();
}

function _renderGroup(group) {
  const items = group.items.map((item) => _renderItem(item)).join("");
  return `
    <div class="checklist-group" data-category="${group.key}">
      <div class="group-header section-toggle">
        <span class="group-icon">${group.meta.icon}</span>
        <h3 class="group-title">${group.meta.label}</h3>
        <span class="group-count" id="count-${group.key}">0 / ${group.items.length}</span>
        <span class="collapse-arrow">▾</span>
      </div>
      <div class="group-body">
        ${items}
      </div>
    </div>`;
}

function _renderItem(item) {
  const reqBadge = item.required
    ? `<span class="req-badge" title="Obrigatório">*</span>`
    : "";

  return `
    <div class="checklist-item" id="item-row-${item.id}" data-item-id="${item.id}" data-status="">
      <div class="item-main">
        <span class="item-label">${item.label}${reqBadge}</span>
        <div class="item-actions">
          <button class="btn-status btn-c"  data-item-id="${item.id}" data-value="C"  type="button">✓ C</button>
          <button class="btn-status btn-nc" data-item-id="${item.id}" data-value="NC" type="button">✕ NC</button>
        </div>
      </div>
      <div class="item-nc-panel" id="nc-panel-${item.id}" hidden>
        <label class="nc-notes-label">Observação:</label>
        <textarea class="nc-notes" data-item-id="${item.id}" rows="2" placeholder="Descreva a não conformidade..."></textarea>
        <label class="nc-photo-label">Fotos (opcional, máx. 5):</label>
        <input type="file" class="nc-photo-input" data-item-id="${item.id}" accept="image/*" multiple>
        <div class="photo-preview-row" id="photos-${item.id}"></div>
      </div>
    </div>`;
}

// ============================================================
// ITEM STATUS TOGGLE (delegated)
// ============================================================

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-status");
  if (!btn) return;
  _setItemStatus(btn.dataset.itemId, btn.dataset.value);
});

function _setItemStatus(itemId, status) {
  const item = checklistItems.find((i) => i.id === itemId);
  if (!item) return;

  const newStatus = item.status === status ? null : status;
  item.status     = newStatus;

  const row = document.getElementById(`item-row-${itemId}`);
  if (row) {
    row.dataset.status = newStatus || "";
    row.querySelectorAll(".btn-status").forEach((b) => b.classList.remove("active"));
    if (newStatus) row.querySelector(`.btn-status[data-value="${newStatus}"]`)?.classList.add("active");
  }

  const ncPanel = document.getElementById(`nc-panel-${itemId}`);
  if (ncPanel) {
    if (newStatus === "NC") {
      ncPanel.hidden = false;
    } else {
      ncPanel.hidden = true;
      item.notes     = "";
      item.photos    = [];
      photoFiles.delete(itemId);
      if (ncPanel.querySelector(".nc-notes")) ncPanel.querySelector(".nc-notes").value = "";
      const previewRow = document.getElementById(`photos-${itemId}`);
      if (previewRow) previewRow.innerHTML = "";
      // Remove photos from IDB
      if (_draftKey) deletePhotosForItem(_draftKey, itemId).catch(() => {});
    }
  }

  _updateProgress();
  _updateGroupCount(item.category);
  triggerAutoSave();
}

// ============================================================
// PROGRESS
// ============================================================

function _updateProgress() {
  const stats   = checklistStats(checklistItems);
  const bar     = document.getElementById("progress-bar-fill");
  const label   = document.getElementById("progress-label");
  const ncBadge = document.getElementById("progress-nc-badge");

  if (bar)    bar.style.width = `${stats.pct}%`;
  if (label)  label.textContent = checklistItems.length
    ? `${stats.answered} / ${stats.total} itens respondidos`
    : "Selecione um veículo para começar";
  if (ncBadge) {
    ncBadge.textContent = stats.ncCount > 0 ? `${stats.ncCount} NC` : "";
    ncBadge.hidden      = stats.ncCount === 0;
  }
}

function _updateGroupCount(categoryKey) {
  const groupItems = checklistItems.filter((i) => i.category === categoryKey);
  const answered   = groupItems.filter((i) => i.status !== null).length;
  const el         = document.getElementById(`count-${categoryKey}`);
  if (el) el.textContent = `${answered} / ${groupItems.length}`;
}

// ============================================================
// PHOTO HANDLING
// ============================================================

function _handlePhotoChange(input) {
  const itemId = input.dataset.itemId;
  if (!itemId) return;

  const files    = Array.from(input.files || []);
  if (!files.length) return;

  const existing = photoFiles.get(itemId) || [];
  const slots    = 5 - existing.length;        // max 5 total
  const toAdd    = files.slice(0, Math.max(0, slots));
  if (!toAdd.length) {
    _mostrarToast("Máximo de 5 fotos por item.", "aviso");
    input.value = "";
    return;
  }

  const combined = [...existing, ...toAdd];
  photoFiles.set(itemId, combined);
  _renderPhotoPreviews(itemId, combined);
  input.value = ""; // reset so same file can be re-added after removal

  // Persist blobs to IndexedDB (non-blocking)
  if (_draftKey) {
    toAdd.forEach((file, i) => {
      storePhoto(_draftKey, itemId, existing.length + i, file).catch(() => {});
    });
  }

  triggerAutoSave();
}

function _renderPhotoPreviews(itemId, files) {
  const container = document.getElementById(`photos-${itemId}`);
  if (!container) return;

  container.innerHTML = files
    .map(
      (file, idx) => `
    <div class="photo-thumb" id="thumb-${itemId}-${idx}">
      <img src="${URL.createObjectURL(file)}" alt="foto ${idx + 1}">
      <button class="photo-remove-btn" data-item-id="${itemId}" data-idx="${idx}" type="button" title="Remover">✕</button>
    </div>`
    )
    .join("");
}

async function _removePhoto(itemId, idx) {
  const files = photoFiles.get(itemId) || [];
  files.splice(idx, 1);

  if (files.length === 0) {
    photoFiles.delete(itemId);
  } else {
    photoFiles.set(itemId, files);
  }

  _renderPhotoPreviews(itemId, files);

  // Re-sync IDB: delete all for this item, re-store remaining
  if (_draftKey) {
    await deletePhotosForItem(_draftKey, itemId);
    files.forEach((blob, i) => {
      storePhoto(_draftKey, itemId, i, blob).catch(() => {});
    });
  }

  triggerAutoSave();
}

// ============================================================
// FORM DATA COLLECTORS
// ============================================================

function _collectHeader() {
  return {
    vehicleId:          veiculoSelecionado?.id       || "",
    vehiclePlate:       veiculoSelecionado?.placa     || "",
    vehicleModel:       veiculoSelecionado?.modelo    || "",
    vehicleCategory:    veiculoSelecionado?.categoria || "",
    inspectionType:     document.getElementById("inspection-type")?.value     || "departure",
    inspectionLocation: document.getElementById("inspection-location")?.value?.trim() || "",
    destinationCity:    document.getElementById("destination-city")?.value?.trim()    || "",
    date:               document.getElementById("inspection-date")?.value     || "",
    time:               document.getElementById("inspection-time")?.value     || "",
    mileage:            document.getElementById("mileage")?.value?.trim()     || "",
    fuelingDone:        document.getElementById("fueling-done")?.checked      || false,
  };
}

function _collectMaintenance() {
  return {
    oilLevel:      document.getElementById("oil-level")?.value        || "",
    coolantLevel:  document.getElementById("coolant-level")?.value    || "",
    brakeFluid:    document.getElementById("brake-fluid")?.value      || "",
    tiresPressure: document.getElementById("tires-pressure")?.value?.trim() || "",
    observations:  document.getElementById("maintenance-obs")?.value?.trim()  || "",
  };
}

// ============================================================
// VALIDATION
// ============================================================

function _validate() {
  const errors  = [];
  if (!veiculoSelecionado) errors.push("Selecione um veículo.");

  const header = _collectHeader();
  if (!header.inspectionLocation) errors.push("Informe o local de inspeção.");
  if (!header.date)    errors.push("Informe a data da inspeção.");
  if (!header.time)    errors.push("Informe o horário da inspeção.");
  if (!header.mileage) errors.push("Informe a quilometragem.");

  const unansweredRequired = checklistItems.filter((i) => i.required && i.status === null);
  if (unansweredRequired.length > 0) {
    errors.push(`${unansweredRequired.length} item(s) obrigatório(s) sem resposta.`);
  }

  if (!document.getElementById("inspector-name")?.value?.trim()) errors.push("Informe o nome do inspetor.");
  if (!document.getElementById("driver-name")?.value?.trim())    errors.push("Informe o nome do motorista/operador.");
  if (!document.getElementById("responsibility-term")?.checked)  errors.push("Aceite o termo de responsabilidade.");

  return errors;
}

// ============================================================
// SUBMIT FLOW
// ============================================================

function _handleSubmit() {
  if (_submitting) return;

  // Flush pending auto-save before validating
  if (_saveTimeout) {
    clearTimeout(_saveTimeout);
    _saveDraftNow();
  }

  const errors = _validate();
  if (errors.length > 0) {
    _mostrarToast(errors[0], "erro");
    if (errors.length > 1) {
      setTimeout(() => _mostrarToast(`+${errors.length - 1} outros erros a corrigir`, "aviso"), 700);
    }
    return;
  }

  _abrirModalResumo();
}

function _abrirModalResumo() {
  const stats  = checklistStats(checklistItems);
  const header = _collectHeader();

  const ncItems           = checklistItems.filter((i) => i.status === "NC");
  const criticalCategories = ["structure_safety_fluids", "mechanical_load", "lighting_signaling"];
  const criticalNc        = ncItems.filter((i) => criticalCategories.includes(i.category));

  const modal = document.getElementById("modal-resumo");
  if (!modal) return;

  document.getElementById("resumo-veiculo").textContent =
    `${header.vehiclePlate} — ${header.vehicleModel}`;
  document.getElementById("resumo-tipo").textContent =
    header.inspectionType === "departure" ? "Saída" : "Retorno";
  document.getElementById("resumo-total").textContent     = stats.total;
  document.getElementById("resumo-c").textContent         = stats.cCount;
  document.getElementById("resumo-nc").textContent        = stats.ncCount;
  document.getElementById("resumo-restantes").textContent = stats.remaining;

  const alertBox = document.getElementById("resumo-critica-alert");
  if (alertBox) {
    if (criticalNc.length > 0) {
      alertBox.hidden   = false;
      alertBox.innerHTML = `
        ⚠️ <strong>${criticalNc.length} NC crítico(s)</strong> — O.S de alta prioridade serão geradas:<br>
        <ul>${criticalNc.map((i) => `<li>${i.label}</li>`).join("")}</ul>`;
    } else {
      alertBox.hidden = true;
    }
  }

  const ncList = document.getElementById("resumo-nc-list");
  if (ncList) {
    ncList.innerHTML = ncItems.length
      ? ncItems.map((i) => `<li>${i.label}${i.notes ? ` — <em>${i.notes}</em>` : ""}</li>`).join("")
      : `<li style="color:#64748b">Nenhuma não conformidade registrada.</li>`;
  }

  modal.classList.add("open");
}

function _fecharModalResumo() {
  document.getElementById("modal-resumo")?.classList.remove("open");
}

async function _confirmarEnvio() {
  if (_submitting) return;
  _submitting = true;

  const confirmBtn = document.getElementById("btn-confirmar-envio");
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "Enviando..."; }

  try {
    const header      = _collectHeader();
    const maintenance = _collectMaintenance();

    const inspection = {
      header,
      checklist:   checklistItems,
      maintenance,
      notes:       document.getElementById("general-notes")?.value?.trim()    || "",
      inspector:   { name: document.getElementById("inspector-name")?.value?.trim() || "" },
      driver:      { name: document.getElementById("driver-name")?.value?.trim()    || "" },
      responsibilityTermAccepted: document.getElementById("responsibility-term")?.checked || false,
    };

    const docId = await salvarInspecao(inspection, photoFiles, perfil);

    // ── SUCCESS: clear draft AFTER confirmed server write ──
    const savedKey = _draftKey;
    _fecharModalResumo();
    _mostrarToast("Inspeção enviada com sucesso!", "sucesso");
    _isDirty = false;

    if (savedKey) {
      deleteDraft(savedKey);
      deletePhotos(savedKey).catch(() => {});
    }

    const pill = document.getElementById("save-status-pill");
    if (pill) pill.hidden = true;

    // Redirect to vehicle history using vehicleId (not inspectionId)
    // historico-frota.html reads ?id= as the vehicleId param
    const redirectVehicleId = veiculoSelecionado?.id || "";
    setTimeout(() => {
      window.location.href = `../frota/historico-frota.html?id=${encodeURIComponent(redirectVehicleId)}`;
    }, 2000);

  } catch (err) {
    console.error("[INSPECAO] Erro ao salvar:", err);
    // Draft is intentionally NOT deleted — user data is safe
    _mostrarToast(
      navigator.onLine
        ? "Erro ao enviar. Rascunho preservado — tente novamente."
        : "Sem conexão. Rascunho salvo localmente — tente quando voltar online.",
      "erro"
    );
    _submitting = false;
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = "Confirmar Envio"; }
  }
}

// ============================================================
// TOAST
// ============================================================

function _mostrarToast(msg, tipo = "info") {
  const cores = { sucesso: "#16a34a", erro: "#dc2626", aviso: "#d97706", info: "#2563eb" };
  const cor   = cores[tipo] || cores.info;

  const toast     = document.createElement("div");
  toast.className = "insp-toast";
  toast.style.cssText = `background:${cor};`;
  toast.textContent   = msg;

  const container = document.getElementById("toast-container");
  if (container) {
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
  }
}

// ============================================================
// HELPERS
// ============================================================

function _setDefaultDateTime() {
  const now = new Date();
  const dateEl = document.getElementById("inspection-date");
  const timeEl = document.getElementById("inspection-time");
  if (dateEl && !dateEl.value) dateEl.value = now.toISOString().split("T")[0];
  if (timeEl && !timeEl.value) timeEl.value = now.toTimeString().slice(0, 5);
}

function _setVal(id, value) {
  const el = document.getElementById(id);
  if (!el || value === undefined || value === null || value === "") return;
  el.value = value;
}

function _setCheck(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = !!value;
}

function _scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function _tick(ms = 0) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * app-inspecao-maquina.js — Machinery Inspection Form Controller
 *
 * Orchestrates:
 *  - Machine selection from maquinasDB
 *  - Dynamic 7-section checklist (OK / Attention / Critical per item)
 *  - Photo REQUIRED for any non-OK item
 *  - Operational metrics section (vibration, temperature, amperage)
 *  - Final diagnosis & recommendation fields
 *  - Auto-save draft system (localStorage + IndexedDB photos)
 *  - Before-unload navigation guard
 *  - Pre-submit summary with auto WO warning
 *  - Submission to db-maquinas.js → Firestore
 */

import { checkAuth, getCurrentUser } from "../core/db-auth.js";
import { maquinasDB } from "../data/maquinas-db.js";
import {
  buildInspectionChecklist,
  groupBySection,
  inspectionStats,
  calculateInspectionStatus,
  shouldTriggerWorkOrder,
  itemsMissingPhoto,
  SECTION_META,
} from "../data/inspection-engine-maquinas.js";
import { salvarInspecaoMaquina } from "../core/db-maquinas.js";
import {
  MAQ_DRAFT_PREFIX,
  maqDraftKey,
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
// MODULE STATE — all at top level to prevent TDZ
// ============================================================

let perfil              = null;
let maquinaSelecionada  = null;
let inspectionItems     = [];           // flat array from engine
let photoFiles          = new Map();    // Map<itemId, File[]|Blob[]>

let _draftKey           = null;
let _saveTimeout        = null;
let _isDirty            = false;
let _submitting         = false;
let _restoring          = false;
let _storageAvailable   = true;

// ============================================================
// ENTRY POINT
// ============================================================

await checkAuth("inspecao-maquina");
perfil = await getCurrentUser();

_storageAvailable = isStorageAvailable();
pruneOldDrafts(MAQ_DRAFT_PREFIX);
_initUI();
_initGuards();
await _checkForDraftsOnLoad();

// ============================================================
// UI INIT
// ============================================================

function _initUI() {
  const topbarUser = document.getElementById("topbar-user");
  if (topbarUser && perfil?.nome) topbarUser.textContent = perfil.nome;

  // Machine search & selection
  const searchInput = document.getElementById("machine-search");
  const searchBtn   = document.getElementById("btn-search-machine");
  const resultsList = document.getElementById("machine-results");

  if (searchInput) {
    searchInput.addEventListener("input",   () => _filterMachines(searchInput.value));
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); _filterMachines(searchInput.value); }
    });
  }
  if (searchBtn) searchBtn.addEventListener("click", () => _filterMachines(searchInput?.value || ""));

  if (resultsList) {
    resultsList.addEventListener("click", (e) => {
      const card = e.target.closest("[data-machine-id]");
      if (card) _selectMachine(card.dataset.machineId);
    });
  }

  _renderMachineList(maquinasDB);

  // Section collapsible toggles
  document.addEventListener("click", (e) => {
    const toggle = e.target.closest(".section-toggle");
    if (toggle) {
      const section = toggle.closest(".insp-section, .insp-group");
      if (section) section.classList.toggle("collapsed");
    }
  });

  // Checklist container — item severity buttons (delegated)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-sev");
    if (btn) _setItemSeverity(btn.dataset.itemId, btn.dataset.value);
  });

  // NC notes (delegated)
  document.addEventListener("input", (e) => {
    if (e.target.matches(".item-notes")) {
      const item = inspectionItems.find((i) => i.id === e.target.dataset.itemId);
      if (item) { item.notes = e.target.value; triggerAutoSave(); }
    }
    // Metrics inputs
    if (e.target.closest("#section-metrics")) triggerAutoSave();
    // Diagnosis fields
    if (e.target.closest("#section-diagnosis")) triggerAutoSave();
  });

  document.addEventListener("change", (e) => {
    // Photo uploads
    if (e.target.matches(".item-photo-input")) _handlePhotoChange(e.target);
    // Finalization checkboxes / selects
    if (e.target.closest("#section-finalization")) triggerAutoSave();
    if (e.target.closest("#section-metrics")) triggerAutoSave();
  });

  // Photo remove buttons (delegated)
  document.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".photo-remove-btn");
    if (removeBtn) _removePhoto(removeBtn.dataset.itemId, parseInt(removeBtn.dataset.idx, 10));
  });

  // Submit
  document.getElementById("btn-submit-inspecao")?.addEventListener("click", _handleSubmit);
  document.getElementById("btn-confirmar-envio")?.addEventListener("click", _confirmarEnvio);
  document.getElementById("btn-cancelar-envio")?.addEventListener("click", _fecharModalResumo);

  // Draft modals
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
    if (key) { deleteDraft(key); deletePhotos(key).catch(() => {}); }
    _closeDraftModal("modal-draft-recovery");
    _proceedWithUrlMachine();
  });
  document.getElementById("btn-draft-list-close")?.addEventListener("click", () => {
    _closeDraftModal("modal-draft-list");
    _proceedWithUrlMachine();
  });

  if (!_storageAvailable) {
    _mostrarToast("Modo privado — rascunhos não serão preservados entre sessões.", "aviso");
  }

  _setDefaultDateTime();
}

// ============================================================
// GUARDS
// ============================================================

function _initGuards() {
  window.addEventListener("online",  () => { if (_draftKey) _setSaveStatus("saved"); });
  window.addEventListener("offline", () => _setSaveStatus("offline"));

  window.addEventListener("beforeunload", (e) => {
    if (_saveTimeout) { clearTimeout(_saveTimeout); _saveDraftNow(); }
    if (_isDirty) { e.preventDefault(); e.returnValue = ""; }
  });
}

// ============================================================
// AUTO-SAVE ENGINE
// ============================================================

function triggerAutoSave() {
  if (_restoring) return;
  _isDirty = true;
  _setSaveStatus("saving");
  clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(_saveDraftNow, 400);
}

function _saveDraftNow() {
  if (_restoring) return;
  const key = maquinaSelecionada ? maqDraftKey(maquinaSelecionada.id) : `${MAQ_DRAFT_PREFIX}temp`;
  _draftKey  = key;

  const ok = saveDraft(key, _collectDraftSnapshot());
  if (ok) {
    _isDirty = false;
    _setSaveStatus(navigator.onLine === false ? "offline" : "saved");
  } else {
    _setSaveStatus("error");
    _mostrarToast("Armazenamento local cheio — rascunho não pôde ser salvo.", "aviso");
  }
}

function _collectDraftSnapshot() {
  const itemMap = {};
  inspectionItems.forEach((item) => {
    if (item.severity !== null || item.notes) {
      itemMap[item.id] = { severity: item.severity, notes: item.notes };
    }
  });

  const photoFlags = {};
  photoFiles.forEach((files, itemId) => { if (files.length > 0) photoFlags[itemId] = files.length; });

  return {
    machineId:          maquinaSelecionada?.id    || null,
    machineName:        maquinaSelecionada?.nome   || null,
    machineType:        maquinaSelecionada?.tipo   || null,
    items:              itemMap,
    metrics:            _collectMetrics(),
    finalization:       _collectFinalization(),
    diagnosis:          document.getElementById("diagnosis-text")?.value?.trim()       || "",
    recommendation:     document.getElementById("recommendation-text")?.value?.trim()  || "",
    nextInspectionDate: document.getElementById("next-inspection-date")?.value || "",
    stats:              inspectionStats(inspectionItems),
    photoFlags,
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
  const time = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  const STATES = {
    saving:  { dot: "●", label: "Salvando...",               cls: "saving"  },
    saved:   { dot: "✔", label: `Salvo às ${time}`,          cls: "saved"   },
    offline: { dot: "⚠", label: "Offline — salvo localmente", cls: "offline" },
    error:   { dot: "✕", label: "Falha ao salvar rascunho",   cls: "error"   },
  };
  const s = STATES[state] || STATES.saving;
  pill.className   = `save-status-pill save-status--${s.cls}`;
  pill.hidden      = false;
  dot.textContent  = s.dot;
  text.textContent = s.label;
}

// ============================================================
// DRAFT CHECK ON LOAD
// ============================================================

async function _checkForDraftsOnLoad() {
  if (!_storageAvailable) { _proceedWithUrlMachine(); return; }
  const drafts = listDrafts(MAQ_DRAFT_PREFIX);
  if (!drafts.length) { _proceedWithUrlMachine(); return; }

  if (drafts.length === 1) {
    _showSingleDraftModal(drafts[0].key, drafts[0].draft);
  } else {
    _showDraftListModal(drafts);
  }
}

function _proceedWithUrlMachine() {
  const machineId = new URLSearchParams(window.location.search).get("machineId");
  if (machineId) setTimeout(() => _selectMachine(machineId), 50);
}

function _showSingleDraftModal(key, draft) {
  const modal = document.getElementById("modal-draft-recovery");
  if (!modal) { _promptRecoveryFallback(key, draft); return; }

  modal.dataset.draftKey = key;
  const lu = new Date(draft.lastUpdated || Date.now());
  const isToday = lu.toDateString() === new Date().toDateString();
  const whenStr = isToday
    ? `hoje às ${lu.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}`
    : lu.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });

  const pct = draft.stats?.pct ?? 0;
  document.getElementById("draft-recovery-machine").textContent  = draft.machineName  || "—";
  document.getElementById("draft-recovery-type").textContent     = draft.machineType   || "—";
  document.getElementById("draft-recovery-when").textContent     = whenStr;
  document.getElementById("draft-recovery-pct").textContent      = `${pct}% concluído`;
  document.getElementById("draft-recovery-pct-bar").style.width  = `${pct}%`;
  modal.classList.add("open");
}

function _showDraftListModal(drafts) {
  const modal     = document.getElementById("modal-draft-list");
  const container = document.getElementById("draft-list-container");
  if (!modal || !container) { _showSingleDraftModal(drafts[0].key, drafts[0].draft); return; }

  container.innerHTML = drafts.map(({ key, draft }) => {
    const lu      = new Date(draft.lastUpdated || 0);
    const isToday = lu.toDateString() === new Date().toDateString();
    const when    = isToday
      ? `hoje às ${lu.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}`
      : lu.toLocaleDateString("pt-BR");
    const pct    = draft.stats?.pct ?? 0;
    const maq    = maquinasDB.find((m) => m.id === draft.machineId);

    return `
      <div class="draft-list-item" data-draft-key="${key}">
        <span class="draft-list-icon">${maq?.icone || "⚙️"}</span>
        <div class="draft-list-info">
          <strong>${draft.machineName || "—"}</strong>
          <small>${draft.machineType || ""} — ${when}</small>
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

  container.addEventListener("click", (e) => {
    const rb = e.target.closest(".btn-draft-restore-item");
    if (rb) {
      const k = rb.dataset.draftKey;
      const f = drafts.find((d) => d.key === k);
      if (f) _restoreDraft(f.key, f.draft);
      _closeDraftModal("modal-draft-list");
      return;
    }
    const db_ = e.target.closest(".btn-draft-discard-item");
    if (db_) {
      const k = db_.dataset.draftKey;
      deleteDraft(k); deletePhotos(k).catch(() => {});
      db_.closest(".draft-list-item")?.remove();
      if (!container.querySelector(".draft-list-item")) {
        _closeDraftModal("modal-draft-list"); _proceedWithUrlMachine();
      }
    }
  });

  modal.classList.add("open");
}

function _closeDraftModal(id) {
  document.getElementById(id)?.classList.remove("open");
}

function _promptRecoveryFallback(key, draft) {
  const when    = new Date(draft.lastUpdated).toLocaleString("pt-BR");
  const restore = confirm(`Rascunho encontrado para ${draft.machineName || "máquina"} (${when}).\n\nDeseja restaurar?`);
  if (restore) { _restoreDraft(key, draft); }
  else { deleteDraft(key); deletePhotos(key).catch(() => {}); _proceedWithUrlMachine(); }
}

// ============================================================
// DRAFT RESTORE
// ============================================================

async function _restoreDraft(key, draft) {
  _restoring = true;
  try {
    if (draft.machineId) {
      _selectMachine(draft.machineId, { suppressSave: true });
      await _tick(80);
    }

    // Restore item severities + notes
    if (draft.items) {
      for (const [itemId, data] of Object.entries(draft.items)) {
        const item = inspectionItems.find((i) => i.id === itemId);
        if (!item) continue;
        item.severity = data.severity || null;
        item.notes    = data.notes    || "";
        _applyItemSeverityToDOM(item);
      }
    }

    const cats = [...new Set(inspectionItems.map((i) => i.section))];
    cats.forEach(_updateSectionCount);
    _updateProgress();

    // Restore metrics
    const m = draft.metrics || {};
    _setVal("metric-vibration",    m.vibration);
    _setVal("metric-temperature",  m.temperature);
    _setVal("metric-noise",        m.noise);
    _setVal("metric-amperage",     m.amperage);
    _setVal("metric-production",   m.production);

    // Restore finalization
    const f = draft.finalization || {};
    _setVal("inspector-name",      f.inspectorName);
    _setVal("technician-name",     f.technicianName);
    _setVal("inspection-date",     f.date);
    _setVal("inspection-time",     f.time);
    _setVal("inspection-shift",    f.shift);

    // Restore diagnosis
    _setVal("diagnosis-text",       draft.diagnosis);
    _setVal("recommendation-text",  draft.recommendation);
    _setVal("next-inspection-date", draft.nextInspectionDate);

    // Restore photos from IndexedDB
    const restored = await loadPhotos(key);
    restored.forEach((blobs, itemId) => {
      photoFiles.set(itemId, blobs);
      _renderPhotoPreviews(itemId, blobs);
    });

    // Photo-flag warnings for lost photos
    if (draft.photoFlags) {
      for (const [itemId, count] of Object.entries(draft.photoFlags)) {
        if (!restored.has(itemId) && count > 0) {
          const row = document.getElementById(`photos-${itemId}`);
          if (row) row.innerHTML = `<div class="photo-restore-warn">⚠ ${count} foto(s) não recuperada(s)</div>`;
        }
      }
    }

    _draftKey = key;
    _isDirty  = false;
    _setSaveStatus("saved");
    _mostrarToast("Rascunho restaurado.", "sucesso");
  } catch (err) {
    console.error("[MAQ DRAFT] Restore error:", err);
    _mostrarToast("Erro ao restaurar rascunho.", "erro");
  } finally {
    _restoring = false;
  }
}

// ============================================================
// MACHINE SEARCH & SELECTION
// ============================================================

function _filterMachines(term) {
  const q = (term || "").toLowerCase().trim();
  const filtered = q
    ? maquinasDB.filter(
        (m) =>
          m.nome.toLowerCase().includes(q) ||
          m.tipo.toLowerCase().includes(q) ||
          m.setor.toLowerCase().includes(q) ||
          (m.fabricante || "").toLowerCase().includes(q)
      )
    : maquinasDB;
  _renderMachineList(filtered);
}

function _renderMachineList(list) {
  const container = document.getElementById("machine-results");
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `<p class="maq-empty">Nenhuma máquina encontrada.</p>`;
    return;
  }

  // Group by setor
  const bySetor = {};
  for (const m of list) {
    if (!bySetor[m.setor]) bySetor[m.setor] = [];
    bySetor[m.setor].push(m);
  }

  container.innerHTML = Object.entries(bySetor).map(([setor, machines]) => `
    <div class="maq-setor-group">
      <div class="maq-setor-label">${setor}</div>
      ${machines.map((m) => `
        <div class="maq-result-card ${maquinaSelecionada?.id === m.id ? "selected" : ""}"
             data-machine-id="${m.id}" role="button" tabindex="0">
          <span class="maq-icon">${m.icone}</span>
          <div class="maq-info">
            <strong>${m.nome}</strong>
            <small>${m.fabricante || ""} ${m.modelo || ""} · ${m.potenciaKw || "?"}kW</small>
          </div>
        </div>`).join("")}
    </div>`).join("");
}

function _selectMachine(machineId, opts = {}) {
  const maquina = maquinasDB.find((m) => m.id === machineId);
  if (!maquina) return;

  maquinaSelecionada = maquina;
  _draftKey          = maqDraftKey(maquina.id);
  photoFiles.clear();

  _filterMachines(document.getElementById("machine-search")?.value || "");

  // Banner
  const banner = document.getElementById("selected-machine-banner");
  if (banner) {
    banner.innerHTML = `
      <span class="sel-icon">${maquina.icone}</span>
      <div>
        <strong>${maquina.nome}</strong>
        <small>${maquina.setor} · ${maquina.fabricante || ""} ${maquina.modelo || ""}</small>
      </div>
      <button class="btn-clear-machine" id="btn-clear-machine" title="Trocar máquina">✕</button>`;
    banner.hidden = false;
    document.getElementById("btn-clear-machine")?.addEventListener("click", _clearMachine);
  }

  // Reveal sections
  ["section-identification", "section-checklist", "section-metrics", "section-diagnosis", "section-finalization"].forEach((id) => {
    document.getElementById(id)?.removeAttribute("hidden");
  });
  document.getElementById("btn-submit-inspecao")?.removeAttribute("hidden");

  _buildAndRenderChecklist();
  _scrollTo("section-identification");
  if (!opts.suppressSave) triggerAutoSave();
}

function _clearMachine() {
  if (_draftKey && maquinaSelecionada && !_restoring) {
    clearTimeout(_saveTimeout); _saveDraftNow();
  }
  maquinaSelecionada = null;
  inspectionItems    = [];
  photoFiles.clear();
  _draftKey          = null;
  _isDirty           = false;

  document.getElementById("selected-machine-banner").hidden = true;
  ["section-identification","section-checklist","section-metrics","section-diagnosis","section-finalization"].forEach((id) => {
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

function _buildAndRenderChecklist(preservePhotos = false) {
  if (!maquinaSelecionada) return;
  inspectionItems = buildInspectionChecklist(maquinaSelecionada);
  if (!preservePhotos) photoFiles.clear();

  const groups    = groupBySection(inspectionItems);
  const container = document.getElementById("checklist-container");
  if (!container) return;

  container.innerHTML = groups.map((g) => _renderSectionGroup(g)).join("");
  _updateProgress();
}

function _renderSectionGroup(group) {
  const items = group.items.map((item) => _renderItem(item)).join("");
  return `
    <div class="insp-group" data-section="${group.key}">
      <div class="group-header section-toggle">
        <span class="group-icon">${group.meta.icon}</span>
        <h3 class="group-title">${group.meta.label}</h3>
        <div class="group-header-right">
          <span class="group-status-badge" id="badge-${group.key}"></span>
          <span class="group-count" id="count-${group.key}">0 / ${group.items.length}</span>
          <span class="collapse-arrow">▾</span>
        </div>
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
    <div class="insp-item" id="item-row-${item.id}" data-item-id="${item.id}" data-severity="">
      <div class="item-main">
        <span class="item-label">${item.label}${reqBadge}</span>
        <div class="item-sev-actions">
          <button class="btn-sev btn-ok"   data-item-id="${item.id}" data-value="ok"        type="button">✓ OK</button>
          <button class="btn-sev btn-att"  data-item-id="${item.id}" data-value="attention" type="button">⚠ Atenção</button>
          <button class="btn-sev btn-crit" data-item-id="${item.id}" data-value="critical"  type="button">✕ Crítico</button>
        </div>
      </div>
      <div class="item-issue-panel" id="issue-panel-${item.id}" hidden>
        <div class="issue-photo-required-badge" id="photo-req-${item.id}">
          📷 Foto obrigatória para esta ocorrência
        </div>
        <label class="issue-notes-label">Descrição da ocorrência:</label>
        <textarea class="item-notes" data-item-id="${item.id}" rows="2"
                  placeholder="Descreva o problema, localização, dimensão estimada..."></textarea>
        <label class="issue-photo-label">Fotos (obrigatório, máx. 5):</label>
        <input type="file" class="item-photo-input" data-item-id="${item.id}" accept="image/*" multiple>
        <div class="photo-preview-row" id="photos-${item.id}"></div>
      </div>
    </div>`;
}

// ============================================================
// ITEM SEVERITY LOGIC
// ============================================================

function _setItemSeverity(itemId, severity) {
  const item = inspectionItems.find((i) => i.id === itemId);
  if (!item) return;

  const newSeverity = item.severity === severity ? null : severity;
  item.severity = newSeverity;

  _applyItemSeverityToDOM(item);
  _updateProgress();
  _updateSectionCount(item.section);
  triggerAutoSave();
}

function _applyItemSeverityToDOM(item) {
  const row = document.getElementById(`item-row-${item.id}`);
  if (row) {
    row.dataset.severity = item.severity || "";
    row.querySelectorAll(".btn-sev").forEach((b) => b.classList.remove("active"));
    if (item.severity) {
      row.querySelector(`.btn-sev[data-value="${item.severity}"]`)?.classList.add("active");
    }
  }

  const issuePanel = document.getElementById(`issue-panel-${item.id}`);
  if (issuePanel) {
    const showPanel = item.severity === "attention" || item.severity === "critical";
    issuePanel.hidden = !showPanel;

    if (!showPanel) {
      // Clear NC data when reverting to OK or null
      item.notes = "";
      item.photos = [];
      photoFiles.delete(item.id);
      const notesEl = issuePanel.querySelector(".item-notes");
      if (notesEl) notesEl.value = "";
      const previewRow = document.getElementById(`photos-${item.id}`);
      if (previewRow) previewRow.innerHTML = "";
      if (_draftKey) deletePhotosForItem(_draftKey, item.id).catch(() => {});
    }
  }
}

// ============================================================
// PROGRESS
// ============================================================

function _updateProgress() {
  const stats    = inspectionStats(inspectionItems);
  const bar      = document.getElementById("progress-bar-fill");
  const label    = document.getElementById("progress-label");
  const badges   = {
    ok:        document.getElementById("progress-ok-badge"),
    attention: document.getElementById("progress-att-badge"),
    critical:  document.getElementById("progress-crit-badge"),
  };

  if (bar)   bar.style.width = `${stats.pct}%`;
  if (label) label.textContent = inspectionItems.length
    ? `${stats.answered} / ${stats.total} itens avaliados`
    : "Selecione uma máquina para começar";

  if (badges.ok)       { badges.ok.textContent = stats.okCount;   badges.ok.hidden   = !stats.okCount; }
  if (badges.attention){ badges.attention.textContent = `${stats.attCount} ⚠`; badges.attention.hidden = !stats.attCount; }
  if (badges.critical) { badges.critical.textContent = `${stats.critCount} ✕`; badges.critical.hidden  = !stats.critCount; }

  // Color progress bar based on worst severity
  if (bar) {
    bar.className = "progress-fill";
    if (stats.critCount > 0)      bar.classList.add("pf-critical");
    else if (stats.attCount > 0)  bar.classList.add("pf-attention");
    else                          bar.classList.add("pf-ok");
  }
}

function _updateSectionCount(sectionKey) {
  const sectionItems = inspectionItems.filter((i) => i.section === sectionKey);
  const answered     = sectionItems.filter((i) => i.severity !== null).length;
  const critCount    = sectionItems.filter((i) => i.severity === "critical").length;
  const attCount     = sectionItems.filter((i) => i.severity === "attention").length;

  const countEl = document.getElementById(`count-${sectionKey}`);
  if (countEl) countEl.textContent = `${answered} / ${sectionItems.length}`;

  const badgeEl = document.getElementById(`badge-${sectionKey}`);
  if (badgeEl) {
    if (critCount > 0)     { badgeEl.textContent = `${critCount} CRÍTICO`;  badgeEl.className = "group-status-badge badge-critical"; }
    else if (attCount > 0) { badgeEl.textContent = `${attCount} ATENÇÃO`;   badgeEl.className = "group-status-badge badge-attention"; }
    else if (answered === sectionItems.length && sectionItems.length > 0) {
                             badgeEl.textContent = "✓ OK"; badgeEl.className = "group-status-badge badge-ok"; }
    else                   { badgeEl.textContent = ""; }
  }
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
  const slots    = 5 - existing.length;
  const toAdd    = files.slice(0, Math.max(0, slots));
  if (!toAdd.length) { _mostrarToast("Máximo de 5 fotos por item.", "aviso"); input.value = ""; return; }

  const combined = [...existing, ...toAdd];
  photoFiles.set(itemId, combined);
  _renderPhotoPreviews(itemId, combined);
  input.value = "";

  if (_draftKey) {
    toAdd.forEach((f, i) => storePhoto(_draftKey, itemId, existing.length + i, f).catch(() => {}));
  }
  triggerAutoSave();
}

function _renderPhotoPreviews(itemId, files) {
  const container = document.getElementById(`photos-${itemId}`);
  if (!container) return;
  container.innerHTML = files.map((file, idx) => `
    <div class="photo-thumb" id="thumb-${itemId}-${idx}">
      <img src="${URL.createObjectURL(file)}" alt="foto ${idx + 1}">
      <button class="photo-remove-btn" data-item-id="${itemId}" data-idx="${idx}" type="button" title="Remover">✕</button>
    </div>`).join("");
}

async function _removePhoto(itemId, idx) {
  const files = photoFiles.get(itemId) || [];
  files.splice(idx, 1);
  if (files.length === 0) { photoFiles.delete(itemId); } else { photoFiles.set(itemId, files); }
  _renderPhotoPreviews(itemId, files);
  if (_draftKey) {
    await deletePhotosForItem(_draftKey, itemId);
    files.forEach((b, i) => storePhoto(_draftKey, itemId, i, b).catch(() => {}));
  }
  triggerAutoSave();
}

// ============================================================
// FORM DATA COLLECTORS
// ============================================================

function _collectMetrics() {
  return {
    vibration:   document.getElementById("metric-vibration")?.value?.trim()  || "",
    temperature: document.getElementById("metric-temperature")?.value?.trim() || "",
    noise:       document.getElementById("metric-noise")?.value?.trim()       || "",
    amperage:    document.getElementById("metric-amperage")?.value?.trim()    || "",
    production:  document.getElementById("metric-production")?.value?.trim()  || "",
  };
}

function _collectFinalization() {
  return {
    inspectorName:  document.getElementById("inspector-name")?.value?.trim()  || "",
    technicianName: document.getElementById("technician-name")?.value?.trim() || "",
    date:           document.getElementById("inspection-date")?.value         || "",
    time:           document.getElementById("inspection-time")?.value         || "",
    shift:          document.getElementById("inspection-shift")?.value        || "",
  };
}

// ============================================================
// VALIDATION
// ============================================================

function _validate() {
  const errors = [];
  if (!maquinaSelecionada) { errors.push("Selecione uma máquina."); return errors; }

  const fin = _collectFinalization();
  if (!fin.inspectorName) errors.push("Informe o nome do inspetor.");
  if (!fin.date)          errors.push("Informe a data da inspeção.");
  if (!fin.time)          errors.push("Informe o horário da inspeção.");

  // Required items must be answered
  const unansweredRequired = inspectionItems.filter((i) => i.required && i.severity === null);
  if (unansweredRequired.length > 0) {
    errors.push(`${unansweredRequired.length} item(s) obrigatório(s) sem avaliação.`);
  }

  // Photo required for non-OK items
  const missingPhotos = itemsMissingPhoto(inspectionItems);
  if (missingPhotos.length > 0) {
    errors.push(`${missingPhotos.length} ocorrência(s) sem foto obrigatória.`);
  }

  if (!document.getElementById("responsibility-term")?.checked) {
    errors.push("Assine o termo de responsabilidade.");
  }

  return errors;
}

// ============================================================
// SUBMIT FLOW
// ============================================================

function _handleSubmit() {
  if (_submitting) return;
  if (_saveTimeout) { clearTimeout(_saveTimeout); _saveDraftNow(); }

  const errors = _validate();
  if (errors.length > 0) {
    _mostrarToast(errors[0], "erro");
    if (errors.length > 1) setTimeout(() => _mostrarToast(`+${errors.length - 1} outros erros`, "aviso"), 700);
    return;
  }
  _abrirModalResumo();
}

function _abrirModalResumo() {
  const stats    = inspectionStats(inspectionItems);
  const status   = calculateInspectionStatus(inspectionItems);
  const needsWO  = shouldTriggerWorkOrder(inspectionItems);

  const modal = document.getElementById("modal-resumo");
  if (!modal) return;

  document.getElementById("resumo-maquina").textContent  = maquinaSelecionada?.nome || "—";
  document.getElementById("resumo-status").textContent   = { CRITICAL:"CRÍTICO", ATTENTION:"ATENÇÃO", OK:"OK", PENDING:"PENDENTE" }[status] || status;
  document.getElementById("resumo-status").className     = `resumo-status-badge status-${status.toLowerCase()}`;
  document.getElementById("resumo-total").textContent    = stats.total;
  document.getElementById("resumo-ok").textContent       = stats.okCount;
  document.getElementById("resumo-att").textContent      = stats.attCount;
  document.getElementById("resumo-crit").textContent     = stats.critCount;
  document.getElementById("resumo-pending").textContent  = stats.remaining;

  const woAlert = document.getElementById("resumo-wo-alert");
  if (woAlert) {
    woAlert.hidden = !needsWO;
    if (needsWO) {
      const critCount = inspectionItems.filter((i) => i.severity === "critical").length;
      woAlert.innerHTML = `
        ⚠️ <strong>Ordens de Serviço serão abertas automaticamente</strong><br>
        ${critCount > 0 ? `${critCount} item(s) CRÍTICO(s) → O.S de prioridade máxima` : ""}
        ${stats.attCount >= 3 ? `${stats.attCount} itens de ATENÇÃO → O.S consolidada` : ""}`;
    }
  }

  const issueList = document.getElementById("resumo-issue-list");
  if (issueList) {
    const issues = inspectionItems.filter((i) => i.severity && i.severity !== "ok");
    issueList.innerHTML = issues.length
      ? issues.map((i) => `
          <li class="resumo-issue-${i.severity}">
            <span class="ri-sev">${i.severity === "critical" ? "✕" : "⚠"}</span>
            <span>${i.label}${i.notes ? ` — <em>${i.notes}</em>` : ""}</span>
          </li>`).join("")
      : `<li style="color:#64748b">Nenhuma ocorrência registrada — inspeção limpa.</li>`;
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
    const fin = _collectFinalization();
    const inspection = {
      machine:            maquinaSelecionada,
      items:              inspectionItems,
      metrics:            _collectMetrics(),
      inspector:          { name: fin.inspectorName },
      technician:         { name: fin.technicianName || fin.inspectorName },
      finalization:       fin,
      diagnosis:          document.getElementById("diagnosis-text")?.value?.trim()       || "",
      recommendation:     document.getElementById("recommendation-text")?.value?.trim()  || "",
      nextInspectionDate: document.getElementById("next-inspection-date")?.value || "",
      responsibilityTermAccepted: document.getElementById("responsibility-term")?.checked || false,
    };

    const docId = await salvarInspecaoMaquina(inspection, photoFiles, perfil);

    const savedKey = _draftKey;
    _fecharModalResumo();
    _mostrarToast("Inspeção enviada com sucesso!", "sucesso");
    _isDirty = false;

    if (savedKey) { deleteDraft(savedKey); deletePhotos(savedKey).catch(() => {}); }
    const pill = document.getElementById("save-status-pill");
    if (pill) pill.hidden = true;

    setTimeout(() => {
      window.location.href = `../maquinario/historico-maquina.html?inspectionId=${docId}`;
    }, 2000);

  } catch (err) {
    console.error("[MAQ INSP] Erro ao salvar:", err);
    _mostrarToast(
      navigator.onLine
        ? "Erro ao enviar. Rascunho preservado — tente novamente."
        : "Sem conexão. Rascunho salvo localmente.",
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
  const cores = { sucesso:"#16a34a", erro:"#dc2626", aviso:"#d97706", info:"#2563eb" };
  const toast = document.createElement("div");
  toast.className = "insp-toast";
  toast.style.cssText = `background:${cores[tipo] || cores.info};`;
  toast.textContent = msg;
  document.getElementById("toast-container")?.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
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

function _scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function _tick(ms = 0) { return new Promise((r) => setTimeout(r, ms)); }

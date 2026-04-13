/**
 * app-formulario.js — CMMS Work Order Wizard Controller (v2)
 * Page: maquinario/formulario-maquinario.html
 *
 * Modes:
 *   ?id=MAC-001&nome=...  — Create new WO for machine
 *   ?os_id=FIREBASE_ID    — Execute / close an existing open WO
 *
 * Collections written:
 *   work_orders (via criarWorkOrder / atualizarWorkOrder)
 *   machine_state (via updateMachineState)
 *   purchase_orders (via criarPedidoCompra — auto, when materials present)
 */

import { checkAuth } from "../core/db-auth.js";
import { catalogoMaquinas } from "../data/dados-maquinas.js";
import { maquinasDB } from "../data/maquinas-db.js";
import {
  getMachineState,
  updateMachineState,
  STATUS_META,
  getEffectiveStatus,
} from "../core/machine-state-engine.js";
import {
  criarWorkOrder,
  obterWorkOrderPorId,
  atualizarWorkOrder,
} from "../core/db-unified.js";
import { criarPedidoCompra } from "../core/db-compras.js";

// ── Auth ─────────────────────────────────────────────────────────────────────
const sessaoAtual = await checkAuth("formulario-maquinario");

// ── URL Params ───────────────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
let machineId    = params.get("id")   || null;
let machineName  = params.get("nome") || "";
const osIdEditando = params.get("os_id")       || null;
const inspecaoId   = params.get("inspecaoId")  || null;

// Safety guard
if (!machineId && !osIdEditando) {
  window.location.href = "maquinario.html";
}

// ── DOM Refs ─────────────────────────────────────────────────────────────────
const overlayEl     = document.getElementById("overlay");
const overlayTextEl = document.getElementById("overlay-text");
const toastEl       = document.getElementById("toast");
const savePillEl    = document.getElementById("save-pill");
const draftBannerEl = document.getElementById("draft-banner");
const draftTimeEl   = document.getElementById("draft-banner-time");
const progressFill  = document.getElementById("progress-fill");
const stepLabelEl   = document.getElementById("wz-step-label");
const navStepText   = document.getElementById("nav-step-text");
const btnPrev       = document.getElementById("btn-prev");
const btnNext       = document.getElementById("btn-next");
const btnSubmit     = document.getElementById("btn-submit");

// ── Wizard State ─────────────────────────────────────────────────────────────
let currentStep = 1;
const TOTAL_STEPS = 5;

let selectedType     = ""; // Inspecao | Preventiva | Corretiva
let selectedStatus   = ""; // Operacional | Atencao | Parada | Manutencao
let selectedPriority = ""; // low | medium | high | critical
let selectedCondition = "normal";
let selectedOperState = "running";
let selectedLoad      = "normal";

let materialsList     = [];
let photoFiles        = [];
let existingPhotoUrls = [];
let machineMeta       = null;
let prevMachineStatus = null;

// ── Step metadata ─────────────────────────────────────────────────────────────
const STEP_LABELS = [
  "",
  "Contexto da Máquina",
  "Tipo & Status",
  "Análise de Falha",
  "Execução & Materiais",
  "Relatório & Evidências",
];

// ─────────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  // Header user info
  const headerUserEl   = document.getElementById("header-user");
  const headerAvatarEl = document.getElementById("header-avatar");
  if (sessaoAtual?.nome) {
    if (headerUserEl)   headerUserEl.textContent   = sessaoAtual.nome;
    if (headerAvatarEl) headerAvatarEl.textContent = sessaoAtual.nome[0].toUpperCase();
  }

  if (osIdEditando) {
    await initEditMode(osIdEditando);
  } else {
    await initCreateMode();
  }

  setupWizardNavigation();
  setupButtonGroups();
  setupMaterials();
  setupPhotos();

  if (!osIdEditando) {
    checkForDraft();
    startAutoSave();
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// CREATE MODE
// ─────────────────────────────────────────────────────────────────────────────
async function initCreateMode() {
  // Machine metadata from static catalog (try both catalogs)
  machineMeta = catalogoMaquinas.find((m) => m.id === machineId)
             || maquinasDB.find((m) => m.id === machineId)
             || null;
  if (machineMeta) {
    machineName = machineMeta.nome || machineName;
  }

  setMachineDisplay(machineId, machineName || machineId);
  populateMachineInfoCard();

  // Pre-fill technician
  const execByEl = document.getElementById("executed-by");
  if (execByEl) execByEl.value = sessaoAtual?.nome || "";

  // Async: load machine state for status banner
  try {
    const state       = await getMachineState(machineId);
    prevMachineStatus = getEffectiveStatus(state);
    const meta        = STATUS_META[prevMachineStatus] || STATUS_META.operational;

    const banner = document.getElementById("state-banner");
    if (banner) {
      banner.style.display     = "flex";
      banner.style.borderColor = meta.border;
      banner.style.background  = meta.bg;
      const iconEl  = document.getElementById("state-icon");
      const labelEl = document.getElementById("state-label");
      if (iconEl)  iconEl.textContent  = meta.icon;
      if (labelEl) {
        labelEl.textContent = meta.label;
        labelEl.style.color = meta.color;
      }
    }
  } catch (_) {
    // Non-blocking — banner stays hidden
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EDIT MODE (close an existing WO)
// ─────────────────────────────────────────────────────────────────────────────
async function initEditMode(woId) {
  const subtitleEl = document.getElementById("header-subtitle");
  if (subtitleEl) subtitleEl.textContent = "Execução de O.S.";
  if (btnSubmit)  btnSubmit.textContent  = "✅ Dar Baixa na O.S.";

  mostrarOverlay("Carregando Ordem de Serviço...");
  try {
    const wo = await obterWorkOrderPorId(woId);

    machineId   = wo.originId   || machineId;
    machineName = wo.originNome || machineName;
    setMachineDisplay(machineId, machineName);

    machineMeta = catalogoMaquinas.find((m) => m.id === machineId)
               || maquinasDB.find((m) => m.id === machineId)
               || null;
    populateMachineInfoCard();

    // Restore type selection
    const tipoMap = { corrective: "Corretiva", preventive: "Preventiva", predictive: "Inspecao" };
    const woTipo = tipoMap[wo.maintenanceType] || "Corretiva";
    simulateTypeSelection(woTipo);

    // Pre-fill failure analysis
    const fa = wo.failureAnalysis || {};
    setSelectValue("affected-component", fa.affectedComponent);
    setSelectValue("symptom",            fa.symptom);
    setSelectValue("root-cause",         fa.rootCause);
    setInputValue("problem-description", fa.problemDescription);
    setSelectValue("action-taken",       fa.actionTaken);

    // Pre-fill report
    const reportEl = document.getElementById("report");
    if (reportEl) {
      reportEl.value = wo.observations
        ? `[Fecho de O.S.]\n\n${wo.observations}\n\nResolução: `
        : "[Fecho de O.S.]\n\nResolução: ";
    }

    // Pre-fill materials
    (wo.materials || []).forEach((m) => {
      materialsList.push({
        id:        Date.now() + Math.random(),
        descricao: m.description || m.descricao || "",
        quantidade: m.quantity   || m.quantidade || 1,
        unidade:   m.unit        || m.unidade    || "un",
      });
    });
    renderMateriais();

    // Existing photos
    existingPhotoUrls = wo.photoUrls || [];

    // Pre-fill dates
    if (wo.startedAt) {
      setInputValue("start-dt", toDatetimeLocalValue(wo.startedAt));
    }
    setInputValue("end-dt", toDatetimeLocalValue(Date.now()));
    calcDowntime();

    // Default machine status to Operacional when closing
    selectStatus("Operacional");

  } catch (err) {
    console.error("[Formulário] Erro ao carregar WO:", err);
    mostrarToast("Erro ao carregar a O.S. Verifique a ligação.", "erro");
  } finally {
    esconderOverlay();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MACHINE INFO CARD
// ─────────────────────────────────────────────────────────────────────────────
function setMachineDisplay(id, nome) {
  const idEl   = document.getElementById("display-id");
  const nomeEl = document.getElementById("display-nome");
  if (idEl)   idEl.textContent   = id   || "---";
  if (nomeEl) nomeEl.textContent = nome || "Máquina";
}

function populateMachineInfoCard() {
  const iconEl       = document.getElementById("machine-info-icon");
  const setorEl      = document.getElementById("machine-info-setor");
  const patrimonioEl = document.getElementById("machine-info-patrimonio");
  const extraEl      = document.getElementById("machine-info-extra");

  if (machineMeta) {
    if (iconEl)       iconEl.textContent       = machineMeta.icone || iconForMachine(machineMeta.id);
    if (setorEl)      setorEl.textContent      = machineMeta.setor || "—";
    if (patrimonioEl) patrimonioEl.textContent = `Patrimônio: ${machineId}`;
    if (extraEl)      extraEl.textContent      = machineMeta.criticidade
                                                  ? `Criticidade: ${machineMeta.criticidade}`
                                                  : machineMeta.tipo ? `Tipo: ${machineMeta.tipo}` : "";
  } else {
    if (iconEl)       iconEl.textContent       = "⚙️";
    if (setorEl)      setorEl.textContent      = "—";
    if (patrimonioEl) patrimonioEl.textContent = `ID: ${machineId || "—"}`;
    if (extraEl)      extraEl.textContent      = "";
  }
}

function iconForMachine(id = "") {
  const prefix = id.toUpperCase().slice(0, 3);
  return (
    { CAL: "🔥", MOI: "🏭", PEL: "🔩", MIS: "🌀", EXT: "📤",
      SIL: "🗄️", ELE: "⬆️", ENS: "📦" }[prefix] || "⚙️"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WIZARD NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────
function setupWizardNavigation() {
  btnPrev?.addEventListener("click", () => {
    if (currentStep > 1) goTo(currentStep - 1);
  });

  btnNext?.addEventListener("click", () => {
    if (!validateStep(currentStep)) return;
    if (currentStep < TOTAL_STEPS) goTo(currentStep + 1);
  });

  btnSubmit?.addEventListener("click", submitForm);

  // Dot clicks — allow jumping back to completed steps
  document.querySelectorAll(".wz-dot").forEach((dot) => {
    dot.addEventListener("click", () => {
      const target = parseInt(dot.dataset.step);
      if (target < currentStep) goTo(target);
    });
  });

  updateNavUI();
}

function goTo(step) {
  currentStep = Math.max(1, Math.min(TOTAL_STEPS, step));
  updatePanels();
  updateNavUI();
  saveDraft();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updatePanels() {
  document.querySelectorAll(".wz-panel").forEach((p) => p.classList.remove("active"));
  const panel = document.getElementById(`panel-${currentStep}`);
  if (panel) panel.classList.add("active");
}

function updateNavUI() {
  const pct = (currentStep / TOTAL_STEPS) * 100;
  if (progressFill) progressFill.style.width = `${pct}%`;

  if (stepLabelEl) stepLabelEl.textContent = `Passo ${currentStep} / ${TOTAL_STEPS} — ${STEP_LABELS[currentStep]}`;
  if (navStepText) navStepText.textContent = `${currentStep} / ${TOTAL_STEPS}`;

  // Step dots
  document.querySelectorAll(".wz-dot").forEach((dot) => {
    const s = parseInt(dot.dataset.step);
    dot.classList.remove("active", "done");
    if (s === currentStep)    dot.classList.add("active");
    else if (s < currentStep) dot.classList.add("done");
  });

  // Prev button
  if (btnPrev) btnPrev.style.visibility = currentStep === 1 ? "hidden" : "visible";

  // Next / Submit visibility
  if (currentStep === TOTAL_STEPS) {
    btnNext?.classList.add("hidden");
    btnSubmit?.classList.remove("hidden");
  } else {
    btnNext?.classList.remove("hidden");
    btnSubmit?.classList.add("hidden");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
function validateStep(step) {
  if (step === 2) {
    if (!selectedType) {
      mostrarToast("Selecione o Tipo de Intervenção.", "erro");
      return false;
    }
    if (!selectedStatus) {
      mostrarToast("Selecione o Status da máquina após a intervenção.", "erro");
      return false;
    }
    if (["Parada", "Manutencao"].includes(selectedStatus)) {
      const loto = document.getElementById("check-loto");
      if (loto && !loto.checked) {
        mostrarToast("Confirme o bloqueio LOTO antes de avançar.", "erro");
        return false;
      }
    }
  }
  // Step 5 report — also validated at submit
  if (step === 5) {
    const report = document.getElementById("report")?.value.trim();
    if (!report) {
      mostrarToast("Preencha o Relatório Técnico.", "erro");
      return false;
    }
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUTTON GROUPS
// ─────────────────────────────────────────────────────────────────────────────
function setupButtonGroups() {
  // Operational context groups
  setupCtxGroup("ctx-condition-group", "ctx-condition", (v) => { selectedCondition = v; });
  setupCtxGroup("ctx-state-group",     "ctx-state",     (v) => { selectedOperState = v; });
  setupCtxGroup("ctx-load-group",      "ctx-load",      (v) => { selectedLoad      = v; });

  // WO type buttons
  document.querySelectorAll("#type-group .type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#type-group .type-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedType = btn.dataset.val;
      setInputValue("tipo-manutencao", selectedType);
    });
  });

  // Machine status buttons
  document.querySelectorAll("#status-group .btn-status").forEach((btn) => {
    btn.addEventListener("click", () => selectStatus(btn.dataset.status));
  });

  // Priority buttons
  document.querySelectorAll("#priority-group .priority-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectPriority(btn.dataset.val));
  });
}

function setupCtxGroup(groupId, hiddenId, onChange) {
  const group  = document.getElementById(groupId);
  const hidden = document.getElementById(hiddenId);
  if (!group) return;
  group.querySelectorAll(".ctx-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      group.querySelectorAll(".ctx-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      if (hidden) hidden.value = btn.dataset.val;
      onChange(btn.dataset.val);
    });
  });
}

function selectStatus(val) {
  document.querySelectorAll("#status-group .btn-status").forEach((b) => b.classList.remove("selected"));
  const btn = document.querySelector(`#status-group .btn-status[data-status="${val}"]`);
  if (btn) btn.classList.add("selected");
  selectedStatus = val;
  setInputValue("status-maquina", val);

  // LOTO box
  const lotoBox = document.getElementById("loto-box");
  if (lotoBox) {
    if (["Parada", "Manutencao"].includes(val)) {
      lotoBox.classList.remove("hidden");
    } else {
      lotoBox.classList.add("hidden");
      const loto = document.getElementById("check-loto");
      if (loto) loto.checked = false;
    }
  }

  // Smart mode indicator: show inspection-only or WO-generation banner
  const modeBanner = document.getElementById("wo-mode-banner");
  if (modeBanner) {
    if (val === "Operacional") {
      modeBanner.innerHTML = `
        <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-top:12px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:1.1rem;">👁</span>
          <div style="font-size:.83rem;"><strong style="color:#1e40af;">Modo Inspeção</strong>
          <span style="color:#1e40af;"> — Será salvo como inspeção (sem O.S. gerada).</span></div>
        </div>`;
      modeBanner.style.display = "block";
    } else if (val) {
      const woOpenWarning = !document.getElementById("executed-by")?.value.trim()
        ? " Técnico não informado — O.S. ficará em aberto."
        : "";
      modeBanner.innerHTML = `
        <div style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:8px;padding:10px 14px;margin-top:12px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:1.1rem;">🔧</span>
          <div style="font-size:.83rem;"><strong style="color:#c2410c;">Modo Manutenção</strong>
          <span style="color:#9a3412;"> — Uma Ordem de Serviço será gerada automaticamente.${woOpenWarning}</span></div>
        </div>`;
      modeBanner.style.display = "block";
    } else {
      modeBanner.style.display = "none";
    }
  }

  // Auto-suggest priority when machine is stopped / in maintenance
  if (!selectedPriority && ["Parada", "Manutencao"].includes(val)) {
    selectPriority("high");
  }
}

function selectPriority(val) {
  document.querySelectorAll("#priority-group .priority-btn").forEach((b) => b.classList.remove("selected"));
  const btn = document.querySelector(`#priority-group .priority-btn[data-val="${val}"]`);
  if (btn) btn.classList.add("selected");
  selectedPriority = val;
  setInputValue("priority", val);
}

// Helper for programmatic type selection (edit mode restore)
function simulateTypeSelection(val) {
  document.querySelectorAll("#type-group .type-btn").forEach((b) => {
    b.classList.toggle("selected", b.dataset.val === val);
  });
  selectedType = val;
  setInputValue("tipo-manutencao", val);
}

// ─────────────────────────────────────────────────────────────────────────────
// MATERIALS (BOM)
// ─────────────────────────────────────────────────────────────────────────────
function setupMaterials() {
  const btnAdd = document.getElementById("btn-add-mat");
  if (btnAdd) {
    btnAdd.addEventListener("click", adicionarMaterial);
  }

  document.getElementById("mat-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-remove-peca");
    if (!btn) return;
    const id = parseFloat(btn.dataset.id);
    materialsList = materialsList.filter((m) => m.id !== id);
    renderMateriais();
    saveDraft();
  });

  // Downtime auto-calc when dates change
  document.getElementById("start-dt")?.addEventListener("change", calcDowntime);
  document.getElementById("end-dt")?.addEventListener("change",   calcDowntime);
}

function adicionarMaterial() {
  const descEl = document.getElementById("mat-desc");
  const qtyEl  = document.getElementById("mat-qty");
  const unitEl = document.getElementById("mat-unit");

  const desc = descEl?.value.trim() || "";
  const qty  = parseInt(qtyEl?.value) || 0;
  const unit = unitEl?.value || "un";

  if (!desc || qty <= 0) {
    mostrarToast("Informe a descrição e a quantidade do material.", "aviso");
    return;
  }

  materialsList.push({ id: Date.now() + Math.random(), descricao: desc, quantidade: qty, unidade: unit });
  renderMateriais();

  if (descEl) descEl.value = "";
  if (qtyEl)  qtyEl.value  = "1";
  if (descEl) descEl.focus();
  saveDraft();
}

function renderMateriais() {
  const list   = document.getElementById("mat-list");
  const notice = document.getElementById("po-notice");
  if (!list) return;

  list.innerHTML = "";
  materialsList.forEach((m) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="mat-info">
        <span><strong>${m.quantidade}${m.unidade}</strong> ${m.descricao}</span>
      </div>
      <button type="button" class="btn-remove-peca" data-id="${m.id}" title="Remover">×</button>
    `;
    list.appendChild(li);
  });

  if (notice) {
    notice.classList.toggle("hidden", materialsList.length === 0);
  }
}

function calcDowntime() {
  const s       = document.getElementById("start-dt")?.value;
  const e       = document.getElementById("end-dt")?.value;
  const display = document.getElementById("downtime-display");
  const value   = document.getElementById("downtime-value");
  if (!display || !value) return;

  if (s && e) {
    const diffMs = new Date(e) - new Date(s);
    if (diffMs > 0) {
      const h = Math.floor(diffMs / 3_600_000);
      const m = Math.floor((diffMs % 3_600_000) / 60_000);
      value.textContent = h > 0 ? `${h}h ${m}min` : `${m}min`;
      display.classList.remove("hidden");
      return;
    }
  }
  display.classList.add("hidden");
}

function getDowntimeHours() {
  const s = document.getElementById("start-dt")?.value;
  const e = document.getElementById("end-dt")?.value;
  if (!s || !e) return 0;
  const diffMs = new Date(e) - new Date(s);
  return diffMs > 0 ? diffMs / 3_600_000 : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHOTOS
// ─────────────────────────────────────────────────────────────────────────────
function setupPhotos() {
  const cameraInput  = document.getElementById("foto-camera");
  const galleryInput = document.getElementById("foto-gallery");

  [cameraInput, galleryInput].forEach((input) => {
    if (!input) return;
    input.addEventListener("change", (e) => {
      const novos = Array.from(e.target.files || []);
      const total = photoFiles.length + existingPhotoUrls.length + novos.length;
      if (total > 20) {
        mostrarToast("Limite de 20 fotos por registo.", "aviso");
        e.target.value = "";
        return;
      }
      photoFiles = photoFiles.concat(novos);
      renderPhotos();
      e.target.value = ""; // allow re-selecting same file
    });
  });
}

function renderPhotos() {
  const grid    = document.getElementById("photo-grid");
  const countEl = document.getElementById("photo-count");
  if (!grid) return;

  grid.innerHTML = "";
  const total = photoFiles.length + existingPhotoUrls.length;
  if (countEl) countEl.textContent = total;

  existingPhotoUrls.forEach((url) => {
    const img = document.createElement("img");
    img.src = url;
    grid.appendChild(img);
  });

  photoFiles.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = document.createElement("img");
      img.src = ev.target.result;
      grid.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
function draftKey() {
  return `siga_maq_wo_${machineId || osIdEditando || "new"}`;
}

function captureDraft() {
  return {
    ts:               Date.now(),
    machineId,
    machineName,
    selectedType,
    selectedStatus,
    selectedPriority,
    selectedCondition,
    selectedOperState,
    selectedLoad,
    // step 2
    plannedDate:         getVal("planned-date"),
    expectedCompletion:  getVal("expected-completion"),
    // step 3
    affectedComponent:   getVal("affected-component"),
    symptom:             getVal("symptom"),
    rootCause:           getVal("root-cause"),
    problemDescription:  getVal("problem-description"),
    actionTaken:         getVal("action-taken"),
    // step 4
    startDt:    getVal("start-dt"),
    endDt:      getVal("end-dt"),
    executedBy: getVal("executed-by"),
    approvedBy: getVal("approved-by"),
    // step 5
    report: getVal("report"),
    // materials (without id to avoid float precision issues on restore)
    materialsList: materialsList.map(({ id: _id, ...rest }) => rest),
  };
}

function saveDraft() {
  if (osIdEditando) return; // no draft in edit mode
  try {
    localStorage.setItem(draftKey(), JSON.stringify(captureDraft()));
    updateSavePill("saved");
  } catch (_) {}
}

function updateSavePill(state) {
  if (!savePillEl) return;
  if (state === "saved") {
    savePillEl.textContent = "✓ Rascunho salvo";
    savePillEl.className   = "wz-save-pill saved";
  } else if (state === "saving") {
    savePillEl.textContent = "💾 Salvando...";
    savePillEl.className   = "wz-save-pill saving";
  } else {
    savePillEl.textContent = "💾 Rascunho";
    savePillEl.className   = "wz-save-pill";
  }
}

function startAutoSave() {
  setInterval(() => {
    updateSavePill("saving");
    setTimeout(saveDraft, 300);
  }, 5000);
}

function checkForDraft() {
  try {
    const raw = localStorage.getItem(draftKey());
    if (!raw) return;
    const draft = JSON.parse(raw);
    const ageMs = Date.now() - (draft.ts || 0);
    if (ageMs > 24 * 3_600_000) {
      localStorage.removeItem(draftKey());
      return;
    }

    const ageMin = Math.floor(ageMs / 60_000);
    let ageStr;
    if (ageMin < 1)    ageStr = "Salvo agora há pouco";
    else if (ageMin < 60) ageStr = `Salvo há ${ageMin} minuto(s)`;
    else ageStr = `Salvo há ${Math.floor(ageMin / 60)}h${ageMin % 60 > 0 ? ` ${ageMin % 60}min` : ""}`;

    if (draftTimeEl) draftTimeEl.textContent = ageStr;
    if (draftBannerEl) draftBannerEl.classList.remove("hidden");

    document.getElementById("btn-restore-draft")?.addEventListener("click", () => {
      restoreDraft(draft);
      draftBannerEl?.classList.add("hidden");
    });

    document.getElementById("btn-discard-draft")?.addEventListener("click", () => {
      localStorage.removeItem(draftKey());
      draftBannerEl?.classList.add("hidden");
    });
  } catch (_) {}
}

function restoreDraft(d) {
  if (d.selectedType)     simulateTypeSelection(d.selectedType);
  if (d.selectedStatus)   selectStatus(d.selectedStatus);
  if (d.selectedPriority) selectPriority(d.selectedPriority);

  // Ctx groups
  restoreCtxGroup("ctx-condition-group", "ctx-condition", d.selectedCondition, (v) => { selectedCondition = v; });
  restoreCtxGroup("ctx-state-group",     "ctx-state",     d.selectedOperState, (v) => { selectedOperState = v; });
  restoreCtxGroup("ctx-load-group",      "ctx-load",      d.selectedLoad,      (v) => { selectedLoad      = v; });

  // Text fields
  const fields = [
    ["planned-date", d.plannedDate],
    ["expected-completion", d.expectedCompletion],
    ["affected-component", d.affectedComponent],
    ["symptom",            d.symptom],
    ["root-cause",         d.rootCause],
    ["problem-description", d.problemDescription],
    ["action-taken",       d.actionTaken],
    ["start-dt",           d.startDt],
    ["end-dt",             d.endDt],
    ["executed-by",        d.executedBy],
    ["approved-by",        d.approvedBy],
    ["report",             d.report],
  ];
  fields.forEach(([id, val]) => { if (val) setInputValue(id, val); });

  // Materials
  if (Array.isArray(d.materialsList)) {
    materialsList = d.materialsList.map((m) => ({ ...m, id: Date.now() + Math.random() }));
    renderMateriais();
  }

  calcDowntime();
  mostrarToast("Rascunho restaurado com sucesso.", "sucesso");
}

function restoreCtxGroup(groupId, hiddenId, val, onChange) {
  if (!val) return;
  const group  = document.getElementById(groupId);
  const hidden = document.getElementById(hiddenId);
  if (!group) return;
  group.querySelectorAll(".ctx-btn").forEach((b) => b.classList.toggle("selected", b.dataset.val === val));
  if (hidden) hidden.value = val;
  onChange(val);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBMIT
// ─────────────────────────────────────────────────────────────────────────────
async function submitForm() {
  // Validate all steps
  for (let s = 1; s <= TOTAL_STEPS; s++) {
    if (!validateStep(s)) {
      goTo(s);
      return;
    }
  }

  // Extra: ensure report is filled (validateStep(5) catches it, but belt + suspenders)
  const report = document.getElementById("report")?.value.trim() || "";
  if (!report) {
    mostrarToast("Preencha o Relatório Técnico.", "erro");
    goTo(5);
    return;
  }

  mostrarOverlay("Criando Ordem de Serviço...");

  try {
    // ── Type mapping ─────────────────────────────────────────────────────
    // RULE: IF status = Operational → always inspection (no WO needed)
    //       IF status = Attention/Stopped/Maintenance → always maintenance WO
    const isOperational = selectedStatus === "Operacional";
    const typeMap = {
      Inspecao:   { type: "inspection",  maintenanceType: "predictive" },
      Preventiva: { type: "maintenance", maintenanceType: "preventive" },
      Corretiva:  { type: "maintenance", maintenanceType: "corrective" },
    };
    let typeInfo = typeMap[selectedType] || typeMap.Corretiva;
    if (isOperational) {
      // Status = Operational → always inspection regardless of selectedType
      typeInfo = { type: "inspection", maintenanceType: "predictive" };
    } else {
      // Status = Attention/Stopped/Maintenance → always maintenance
      if (typeInfo.type === "inspection") {
        typeInfo = { type: "maintenance", maintenanceType: "corrective" };
      }
    }

    // ── WO status: CMMS smart rules ──────────────────────────────────────
    // Operational → completed immediately (inspection record)
    // Non-operational + no technician → "open" (just reporting the issue)
    // Non-operational + technician filled + start date → "in_progress"
    // Non-operational + technician + start + end → "completed"
    const executedBy  = getVal("executed-by").trim();
    const startDtVal  = getVal("start-dt");
    const endDtVal    = getVal("end-dt");

    let woStatus;
    if (isOperational) {
      woStatus = "completed";
    } else if (!executedBy) {
      woStatus = "open";             // reporting issue, not assigning yet
    } else if (executedBy && startDtVal && endDtVal) {
      woStatus = osIdEditando ? "completed" : "completed";
    } else if (executedBy && startDtVal) {
      woStatus = "in_progress";
    } else {
      woStatus = "open";
    }

    // ── Legacy status for machine_state engine ───────────────────────────
    const legacyStatusMap = {
      Operacional: "Operacional",
      Atencao:     "Revisão",
      Parada:      "Parada",
      Manutencao:  "Troca",
    };
    const legacyStatus = legacyStatusMap[selectedStatus] || "Operacional";

    // ── Collect fields ───────────────────────────────────────────────────
    const affectedComponent = getVal("affected-component");
    const symptom           = getVal("symptom");
    const rootCause         = getVal("root-cause");
    const problemDesc       = getVal("problem-description").trim();
    const actionTaken       = getVal("action-taken");
    // executedBy / startDtVal / endDtVal already declared above for WO status logic
    const approvedBy        = getVal("approved-by").trim();
    const plannedDate       = getVal("planned-date");
    const expectedCompl     = getVal("expected-completion");
    const lotoChecked       = document.getElementById("check-loto")?.checked || false;
    const downtimeHours     = parseFloat(getDowntimeHours().toFixed(2));

    // ── Auto-title ───────────────────────────────────────────────────────
    const typeLabel = typeInfo.type === "inspection" ? "Inspeção"
                    : typeInfo.maintenanceType === "preventive" ? "Preventiva"
                    : "Corretiva";
    const woTitle = `${typeLabel} — ${machineName}`;

    // ── WO payload ───────────────────────────────────────────────────────
    const woPayload = {
      // Core identifiers
      type:       typeInfo.type,
      origin:     "machine",
      originId:   machineId,
      originNome: machineName,
      sector:     machineMeta?.setor || "",

      // Work order details
      title:       woTitle,
      description: problemDesc || report.substring(0, 200),
      observations: report,
      maintenanceType: typeInfo.maintenanceType,

      // People
      requester:  sessaoAtual.nome,
      assignedTo: executedBy || sessaoAtual.nome,
      approvedBy: approvedBy || "",
      criadoPor:  sessaoAtual.nome,

      // Classification
      priority: selectedPriority || "medium",
      status:   osIdEditando ? "completed" : woStatus,

      // CBM context (replaces horimeter)
      operationalContext: {
        conditionObserved: selectedCondition,
        operatingState:    selectedOperState,
        loadCondition:     selectedLoad,
      },

      // Failure analysis
      failureAnalysis: {
        affectedComponent,
        symptom,
        rootCause,
        problemDescription: problemDesc,
        actionTaken,
        lotoConfirmed: lotoChecked,
      },

      // Status tracking
      machineStatusBefore: prevMachineStatus || null,
      machineStatusAfter:  normalizarStatusWizard(selectedStatus),

      // Materials BOM
      materials: materialsList.map((m) => ({
        description: m.descricao,
        quantity:    m.quantidade,
        unit:        m.unidade,
        unitPrice:   0,
        totalPrice:  0,
      })),
      materialsCost: 0,
      laborCost:     0,

      // Timing
      downtime:           downtimeHours,
      startedAt:          startDtVal ? new Date(startDtVal).getTime() : null,
      completedAt:        osIdEditando || woStatus === "completed"
                            ? (endDtVal ? new Date(endDtVal).getTime() : Date.now())
                            : null,
      plannedDate:        plannedDate || null,
      expectedCompletion: expectedCompl || null,

      // Traceability
      inspecaoId: inspecaoId,
      legacyId:   osIdEditando || null,
    };

    // ── Create or update WO ──────────────────────────────────────────────
    let woId;
    if (osIdEditando) {
      await atualizarWorkOrder(osIdEditando, woPayload);
      woId = osIdEditando;
    } else {
      woId = await criarWorkOrder(woPayload);
    }

    // ── Update machine state (non-blocking if fails) ──────────────────────
    mostrarOverlay("Atualizando estado da máquina...");
    try {
      await updateMachineState(machineId, {
        newStatusLegacy: legacyStatus,
        woId,
        woType:        selectedType,
        downtimeHours,
        perfil:        sessaoAtual,
      });
    } catch (e) {
      console.warn("[Formulário] updateMachineState falhou (não bloqueante):", e);
    }

    // ── Auto Purchase Order when materials exist (only for maintenance WOs) ──
    if (materialsList.length > 0 && !isOperational) {
      mostrarOverlay("Gerando Pedido de Compra...");
      try {
        const urgenciaMap = { low: "normal", medium: "normal", high: "urgente", critical: "critico" };
        const poUrgencia  = urgenciaMap[selectedPriority] || "normal";

        const itemsDesc = materialsList
          .map((m) => `${m.quantidade}x ${m.descricao} (${m.unidade})`)
          .join(", ");

        const poPayload = {
          categoria: "peca",
          solicitante: sessaoAtual.nome,
          setor:       machineMeta?.setor || "manutencao",
          fornecedor:  "",
          urgencia:    poUrgencia,
          origem:      "manutencao",
          originId:    machineId,
          machineId,
          machineName,
          linkedWorkOrderId: woId,
          criadoPor:   sessaoAtual.nome,
          justificativa: `Auto-gerado — O.S. de ${selectedType || "manutenção"} em ${machineName}.\nItens: ${itemsDesc}`,
          items: materialsList.map((m) => ({
            descricao:     m.descricao,
            quantidade:    m.quantidade,
            unidade:       m.unidade,
            precoUnitario: 0,
            precoTotal:    0,
          })),
          status: "pending",
        };

        const poId = await criarPedidoCompra(poPayload);

        // Link PO ID back to the WO
        try {
          await atualizarWorkOrder(woId, { pedidoCompraId: poId });
        } catch (e) {
          console.warn("[Formulário] Falha ao vincular pedidoCompraId na WO:", e);
        }
      } catch (e) {
        console.warn("[Formulário] Erro ao criar Pedido de Compra:", e);
        mostrarToast("O.S. salva, mas erro ao gerar Pedido de Compra.", "aviso");
      }
    }

    // ── Cleanup ───────────────────────────────────────────────────────────
    try { localStorage.removeItem(draftKey()); } catch (_) {}
    esconderOverlay();

    const successMsg = osIdEditando
      ? "O.S. executada e encerrada com sucesso!"
      : isOperational
        ? "Inspeção registrada com sucesso!"
        : woStatus === "open"
          ? "Ocorrência registrada! O.S. aberta aguardando atribuição."
          : materialsList.length > 0
            ? "O.S. criada e Pedido de Compra gerado!"
            : "Ordem de Serviço criada com sucesso!";

    mostrarToast(successMsg, "sucesso");
    setTimeout(() => { window.location.href = "maquinario.html"; }, 1400);

  } catch (err) {
    console.error("[Formulário] Erro no submit:", err);
    esconderOverlay();
    mostrarToast("Erro ao salvar. Verifique a ligação e tente novamente.", "erro");
  }
}

// ── Status normalizer (wizard → state engine keys) ────────────────────────────
function normalizarStatusWizard(val) {
  return (
    { Operacional: "operational", Atencao: "attention",
      Parada: "stopped", Manutencao: "in_maintenance" }[val] || "operational"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERLAY / TOAST
// ─────────────────────────────────────────────────────────────────────────────
function mostrarOverlay(msg = "Processando...") {
  if (overlayTextEl) overlayTextEl.textContent = msg;
  overlayEl?.classList.remove("hidden");
}

function esconderOverlay() {
  overlayEl?.classList.add("hidden");
}

function mostrarToast(msg, tipo = "sucesso") {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className   = `toast ${tipo} show`;
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove("show"), 3500);
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
function getVal(id) {
  return document.getElementById(id)?.value || "";
}

function setInputValue(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined && val !== null) el.value = val;
}

function setSelectValue(id, val) {
  const el = document.getElementById(id);
  if (!el || !val) return;
  // Check option exists before setting
  const opt = Array.from(el.options).find((o) => o.value === val);
  if (opt) el.value = val;
}

function toDatetimeLocalValue(ts) {
  if (!ts) return "";
  let ms = ts;
  if (typeof ms === "object" && typeof ms.toMillis === "function") ms = ms.toMillis();
  else if (typeof ms === "object" && ms.seconds) ms = ms.seconds * 1000;
  else if (typeof ms === "string") ms = parseInt(ms) || 0;
  if (!ms) return "";
  try {
    const tzOffset = new Date().getTimezoneOffset() * 60000;
    return new Date(Number(ms) - tzOffset).toISOString().slice(0, 16);
  } catch (_) {
    return "";
  }
}

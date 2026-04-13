/**
 * app-formulario-limpeza.js — Cleaning Inspection Form Controller (SIGA v2)
 *
 * Responsibilities:
 *  - Load zone from URL param zona_id
 *  - Render section tabs + scored / pass-fail item panels
 *  - Live score calculation with color-coded circle
 *  - Issue field capture (description + optional photo)
 *  - requiresPhotoOnFail enforcement before submit
 *  - Submit: salvarInspecaoLimpeza → auto WO (structural) → auto PO (material)
 */

import { checkAuth, getCurrentUser } from "../core/db-auth.js";
import { catalogoZonas, equipeLimpeza, calcularPontuacao } from "../data/dados-limpeza.js";
import { salvarInspecaoLimpeza, scoreToStatus, STATUS_LIMPEZA } from "../core/db-limpeza.js";
import { criarWorkOrder } from "../core/db-unified.js";
import { criarPedidoCompra } from "../core/db-compras.js";

await checkAuth("limpeza");
const perfil = await getCurrentUser();

// ── Header ─────────────────────────────────────────────────────────────────────
const userEl   = document.getElementById("header-user");
const avatarEl = document.getElementById("header-avatar");
if (perfil?.nome) {
  if (userEl)   userEl.textContent   = perfil.nome;
  if (avatarEl) avatarEl.textContent = perfil.nome.charAt(0).toUpperCase();
}

// ── URL param → zone ───────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const zoneId = params.get("zona_id");
const zona   = catalogoZonas.find(z => z.id === zoneId);

if (!zona) {
  showToast("Zona não encontrada. Voltando ao painel...", "erro");
  setTimeout(() => { location.href = "limpeza.html"; }, 2000);
  throw new Error(`[Formulario Limpeza] zona_id not found: ${zoneId}`);
}

// ── Fill zone header ───────────────────────────────────────────────────────────
document.getElementById("zone-icon").textContent    = zona.icone;
document.getElementById("zone-id-chip").textContent = zona.id;
document.getElementById("zone-name").textContent    = zona.nome;
document.getElementById("zone-desc").textContent    = zona.descricao;
document.getElementById("header-subtitle").textContent = `Inspeção · ${zona.nome}`;

// ── Populate employee select ───────────────────────────────────────────────────
const empSelect   = document.getElementById("employee-select");
const empIdHidden = document.getElementById("employee-id");

equipeLimpeza.forEach(emp => {
  const opt = document.createElement("option");
  opt.value       = emp.id;
  opt.textContent = `${emp.nome} — ${emp.cargo}`;
  empSelect.appendChild(opt);
});

empSelect.addEventListener("change", () => {
  empIdHidden.value = empSelect.value;
});

// ── State ──────────────────────────────────────────────────────────────────────
const scoresMap   = {};          // itemId → score (0-5 or null)
const naSet       = new Set();   // itemIds marked N/A
const issueDesc   = {};          // itemId → description string
const issuePhotos = {};          // itemId → File

let currentSection = 0;

// ── DOM refs ───────────────────────────────────────────────────────────────────
const tabsContainer      = document.getElementById("section-tabs");
const sectionsContainer  = document.getElementById("sections-container");
const btnPrev            = document.getElementById("btn-prev");
const btnNext            = document.getElementById("btn-next");
const btnSubmit          = document.getElementById("btn-submit");
const navStepText        = document.getElementById("nav-step-text");
const progressFill       = document.getElementById("progress-fill");
const progressLbl        = document.getElementById("progress-lbl");
const progressItems      = document.getElementById("progress-items");
const scoreNum           = document.getElementById("score-num");
const scoreCircle        = document.getElementById("score-circle");
const scoreStatusLbl     = document.getElementById("score-status-lbl");
const scoreDetail        = document.getElementById("score-detail");
const scoreTrackFill     = document.getElementById("score-track-fill");
const actionsSummaryWrap = document.getElementById("actions-summary-wrap");
const actionsSummaryList = document.getElementById("actions-summary-list");
const overlay            = document.getElementById("overlay");
const overlayText        = document.getElementById("overlay-text");

// ── Build all panels ───────────────────────────────────────────────────────────
function buildPanels() {
  tabsContainer.innerHTML     = "";
  sectionsContainer.innerHTML = "";

  zona.sections.forEach((sec, idx) => {
    // Tab button
    const tab = document.createElement("button");
    tab.type      = "button";
    tab.className = `section-tab${idx === 0 ? " active" : ""}`;
    tab.textContent  = sec.nome;
    tab.dataset.idx  = idx;
    tab.addEventListener("click", () => goToSection(idx));
    tabsContainer.appendChild(tab);

    // Panel
    const panel = document.createElement("div");
    panel.className = `section-panel${idx === 0 ? " active" : ""}`;
    panel.id        = `panel-${idx}`;

    const title = document.createElement("h3");
    title.className   = "section-title";
    title.textContent = sec.nome;
    panel.appendChild(title);

    sec.items.forEach(item => panel.appendChild(buildItemCard(item)));

    sectionsContainer.appendChild(panel);
  });

  updateNavButtons();
  updateProgress();
}

// ── Build a single checklist item card ────────────────────────────────────────
function buildItemCard(item) {
  const card = document.createElement("div");
  card.className = "checklist-item";
  card.id        = `item-card-${item.id}`;

  const badges = [];
  if (item.critical)                        badges.push(`<span class="badge-critical">⚠️ Crítico</span>`);
  if (item.actionType === "structural")     badges.push(`<span class="badge-structural">🔧 Gera O.S.</span>`);
  if (item.actionType === "material")       badges.push(`<span class="badge-material">🛒 Gera Compra</span>`);
  if (item.requiresPhotoOnFail)             badges.push(`<span class="badge-photo">📷 Foto obrigatória</span>`);

  const photoLabel = item.requiresPhotoOnFail ? "📷 Anexar foto (obrigatório)" : "📷 Anexar foto (opcional)";

  card.innerHTML = `
    <div class="item-text">${item.texto}</div>
    ${badges.length ? `<div class="item-badges">${badges.join("")}</div>` : ""}
    <div id="buttons-${item.id}"></div>
    <div class="issue-fields" id="issue-${item.id}">
      <div class="issue-label">📋 Descreva o problema encontrado:</div>
      <textarea class="issue-input" id="issue-desc-${item.id}" rows="2"
        placeholder="Ex.: Piso com acúmulo de óleo perto da máquina 3..."></textarea>
      <div style="margin-top:6px;">
        <label class="btn-photo-small" for="photo-${item.id}">${photoLabel}</label>
        <input type="file" id="photo-${item.id}" accept="image/*" capture="environment" style="display:none;" />
        <div class="photo-preview-small" id="photo-preview-${item.id}"></div>
      </div>
    </div>
  `;

  // Inject score or pass/fail buttons
  const btnContainer = card.querySelector(`#buttons-${item.id}`);
  if (item.tipo === "score") {
    btnContainer.appendChild(buildScoreButtons(item));
  } else {
    btnContainer.appendChild(buildPassFailButtons(item));
  }

  // Photo input handler
  const photoInput = card.querySelector(`#photo-${item.id}`);
  if (photoInput) {
    photoInput.addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file) return;
      issuePhotos[item.id] = file;
      const preview = card.querySelector(`#photo-preview-${item.id}`);
      if (preview) {
        const img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        preview.innerHTML = "";
        preview.appendChild(img);
      }
    });
  }

  // Issue description handler
  const descArea = card.querySelector(`#issue-desc-${item.id}`);
  if (descArea) {
    descArea.addEventListener("input", () => {
      issueDesc[item.id] = descArea.value.trim();
    });
  }

  return card;
}

// ── Score buttons 0–5 ─────────────────────────────────────────────────────────
function buildScoreButtons(item) {
  const wrap = document.createElement("div");
  wrap.className = "score-buttons";

  const labels = ["0\nPéssimo", "1\nRuim", "2\nRegular", "3\nBom", "4\nÓtimo", "5\nExcelente"];

  for (let v = 0; v <= 5; v++) {
    const btn = document.createElement("button");
    btn.type         = "button";
    btn.className    = "score-btn";
    btn.innerHTML    = labels[v].replace("\n", "<br>");
    btn.dataset.value = v;
    btn.addEventListener("click", () => {
      setScore(item, v);
      wrap.querySelectorAll(".score-btn").forEach(b => {
        b.className = "score-btn";
        if (b.dataset.value === String(v)) b.classList.add(`selected-${v}`);
      });
    });
    wrap.appendChild(btn);
  }

  // N/A button
  const naBtn = document.createElement("button");
  naBtn.type      = "button";
  naBtn.className = "score-btn";
  naBtn.innerHTML = "N/A<br><span style='font-size:.65rem;'>Não se aplica</span>";
  naBtn.addEventListener("click", () => {
    setNA(item);
    wrap.querySelectorAll(".score-btn").forEach(b => b.className = "score-btn");
    naBtn.classList.add("na-selected");
  });
  wrap.appendChild(naBtn);

  return wrap;
}

// ── Pass / Fail / N/A buttons ─────────────────────────────────────────────────
function buildPassFailButtons(item) {
  const wrap = document.createElement("div");
  wrap.className = "passfail-buttons";

  const passBtn = document.createElement("button");
  passBtn.type      = "button";
  passBtn.className = "pf-btn";
  passBtn.textContent = "✅ Conforme";

  const failBtn = document.createElement("button");
  failBtn.type      = "button";
  failBtn.className = "pf-btn";
  failBtn.textContent = "❌ Não Conforme";

  const naBtn = document.createElement("button");
  naBtn.type         = "button";
  naBtn.className    = "pf-btn";
  naBtn.style.gridColumn = "1 / -1";
  naBtn.textContent  = "— Não se Aplica";

  passBtn.addEventListener("click", () => {
    setScore(item, 5);
    passBtn.className = "pf-btn pass-selected";
    failBtn.className = "pf-btn";
    naBtn.className   = "pf-btn";
  });

  failBtn.addEventListener("click", () => {
    setScore(item, 0);
    failBtn.className = "pf-btn fail-selected";
    passBtn.className = "pf-btn";
    naBtn.className   = "pf-btn";
  });

  naBtn.addEventListener("click", () => {
    setNA(item);
    naBtn.className   = "pf-btn na-selected";
    passBtn.className = "pf-btn";
    failBtn.className = "pf-btn";
  });

  wrap.appendChild(passBtn);
  wrap.appendChild(failBtn);
  wrap.appendChild(naBtn);

  return wrap;
}

// ── Score / N/A setters ───────────────────────────────────────────────────────
function setScore(item, value) {
  naSet.delete(item.id);
  scoresMap[item.id] = value;

  const card       = document.getElementById(`item-card-${item.id}`);
  const issueField = document.getElementById(`issue-${item.id}`);
  const isFail     = (value === 0);

  if (card) {
    card.classList.add("answered");
    card.classList.toggle("critical-fail", isFail && item.critical);
  }
  if (issueField) {
    issueField.classList.toggle("visible", isFail);
    if (!isFail) {
      delete issueDesc[item.id];
      delete issuePhotos[item.id];
    }
  }

  updateLiveScore();
  updateProgress();
  updateSectionTabState();
  updateActionsSummary();
}

function setNA(item) {
  naSet.add(item.id);
  delete scoresMap[item.id];
  delete issueDesc[item.id];
  delete issuePhotos[item.id];

  const card       = document.getElementById(`item-card-${item.id}`);
  const issueField = document.getElementById(`issue-${item.id}`);
  if (card)       { card.classList.add("answered"); card.classList.remove("critical-fail"); }
  if (issueField)   issueField.classList.remove("visible");

  updateLiveScore();
  updateProgress();
  updateSectionTabState();
  updateActionsSummary();
}

// ── Live score helpers ────────────────────────────────────────────────────────
function buildScoresMapForCalc() {
  const map = {};
  for (const sec of zona.sections) {
    for (const item of sec.items) {
      if (naSet.has(item.id)) {
        map[item.id] = null;          // N/A → skipped in calcularPontuacao
      } else if (scoresMap[item.id] !== undefined) {
        map[item.id] = scoresMap[item.id];
      }
      // Unanswered items are simply absent (also skipped)
    }
  }
  return map;
}

function scoreColor(score) {
  if (score >= 90) return "#16a34a";
  if (score >= 75) return "#d97706";
  if (score >= 50) return "#ea580c";
  return "#dc2626";
}

function updateLiveScore() {
  const answeredCount = Object.keys(scoresMap).length + naSet.size;

  if (answeredCount === 0) {
    scoreNum.textContent             = "0";
    scoreCircle.style.borderColor    = "#e2e8f0";
    scoreCircle.style.color          = "#94a3b8";
    scoreStatusLbl.textContent       = "Aguardando respostas...";
    scoreStatusLbl.style.color       = "#94a3b8";
    scoreDetail.textContent          = "Preencha o checklist abaixo";
    scoreTrackFill.style.width       = "0%";
    scoreTrackFill.style.background  = "#e2e8f0";
    return;
  }

  const { finalScore } = calcularPontuacao(zona, buildScoresMapForCalc());
  const col  = scoreColor(finalScore);
  const meta = STATUS_LIMPEZA[scoreToStatus(finalScore)] || STATUS_LIMPEZA.attention;

  scoreNum.textContent             = finalScore;
  scoreNum.style.color             = col;
  scoreCircle.style.borderColor    = col + "66";
  scoreCircle.style.color          = col;
  scoreStatusLbl.textContent       = meta.label;
  scoreStatusLbl.style.color       = meta.color;
  scoreDetail.textContent          = `${answeredCount} item(ns) respondido(s)`;
  scoreTrackFill.style.width       = `${finalScore}%`;
  scoreTrackFill.style.background  = col;
}

// ── Progress ──────────────────────────────────────────────────────────────────
function countAllItems() {
  return zona.sections.reduce((t, s) => t + s.items.length, 0);
}

function countAnswered() {
  return Object.keys(scoresMap).length + naSet.size;
}

function updateProgress() {
  const total    = countAllItems();
  const answered = countAnswered();
  const pct      = total > 0 ? Math.round((answered / total) * 100) : 0;

  progressFill.style.width  = `${pct}%`;
  progressLbl.textContent   = `Seção ${currentSection + 1} / ${zona.sections.length}`;
  progressItems.textContent = `${answered} / ${total} itens respondidos`;
  navStepText.textContent   = `${currentSection + 1} / ${zona.sections.length}`;

  btnSubmit.disabled = answered < total;
}

// ── Section tab visual state ──────────────────────────────────────────────────
function updateSectionTabState() {
  const tabs = tabsContainer.querySelectorAll(".section-tab");
  zona.sections.forEach((sec, idx) => {
    const tab = tabs[idx];
    if (!tab) return;

    const itemIds  = sec.items.map(i => i.id);
    const allDone  = itemIds.every(id => scoresMap[id] !== undefined || naSet.has(id));
    const hasIssue = itemIds.some(id => scoresMap[id] === 0);
    const isActive = idx === currentSection;

    tab.classList.toggle("active",    isActive);
    tab.classList.toggle("done",      allDone && !isActive && !hasIssue);
    tab.classList.toggle("has-issue", hasIssue && !isActive);
  });
}

// ── Section navigation ────────────────────────────────────────────────────────
function goToSection(idx) {
  if (idx < 0 || idx >= zona.sections.length) return;
  currentSection = idx;

  sectionsContainer.querySelectorAll(".section-panel").forEach((p, i) => {
    p.classList.toggle("active", i === idx);
  });

  updateNavButtons();
  updateProgress();
  updateSectionTabState();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateNavButtons() {
  const isFirst = currentSection === 0;
  const isLast  = currentSection === zona.sections.length - 1;

  btnPrev.style.visibility = isFirst ? "hidden" : "visible";

  if (isLast) {
    btnNext.classList.add("hidden");
    btnSubmit.classList.remove("hidden");
  } else {
    btnNext.classList.remove("hidden");
    btnSubmit.classList.add("hidden");
  }
}

btnPrev.addEventListener("click", () => goToSection(currentSection - 1));
btnNext.addEventListener("click", () => goToSection(currentSection + 1));

// ── Issues list builder ───────────────────────────────────────────────────────
function buildIssues() {
  const issues = [];
  for (const sec of zona.sections) {
    for (const item of sec.items) {
      if (scoresMap[item.id] === 0) {
        issues.push({
          itemId:      item.id,
          description: issueDesc[item.id] || item.texto,
          category:    item.actionType,
          severity:    item.critical ? "critical" : "low",
          actionType:  item.actionType,
          isCritical:  item.critical,
          sectionName: sec.nome,
        });
      }
    }
  }
  return issues;
}

// ── Actions summary preview ───────────────────────────────────────────────────
function updateActionsSummary() {
  const issues     = buildIssues();
  const cleaning   = issues.filter(i => i.actionType === "cleaning");
  const structural = issues.filter(i => i.actionType === "structural");
  const material   = issues.filter(i => i.actionType === "material");

  if (!issues.length) {
    actionsSummaryWrap.classList.add("hidden");
    return;
  }

  actionsSummaryWrap.classList.remove("hidden");

  const parts = [];

  if (cleaning.length) {
    parts.push(`
      <div class="action-item action-cleaning">
        🧹 <div><strong>Tarefa corretiva interna</strong>
        (${cleaning.length} problema(s) de limpeza/organização)</div>
      </div>`);
  }

  structural.forEach(i => {
    parts.push(`
      <div class="action-item action-structural">
        🔧 <div><strong>O.S. Manutenção será gerada:</strong>
        ${i.description || i.sectionName}</div>
      </div>`);
  });

  material.forEach(i => {
    parts.push(`
      <div class="action-item action-material">
        🛒 <div><strong>Pedido de Compra será gerado:</strong>
        ${i.description || i.sectionName}</div>
      </div>`);
  });

  actionsSummaryList.innerHTML = parts.join("");
}

// ── Validation ────────────────────────────────────────────────────────────────
function validarFormulario() {
  const inspector = document.getElementById("inspector-input").value.trim();
  if (!inspector) {
    showToast("Informe o nome do inspetor.", "aviso");
    document.getElementById("inspector-input").focus();
    return false;
  }

  if (!empSelect.value) {
    showToast("Selecione o funcionário avaliado.", "aviso");
    empSelect.focus();
    return false;
  }

  const total    = countAllItems();
  const answered = countAnswered();
  if (answered < total) {
    const missing = total - answered;
    showToast(`Ainda há ${missing} item(ns) sem resposta.`, "aviso");
    // Jump to first section with unanswered item
    for (let si = 0; si < zona.sections.length; si++) {
      const hasUnanswered = zona.sections[si].items.some(
        item => scoresMap[item.id] === undefined && !naSet.has(item.id)
      );
      if (hasUnanswered) { goToSection(si); break; }
    }
    return false;
  }

  // requiresPhotoOnFail check
  for (const sec of zona.sections) {
    for (const item of sec.items) {
      if (item.requiresPhotoOnFail && scoresMap[item.id] === 0 && !issuePhotos[item.id]) {
        showToast(`Foto obrigatória: "${item.texto.substring(0, 50)}..."`, "aviso");
        const secIdx = zona.sections.indexOf(sec);
        goToSection(secIdx);
        document.getElementById(`item-card-${item.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
        return false;
      }
    }
  }

  return true;
}

// ── Submit ────────────────────────────────────────────────────────────────────
btnSubmit.addEventListener("click", async () => {
  if (!validarFormulario()) return;

  showOverlay("Calculando pontuação...");

  try {
    const inspector    = document.getElementById("inspector-input").value.trim();
    const employeeId   = empSelect.value;
    const employeeNome = empSelect.options[empSelect.selectedIndex]?.text.split(" — ")[0] || employeeId;
    const notes        = document.getElementById("observacoes").value.trim();
    const issues       = buildIssues();

    const { finalScore, sections: sectionResults } = calcularPontuacao(zona, buildScoresMapForCalc());
    const hasCritical = issues.some(i => i.isCritical);
    const status      = hasCritical && finalScore >= 50
      ? "attention"
      : scoreToStatus(finalScore);

    // Build payload for db-limpeza
    const payload = {
      zoneId:           zona.id,
      zoneName:         zona.nome,
      inspectorName:    inspector,
      employeeId,
      employeeName:     employeeNome,
      score:            finalScore,
      status,
      sections:         sectionResults,
      issues:           issues.map(i => ({
        itemId:      i.itemId,
        description: i.description,
        category:    i.category,
        severity:    i.severity,
        actionType:  i.actionType,
        linkedWOId:  null,
        photoUrl:    null,
      })),
      notes,
      hasCriticalIssue: hasCritical,
    };

    overlayText.textContent = "Enviando fotos e salvando...";
    const inspectionId = await salvarInspecaoLimpeza(payload, issuePhotos);

    // ── Auto O.S. for structural issues ────────────────────────────────────────
    const structuralIssues = issues.filter(i => i.actionType === "structural");
    if (structuralIssues.length) {
      overlayText.textContent = "Gerando O.S. de Manutenção...";
      const descLines = structuralIssues
        .map(i => `• ${i.description || i.sectionName}`)
        .join("\n");
      try {
        await criarWorkOrder({
          type:            "maintenance",
          maintenanceType: "corrective",
          title:           `Corretiva 5S — ${zona.nome}`,
          description:     `Inspeção de limpeza identificou problemas estruturais:\n${descLines}`,
          sector:          zona.setor,
          origin:          "cleaning_inspection",
          originId:        inspectionId,
          priority:        hasCritical ? "high" : "medium",
          criadoPor:       inspector,
          status:          "open",
          linkedZoneId:    zona.id,
        });
      } catch (e) {
        console.warn("[Limpeza] Falha ao gerar O.S.:", e);
      }
    }

    // ── Auto PO for material issues ────────────────────────────────────────────
    const materialIssues = issues.filter(i => i.actionType === "material");
    if (materialIssues.length) {
      overlayText.textContent = "Gerando Pedido de Compra...";
      const itens = materialIssues.map((iss, idx) => ({
        id:             idx + 1,
        descricao:      iss.description || `Material para ${zona.nome}`,
        quantidade:     1,
        unidade:        "un",
        valorUnitario:  0,
      }));
      try {
        await criarPedidoCompra({
          titulo:      `Materiais 5S — ${zona.nome}`,
          descricao:   `Necessidade identificada em inspeção de limpeza (${zona.id}).`,
          itens,
          status:      "pendente",
          prioridade:  "media",
          criadoPor:   inspector,
          origem:      "cleaning_inspection",
          origemId:    inspectionId,
          setor:       zona.setor,
        });
      } catch (e) {
        console.warn("[Limpeza] Falha ao gerar PO:", e);
      }
    }

    hideOverlay();

    const meta = STATUS_LIMPEZA[scoreToStatus(finalScore)];
    showToast(`✅ Inspeção salva! Score: ${finalScore}% — ${meta?.label || ""}`, "sucesso");

    setTimeout(() => { location.href = "limpeza.html"; }, 2200);

  } catch (err) {
    hideOverlay();
    console.error("[Limpeza] Erro ao salvar inspeção:", err);
    showToast("Erro ao salvar inspeção. Tente novamente.", "erro");
  }
});

// ── Toast / Overlay ───────────────────────────────────────────────────────────
function showToast(msg, tipo = "aviso") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className   = `show ${tipo}`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { t.className = ""; }, 4500);
}

function showOverlay(msg = "Processando...") {
  overlayText.textContent = msg;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

// ── Init ──────────────────────────────────────────────────────────────────────
buildPanels();
updateLiveScore();

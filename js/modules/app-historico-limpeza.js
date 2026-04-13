/**
 * app-historico-limpeza.js — Cleaning Inspection History (SIGA v2)
 *
 * Displays all inspections from cleaning_inspections (+ legacy auditorias_limpeza).
 * Supports filters: zone, status, employee.
 * Detail modal shows section breakdown + issues + photos.
 */

import { checkAuth, getCurrentUser } from "../core/db-auth.js";
import { catalogoZonas, equipeLimpeza } from "../data/dados-limpeza.js";
import { obterTodasInspecoes, STATUS_LIMPEZA, scoreToStatus } from "../core/db-limpeza.js";

await checkAuth("limpeza");
const perfil = await getCurrentUser();

// ── Header ─────────────────────────────────────────────────────────────────────
const userEl   = document.getElementById("header-user");
const avatarEl = document.getElementById("header-avatar");
if (perfil?.nome) {
  if (userEl)   userEl.textContent   = perfil.nome;
  if (avatarEl) avatarEl.textContent = perfil.nome.charAt(0).toUpperCase();
}

// ── URL param ─────────────────────────────────────────────────────────────────
const params      = new URLSearchParams(location.search);
const zoneIdParam = params.get("zona_id");

// ── DOM refs ──────────────────────────────────────────────────────────────────
const listaEl       = document.getElementById("lista-inspecoes");
const resultCount   = document.getElementById("result-count");
const filterZone    = document.getElementById("filter-zone");
const filterStatus  = document.getElementById("filter-status");
const filterEmp     = document.getElementById("filter-employee");
const btnClear      = document.getElementById("btn-clear-filters");
const modal         = document.getElementById("modal-detalhes");
const modalBody     = document.getElementById("modal-body-content");
const modalTitle    = document.getElementById("mod-title");
const btnFecha      = document.getElementById("btn-fechar-modal");

// ── All inspections (loaded once) ─────────────────────────────────────────────
let allInspecoes = [];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR", { day:"2-digit", month:"short", year:"numeric" })
    + " " + d.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
}

function scoreColor(score) {
  if (score >= 90) return "#16a34a";
  if (score >= 75) return "#d97706";
  if (score >= 50) return "#ea580c";
  return "#dc2626";
}

function scoreBorderColor(score) {
  if (score >= 90) return "#86efac";
  if (score >= 75) return "#fde68a";
  if (score >= 50) return "#fed7aa";
  return "#fecaca";
}

function zoneName(zoneId) {
  const cat = catalogoZonas.find(z => z.id === zoneId);
  return cat ? `${cat.icone} ${cat.nome}` : zoneId || "—";
}

function empName(empId) {
  const emp = equipeLimpeza.find(e => e.id === empId);
  return emp ? emp.nome : empId || "—";
}

// ── Populate filters ──────────────────────────────────────────────────────────
function populateFilters() {
  // Zone options from catalog
  catalogoZonas.forEach(z => {
    const opt = document.createElement("option");
    opt.value       = z.id;
    opt.textContent = `${z.icone} ${z.nome}`;
    filterZone.appendChild(opt);
  });

  // Employee options from catalog
  equipeLimpeza.forEach(e => {
    const opt = document.createElement("option");
    opt.value       = e.id;
    opt.textContent = e.nome;
    filterEmp.appendChild(opt);
  });

  // Pre-select zone if param present
  if (zoneIdParam) filterZone.value = zoneIdParam;
}

// ── Render list ───────────────────────────────────────────────────────────────
function renderList(inspecoes) {
  if (!inspecoes.length) {
    listaEl.innerHTML = `<div class="empty-msg">📭 Nenhuma inspeção encontrada para os filtros aplicados.</div>`;
    resultCount.textContent = "0 resultados";
    return;
  }

  resultCount.textContent = `${inspecoes.length} inspeção(ões)`;
  listaEl.innerHTML = "";

  inspecoes.forEach(insp => {
    const score    = insp.score ?? 0;
    const col      = scoreColor(score);
    const brd      = scoreBorderColor(score);
    const meta     = STATUS_LIMPEZA[insp.status || scoreToStatus(score)] || STATUS_LIMPEZA.attention;
    const zName    = insp.zoneName || zoneName(insp.zoneId);
    const eName    = insp.employeeName || empName(insp.employeeId);
    const issueLen = (insp.issues || []).length;

    const card = document.createElement("div");
    card.className = "insp-card";
    card.innerHTML = `
      <div class="insp-score-ring" style="border-color:${brd};color:${col};">
        <span class="sr-num" style="color:${col};">${score}</span>
        <span class="sr-pct" style="color:${col};">%</span>
      </div>
      <div class="insp-body">
        <div class="insp-zone-name">${zName}</div>
        <div class="insp-meta">
          👷 ${eName} &nbsp;·&nbsp; 📅 ${fmtDate(insp.timestampEnvio)}
          ${insp.inspectorName ? `&nbsp;·&nbsp; 🔍 ${insp.inspectorName}` : ""}
        </div>
        <span class="insp-badge" style="background:${meta.bg};color:${meta.color};border-color:${meta.border};">
          ${meta.label}
        </span>
        ${issueLen > 0 ? `<div class="insp-issues">⚠️ ${issueLen} problema(s) registrado(s)</div>` : ""}
      </div>
    `;
    card.addEventListener("click", () => abrirModal(insp));
    listaEl.appendChild(card);
  });
}

// ── Filter logic ──────────────────────────────────────────────────────────────
function applyFilters() {
  const fZone   = filterZone.value;
  const fStatus = filterStatus.value;
  const fEmp    = filterEmp.value;

  const filtered = allInspecoes.filter(i => {
    if (fZone   && i.zoneId     !== fZone)   return false;
    if (fStatus && (i.status || scoreToStatus(i.score ?? 0)) !== fStatus) return false;
    if (fEmp    && i.employeeId !== fEmp)    return false;
    return true;
  });

  renderList(filtered);
}

filterZone.addEventListener("change",   applyFilters);
filterStatus.addEventListener("change", applyFilters);
filterEmp.addEventListener("change",    applyFilters);
btnClear.addEventListener("click", () => {
  filterZone.value   = "";
  filterStatus.value = "";
  filterEmp.value    = "";
  renderList(allInspecoes);
});

// ── Detail Modal ──────────────────────────────────────────────────────────────
function abrirModal(insp) {
  const score  = insp.score ?? 0;
  const col    = scoreColor(score);
  const meta   = STATUS_LIMPEZA[insp.status || scoreToStatus(score)] || STATUS_LIMPEZA.attention;
  const zName  = insp.zoneName || zoneName(insp.zoneId);
  const eName  = insp.employeeName || empName(insp.employeeId);
  const issues = insp.issues || [];

  modalTitle.textContent = `📋 Inspeção — ${zName}`;

  // Build sections breakdown
  let sectionsHtml = "";
  if (insp.sections && insp.sections.length) {
    insp.sections.forEach(sec => {
      const secCol = scoreColor(sec.score ?? 0);
      sectionsHtml += `
        <div class="mod-section-title">
          ${sec.nome}
          <span style="float:right;font-size:.8rem;color:${secCol};font-weight:900;">${sec.score ?? "—"}%</span>
        </div>`;

      if (sec.items && sec.items.length) {
        sec.items.forEach(item => {
          const sg     = item.scoreGiven ?? null;
          const rowCls = sg === null ? "na" : sg === 0 ? "fail" : "pass";
          const scoreDisp = sg === null ? "N/A"
            : item.tipo === "passfail"
              ? (sg === 5 ? "✅" : "❌")
              : `${sg}/5`;

          sectionsHtml += `
            <div class="mod-item-row ${rowCls}">
              <div class="mod-item-score">${scoreDisp}</div>
              <div class="mod-item-text">${item.texto || item.id}</div>
              ${item.photoUrl ? `<div class="mod-item-photo"><a href="${item.photoUrl}" target="_blank"><img src="${item.photoUrl}" /></a></div>` : ""}
            </div>`;
        });
      }
    });
  } else {
    sectionsHtml = `<p style="color:#94a3b8;font-size:.85rem;padding:8px 0;">Detalhes por seção não disponíveis (inspeção legada).</p>`;
  }

  // Issues list
  let issuesHtml = "";
  if (issues.length) {
    issuesHtml = `
      <div class="mod-issues-section">
        <div class="mod-section-title">⚠️ Problemas Registados (${issues.length})</div>
        ${issues.map(iss => `
          <div class="mod-issue-item">
            <strong>${iss.actionType === "structural" ? "🔧 Estrutural" : iss.actionType === "material" ? "🛒 Material" : "🧹 Limpeza"}</strong>
            ${iss.severity === "critical" ? " · <span style='color:#dc2626;font-weight:700;'>CRÍTICO</span>" : ""}
            <br>${iss.description || "—"}
            ${iss.photoUrl ? `<br><a href="${iss.photoUrl}" target="_blank"><img src="${iss.photoUrl}" style="margin-top:6px;width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;"></a>` : ""}
          </div>`).join("")}
      </div>`;
  }

  modalBody.innerHTML = `
    <div class="mod-info-grid">
      <div class="mod-info-box">
        <strong>Zona</strong>
        <span>${zName}</span>
      </div>
      <div class="mod-info-box">
        <strong>Data</strong>
        <span>${fmtDate(insp.timestampEnvio)}</span>
      </div>
      <div class="mod-info-box">
        <strong>Funcionário Avaliado</strong>
        <span>${eName}</span>
      </div>
      <div class="mod-info-box" style="border-color:${meta.border};background:${meta.bg};">
        <strong>Score Final</strong>
        <span style="color:${col};font-size:1.2rem;">${score}% &nbsp; ${meta.label}</span>
      </div>
    </div>

    ${sectionsHtml}
    ${issuesHtml}

    ${insp.notes ? `
      <div class="mod-notes">
        <strong>📝 Observações:</strong><br>${insp.notes}
      </div>` : ""}
  `;

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function fecharModal() {
  modal.classList.remove("active");
  document.body.style.overflow = "";
}

btnFecha.addEventListener("click", fecharModal);
modal.addEventListener("click", e => { if (e.target === modal) fecharModal(); });

// ── Load ──────────────────────────────────────────────────────────────────────
async function carregar() {
  try {
    allInspecoes = await obterTodasInspecoes();
    populateFilters();
    applyFilters(); // respects pre-selected zone from URL
  } catch (err) {
    console.error("[Historico Limpeza] Erro:", err);
    listaEl.innerHTML = `<div class="empty-msg" style="color:#dc2626;">❌ Erro ao carregar histórico. Recarregue a página.</div>`;
  }
}

carregar();

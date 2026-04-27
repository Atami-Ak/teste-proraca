/**
 * app-limpeza-ranking.js — Cleaning Performance Ranking Page (SIGA v2)
 *
 * Loads all inspection records once, computes weekly + monthly rankings
 * for both employees and zones, then renders:
 *  - Animated podium (top 3) — with zone below each name
 *  - Full leaderboard (positions 4+) — with zone + performance badge
 *  - Zone ranking grid — with team members list
 *
 * ALL employees from the catalog appear in rankings; those without inspections
 * appear last with badge "⚫ Sem avaliação".
 */

import { checkAuth, getCurrentUser } from "../core/db-auth.js";
import { obterTodasInspecoes } from "../core/db-limpeza.js";
import { catalogoZonas, equipeLimpeza } from "../data/dados-limpeza.js";

await checkAuth("limpeza");
const perfil = await getCurrentUser();

// ── Header ─────────────────────────────────────────────────────────────────────
const userEl   = document.getElementById("header-user");
const avatarEl = document.getElementById("header-avatar");
if (perfil?.nome) {
  if (userEl)   userEl.textContent   = perfil.nome;
  if (avatarEl) avatarEl.textContent = perfil.nome.charAt(0).toUpperCase();
}

// ── State ──────────────────────────────────────────────────────────────────────
let allInspecoes = [];
let currentMode  = "weekly";

// ── DOM refs ───────────────────────────────────────────────────────────────────
const podiumWrap      = document.getElementById("podium-wrap");
const leaderboardList = document.getElementById("leaderboard-list");
const zoneGrid        = document.getElementById("zone-ranking-grid");
const btnWeekly       = document.getElementById("btn-weekly");
const btnMonthly      = document.getElementById("btn-monthly");

// ── Helpers ────────────────────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 90) return "#16a34a";
  if (score >= 75) return "#d97706";
  if (score >= 50) return "#ea580c";
  return "#dc2626";
}

/** Returns zones for a given employeeId from catalog */
function getEmpZones(employeeId) {
  return catalogoZonas
    .filter(z => (z.responsaveis || []).includes(employeeId))
    .map(z => `${z.icone} ${z.nome}`);
}

/** Performance badge HTML based on score and inspection count */
function perfBadge(emp) {
  if (emp.totalInspections === 0) return `<span class="lb-badge no-data">⚫ Sem avaliação</span>`;
  const s = emp.averageScore;
  if (s >= 90) return `<span class="lb-badge excellent">🟢 Excelente</span>`;
  if (s >= 75) return `<span class="lb-badge acceptable">🟡 Aceitável</span>`;
  if (s >= 50) return `<span class="lb-badge attention">🟠 Atenção</span>`;
  return `<span class="lb-badge critical">🔴 Crítico</span>`;
}

// ── Ranking computation ────────────────────────────────────────────────────────

/**
 * Returns ALL employees from the catalog, enriched with inspection data
 * for the given lookback window.
 * Employees with inspections come first (sorted desc by averageScore),
 * then employees with no inspections in the period (badge "⚫ Sem avaliação").
 */
function computeEmployeeRanking(days) {
  const cutoff = Date.now() - days * 24 * 3600_000;
  const recent = allInspecoes.filter(i => (i.timestampEnvio || 0) >= cutoff);

  // Initialize map from full catalog
  const map = {};
  equipeLimpeza.forEach(emp => {
    map[emp.id] = {
      id:           emp.id,
      name:         emp.nome,
      cargo:        emp.cargo,
      scoreSum:     0,
      count:        0,
      zones:        getEmpZones(emp.id),
    };
  });

  // Aggregate inspection data
  recent.forEach(insp => {
    const empId = insp.employeeId;
    if (empId && map[empId]) {
      map[empId].scoreSum += insp.score || 0;
      map[empId].count++;
    } else if (insp.employeeName) {
      // Fallback: name-keyed entry for unknown IDs (legacy / contractors)
      const key = `_name_${insp.employeeName.trim()}`;
      if (!map[key]) {
        map[key] = { id: key, name: insp.employeeName.trim(), cargo: "", scoreSum: 0, count: 0, zones: [] };
      }
      map[key].scoreSum += insp.score || 0;
      map[key].count++;
    }
  });

  const withInsp = [];
  const noInsp   = [];

  Object.values(map).forEach(e => {
    const entry = {
      ...e,
      averageScore:     e.count > 0 ? Math.round(e.scoreSum / e.count) : 0,
      totalInspections: e.count,
    };
    if (e.count > 0) withInsp.push(entry);
    else             noInsp.push(entry);
  });

  withInsp.sort((a, b) => b.averageScore - a.averageScore);

  return [...withInsp, ...noInsp];
}

/**
 * Returns ALL zones from the catalog enriched with inspection averages and
 * team member names.
 * Zones with inspections come first (sorted desc); zones without come last.
 */
function computeZoneRanking(days) {
  const cutoff = Date.now() - days * 24 * 3600_000;
  const recent = allInspecoes.filter(i => (i.timestampEnvio || 0) >= cutoff);

  const map = {};

  // Initialize from full catalog
  catalogoZonas.forEach(cat => {
    const teamNames = (cat.responsaveis || [])
      .map(id => equipeLimpeza.find(e => e.id === id)?.nome || id);
    map[cat.id] = {
      zoneId:    cat.id,
      zoneName:  `${cat.icone} ${cat.nome}`,
      teamNames,
      scoreSum:  0,
      count:     0,
    };
  });

  // Aggregate inspection data
  recent.forEach(insp => {
    const id = insp.zoneId;
    if (!id || !map[id]) return;
    map[id].scoreSum += insp.score || 0;
    map[id].count++;
  });

  return Object.values(map)
    .map(z => ({
      ...z,
      averageScore: z.count > 0 ? Math.round(z.scoreSum / z.count) : null,
    }))
    .sort((a, b) => {
      if (a.averageScore === null && b.averageScore === null) return 0;
      if (a.averageScore === null) return 1;
      if (b.averageScore === null) return -1;
      return b.averageScore - a.averageScore;
    });
}

// ── Render podium ──────────────────────────────────────────────────────────────
function renderPodium(ranking) {
  if (!ranking.length || ranking.every(e => e.totalInspections === 0)) {
    podiumWrap.innerHTML = `<div class="empty-msg">📭 Sem dados para este período.</div>`;
    return;
  }

  // Only employees WITH inspections can be on the podium
  const withData = ranking.filter(e => e.totalInspections > 0);

  const slots = [
    { data: withData[1] || null, cls: "second", medal: "🥈", delay: ".1s" },
    { data: withData[0] || null, cls: "first",  medal: "🥇", delay: "0s"  },
    { data: withData[2] || null, cls: "third",  medal: "🥉", delay: ".2s" },
  ];

  const html = `<div class="podium">
    ${slots.map(slot => {
      if (!slot.data) return `
        <div class="podium-slot ${slot.cls}" style="animation-delay:${slot.delay};opacity:.3;">
          <div class="podium-medal">${slot.medal}</div>
          <div class="podium-name" style="color:#94a3b8;">—</div>
          <div class="podium-bar"></div>
        </div>`;

      const col      = scoreColor(slot.data.averageScore);
      const zoneText = slot.data.zones?.length
        ? `<div class="podium-zone">${slot.data.zones[0]}</div>`
        : "";
      return `
        <div class="podium-slot ${slot.cls}" style="animation-delay:${slot.delay};">
          <div class="podium-medal">${slot.medal}</div>
          <div class="podium-name">${slot.data.name}</div>
          ${zoneText}
          <div class="podium-score" style="color:${col};">${slot.data.averageScore}</div>
          <div class="podium-pct">%</div>
          <div class="podium-insp">📋 ${slot.data.totalInspections} inspeção(ões)</div>
          <div class="podium-bar"></div>
        </div>`;
    }).join("")}
  </div>`;

  podiumWrap.innerHTML = html;
}

// ── Render leaderboard (positions 4+ for those with data; all without data) ───
function renderLeaderboard(ranking) {
  // Positions 4+ from those with inspections, then all without
  const withData    = ranking.filter(e => e.totalInspections > 0);
  const withoutData = ranking.filter(e => e.totalInspections === 0);
  const rest        = [...withData.slice(3), ...withoutData];

  if (!rest.length) {
    leaderboardList.innerHTML = `<div class="empty-msg" style="padding:16px;">
      Apenas ${withData.length} participante(s) com dados neste período.
    </div>`;
    return;
  }

  leaderboardList.innerHTML = rest.map((emp, i) => {
    const pos      = withData.indexOf(emp) >= 0 ? withData.indexOf(emp) + 1 : "—";
    const col      = emp.totalInspections > 0 ? scoreColor(emp.averageScore) : "#94a3b8";
    const delay    = `${i * 0.05}s`;
    const zoneHtml = emp.zones?.length
      ? `<div class="lb-zone">📍 ${emp.zones[0]}</div>`
      : "";
    const metaHtml = emp.totalInspections > 0
      ? `📋 ${emp.totalInspections} inspeção(ões)`
      : `<span style="color:#94a3b8;">Nenhuma inspeção no período</span>`;
    const barHtml  = emp.totalInspections > 0
      ? `<div class="lb-bar-wrap">
           <div class="lb-bar" style="width:${emp.averageScore}%;background:${col};"></div>
         </div>`
      : "";
    const scoreHtml = emp.totalInspections > 0
      ? `<div class="lb-score" style="color:${col};">${emp.averageScore}%</div>`
      : `<div class="lb-score" style="color:#94a3b8;">—</div>`;

    return `
      <div class="leaderboard-item" style="animation-delay:${delay};">
        <div class="lb-pos other">${pos}</div>
        <div class="lb-body">
          <div class="lb-name">${emp.name}</div>
          ${zoneHtml}
          <div class="lb-meta">${metaHtml}</div>
          ${barHtml}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          ${perfBadge(emp)}
          ${scoreHtml}
        </div>
      </div>`;
  }).join("");
}

// ── Render zone ranking ────────────────────────────────────────────────────────
function renderZoneRanking(zoneRanking) {
  if (!zoneRanking.length) {
    zoneGrid.innerHTML = `<div style="grid-column:1/-1;" class="empty-msg">📭 Sem dados de zonas para este período.</div>`;
    return;
  }

  zoneGrid.innerHTML = zoneRanking.map((z, i) => {
    const hasData  = z.averageScore !== null;
    const col      = hasData ? scoreColor(z.averageScore) : "#94a3b8";
    const delay    = `${i * 0.07}s`;
    const teamHtml = z.teamNames?.length
      ? `<div class="zone-rank-team">👷 Equipe: ${z.teamNames.join(", ")}</div>`
      : "";
    const scoreDisp = hasData ? `${z.averageScore}%` : "—";
    const inspDisp  = z.count > 0
      ? `📋 ${z.count} inspeção(ões) no período`
      : `<span style="color:#94a3b8;">Sem inspeções no período</span>`;

    return `
      <div class="zone-rank-card" style="animation-delay:${delay};">
        <div class="zone-rank-num">${i + 1}º lugar</div>
        <div class="zone-rank-name">${z.zoneName}</div>
        ${teamHtml}
        <div class="zone-rank-score-row">
          <div class="zone-rank-score" style="color:${col};">${scoreDisp}</div>
          ${hasData ? `
            <div class="zone-rank-bar-wrap">
              <div class="zone-rank-bar" style="width:${z.averageScore}%;background:${col};"></div>
            </div>` : ""}
        </div>
        <div class="zone-rank-insp">${inspDisp}</div>
      </div>`;
  }).join("");
}

// ── Mode switcher ─────────────────────────────────────────────────────────────
function renderForMode(mode) {
  const days = mode === "weekly" ? 7 : 30;

  btnWeekly.classList.toggle("active",  mode === "weekly");
  btnMonthly.classList.toggle("active", mode === "monthly");

  const empRanking  = computeEmployeeRanking(days);
  const zoneRanking = computeZoneRanking(days);

  renderPodium(empRanking);
  renderLeaderboard(empRanking);
  renderZoneRanking(zoneRanking);
}

window._rankingSetMode = (mode) => {
  currentMode = mode;
  renderForMode(mode);
};

// ── Load ───────────────────────────────────────────────────────────────────────
async function iniciarRanking() {
  try {
    allInspecoes = await obterTodasInspecoes();
    renderForMode(currentMode);
  } catch (err) {
    console.error("[Ranking Limpeza] Erro ao carregar:", err);
    podiumWrap.innerHTML      = `<div class="empty-msg" style="color:#dc2626;">❌ Erro ao carregar dados. Recarregue a página.</div>`;
    leaderboardList.innerHTML = "";
    zoneGrid.innerHTML        = "";
  }
}

iniciarRanking();

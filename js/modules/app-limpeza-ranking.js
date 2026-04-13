/**
 * app-limpeza-ranking.js — Cleaning Performance Ranking Page (SIGA v2)
 *
 * Loads all inspection records once, computes weekly + monthly rankings
 * for both employees and zones, then renders:
 *  - Animated podium (top 3)
 *  - Full leaderboard (positions 4+)
 *  - Zone ranking grid
 *
 * Uses real employeeName from records — never raw IDs.
 */

import { checkAuth, getCurrentUser } from "../core/db-auth.js";
import { obterTodasInspecoes } from "../core/db-limpeza.js";
import { catalogoZonas } from "../data/dados-limpeza.js";

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
let allInspecoes = [];   // cached once
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

function posClass(i) {
  return i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "other";
}

const medals = ["🥇","🥈","🥉"];

// ── Ranking computation ────────────────────────────────────────────────────────
/**
 * Groups inspections by employeeName for the given lookback window.
 * Always uses real names — skips records without a name.
 */
function computeEmployeeRanking(days) {
  const cutoff = Date.now() - days * 24 * 3600_000;
  const recent = allInspecoes.filter(i => (i.timestampEnvio || 0) >= cutoff);

  const map = {};
  recent.forEach(insp => {
    const name = (insp.employeeName || "").trim();
    if (!name) return;
    if (!map[name]) map[name] = { name, scoreSum: 0, count: 0, zones: [] };
    map[name].scoreSum += insp.score || 0;
    map[name].count++;
    const z = insp.zoneName || insp.zoneId;
    if (z && !map[name].zones.includes(z)) map[name].zones.push(z);
  });

  return Object.values(map)
    .map(e => ({
      name:             e.name,
      averageScore:     e.count > 0 ? Math.round(e.scoreSum / e.count) : 0,
      totalInspections: e.count,
      topZone:          e.zones[0] || null,
    }))
    .sort((a, b) => b.averageScore - a.averageScore);
}

/**
 * Groups inspections by zoneId (enriched with catalog name) for the same window.
 */
function computeZoneRanking(days) {
  const cutoff = Date.now() - days * 24 * 3600_000;
  const recent = allInspecoes.filter(i => (i.timestampEnvio || 0) >= cutoff);

  const map = {};
  recent.forEach(insp => {
    const id = insp.zoneId;
    if (!id) return;
    if (!map[id]) {
      const cat = catalogoZonas.find(z => z.id === id);
      map[id] = {
        zoneId:    id,
        zoneName:  cat ? `${cat.icone} ${cat.nome}` : (insp.zoneName || id),
        scoreSum:  0,
        count:     0,
      };
    }
    map[id].scoreSum += insp.score || 0;
    map[id].count++;
  });

  return Object.values(map)
    .map(z => ({
      ...z,
      averageScore: z.count > 0 ? Math.round(z.scoreSum / z.count) : 0,
    }))
    .sort((a, b) => b.averageScore - a.averageScore);
}

// ── Render podium ──────────────────────────────────────────────────────────────
function renderPodium(ranking) {
  if (!ranking.length) {
    podiumWrap.innerHTML = `<div class="empty-msg">📭 Sem dados para este período.</div>`;
    return;
  }

  // Reorder for visual podium: 2nd (left), 1st (center), 3rd (right)
  const slots = [
    { data: ranking[1] || null, cls: "second", medal: "🥈", delay: ".1s" },
    { data: ranking[0] || null, cls: "first",  medal: "🥇", delay: "0s"  },
    { data: ranking[2] || null, cls: "third",  medal: "🥉", delay: ".2s" },
  ];

  const html = `<div class="podium">
    ${slots.map(slot => {
      if (!slot.data) return `<div class="podium-slot ${slot.cls}" style="animation-delay:${slot.delay};opacity:.3;">
        <div class="podium-medal">${slot.medal}</div>
        <div class="podium-name" style="color:#94a3b8;">—</div>
        <div class="podium-bar"></div>
      </div>`;

      const col = scoreColor(slot.data.averageScore);
      return `
        <div class="podium-slot ${slot.cls}" style="animation-delay:${slot.delay};">
          <div class="podium-medal">${slot.medal}</div>
          <div class="podium-name">${slot.data.name}</div>
          <div class="podium-score" style="color:${col};">${slot.data.averageScore}</div>
          <div class="podium-pct">%</div>
          <div class="podium-insp">📋 ${slot.data.totalInspections} inspeção(ões)</div>
          <div class="podium-bar"></div>
        </div>`;
    }).join("")}
  </div>`;

  podiumWrap.innerHTML = html;
}

// ── Render leaderboard (position 4+) ─────────────────────────────────────────
function renderLeaderboard(ranking) {
  const rest = ranking.slice(3); // positions 4+

  if (!rest.length) {
    leaderboardList.innerHTML = `<div class="empty-msg" style="padding:16px;">Apenas ${ranking.length} participante(s) neste período.</div>`;
    return;
  }

  leaderboardList.innerHTML = rest.map((emp, i) => {
    const pos   = i + 4;
    const col   = scoreColor(emp.averageScore);
    const delay = `${i * 0.05}s`;
    return `
      <div class="leaderboard-item" style="animation-delay:${delay};">
        <div class="lb-pos other">${pos}</div>
        <div class="lb-body">
          <div class="lb-name">${emp.name}</div>
          <div class="lb-meta">
            📋 ${emp.totalInspections} inspeção(ões)
            ${emp.topZone ? ` · 📍 ${emp.topZone}` : ""}
          </div>
          <div class="lb-bar-wrap">
            <div class="lb-bar" style="width:${emp.averageScore}%;background:${col};"></div>
          </div>
        </div>
        <div class="lb-score" style="color:${col};">${emp.averageScore}%</div>
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
    const col   = scoreColor(z.averageScore);
    const delay = `${i * 0.07}s`;
    return `
      <div class="zone-rank-card" style="animation-delay:${delay};">
        <div class="zone-rank-num">${i + 1}º lugar</div>
        <div class="zone-rank-name">${z.zoneName}</div>
        <div class="zone-rank-score-row">
          <div class="zone-rank-score" style="color:${col};">${z.averageScore}%</div>
          <div class="zone-rank-bar-wrap">
            <div class="zone-rank-bar" style="width:${z.averageScore}%;background:${col};"></div>
          </div>
        </div>
        <div class="zone-rank-insp">📋 ${z.count} inspeção(ões)</div>
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

// Expose to global so the non-module onclick bridge works
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

/**
 * app-limpeza.js — Cleaning Quality Dashboard Controller (SIGA v2)
 *
 * Renders:
 *  - KPI bar (avg score, inspections, open actions, critical zones, compliance)
 *  - Zone grid with live scores + status + last inspection
 *  - Employee + zone rankings
 *  - Critical alert banner
 */

import { checkAuth, getCurrentUser } from "../core/db-auth.js";
import { catalogoZonas, equipeLimpeza } from "../data/dados-limpeza.js";
import {
  obterPerformanceZonas,
  obterPerformanceFuncionarios,
  obterTodasInspecoes,
  STATUS_LIMPEZA,
  scoreToStatus,
} from "../core/db-limpeza.js";

await checkAuth("limpeza");
const perfil = await getCurrentUser();

// ── Header ────────────────────────────────────────────────────────────────────
const userEl   = document.getElementById("header-user");
const avatarEl = document.getElementById("header-avatar");
if (perfil?.nome) {
  if (userEl)   userEl.textContent   = perfil.nome;
  if (avatarEl) avatarEl.textContent = perfil.nome.charAt(0).toUpperCase();
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const gridZonas     = document.getElementById("grid-zonas");
const alertBanner   = document.getElementById("alert-banner");
const zonesLoading  = document.getElementById("zones-loading");

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("pt-BR", { day:"2-digit", month:"short", year:"numeric" });
}

function scoreColor(score) {
  if (score >= 90) return "#16a34a";
  if (score >= 75) return "#d97706";
  if (score >= 50) return "#ea580c";
  return "#dc2626";
}

function scoreBorder(score) {
  if (score >= 90) return "#86efac";
  if (score >= 75) return "#fde68a";
  if (score >= 50) return "#fed7aa";
  return "#fecaca";
}

// ── Phase 1 — Render zone cards from catalog ─────────────────────────────────
function renderZonesSkeleton() {
  if (!gridZonas) return;
  gridZonas.innerHTML = "";

  catalogoZonas.forEach(zona => {
    const responsavelNomes = (zona.responsaveis || [])
      .map(id => equipeLimpeza.find(e => e.id === id)?.nome || id)
      .join(", ");

    const urlAudit = `formulario-limpeza.html?zona_id=${zona.id}`;
    const urlHist  = `historico-limpeza.html?zona_id=${zona.id}`;

    gridZonas.insertAdjacentHTML("beforeend", `
      <div class="card-zona" id="card-${zona.id}">
        <div class="card-zona-topbar" id="topbar-${zona.id}" style="background:#e2e8f0;"></div>
        <div class="card-zona-body">
          <div class="card-zona-header">
            <div style="flex:1;min-width:0;">
              <div style="font-size:.68rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px;">${zona.id} · ${zona.setor}</div>
              <h3 class="zona-nome">${zona.icone} ${zona.nome}</h3>
              <div class="zona-setor">${zona.descricao}</div>
            </div>
            <div class="score-ring" id="ring-${zona.id}" style="border-color:#e2e8f0;color:#cbd5e1;">
              <span class="score-num">—</span>
              <span class="score-pct">%</span>
            </div>
          </div>

          <div class="zona-meta">
            <strong>👷</strong> ${responsavelNomes}
          </div>

          <div class="zona-last-insp" id="last-${zona.id}">
            <span style="color:#cbd5e1;font-size:.72rem;">Carregando última inspeção...</span>
          </div>

          <div class="card-zona-actions">
            <a href="${urlAudit}" class="btn-zona-action btn-audit">📋 Iniciar Auditoria</a>
            <a href="${urlHist}"  class="btn-zona-action btn-hist">📊 Histórico</a>
          </div>
        </div>
      </div>
    `);
  });

  if (zonesLoading) zonesLoading.style.display = "none";
}

// ── Phase 2 — Enrich with live data ──────────────────────────────────────────
async function enrichZones(zonaPerf) {
  // Build map zoneId → performance data
  const perfMap = {};
  zonaPerf.forEach(z => { perfMap[z.zoneId] = z; });

  catalogoZonas.forEach(zona => {
    const perf  = perfMap[zona.id];
    const score = perf?.latestScore ?? null;
    const col   = score !== null ? scoreColor(score)  : "#94a3b8";
    const brd   = score !== null ? scoreBorder(score) : "#e2e8f0";

    // Top bar
    const topbar = document.getElementById(`topbar-${zona.id}`);
    if (topbar) topbar.style.background = col;

    // Score ring
    const ring = document.getElementById(`ring-${zona.id}`);
    if (ring) {
      ring.style.borderColor = brd;
      ring.style.color       = col;
      ring.innerHTML = score !== null
        ? `<span class="score-num" style="color:${col};">${score}</span><span class="score-pct" style="color:${col};">%</span>`
        : `<span class="score-num" style="color:#cbd5e1;">—</span><span class="score-pct" style="color:#cbd5e1;">%</span>`;
    }

    // Last inspection
    const lastEl = document.getElementById(`last-${zona.id}`);
    if (lastEl && perf?.latestTs) {
      const statusMeta = STATUS_LIMPEZA[perf.latestStatus] || STATUS_LIMPEZA.attention;
      lastEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:2px;">
          <span style="background:${statusMeta.bg};color:${statusMeta.color};border:1px solid ${statusMeta.border};padding:1px 7px;border-radius:4px;font-size:.65rem;font-weight:700;">${statusMeta.label}</span>
          <span style="font-size:.68rem;color:#94a3b8;">${fmtDate(perf.latestTs)}</span>
        </div>
        <span style="font-size:.7rem;color:#475569;">👷 ${perf.latestEmployee || "—"} · ${perf.totalInspections} inspeção(ões)</span>`;
    } else if (lastEl) {
      lastEl.innerHTML = `<span style="color:#94a3b8;font-size:.72rem;">⚪ Sem inspeções registradas</span>`;
    }
  });
}

// ── KPI Bar ───────────────────────────────────────────────────────────────────
function renderKPIs(inspecoes, zonaPerf) {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 3600_000;
  const recent        = inspecoes.filter(i => (i.timestampEnvio || 0) >= thirtyDaysAgo);

  const avgScore   = recent.length
    ? Math.round(recent.reduce((s, i) => s + (i.score || 0), 0) / recent.length)
    : 0;
  const totalInsp  = recent.length;
  const critZones  = zonaPerf.filter(z => (z.latestScore ?? 100) < 50).length;
  const conformes  = zonaPerf.filter(z => (z.latestScore ?? 0) >= 75).length;
  const compliance = zonaPerf.length
    ? Math.round((conformes / zonaPerf.length) * 100)
    : 0;

  // Count open actions (inspections with issues and no linked WO)
  const openActions = inspecoes
    .filter(i => (i.timestampEnvio || 0) >= thirtyDaysAgo)
    .reduce((s, i) => s + (i.issues || []).filter(iss => !iss.linkedWOId).length, 0);

  const set = (id, val, color) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = val; if (color) el.style.color = color; }
  };

  set("kpi-avg-score",    `${avgScore}%`,      scoreColor(avgScore));
  set("kpi-total-insp",   totalInsp,            "#1e40af");
  set("kpi-open-actions", openActions,          openActions > 0 ? "#d97706" : "#16a34a");
  set("kpi-critical-zones", critZones,          critZones > 0 ? "#dc2626" : "#16a34a");
  set("kpi-compliance",   `${compliance}%`,     scoreColor(compliance));
}

// ── Alert Banner ──────────────────────────────────────────────────────────────
function renderAlerts(zonaPerf) {
  if (!alertBanner) return;
  const criticals  = zonaPerf.filter(z => (z.latestScore ?? 100) < 50);
  const attention  = zonaPerf.filter(z => { const s = z.latestScore ?? 100; return s >= 50 && s < 75; });
  const htmlParts  = [];

  if (criticals.length) {
    htmlParts.push(`
      <div class="alert-banner alert-critical">
        <span style="font-size:1.2rem;">⛔</span>
        <div>
          <strong>Zonas Críticas (score &lt; 50%):</strong>
          ${criticals.map(z => `<span style="font-weight:700;"> ${z.zoneName || z.zoneId}</span>`).join(",")}
          <div style="font-size:.78rem;margin-top:2px;">Ação corretiva imediata necessária.</div>
        </div>
      </div>`);
  }
  if (attention.length) {
    htmlParts.push(`
      <div class="alert-banner alert-warning">
        <span style="font-size:1.2rem;">⚠️</span>
        <div>
          <strong>Zonas em Atenção (50–74%):</strong>
          ${attention.map(z => `<span style="font-weight:700;"> ${z.zoneName || z.zoneId}</span>`).join(",")}
        </div>
      </div>`);
  }
  if (!criticals.length && !attention.length) {
    htmlParts.push(`
      <div class="alert-banner alert-ok">
        <span>🟢</span><strong>Todas as zonas em conformidade. Bom trabalho!</strong>
      </div>`);
  }

  alertBanner.innerHTML = htmlParts.join("");
  alertBanner.style.display = "block";
}

// ── Employee Ranking ──────────────────────────────────────────────────────────
function renderEmployeeRanking(ranking) {
  const el = document.getElementById("ranking-funcionarios");
  if (!el) return;

  if (!ranking.length) {
    el.innerHTML = `<p style="text-align:center;color:#94a3b8;font-size:.85rem;padding:16px;">Sem dados de funcionários.</p>`;
    return;
  }

  const statusBadge = (status) =>
    status === "top"              ? `<span class="rank-badge top">🟢 Top</span>`
    : status === "needs_improvement" ? `<span class="rank-badge mid">🟡 Melhorar</span>`
    : status === "critical"          ? `<span class="rank-badge low">🔴 Crítico</span>`
    : "";

  const posClass = (i) => i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "other";
  const medals   = ["🥇","🥈","🥉"];

  el.innerHTML = ranking.slice(0, 6).map((emp, i) => `
    <div class="ranking-item">
      <div class="rank-pos ${posClass(i)}">${medals[i] || i + 1}</div>
      <div class="rank-name" title="${emp.employeeName}">${emp.employeeName}</div>
      ${statusBadge(emp.status)}
      <div class="rank-score" style="color:${scoreColor(emp.averageScore)};">${emp.averageScore}%</div>
    </div>
  `).join("");
}

// ── Zone Ranking ──────────────────────────────────────────────────────────────
function renderZoneRanking(zonaPerf) {
  const el = document.getElementById("ranking-zonas");
  if (!el) return;

  if (!zonaPerf.length) {
    el.innerHTML = `<p style="text-align:center;color:#94a3b8;font-size:.85rem;padding:16px;">Sem dados de zonas.</p>`;
    return;
  }

  // Enrich with catalog names/icons
  const enriched = zonaPerf.map(z => {
    const cat = catalogoZonas.find(c => c.id === z.zoneId);
    return { ...z, zoneName: cat ? `${cat.icone} ${cat.nome}` : z.zoneName || z.zoneId };
  });

  el.innerHTML = enriched.map((z, i) => {
    const score = z.averageScore;
    const meta  = STATUS_LIMPEZA[scoreToStatus(score)] || STATUS_LIMPEZA.critical;
    return `
      <div class="ranking-item" onclick="window.location='historico-limpeza.html?zona_id=${z.zoneId}'" style="cursor:pointer;">
        <div class="rank-pos other">${i + 1}</div>
        <div class="rank-name" title="${z.zoneName}">${z.zoneName}</div>
        <span style="background:${meta.bg};color:${meta.color};border:1px solid ${meta.border};padding:1px 6px;border-radius:4px;font-size:.65rem;font-weight:700;white-space:nowrap;">${meta.label}</span>
        <div class="rank-score" style="color:${scoreColor(score)};">${score}%</div>
      </div>`;
  }).join("");
}

// ── Ranking computation (weekly / monthly) ────────────────────────────────────
/**
 * Computes employee ranking for a given lookback window.
 * Uses real employeeName from inspection records (NOT employee IDs).
 * @param {Array}  inspecoes  — all inspection records
 * @param {number} days       — lookback window in days (7 or 30)
 * @returns {Array} sorted desc by averageScore
 */
export function computeRanking(inspecoes, days) {
  const cutoff = Date.now() - days * 24 * 3600_000;
  const recent = inspecoes.filter(i => (i.timestampEnvio || 0) >= cutoff);

  const map = {};
  recent.forEach(insp => {
    const name = (insp.employeeName || "").trim();
    if (!name) return;
    if (!map[name]) map[name] = { name, scoreSum: 0, count: 0, zones: [] };
    map[name].scoreSum += insp.score || 0;
    map[name].count++;
    if (insp.zoneName || insp.zoneId) {
      const z = insp.zoneName || insp.zoneId;
      if (!map[name].zones.includes(z)) map[name].zones.push(z);
    }
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

// ── Champion cards (weekly + monthly) ────────────────────────────────────────
function renderChampionCard(cardId, champion, badgeLabel, medalEmoji) {
  const el = document.getElementById(cardId);
  if (!el) return;

  // Keep existing badge + medal, replace content area only
  if (!champion) {
    const badge = el.querySelector(".champion-badge").outerHTML;
    el.innerHTML = `
      ${badge}
      <div class="champion-medal">${medalEmoji}</div>
      <p class="champion-empty" style="margin:8px 0 0;">Sem dados disponíveis.</p>`;
    return;
  }

  const badge = el.querySelector(".champion-badge").outerHTML;
  el.innerHTML = `
    ${badge}
    <div class="champion-medal">${medalEmoji}</div>
    <div class="champion-name">${champion.name}</div>
    <div class="champion-score">${champion.averageScore}%</div>
    <div class="champion-meta">
      📋 ${champion.totalInspections} inspeção(ões)
      ${champion.topZone ? ` · 📍 ${champion.topZone}` : ""}
    </div>`;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function iniciarPainelLimpeza() {
  renderZonesSkeleton();

  try {
    const [zonaPerf, empPerf, inspecoes] = await Promise.all([
      obterPerformanceZonas().catch(() => []),
      obterPerformanceFuncionarios().catch(() => []),
      obterTodasInspecoes().catch(() => []),
    ]);

    enrichZones(zonaPerf);
    renderKPIs(inspecoes, zonaPerf);
    renderAlerts(zonaPerf);
    renderEmployeeRanking(empPerf);
    renderZoneRanking(zonaPerf);

    // Champion cards (use raw inspecoes so we can slice by date)
    const weekRanking  = computeRanking(inspecoes, 7);
    const monthRanking = computeRanking(inspecoes, 30);
    renderChampionCard("champion-weekly",  weekRanking[0]  || null, "🔥 Destaque Semanal",  "🥇");
    renderChampionCard("champion-monthly", monthRanking[0] || null, "⭐ Destaque Mensal",    "🏆");

  } catch (err) {
    console.error("[Limpeza] Erro ao carregar painel:", err);
    if (alertBanner) {
      alertBanner.innerHTML = `<div class="alert-banner alert-critical"><span>⚠️</span><strong>Falha ao conectar. Recarregue a página.</strong></div>`;
      alertBanner.style.display = "block";
    }
  }
}

iniciarPainelLimpeza();

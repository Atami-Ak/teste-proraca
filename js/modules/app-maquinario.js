/**
 * app-maquinario.js — Industrial Asset Dashboard Controller (CMMS)
 *
 * Architecture:
 *  - Renders machine grid immediately from local catalog (maquinas-db.js)
 *  - Enriches cards async: machine_state → status/KPIs, machine_inspections → last event
 *  - Fleet Health Summary Bar shows count per status across all machines
 *  - Alert banner surfaces critical/stopped/overdue machines at top
 *  - 3 action buttons per card: Nova Inspeção / Nova Manutenção / Ver Histórico
 */

import { checkAuth, getCurrentUser } from "../core/db-auth.js";
import { maquinasDB } from "../data/maquinas-db.js";
import {
  getMachineStates,
  STATUS_META,
  calcularKPIsLegacy,
  getEffectiveStatus,
  trendLabel,
} from "../core/machine-state-engine.js";

await checkAuth("maquinario");
const perfil = await getCurrentUser();

// ── DOM refs ─────────────────────────────────────────────────────────────────

const gridAtivos  = document.getElementById("grid-ativos");
const alertBanner = document.getElementById("alert-banner");

// User info in header
const headerName   = document.getElementById("header-user-name");
const headerAvatar = document.getElementById("header-avatar");
if (perfil?.nome) {
  if (headerName)   headerName.textContent  = perfil.nome;
  if (headerAvatar) headerAvatar.textContent = perfil.nome.charAt(0).toUpperCase();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function obterTs(reg) {
  if (reg.timestampEnvio)                              return reg.timestampEnvio;
  if (reg.dataCriacaoOficial?.toMillis)                return reg.dataCriacaoOficial.toMillis();
  if (reg.dataCriacaoOficial?.seconds)                 return reg.dataCriacaoOficial.seconds * 1000;
  if (reg.createdAt?.toMillis)                         return reg.createdAt.toMillis();
  if (reg.createdAt?.seconds)                          return reg.createdAt.seconds * 1000;
  return 0;
}

function statusTopBar(statusKey) {
  const meta = STATUS_META[statusKey] || STATUS_META.operational;
  return `<div class="card-top-bar" style="background:${meta.color};"></div>`;
}

function statusBadgeHtml(statusKey) {
  const meta = STATUS_META[statusKey] || STATUS_META.operational;
  return `<span class="card-status-badge"
                style="background:${meta.bg};color:${meta.color};border-color:${meta.border};">
            ${meta.icon} ${meta.label}
          </span>`;
}

// ── Phase 1 — Render all cards synchronously from local catalog ───────────────

function renderGrid(stateMap) {
  if (!gridAtivos) return;
  gridAtivos.innerHTML = "";

  maquinasDB.filter(m => m.ativo !== false).forEach(maq => {
    const statusKey = getEffectiveStatus(stateMap[maq.id]);
    const urlInsp   = `inspecao-maquina.html?machineId=${maq.id}`;
    const urlHist   = `historico-maquina.html?id=${maq.id}&nome=${encodeURIComponent(maq.nome)}`;
    const urlWO     = `formulario-maquinario.html?id=${maq.id}&nome=${encodeURIComponent(maq.nome)}`;

    const subLabel = [maq.fabricante, maq.modelo, maq.potenciaKw ? maq.potenciaKw + " kW" : ""]
      .filter(Boolean).join(" · ");

    gridAtivos.insertAdjacentHTML("beforeend", `
      <div class="card-ativo-grid" id="card-${maq.id}"
           data-machineid="${maq.id}"
           data-machinename="${maq.nome}"
           style="cursor:pointer;">
        ${statusTopBar(statusKey)}
        <div class="card-grid-body">

          <div class="card-grid-header">
            <div style="min-width:0;flex:1;">
              <div class="card-machine-id">${maq.id}</div>
              <h3 class="card-machine-name">${maq.icone || "⚙️"} ${maq.nome}</h3>
              <div class="card-machine-sub">${maq.setor}${subLabel ? " · " + subLabel : ""}</div>
            </div>
            <div id="badge-${maq.id}">${statusBadgeHtml(statusKey)}</div>
          </div>

          <div class="card-kpi-row" id="kpi-${maq.id}">
            <span class="kpi-loading kpi-chip">Carregando KPIs…</span>
          </div>

          <div class="card-last-event" id="last-${maq.id}">
            <span style="color:#cbd5e1;">Buscando último evento…</span>
          </div>

          <div class="card-actions" id="actions-${maq.id}">
            <a href="${urlInsp}" class="btn-card-action btn-insp"
               onclick="event.stopPropagation()">🔍 Nova<br>Inspeção</a>
            <a href="${urlWO}" class="btn-card-action btn-maint" id="btn-wo-${maq.id}"
               onclick="event.stopPropagation()">🔧 Nova<br>O.S.</a>
            <a href="${urlHist}" class="btn-card-action btn-hist"
               onclick="event.stopPropagation()">📊 Ver<br>Histórico</a>
          </div>

        </div>
      </div>
    `);
  });

  // Attach click handlers to open machine detail modal
  maquinasDB.filter(m => m.ativo !== false).forEach(maq => {
    const card = document.getElementById(`card-${maq.id}`);
    if (card) {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".card-actions")) return;
        abrirModalMaquina(maq.id, maq.nome);
      });
    }
  });
}

// ── Phase 2 — Fleet Health Summary Bar ───────────────────────────────────────

function renderFleetHealth(stateMap) {
  const counts = { operational: 0, attention: 0, preventive_due: 0, in_maintenance: 0, stopped: 0, critical: 0 };
  maquinasDB.filter(m => m.ativo !== false).forEach(m => {
    const s = getEffectiveStatus(stateMap[m.id]);
    if (counts[s] !== undefined) counts[s]++;
    else counts.operational++;
  });

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("fhb-op",    counts.operational);
  set("fhb-att",   counts.attention);
  set("fhb-prev",  counts.preventive_due);
  set("fhb-maint", counts.in_maintenance);
  set("fhb-stop",  counts.stopped);
  set("fhb-crit",  counts.critical);
}

// ── Phase 2 — Alert banner ────────────────────────────────────────────────────

function renderAlerts(stateMap) {
  if (!alertBanner) return;

  const criticals     = maquinasDB.filter(m => { const s = getEffectiveStatus(stateMap[m.id]); return s === "critical" || s === "stopped"; });
  const attentions    = maquinasDB.filter(m => getEffectiveStatus(stateMap[m.id]) === "attention");
  const preventiveDue = maquinasDB.filter(m => getEffectiveStatus(stateMap[m.id]) === "preventive_due");

  const html = [];

  if (criticals.length) {
    html.push(`
      <div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:8px;padding:12px 16px;display:flex;align-items:flex-start;gap:10px;">
        <span style="font-size:1.3rem;line-height:1;">⛔</span>
        <div>
          <strong style="color:#dc2626;">Máquinas críticas / paradas:</strong>
          <span style="color:#7f1d1d;"> ${criticals.map(m => m.nome).join(", ")}</span>
          <div style="font-size:.78rem;color:#7f1d1d;margin-top:2px;">Intervenção imediata necessária.</div>
        </div>
      </div>`);
  }
  if (attentions.length) {
    html.push(`
      <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:8px;padding:12px 16px;display:flex;align-items:flex-start;gap:10px;">
        <span style="font-size:1.3rem;line-height:1;">⚠️</span>
        <div>
          <strong style="color:#92400e;">Máquinas em atenção:</strong>
          <span style="color:#78350f;"> ${attentions.map(m => m.nome).join(", ")}</span>
        </div>
      </div>`);
  }
  if (preventiveDue.length) {
    html.push(`
      <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:8px;padding:12px 16px;display:flex;align-items:flex-start;gap:10px;">
        <span style="font-size:1.3rem;line-height:1;">🔵</span>
        <div>
          <strong style="color:#1d4ed8;">Preventiva devida (> 30 dias):</strong>
          <span style="color:#1e40af;"> ${preventiveDue.map(m => m.nome).join(", ")}</span>
        </div>
      </div>`);
  }

  if (html.length > 0) {
    alertBanner.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;">${html.join("")}</div>`;
    alertBanner.style.display = "block";
  } else {
    alertBanner.innerHTML = `
      <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:8px;">
        <span>🟢</span><strong style="color:#166534;">Todos os ativos operacionais.</strong>
      </div>`;
    alertBanner.style.display = "block";
  }
}

// ── Phase 3 — Enrich cards with KPIs + last event + smart WO button ──────────

async function enrichCards(stateMap, kpisMap) {
  const { obterInspecoesRecentes } = await import("../core/db-maquinas.js");
  const { getWorkOrdersByMachine }  = await import("../core/db-unified.js");

  // Load recent inspections once (sorted desc by timestamp)
  let recentes = [];
  try {
    recentes = await obterInspecoesRecentes(100);
  } catch (e) {
    console.warn("[Dashboard] Erro ao carregar inspeções recentes:", e);
  }

  // Index: machineId → most recent inspection (from machine_inspections)
  const ultimaInsp = {};
  recentes.forEach(reg => {
    if (!ultimaInsp[reg.machineId]) ultimaInsp[reg.machineId] = reg;
  });

  // Enrich each card in parallel
  await Promise.all(maquinasDB.filter(m => m.ativo !== false).map(async (maq) => {
    const cardEl  = document.getElementById(`card-${maq.id}`);
    const badgeEl = document.getElementById(`badge-${maq.id}`);
    const kpiEl   = document.getElementById(`kpi-${maq.id}`);
    const lastEl  = document.getElementById(`last-${maq.id}`);
    if (!cardEl) return;

    // Update status from live state
    const statusKey = getEffectiveStatus(stateMap[maq.id]);
    const meta      = STATUS_META[statusKey] || STATUS_META.operational;

    // Refresh top bar color
    const topBar = cardEl.querySelector(".card-top-bar");
    if (topBar) topBar.style.background = meta.color;

    // Refresh status badge
    if (badgeEl) badgeEl.innerHTML = statusBadgeHtml(statusKey);

    // KPI chips
    if (kpiEl) {
      try {
        const kpis = kpisMap[maq.id];
        const chips = [];
        if (kpis?.mtbfHours !== null && kpis?.mtbfHours !== undefined) {
          const col = kpis.mtbfHours < 24 ? "#dc2626" : kpis.mtbfHours < 72 ? "#d97706" : "#16a34a";
          chips.push(`<span class="kpi-chip" style="color:${col};" title="Tempo Médio Entre Falhas">MTBF ${kpis.mtbfHours}h</span>`);
        }
        if (kpis?.mttrHours !== null && kpis?.mttrHours !== undefined) {
          chips.push(`<span class="kpi-chip" style="color:#7c3aed;" title="Tempo Médio de Reparo">MTTR ${kpis.mttrHours}h</span>`);
        }
        if (kpis?.recentFailures > 0) {
          chips.push(`<span class="kpi-chip" style="background:#fef2f2;color:#dc2626;border-color:#fecaca;" title="Paradas nos últimos 7 dias">${kpis.recentFailures} falha(s)/7d</span>`);
        }
        if (kpis?.totalRegistros >= 6) {
          const tl = trendLabel(kpis.trend);
          chips.push(`<span class="kpi-chip" style="color:${tl.color};" title="Tendência recente">${tl.label}</span>`);
        }
        kpiEl.innerHTML = chips.length
          ? chips.join("")
          : `<span class="kpi-chip" style="color:#94a3b8;">Sem histórico de manutenção</span>`;
      } catch (e) {
        kpiEl.innerHTML = "";
      }
    }

    // Load WOs in parallel to find open ones + last WO event
    let openWO = null;
    let lastWO = null;
    try {
      const wos = await getWorkOrdersByMachine(maq.id);
      openWO = wos.find(w => w.status === "open" || w.status === "in_progress") || null;
      lastWO = wos[0] || null; // already sorted desc
    } catch (_) {}

    // ── Smart WO action button ───────────────────────────────────────────
    const woBtn = document.getElementById(`btn-wo-${maq.id}`);
    if (woBtn) {
      if (openWO) {
        woBtn.href        = `formulario-maquinario.html?os_id=${openWO.id}`;
        woBtn.className   = "btn-card-action btn-wo-open";
        woBtn.innerHTML   = `⚠️ Continuar<br>O.S. Aberta`;
        woBtn.style.cssText = "background:#fffbeb;color:#92400e;border-color:#fbbf24;";
      } else {
        woBtn.href        = `formulario-maquinario.html?id=${maq.id}&nome=${encodeURIComponent(maq.nome)}`;
        woBtn.className   = "btn-card-action btn-maint";
        woBtn.innerHTML   = `🔧 Nova<br>O.S.`;
        woBtn.style.cssText = "";
      }
    }

    // ── Last event display (unified: WO or inspection) ───────────────────
    if (lastEl) {
      // Pick whichever is more recent: last WO vs last inspection from machine_inspections
      const lastWOts   = lastWO   ? (lastWO.timestampEnvio || 0)   : 0;
      const ultimaInspLocal = ultimaInsp[maq.id];
      const lastInspTs = ultimaInspLocal ? obterTs(ultimaInspLocal) : 0;

      if (lastWOts === 0 && lastInspTs === 0) {
        lastEl.innerHTML = `<span style="color:#94a3b8;">Nenhum registro encontrado</span>`;
        return;
      }

      if (lastWOts >= lastInspTs && lastWO) {
        // Last event was a WO
        const ts   = fmt(lastWOts);
        const isInsp = lastWO.type === "inspection";
        const badgeColor = isInsp ? "#1e40af" : "#c2410c";
        const badgeBg    = isInsp ? "#eff6ff"  : "#fff7ed";
        const badgeTxt   = isInsp ? "👁 Inspeção" : "🔧 Manutenção";
        const statusIcons = { open:"🔵 Aberta", in_progress:"🟡 Em Andamento", completed:"✅ Concluída", waiting_parts:"⏳ Ag. Peças" };
        const statusTxt = statusIcons[lastWO.status] || lastWO.status;
        const tech = lastWO.assignedTo || lastWO.criadoPor || "—";

        lastEl.innerHTML = `
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:3px;">
            <span style="background:${badgeBg};color:${badgeColor};border:1px solid;border-color:${badgeColor}30;padding:1px 7px;border-radius:4px;font-size:.67rem;font-weight:700;">${badgeTxt}</span>
            <span style="font-size:.7rem;color:#64748b;">${statusTxt}</span>
          </div>
          <strong style="font-size:.75rem;color:#475569;">${lastWO.title || "Sem título"}</strong><br>
          <span style="font-size:.7rem;color:#94a3b8;">${ts} · ${tech}</span>`;
      } else if (ultimaInspLocal) {
        // Last event was a raw machine_inspection
        const ts   = lastInspTs ? fmt(lastInspTs) : ultimaInspLocal.data || "—";
        const statusInsp  = ultimaInspLocal.status || "—";
        const colorMap    = { CRITICAL: "#dc2626", ATTENTION: "#d97706", OK: "#16a34a" };
        const cor         = colorMap[statusInsp] || "#64748b";
        const icon        = statusInsp === "CRITICAL" ? "⛔" : statusInsp === "ATTENTION" ? "⚠️" : "✅";
        const inspector   = ultimaInspLocal.inspector || ultimaInspLocal.inspetor || "—";

        lastEl.innerHTML = `
          <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">
            <span style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;padding:1px 7px;border-radius:4px;font-size:.67rem;font-weight:700;">👁 Inspeção</span>
            <span style="font-size:.7rem;color:${cor};">${icon} ${statusInsp}</span>
          </div>
          <span style="font-size:.7rem;color:#94a3b8;">${ts} · ${inspector}</span>`;
      }
    }
  }));
}

// ── Machine Detail Modal ──────────────────────────────────────────────────────

async function abrirModalMaquina(machineId, machineName) {
  const modal = document.getElementById("machine-detail-modal");
  if (!modal) return;

  const maq = maquinasDB.find(m => m.id === machineId);
  const urlHist = `historico-maquina.html?id=${machineId}&nome=${encodeURIComponent(machineName)}`;
  const urlWO   = `formulario-maquinario.html?id=${machineId}&nome=${encodeURIComponent(machineName)}`;
  const urlInsp = `inspecao-maquina.html?machineId=${machineId}`;

  // Show loading state
  document.getElementById("modal-machine-title").textContent   = machineName;
  document.getElementById("modal-machine-id").textContent      = machineId;
  document.getElementById("modal-machine-setor").textContent   = maq?.setor || "—";
  document.getElementById("modal-machine-status-badge").textContent = "Carregando...";
  document.getElementById("modal-history-list").innerHTML      = `
    <div style="text-align:center;padding:24px;color:#94a3b8;">
      <div style="width:28px;height:28px;border:3px solid #e2e8f0;border-top-color:#004a99;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 8px;"></div>
      Carregando histórico...
    </div>`;
  document.getElementById("modal-btn-hist").href  = urlHist;
  document.getElementById("modal-btn-insp").href  = urlInsp;
  document.getElementById("modal-btn-wo").href    = urlWO;
  document.getElementById("modal-btn-wo").textContent = "🔧 Nova O.S.";

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  // Load data
  try {
    const { getWorkOrdersByMachine }     = await import("../core/db-unified.js");
    const { obterHistoricoMaquina }      = await import("../core/db-maquinas.js");
    const { getMachineState, STATUS_META: SM } = await import("../core/machine-state-engine.js");

    const [wos, inspections, machineState] = await Promise.all([
      getWorkOrdersByMachine(machineId).catch(() => []),
      obterHistoricoMaquina(machineId).catch(() => []),
      getMachineState(machineId).catch(() => null),
    ]);

    // Status badge
    if (machineState) {
      const { getEffectiveStatus: ges } = await import("../core/machine-state-engine.js");
      const sk   = ges(machineState);
      const meta = SM[sk] || SM.operational;
      const badge = document.getElementById("modal-machine-status-badge");
      if (badge) {
        badge.textContent = `${meta.icon} ${meta.label}`;
        badge.style.cssText = `background:${meta.bg};color:${meta.color};border:1.5px solid ${meta.border};padding:4px 12px;border-radius:99px;font-weight:700;font-size:.8rem;`;
      }
    } else {
      document.getElementById("modal-machine-status-badge").textContent = "—";
    }

    // Smart WO button
    const openWO = wos.find(w => w.status === "open" || w.status === "in_progress");
    const woBtn  = document.getElementById("modal-btn-wo");
    if (openWO && woBtn) {
      woBtn.href        = `formulario-maquinario.html?os_id=${openWO.id}`;
      woBtn.textContent = "⚠️ Continuar O.S. Aberta";
      woBtn.style.cssText = "background:#fffbeb;color:#92400e;border-color:#fbbf24;";
    }

    // Normalize + merge all records
    const fmtDt = (ts) => {
      if (!ts) return "—";
      return new Date(ts).toLocaleDateString("pt-BR") + " " + new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    };

    const normalizedWOs = wos.map(wo => {
      const ts = wo.scheduling?.actualEnd || wo.scheduling?.actualStart || wo.timestampEnvio || 0;
      const isInsp = wo.type === "inspection";
      return { _type: "work_order", id: wo.id, _ts: ts, _raw: wo, isInsp };
    });

    const normalizedInsp = inspections.map(insp => ({
      _type: "inspection", id: insp.id, _ts: insp.timestampEnvio || 0, _raw: insp, isInsp: true,
    }));

    const allRecords = [...normalizedWOs, ...normalizedInsp].sort((a, b) => b._ts - a._ts);

    // Last record highlight
    const lastRecordEl = document.getElementById("modal-last-record");
    if (allRecords.length && lastRecordEl) {
      const last = allRecords[0];
      const raw  = last._raw;
      if (last._type === "work_order") {
        const isInsp      = last.isInsp;
        const badgeColor  = isInsp ? "#1e40af" : "#c2410c";
        const badgeBg     = isInsp ? "#eff6ff"  : "#fff7ed";
        const badgeTxt    = isInsp ? "👁 Inspeção" : "🔧 Manutenção";
        const statusIcons = { open:"🔵 Aberta", in_progress:"🟡 Em Andamento", completed:"✅ Concluída", waiting_parts:"⏳ Ag. Peças" };
        const statusTxt   = statusIcons[raw.status] || raw.status || "—";
        const tech        = raw.assignedTo || raw.criadoPor || "—";

        lastRecordEl.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
            <span style="background:${badgeBg};color:${badgeColor};border:1.5px solid ${badgeColor}30;padding:2px 9px;border-radius:4px;font-size:.72rem;font-weight:700;">${badgeTxt}</span>
            <span style="font-size:.78rem;font-weight:600;color:#475569;">${statusTxt}</span>
          </div>
          <div style="font-size:.9rem;font-weight:700;color:#0f172a;margin-bottom:3px;">${raw.title || "Sem título"}</div>
          <div style="font-size:.78rem;color:#64748b;">👷 ${tech} · ${fmtDt(last._ts)}</div>
          ${raw.downtime ? `<div style="font-size:.75rem;color:#7c3aed;margin-top:3px;">⏱ Downtime: ${raw.downtime}h</div>` : ""}`;
      } else {
        const insp     = raw;
        const statusM  = { OK:"✅ Conforme", ATTENTION:"⚠️ Atenção", CRITICAL:"⛔ Crítico" };
        const cor      = { OK:"#16a34a", ATTENTION:"#d97706", CRITICAL:"#dc2626" };
        const s        = insp.status || "OK";
        lastRecordEl.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
            <span style="background:#eff6ff;color:#1e40af;border:1.5px solid #bfdbfe;padding:2px 9px;border-radius:4px;font-size:.72rem;font-weight:700;">👁 Inspeção</span>
            <span style="font-size:.78rem;font-weight:700;color:${cor[s] || "#475569"};">${statusM[s] || s}</span>
          </div>
          <div style="font-size:.85rem;color:#475569;margin-bottom:3px;">${insp.diagnosis || "Sem diagnóstico"}</div>
          <div style="font-size:.78rem;color:#64748b;">🔍 ${insp.inspector || "—"} · ${fmtDt(last._ts)}</div>`;
      }
    } else if (lastRecordEl) {
      lastRecordEl.innerHTML = `<p style="color:#94a3b8;font-size:.85rem;margin:0;">Nenhum registro encontrado.</p>`;
    }

    // Full history list (last 10)
    const histEl = document.getElementById("modal-history-list");
    if (!histEl) return;

    if (!allRecords.length) {
      histEl.innerHTML = `<p style="color:#94a3b8;text-align:center;padding:20px;">Sem registros para este ativo.</p>`;
      return;
    }

    histEl.innerHTML = allRecords.slice(0, 10).map(item => {
      const raw = item._raw;
      const ts  = fmtDt(item._ts);

      if (item._type === "work_order") {
        const isInsp      = item.isInsp;
        const badgeColor  = isInsp ? "#1e40af" : "#c2410c";
        const badgeBg     = isInsp ? "#eff6ff"  : "#fff7ed";
        const badgeTxt    = isInsp ? "👁 Inspeção" : "🔧 Manutenção";
        const statusIcons = { open:"🔵 Aberta", in_progress:"🟡 Em Andamento", completed:"✅ Concluída", waiting_parts:"⏳ Ag. Peças" };
        const statusTxt   = statusIcons[raw.status] || raw.status || "—";

        return `<div class="modal-hist-item" onclick="window.location='detalhes-relatorio.html?id=${item.id}'"
                    style="cursor:pointer;padding:10px 12px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:8px;background:white;">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:4px;">
            <span style="background:${badgeBg};color:${badgeColor};border:1px solid ${badgeColor}30;padding:1px 7px;border-radius:4px;font-size:.67rem;font-weight:700;">${badgeTxt}</span>
            <span style="font-size:.72rem;color:#475569;">${statusTxt}</span>
            ${raw.downtime ? `<span style="background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;padding:1px 6px;border-radius:4px;font-size:.67rem;font-weight:600;">⏱ ${raw.downtime}h</span>` : ""}
          </div>
          <div style="font-size:.83rem;font-weight:600;color:#0f172a;margin-bottom:2px;">${raw.title || "Sem título"}</div>
          <div style="font-size:.72rem;color:#94a3b8;">👷 ${raw.assignedTo || raw.criadoPor || "—"} · ${ts}</div>
        </div>`;
      } else {
        const statusM = { OK:"✅ Conforme", ATTENTION:"⚠️ Atenção", CRITICAL:"⛔ Crítico" };
        const cor     = { OK:"#16a34a", ATTENTION:"#d97706", CRITICAL:"#dc2626" };
        const s       = raw.status || "OK";
        return `<div class="modal-hist-item"
                    style="padding:10px 12px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:8px;background:white;">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:4px;">
            <span style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;padding:1px 7px;border-radius:4px;font-size:.67rem;font-weight:700;">👁 Inspeção</span>
            <span style="font-size:.72rem;font-weight:700;color:${cor[s] || "#475569"};">${statusM[s] || s}</span>
          </div>
          <div style="font-size:.83rem;color:#475569;margin-bottom:2px;">${raw.diagnosis || raw.recommendation || "Sem diagnóstico"}</div>
          <div style="font-size:.72rem;color:#94a3b8;">🔍 ${raw.inspector || "—"} · ${ts}</div>
        </div>`;
      }
    }).join("");

  } catch (err) {
    console.error("[Modal Máquina] Erro ao carregar:", err);
    document.getElementById("modal-history-list").innerHTML = `
      <p style="color:#dc2626;text-align:center;padding:16px;">Falha ao carregar histórico.</p>`;
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function iniciarDashboard() {
  const ids = maquinasDB.filter(m => m.ativo !== false).map(m => m.id);

  // Load machine states + KPIs in parallel
  const [stateMap, ...kpisArray] = await Promise.all([
    getMachineStates(ids),
    ...ids.map(id => calcularKPIsLegacy(id).catch(() => null)),
  ]);

  const kpisMap = {};
  ids.forEach((id, i) => { kpisMap[id] = kpisArray[i]; });

  // Render skeleton grid immediately
  renderGrid(stateMap);
  renderFleetHealth(stateMap);
  renderAlerts(stateMap);

  // Enrich cards with live data
  enrichCards(stateMap, kpisMap);
}

iniciarDashboard();

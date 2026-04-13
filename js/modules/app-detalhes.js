/**
 * app-detalhes.js — Professional CMMS Report Builder
 *
 * Renders an 8-section work order report for a single historico_manutencao document:
 *
 *  ① Status Transition (before → after with colored chips)
 *  ② Maintenance Classification (type, priority, date, technician)
 *  ③ Downtime Analysis (start, end, duration, stop required)
 *  ④ Root Cause Analysis (failure component, symptom, root cause)
 *  ⑤ Actions Taken & Parts (action, BOM table)
 *  ⑥ Technical Report (full free-text)
 *  ⑦ KPI Snapshot (MTBF, MTTR, total failures, downtime, trend)
 *  ⑧ Related Work Orders & Purchase Orders
 *
 * Plus: Photo evidence gallery, Execute Pending WO CTA
 */

import { checkAuth, getCurrentUser } from "../core/db-auth.js";
import { obterRelatorioPorId } from "../core/db.js";
import {
  getMachineState,
  calcularKPIsLegacy,
  STATUS_META,
  TIPO_META,
  PRIORIDADE_META,
  normalizarStatusLegacy,
  getEffectiveStatus,
  trendLabel,
} from "../core/machine-state-engine.js";

await checkAuth("detalhes-relatorio");

const perfil = await getCurrentUser();
if (perfil) {
  const el = document.getElementById("topbar-user");
  const av = document.getElementById("topbar-avatar");
  if (el) el.textContent = perfil.nome;
  if (av) av.textContent = (perfil.nome?.[0] || "O").toUpperCase();
}

// ─── URL param ────────────────────────────────────────────────────────────────
const params      = new URLSearchParams(window.location.search);
const idRelatorio = params.get("id");

const loadingEl  = document.getElementById("loading-state");
const reportRoot = document.getElementById("report-root");

// ── Timeout guard: 10s ───────────────────────────────────────────────────────
const timeoutId = setTimeout(() => {
  if (loadingEl) loadingEl.innerHTML = `
    <div style="background:#fef2f2;border:2px solid #fecaca;padding:24px;border-radius:10px;color:#7f1d1d;max-width:400px;margin:0 auto;text-align:center;">
      <h3 style="margin-bottom:8px;">⚠️ Tempo Esgotado</h3>
      <p>Falha ao carregar o relatório. Verifique a ligação.</p>
      <a href="maquinario.html" style="background:#dc2626;color:white;padding:10px 18px;border-radius:6px;display:inline-block;margin-top:10px;text-decoration:none;font-weight:700;">← Voltar</a>
    </div>`;
}, 10_000);

if (!idRelatorio) {
  clearTimeout(timeoutId);
  alert("ID do relatório não encontrado na URL.");
  window.location.href = "maquinario.html";
} else {
  carregarRelatorio();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtData(ts) {
  if (!ts) return "—";
  const d = new Date(typeof ts === "string" ? ts : Number(ts));
  if (isNaN(d)) return String(ts);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function obterTs(reg) {
  if (reg.timestampEnvio) return reg.timestampEnvio;
  if (reg.dataCriacaoOficial?.toMillis) return reg.dataCriacaoOficial.toMillis();
  if (reg.dataCriacaoOficial?.seconds) return reg.dataCriacaoOficial.seconds * 1000;
  return 0;
}

function statusChip(label, color, bg, border) {
  return `<span class="status-chip" style="color:${color};background:${bg};border-color:${border};">${label}</span>`;
}

function infoBox(label, value) {
  return `<div class="info-box"><strong>${label}</strong><div class="value">${value || "—"}</div></div>`;
}

// ─── Main loader ──────────────────────────────────────────────────────────────
async function carregarRelatorio() {
  try {
    const reg = await obterRelatorioPorId(idRelatorio);
    clearTimeout(timeoutId);

    const machineId  = reg.dadosEquipamento?.id;
    const nome       = reg.dadosEquipamento?.nome || "Equipamento";
    const setor      = reg.dadosEquipamento?.subconjuntoAfetado || "Geral";
    const tecnico    = reg.dadosOperador?.nome || "Desconhecido";
    const tipoManu   = reg.diagnostico?.tipoManutencao || reg.tipoManutencao || "—";
    const statusFinal = reg.diagnostico?.statusFinal || reg.status || "—";
    const statusBefore = reg.diagnostico?.machineStatusBefore;
    const relatorio  = (reg.diagnostico?.relatorio || reg.relatorio || "").trim();
    const urgencia   = reg.analiseFalha?.urgencia || "Baixa";
    const ts         = obterTs(reg);

    // ── Load KPIs & machine state (parallel, non-blocking) ──
    const [kpis, machineState] = await Promise.all([
      machineId ? calcularKPIsLegacy(machineId).catch(() => null) : null,
      machineId ? getMachineState(machineId).catch(() => null) : null,
    ]);

    // ── Show report root ──
    loadingEl?.classList.add("hidden");
    reportRoot?.classList.remove("hidden");

    // ── Report header ──
    let docTypeLabel = "Ordem de Serviço";
    if (statusFinal === "Revisão") docTypeLabel = "📝 Solicitação Pendente";
    else if (tipoManu === "Inspecao" && statusFinal === "Operacional") docTypeLabel = "👁️ Registro de Inspeção";
    else if (statusFinal === "Operacional") docTypeLabel = "✅ O.S. Executada";
    else if (statusFinal === "Parada" || statusFinal === "Troca") docTypeLabel = "🔧 O.S. Corretiva";

    _set("doc-type", docTypeLabel);
    _set("report-machine-name", nome);
    _set("report-machine-sub", `${setor} · ID: ${machineId || "—"}`);
    _set("meta-id", machineId || "—");
    _set("meta-date", fmtData(ts));
    _set("meta-tech", `👷 ${tecnico}`);

    // ── ① Status Transition ──
    const statusAfterKey  = normalizarStatusLegacy(statusFinal);
    const statusAfterMeta = STATUS_META[statusAfterKey] || STATUS_META.operational;
    let transitionHtml = "";

    if (statusBefore) {
      const statusBeforeMeta = STATUS_META[statusBefore] || STATUS_META.operational;
      transitionHtml = `
        ${statusChip(statusBeforeMeta.icon + " " + statusBeforeMeta.label, statusBeforeMeta.color, statusBeforeMeta.bg, statusBeforeMeta.border)}
        <span class="transition-arrow">→</span>
        ${statusChip(statusAfterMeta.icon + " " + statusAfterMeta.label, statusAfterMeta.color, statusAfterMeta.bg, statusAfterMeta.border)}
      `;
    } else {
      transitionHtml = `
        <div style="color:#64748b;font-size:.85rem;">Status anterior não registrado (pré-CMMS)</div>
        <span class="transition-arrow">→</span>
        ${statusChip(statusAfterMeta.icon + " " + statusAfterMeta.label, statusAfterMeta.color, statusAfterMeta.bg, statusAfterMeta.border)}
      `;
    }

    // Current machine state
    if (machineState) {
      const curKey  = getEffectiveStatus(machineState);
      const curMeta = STATUS_META[curKey] || STATUS_META.operational;
      transitionHtml += `
        <div style="margin-top:10px;font-size:.8rem;color:#64748b;">
          Estado atual da máquina:
          <span style="background:${curMeta.bg};color:${curMeta.color};border:1px solid ${curMeta.border};padding:2px 9px;border-radius:99px;font-weight:700;font-size:.72rem;">
            ${curMeta.icon} ${curMeta.label}
          </span>
        </div>
      `;
    }
    _html("status-transition", transitionHtml);

    // ── ② Maintenance Classification ──
    const tipoM = TIPO_META[tipoManu] || { label: tipoManu, bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" };
    const prioM = PRIORIDADE_META[urgencia] || PRIORIDADE_META["Média"];
    _html("classification-grid", `
      ${infoBox("Tipo de Intervenção", `<span style="background:${tipoM.bg};color:${tipoM.color};border:1px solid ${tipoM.border};padding:3px 10px;border-radius:99px;font-size:.78rem;font-weight:700;">${tipoM.label}</span>`)}
      ${infoBox("Prioridade", `<span style="background:${prioM.bg};color:${prioM.color};border:1px solid ${prioM.border};padding:3px 10px;border-radius:99px;font-size:.78rem;font-weight:700;">${prioM.label}</span>`)}
      ${infoBox("Data de Criação", fmtData(ts))}
      ${infoBox("Técnico Responsável", tecnico)}
      ${infoBox("Subconjunto / Local", setor)}
      ${infoBox("Status Final", statusFinal)}
    `);

    // ── ③ Downtime Analysis ──
    const tempoParada      = parseFloat(reg.diagnostico?.tempoParada) || 0;
    const horasTrabalhadas = parseFloat(reg.diagnostico?.horasTrabalhadas) || 0;
    const dataInicio       = reg.diagnostico?.dataInicioOS;
    const dataFim          = reg.diagnostico?.dataFimOS;

    if (tempoParada > 0 || dataInicio) {
      const secDowntime = document.getElementById("section-downtime");
      if (secDowntime) secDowntime.style.display = "block";
      _html("downtime-content", `
        <div class="info-grid-3">
          ${infoBox("Início da Parada", fmtData(dataInicio))}
          ${infoBox("Fim da Parada", fmtData(dataFim))}
          ${infoBox("Duração (Downtime)", tempoParada > 0 ? `${tempoParada}h` : "—")}
          ${infoBox("Horas de Mão de Obra", horasTrabalhadas > 0 ? `${horasTrabalhadas}h` : "—")}
          ${infoBox("Máquina Parou?", (statusFinal === "Parada" || statusFinal === "Troca") ? "✅ Sim" : "Não")}
          ${infoBox("Bloqueio LOTO", reg.seguranca?.equipamentoBloqueadoLOTO ? "✅ Confirmado" : "—")}
        </div>
        ${tempoParada > 0 ? `
          <div style="margin-top:12px;">
            <div style="font-size:.75rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Downtime visual</div>
            <div class="downtime-bar-wrap"><div class="downtime-bar" style="width:${Math.min(100, tempoParada * 4)}%;"></div></div>
            <div style="font-size:.72rem;color:#dc2626;margin-top:4px;font-weight:600;">${tempoParada}h parado</div>
          </div>
        ` : ""}
      `);
    }

    // ── ④ Root Cause Analysis ──
    const sintoma    = reg.analiseFalha?.sintoma;
    const causaRaiz  = reg.analiseFalha?.causaRaiz;
    const localFalha = reg.dadosEquipamento?.subconjuntoAfetado;
    if (causaRaiz && causaRaiz !== "Nao Aplicavel") {
      const secRca = document.getElementById("section-rca");
      if (secRca) secRca.style.display = "block";
      _html("rca-content", `
        <div class="rca-item"><div class="rca-label">Subconjunto Afetado</div><div class="rca-value">${localFalha || "Geral"}</div></div>
        <div class="rca-item"><div class="rca-label">Sintoma Observado</div><div class="rca-value">${sintoma || "—"}</div></div>
        <div class="rca-item" style="border-left:3px solid #dc2626;"><div class="rca-label">Causa Raiz Suspeita</div><div class="rca-value" style="color:#dc2626;">${causaRaiz}</div></div>
        <div class="rca-item"><div class="rca-label">Prazo / Data Limite</div><div class="rca-value">${reg.analiseFalha?.dataLimite || "—"}</div></div>
      `);
    }

    // ── ⑤ Actions & Parts ──
    const acaoTomada = reg.analiseFalha?.acaoTomada;
    _html("actions-content", acaoTomada
      ? `<div class="info-box" style="margin-bottom:12px;border-left:3px solid #16a34a;">
           <strong>Ação Executada</strong>
           <div class="value">${acaoTomada}</div>
         </div>`
      : "");

    const pecas = reg.estoque?.itens || [];
    if (pecas.length > 0) {
      const tituloTabela = statusFinal === "Revisão" ? "Peças Solicitadas (Comprar)" : "BOM — Peças e Materiais Utilizados";
      _html("parts-content", `
        <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:6px;">${tituloTabela}</div>
        <table class="tabela-pecas">
          <thead><tr><th>Qtd</th><th>Descrição</th></tr></thead>
          <tbody>${pecas.map((p) => `<tr><td style="font-weight:700;text-align:center;width:60px;">${p.quantidade}</td><td>${p.nome}</td></tr>`).join("")}</tbody>
        </table>
      `);
    }

    // ── ⑥ Technical Report ──
    _set("report-relatorio", relatorio || "Sem relatório técnico registrado.");

    // ── ⑦ KPI Snapshot ──
    if (kpis && machineId) {
      const tl = trendLabel(kpis.trend);
      _html("kpi-snapshot", `
        <div class="kpi-snap">
          <span class="val" style="color:${kpis.totalParadas > 5 ? '#dc2626' : 'var(--primary)'};">${kpis.totalParadas}</span>
          <span class="lbl">Total Paradas</span>
        </div>
        <div class="kpi-snap">
          <span class="val" style="color:${kpis.totalDowntimeHours > 24 ? '#dc2626' : 'var(--primary)'};">${kpis.totalDowntimeHours.toFixed(1)}h</span>
          <span class="lbl">Downtime Acumulado</span>
        </div>
        <div class="kpi-snap">
          <span class="val" style="color:#2563eb;">${kpis.mtbfHours !== null ? kpis.mtbfHours + "h" : "—"}</span>
          <span class="lbl">MTBF</span>
        </div>
        <div class="kpi-snap">
          <span class="val" style="color:#7c3aed;">${kpis.mttrHours !== null ? kpis.mttrHours + "h" : "—"}</span>
          <span class="lbl">MTTR</span>
        </div>
      `);
      _html("trend-display", `
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:.75rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Tendência:</span>
          <span style="font-weight:700;color:${tl.color};">${tl.label}</span>
          <span style="font-size:.75rem;color:#64748b;">— baseado nas últimas ${Math.min(kpis.totalRegistros, 10)} intervenções</span>
        </div>
      `);
    } else {
      _html("kpi-snapshot", `
        <div style="grid-column:span 4;text-align:center;padding:20px;color:#64748b;font-size:.85rem;">
          KPIs não disponíveis — sem histórico suficiente para esta máquina.
        </div>`);
    }

    // ── ⑧ Related WOs & POs ──
    await carregarRegistrosRelacionados(machineId, idRelatorio);

    // ── Photos ──
    const fotos = reg.anexos?.urlsLinks?.filter((u) => typeof u === "string") || [];
    if (fotos.length > 0) {
      const secFotos = document.getElementById("section-fotos");
      if (secFotos) secFotos.style.display = "block";
      _html("report-galeria", fotos.map((url) =>
        `<a href="${url}" target="_blank"><img src="${url}" title="Clique para ampliar" loading="lazy"></a>`
      ).join(""));
    }

    // ── Execute CTA (Revisão status) ──
    if (statusFinal === "Revisão") {
      const secExec = document.getElementById("section-execute");
      const btnExec = document.getElementById("btn-execute-os");
      if (secExec) secExec.style.display = "block";
      if (btnExec) {
        btnExec.href = `formulario-maquinario.html?id=${machineId}&nome=${encodeURIComponent(nome)}&os_id=${idRelatorio}`;
      }
    }

  } catch (error) {
    clearTimeout(timeoutId);
    console.error("[Detalhes] Erro:", error);
    if (loadingEl) loadingEl.innerHTML = `
      <div style="background:#fef2f2;border:2px solid #fecaca;padding:24px;border-radius:10px;color:#7f1d1d;text-align:center;max-width:400px;margin:0 auto;">
        <h3>⚠️ Erro ao carregar relatório</h3>
        <p>${error.message || "Verifique a ligação e tente novamente."}</p>
        <a href="maquinario.html" style="background:#dc2626;color:white;padding:10px 18px;border-radius:6px;display:inline-block;margin-top:10px;text-decoration:none;font-weight:700;">← Voltar</a>
      </div>`;
  }
}

// ─── Related Records ──────────────────────────────────────────────────────────
async function carregarRegistrosRelacionados(machineId, woId) {
  const container = document.getElementById("related-content");
  if (!container) return;
  try {
    const { db } = await import("../core/firebase-config.js");
    const { collection, getDocs, query, where, orderBy, limit } =
      await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

    // Fetch WOs linked to this machine (last 5)
    const q = query(
      collection(db, "work_orders"),
      where("originId", "==", machineId),
      orderBy("timestampEnvio", "desc"),
      limit(5)
    );
    const snap = await getDocs(q);
    const wos  = [];
    snap.forEach((d) => wos.push({ id: d.id, ...d.data() }));

    // Fetch POs linked to this machine (last 3)
    const qPO = query(
      collection(db, "purchase_orders"),
      where("machineId", "==", machineId),
      orderBy("timestampEnvio", "desc"),
      limit(3)
    );
    const snapPO = await getDocs(qPO);
    const pos = [];
    snapPO.forEach((d) => pos.push({ id: d.id, ...d.data() }));

    let html = "";

    if (wos.length > 0) {
      html += `<div style="margin-bottom:14px;"><div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:6px;">Ordens de Serviço relacionadas</div>`;
      html += wos.map((wo) => {
        const statusColors = { open: "#2563eb", in_progress: "#d97706", completed: "#16a34a", pending: "#64748b" };
        const sc = statusColors[wo.status] || "#64748b";
        return `
          <div class="wo-item">
            <span class="wo-badge">O.S.</span>
            <div style="flex:1;min-width:0;">
              <strong style="font-size:.83rem;">${wo.title || "Ordem de Serviço"}</strong>
              <div style="font-size:.72rem;color:#64748b;">${wo.maintenanceType || ""} · ${new Date(wo.timestampEnvio || 0).toLocaleDateString("pt-BR")}</div>
            </div>
            <span style="background:${sc};color:#fff;padding:2px 8px;border-radius:99px;font-size:.68rem;font-weight:700;">${wo.status || "—"}</span>
            <a href="../os/os-detalhe.html?id=${wo.id}" style="color:var(--primary);font-size:.75rem;font-weight:700;text-decoration:none;white-space:nowrap;">Ver ➔</a>
          </div>`;
      }).join("");
      html += "</div>";
    }

    if (pos.length > 0) {
      html += `<div><div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:6px;">Pedidos de Compra relacionados</div>`;
      html += pos.map((po) => `
        <div class="wo-item">
          <span class="wo-badge" style="background:#f0fdf4;color:#166534;border-color:#86efac;">P.C.</span>
          <div style="flex:1;min-width:0;">
            <strong style="font-size:.83rem;">${po.descricao?.slice(0, 60) || "Pedido de Compra"}</strong>
            <div style="font-size:.72rem;color:#64748b;">${po.itens?.length || 0} item(ns) · ${new Date(po.timestampEnvio || 0).toLocaleDateString("pt-BR")}</div>
          </div>
          <span style="background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:99px;font-size:.68rem;font-weight:700;">${po.status || "pending"}</span>
        </div>`).join("");
      html += "</div>";
    }

    if (!wos.length && !pos.length) {
      html = `<p style="color:#64748b;font-size:.85rem;">Nenhum registro relacionado encontrado para esta máquina.</p>`;
    }

    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<p style="color:#64748b;font-size:.85rem;">Não foi possível carregar registros relacionados.</p>`;
  }
}

// ─── Tiny DOM helpers ─────────────────────────────────────────────────────────
function _set(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function _html(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

/**
 * machinery-center.js — Machinery Overview panel
 *
 * Renders a grid of machines with:
 *  - Status (running/maintenance/stopped) inferred from open WOs
 *  - Open OS count
 *  - Last failure date
 *  - Criticidade badge
 *  - "Create OS" shortcut
 */

import { catalogoMaquinas } from "../../data/dados-maquinas.js";

let _toast  = null;
let _perfil = null;

export function iniciarMachineryCenter(rawWorkOrders, mostrarToast, perfil) {
  _toast  = mostrarToast;
  _perfil = perfil;

  const wos = rawWorkOrders || [];
  _renderMachineGrid(wos);
}

// ============================================================
// RENDER
// ============================================================
function _renderMachineGrid(wos) {
  const container = document.getElementById("machine-grid-container");
  if (!container) return;

  if (!catalogoMaquinas || catalogoMaquinas.length === 0) {
    container.innerHTML = `<div class="panel-empty-state"><div class="panel-empty-icon">⚙️</div><div class="panel-empty-title">Nenhuma máquina cadastrada</div></div>`;
    return;
  }

  container.innerHTML = `<div class="machine-grid">${catalogoMaquinas.map((m) => _machineCardHtml(m, wos)).join("")}</div>`;

  // Delegate "Create OS" clicks
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-create-os-machine");
    if (!btn) return;
    const { maquinaId, maquinaNome } = btn.dataset;
    // Redirect to os-detalhe.html?modo=criar with pre-filled params
    const url = `../os/os-detalhe.html?modo=criar&origin=machine&originId=${encodeURIComponent(maquinaId)}&originNome=${encodeURIComponent(maquinaNome)}`;
    window.open(url, "_blank");
  });

  // "View history" buttons
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-history-machine");
    if (!btn) return;
    window.open(`../maquinario/historico-maquina.html?id=${encodeURIComponent(btn.dataset.maquinaId)}`, "_blank");
  });
}

function _machineCardHtml(maquina, wos) {
  const mId = maquina.id;

  // OS for this machine
  const machineWOs = wos.filter((w) => w.maquinaId === mId || w.originId === mId);
  const openWOs    = machineWOs.filter((w) => ["open", "in_progress", "pending"].includes(w.status));
  const criticos   = openWOs.filter((w) => w.prioridade === "critica" || w.priority === "critica");

  // Last failure
  const corretivas = machineWOs.filter((w) => w.tipo === "maintenance" || w.type === "maintenance");
  corretivas.sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0));
  const lastFailure = corretivas[0];
  const lastFailureDate = lastFailure
    ? new Date(lastFailure.timestampEnvio).toLocaleDateString("pt-BR")
    : "—";

  // Status inferred
  let status = "ok";
  let statusLabel = "Operacional";
  if (criticos.length > 0) { status = "parado"; statusLabel = "Parado / Crítico"; }
  else if (openWOs.length > 0) { status = "manutencao"; statusLabel = "Em Manutenção"; }

  const critClass = (maquina.criticidade || "").toLowerCase();

  return `
    <div class="machine-card">
      <div class="machine-card-top">
        <div>
          <div class="machine-card-name">${maquina.nome}</div>
          <div class="machine-card-id">${maquina.id}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="machine-criticidade ${critClass}">${maquina.criticidade || "—"}</span>
          <span class="machine-status-dot ${status}" title="${statusLabel}"></span>
        </div>
      </div>

      <div class="machine-card-meta">
        <span>📂 ${maquina.setor}</span>
        <span>⚡ ${statusLabel}</span>
        <span>🕐 Última falha: ${lastFailureDate}</span>
      </div>

      <div class="machine-card-stats">
        <div class="machine-stat">
          <div class="machine-stat-val">${openWOs.length}</div>
          <div class="machine-stat-label">O.S Abertas</div>
        </div>
        <div class="machine-stat">
          <div class="machine-stat-val" style="color:${criticos.length > 0 ? "#ef4444" : "#10b981"};">${criticos.length}</div>
          <div class="machine-stat-label">Críticas</div>
        </div>
      </div>

      <div class="machine-card-actions">
        <button
          class="quick-btn primary btn-create-os-machine"
          style="font-size:0.75rem;padding:7px 12px;"
          data-maquina-id="${maquina.id}"
          data-maquina-nome="${maquina.nome}">
          ➕ Criar O.S
        </button>
        <button
          class="quick-btn outline btn-history-machine"
          style="font-size:0.75rem;padding:7px 12px;"
          data-maquina-id="${maquina.id}">
          📜 Histórico
        </button>
      </div>
    </div>
  `;
}

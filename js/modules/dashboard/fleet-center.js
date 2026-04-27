/**
 * fleet-center.js — Fleet Overview panel
 *
 * Renders vehicle cards with NC status inferred from checklists.
 * Each vehicle shows: placa, modelo, category, NC count, last checklist.
 * Critical vehicles (NC > 0) get a "Create OS" shortcut.
 */

import { frotaDB } from "../../data/dados-frota.js";

let _toast  = null;
let _perfil = null;

export function iniciarFleetCenter(dados, mostrarToast, perfil) {
  _toast  = mostrarToast;
  _perfil = perfil;

  const checklists = dados.rawChecklists || [];
  _renderFleetPanel(checklists);
}

// ============================================================
// RENDER
// ============================================================
function _renderFleetPanel(checklists) {
  const container = document.getElementById("fleet-list-container");
  if (!container) return;

  if (!frotaDB || frotaDB.length === 0) {
    container.innerHTML = `<div class="panel-empty-state"><div class="panel-empty-icon">🚛</div><div class="panel-empty-title">Nenhum veículo cadastrado</div></div>`;
    return;
  }

  // Build NC map from checklists
  const ncMap = _buildNcMap(checklists);

  // Sort: critical first
  const sorted = [...frotaDB].sort((a, b) => {
    const ncA = ncMap[a.id]?.nc || 0;
    const ncB = ncMap[b.id]?.nc || 0;
    return ncB - ncA;
  });

  container.innerHTML = `<div class="vehicle-list">${sorted.map((v) => _vehicleCardHtml(v, ncMap)).join("")}</div>`;

  // Delegate "Create OS" clicks — open inline modal via custom event
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-create-os-vehicle");
    if (!btn) return;
    const { veiculoId, veiculoPlaca } = btn.dataset;
    document.dispatchEvent(new CustomEvent("siga:criar-os", {
      bubbles: true,
      detail: {
        origin: "fleet",
        originId: veiculoId,
        originNome: veiculoPlaca,
        tipo: "maintenance",
      },
    }));
  });
}

function _buildNcMap(checklists) {
  const map = {};
  checklists.forEach((c) => {
    const vid = c.veiculoId;
    if (!vid) return;
    if (!map[vid]) map[vid] = { nc: 0, total: 0, lastDate: null };
    const itens = c.itens || [];
    itens.forEach((it) => {
      map[vid].total++;
      if (it.status === "NC" || it.conforme === false) map[vid].nc++;
    });
    const ts = c.timestampEnvio || 0;
    if (!map[vid].lastDate || ts > map[vid].lastDate) map[vid].lastDate = ts;
  });
  return map;
}

function _vehicleCardHtml(veiculo, ncMap) {
  const info = ncMap[veiculo.id] || { nc: 0, total: 0, lastDate: null };
  const nc   = info.nc;
  const lastDate = info.lastDate
    ? new Date(info.lastDate).toLocaleDateString("pt-BR")
    : "—";

  let statusCls   = "ok";
  let statusLabel = "OK";
  if (nc > 5)      { statusCls = "critico"; statusLabel = "Crítico"; }
  else if (nc > 0) { statusCls = "atencao"; statusLabel = "Atenção"; }

  return `
    <div class="vehicle-card status-${statusCls}">
      <div class="vehicle-icon">${veiculo.icone || "🚛"}</div>
      <div class="vehicle-info">
        <div class="vehicle-placa">${veiculo.placa}</div>
        <div class="vehicle-modelo">${veiculo.modelo}</div>
        <div class="vehicle-meta">
          📂 ${veiculo.categoria}
          ${veiculo.motoristaPadrao ? ` · 👤 ${veiculo.motoristaPadrao}` : ""}
          · 🕐 ${lastDate}
        </div>
        ${nc > 0 ? `
          <button
            class="zone-create-os btn-create-os-vehicle"
            style="margin-top:6px;"
            data-veiculo-id="${veiculo.id}"
            data-veiculo-placa="${veiculo.placa}">
            ➕ Criar O.S de Manutenção
          </button>
        ` : ""}
      </div>
      <div class="vehicle-nc-badge ${nc === 0 ? "ok" : ""}">
        <div class="vehicle-nc-num">${nc}</div>
        <div class="vehicle-nc-label">NCs</div>
      </div>
    </div>
  `;
}

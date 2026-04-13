/**
 * cleaning-center.js — Cleaning 5S Overview panel
 *
 * Renders zones with their average score.
 * Critical zones (score < 5) show a red "Create OS" button.
 */

let _toast  = null;
let _perfil = null;

export function iniciarCleaningCenter(dados, mostrarToast, perfil) {
  _toast  = mostrarToast;
  _perfil = perfil;

  const limpeza = dados.limpeza || {};
  _renderCleaningPanel(limpeza);
}

// ============================================================
// RENDER
// ============================================================
function _renderCleaningPanel(limpeza) {
  const container = document.getElementById("cleaning-zones-container");
  if (!container) return;

  const todasZonas = limpeza.mediasPorZona || [];

  if (!todasZonas.length) {
    container.innerHTML = `
      <div class="panel-empty-state">
        <div class="panel-empty-icon">🧹</div>
        <div class="panel-empty-title">Nenhuma auditoria registada</div>
        <div class="panel-empty-sub">Realize auditorias de limpeza 5S para visualizar os dados.</div>
      </div>`;
    return;
  }

  // Sort: critical first, then by score ascending
  const sorted = [...todasZonas].sort((a, b) => a.media - b.media);

  const criticas     = sorted.filter((z) => z.media < 5);
  const naosCriticas = sorted.filter((z) => z.media >= 5);

  let html = "";

  if (criticas.length > 0) {
    html += `
      <div class="dash-card-header" style="padding:0 0 10px;">
        <h3 class="dash-card-title">⚠️ Zonas Críticas (score &lt; 5)</h3>
      </div>
      <div class="zone-grid" style="margin-bottom:20px;">
        ${criticas.map((z) => _zoneCardHtml(z, true)).join("")}
      </div>
    `;
  }

  if (naosCriticas.length > 0) {
    html += `
      <div class="dash-card-header" style="padding:0 0 10px;">
        <h3 class="dash-card-title">✅ Outras Zonas</h3>
      </div>
      <div class="zone-grid">
        ${naosCriticas.slice(0, 12).map((z) => _zoneCardHtml(z, false)).join("")}
      </div>
    `;
  }

  container.innerHTML = html;

  // Delegate "Create OS" button clicks
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".zone-create-os");
    if (!btn) return;
    const { zonaId, zonaScore } = btn.dataset;
    const url = `../os/os-detalhe.html?modo=criar&origin=manual&originNome=${encodeURIComponent(`Zona 5S: ${zonaId}`)}&titulo=${encodeURIComponent(`Manutenção de Limpeza — ${zonaId} (score ${zonaScore})`)}`;
    window.open(url, "_blank");
  });
}

function _zoneCardHtml(zona, isCritica) {
  const cls   = isCritica ? "critica" : zona.media >= 8 ? "ok" : "media";
  const score = zona.media.toFixed(1);

  return `
    <div class="zone-card ${cls}">
      <div class="zone-score">${score}</div>
      <div class="zone-name">${zona.zonaId}</div>
      <div style="font-size:0.7rem;color:#94a3b8;">${zona.total} auditoria${zona.total !== 1 ? "s" : ""}</div>
      ${isCritica ? `
        <button
          class="zone-create-os"
          data-zona-id="${zona.zonaId}"
          data-zona-score="${score}">
          ➕ Criar O.S
        </button>` : ""}
    </div>
  `;
}

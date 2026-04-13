/**
 * machine-state-engine.js — Core CMMS State & KPI Engine
 *
 * Responsibilities:
 *  - Persist machine status in `machine_state` Firestore collection
 *  - Calculate MTBF / MTTR from historico_manutencao records
 *  - Generate intelligent maintenance alerts
 *  - Rank machines by criticality score
 *  - Detect preventive maintenance overdue
 *
 * Status lifecycle:
 *  operational → attention → stopped / in_maintenance → operational
 *  Any status → critical (when failures are frequent or severe)
 *  operational → preventive_due (when last maintenance is overdue)
 */

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ─── Status Enum ───────────────────────────────────────────────────────────
export const MACHINE_STATUS = {
  operational:    "operational",
  attention:      "attention",
  preventive_due: "preventive_due",
  in_maintenance: "in_maintenance",
  stopped:        "stopped",
  critical:       "critical",
};

// Visual metadata per status — used by all pages
export const STATUS_META = {
  operational:    { label: "Operacional",       color: "#16a34a", bg: "#f0fdf4", border: "#86efac", icon: "🟢", cssClass: "status-operational" },
  attention:      { label: "Atenção",            color: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: "🟡", cssClass: "status-attention"    },
  preventive_due: { label: "Preventiva Devida", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", icon: "🔵", cssClass: "status-preventive"   },
  in_maintenance: { label: "Em Manutenção",     color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", icon: "🔧", cssClass: "status-maintenance"  },
  stopped:        { label: "Parada",             color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "🔴", cssClass: "status-stopped"      },
  critical:       { label: "Crítico",            color: "#991b1b", bg: "#fff1f2", border: "#fecdd3", icon: "⛔", cssClass: "status-critical"     },
};

// Maintenance type visual metadata
export const TIPO_META = {
  Inspecao:   { label: "Inspeção",   bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  Preventiva: { label: "Preventiva", bg: "#f0fdf4", color: "#166534", border: "#86efac" },
  Corretiva:  { label: "Corretiva",  bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
};

// Priority (urgencia field) visual metadata
export const PRIORIDADE_META = {
  Baixa:   { label: "Baixa",   bg: "#f0fdf4", color: "#166534", border: "#86efac" },
  "Média": { label: "Média",   bg: "#fffbeb", color: "#92400e", border: "#fde68a" },
  Alta:    { label: "Alta",    bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
  Critica: { label: "Crítica", bg: "#4c0519", color: "#fff",    border: "#be123c" },
};

// Preventive maintenance due after 30 days without any maintenance
const PREVENTIVE_THRESHOLD_MS = 30 * 24 * 3_600_000;

// Extended downtime alert threshold (hours)
const EXTENDED_DOWNTIME_THRESHOLD_H = 8;

// ─── Status Normalization ──────────────────────────────────────────────────

/**
 * Converts legacy form status strings to new normalized status keys.
 * Legacy values: "Operacional" | "Revisão" | "Parada" | "Troca"
 */
export function normalizarStatusLegacy(statusFinal) {
  switch (statusFinal) {
    case "Operacional": return "operational";
    case "Revisão":     return "attention";
    case "Parada":      return "stopped";
    case "Troca":       return "in_maintenance";
    default:            return "attention";
  }
}

/**
 * Converts normalized status key back to human-readable label.
 */
export function desnormalizarStatus(statusKey) {
  return STATUS_META[statusKey]?.label ?? statusKey;
}

// ─── machine_state CRUD ────────────────────────────────────────────────────

/**
 * Reads the current state document for a single machine.
 * Returns null if no state exists yet (machine is new / never had a WO).
 */
export async function getMachineState(machineId) {
  try {
    const snap = await getDoc(doc(db, "machine_state", machineId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.error("[StateEngine] getMachineState error:", e);
    return null;
  }
}

/**
 * Batch-reads machine states for an array of machine IDs.
 * Returns a Map<machineId, stateObject|null>.
 */
export async function getMachineStates(machineIds) {
  const map = {};
  await Promise.all(
    machineIds.map(async (id) => {
      map[id] = await getMachineState(id);
    })
  );
  return map;
}

/**
 * Upserts the machine_state document after any maintenance form save.
 *
 * @param {string}  machineId
 * @param {object}  opts
 * @param {string}  opts.newStatusLegacy  — "Operacional"|"Revisão"|"Parada"|"Troca"
 * @param {string}  [opts.woId]           — Firestore WO doc ID
 * @param {string}  [opts.woType]         — "Corretiva"|"Preventiva"|"Inspecao"
 * @param {number}  [opts.downtimeHours]  — hours machine was stopped (0 if none)
 * @param {object}  [opts.perfil]         — authenticated user object
 */
export async function updateMachineState(machineId, {
  newStatusLegacy,
  woId        = null,
  woType      = null,
  downtimeHours = 0,
  perfil      = null,
} = {}) {
  try {
    const stateRef = doc(db, "machine_state", machineId);
    const existing = await getDoc(stateRef);
    const prev     = existing.exists() ? existing.data() : {};

    const newStatus     = normalizarStatusLegacy(newStatusLegacy);
    const isFailure     = newStatus === "stopped" || newStatus === "critical";
    const totalDowntime = (prev.totalDowntimeHours || 0) + (Number(downtimeHours) || 0);
    const failureCount  = (prev.failureCount || 0) + (isFailure ? 1 : 0);

    const data = {
      machineId,
      currentStatus:       newStatus,
      lastMaintenanceDate: Date.now(),
      lastMaintenanceType: woType,
      totalDowntimeHours:  totalDowntime,
      failureCount,
      lastWorkOrderId:     woId,
      updatedAt:           serverTimestamp(),
      updatedBy:           perfil?.nome ?? "Sistema",
    };

    await setDoc(stateRef, data, { merge: true });
    return data;
  } catch (e) {
    // Non-blocking: log but don't crash the form submission
    console.error("[StateEngine] updateMachineState error:", e);
  }
}

// ─── KPI Calculation (Legacy historico_manutencao) ─────────────────────────

/**
 * Computes MTBF, MTTR, failure frequency, trend, and totals
 * from all historico_manutencao records for a machine.
 *
 * Returns a KPI object:
 * {
 *   totalRegistros, totalParadas, totalPreventivas,
 *   totalDowntimeHours,
 *   mtbfHours,       // null if < 2 failures
 *   mttrHours,       // null if no recovery data
 *   recentFailures,  // failures in last 7 days
 *   trend,           // "improving"|"stable"|"worsening"|"insufficient_data"
 *   lastRecord,      // most recent record object
 *   records,         // full sorted array (ascending)
 * }
 */
export async function calcularKPIsLegacy(machineId) {
  try {
    const q    = query(collection(db, "historico_manutencao"), where("dadosEquipamento.id", "==", machineId));
    const snap = await getDocs(q);
    const recs = [];
    snap.forEach((d) => recs.push({ id: d.id, ...d.data() }));
    recs.sort((a, b) => (a.timestampEnvio || 0) - (b.timestampEnvio || 0));

    // Identify stops (corrective failures)
    const paradas = recs.filter((r) => {
      const s = r.diagnostico?.statusFinal || r.status;
      return s === "Parada" || s === "Troca";
    });

    // Identify preventive records
    const preventivas = recs.filter((r) => {
      const t = r.diagnostico?.tipoManutencao || r.tipoManutencao;
      return t === "Preventiva";
    });

    // Total downtime accumulated
    const totalDowntimeHours = recs.reduce(
      (acc, r) => acc + (parseFloat(r.diagnostico?.tempoParada) || 0), 0
    );

    // ── MTBF: average time between consecutive stops ──
    let mtbfHours = null;
    if (paradas.length >= 2) {
      const intervals = [];
      for (let i = 1; i < paradas.length; i++) {
        const diff = (paradas[i].timestampEnvio || 0) - (paradas[i - 1].timestampEnvio || 0);
        if (diff > 0) intervals.push(diff);
      }
      if (intervals.length > 0) {
        const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        mtbfHours = Math.round(avgMs / 3_600_000);
      }
    }

    // ── MTTR: average time from stop → next Operacional ──
    const mttrIntervals = [];
    for (const p of paradas) {
      const nextOk = recs.find((r) => {
        const s = r.diagnostico?.statusFinal || r.status;
        return (r.timestampEnvio || 0) > (p.timestampEnvio || 0) && s === "Operacional";
      });
      if (nextOk) {
        const diff = (nextOk.timestampEnvio || 0) - (p.timestampEnvio || 0);
        if (diff > 0) mttrIntervals.push(diff);
      }
    }
    const mttrHours =
      mttrIntervals.length > 0
        ? Math.round(
            mttrIntervals.reduce((a, b) => a + b, 0) / mttrIntervals.length / 3_600_000
          )
        : null;

    // ── Recent failure frequency (last 7 days) ──
    const sevenDaysAgo   = Date.now() - 7 * 24 * 3_600_000;
    const recentFailures = paradas.filter((r) => (r.timestampEnvio || 0) >= sevenDaysAgo).length;

    // ── Trend: last-5 vs previous-5 severity scores ──
    let trend = "insufficient_data";
    if (recs.length >= 6) {
      const _score = (r) => {
        const s = r.diagnostico?.statusFinal || r.status;
        return s === "Parada" || s === "Troca" ? 3 : s === "Revisão" ? 1 : 0;
      };
      const r5 = recs.slice(-5).reduce((a, r) => a + _score(r), 0);
      const p5 = recs.slice(-10, -5).reduce((a, r) => a + _score(r), 0);
      trend = r5 < p5 ? "improving" : r5 > p5 ? "worsening" : "stable";
    }

    return {
      totalRegistros:    recs.length,
      totalParadas:      paradas.length,
      totalPreventivas:  preventivas.length,
      totalDowntimeHours,
      mtbfHours,
      mttrHours,
      recentFailures,
      trend,
      lastRecord: recs[recs.length - 1] ?? null,
      records:    recs,
    };
  } catch (e) {
    console.error("[StateEngine] calcularKPIsLegacy error:", e);
    return {
      totalRegistros: 0, totalParadas: 0, totalPreventivas: 0,
      totalDowntimeHours: 0, mtbfHours: null, mttrHours: null,
      recentFailures: 0, trend: "insufficient_data", lastRecord: null, records: [],
    };
  }
}

// ─── KPI from work_orders (new single-source-of-truth) ────────────────────────

/**
 * Calculates machine KPIs from the work_orders collection.
 * Returns same shape as calcularKPIsLegacy for drop-in compatibility.
 * Returns null when there is no WO data (caller can fall back to legacy).
 */
export async function calcularKPIsFromWOs(machineId) {
  try {
    const q = query(collection(db, "work_orders"), where("originId", "==", machineId));
    const snap = await getDocs(q);
    const recs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((r) => r.status !== "cancelled")
      .sort((a, b) => (a.timestampEnvio || 0) - (b.timestampEnvio || 0));

    if (!recs.length) return null; // caller falls back to legacy

    // Stops: corrective WOs or any WO with downtime flag
    const paradas = recs.filter((r) => r.downtime || r.maintenanceType === "corrective");

    // Preventive WOs
    const preventivas = recs.filter((r) => r.maintenanceType === "preventive");

    // Total downtime: sum of scheduling.durationHours where downtime=true
    const totalDowntimeHours = recs.reduce(
      (acc, r) => acc + (r.downtime && r.scheduling?.durationHours ? r.scheduling.durationHours : 0), 0
    );

    // MTBF: average time between consecutive corrective events
    let mtbfHours = null;
    if (paradas.length >= 2) {
      const intervals = [];
      for (let i = 1; i < paradas.length; i++) {
        const diff = (paradas[i].timestampEnvio || 0) - (paradas[i - 1].timestampEnvio || 0);
        if (diff > 0) intervals.push(diff);
      }
      if (intervals.length) {
        mtbfHours = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length / 3_600_000);
      }
    }

    // MTTR: mean duration of completed corrective WOs that have a recorded durationHours
    const completedCorrectiveWOs = recs.filter(
      (r) => r.status === "completed" && r.downtime && r.scheduling?.durationHours != null
    );
    const mttrHours = completedCorrectiveWOs.length > 0
      ? Math.round(
          completedCorrectiveWOs.reduce((a, r) => a + r.scheduling.durationHours, 0)
          / completedCorrectiveWOs.length * 10
        ) / 10
      : null;

    // Recent failures (last 7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 3_600_000;
    const recentFailures = paradas.filter((r) => (r.timestampEnvio || 0) >= sevenDaysAgo).length;

    // Trend: last 5 vs previous 5 severity scores
    let trend = "insufficient_data";
    if (recs.length >= 6) {
      const _score = (r) => r.downtime || r.maintenanceType === "corrective" ? 2 : 0;
      const r5 = recs.slice(-5).reduce((acc, r) => acc + _score(r), 0);
      const p5 = recs.slice(-10, -5).reduce((acc, r) => acc + _score(r), 0);
      trend = r5 < p5 ? "improving" : r5 > p5 ? "worsening" : "stable";
    }

    return {
      totalRegistros:    recs.length,
      totalParadas:      paradas.length,
      totalPreventivas:  preventivas.length,
      totalDowntimeHours,
      mtbfHours,
      mttrHours,
      recentFailures,
      trend,
      lastRecord: recs[recs.length - 1] ?? null,
      records:    recs,
    };
  } catch (e) {
    console.error("[StateEngine] calcularKPIsFromWOs error:", e);
    return null;
  }
}

// ─── Alert Generation ──────────────────────────────────────────────────────

/**
 * Generates an array of alert objects based on KPIs and current machine state.
 * Each alert: { tipo: "critical"|"warning"|"info", icon, titulo, descricao }
 */
export function gerarAlertas(kpis, machineState) {
  const alerts = [];
  if (!kpis) return alerts;

  // Alert 1: High failure frequency (3+ failures in 7 days)
  if (kpis.recentFailures >= 3) {
    alerts.push({
      tipo:     "critical",
      icon:     "🚨",
      titulo:   "Alta frequência de falhas",
      descricao: `${kpis.recentFailures} paradas detectadas nos últimos 7 dias. Análise de causa raiz recomendada.`,
    });
  }

  // Alert 2: Worsening trend
  if (kpis.trend === "worsening") {
    alerts.push({
      tipo:     "warning",
      icon:     "⚠️",
      titulo:   "Tendência negativa detectada",
      descricao: "As últimas 5 intervenções mostram piora progressiva na severidade. Avalie substituição de componentes.",
    });
  }

  // Alert 3: MTBF critically low (< 24h)
  if (kpis.mtbfHours !== null && kpis.mtbfHours < 24) {
    alerts.push({
      tipo:     "critical",
      icon:     "⛔",
      titulo:   `MTBF crítico: ${kpis.mtbfHours}h`,
      descricao: "Intervalo médio entre falhas inferior a 24h. Intervenção imediata e revisão do plano de manutenção.",
    });
  }

  // Alert 4: High MTTR (> 8h)
  if (kpis.mttrHours !== null && kpis.mttrHours > 8) {
    alerts.push({
      tipo:     "warning",
      icon:     "⚠️",
      titulo:   `Tempo de reparo elevado: ${kpis.mttrHours}h`,
      descricao: "MTTR médio acima de 8h. Avalie disponibilidade de peças, habilidade da equipe e documentação de procedimentos.",
    });
  }

  // Alert 5: Extended downtime (machine still stopped > threshold hours)
  if (machineState?.currentStatus === "stopped" && machineState?.lastMaintenanceDate) {
    const hoursElapsed = (Date.now() - machineState.lastMaintenanceDate) / 3_600_000;
    if (hoursElapsed >= EXTENDED_DOWNTIME_THRESHOLD_H) {
      alerts.push({
        tipo:     "critical",
        icon:     "⛔",
        titulo:   "Parada prolongada",
        descricao: `Máquina em estado "Parada" há ~${Math.round(hoursElapsed)}h. Escalone a intervenção imediatamente.`,
      });
    }
  }

  // Alert 6: MTBF declining (only if we have enough data)
  if (kpis.mtbfHours !== null && kpis.trend === "worsening" && kpis.totalParadas >= 4) {
    alerts.push({
      tipo:     "warning",
      icon:     "📉",
      titulo:   "Confiabilidade em declínio",
      descricao: `MTBF atual: ${kpis.mtbfHours}h com tendência piorante. Considere revisão geral ou substituição do ativo.`,
    });
  }

  return alerts;
}

// ─── Criticality Scoring ───────────────────────────────────────────────────

/**
 * Calculates a criticality score for ranking purposes.
 * Higher score = more critical machine.
 *
 * Weights:
 *   - Each failure:       × 3 points
 *   - Each downtime hour: × 0.5 points
 *   - Recent failures/7d: × 5 points each
 *   - Worsening trend:    + 10 points
 *   - Current status:     stopped=15, critical=20, in_maintenance=8, attention=5
 */
export function calcularCriticidade(kpis, machineState) {
  if (!kpis) return 0;

  const statusScores = {
    critical:       20,
    stopped:        15,
    in_maintenance: 8,
    attention:      5,
    preventive_due: 3,
    operational:    0,
  };

  const statusScore  = statusScores[machineState?.currentStatus] ?? 0;
  const trendScore   = kpis.trend === "worsening" ? 10 : kpis.trend === "improving" ? -5 : 0;

  return Math.round(
    (kpis.totalParadas || 0)       * 3   +
    (kpis.totalDowntimeHours || 0) * 0.5 +
    (kpis.recentFailures || 0)     * 5   +
    trendScore                           +
    statusScore
  );
}

// ─── Preventive Due Detection ──────────────────────────────────────────────

/**
 * Returns true if the machine hasn't had maintenance in > 30 days
 * AND is currently showing as operational (i.e. not already flagged).
 */
export function isPreventiveDue(machineState) {
  if (!machineState?.lastMaintenanceDate) return false;
  if (machineState.currentStatus !== "operational")  return false;
  return (Date.now() - machineState.lastMaintenanceDate) > PREVENTIVE_THRESHOLD_MS;
}

/**
 * Returns the effective display status, applying preventive_due override
 * when the machine is operational but overdue for maintenance.
 */
export function getEffectiveStatus(machineState) {
  if (!machineState) return "operational";
  if (isPreventiveDue(machineState)) return "preventive_due";
  return machineState.currentStatus ?? "operational";
}

// ─── Trend Label ──────────────────────────────────────────────────────────
export function trendLabel(trend) {
  switch (trend) {
    case "improving":         return { label: "Melhorando 📈",  color: "#16a34a" };
    case "worsening":         return { label: "Piorando 📉",    color: "#dc2626" };
    case "stable":            return { label: "Estável ➡️",     color: "#2563eb" };
    case "insufficient_data": return { label: "Dados insuf.",  color: "#64748b" };
    default:                  return { label: "—",              color: "#64748b" };
  }
}

/**
 * vehicle-state-engine.js — Fleet Vehicle State & KPI Engine
 *
 * Mirror of machine-state-engine.js, adapted for the Fleet module.
 *
 * Responsibilities:
 *  - Persist vehicle status in `vehicle_state` Firestore collection
 *  - Store pre-computed KPIs (MTBF, MTTR, trend) to power the dashboard
 *  - Calculate KPIs from work_orders (entityType="vehicle")
 *
 * Collection: vehicle_state/{vehicleId}
 *
 * Called by:
 *  - db-frota.js → after saving inspection (updates status from inspection result)
 *  - app-painel-frota.js → reads state for all fleet vehicles (dashboard)
 *  - app-historico-frota.js → reads state for KPI display (history page)
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

// ─── Re-export STATUS_META for UI layers ───────────────────────────────────
// Same visual system as machinery — keep one design language.
export { STATUS_META } from "./machine-state-engine.js";

// ─── Status Enum ───────────────────────────────────────────────────────────
export const VEHICLE_STATUS = {
  operational:    "operational",
  attention:      "attention",
  preventive_due: "preventive_due",
  in_maintenance: "in_maintenance",
  stopped:        "stopped",
  critical:       "critical",
};

// Vehicles overdue for preventive check after 30 days without any record
const PREVENTIVE_THRESHOLD_MS = 30 * 24 * 3_600_000;

// ─── vehicle_state CRUD ────────────────────────────────────────────────────

/**
 * Reads the current state document for a single vehicle.
 * Returns null if no state exists yet.
 */
export async function getVehicleState(vehicleId) {
  try {
    const snap = await getDoc(doc(db, "vehicle_state", vehicleId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.error("[VehicleState] getVehicleState error:", e);
    return null;
  }
}

/**
 * Batch-reads vehicle states for an array of IDs.
 * Returns a plain object Map<vehicleId, stateObject|null>.
 */
export async function getVehicleStates(vehicleIds) {
  const map = {};
  await Promise.all(
    vehicleIds.map(async (id) => {
      map[id] = await getVehicleState(id);
    })
  );
  return map;
}

/**
 * Returns all vehicle_state documents as an array.
 * Used by the dashboard to avoid N individual reads.
 */
export async function getAllVehicleStates() {
  try {
    const snap = await getDocs(collection(db, "vehicle_state"));
    const map  = {};
    snap.forEach((d) => { map[d.id] = { id: d.id, ...d.data() }; });
    return map;
  } catch (e) {
    console.error("[VehicleState] getAllVehicleStates error:", e);
    return {};
  }
}

/**
 * Upserts vehicle_state after any fleet event (inspection save, WO update).
 *
 * This function:
 *  1. Determines new status from inspection result or WO type
 *  2. Computes KPIs from all work_orders for this vehicle
 *  3. Stores everything in vehicle_state/{vehicleId} for dashboard use
 *
 * @param {string}  vehicleId
 * @param {object}  opts
 * @param {string}  opts.newStatus           — "operational"|"attention"|"stopped"|"in_maintenance"|"critical"
 * @param {string}  [opts.inspectionResult]  — "ok"|"attention"|"critical" (from inspection)
 * @param {string}  [opts.woId]              — Firestore WO doc ID
 * @param {string}  [opts.woType]            — "inspection"|"maintenance"
 * @param {number}  [opts.downtimeHours]     — hours vehicle was stopped (0 if none)
 * @param {string}  [opts.lastEventDesc]     — human-readable description of the event
 * @param {object}  [opts.perfil]            — authenticated user object
 */
export async function updateVehicleState(vehicleId, {
  newStatus        = "operational",
  inspectionResult = null,
  woId             = null,
  woType           = null,
  downtimeHours    = 0,
  lastEventDesc    = null,
  perfil           = null,
} = {}) {
  try {
    const stateRef = doc(db, "vehicle_state", vehicleId);
    const existing = await getDoc(stateRef);
    const prev     = existing.exists() ? existing.data() : {};

    // Resolve final status: inspection result takes priority
    let resolvedStatus = newStatus;
    if (inspectionResult === "critical") resolvedStatus = "critical";
    else if (inspectionResult === "attention") resolvedStatus = "attention";
    else if (inspectionResult === "ok")       resolvedStatus = "operational";

    const isFailure     = resolvedStatus === "stopped" || resolvedStatus === "critical";
    const totalDowntime = (prev.totalDowntimeHours || 0) + (Number(downtimeHours) || 0);
    const failureCount  = (prev.failureCount || 0) + (isFailure ? 1 : 0);

    // Compute KPIs from work_orders for this vehicle
    const kpis = await _computeKPIs(vehicleId);

    const data = {
      vehicleId,
      currentStatus:       resolvedStatus,
      lastEventDate:       Date.now(),
      lastEventDesc:       lastEventDesc || prev.lastEventDesc || null,
      lastMaintenanceType: woType || prev.lastMaintenanceType || null,
      lastWorkOrderId:     woId  || prev.lastWorkOrderId  || null,
      totalDowntimeHours:  totalDowntime,
      failureCount,
      // Pre-computed KPIs for dashboard display
      mtbfHours:     kpis.mtbfHours,
      mttrHours:     kpis.mttrHours,
      recentFailures: kpis.recentFailures,
      trend:         kpis.trend,
      updatedAt:     serverTimestamp(),
      updatedBy:     perfil?.nome ?? "Sistema",
    };

    await setDoc(stateRef, data, { merge: true });
    return data;
  } catch (e) {
    // Non-blocking: never crash the form that triggers this
    console.error("[VehicleState] updateVehicleState error:", e);
  }
}

// ─── KPI Computation (internal) ───────────────────────────────────────────

/**
 * Computes MTBF, MTTR, trend, and recent failures from work_orders.
 * Filters by originId === vehicleId and entityType === "vehicle".
 */
async function _computeKPIs(vehicleId) {
  const fallback = { mtbfHours: null, mttrHours: null, recentFailures: 0, trend: "insufficient_data" };
  try {
    const q    = query(collection(db, "work_orders"), where("originId", "==", vehicleId));
    const snap = await getDocs(q);
    const recs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((r) => (r.origin === "fleet" || r.entityType === "vehicle") && r.status !== "cancelled")
      .sort((a, b) => (a.timestampEnvio || 0) - (b.timestampEnvio || 0));

    if (!recs.length) return fallback;

    // Corrective/downtime events = failures
    const failures = recs.filter((r) => r.downtime || r.maintenanceType === "corrective");

    // MTBF
    let mtbfHours = null;
    if (failures.length >= 2) {
      const intervals = [];
      for (let i = 1; i < failures.length; i++) {
        const diff = (failures[i].timestampEnvio || 0) - (failures[i - 1].timestampEnvio || 0);
        if (diff > 0) intervals.push(diff);
      }
      if (intervals.length) {
        mtbfHours = Math.round(
          intervals.reduce((a, b) => a + b, 0) / intervals.length / 3_600_000
        );
      }
    }

    // MTTR: mean duration of completed corrective WOs
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
    const sevenDaysAgo  = Date.now() - 7 * 24 * 3_600_000;
    const recentFailures = failures.filter((r) => (r.timestampEnvio || 0) >= sevenDaysAgo).length;

    // Trend (last 5 vs previous 5)
    let trend = "insufficient_data";
    if (recs.length >= 6) {
      const _score = (r) => (r.downtime || r.maintenanceType === "corrective") ? 2 : 0;
      const r5 = recs.slice(-5).reduce((acc, r) => acc + _score(r), 0);
      const p5 = recs.slice(-10, -5).reduce((acc, r) => acc + _score(r), 0);
      trend = r5 < p5 ? "improving" : r5 > p5 ? "worsening" : "stable";
    }

    return { mtbfHours, mttrHours, recentFailures, trend };
  } catch (e) {
    console.error("[VehicleState] _computeKPIs error:", e);
    return fallback;
  }
}

// ─── Public KPI Calculation (for history page) ────────────────────────────

/**
 * Returns full KPI object for a vehicle (history page use).
 * Same shape as calcularKPIsLegacy for compatibility.
 */
export async function calcularKPIsVehicle(vehicleId) {
  try {
    const q    = query(collection(db, "work_orders"), where("originId", "==", vehicleId));
    const snap = await getDocs(q);
    const recs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((r) => (r.origin === "fleet" || r.entityType === "vehicle") && r.status !== "cancelled")
      .sort((a, b) => (a.timestampEnvio || 0) - (b.timestampEnvio || 0));

    const failures    = recs.filter((r) => r.downtime || r.maintenanceType === "corrective");
    const preventivas = recs.filter((r) => r.maintenanceType === "preventive");
    const totalDowntimeHours = recs.reduce(
      (acc, r) => acc + (r.downtime && r.scheduling?.durationHours ? r.scheduling.durationHours : 0), 0
    );

    let mtbfHours = null;
    if (failures.length >= 2) {
      const spans = [];
      for (let i = 1; i < failures.length; i++) {
        const diff = (failures[i].timestampEnvio || 0) - (failures[i - 1].timestampEnvio || 0);
        if (diff > 0) spans.push(diff);
      }
      if (spans.length) mtbfHours = Math.round(spans.reduce((a, b) => a + b, 0) / spans.length / 3_600_000);
    }

    const completedCorrectiveWOs = recs.filter(
      (r) => r.status === "completed" && r.downtime && r.scheduling?.durationHours != null
    );
    const mttrHours = completedCorrectiveWOs.length > 0
      ? Math.round(
          completedCorrectiveWOs.reduce((a, r) => a + r.scheduling.durationHours, 0)
          / completedCorrectiveWOs.length * 10
        ) / 10
      : null;

    const sevenDaysAgo   = Date.now() - 7 * 24 * 3_600_000;
    const recentFailures = failures.filter((r) => (r.timestampEnvio || 0) >= sevenDaysAgo).length;

    let trend = "insufficient_data";
    if (recs.length >= 6) {
      const _score = (r) => (r.downtime || r.maintenanceType === "corrective") ? 2 : 0;
      const r5 = recs.slice(-5).reduce((acc, r) => acc + _score(r), 0);
      const p5 = recs.slice(-10, -5).reduce((acc, r) => acc + _score(r), 0);
      trend = r5 < p5 ? "improving" : r5 > p5 ? "worsening" : "stable";
    }

    return {
      totalRegistros:    recs.length,
      totalParadas:      failures.length,
      totalPreventivas:  preventivas.length,
      totalDowntimeHours,
      mtbfHours,
      mttrHours,
      recentFailures,
      trend,
      lastRecord: recs[recs.length - 1] ?? null,
    };
  } catch (e) {
    console.error("[VehicleState] calcularKPIsVehicle error:", e);
    return {
      totalRegistros: 0, totalParadas: 0, totalPreventivas: 0,
      totalDowntimeHours: 0, mtbfHours: null, mttrHours: null,
      recentFailures: 0, trend: "insufficient_data", lastRecord: null,
    };
  }
}

// ─── Status Helpers ────────────────────────────────────────────────────────

/**
 * Returns the effective display status, applying preventive_due override
 * when the vehicle is operational but overdue for maintenance.
 */
export function getEffectiveVehicleStatus(vehicleState) {
  if (!vehicleState) return "operational";
  const s = vehicleState.currentStatus ?? "operational";
  if (s === "operational" && vehicleState.lastEventDate) {
    const elapsed = Date.now() - vehicleState.lastEventDate;
    if (elapsed > PREVENTIVE_THRESHOLD_MS) return "preventive_due";
  }
  return s;
}

/**
 * Maps inspection result string to vehicle status key.
 */
export function inspectionResultToStatus(result) {
  switch (result) {
    case "ok":       return "operational";
    case "attention": return "attention";
    case "critical":  return "critical";
    default:          return "attention";
  }
}

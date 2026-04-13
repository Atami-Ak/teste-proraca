/**
 * db-maquinas.js — Machinery Inspection Firestore Layer
 *
 * Handles:
 *  - Saving structured machine inspections (machine_inspections)
 *  - Photo upload per issue item (Firebase Storage)
 *  - Auto Work Order creation for CRITICAL items and high-attention inspections
 *  - Inspection history queries
 *  - KPI calculation (MTBF, MTTR, failure frequency)
 */

import { db, storage } from "./firebase-config.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc,
  getDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { calculateInspectionStatus, shouldTriggerWorkOrder } from "../data/inspection-engine-maquinas.js";

// ============================================================
// SAVE INSPECTION
// ============================================================

/**
 * Saves a complete machine inspection to Firestore.
 *
 * @param {Object}          inspection  — structured inspection payload
 * @param {Map<string,File[]>} photoFiles — Map<itemId, File[]>
 * @param {Object}          perfil      — authenticated user profile
 * @returns {Promise<string>}           — Firestore document ID
 */
export async function salvarInspecaoMaquina(inspection, photoFiles, perfil) {
  // 1. Upload photos for each non-OK item
  const updatedItems = await _uploadItemPhotos(
    inspection.items,
    photoFiles,
    inspection.machine.id
  );

  // 2. Compute overall status and issue list
  const status = calculateInspectionStatus(updatedItems);
  const issues = updatedItems
    .filter((i) => i.severity !== null && i.severity !== "ok")
    .map((i) => ({
      itemId:      i.id,
      item:        i.label,
      section:     i.section,
      severity:    i.severity,
      description: i.notes || "",
      photoUrl:    i.photos?.[0] || null,
      photos:      i.photos || [],
    }));

  // 3. Build the Firestore payload
  const payload = {
    machineId:          inspection.machine.id,
    machineType:        inspection.machine.tipo,
    machineName:        inspection.machine.nome,
    machineSetor:       inspection.machine.setor,

    inspector:          inspection.inspector,
    technician:         inspection.technician || inspection.inspector,

    status,                             // "OK" | "ATTENTION" | "CRITICAL" | "PENDING"
    items:              updatedItems,   // full annotated item list
    issues,                             // condensed list of non-OK items only
    metrics:            inspection.metrics     || {},
    maintenance:        inspection.maintenance || {},
    diagnosis:          inspection.diagnosis   || "",
    recommendation:     inspection.recommendation || "",
    nextInspectionDate: inspection.nextInspectionDate || null,

    responsibilityTermAccepted: inspection.responsibilityTermAccepted || false,
    createdBy:          perfil?.nome || "Sistema",
    createdAt:          serverTimestamp(),
    timestampEnvio:     Date.now(),
  };

  const docRef = await addDoc(collection(db, "machine_inspections"), payload);

  // 4. Auto Work Order — non-blocking, does NOT affect saved data on failure
  if (shouldTriggerWorkOrder(updatedItems)) {
    autoWorkOrderMaquina(docRef.id, updatedItems, inspection.machine, perfil).catch((err) => {
      console.error("[MAQUINAS] Erro ao criar O.S automáticas:", err);
    });
  }

  return docRef.id;
}

// ============================================================
// PHOTO UPLOAD
// ============================================================

async function _uploadItemPhotos(items, photoFiles, machineId) {
  if (!photoFiles || photoFiles.size === 0) return items;

  return Promise.all(
    items.map(async (item) => {
      const files = photoFiles.get(item.id);
      if (!files || files.length === 0) return item;

      const urls = [];
      for (let i = 0; i < files.length; i++) {
        const path = `inspecoes_maquinas/${machineId}/${Date.now()}_${item.id}_${i}.jpg`;
        const storageRef = ref(storage, path);
        const snapshot   = await uploadBytes(storageRef, files[i]);
        urls.push(await getDownloadURL(snapshot.ref));
      }

      return { ...item, photos: urls };
    })
  );
}

// ============================================================
// AUTO WORK ORDERS
// ============================================================

/**
 * Creates Work Orders from a machinery inspection result.
 *
 * Rules:
 *  - One WO per CRITICAL item (priority: "critica")
 *  - One consolidated WO for all ATTENTION items when count ≥ 3 (priority: "alta")
 *  - Individual ATTENTION item WOs when count < 3 (priority: "media")
 *
 * [CF-ready]: Can be migrated to a Firestore trigger on machine_inspections/{id}.onCreate
 */
export async function autoWorkOrderMaquina(inspectionId, items, machine, perfil) {
  const criticalItems  = items.filter((i) => i.severity === "critical");
  const attentionItems = items.filter((i) => i.severity === "attention");

  if (!criticalItems.length && !attentionItems.length) return;

  const veiculo   = `${machine.nome} (${machine.setor})`;
  const criador   = perfil?.nome || "Sistema";
  const timestamp = Date.now();

  const _baseWO = (extra) => ({
    type:           "maintenance",
    maintenanceType: "corrective",
    origin:         "machinery",
    originId:       machine.id,
    originNome:     machine.nome,
    sector:         machine.setor?.toLowerCase().replace(/\s+/g, "_") || "manutencao",
    status:         "open",
    solicitante:    criador,
    criadoPor:      criador,
    inspecaoId:     inspectionId,
    timeline: [{
      acao:      `O.S criada automaticamente — inspeção de maquinário`,
      usuario:   "Sistema",
      icone:     "🤖",
      timestamp,
    }],
    createdAt:      serverTimestamp(),
    updatedAt:      serverTimestamp(),
    timestampEnvio: timestamp,
    ...extra,
  });

  // ── One WO per CRITICAL item ────────────────────────────
  for (const item of criticalItems) {
    await addDoc(collection(db, "work_orders"), _baseWO({
      priority:    "critica",
      title:       `[MAQUINÁRIO] CRÍTICO: ${item.label} — ${machine.nome}`,
      description:
        `Falha CRÍTICA detectada durante inspeção de maquinário.\n` +
        `Máquina: ${veiculo}\n` +
        `Componente: ${item.label} (${item.section})\n` +
        (item.notes ? `Descrição: ${item.notes}` : "Ação imediata necessária."),
      anexoUrl:    item.photos?.[0] || null,
    }));
  }

  // ── Consolidated WO for ATTENTION items (3+) ──────────
  if (attentionItems.length >= 3) {
    const itemList = attentionItems
      .map((i) => `  • ${i.label}${i.notes ? ` — ${i.notes}` : ""}`)
      .join("\n");

    await addDoc(collection(db, "work_orders"), _baseWO({
      priority:    "alta",
      title:       `[MAQUINÁRIO] ${attentionItems.length} pontos de atenção — ${machine.nome}`,
      description:
        `Múltiplas não conformidades de atenção detectadas.\n` +
        `Máquina: ${veiculo}\n\nItens:\n${itemList}`,
      anexoUrl:    attentionItems.find((i) => i.photos?.[0])?.photos?.[0] || null,
    }));
  } else {
    // Individual WOs for fewer attention items
    for (const item of attentionItems) {
      await addDoc(collection(db, "work_orders"), _baseWO({
        priority:    "media",
        title:       `[MAQUINÁRIO] Atenção: ${item.label} — ${machine.nome}`,
        description:
          `Ponto de atenção detectado durante inspeção.\n` +
          `Máquina: ${veiculo}\n` +
          `Componente: ${item.label} (${item.section})\n` +
          (item.notes ? `Observação: ${item.notes}` : ""),
        anexoUrl:    item.photos?.[0] || null,
      }));
    }
  }
}

// ============================================================
// QUERIES
// ============================================================

/**
 * Returns inspection history for a machine, sorted by date descending.
 */
export async function obterHistoricoMaquina(machineId, limitN = 30) {
  const q = query(
    collection(db, "machine_inspections"),
    where("machineId", "==", machineId),
    orderBy("timestampEnvio", "desc"),
    limit(limitN)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Returns a single inspection by Firestore document ID.
 */
export async function obterInspecaoPorId(id) {
  const snap = await getDoc(doc(db, "machine_inspections", id));
  if (!snap.exists()) throw new Error("Inspeção não encontrada.");
  return { id: snap.id, ...snap.data() };
}

/**
 * Returns recent inspections across ALL machines (for dashboard/overview).
 */
export async function obterInspecoesRecentes(limitN = 50) {
  const q = query(
    collection(db, "machine_inspections"),
    orderBy("timestampEnvio", "desc"),
    limit(limitN)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ============================================================
// KPI CALCULATION
// ============================================================

/**
 * Calculates maintenance KPIs for a specific machine from its inspection history.
 *
 * Returns:
 * {
 *   totalInspections,
 *   okCount, attentionCount, criticalCount,
 *   mtbfHours,          // Mean Time Between (Critical) Failures
 *   mttrHours,          // Mean Time To Recovery (CRITICAL → next OK)
 *   failureFrequency,   // critical inspections in last 30 days
 *   lastInspection,     // most recent inspection record
 *   trend,              // "improving" | "stable" | "worsening" | "insufficient_data"
 * }
 */
export async function calcularKPIs(machineId) {
  const all = await obterHistoricoMaquina(machineId, 100);

  // Sort ascending for time-series analysis
  const sorted = [...all].sort((a, b) => (a.timestampEnvio || 0) - (b.timestampEnvio || 0));

  const okCount        = sorted.filter((i) => i.status === "OK").length;
  const attentionCount = sorted.filter((i) => i.status === "ATTENTION").length;
  const criticalCount  = sorted.filter((i) => i.status === "CRITICAL").length;

  // ── MTBF: avg time between consecutive CRITICAL inspections ──
  const criticals = sorted.filter((i) => i.status === "CRITICAL");
  let mtbfHours = null;
  if (criticals.length >= 2) {
    const intervals = [];
    for (let i = 1; i < criticals.length; i++) {
      intervals.push(criticals[i].timestampEnvio - criticals[i - 1].timestampEnvio);
    }
    const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    mtbfHours   = Math.round(avgMs / 3_600_000);
  }

  // ── MTTR: avg time from CRITICAL to next OK inspection ──
  const mttrIntervals = [];
  for (const crit of criticals) {
    const nextOk = sorted.find(
      (i) => i.timestampEnvio > crit.timestampEnvio && i.status === "OK"
    );
    if (nextOk) {
      mttrIntervals.push(nextOk.timestampEnvio - crit.timestampEnvio);
    }
  }
  const mttrHours = mttrIntervals.length > 0
    ? Math.round(mttrIntervals.reduce((a, b) => a + b, 0) / mttrIntervals.length / 3_600_000)
    : null;

  // ── Failure frequency (last 30 days) ──
  const thirtyDaysAgo    = Date.now() - 30 * 24 * 3_600_000;
  const failureFrequency = criticals.filter((i) => i.timestampEnvio >= thirtyDaysAgo).length;

  // ── Trend: compare last 5 vs previous 5 inspections ──
  let trend = "insufficient_data";
  if (sorted.length >= 6) {
    const _score = (s) => s === "CRITICAL" ? 2 : s === "ATTENTION" ? 1 : 0;
    const recent5 = sorted.slice(-5).reduce((acc, i) => acc + _score(i.status), 0);
    const prev5   = sorted.slice(-10, -5).reduce((acc, i) => acc + _score(i.status), 0);
    if (recent5 < prev5)      trend = "improving";
    else if (recent5 > prev5) trend = "worsening";
    else                      trend = "stable";
  }

  return {
    totalInspections: sorted.length,
    okCount,
    attentionCount,
    criticalCount,
    mtbfHours,
    mttrHours,
    failureFrequency,
    lastInspection: sorted[sorted.length - 1] || null,
    trend,
  };
}

/**
 * db-limpeza.js — Cleaning Audit + Performance DB Layer (SIGA v2)
 *
 * Collection: cleaning_inspections
 * Backward-compatible read from: auditorias_limpeza (legacy)
 *
 * Exports:
 *   salvarInspecaoLimpeza()     — saves new inspection
 *   obterInspecoesPorZona()     — history for one zone
 *   obterTodasInspecoes()       — all inspections (merged legacy)
 *   obterPerformanceFuncionarios() — employee ranking
 *   obterPerformanceZonas()     — zone score aggregation
 */

import { db, storage } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, query, where,
  orderBy, limit, serverTimestamp, doc, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const COL_NEW    = "cleaning_inspections";
const COL_LEGACY = "auditorias_limpeza";

// ── Score → Status ────────────────────────────────────────────────────────────
export function scoreToStatus(score) {
  if (score >= 90) return "excellent";
  if (score >= 75) return "acceptable";
  if (score >= 50) return "attention";
  return "critical";
}

export const STATUS_LIMPEZA = {
  excellent:  { label: "🟢 Excelente",   color: "#16a34a", bg: "#f0fdf4", border: "#86efac" },
  acceptable: { label: "🟡 Aceitável",   color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  attention:  { label: "🟠 Atenção",     color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
  critical:   { label: "🔴 Crítico",     color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
};

// ── Save Inspection ───────────────────────────────────────────────────────────
export async function salvarInspecaoLimpeza(payload, photoFilesMap) {
  // Upload photos for issues that have attached files
  if (photoFilesMap && Object.keys(photoFilesMap).length > 0) {
    for (const [itemId, file] of Object.entries(photoFilesMap)) {
      if (!file) continue;
      try {
        const path      = `cleaning_photos/${Date.now()}_${payload.zoneId}_${itemId}.jpg`;
        const storageRef = ref(storage, path);
        const snap      = await uploadBytes(storageRef, file);
        const url       = await getDownloadURL(snap.ref);

        // Attach URL to the matching issue
        const issue = (payload.issues || []).find(i => i.itemId === itemId);
        if (issue) issue.photoUrl = url;

        // Also attach to the section item
        for (const sec of (payload.sections || [])) {
          const item = (sec.items || []).find(i => i.id === itemId);
          if (item) item.photoUrl = url;
        }
      } catch (e) {
        console.warn("[DB Limpeza] Falha ao fazer upload de foto:", itemId, e);
      }
    }
  }

  payload.timestampEnvio   = Date.now();
  payload.dataCriacaoOficial = serverTimestamp();

  const docRef = await addDoc(collection(db, COL_NEW), payload);

  // Also write to legacy collection for backward compat (dashboard + historico)
  try {
    const legacyPayload = {
      zonaId:             payload.zoneId,
      funcionarioAvaliado: payload.employeeId,
      notaLimpeza:        payload.score / 10, // legacy scale 0-10
      statusVisual:       _legacyStatus(payload.status),
      checklistDetalhado: (payload.issues || []).map(i => ({
        idPergunta: i.itemId,
        pergunta:   i.description,
        resposta:   "0",
        fotoUrl:    i.photoUrl || null,
      })),
      observacoes:        payload.notes || "",
      timestampEnvio:     payload.timestampEnvio,
      dataCriacaoOficial: serverTimestamp(),
      newInspectionId:    docRef.id,
    };
    await addDoc(collection(db, COL_LEGACY), legacyPayload);
  } catch (_) {}

  return docRef.id;
}

function _legacyStatus(status) {
  return status === "excellent" ? "Conforme"
       : status === "acceptable" ? "Conforme"
       : status === "attention"  ? "Atencao"
       : "Critico";
}

// ── Read all (new + legacy merged) ────────────────────────────────────────────
export async function obterTodasInspecoes() {
  const [newSnap, legSnap] = await Promise.all([
    getDocs(query(collection(db, COL_NEW))).catch(() => null),
    getDocs(query(collection(db, COL_LEGACY))).catch(() => null),
  ]);

  const newIds = new Set();
  const results = [];

  if (newSnap) {
    newSnap.forEach(d => {
      const data = { id: d.id, _source: "new", ...d.data() };
      results.push(data);
      if (data.legacyId) newIds.add(data.legacyId);
    });
  }

  if (legSnap) {
    legSnap.forEach(d => {
      const data = d.data();
      // Skip if already migrated/linked to a new inspection
      if (data.newInspectionId) return;
      if (newIds.has(d.id)) return;

      results.push({
        id:         d.id,
        _source:    "legacy",
        zoneId:     data.zonaId,
        zoneName:   data.zonaId,
        employeeId: data.funcionarioAvaliado,
        score:      (data.notaLimpeza || 0) * 10,
        status:     _legacyToNew(data.statusVisual),
        sections:   [],
        issues:     (data.checklistDetalhado || [])
                      .filter(q => q.resposta === "0" || q.resposta === 0)
                      .map(q => ({
                        itemId:      q.idPergunta,
                        description: q.pergunta || "Item não conforme",
                        category:    "limpeza",
                        severity:    "low",
                        photoUrl:    q.fotoUrl || null,
                      })),
        notes:      data.observacoes || "",
        timestampEnvio: data.timestampEnvio || 0,
      });
    });
  }

  return results.sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0));
}

function _legacyToNew(statusVisual) {
  if (statusVisual === "Conforme") return "excellent";
  if (statusVisual === "Atencao")  return "attention";
  if (statusVisual === "Critico")  return "critical";
  return "attention";
}

// ── Read by zone ──────────────────────────────────────────────────────────────
export async function obterInspecoesPorZona(zoneId) {
  const all = await obterTodasInspecoes();
  return all.filter(i => i.zoneId === zoneId);
}

// ── Employee Performance ──────────────────────────────────────────────────────
export async function obterPerformanceFuncionarios() {
  const all = await obterTodasInspecoes();
  const map = {};

  all.forEach(insp => {
    const id = insp.employeeId || insp.employeeName || "unknown";
    if (!map[id]) {
      map[id] = {
        employeeId:        id,
        employeeName:      insp.employeeName || insp.employeeId || "—",
        totalInspections:  0,
        scoreSum:          0,
        failures:          0,
        criticalIssues:    0,
        latestTs:          0,
      };
    }
    map[id].totalInspections++;
    map[id].scoreSum     += insp.score || 0;
    map[id].failures     += (insp.issues || []).length;
    map[id].criticalIssues += (insp.issues || []).filter(i => i.severity === "critical").length;
    if ((insp.timestampEnvio || 0) > map[id].latestTs) map[id].latestTs = insp.timestampEnvio;
  });

  return Object.values(map)
    .map(e => ({
      ...e,
      averageScore: e.totalInspections > 0 ? Math.round(e.scoreSum / e.totalInspections) : 0,
      status: e.totalInspections === 0 ? "no_data"
            : (e.scoreSum / e.totalInspections) >= 75 ? "top"
            : (e.scoreSum / e.totalInspections) >= 50 ? "needs_improvement"
            : "critical",
    }))
    .sort((a, b) => b.averageScore - a.averageScore);
}

// ── Zone Performance ──────────────────────────────────────────────────────────
export async function obterPerformanceZonas() {
  const all = await obterTodasInspecoes();
  const map = {};

  all.forEach(insp => {
    const id = insp.zoneId;
    if (!id) return;
    if (!map[id]) {
      map[id] = {
        zoneId:        id,
        zoneName:      insp.zoneName || id,
        totalInspections: 0,
        scoreSum:      0,
        issueCount:    0,
        latestTs:      0,
        latestScore:   null,
        latestStatus:  null,
        latestEmployee: null,
        scoreHistory:  [],
      };
    }
    map[id].totalInspections++;
    map[id].scoreSum += insp.score || 0;
    map[id].issueCount += (insp.issues || []).length;
    if ((insp.timestampEnvio || 0) > map[id].latestTs) {
      map[id].latestTs       = insp.timestampEnvio;
      map[id].latestScore    = insp.score;
      map[id].latestStatus   = insp.status;
      map[id].latestEmployee = insp.employeeName || insp.employeeId;
    }
    map[id].scoreHistory.push({ ts: insp.timestampEnvio || 0, score: insp.score || 0 });
  });

  return Object.values(map)
    .map(z => ({
      ...z,
      averageScore: z.totalInspections > 0 ? Math.round(z.scoreSum / z.totalInspections) : 0,
    }))
    .sort((a, b) => a.averageScore - b.averageScore); // worst first
}

// ── Link WO to Inspection ─────────────────────────────────────────────────────
export async function vincularWOInspecao(inspectionId, woId) {
  try {
    const docRef = doc(db, COL_NEW, inspectionId);
    await updateDoc(docRef, {
      linkedWorkOrders: [woId], // simplified: just store last WO
    });
  } catch (_) {}
}

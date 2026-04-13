/**
 * db-bridge.js — Compatibility Bridge + Migration Utility
 *
 * PURPOSE: During migration from the legacy `historico_manutencao` collection
 * to the unified `work_orders` collection, this module lets any page query
 * BOTH collections transparently and receive a single merged result array.
 *
 * MIGRATION PHASES:
 *   Phase 1 (current): New records go to `work_orders`. Legacy records stay
 *     in `historico_manutencao`. This bridge reads both and merges.
 *   Phase 2 (future):  Run `migrarHistoricoParaWorkOrders()` to copy all
 *     legacy records into work_orders with a `_migratedFrom: "historico_manutencao"` flag.
 *   Phase 3 (future):  Remove this bridge; all code reads only `work_orders`.
 *
 * [CF-ready]: `migrarHistoricoParaWorkOrders()` should run as a one-shot
 * Cloud Function (HTTP trigger, admin SDK) to avoid client-side Firestore
 * quota concerns for large datasets.
 */

import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  orderBy,
  limit,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "./firebase-config.js";

// ---------------------------------------------------------------------------
// NORMALISATION — converts a legacy historico_manutencao doc into a
// shape compatible with the work_orders schema.
// ---------------------------------------------------------------------------

/**
 * @param {Object} legacyDoc — raw Firestore doc data from historico_manutencao
 * @param {string} legacyId  — Firestore document ID
 * @returns {Object}  normalised work-order-shaped object
 */
export function normalizarLegacy(legacyDoc, legacyId) {
  const d = legacyDoc;

  // Map legacy status → WO status
  const statusMap = {
    Operacional: "completed",
    Revisão: "pending",
    Parada: "open",
  };
  const statusFinal = d?.diagnostico?.statusFinal || d?.status || "";

  // Map legacy tipoManutencao → WO tipo
  const tipoMap = {
    Corretiva: "maintenance",
    Preventiva: "maintenance",
    Inspecao: "inspection",
    Limpeza: "cleaning_issue",
  };
  const tipoManu = d?.diagnostico?.tipoManutencao || d?.tipoManutencao || "";

  const timestampEnvio =
    d?.timestampEnvio ||
    d?.timestamp ||
    (d?.dataCriacaoOficial?.toMillis
      ? d.dataCriacaoOficial.toMillis()
      : Date.now());

  return {
    // Identity
    id: legacyId,
    _source: "historico_manutencao", // flag — this is a legacy record
    _legacyId: legacyId,

    // Core WO fields
    tipo: tipoMap[tipoManu] || "maintenance",
    status: statusMap[statusFinal] || "completed",
    prioridade: "media",
    origem: "legacy",

    // Equipment
    maquinaId: d?.dadosEquipamento?.id || null,
    maquinaNome: d?.dadosEquipamento?.nome || "Equipamento",
    subconjunto: d?.dadosEquipamento?.subconjuntoAfetado || null,

    // Operator
    operadorNome: d?.dadosOperador?.nome || null,

    // Diagnostics
    relatorio: d?.diagnostico?.relatorio || "",
    tipoManutencao: tipoManu,
    statusLabel: statusFinal,

    // Timing
    timestampEnvio,
    dataInicioOS: d?.diagnostico?.dataInicioOS || null,
    dataFimOS: d?.diagnostico?.dataFimOS || null,
    tempoParada: d?.diagnostico?.tempoParada || 0,
    horasTrabalhadas: d?.diagnostico?.horasTrabalhadas || 0,

    // Root cause
    causaRaiz: d?.analiseFalha?.causaRaiz || null,

    // Parts (BOM)
    materiais: (d?.estoque?.itens || []).map((it) => ({
      descricao: it.nome || it.descricao || "",
      quantidade: it.quantidade || 1,
      precoUnitario: it.precoUnitario || 0,
      totalLinha: (it.quantidade || 1) * (it.precoUnitario || 0),
    })),

    // Photos
    fotos: d?.anexos?.urlsLinks || [],

    // Costs (legacy may not have these)
    custoTotal: d?.custoTotal || 0,
    custoMateriais: d?.custoMateriais || 0,
    custoMaoObra: d?.diagnostico?.custoMaoObra || 0,

    // Keep raw legacy data accessible
    _raw: d,
  };
}

// ---------------------------------------------------------------------------
// BRIDGE QUERIES — merged reads
// ---------------------------------------------------------------------------

/**
 * Returns all maintenance work orders, merging work_orders + historico_manutencao.
 * Results are sorted by timestampEnvio descending (newest first).
 *
 * @param {Object} filtros
 * @param {string|null} filtros.maquinaId  — filter by machine
 * @param {string|null} filtros.status     — filter by WO status
 * @param {number} filtros.limitN          — max results (default 200)
 */
export async function obterTodasOSBridge(filtros = {}) {
  const { maquinaId = null, status = null, limitN = 200 } = filtros;

  const [workOrdersSnap, legacySnap] = await Promise.all([
    _queryWorkOrders(maquinaId, status, limitN),
    _queryLegacy(maquinaId, limitN),
  ]);

  // Collect work_orders IDs that came from migration to avoid duplicates
  const migratedIds = new Set();
  const woResults = workOrdersSnap.docs.map((d) => {
    const data = { id: d.id, ...d.data() };
    if (data._legacyId) migratedIds.add(data._legacyId);
    return data;
  });

  // Legacy records — skip any that were already migrated
  const legacyResults = legacySnap.docs
    .filter((d) => !migratedIds.has(d.id))
    .map((d) => normalizarLegacy(d.data(), d.id));

  const merged = [...woResults, ...legacyResults];

  // Sort newest first
  merged.sort((a, b) => {
    const ta = _toMs(a.timestampEnvio || a.criadoEm);
    const tb = _toMs(b.timestampEnvio || b.criadoEm);
    return tb - ta;
  });

  return merged.slice(0, limitN);
}

/**
 * Fetches a single record by ID, checking work_orders first then legacy.
 * @param {string} id
 * @returns {Object|null}
 */
export async function obterOSPorIdBridge(id) {
  // Try work_orders first
  const woSnap = await getDoc(doc(db, "work_orders", id));
  if (woSnap.exists()) {
    return { id: woSnap.id, ...woSnap.data() };
  }

  // Fall back to legacy
  const legacySnap = await getDoc(doc(db, "historico_manutencao", id));
  if (legacySnap.exists()) {
    return normalizarLegacy(legacySnap.data(), legacySnap.id);
  }

  return null;
}

/**
 * Returns all OS records for a specific machine from both collections.
 * @param {string} maquinaId
 */
export async function obterOSPorMaquinaBridge(maquinaId) {
  return obterTodasOSBridge({ maquinaId, limitN: 500 });
}

// ---------------------------------------------------------------------------
// MIGRATION UTILITY
// ---------------------------------------------------------------------------

/**
 * One-shot migration: copies all historico_manutencao documents into work_orders.
 * Skips documents that were already migrated (checks _legacyId field).
 *
 * [CF-ready]: In Cloud Functions, replace getDocs with admin SDK queries and
 * use batched writes with the admin Firestore SDK for better throughput.
 *
 * @param {Object} opts
 * @param {boolean} opts.dryRun   — If true, logs what would happen without writing.
 * @param {Function} opts.onProgress — Callback(current, total) for progress UI.
 * @returns {Promise<{migrated: number, skipped: number, errors: number}>}
 */
export async function migrarHistoricoParaWorkOrders({
  dryRun = false,
  onProgress = null,
} = {}) {
  const stats = { migrated: 0, skipped: 0, errors: 0 };

  // Fetch all legacy docs
  const legacySnap = await getDocs(collection(db, "historico_manutencao"));
  const total = legacySnap.docs.length;

  // Find already-migrated legacy IDs
  const migratedSnap = await getDocs(
    query(collection(db, "work_orders"), where("origem", "==", "legacy"))
  );
  const alreadyMigrated = new Set(
    migratedSnap.docs.map((d) => d.data()._legacyId).filter(Boolean)
  );

  let current = 0;

  for (const legacyDoc of legacySnap.docs) {
    current++;
    if (onProgress) onProgress(current, total);

    if (alreadyMigrated.has(legacyDoc.id)) {
      stats.skipped++;
      continue;
    }

    const normalised = normalizarLegacy(legacyDoc.data(), legacyDoc.id);

    const woPayload = {
      ...normalised,
      _migratedFrom: "historico_manutencao",
      _migratedAt: serverTimestamp(),
      // Remove bridge-only fields not needed in work_orders
      _raw: null,
    };
    delete woPayload._source;
    delete woPayload.id;

    if (dryRun) {
      console.log("[DRY RUN] Would migrate:", legacyDoc.id, woPayload);
      stats.migrated++;
      continue;
    }

    try {
      // Use legacy ID as WO document ID to maintain URL compatibility
      const batch = writeBatch(db);
      batch.set(doc(db, "work_orders", legacyDoc.id), woPayload);
      await batch.commit();
      stats.migrated++;
    } catch (err) {
      console.error("Migration error for doc", legacyDoc.id, err);
      stats.errors++;
    }
  }

  console.log("[db-bridge] Migration complete:", stats);
  return stats;
}

// ---------------------------------------------------------------------------
// MIGRATION STATUS
// ---------------------------------------------------------------------------

/**
 * Returns a quick summary of migration state without migrating anything.
 * Useful for a dashboard admin panel.
 */
export async function statusMigracao() {
  const [legacySnap, woSnap] = await Promise.all([
    getDocs(collection(db, "historico_manutencao")),
    getDocs(
      query(collection(db, "work_orders"), where("origem", "==", "legacy"))
    ),
  ]);

  return {
    totalLegacy: legacySnap.size,
    totalMigrado: woSnap.size,
    pendentes: legacySnap.size - woSnap.size,
    concluido: woSnap.size >= legacySnap.size,
  };
}

// ---------------------------------------------------------------------------
// PRIVATE HELPERS
// ---------------------------------------------------------------------------

async function _queryWorkOrders(maquinaId, status, limitN) {
  let q = collection(db, "work_orders");
  const constraints = [orderBy("timestampEnvio", "desc"), limit(limitN)];
  if (maquinaId) constraints.unshift(where("maquinaId", "==", maquinaId));
  if (status) constraints.unshift(where("status", "==", status));
  return getDocs(query(q, ...constraints));
}

async function _queryLegacy(maquinaId, limitN) {
  let q = collection(db, "historico_manutencao");
  const constraints = [orderBy("timestampEnvio", "desc"), limit(limitN)];
  if (maquinaId) {
    constraints.unshift(where("dadosEquipamento.id", "==", maquinaId));
  }
  return getDocs(query(q, ...constraints));
}

function _toMs(val) {
  if (!val) return 0;
  if (typeof val === "number") return val;
  if (val instanceof Timestamp) return val.toMillis();
  if (val?.toMillis) return val.toMillis();
  return new Date(val).getTime() || 0;
}

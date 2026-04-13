/**
 * db-frota.js — Fleet Inspection System v2
 *
 * Handles:
 *  - Saving structured inspections (checklists_frota)
 *  - Photo upload per item (Firebase Storage)
 *  - Auto Work Order creation for NC items (work_orders → maintenance only)
 *  - Auto Purchase Order creation for NC items (purchase_orders via db-compras.js)
 *  - Querying inspection history
 *
 * SEPARATION OF CONCERNS:
 *   Maintenance actions  → work_orders   (managed by db-os.js)
 *   Procurement actions  → purchase_orders (managed by db-compras.js)
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
import { updateVehicleState } from "./vehicle-state-engine.js";
import { PARTS_CATALOG } from "../data/parts-catalog.js";
import { criarPedidoCompra } from "./db-compras.js";

// ============================================================
// SAVE INSPECTION
// ============================================================

/**
 * Saves a complete inspection document to checklists_frota.
 *
 * @param {Object} inspection — structured inspection payload
 * @param {Map<string,File[]>} photoFiles — Map<itemId, File[]> for NC items
 * @param {Object} perfil — authenticated user profile
 * @returns {Promise<string>} — Firestore document ID
 */
export async function salvarInspecao(inspection, photoFiles, perfil) {
  // 1. Upload photos for each NC item
  const updatedItems = await _uploadItemPhotos(
    inspection.checklist,
    photoFiles,
    inspection.header.vehiclePlate || "SEM_PLACA"
  );

  // 2. Compute NC count
  const nonConformities = updatedItems.filter((i) => i.status === "NC").length;

  // 3. Build final payload
  const payload = {
    header:          inspection.header,
    checklist:       updatedItems,
    maintenance:     inspection.maintenance,
    notes:           inspection.notes,
    inspector:       inspection.inspector,
    driver:          inspection.driver,
    responsibilityTermAccepted: inspection.responsibilityTermAccepted,
    nonConformities,
    vehicleId:       inspection.header.vehicleId,
    vehiclePlate:    inspection.header.vehiclePlate,
    vehicleModel:    inspection.header.vehicleModel,
    inspectionType:  inspection.header.inspectionType,
    createdBy:       perfil?.nome || "Sistema",
    createdAt:       serverTimestamp(),
    timestampEnvio:  Date.now(),
  };

  const docRef = await addDoc(collection(db, "checklists_frota"), payload);

  // 4. Auto-create Work Orders for NC items (non-blocking)
  if (nonConformities > 0) {
    autoWorkOrderFrota(docRef.id, updatedItems, inspection.header, perfil).catch((err) => {
      console.error("[FROTA] Erro ao criar O.S automáticas:", err);
    });
  }

  // 5. Update vehicle_state (non-blocking)
  const inspResult = nonConformities > 0
    ? (nonConformities >= 3 ? "critical" : "attention")
    : "ok";

  updateVehicleState(inspection.header.vehicleId, {
    newStatus:       inspResult === "ok" ? "operational" : inspResult === "critical" ? "critical" : "attention",
    inspectionResult: inspResult,
    woType:          "inspection",
    lastEventDesc:   `Inspeção de ${inspection.header.inspectionType === "departure" ? "saída" : "retorno"} — ${nonConformities > 0 ? `${nonConformities} NC` : "Conforme"}`,
    perfil,
  }).catch((e) => console.warn("[FROTA] updateVehicleState:", e));

  return docRef.id;
}

// ============================================================
// PHOTO UPLOAD
// ============================================================

async function _uploadItemPhotos(items, photoFiles, placa) {
  if (!photoFiles || photoFiles.size === 0) return items;

  return Promise.all(
    items.map(async (item) => {
      const files = photoFiles.get(item.id);
      if (!files || files.length === 0) return item;

      const urls = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = `inspecoes_frota/${placa}/${Date.now()}_${item.id}_${i}.jpg`;
        const storageRef = ref(storage, path);
        const snapshot   = await uploadBytes(storageRef, file);
        const url        = await getDownloadURL(snapshot.ref);
        urls.push(url);
      }

      return { ...item, photos: urls };
    })
  );
}

// ============================================================
// AUTO WORK ORDERS + PURCHASE ORDERS FROM NC ITEMS
// ============================================================

/**
 * Action Engine — ONE consolidated action package per inspection.
 *
 * Output (maximum):
 *   1 × Maintenance Work Order  → work_orders    (all NC issues in one WO)
 *   1 × Purchase Order          → purchase_orders (all parts in one PO)
 *
 * Deduplication across inspections:
 *   If an open PO already exists for this vehicle, NEW parts are appended
 *   to it (merging quantities) instead of creating a duplicate.
 *
 * Backlinks written to the inspection:
 *   linkedWorkOrders[]     — [woId]  (at most 1)
 *   linkedPurchaseOrders[] — [poId]  (at most 1)
 *
 * [CF-ready]: Can be moved to a Firestore trigger on checklists_frota/{id}.onCreate
 *
 * @param {string}   inspectionId
 * @param {Object[]} items         — full checklist items array
 * @param {Object}   header        — inspection header
 * @param {Object}   perfil        — authenticated user
 */
export async function autoWorkOrderFrota(inspectionId, items, header, perfil) {
  const ncItems = items.filter((i) => i.status === "NC");
  if (!ncItems.length) return;

  const vehicleId = header.vehicleId || "";
  const veiculo   = `${header.vehiclePlate || ""}${header.vehicleModel ? ` — ${header.vehicleModel}` : ""}`.trim();
  const tipo      = header.inspectionType === "departure" ? "Saída" : "Retorno";
  const dataInsp  = header.date || new Date().toLocaleDateString("pt-BR");
  const criador   = perfil?.nome || "Sistema";

  const highPriorityCategories = ["structure_safety_fluids", "mechanical_load", "lighting_signaling"];

  // ── Step 1: Determine consolidated priority ──────────────────────────────
  // Use the highest priority found across all NC items
  const hasCriticalItem = ncItems.some((i) => highPriorityCategories.includes(i.category));
  const woPriority = hasCriticalItem ? "high" : "medium";

  // ── Step 2: Collect all purchase parts from every NC item ────────────────
  const allParts = [];
  ncItems.forEach((item) => {
    const entry = PARTS_CATALOG[item.id];
    if (entry?.requiresPurchase && entry.parts?.length) {
      entry.parts.forEach((p) => allParts.push(p));
    }
  });

  // ── Step 3: Consolidate — merge quantities for identical part names ───────
  const consolidatedItems = _consolidateParts(allParts);

  // ── Step 4: Create ONE consolidated Maintenance Work Order ───────────────
  // Build a multi-issue description listing every NC item
  const issueLines = ncItems
    .map((i) => `  • ${i.label}${i.notes ? ` — ${i.notes}` : ""}`)
    .join("\n");

  const maintTitle = ncItems.length === 1
    ? `[FROTA] NC: ${ncItems[0].label} — ${header.vehiclePlate}`
    : `[FROTA] ${ncItems.length} NCs — Inspeção de ${tipo} — ${header.vehiclePlate}`;

  const maintDesc =
    `Inspeção de ${tipo} em ${dataInsp} — ${ncItems.length} item(s) não conforme(s).\n` +
    `Veículo: ${veiculo}\n\n` +
    `Itens NC:\n${issueLines}`;

  const maintPayload = {
    type:            "maintenance",
    maintenanceType: "corrective",
    title:           maintTitle,
    description:     maintDesc,
    // Structured issues array for traceability
    issues: ncItems.map((i) => ({
      label:    i.label,
      category: i.category,
      notes:    i.notes || "",
      photos:   i.photos || [],
    })),
    origin:     "inspection",
    originId:   vehicleId,
    originNome: header.vehiclePlate || "",
    entityType: "vehicle",
    vehicleId,
    vehicleName: header.vehicleModel || "",
    assetTag:    header.vehiclePlate || "",
    sector:      "logistica",
    priority:    woPriority,
    status:      "open",
    solicitante: criador,
    criadoPor:   criador,
    inspecaoId:  inspectionId,
    // Keep ncItemLabel pointing to the first/most critical item for backwards compatibility
    ncItemLabel: ncItems[0]?.label || null,
    timeline: [{
      acao:      `O.S consolidada criada automaticamente — ${ncItems.length} NC(s) em inspeção de frota (${tipo})`,
      usuario:   "Sistema",
      icone:     "🤖",
      timestamp: Date.now(),
    }],
    createdAt:      serverTimestamp(),
    updatedAt:      serverTimestamp(),
    timestampEnvio: Date.now(),
  };

  const maintRef = await addDoc(collection(db, "work_orders"), maintPayload);
  const createdWoId = maintRef.id;
  console.log(`[FROTA] O.S de manutenção criada: ${createdWoId}`);

  // ── Step 5: Create / update ONE consolidated Purchase Order ──────────────
  let finalPoId = null;

  console.log(`[FROTA] Itens para pedido de compra: ${consolidatedItems.length}`, consolidatedItems);

  if (consolidatedItems.length > 0) {
    // Check for an existing open PO for this vehicle (cross-inspection dedup)
    const existingPOs = await _loadOpenPurchaseOrders(vehicleId);
    const existingPO  = existingPOs[0] || null; // most recent open PO

    if (existingPO) {
      // Append new items to the existing PO (merge quantities for duplicates)
      const mergedItems = _mergeItems(existingPO.items || [], consolidatedItems);
      const appendNote  =
        `\nAtualizado — inspeção de ${tipo} em ${dataInsp} (${ncItems.length} NC adicionais)`;

      await updateDoc(doc(db, "purchase_orders", existingPO.id), {
        items:         mergedItems,
        justificativa: (existingPO.justificativa || "") + appendNote,
        // Escalate urgência if needed
        urgencia: _maxUrgencia(existingPO.urgencia, _woPriorityToUrgencia(woPriority)),
        // Add backlink to this WO if not already present
        linkedWorkOrderIds: [...new Set([...(existingPO.linkedWorkOrderIds || []), createdWoId])],
        updatedAt:           serverTimestamp(),
        timestampAtualizado: Date.now(),
        // Append to timeline without a full re-read
        timeline: [
          ...(existingPO.timeline || []),
          {
            acao:      `${consolidatedItems.length} item(s) adicionado(s) — inspeção de ${tipo} em ${dataInsp} | O.S: ${createdWoId}`,
            usuario:   "Sistema",
            timestamp: Date.now(),
          },
        ],
      });

      finalPoId = existingPO.id;
      console.log(`[FROTA] Pedido de compra existente atualizado: ${finalPoId} (${mergedItems.length} itens total)`);

    } else {
      // No open PO — create a fresh consolidated one
      const urgencia = _woPriorityToUrgencia(woPriority);
      const ncLabels = ncItems.map((i) => i.label).join(", ");

      const poPayload = {
        categoria:          "peca",
        origem:             "inspection",
        originId:           inspectionId,
        linkedWorkOrderId:  createdWoId,          // ← traceability: WO that originated this PO
        inspecaoId:         inspectionId,          // ← traceability: source inspection
        vehicleId,
        vehiclePlate:       header.vehiclePlate || "",
        vehicleName:        header.vehicleModel  || "",
        justificativa:
          `Auto-gerado — inspeção de ${tipo} em ${dataInsp}.\n` +
          `Veículo: ${veiculo}\n` +
          `Itens NC: ${ncLabels}`,
        items:       consolidatedItems,
        solicitante: criador,
        criadoPor:   criador,
        setor:       "logistica",
        urgencia,
        fornecedor:  "",
        timeline: [{
          acao:      `Pedido de compra criado automaticamente — ${consolidatedItems.length} item(s) de ${ncItems.length} NC(s) | O.S: ${createdWoId}`,
          usuario:   "Sistema",
          timestamp: Date.now(),
        }],
      };

      console.log(`[FROTA] Criando pedido de compra...`, poPayload);
      finalPoId = await criarPedidoCompra(poPayload);
      console.log(`[FROTA] Pedido de compra criado: ${finalPoId} (${consolidatedItems.length} itens)`);
    }

    // ── Step 5b: Write purchaseOrderId back to the Work Order ──────────────
    if (finalPoId) {
      try {
        await updateDoc(doc(db, "work_orders", createdWoId), {
          purchaseOrderId: finalPoId,
          updatedAt:       serverTimestamp(),
          timestampAtualizado: Date.now(),
        });
        console.log(`[FROTA] O.S ${createdWoId} vinculada ao pedido ${finalPoId}`);
      } catch (e) {
        console.warn("[FROTA] Falha ao vincular purchaseOrderId na O.S:", e);
      }
    }
  }

  // ── Step 6: Bidirectional backlinks on the inspection ────────────────────
  const backlink = {
    linkedWorkOrders: [createdWoId],
  };
  if (finalPoId) backlink.linkedPurchaseOrders = [finalPoId];

  try {
    await updateDoc(doc(db, "checklists_frota", inspectionId), backlink);
  } catch (e) {
    console.warn("[FROTA] Falha ao atualizar backlinks na inspeção:", e);
  }
}

// ============================================================
// ACTION ENGINE HELPERS
// ============================================================

/**
 * Consolidates a flat list of parts — sums quantities for identical names.
 * Returns an array ready for purchase_orders.items[].
 *
 * Field "descricao" is used to match the schema expected by app-compra-detalhe.js
 * (which renders i.descricao in the items table).
 *
 * @param {Array<{name, quantity, priority}>} parts
 * @returns {Array<{descricao, quantidade, precoUnitario, precoTotal}>}
 */
function _consolidateParts(parts) {
  const map = {};
  parts.forEach((p) => {
    const key = p.name;
    if (!map[key]) {
      map[key] = { descricao: p.name, quantidade: 0, precoUnitario: 0, precoTotal: 0 };
    }
    map[key].quantidade += p.quantity || 1;
  });
  return Object.values(map);
}

/**
 * Merges incoming items into an existing items array.
 * Adds quantities for matching descriptions; appends new items.
 * Handles both legacy "nome" and current "descricao" field names.
 *
 * @param {Array<{descricao, quantidade, ...}>} existing
 * @param {Array<{descricao, quantidade, ...}>} incoming
 */
function _mergeItems(existing, incoming) {
  const map = {};
  existing.forEach((i) => {
    // Support legacy "nome" field from previously saved POs
    const key = i.descricao || i.nome || "";
    map[key] = { ...i, descricao: key };
  });
  incoming.forEach((i) => {
    const key = i.descricao || i.nome || "";
    if (map[key]) {
      map[key].quantidade += i.quantidade || 1;
    } else {
      map[key] = { ...i, descricao: key };
    }
  });
  return Object.values(map);
}

/** Maps WO priority string to PO urgência string */
function _woPriorityToUrgencia(priority) {
  return priority === "high" ? "critico" : priority === "medium" ? "urgente" : "normal";
}

/** Returns the stricter of two urgência values */
function _maxUrgencia(a, b) {
  const rank = { critico: 3, urgente: 2, normal: 1 };
  return (rank[a] || 1) >= (rank[b] || 1) ? a : b;
}

/**
 * Loads all open Purchase Orders for a given vehicle from purchase_orders.
 * Used for deduplication inside autoWorkOrderFrota().
 *
 * Single-field query (vehicleId) to avoid composite index requirement.
 * Filters non-completed/cancelled status client-side.
 */
async function _loadOpenPurchaseOrders(vehicleId) {
  if (!vehicleId) return [];
  try {
    const q    = query(collection(db, "purchase_orders"), where("vehicleId", "==", vehicleId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((po) => po.status !== "received" && po.status !== "cancelled")
      .sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0)); // most recent first
  } catch (e) {
    console.warn("[FROTA] _loadOpenPurchaseOrders:", e);
    return [];
  }
}

// ============================================================
// QUERIES
// ============================================================

/**
 * Returns recent inspections, optionally filtered by vehicleId.
 *
 * NOTE: orderBy is intentionally omitted from the Firestore query to avoid
 * requiring a composite index (vehicleId + timestampEnvio) that may not exist.
 * Sorting is done client-side instead, which is safe for the volumes involved.
 */
export async function obterInspecoesRecentes(vehicleId = null, limitN = 50) {
  let q;
  if (vehicleId) {
    // Single-field where only — no composite index needed
    q = query(
      collection(db, "checklists_frota"),
      where("vehicleId", "==", vehicleId),
      limit(limitN)
    );
  } else {
    // No filter — fetch latest across all vehicles, limit to avoid full scan
    q = query(
      collection(db, "checklists_frota"),
      limit(limitN)
    );
  }

  const snap = await getDocs(q);
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Sort descending by timestamp client-side
  return docs.sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0));
}

/**
 * Returns all open Purchase Orders from purchase_orders (for dashboard batch load).
 * Does NOT filter by vehicleId — caller groups by vehicleId client-side.
 *
 * Single-field query (origem) — no composite index needed.
 * Returns only non-received/cancelled POs.
 */
export async function obterPendingPurchaseWOs(limitN = 300) {
  try {
    // Fetch all inspection-originated POs (the ones generated by this system)
    const q    = query(
      collection(db, "purchase_orders"),
      where("origem", "==", "inspection"),
      limit(limitN)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((po) => po.status !== "received" && po.status !== "cancelled");
  } catch (e) {
    console.error("[FROTA] obterPendingPurchaseWOs:", e);
    return [];
  }
}

/**
 * Returns a single inspection by ID.
 */
export async function obterInspecaoPorId(id) {
  const snap = await getDoc(doc(db, "checklists_frota", id));
  if (!snap.exists()) throw new Error("Inspeção não encontrada.");
  return { id: snap.id, ...snap.data() };
}

// ============================================================
// PURCHASE ORDERS LINKED TO VEHICLE
// ============================================================

/**
 * Returns purchase orders linked to a vehicle's work orders.
 * Queries purchase_orders where originWO is one of the vehicle's WO IDs,
 * or where vehicleId field matches directly.
 *
 * @param {string}   vehicleId
 * @param {string[]} [woIds]    — optional pre-loaded WO ID list to skip extra query
 * @returns {Promise<Object[]>}
 */
export async function getPurchaseOrdersByVehicle(vehicleId, woIds = []) {
  try {
    const results = [];

    // 1. Direct vehicle link (if purchase_order has vehicleId field)
    const qDirect = query(
      collection(db, "purchase_orders"),
      where("vehicleId", "==", vehicleId)
    );
    const snapDirect = await getDocs(qDirect);
    snapDirect.forEach((d) => results.push({ id: d.id, ...d.data() }));

    // 2. Linked via originWO field (PO created from a fleet WO)
    if (woIds.length > 0) {
      // Firestore limits "in" to 30 items — batch if needed
      const batches = [];
      for (let i = 0; i < woIds.length; i += 30) {
        batches.push(woIds.slice(i, i + 30));
      }
      for (const batch of batches) {
        const qWO = query(
          collection(db, "purchase_orders"),
          where("originWO", "in", batch)
        );
        const snapWO = await getDocs(qWO);
        snapWO.forEach((d) => {
          if (!results.find((r) => r.id === d.id)) {
            results.push({ id: d.id, ...d.data() });
          }
        });
      }
    }

    return results.sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0));
  } catch (e) {
    console.error("[FROTA] getPurchaseOrdersByVehicle error:", e);
    return [];
  }
}

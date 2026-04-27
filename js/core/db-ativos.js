/**
 * db-ativos.js — Asset & Maintenance Management — Firestore Layer
 *
 * Collections:
 *   asset_categories  — Dynamic category definitions + field schemas
 *   assets            — All patrimonial assets
 *   asset_maintenance — Maintenance records (preventive/corrective/inspection)
 *   inventory_sessions — Audit/counting sessions
 */

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  increment,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ─── Collection names ──────────────────────────────────
const C_CATS  = "asset_categories";
const C_ASSET = "assets";
const C_MAINT = "asset_maintenance";
const C_INV   = "inventory_sessions";

// ─── Timestamp helper ──────────────────────────────────
export function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

export function fmtDate(ts, opts = {}) {
  const d = tsToDate(ts);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", opts);
}

export function fmtDateTime(ts) {
  const d = tsToDate(ts);
  if (!d) return "—";
  return (
    d.toLocaleDateString("pt-BR") +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

// ─── STATUS metadata ───────────────────────────────────
export const ASSET_STATUS = {
  ativo:      { label: "Ativo",        icon: "🟢", css: "badge-ativo"      },
  manutencao: { label: "Em Manutenção",icon: "🔧", css: "badge-manutencao" },
  avariado:   { label: "Avariado",     icon: "🔴", css: "badge-avariado"   },
  inativo:    { label: "Inativo",      icon: "⚫", css: "badge-inativo"    },
};

export const MAINT_TYPE = {
  preventiva: { label: "Preventiva", icon: "🔵", css: "badge-preventiva" },
  corretiva:  { label: "Corretiva",  icon: "🔴", css: "badge-corretiva"  },
  inspecao:   { label: "Inspeção",   icon: "🟢", css: "badge-inspecao"   },
};

export const MAINT_STATUS = {
  pendente:  { label: "Pendente",     icon: "⏳", css: "badge-pendente"  },
  andamento: { label: "Em Andamento", icon: "🔄", css: "badge-andamento" },
  concluida: { label: "Concluída",    icon: "✅", css: "badge-concluida" },
};

export const FIELD_TYPES = {
  text:   "Texto",
  number: "Número",
  date:   "Data",
  select: "Seleção",
  textarea: "Texto Longo",
};

// ═══════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════

export async function getCategories() {
  const snap = await getDocs(
    query(collection(db, C_CATS), orderBy("name"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getCategoryById(id) {
  const snap = await getDoc(doc(db, C_CATS, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createCategory(data) {
  const ref = await addDoc(collection(db, C_CATS), {
    ...data,
    assetCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCategory(id, data) {
  await updateDoc(doc(db, C_CATS, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCategory(id) {
  await deleteDoc(doc(db, C_CATS, id));
}

/**
 * Seeds default categories into Firestore if collection is empty.
 * @param {Array} defaults — array of category objects from ativos-categorias.js
 */
export async function seedDefaultCategories(defaults) {
  const existing = await getDocs(collection(db, C_CATS));
  if (!existing.empty) return false;
  const batch = writeBatch(db);
  defaults.forEach((cat) => {
    const ref = doc(collection(db, C_CATS));
    batch.set(ref, {
      ...cat,
      assetCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
  return true;
}

// ═══════════════════════════════════════════════════════
// ASSET CODE GENERATION
// ═══════════════════════════════════════════════════════

/**
 * Generates next sequential code for a given prefix.
 * Counts existing assets with same prefix and pads to 4 digits.
 */
export async function generateAssetCode(prefix) {
  const snap = await getDocs(
    query(collection(db, C_ASSET), where("codePrefix", "==", prefix))
  );
  const n = snap.size + 1;
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

// ═══════════════════════════════════════════════════════
// ASSETS
// ═══════════════════════════════════════════════════════

/**
 * Get all assets, optionally filtered.
 * filters: { categoryId?, status?, location? }
 */
export async function getAssets(filters = {}) {
  const constraints = [];
  if (filters.categoryId) constraints.push(where("categoryId", "==", filters.categoryId));
  if (filters.status)     constraints.push(where("status",     "==", filters.status));
  if (filters.location)   constraints.push(where("location",   "==", filters.location));
  constraints.push(orderBy("createdAt", "desc"));

  const snap = await getDocs(query(collection(db, C_ASSET), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAssetById(id) {
  const snap = await getDoc(doc(db, C_ASSET, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createAsset(data) {
  const ref = await addDoc(collection(db, C_ASSET), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (data.categoryId) {
    try {
      await updateDoc(doc(db, C_CATS, data.categoryId), { assetCount: increment(1) });
    } catch (_) {}
  }
  return ref.id;
}

export async function updateAsset(id, data) {
  await updateDoc(doc(db, C_ASSET, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAsset(id, categoryId) {
  await deleteDoc(doc(db, C_ASSET, id));
  if (categoryId) {
    try {
      await updateDoc(doc(db, C_CATS, categoryId), { assetCount: increment(-1) });
    } catch (_) {}
  }
}

// ═══════════════════════════════════════════════════════
// MAINTENANCE
// ═══════════════════════════════════════════════════════

/**
 * Get maintenance records, optionally filtered.
 * filters: { assetId?, status?, type? }
 */
export async function getMaintenance(filters = {}) {
  const constraints = [];
  if (filters.assetId) constraints.push(where("assetId", "==", filters.assetId));
  if (filters.status)  constraints.push(where("status",  "==", filters.status));
  if (filters.type)    constraints.push(where("type",    "==", filters.type));
  constraints.push(orderBy("createdAt", "desc"));

  const snap = await getDocs(query(collection(db, C_MAINT), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getMaintenanceById(id) {
  const snap = await getDoc(doc(db, C_MAINT, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createMaintenance(data) {
  const ref = await addDoc(collection(db, C_MAINT), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // If starting immediately, flip asset to "em manutenção"
  if (data.status === "andamento" && data.assetId) {
    await updateAsset(data.assetId, { status: "manutencao" });
  }
  return ref.id;
}

export async function updateMaintenance(id, data, assetId) {
  await updateDoc(doc(db, C_MAINT, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
  // If completed, flip asset back to ativo
  if (data.status === "concluida" && assetId) {
    await updateAsset(assetId, { status: "ativo" });
  }
}

export async function deleteMaintenance(id) {
  await deleteDoc(doc(db, C_MAINT, id));
}

// ═══════════════════════════════════════════════════════
// INVENTORY SESSIONS
// ═══════════════════════════════════════════════════════

export async function getInventorySessions() {
  const snap = await getDocs(
    query(collection(db, C_INV), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getInventorySession(id) {
  const snap = await getDoc(doc(db, C_INV, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createInventorySession(data) {
  const ref = await addDoc(collection(db, C_INV), {
    ...data,
    status: "em_andamento",
    results: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Mark one asset in an inventory session.
 * @param {string} sessionId
 * @param {string} assetId
 * @param {'found'|'missing'|'issue'} status
 * @param {string} [note]
 */
export async function markInventoryItem(sessionId, assetId, status, note = "") {
  await updateDoc(doc(db, C_INV, sessionId), {
    [`results.${assetId}`]: {
      status,
      note,
      markedAt: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  });
}

export async function closeInventorySession(sessionId, summary) {
  await updateDoc(doc(db, C_INV, sessionId), {
    status: "concluida",
    summary,
    closedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ═══════════════════════════════════════════════════════
// SUPPLIERS (asset_suppliers)
//
// Document shape:
//   name        : string   — company / supplier name
//   categoryIds : string[] — Firestore category IDs served
//   type        : 'purchase' | 'service' | 'both'
//   contact     : string   — contact person name
//   email       : string
//   phone       : string
//   cnpj        : string   — BR tax ID (optional)
//   notes       : string
//   active      : boolean
// ═══════════════════════════════════════════════════════

const C_SUPP = "asset_suppliers";

/**
 * List suppliers.
 * @param {{ categoryId?: string, type?: string, active?: boolean }} filters
 */
export async function getSuppliers(filters = {}) {
  const constraints = [];
  if (filters.categoryId) constraints.push(where("categoryIds", "array-contains", filters.categoryId));
  if (filters.type)       constraints.push(where("type",   "==", filters.type));
  if (filters.active !== undefined) constraints.push(where("active", "==", filters.active));
  constraints.push(orderBy("name"));

  const snap = await getDocs(query(collection(db, C_SUPP), ...constraints));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getSupplierById(id) {
  const snap = await getDoc(doc(db, C_SUPP, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createSupplier(data) {
  const ref = await addDoc(collection(db, C_SUPP), {
    active: true,
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSupplier(id, data) {
  await updateDoc(doc(db, C_SUPP, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSupplier(id) {
  await deleteDoc(doc(db, C_SUPP, id));
}

// ─── Supplier metadata ─────────────────────────────────
export const SUPPLIER_TYPE = {
  purchase: { label: "Compras",          icon: "🛒", css: "badge-compra"  },
  service:  { label: "Serviços",         icon: "🔧", css: "badge-servico" },
  both:     { label: "Compras + Serv.",  icon: "🏢", css: "badge-ambos"   },
};

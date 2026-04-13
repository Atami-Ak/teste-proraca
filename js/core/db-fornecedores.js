/**
 * db-fornecedores.js — Suppliers (Fornecedores) CRUD
 *
 * Firestore collection: `fornecedores`
 * Document shape:
 * {
 *   nome, cnpj, contato, telefone, email, website,
 *   categoria: "peca" | "equipamento" | "servico" | "operacional",
 *   avaliacao: 1-5,
 *   ativo: boolean,
 *   observacoes,
 *   criadoEm, atualizadoEm,
 *   historicoPedidos: [ { poId, data, valor, avaliacao } ]
 * }
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "./firebase-config.js";

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

export const FORNECEDOR_CATEGORIAS = {
  peca: "Peças e Componentes",
  equipamento: "Equipamentos",
  servico: "Serviços Técnicos",
  operacional: "Material Operacional",
};

export const FORNECEDOR_AVALIACAO_LABEL = {
  1: "Ruim",
  2: "Regular",
  3: "Bom",
  4: "Muito Bom",
  5: "Excelente",
};

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------

/**
 * Creates a new supplier document.
 * @param {Object} dados
 * @returns {Promise<{id: string, dados: Object}>}
 */
export async function criarFornecedor(dados) {
  _validarFornecedor(dados);

  const payload = {
    nome: dados.nome.trim(),
    cnpj: dados.cnpj?.trim() || null,
    contato: dados.contato?.trim() || null,
    telefone: dados.telefone?.trim() || null,
    email: dados.email?.trim() || null,
    website: dados.website?.trim() || null,
    categoria: dados.categoria || "operacional",
    avaliacao: Number(dados.avaliacao) || 3,
    observacoes: dados.observacoes?.trim() || null,
    ativo: true,
    historicoPedidos: [],
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, "fornecedores"), payload);
  return { id: docRef.id, dados: payload };
}

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------

/**
 * Returns a single supplier by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function obterFornecedorPorId(id) {
  const snap = await getDoc(doc(db, "fornecedores", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Returns all active suppliers, optionally filtered by category.
 * @param {string|null} categoria
 * @returns {Promise<Array>}
 */
export async function obterFornecedores(categoria = null) {
  const constraints = [where("ativo", "==", true), orderBy("nome")];
  if (categoria) {
    constraints.unshift(where("categoria", "==", categoria));
  }
  const snap = await getDocs(query(collection(db, "fornecedores"), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Returns all suppliers (including inactive). Admin use only.
 */
export async function obterTodosFornecedores() {
  const snap = await getDocs(
    query(collection(db, "fornecedores"), orderBy("nome"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Searches suppliers by name (case-insensitive prefix match via Firestore range query).
 * For full-text search, consider Algolia or a client-side filter post-fetch.
 * @param {string} termo
 */
export async function buscarFornecedores(termo) {
  if (!termo || termo.length < 2) return obterFornecedores();

  // Firestore doesn't support case-insensitive search natively.
  // Fetch all active and filter client-side.
  const todos = await obterFornecedores();
  const lower = termo.toLowerCase();
  return todos.filter(
    (f) =>
      f.nome.toLowerCase().includes(lower) ||
      (f.contato && f.contato.toLowerCase().includes(lower)) ||
      (f.cnpj && f.cnpj.includes(termo))
  );
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

/**
 * Updates supplier fields.
 * @param {string} id
 * @param {Object} dados — partial update object
 */
export async function atualizarFornecedor(id, dados) {
  const update = { ...dados, atualizadoEm: serverTimestamp() };
  // Don't allow overwriting historicoPedidos via this function
  delete update.historicoPedidos;
  await updateDoc(doc(db, "fornecedores", id), update);
}

/**
 * Updates supplier rating (1–5).
 * @param {string} id
 * @param {number} avaliacao
 */
export async function avaliarFornecedor(id, avaliacao) {
  if (avaliacao < 1 || avaliacao > 5) throw new Error("Avaliação deve ser entre 1 e 5.");
  await updateDoc(doc(db, "fornecedores", id), {
    avaliacao: Number(avaliacao),
    atualizadoEm: serverTimestamp(),
  });
}

/**
 * Appends a purchase order reference to the supplier's history.
 * Called after a PO is marked as received.
 *
 * [CF-ready]: Move to a Firestore trigger on purchase_orders status change.
 *
 * @param {string} fornecedorId
 * @param {Object} pedido — { poId, numero, valor, avaliacao }
 */
export async function registrarPedidoNoFornecedor(fornecedorId, pedido) {
  const snap = await getDoc(doc(db, "fornecedores", fornecedorId));
  if (!snap.exists()) throw new Error("Fornecedor não encontrado.");

  const historico = snap.data().historicoPedidos || [];
  historico.push({
    poId: pedido.poId,
    numero: pedido.numero || null,
    data: Date.now(),
    valor: Number(pedido.valor) || 0,
    avaliacao: Number(pedido.avaliacao) || null,
  });

  await updateDoc(doc(db, "fornecedores", fornecedorId), {
    historicoPedidos: historico,
    atualizadoEm: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// DELETE (soft)
// ---------------------------------------------------------------------------

/**
 * Deactivates (soft-deletes) a supplier.
 * Hard delete is discouraged as historical POs reference the supplier ID.
 * @param {string} id
 */
export async function desativarFornecedor(id) {
  await updateDoc(doc(db, "fornecedores", id), {
    ativo: false,
    atualizadoEm: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// STATISTICS
// ---------------------------------------------------------------------------

/**
 * Returns performance stats for a supplier:
 *   { totalPedidos, valorTotal, avaliacaoMedia, ultimoPedido }
 * @param {string} id
 */
export async function estatisticasFornecedor(id) {
  const forn = await obterFornecedorPorId(id);
  if (!forn) return null;

  const hist = forn.historicoPedidos || [];
  const totalPedidos = hist.length;
  const valorTotal = hist.reduce((a, h) => a + (h.valor || 0), 0);
  const avaliacoes = hist.filter((h) => h.avaliacao).map((h) => h.avaliacao);
  const avaliacaoMedia =
    avaliacoes.length > 0
      ? Math.round((avaliacoes.reduce((a, b) => a + b, 0) / avaliacoes.length) * 10) / 10
      : null;
  const ultimoPedido = hist.length > 0 ? Math.max(...hist.map((h) => h.data || 0)) : null;

  return { totalPedidos, valorTotal, avaliacaoMedia, ultimoPedido };
}

/**
 * Returns top N suppliers by total order value.
 * @param {number} n
 */
export async function topFornecedores(n = 5) {
  const todos = await obterTodosFornecedores();
  return todos
    .map((f) => {
      const hist = f.historicoPedidos || [];
      const valor = hist.reduce((a, h) => a + (h.valor || 0), 0);
      return { id: f.id, nome: f.nome, categoria: f.categoria, valor, pedidos: hist.length };
    })
    .sort((a, b) => b.valor - a.valor)
    .slice(0, n);
}

// ---------------------------------------------------------------------------
// VALIDATION
// ---------------------------------------------------------------------------

function _validarFornecedor(dados) {
  if (!dados.nome || dados.nome.trim().length < 2) {
    throw new Error("Nome do fornecedor é obrigatório (mín. 2 caracteres).");
  }
  if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) {
    throw new Error("Email inválido.");
  }
  if (dados.avaliacao && (dados.avaliacao < 1 || dados.avaliacao > 5)) {
    throw new Error("Avaliação deve ser entre 1 e 5.");
  }
}

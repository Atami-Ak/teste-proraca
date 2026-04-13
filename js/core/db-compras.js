/**
 * db-compras.js — Sistema de Compras (purchase_orders + documents de compra)
 * Collection: purchase_orders, documents
 * Documentos: PO-XXXX (purchase_document)
 *
 * SEPARADO de db-os.js por responsabilidade.
 * [CF-ready] As funções de geração de documento estão estruturadas
 * para migração a Firebase Cloud Functions.
 */
import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================================
// CONSTANTES / LABELS
// ============================================================
export const PO_CATEGORIAS = {
  peca: "Peça / Componente",
  equipamento: "Equipamento",
  servico: "Serviço",
  operacional: "Material Operacional",
};

export const PO_STATUS = {
  pending: "Pendente",
  approved: "Aprovado",
  ordered: "Pedido Realizado",
  received: "Recebido",
  cancelled: "Cancelado",
};

export const PO_URGENCIA = {
  normal: "Normal",
  urgente: "Urgente",
  critico: "Crítico",
};

export const PO_STATUS_CLASS = {
  pending: "badge-andamento",
  approved: "badge-aberta",
  ordered: "badge-aguardando",
  received: "badge-concluida",
  cancelled: "badge-cancelado",
};

// ============================================================
// PURCHASE ORDERS — CRUD
// ============================================================

/**
 * Cria um novo Pedido de Compra.
 */
export async function criarPedidoCompra(payload) {
  // Calcula total estimado a partir dos itens
  if (payload.items && payload.items.length > 0) {
    payload.totalEstimado = payload.items.reduce(
      (sum, item) => sum + (item.precoTotal || item.quantidade * (item.precoUnitario || 0)),
      0
    );
  }
  payload.status = payload.status || "pending";
  payload.createdAt = serverTimestamp();
  payload.updatedAt = serverTimestamp();
  payload.timestampEnvio = Date.now();

  const docRef = await addDoc(collection(db, "purchase_orders"), payload);
  return docRef.id;
}

/**
 * Retorna todos os pedidos de compra ordenados por data.
 */
export async function obterTodosPedidos() {
  const snap = await getDocs(collection(db, "purchase_orders"));
  const lista = [];
  snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista.sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0));
}

/**
 * Retorna um pedido pelo ID.
 */
export async function obterPedidoPorId(id) {
  const ref = doc(db, "purchase_orders", id);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  throw new Error("Pedido de compra não encontrado.");
}

/**
 * Atualiza campos de um pedido de compra.
 */
export async function atualizarPedido(id, dados) {
  dados.updatedAt = serverTimestamp();
  dados.timestampAtualizado = Date.now();
  await updateDoc(doc(db, "purchase_orders", id), dados);
}

// ============================================================
// DOCUMENTOS DE COMPRA — PO-XXXX
// [CF-ready] Candidata a Cloud Function callable
// ============================================================

/**
 * Gera número único para documento de compra (PO-XXXX).
 */
async function proximoNumeroPO() {
  const q = query(collection(db, "documents"), where("tipo", "==", "purchase_document"));
  const snap = await getDocs(q);
  return `PO-${String(snap.size + 1).padStart(4, "0")}`;
}

/**
 * Gera documento formal de compra a partir de um purchase_order.
 * Atualiza o pedido com referência ao documento gerado.
 *
 * [CF-ready] Candidata a Cloud Function callable:
 *   exports.gerarDocumentoCompra = functions.https.onCall(async (data, context) => { ... })
 */
export async function gerarDocumentoCompra(poId, poData, emissor) {
  const numero = await proximoNumeroPO();

  const payload = {
    tipo: "purchase_document",
    numero,
    sourceId: poId,
    sourceData: { ...poData },
    emissor,
    emitidoEm: serverTimestamp(),
    timestampEnvio: Date.now(),
  };

  const docRef = await addDoc(collection(db, "documents"), payload);

  // Atualiza o pedido com referência ao documento
  await updateDoc(doc(db, "purchase_orders", poId), {
    documentoId: docRef.id,
    documentoNumero: numero,
    updatedAt: serverTimestamp(),
    timestampAtualizado: Date.now(),
  });

  return { id: docRef.id, numero };
}

// ============================================================
// DOCUMENTOS — CONSULTA (SRV + PO juntos)
// ============================================================

/**
 * Retorna todos os documentos (SRV + PO), filtrados opcionalmente por tipo.
 */
export async function obterTodosDocumentos(tipo = null) {
  let q;
  if (tipo) {
    q = query(collection(db, "documents"), where("tipo", "==", tipo));
  } else {
    q = query(collection(db, "documents"));
  }
  const snap = await getDocs(q);
  const lista = [];
  snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista.sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0));
}

/**
 * Retorna um documento pelo ID.
 */
export async function obterDocumentoPorId(id) {
  const ref = doc(db, "documents", id);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  throw new Error("Documento não encontrado.");
}

// ============================================================
// WORKFLOW DE APROVAÇÃO
// [CF-ready] Todas as funções de workflow são candidatas a
// Cloud Functions callable ou Firestore triggers.
// ============================================================

/**
 * Approves a purchase order.
 * Requires role: admin | purchasing
 *
 * [CF-ready]: Move to onCall CF; verify context.auth.token.role server-side.
 *
 * @param {string} poId
 * @param {Object} aprovador — { uid, nome, role }
 * @param {string|null} nota — optional approval note
 */
export async function aprovarPedido(poId, aprovador, nota = null) {
  const po = await obterPedidoPorId(poId);
  if (po.status !== "pending") {
    throw new Error(`Pedido não pode ser aprovado (status atual: ${PO_STATUS[po.status] || po.status}).`);
  }

  const entrada = {
    acao: "aprovado",
    usuario: aprovador.nome || aprovador.uid,
    uid: aprovador.uid,
    timestamp: Date.now(),
    nota: nota || null,
  };

  const timeline = po.timeline || [];
  timeline.push(entrada);

  await updateDoc(doc(db, "purchase_orders", poId), {
    status: "approved",
    aprovadoPor: aprovador.nome || aprovador.uid,
    aprovadoPorUid: aprovador.uid,
    aprovadoEm: serverTimestamp(),
    aprovadoTimestamp: Date.now(),
    notaAprovacao: nota || null,
    timeline,
    updatedAt: serverTimestamp(),
    timestampAtualizado: Date.now(),
  });
}

/**
 * Rejects (cancels) a purchase order with a mandatory reason.
 * @param {string} poId
 * @param {Object} revisor — { uid, nome }
 * @param {string} motivo — rejection reason (required)
 */
export async function rejeitarPedido(poId, revisor, motivo) {
  if (!motivo || motivo.trim().length < 5) {
    throw new Error("Motivo da rejeição é obrigatório (mín. 5 caracteres).");
  }

  const po = await obterPedidoPorId(poId);
  if (["received", "cancelled"].includes(po.status)) {
    throw new Error(`Pedido não pode ser rejeitado (status: ${PO_STATUS[po.status]}).`);
  }

  const entrada = {
    acao: "rejeitado",
    usuario: revisor.nome || revisor.uid,
    uid: revisor.uid,
    timestamp: Date.now(),
    nota: motivo,
  };

  const timeline = po.timeline || [];
  timeline.push(entrada);

  await updateDoc(doc(db, "purchase_orders", poId), {
    status: "cancelled",
    rejeitadoPor: revisor.nome || revisor.uid,
    rejeitadoPorUid: revisor.uid,
    rejeitadoEm: serverTimestamp(),
    motivoRejeicao: motivo.trim(),
    timeline,
    updatedAt: serverTimestamp(),
    timestampAtualizado: Date.now(),
  });
}

/**
 * Marks a PO as ordered (sent to supplier).
 * @param {string} poId
 * @param {Object} usuario — { uid, nome }
 * @param {Object} opts — { numeroPedidoExterno, previsaoEntrega }
 */
export async function marcarPedidoEnviado(poId, usuario, opts = {}) {
  const po = await obterPedidoPorId(poId);
  if (po.status !== "approved") {
    throw new Error("Apenas pedidos aprovados podem ser enviados ao fornecedor.");
  }

  const entrada = {
    acao: "pedido_enviado",
    usuario: usuario.nome || usuario.uid,
    uid: usuario.uid,
    timestamp: Date.now(),
    nota: opts.numeroPedidoExterno ? `Nº externo: ${opts.numeroPedidoExterno}` : null,
  };

  const timeline = po.timeline || [];
  timeline.push(entrada);

  await updateDoc(doc(db, "purchase_orders", poId), {
    status: "ordered",
    numeroPedidoExterno: opts.numeroPedidoExterno || null,
    previsaoEntrega: opts.previsaoEntrega || null,
    enviadoEm: serverTimestamp(),
    enviadoTimestamp: Date.now(),
    enviadoPor: usuario.nome || usuario.uid,
    timeline,
    updatedAt: serverTimestamp(),
    timestampAtualizado: Date.now(),
  });
}

/**
 * Marks a PO as received (goods/services delivered).
 * @param {string} poId
 * @param {Object} usuario — { uid, nome }
 * @param {Object} opts — { notaFiscal, avaliacaoFornecedor, observacoes }
 */
export async function marcarPedidoRecebido(poId, usuario, opts = {}) {
  const po = await obterPedidoPorId(poId);
  if (po.status !== "ordered") {
    throw new Error("Apenas pedidos enviados podem ser marcados como recebidos.");
  }

  const entrada = {
    acao: "recebido",
    usuario: usuario.nome || usuario.uid,
    uid: usuario.uid,
    timestamp: Date.now(),
    nota: opts.observacoes || null,
  };

  const timeline = po.timeline || [];
  timeline.push(entrada);

  const update = {
    status: "received",
    recebidoEm: serverTimestamp(),
    recebidoTimestamp: Date.now(),
    recebidoPor: usuario.nome || usuario.uid,
    notaFiscal: opts.notaFiscal || null,
    avaliacaoFornecedor: opts.avaliacaoFornecedor || null,
    observacoesRecebimento: opts.observacoes || null,
    timeline,
    updatedAt: serverTimestamp(),
    timestampAtualizado: Date.now(),
  };

  await updateDoc(doc(db, "purchase_orders", poId), update);

  // [CF-ready]: In Cloud Functions, trigger registrarPedidoNoFornecedor here
  // via Firestore onUpdate trigger when status changes to "received".
  return { poId, fornecedorId: po.fornecedorId };
}

/**
 * Links a supplier to a purchase order.
 * @param {string} poId
 * @param {string} fornecedorId
 * @param {Object} fornecedorDados — { nome, contato, email }
 */
export async function vincularFornecedor(poId, fornecedorId, fornecedorDados = {}) {
  await updateDoc(doc(db, "purchase_orders", poId), {
    fornecedorId,
    fornecedorNome: fornecedorDados.nome || null,
    fornecedorContato: fornecedorDados.contato || null,
    fornecedorEmail: fornecedorDados.email || null,
    updatedAt: serverTimestamp(),
    timestampAtualizado: Date.now(),
  });
}

/**
 * Adds a comment/note to the PO timeline without changing status.
 * @param {string} poId
 * @param {string} texto
 * @param {Object} usuario — { uid, nome }
 */
export async function adicionarComentarioPO(poId, texto, usuario) {
  if (!texto || texto.trim().length === 0) return;

  const po = await obterPedidoPorId(poId);
  const timeline = po.timeline || [];
  timeline.push({
    acao: "comentario",
    usuario: usuario.nome || usuario.uid,
    uid: usuario.uid,
    timestamp: Date.now(),
    nota: texto.trim(),
  });

  await updateDoc(doc(db, "purchase_orders", poId), {
    timeline,
    updatedAt: serverTimestamp(),
    timestampAtualizado: Date.now(),
  });
}

/**
 * Returns all POs pending approval (status === "pending").
 * Used by purchasing dashboard.
 */
export async function obterPedidosPendentes() {
  const q = query(
    collection(db, "purchase_orders"),
    where("status", "==", "pending")
  );
  const snap = await getDocs(q);
  const lista = [];
  snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista.sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0));
}

/**
 * Returns all POs that originated from a specific Work Order.
 * @param {string} osId
 */
export async function obterPedidosPorOS(osId) {
  const q = query(
    collection(db, "purchase_orders"),
    where("osOrigemId", "==", osId)
  );
  const snap = await getDocs(q);
  const lista = [];
  snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista;
}

// ============================================================
// UTILITÁRIOS
// ============================================================
export function formatarData(ts) {
  if (!ts) return "—";
  const ms = ts.seconds ? ts.seconds * 1000 : ts;
  return new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function formatarMoeda(valor) {
  if (valor == null || isNaN(valor)) return "R$ 0,00";
  return `R$ ${Number(valor).toFixed(2).replace(".", ",")}`;
}

export function calcularTotalItens(items = []) {
  return items.reduce((sum, item) => {
    const total = item.precoTotal ?? item.quantidade * (item.precoUnitario || 0);
    return sum + (total || 0);
  }, 0);
}

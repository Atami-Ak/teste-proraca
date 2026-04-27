/**
 * db-os.js — Ordens de Serviço (work_orders + documents de serviço)
 * Tipos: maintenance | service
 * Collection: work_orders, documents
 *
 * [CF-ready] As funções gerarDocumentoServico e criarPedidoFromOS
 * estão estruturadas para migração a Firebase Cloud Functions.
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
export const OS_TIPOS = {
  maintenance: "Manutenção",
  service: "Serviço",
};

export const OS_STATUS = {
  open: "Aberta",
  pending_approval: "Aguardando Aprovação",
  in_progress: "Em Andamento",
  waiting_parts: "Aguardando Peças",
  completed: "Concluída",
};

export const OS_PRIORIDADE = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

export const OS_ORIGEM = {
  machine: "Maquinário",
  fleet: "Frota",
  manual: "Manual",
};

export const SERVICE_CATEGORIAS = {
  maquina: "Manutenção de Máquina",
  instalacao: "Instalação de Equipamento",
  ti: "TI / Sistemas",
  administrativo: "Administrativo",
  outros: "Outros",
};

export const OS_MANUTENCAO_TIPO = {
  corrective: "Corretiva",
  preventive: "Preventiva",
};

export const ICONS_TIPO = {
  maintenance: "🔧",
  service: "🛠️",
};

export const ICONS_STATUS = {
  open: "🔵",
  in_progress: "🟡",
  waiting_parts: "⏳",
  completed: "🟢",
};

// ============================================================
// WORK ORDERS — CRUD
// ============================================================

/**
 * Cria uma nova Ordem de Serviço.
 * [CF-ready] Pode ser um Firestore trigger onWrite ou callable function.
 */
export async function criarOS(payload) {
  payload.timeline = [
    {
      acao: "O.S criada",
      usuario: payload.criadoPor || "Sistema",
      icone: "📋",
      timestamp: Date.now(),
    },
  ];
  payload.status = payload.status || "open";
  payload.scheduling = payload.scheduling || {
    plannedStart: null,
    plannedEnd: null,
    actualStart: null,
    actualEnd: null,
    durationHours: null,
  };
  payload.resources = payload.resources || {
    parts: [],
    laborHours: null,
    notes: "",
  };
  payload.createdAt = serverTimestamp();
  payload.updatedAt = serverTimestamp();
  payload.timestampEnvio = Date.now();

  const docRef = await addDoc(collection(db, "work_orders"), payload);
  return docRef.id;
}

/**
 * Retorna todas as O.S de um veículo de frota, ordenadas por data (mais recente primeiro).
 * Exclui canceladas. Filtra por origin=fleet ou entityType=vehicle.
 */
export async function getWorkOrdersByVehicle(vehicleId) {
  const q = query(
    collection(db, "work_orders"),
    where("originId", "==", vehicleId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((os) => (os.origin === "fleet" || os.origin === "inspection" || os.entityType === "vehicle") && os.status !== "cancelled")
    .sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0));
}

/**
 * Retorna todas as O.S de uma máquina, ordenadas por data (mais recente primeiro).
 * Exclui canceladas. Funciona com qualquer origin (machine, machinery, etc.).
 */
export async function getWorkOrdersByMachine(machineId) {
  const q = query(
    collection(db, "work_orders"),
    where("originId", "==", machineId)
  );
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return list
    .filter((os) => os.status !== "cancelled")
    .sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0));
}

/**
 * Retorna todas as O.S ordenadas por data (mais recente primeiro).
 */
export async function obterTodasOS() {
  const snap = await getDocs(collection(db, "work_orders"));
  const lista = [];
  snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista.sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0));
}

/**
 * Retorna O.S de um ativo específico (machine ou fleet).
 */
export async function obterOSPorOrigem(origin, originId) {
  const q = query(
    collection(db, "work_orders"),
    where("origin", "==", origin),
    where("originId", "==", originId)
  );
  const snap = await getDocs(q);
  const lista = [];
  snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista.sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0));
}

/**
 * Retorna uma O.S pelo ID.
 */
export async function obterOSPorId(id) {
  const docRef = doc(db, "work_orders", id);
  const snap = await getDoc(docRef);
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  throw new Error("O.S não encontrada.");
}

/**
 * Atualiza campos de uma O.S.
 */
export async function atualizarOS(id, dados) {
  dados.updatedAt = serverTimestamp();
  dados.timestampAtualizado = Date.now();
  await updateDoc(doc(db, "work_orders", id), dados);
}

/**
 * Adiciona entrada à timeline de uma O.S.
 * [CF-ready] Pode ser um Firestore trigger ou callable function.
 */
export async function adicionarLog(osId, acao, usuario, icone = "📝") {
  const osRef = doc(db, "work_orders", osId);
  const snap = await getDoc(osRef);
  if (!snap.exists()) return;

  const timeline = snap.data().timeline || [];
  timeline.push({ acao, usuario, icone, timestamp: Date.now() });

  await updateDoc(osRef, {
    timeline,
    updatedAt: serverTimestamp(),
    timestampAtualizado: Date.now(),
  });
}

// ============================================================
// DOCUMENTOS DE SERVIÇO — SRV-XXXX
// [CF-ready] Candidata a Cloud Function callable
// ============================================================

/**
 * Gera número único para documento de serviço (SRV-XXXX).
 */
async function proximoNumeroSRV() {
  const q = query(collection(db, "documents"), where("tipo", "==", "service_report"));
  const snap = await getDocs(q);
  return `SRV-${String(snap.size + 1).padStart(4, "0")}`;
}

/**
 * Gera documento técnico de serviço a partir de uma O.S.
 * Atualiza a O.S com referência ao documento gerado.
 *
 * [CF-ready] Esta função é candidata a Cloud Function callable:
 *   exports.gerarDocumentoServico = functions.https.onCall(async (data, context) => { ... })
 */
export async function gerarDocumentoServico(osId, osData, emissor) {
  const numero = await proximoNumeroSRV();

  const payload = {
    tipo: "service_report",
    numero,
    sourceId: osId,
    sourceData: { ...osData },
    emissor,
    emitidoEm: serverTimestamp(),
    timestampEnvio: Date.now(),
  };

  const docRef = await addDoc(collection(db, "documents"), payload);

  // Atualiza O.S com referência ao documento
  await updateDoc(doc(db, "work_orders", osId), {
    documentoId: docRef.id,
    documentoNumero: numero,
    updatedAt: serverTimestamp(),
    timestampAtualizado: Date.now(),
  });

  // Log na timeline
  await adicionarLog(osId, `Documento ${numero} gerado`, emissor, "📄");

  return { id: docRef.id, numero };
}

// ============================================================
// CRIAÇÃO AUTOMÁTICA DE PEDIDO DE COMPRA A PARTIR DE O.S
// [CF-ready] Candidata a Cloud Function callable
// ============================================================

/**
 * Cria automaticamente um pedido de compra a partir dos materiais de uma O.S de serviço.
 *
 * [CF-ready] Esta função é candidata a Cloud Function trigger:
 *   exports.onOSUpdated = functions.firestore.document('work_orders/{id}').onUpdate(...)
 */
export async function criarPedidoFromOS(osId, osData, emissor) {
  const materiais = osData.materials || [];
  const items = materiais.map((m) => ({
    descricao: m.description,
    quantidade: m.quantity,
    precoUnitario: m.unitPrice || 0,
    precoTotal: m.totalPrice || 0,
  }));

  const totalEstimado = items.reduce((s, i) => s + (i.precoTotal || 0), 0);

  const payload = {
    categoria: "servico",
    items,
    totalEstimado,
    solicitante: emissor,
    setor: osData.sector || "",
    justificativa: `Gerado automaticamente a partir da O.S: ${osData.title || osId}`,
    fornecedor: "",
    urgency: "normal",
    status: "pending",
    osId,
    criadoPor: emissor,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    timestampEnvio: Date.now(),
  };

  const docRef = await addDoc(collection(db, "purchase_orders"), payload);

  // Vincula PO à O.S
  await updateDoc(doc(db, "work_orders", osId), {
    pedidoCompraId: docRef.id,
    updatedAt: serverTimestamp(),
  });

  await adicionarLog(osId, `Pedido de Compra criado (${items.length} item(s))`, emissor, "🛒");

  return docRef.id;
}

// ============================================================
// SCHEDULING HELPERS
// ============================================================

/**
 * Marca o início real da execução — sets scheduling.actualStart.
 * Chamado automaticamente quando status muda para in_progress via mode=execute.
 */
export async function registrarInicioReal(osId) {
  await updateDoc(doc(db, "work_orders", osId), {
    "scheduling.actualStart": Date.now(),
    updatedAt: serverTimestamp(),
    timestampAtualizado: Date.now(),
  });
}

/**
 * Marca o fim real da execução — sets scheduling.actualEnd, durationHours, completedAt.
 * Chamado pelo fluxo de conclusão controlada (confirmarConclusao).
 */
export async function registrarFimReal(osId) {
  const snap = await getDoc(doc(db, "work_orders", osId));
  const data = snap.data() || {};
  const actualStart = data?.scheduling?.actualStart || Date.now();
  const actualEnd   = Date.now();
  const durationHours = Math.round((actualEnd - actualStart) / 3_600_000 * 100) / 100;

  await updateDoc(doc(db, "work_orders", osId), {
    "scheduling.actualEnd":    actualEnd,
    "scheduling.durationHours": durationHours,
    completedAt: actualEnd,
    updatedAt: serverTimestamp(),
    timestampAtualizado: Date.now(),
  });

  return { actualEnd, durationHours };
}

// ============================================================
// UTILITÁRIOS DE DATA
// ============================================================
export function formatarData(ts) {
  if (!ts) return "—";
  const ms = ts.seconds ? ts.seconds * 1000 : ts;
  return new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function formatarDataCurta(ts) {
  if (!ts) return "—";
  const ms = ts.seconds ? ts.seconds * 1000 : ts;
  return new Date(ms).toLocaleDateString("pt-BR");
}

export function formatarMoeda(valor) {
  if (valor == null || isNaN(valor)) return "R$ 0,00";
  return `R$ ${Number(valor).toFixed(2).replace(".", ",")}`;
}

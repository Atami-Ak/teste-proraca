/**
 * db-unified.js — Sistema Unificado de Work Orders (SIGA v3)
 *
 * Coleção central: work_orders
 * Tipos: maintenance | service | inspection | cleaning_issue
 * Origens: machine | fleet | cleaning | manual
 *
 * Incorpora e substitui progressivamente historico_manutencao.
 * Use db-bridge.js para leitura unificada durante a migração.
 *
 * [CF-ready] Funções marcadas são candidatas a Cloud Functions.
 */
import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  limit,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================================
// CONSTANTES E LABELS
// ============================================================

export const WO_TIPOS = {
  maintenance:    "Manutenção",
  service:        "Serviço",
  inspection:     "Inspeção",
  cleaning_issue: "Problema de Limpeza",
};

export const WO_STATUS = {
  open:          "Aberta",
  in_progress:   "Em Andamento",
  waiting_parts: "Aguardando Peças",
  completed:     "Concluída",
  cancelled:     "Cancelada",
};

export const WO_PRIORIDADE = {
  low:      "Baixa",
  medium:   "Média",
  high:     "Alta",
  critical: "Crítica",
};

export const WO_ORIGEM = {
  machine:  "Maquinário",
  fleet:    "Frota",
  cleaning: "Limpeza",
  manual:   "Manual",
};

export const WO_MANUTENCAO_TIPO = {
  corrective:  "Corretiva",
  preventive:  "Preventiva",
  predictive:  "Preditiva / Inspeção",
};

export const WO_SERVICE_CAT = {
  maquina:       "Manutenção de Máquina",
  instalacao:    "Instalação de Equipamento",
  ti:            "TI / Sistemas",
  administrativo:"Administrativo",
  outros:        "Outros",
};

export const WO_ICONS = {
  maintenance:    "🔧",
  service:        "🛠️",
  inspection:     "👁️",
  cleaning_issue: "🧹",
};

// ============================================================
// GERAÇÃO DE NÚMERO DE DOCUMENTO (sem contador sequencial)
// Usa timestamp + random para evitar condição de corrida.
// [CF-ready] Migrar para callable function para maior controle.
// ============================================================

export function gerarNumeroDocumento(tipo = "service_report") {
  const prefixo = tipo === "purchase_document" ? "PO" : "SRV";
  const data = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const aleatorio = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefixo}-${data}-${aleatorio}`;
}

function gerarNumeroWO(tipo) {
  const prefixos = {
    maintenance:    "WO-MNT",
    service:        "WO-SRV",
    inspection:     "WO-INS",
    cleaning_issue: "WO-CLN",
  };
  const pref = prefixos[tipo] || "WO";
  const aleatorio = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${pref}-${aleatorio}`;
}

// ============================================================
// WORK ORDERS — CRUD PRINCIPAL
// ============================================================

/**
 * Cria uma nova Work Order (qualquer tipo).
 *
 * Payload completo esperado:
 * {
 *   type, origin, originId, originNome, sector, title, description,
 *   requester, assignedTo, priority, status,
 *   slaDeadline,             // ISO string ou null
 *   downtime,                // horas (número)
 *   laborCost, materialsCost, totalCost,
 *   materials[],             // [{ description, quantity, unitPrice, totalPrice }]
 *   maintenanceType,         // para type=maintenance
 *   serviceCategory,         // para type=service
 *   cleaningZone, cleaningScore, // para type=cleaning_issue
 *   observations,
 *   criadoPor,
 * }
 *
 * [CF-ready] exports.onWorkOrderCreated = functions.firestore
 *   .document('work_orders/{id}').onCreate(...)
 */
export async function criarWorkOrder(payload) {
  const numero = gerarNumeroWO(payload.type);

  // Calcula totalCost se não fornecido
  if (!payload.totalCost) {
    const mat = (payload.materialsCost || 0);
    const lab = (payload.laborCost || 0);
    payload.totalCost = mat + lab;
  }

  const docCompleto = {
    ...payload,
    numero,
    status:         payload.status || "open",
    priority:       payload.priority || "medium",
    downtime:       payload.downtime || 0,
    laborCost:      payload.laborCost || 0,
    materialsCost:  payload.materialsCost || 0,
    totalCost:      payload.totalCost || 0,
    materials:      payload.materials || [],
    timeline: [
      {
        acao:      "Work Order criada",
        usuario:   payload.criadoPor || "Sistema",
        icone:     WO_ICONS[payload.type] || "📋",
        timestamp: Date.now(),
      },
    ],
    documentoId:     null,
    documentoNumero: null,
    pedidoCompraId:  null,
    legacyId:        payload.legacyId || null,
    startedAt:       payload.startedAt || null,
    completedAt:     payload.completedAt || null,
    slaDeadline:     payload.slaDeadline || null,
    createdAt:       serverTimestamp(),
    updatedAt:       serverTimestamp(),
    timestampEnvio:  Date.now(),
  };

  const ref = await addDoc(collection(db, "work_orders"), docCompleto);
  return ref.id;
}

/**
 * Retorna todas as WOs com filtros opcionais.
 * filtros: { tipo, status, origin, originId, sector }
 */
export async function obterTodasWorkOrders(filtros = {}) {
  let q = collection(db, "work_orders");
  const constraints = [];

  if (filtros.tipo)     constraints.push(where("type", "==", filtros.tipo));
  if (filtros.status)   constraints.push(where("status", "==", filtros.status));
  if (filtros.origin)   constraints.push(where("origin", "==", filtros.origin));
  if (filtros.originId) constraints.push(where("originId", "==", filtros.originId));
  if (filtros.sector)   constraints.push(where("sector", "==", filtros.sector));

  const snap = await getDocs(constraints.length > 0 ? query(q, ...constraints) : q);
  const lista = [];
  snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista.sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0));
}

/** Retorna uma WO pelo ID. */
export async function obterWorkOrderPorId(id) {
  const snap = await getDoc(doc(db, "work_orders", id));
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  throw new Error(`Work Order ${id} não encontrada.`);
}

/** Retorna todas as WOs de um ativo específico (máquina, veículo, zona). */
export async function obterWorkOrdersPorOrigem(origin, originId) {
  const q = query(
    collection(db, "work_orders"),
    where("origin",   "==", origin),
    where("originId", "==", originId)
  );
  const snap = await getDocs(q);
  const lista = [];
  snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  return lista.sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0));
}

/** Atualiza campos de uma WO. */
export async function atualizarWorkOrder(id, dados) {
  dados.updatedAt         = serverTimestamp();
  dados.timestampAtualizado = Date.now();
  await updateDoc(doc(db, "work_orders", id), dados);
}

/**
 * Adiciona uma entrada na timeline de uma WO.
 * [CF-ready] Pode ser um Firestore trigger onUpdate.
 */
export async function adicionarLogWO(woId, acao, usuario, icone = "📝") {
  const snap = await getDoc(doc(db, "work_orders", woId));
  if (!snap.exists()) return;

  const timeline = snap.data().timeline || [];
  timeline.push({ acao, usuario, icone, timestamp: Date.now() });

  await updateDoc(doc(db, "work_orders", woId), {
    timeline,
    updatedAt:         serverTimestamp(),
    timestampAtualizado: Date.now(),
  });
}

/**
 * Fecha / conclui uma Work Order.
 * Calcula tempo de execução automaticamente.
 */
export async function fecharWorkOrder(woId, dados, usuario) {
  const now = Date.now();
  const snap = await getDoc(doc(db, "work_orders", woId));
  if (!snap.exists()) throw new Error("WO não encontrada.");

  const wo       = snap.data();
  const iniciada = wo.startedAt ? new Date(wo.startedAt).getTime() : wo.timestampEnvio;
  const durHoras = ((now - iniciada) / 3_600_000).toFixed(2);

  const update = {
    ...dados,
    status:      "completed",
    completedAt: new Date().toISOString(),
    updatedAt:   serverTimestamp(),
    timestampAtualizado: now,
  };

  // Recalcula custo total se materiais foram atualizados
  if (dados.materials) {
    const matCost = dados.materials.reduce((s, m) => s + (m.totalPrice || 0), 0);
    update.materialsCost = matCost;
    update.totalCost = matCost + (dados.laborCost || wo.laborCost || 0);
  }

  // Adiciona à timeline
  const timeline = wo.timeline || [];
  timeline.push({
    acao:      `WO concluída — Duração: ${durHoras}h`,
    usuario,
    icone:     "✅",
    timestamp: now,
  });
  update.timeline = timeline;

  await updateDoc(doc(db, "work_orders", woId), update);
}

// ============================================================
// GERAÇÃO DE DOCUMENTO SRV A PARTIR DE UMA WO
// [CF-ready] Candidata a Cloud Function callable
// ============================================================

/**
 * Gera documento de serviço (SRV) a partir de uma Work Order.
 * Usa número baseado em timestamp — sem condição de corrida.
 */
export async function gerarDocumentoWO(woId, woData, emissor) {
  const numero = gerarNumeroDocumento("service_report");

  const docPayload = {
    tipo:        "service_report",
    numero,
    sourceId:    woId,
    sourceData:  { ...woData },
    emissor,
    emitidoEm:   serverTimestamp(),
    timestampEnvio: Date.now(),
  };

  const docRef = await addDoc(collection(db, "documents"), docPayload);

  await updateDoc(doc(db, "work_orders", woId), {
    documentoId:     docRef.id,
    documentoNumero: numero,
    updatedAt:       serverTimestamp(),
    timestampAtualizado: Date.now(),
  });

  await adicionarLogWO(woId, `Documento ${numero} gerado`, emissor, "📄");

  return { id: docRef.id, numero };
}

// ============================================================
// AUTOMAÇÕES — CRIAÇÃO AUTOMÁTICA DE WORK ORDERS
// [CF-ready] Candidatas a Firestore triggers ou callable functions
// ============================================================

/**
 * Auto-cria uma WO do tipo cleaning_issue quando uma auditoria
 * tem nota < 5.
 *
 * Chamar após salvarAuditoriaLimpeza() no app-formulario-limpeza.js:
 *   if (nota < 5) await autoWorkOrderLimpeza(payload, nota, usuario);
 *
 * [CF-ready] exports.onAuditoriaCreated = functions.firestore
 *   .document('auditorias_limpeza/{id}').onCreate(async (snap) => {
 *     const data = snap.data();
 *     if (data.notaLimpeza < 5) await criarWorkOrder({...});
 *   });
 */
export async function autoWorkOrderLimpeza(auditoriaData, nota, criadoPor) {
  const zonaId   = auditoriaData.zonaId || "ZONA-?";
  const zonaNome = auditoriaData.zonaNome || zonaId;

  const payload = {
    type:        "cleaning_issue",
    origin:      "cleaning",
    originId:    zonaId,
    originNome:  zonaNome,
    sector:      zonaNome,
    title:       `Problema de Limpeza — ${zonaNome} (Nota: ${nota})`,
    description: `Auditoria 5S identificou nota crítica de ${nota}/10 na zona ${zonaNome}. Intervenção necessária.`,
    requester:   criadoPor,
    assignedTo:  "",
    priority:    nota < 3 ? "critical" : "high",
    status:      "open",
    cleaningZone:  zonaId,
    cleaningScore: nota,
    criadoPor,
    slaDeadline: new Date(Date.now() + 24 * 3_600_000).toISOString(), // 24h SLA
  };

  const id = await criarWorkOrder(payload);
  return id;
}

/**
 * Auto-cria uma WO do tipo service quando checklist de frota
 * tem itens não conformes.
 *
 * Chamar após salvarChecklistFrota() no app-frota.js:
 *   if (itensNC.length > 0) await autoWorkOrderFrota(payload, itensNC, usuario);
 *
 * [CF-ready] exports.onChecklistCreated = functions.firestore
 *   .document('checklists_frota/{id}').onCreate(...)
 */
export async function autoWorkOrderFrota(checklistData, itensNC, criadoPor) {
  const veiculoId   = checklistData.idVeiculo  || "VEIC-?";
  const veiculoPlaca = checklistData.placa     || veiculoId;

  const payload = {
    type:        "service",
    origin:      "fleet",
    originId:    veiculoId,
    originNome:  veiculoPlaca,
    sector:      "Transporte",
    title:       `Avaria reportada — ${veiculoPlaca}`,
    description: `Checklist de ${checklistData.natureza || "inspeção"} identificou ${itensNC.length} item(s) não conforme(s):\n- ${itensNC.join("\n- ")}\n\nMotorista: ${checklistData.motorista || "—"}\nDescrição: ${checklistData.detalhesAvaria || "—"}`,
    requester:   criadoPor,
    assignedTo:  "",
    priority:    itensNC.length >= 3 ? "high" : "medium",
    status:      "open",
    serviceCategory: "maquina",
    criadoPor,
  };

  const id = await criarWorkOrder(payload);
  return id;
}

/**
 * Auto-cria uma WO do tipo maintenance quando status de máquina
 * é "Revisão" (restrição).
 *
 * Chamar após salvarManutencaoFirebase() com status=Revisão:
 *   if (statusFinal === "Revisão") await autoWorkOrderMaquina(maquinaData, usuario);
 *
 * [CF-ready] exports.onHistoricoCreated = functions.firestore
 *   .document('historico_manutencao/{id}').onCreate(...)
 */
export async function autoWorkOrderMaquina(maquinaData, legacyId, criadoPor) {
  const maqId   = maquinaData.dadosEquipamento?.id   || "MIS-?";
  const maqNome = maquinaData.dadosEquipamento?.nome  || maqId;
  const relatorio = maquinaData.diagnostico?.relatorio || "Sem descrição";
  const urgencia  = maquinaData.analiseFalha?.urgencia || "Média";

  const prioridadeMap = { "Alta": "high", "Média": "medium", "Baixa": "low" };

  const payload = {
    type:        "maintenance",
    origin:      "machine",
    originId:    maqId,
    originNome:  maqNome,
    sector:      maquinaData.dadosEquipamento?.setor || "Produção",
    title:       `Manutenção solicitada — ${maqNome}`,
    description: relatorio,
    requester:   maquinaData.dadosOperador?.nome || criadoPor,
    assignedTo:  "",
    priority:    prioridadeMap[urgencia] || "medium",
    status:      "open",
    maintenanceType: "corrective",
    downtime:    0,
    slaDeadline: maquinaData.analiseFalha?.dataLimite || null,
    criadoPor,
    legacyId,
  };

  const id = await criarWorkOrder(payload);
  return id;
}

// ============================================================
// KPIs — INDICADORES DE DESEMPENHO
// ============================================================

/**
 * Calcula MTBF, MTTR, disponibilidade e downtime total de uma máquina.
 * Lê de work_orders (novo sistema).
 *
 * MTBF = tempo total / (nº falhas - 1)   [em horas]
 * MTTR = média de duração das manutenções [em horas]
 * Disponibilidade = (tempo total - downtime) / tempo total × 100%
 */
export async function calcularKPIsMaquina(maquinaId) {
  const wos = await obterWorkOrdersPorOrigem("machine", maquinaId);

  const concluidas = wos.filter(
    (w) => w.status === "completed" && w.type === "maintenance"
  );

  // --- MTTR ---
  let somaTempoReparos = 0;
  let contReparos = 0;
  concluidas.forEach((w) => {
    if (w.startedAt && w.completedAt) {
      const inicio = new Date(w.startedAt).getTime();
      const fim    = new Date(w.completedAt).getTime();
      somaTempoReparos += (fim - inicio) / 3_600_000;
      contReparos++;
    }
  });
  const mttr = contReparos > 0 ? somaTempoReparos / contReparos : null;

  // --- MTBF ---
  // Ordena por data de criação, calcula intervalos entre falhas
  const ordenadas = [...concluidas].sort(
    (a, b) => (a.timestampEnvio || 0) - (b.timestampEnvio || 0)
  );
  let somaIntervalos = 0;
  let contIntervalos = 0;
  for (let i = 1; i < ordenadas.length; i++) {
    const diff =
      (ordenadas[i].timestampEnvio - ordenadas[i - 1].timestampEnvio) / 3_600_000;
    somaIntervalos += diff;
    contIntervalos++;
  }
  const mtbf = contIntervalos > 0 ? somaIntervalos / contIntervalos : null;

  // --- Downtime Total ---
  const downtimeTotal = wos.reduce((s, w) => s + (w.downtime || 0), 0);

  // --- Custo Total ---
  const custoTotal = wos.reduce((s, w) => s + (w.totalCost || 0), 0);

  // --- Disponibilidade ---
  // Considera janela de 30 dias (720 horas)
  const janelaHoras = 720;
  const disponibilidade = janelaHoras > 0
    ? Math.max(0, ((janelaHoras - downtimeTotal) / janelaHoras) * 100).toFixed(1)
    : null;

  return {
    maquinaId,
    totalWOs:      wos.length,
    abertas:       wos.filter((w) => w.status === "open" || w.status === "in_progress").length,
    concluidas:    concluidas.length,
    mtbf:          mtbf ? mtbf.toFixed(1) : "—",     // horas
    mttr:          mttr ? mttr.toFixed(1) : "—",     // horas
    downtimeTotal: downtimeTotal.toFixed(1),           // horas
    custoTotal:    custoTotal.toFixed(2),              // R$
    disponibilidade: disponibilidade ? `${disponibilidade}%` : "—",
  };
}

/**
 * Retorna ranking de máquinas por número de falhas (WOs corretivas).
 * Útil para o dashboard gerencial.
 */
export async function rankingFalhasMaquinas() {
  const snap = await getDocs(
    query(
      collection(db, "work_orders"),
      where("origin", "==", "machine"),
      where("type",   "==", "maintenance")
    )
  );

  const contagem = {};
  snap.forEach((d) => {
    const data = d.data();
    const id   = data.originId || "?";
    const nome = data.originNome || id;
    if (!contagem[id]) contagem[id] = { id, nome, falhas: 0, downtime: 0, custo: 0 };
    contagem[id].falhas++;
    contagem[id].downtime += data.downtime || 0;
    contagem[id].custo    += data.totalCost || 0;
  });

  return Object.values(contagem)
    .sort((a, b) => b.falhas - a.falhas)
    .slice(0, 10);
}

/**
 * Retorna desempenho por setor: WOs abertas, custo, score de limpeza médio.
 */
export async function desempenhoSetores() {
  const [wosSnap, limpezaSnap] = await Promise.all([
    getDocs(collection(db, "work_orders")),
    getDocs(collection(db, "auditorias_limpeza")),
  ]);

  const setores = {};

  wosSnap.forEach((d) => {
    const data   = d.data();
    const setor  = data.sector || "Outros";
    if (!setores[setor]) setores[setor] = { setor, wosAbertas: 0, wosConcluidas: 0, custo: 0, notaLimpeza: [], notaMedia: null };
    if (["open", "in_progress", "waiting_parts"].includes(data.status)) setores[setor].wosAbertas++;
    if (data.status === "completed") setores[setor].wosConcluidas++;
    setores[setor].custo += data.totalCost || 0;
  });

  limpezaSnap.forEach((d) => {
    const data = d.data();
    // Mapeia zona → setor (aproximação)
    const setor = data.sector || data.zonaId || "Outros";
    if (!setores[setor]) setores[setor] = { setor, wosAbertas: 0, wosConcluidas: 0, custo: 0, notaLimpeza: [], notaMedia: null };
    if (data.notaLimpeza != null) setores[setor].notaLimpeza.push(data.notaLimpeza);
  });

  return Object.values(setores).map((s) => ({
    ...s,
    notaMedia: s.notaLimpeza.length > 0
      ? (s.notaLimpeza.reduce((a, b) => a + b, 0) / s.notaLimpeza.length).toFixed(1)
      : null,
    notaLimpeza: undefined, // remove array bruto
  }));
}

/**
 * Verifica se uma máquina precisa de manutenção preventiva.
 * Baseado em intervalo de horas ou número de dias desde a última inspeção.
 *
 * intervaloPrev: horas de operação entre preventivas (padrão: 500h)
 * intervaloDias: dias máximos sem preventiva (padrão: 30 dias)
 *
 * Retorna { necessaria: bool, motivo: string, ultimaWO: object|null }
 */
export async function verificarManutencaoPreventiva(
  maquinaId,
  { intervaloPrev = 500, intervaloDias = 30 } = {}
) {
  const q = query(
    collection(db, "work_orders"),
    where("originId", "==", maquinaId),
    where("type",     "==", "maintenance"),
    where("maintenanceType", "==", "preventive"),
    where("status",   "==", "completed")
  );

  const snap = await getDocs(q);
  const lista = [];
  snap.forEach((d) => lista.push({ id: d.id, ...d.data() }));
  lista.sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0));

  const ultima = lista[0] || null;
  if (!ultima) {
    return { necessaria: true, motivo: "Sem registro de preventiva anterior.", ultimaWO: null };
  }

  const diasDesdeUltima = (Date.now() - (ultima.timestampEnvio || 0)) / 86_400_000;
  if (diasDesdeUltima >= intervaloDias) {
    return {
      necessaria: true,
      motivo:     `Última preventiva há ${diasDesdeUltima.toFixed(0)} dias (limite: ${intervaloDias} dias).`,
      ultimaWO:   ultima,
    };
  }

  return { necessaria: false, motivo: "Preventiva em dia.", ultimaWO: ultima };
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

export function formatarDuracao(horas) {
  if (horas == null || isNaN(horas)) return "—";
  const h = Math.floor(horas);
  const m = Math.round((horas - h) * 60);
  return `${h}h${m > 0 ? ` ${m}min` : ""}`;
}

export function calcularSLA(slaDeadline) {
  if (!slaDeadline) return { status: "sem_sla", label: "Sem SLA", horas: null };
  const diff = new Date(slaDeadline).getTime() - Date.now();
  const horas = diff / 3_600_000;
  if (horas < 0)   return { status: "vencido",    label: `Vencido há ${Math.abs(horas).toFixed(0)}h`, horas };
  if (horas < 4)   return { status: "critico",    label: `${horas.toFixed(0)}h restantes`,             horas };
  if (horas < 24)  return { status: "atencao",    label: `${horas.toFixed(0)}h restantes`,             horas };
  return              { status: "ok",         label: `${(horas / 24).toFixed(0)}d restantes`,      horas };
}

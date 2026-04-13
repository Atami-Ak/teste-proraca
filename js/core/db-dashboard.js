/**
 * db-dashboard.js — Management Dashboard KPI Aggregations
 *
 * All heavy queries are designed to be moved to Cloud Functions (scheduled
 * triggers) in Phase 2. Functions are marked [CF-ready].
 *
 * KPIs computed here:
 *   - Open WOs (by type, by sector)
 *   - Avg resolution time (MTTR)
 *   - MTBF per machine
 *   - Machine availability
 *   - Cost totals (month, quarter, year)
 *   - Purchase order status summary
 *   - Cleaning score averages by zone
 *   - Fleet NC rate
 *   - Preventive compliance rate
 *   - Top 5 failure machines
 *   - Recent activity feed
 */

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "./firebase-config.js";

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function _toMs(val) {
  if (!val) return 0;
  if (typeof val === "number") return val;
  if (val instanceof Timestamp) return val.toMillis();
  if (val?.toMillis) return val.toMillis();
  return new Date(val).getTime() || 0;
}

function _startOfMonth(offsetMonths = 0) {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() + offsetMonths);
  return d.getTime();
}

function _horasDiff(start, end) {
  if (!start || !end) return 0;
  return Math.max(0, (_toMs(end) - _toMs(start)) / 3600000);
}

// ---------------------------------------------------------------------------
// MAIN KPI BUNDLE
// ---------------------------------------------------------------------------

/**
 * Fetches all KPIs in parallel and returns a single dashboard object.
 * Cache this result on the calling page (e.g., 5-minute TTL) to avoid
 * hammering Firestore on every render.
 *
 * [CF-ready]: Convert to `exports.dashboardKPIs` scheduled function
 * (every 30 min) that writes results to a `kpi_cache` document.
 *
 * @returns {Promise<DashboardData>}
 */
export async function carregarDashboard() {
  const [woData, poData, limpezaData, frotaData] = await Promise.all([
    _fetchWorkOrders(),
    _fetchPurchaseOrders(),
    _fetchAuditoriasLimpeza(),
    _fetchChecklistsFrota(),
  ]);

  return {
    workOrders: _kpiWorkOrders(woData),
    compras: _kpiCompras(poData),
    limpeza: _kpiLimpeza(limpezaData),
    frota: _kpiFrota(frotaData),
    custos: _kpiCustos(woData, poData),
    atividadeRecente: _atividadeRecente(woData, poData),
    // Raw arrays — used by panel modules to avoid double Firestore reads
    rawWorkOrders: woData,
    rawPurchaseOrders: poData,
    rawChecklists: frotaData,
    rawAuditorias: limpezaData,
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// WORK ORDERS KPIs
// ---------------------------------------------------------------------------

function _kpiWorkOrders(wos) {
  const total = wos.length;
  const abertas = wos.filter((w) => ["open", "in_progress", "pending"].includes(w.status));
  const emAndamento = wos.filter((w) => w.status === "in_progress");
  const concluidas = wos.filter((w) => w.status === "completed");
  const criticas = wos.filter((w) => w.prioridade === "critica" && w.status !== "completed");

  // By type
  const porTipo = _contar(wos, "tipo");

  // MTTR — mean time to repair (hours), only for completed corrective
  const corretivas = concluidas.filter((w) => w.tipo === "maintenance" && w.tipoManutencao === "Corretiva");
  const mttr = _avg(
    corretivas.map((w) => _horasDiff(w.dataInicioOS, w.dataFimOS)).filter((h) => h > 0)
  );

  // MTBF per machine (simplified: avg days between failures for each machine)
  const mtbfMap = _calcularMTBF(corretivas);

  // Downtime this month
  const inicioMes = _startOfMonth();
  const downtimeMes = wos
    .filter((w) => _toMs(w.timestampEnvio) >= inicioMes)
    .reduce((acc, w) => acc + (Number(w.tempoParada) || 0), 0);

  // Machine availability (720h month assumption)
  const disponibilidade = Math.max(0, ((720 - downtimeMes) / 720) * 100);

  // Top failure machines (by # completed corrective WOs)
  const falhasPorMaquina = {};
  corretivas.forEach((w) => {
    if (w.maquinaId) falhasPorMaquina[w.maquinaId] = (falhasPorMaquina[w.maquinaId] || 0) + 1;
  });
  const topFalhas = Object.entries(falhasPorMaquina)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([maquinaId, falhas]) => {
      const wo = corretivas.find((w) => w.maquinaId === maquinaId);
      return { maquinaId, maquinaNome: wo?.maquinaNome || maquinaId, falhas };
    });

  // SLA compliance (WOs completed within deadline)
  const comDeadline = concluidas.filter((w) => w.slaDeadline);
  const noprazo = comDeadline.filter(
    (w) => _toMs(w.dataFimOS || w.updatedAt) <= _toMs(w.slaDeadline)
  );
  const slaRate = comDeadline.length > 0
    ? Math.round((noprazo.length / comDeadline.length) * 100)
    : null;

  return {
    total,
    abertas: abertas.length,
    emAndamento: emAndamento.length,
    concluidas: concluidas.length,
    criticas: criticas.length,
    porTipo,
    mttr: Math.round(mttr * 10) / 10,
    mtbfMap,
    downtimeMes: Math.round(downtimeMes * 10) / 10,
    disponibilidade: Math.round(disponibilidade * 10) / 10,
    topFalhas,
    slaRate,
  };
}

function _calcularMTBF(corretivas) {
  // Group by machine, sort by time, compute avg gap between failures
  const byMachine = {};
  corretivas.forEach((w) => {
    if (!w.maquinaId) return;
    if (!byMachine[w.maquinaId]) byMachine[w.maquinaId] = [];
    byMachine[w.maquinaId].push(_toMs(w.dataFimOS || w.timestampEnvio));
  });

  const result = {};
  Object.entries(byMachine).forEach(([id, times]) => {
    if (times.length < 2) { result[id] = null; return; }
    times.sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < times.length; i++) {
      gaps.push((times[i] - times[i - 1]) / 3600000); // hours
    }
    result[id] = Math.round(_avg(gaps));
  });
  return result;
}

// ---------------------------------------------------------------------------
// PURCHASE ORDERS KPIs
// ---------------------------------------------------------------------------

function _kpiCompras(pos) {
  const total = pos.length;
  const pendentes = pos.filter((p) => p.status === "pending").length;
  const aprovados = pos.filter((p) => p.status === "approved").length;
  const emPedido = pos.filter((p) => p.status === "ordered").length;
  const recebidos = pos.filter((p) => p.status === "received").length;
  const cancelados = pos.filter((p) => p.status === "cancelled").length;

  const totalEstimado = pos.reduce((a, p) => a + (Number(p.totalEstimado) || 0), 0);
  const totalRecebido = pos
    .filter((p) => p.status === "received")
    .reduce((a, p) => a + (Number(p.totalEstimado) || 0), 0);

  // Urgency breakdown
  const urgentes = pos.filter((p) => p.urgencia === "critica" && p.status !== "received").length;

  // By category
  const porCategoria = _contar(pos, "categoria");

  // Avg approval time (hours) — for approved POs
  const aprovadosCom = pos.filter((p) => p.status !== "pending" && p.criadoEm && p.aprovadoEm);
  const avgAprovacao = _avg(aprovadosCom.map((p) => _horasDiff(p.criadoEm, p.aprovadoEm)));

  return {
    total,
    pendentes,
    aprovados,
    emPedido,
    recebidos,
    cancelados,
    urgentes,
    porCategoria,
    totalEstimado,
    totalRecebido,
    avgAprovacaoHoras: Math.round(avgAprovacao * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// LIMPEZA KPIs
// ---------------------------------------------------------------------------

function _kpiLimpeza(auditorias) {
  if (auditorias.length === 0) {
    return { totalAuditorias: 0, mediaGeral: null, zonasCriticas: [] };
  }

  const mediaGeral = _avg(auditorias.map((a) => a.notaLimpeza));

  // Per-zone averages
  const byZona = {};
  auditorias.forEach((a) => {
    if (!byZona[a.zonaId]) byZona[a.zonaId] = [];
    byZona[a.zonaId].push(a.notaLimpeza);
  });

  const mediasPorZona = Object.entries(byZona).map(([zonaId, notas]) => ({
    zonaId,
    media: Math.round(_avg(notas) * 10) / 10,
    total: notas.length,
  }));

  const zonasCriticas = mediasPorZona
    .filter((z) => z.media < 5)
    .sort((a, b) => a.media - b.media);

  // Trend: this month vs last month
  const inicioMesAtual = _startOfMonth();
  const inicioMesAnterior = _startOfMonth(-1);
  const mesAtual = auditorias.filter((a) => _toMs(a.timestampEnvio) >= inicioMesAtual);
  const mesAnterior = auditorias.filter(
    (a) =>
      _toMs(a.timestampEnvio) >= inicioMesAnterior &&
      _toMs(a.timestampEnvio) < inicioMesAtual
  );

  const tendencia =
    mesAtual.length > 0 && mesAnterior.length > 0
      ? _avg(mesAtual.map((a) => a.notaLimpeza)) - _avg(mesAnterior.map((a) => a.notaLimpeza))
      : null;

  return {
    totalAuditorias: auditorias.length,
    mediaGeral: Math.round(mediaGeral * 10) / 10,
    mediasPorZona,
    zonasCriticas,
    tendencia: tendencia !== null ? Math.round(tendencia * 10) / 10 : null,
  };
}

// ---------------------------------------------------------------------------
// FROTA KPIs
// ---------------------------------------------------------------------------

function _kpiFrota(checklists) {
  if (checklists.length === 0) {
    return { totalChecklists: 0, taxaNaoConformidade: 0, veiculosCriticos: [] };
  }

  // NC items across all recent checklists
  let totalItens = 0;
  let totalNC = 0;
  const ncPorVeiculo = {};

  checklists.forEach((c) => {
    const itens = c.itens || [];
    itens.forEach((it) => {
      totalItens++;
      if (it.status === "NC" || it.conforme === false) {
        totalNC++;
        if (c.veiculoId) {
          ncPorVeiculo[c.veiculoId] = (ncPorVeiculo[c.veiculoId] || 0) + 1;
        }
      }
    });
  });

  const taxaNC = totalItens > 0 ? Math.round((totalNC / totalItens) * 1000) / 10 : 0;

  const veiculosCriticos = Object.entries(ncPorVeiculo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([veiculoId, nc]) => {
      const c = checklists.find((ch) => ch.veiculoId === veiculoId);
      return { veiculoId, veiculoNome: c?.veiculoNome || veiculoId, nc };
    });

  return {
    totalChecklists: checklists.length,
    taxaNaoConformidade: taxaNC,
    totalItensNC: totalNC,
    veiculosCriticos,
  };
}

// ---------------------------------------------------------------------------
// COST KPIs
// ---------------------------------------------------------------------------

function _kpiCustos(wos, pos) {
  const inicioMes = _startOfMonth();
  const inicioTrimestre = _startOfMonth(-2);

  const woCustoMes = wos
    .filter((w) => _toMs(w.timestampEnvio) >= inicioMes)
    .reduce((a, w) => a + (Number(w.custoTotal) || 0), 0);

  const woCustoTrimestre = wos
    .filter((w) => _toMs(w.timestampEnvio) >= inicioTrimestre)
    .reduce((a, w) => a + (Number(w.custoTotal) || 0), 0);

  const poCustoMes = pos
    .filter(
      (p) =>
        p.status === "received" &&
        _toMs(p.timestampEnvio) >= inicioMes
    )
    .reduce((a, p) => a + (Number(p.totalEstimado) || 0), 0);

  const poCustoTrimestre = pos
    .filter(
      (p) =>
        p.status === "received" &&
        _toMs(p.timestampEnvio) >= inicioTrimestre
    )
    .reduce((a, p) => a + (Number(p.totalEstimado) || 0), 0);

  // Cost by machine (WOs this month)
  const custoPorMaquina = {};
  wos
    .filter((w) => _toMs(w.timestampEnvio) >= inicioMes && w.maquinaId)
    .forEach((w) => {
      if (!custoPorMaquina[w.maquinaId]) {
        custoPorMaquina[w.maquinaId] = { nome: w.maquinaNome, custo: 0 };
      }
      custoPorMaquina[w.maquinaId].custo += Number(w.custoTotal) || 0;
    });

  const topCustoMaquinas = Object.entries(custoPorMaquina)
    .sort((a, b) => b[1].custo - a[1].custo)
    .slice(0, 5)
    .map(([id, v]) => ({ maquinaId: id, nome: v.nome, custo: v.custo }));

  return {
    manutencaoMes: Math.round(woCustoMes * 100) / 100,
    manutencaoTrimestre: Math.round(woCustoTrimestre * 100) / 100,
    comprasMes: Math.round(poCustoMes * 100) / 100,
    comprasTrimestre: Math.round(poCustoTrimestre * 100) / 100,
    totalMes: Math.round((woCustoMes + poCustoMes) * 100) / 100,
    totalTrimestre: Math.round((woCustoTrimestre + poCustoTrimestre) * 100) / 100,
    topCustoMaquinas,
  };
}

// ---------------------------------------------------------------------------
// RECENT ACTIVITY FEED
// ---------------------------------------------------------------------------

function _atividadeRecente(wos, pos) {
  const feed = [];

  wos.slice(0, 20).forEach((w) => {
    feed.push({
      tipo: "work_order",
      id: w.id,
      descricao: `O.S. ${w.numero || w.id.slice(-6).toUpperCase()} — ${w.maquinaNome || "Equipamento"}`,
      status: w.status,
      timestamp: _toMs(w.timestampEnvio || w.criadoEm),
      icone: "🔧",
    });
  });

  pos.slice(0, 10).forEach((p) => {
    feed.push({
      tipo: "purchase_order",
      id: p.id,
      descricao: `PO ${p.numero || p.id.slice(-6).toUpperCase()} — ${p.titulo || "Pedido de Compra"}`,
      status: p.status,
      timestamp: _toMs(p.timestampEnvio || p.criadoEm),
      icone: "🛒",
    });
  });

  feed.sort((a, b) => b.timestamp - a.timestamp);
  return feed.slice(0, 15);
}

// ---------------------------------------------------------------------------
// FIRESTORE FETCHERS
// ---------------------------------------------------------------------------

async function _fetchWorkOrders() {
  const snap = await getDocs(
    query(collection(db, "work_orders"), orderBy("timestampEnvio", "desc"), limit(500))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function _fetchPurchaseOrders() {
  const snap = await getDocs(
    query(collection(db, "purchase_orders"), orderBy("timestampEnvio", "desc"), limit(300))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function _fetchAuditoriasLimpeza() {
  const snap = await getDocs(
    query(collection(db, "auditorias_limpeza"), orderBy("timestampEnvio", "desc"), limit(200))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function _fetchChecklistsFrota() {
  const snap = await getDocs(
    query(collection(db, "checklists_frota"), orderBy("timestampEnvio", "desc"), limit(200))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------------------
// PREVENTIVE COMPLIANCE
// ---------------------------------------------------------------------------

/**
 * Returns preventive maintenance compliance rate for all machines.
 * Requires `maquinas` array with `{ id, nome, intervaloDias, ultimaPreventiva }`.
 *
 * [CF-ready]: Scheduled daily Cloud Function that writes per-machine status
 * to a `preventiva_status` collection for fast dashboard reads.
 *
 * @param {Array} maquinas — from static dados-maquinas.js or Firestore
 * @param {Array} wos      — work_orders array already fetched
 */
export function calcularCompliancePreventiva(maquinas, wos) {
  const hoje = Date.now();
  const preventivaWOs = wos.filter(
    (w) => w.tipo === "maintenance" && w.tipoManutencao === "Preventiva" && w.status === "completed"
  );

  const resultado = maquinas.map((m) => {
    const ultimaWO = preventivaWOs
      .filter((w) => w.maquinaId === m.id)
      .sort((a, b) => _toMs(b.timestampEnvio) - _toMs(a.timestampEnvio))[0];

    const ultimaData = ultimaWO
      ? _toMs(ultimaWO.dataFimOS || ultimaWO.timestampEnvio)
      : _toMs(m.ultimaPreventiva) || null;

    const intervalMs = (m.intervaloDias || 30) * 86400000;
    const proxima = ultimaData ? ultimaData + intervalMs : null;
    const vencida = proxima ? proxima < hoje : true;
    const diasRestantes = proxima ? Math.round((proxima - hoje) / 86400000) : null;

    return {
      maquinaId: m.id,
      maquinaNome: m.nome,
      ultimaPreventiva: ultimaData,
      proximaPreventiva: proxima,
      vencida,
      diasRestantes,
      status: vencida ? "vencida" : diasRestantes <= 7 ? "atencao" : "ok",
    };
  });

  const total = resultado.length;
  const conformes = resultado.filter((r) => !r.vencida).length;
  const compliance = total > 0 ? Math.round((conformes / total) * 100) : 100;

  return { compliance, maquinas: resultado, total, conformes };
}

// ---------------------------------------------------------------------------
// UTILS
// ---------------------------------------------------------------------------

function _avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function _contar(arr, campo) {
  const result = {};
  arr.forEach((item) => {
    const val = item[campo] || "outro";
    result[val] = (result[val] || 0) + 1;
  });
  return result;
}

// ---------------------------------------------------------------------------
// EXPORT FORMATTERS (used by dashboard UI)
// ---------------------------------------------------------------------------

export function formatarMoeda(valor) {
  if (!valor && valor !== 0) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarHoras(horas) {
  if (!horas && horas !== 0) return "—";
  const h = Math.floor(horas);
  const m = Math.round((horas - h) * 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function corStatus(status) {
  const map = {
    ok: "var(--success)",
    atencao: "var(--warning)",
    vencida: "var(--danger)",
    critico: "var(--danger)",
  };
  return map[status] || "#64748b";
}

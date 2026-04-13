import { db, storage } from "./firebase-config.js";
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
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { updateMachineState } from "./machine-state-engine.js";

// =======================================================
// MÓDULO 1: MAQUINÁRIO E O.S. (CORRIGIDO E BLINDADO)
// =======================================================
export async function salvarManutencaoFirebase(payload, idExistente = null) {
  // TRAVA DE SEGURANÇA: Previne crash caso o payload não tenha anexos
  if (!payload.anexos) {
    payload.anexos = { urlsLinks: [], arquivosEmMemoria: [] };
  }

  let urlsFotos = payload.anexos.urlsLinks || [];
  if (
    payload.anexos.arquivosEmMemoria &&
    payload.anexos.arquivosEmMemoria.length > 0
  ) {
    for (let i = 0; i < payload.anexos.arquivosEmMemoria.length; i++) {
      const foto = payload.anexos.arquivosEmMemoria[i];
      const nomeArquivo = `evidencias_maquinas/${Date.now()}_${
        payload.dadosEquipamento.id
      }_foto${i}.jpg`;
      const storageRef = ref(storage, nomeArquivo);
      const snapshot = await uploadBytes(storageRef, foto);
      const url = await getDownloadURL(snapshot.ref);
      urlsFotos.push(url);
    }
  }
  delete payload.anexos.arquivosEmMemoria;
  payload.anexos.urlsLinks = urlsFotos;
  payload.anexos.quantidade = urlsFotos.length;

  if (idExistente) {
    payload.dataFechoOficial = serverTimestamp();
    payload.timestampEnvio = Date.now();
    const docRef = doc(db, "historico_manutencao", idExistente);
    await updateDoc(docRef, payload);

    // Update machine_state after WO closure — non-blocking
    const machineId = payload.dadosEquipamento?.id;
    if (machineId) {
      updateMachineState(machineId, {
        newStatusLegacy: payload.diagnostico?.statusFinal || "Operacional",
        woId:            idExistente,
        woType:          payload.diagnostico?.tipoManutencao,
        downtimeHours:   parseFloat(payload.diagnostico?.tempoParada) || 0,
        perfil:          payload._perfil,
      }).catch((e) => console.error("[db.js] updateMachineState (edit) error:", e));
    }

    return idExistente;
  } else {
    payload.dataCriacaoOficial = serverTimestamp();
    payload.timestampEnvio = Date.now();
    const docRef = await addDoc(collection(db, "historico_manutencao"), payload);

    // Update machine_state after new WO — non-blocking
    const machineId = payload.dadosEquipamento?.id;
    if (machineId) {
      updateMachineState(machineId, {
        newStatusLegacy: payload.diagnostico?.statusFinal || "Operacional",
        woId:            docRef.id,
        woType:          payload.diagnostico?.tipoManutencao,
        downtimeHours:   parseFloat(payload.diagnostico?.tempoParada) || 0,
        perfil:          payload._perfil,
      }).catch((e) => console.error("[db.js] updateMachineState (new) error:", e));
    }

    return docRef.id;
  }
}

export async function obterHistoricoMaquina(idMaquina) {
  const q = query(
    collection(db, "historico_manutencao"),
    where("dadosEquipamento.id", "==", idMaquina)
  );
  const querySnapshot = await getDocs(q);
  let registros = [];
  querySnapshot.forEach((doc) => registros.push({ id: doc.id, ...doc.data() }));

  // CORREÇÃO CRÍTICA AQUI: Ordena da O.S. mais recente para a mais antiga!
  // Isto garante que o índice [0] lido no painel seja a última atividade real da máquina.
  registros.sort((a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0));

  return registros.map((reg) => ({
    ...reg,
    status: reg.diagnostico
      ? reg.diagnostico.statusFinal
      : reg.status || "Desconhecido",
    relatorio: reg.diagnostico
      ? reg.diagnostico.relatorio
      : reg.relatorio || "Sem relato",
  }));
}

export async function obterRelatorioPorId(idRelatorio) {
  const docRef = doc(db, "historico_manutencao", idRelatorio);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
  throw new Error("Documento não encontrado na Nuvem.");
}

// =======================================================
// MÓDULO 2: FACILITIES E LIMPEZA 5S
// =======================================================
export async function salvarAuditoriaLimpeza(payload) {
  if (payload.arquivosParaUpload && payload.arquivosParaUpload.length > 0) {
    for (let i = 0; i < payload.arquivosParaUpload.length; i++) {
      const item = payload.arquivosParaUpload[i];
      const nomeArquivo = `evidencias_limpeza/${Date.now()}_${payload.zonaId}_${
        item.idPergunta
      }.jpg`;
      const storageRef = ref(storage, nomeArquivo);

      const snapshot = await uploadBytes(storageRef, item.file);
      const url = await getDownloadURL(snapshot.ref);

      const perguntaIndex = payload.checklistDetalhado.findIndex(
        (q) => q.idPergunta === item.idPergunta
      );
      if (perguntaIndex !== -1) {
        payload.checklistDetalhado[perguntaIndex].fotoUrl = url;
      }
    }
  }

  delete payload.arquivosParaUpload;

  payload.dataCriacaoOficial = serverTimestamp();
  payload.timestampEnvio = Date.now();

  const docRef = await addDoc(collection(db, "auditorias_limpeza"), payload);
  return docRef.id;
}

export async function obterTodasAuditoriasLimpeza() {
  const q = query(collection(db, "auditorias_limpeza"));
  const querySnapshot = await getDocs(q);
  let registros = [];
  querySnapshot.forEach((doc) => registros.push({ id: doc.id, ...doc.data() }));

  return registros.sort(
    (a, b) => (b.timestampEnvio || 0) - (a.timestampEnvio || 0)
  );
}

// =======================================================
// MÓDULO 3: FROTA E VEÍCULOS (NOVO)
// =======================================================
export async function salvarChecklistFrota(payload, arquivoFoto) {
  // Se houver foto de avaria, faz o upload primeiro
  if (arquivoFoto) {
    const nomeArquivo = `evidencias_frota/${Date.now()}_${payload.idVeiculo}.jpg`;
    const storageRef = ref(storage, nomeArquivo);
    const snapshot = await uploadBytes(storageRef, arquivoFoto);
    payload.fotoUrl = await getDownloadURL(snapshot.ref);
  }

  payload.dataCriacaoOficial = serverTimestamp();
  
  // Salva no Firestore na coleção "checklists_frota"
  const docRef = await addDoc(collection(db, "checklists_frota"), payload);
  return docRef.id;
}

export async function obterHistoricoFrota() {
  const q = query(collection(db, "checklists_frota"));
  const querySnapshot = await getDocs(q);
  let registros = [];
  querySnapshot.forEach((doc) => registros.push({ id: doc.id, ...doc.data() }));

  // Ordena do mais recente para o mais antigo, usando o timestamp que criámos na submissão
  return registros.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}
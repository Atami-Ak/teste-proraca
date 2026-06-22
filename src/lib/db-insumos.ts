// ── Supply Inventory (Insumos) — Firestore Service ────────────────────────────

import {
  doc, getDoc, setDoc, updateDoc,
  collection, query, orderBy, limit,
  onSnapshot, runTransaction, serverTimestamp,
} from 'firebase/firestore'
import { db, auth } from '@/lib/firebase'
import type {
  InsumoBloco, ContagemInsumos, DraftInsumos, AuditAcao,
} from '@/types/insumos'

// ── Document references ───────────────────────────────────────────────────────

const insumosDocRef    = () => doc(db, 'config', 'insumos_lista')
const counterDocRef    = () => doc(db, 'meta', 'contagens_insumos_counter')
const contagensColRef  = () => collection(db, 'contagens_insumos')
const draftDocRef      = (uid: string) =>
  doc(db, 'rascunhos_edicao', `${uid}__insumos_draft`)
const auditColRef      = () => collection(db, 'cd_audit_log')

// ── Default catalog ───────────────────────────────────────────────────────────

export const DEFAULT_INSUMOS_DB: InsumoBloco[] = [
  { categoria: 'Insumos',         itens: [] },
  { categoria: 'Premix e Núcleos', itens: [] },
  { categoria: 'Sacaria',          itens: [] },
  { categoria: 'Subprodutos',      itens: [] },
]

// ── Catalog CRUD ──────────────────────────────────────────────────────────────

export async function carregarInsumos(): Promise<InsumoBloco[]> {
  const snap = await getDoc(insumosDocRef())
  if (!snap.exists()) return DEFAULT_INSUMOS_DB
  return (snap.data().dados as InsumoBloco[]) ?? DEFAULT_INSUMOS_DB
}

export async function salvarInsumos(dados: InsumoBloco[]): Promise<void> {
  await setDoc(insumosDocRef(), { dados })
}

// ── Counting CRUD ─────────────────────────────────────────────────────────────

export function escutarContagensInsumos(
  callback: (contagens: ContagemInsumos[]) => void,
  limitCount = 300,
): () => void {
  const q = query(contagensColRef(), orderBy('createdAt', 'desc'), limit(limitCount))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ ...d.data(), docId: d.id } as ContagemInsumos)))
  })
}

export async function getContagemById(docId: string): Promise<ContagemInsumos | null> {
  const snap = await getDoc(doc(db, 'contagens_insumos', docId))
  if (!snap.exists()) return null
  return { ...snap.data(), docId: snap.id } as ContagemInsumos
}

export async function criarContagemInsumos(params: {
  estoque: ContagemInsumos['estoque']
  observacoes: string
  horaInicio: string
  usuario: string
  usuarioId: string
}): Promise<string> {
  const now   = new Date()
  const data  = now.toISOString().slice(0, 10)
  const hora  = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  // Atomic sequential ID
  const novoId = await runTransaction(db, async (tx) => {
    const cSnap  = await tx.get(counterDocRef())
    const atual  = cSnap.exists() ? ((cSnap.data().seq as number) ?? 0) : 0
    const proximo = atual + 1
    tx.set(counterDocRef(), { seq: proximo }, { merge: true })
    return String(proximo).padStart(6, '0')
  })

  await setDoc(doc(db, 'contagens_insumos', novoId), {
    id:          novoId,
    tipo:        'insumos',
    status:      'finalizada',
    data,
    hora,
    horaInicio:  params.horaInicio,
    horaFim:     hora,
    usuario:     params.usuario,
    usuarioId:   params.usuarioId,
    estoque:     params.estoque,
    observacoes: params.observacoes,
    createdAt:   serverTimestamp(),
  })

  return novoId
}

export async function atualizarContagemInsumos(
  docId: string,
  dados: Pick<ContagemInsumos, 'estoque' | 'observacoes'>,
): Promise<void> {
  await updateDoc(doc(db, 'contagens_insumos', docId), {
    estoque:     dados.estoque,
    observacoes: dados.observacoes,
    updatedAt:   serverTimestamp(),
  })
}

// ── Draft / auto-save ─────────────────────────────────────────────────────────

export async function salvarDraftInsumos(
  uid: string,
  draft: Omit<DraftInsumos, 'uid'>,
): Promise<void> {
  await setDoc(draftDocRef(uid), { uid, ...draft })
}

export async function carregarDraftInsumos(uid: string): Promise<DraftInsumos | null> {
  const snap = await getDoc(draftDocRef(uid))
  if (!snap.exists()) return null
  const d = snap.data() as DraftInsumos
  if (!d.startedAtMs) return null
  return d
}

export async function limparDraftInsumos(uid: string): Promise<void> {
  await setDoc(draftDocRef(uid), {
    uid,
    estadoLotes: {},
    observacoes: '',
    startedAtMs: 0,
    updatedAtMs: 0,
  })
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function registrarAuditoria(params: {
  acao: AuditAcao
  modulo: string
  descricao: string
  dados?: Record<string, unknown>
}): Promise<void> {
  try {
    const user = auth.currentUser
    await setDoc(doc(auditColRef()), {
      ...params,
      usuarioId:    user?.uid   ?? 'anon',
      usuarioEmail: user?.email ?? 'anon',
      timestamp:    serverTimestamp(),
    })
  } catch {
    // Audit failures must not block main user flow
  }
}

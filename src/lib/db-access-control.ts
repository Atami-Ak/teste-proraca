// src/lib/db-access-control.ts
//
// Data layer for the Access Control (IAM) module.
// Collections: users (read/write), access_logs (write)
// User creation uses a secondary Firebase app instance so the admin
// session is never interrupted.

import {
  collection, doc, getDocs, getDoc,
  setDoc, updateDoc, deleteDoc,
  addDoc, query, orderBy, limit as fsLimit,
  where, serverTimestamp,
} from 'firebase/firestore'
import {
  getAuth, createUserWithEmailAndPassword, signOut as fbSignOut,
} from 'firebase/auth'
import { initializeApp, deleteApp } from 'firebase/app'
import { db, firebaseConfig } from './firebase'
import type {
  SystemUser, AnyRole, SystemRole,
  AccessLog, AccessLogAction, CreateUserPayload,
} from '@/types/access-control'

// ── Helpers ───────────────────────────────────────────────────

type DocData = Record<string, unknown>

function tsToDate(ts: unknown): Date | null {
  if (!ts) return null
  if (ts instanceof Date) return ts
  const t = ts as { toDate?: () => Date; seconds?: number }
  if (typeof t.toDate === 'function') return t.toDate()
  if (typeof t.seconds === 'number')  return new Date(t.seconds * 1000)
  if (typeof ts === 'number')         return new Date(ts)
  return null
}

function normalizeUser(uid: string, data: DocData): SystemUser {
  return {
    uid,
    nome:       (data.nome       ?? data.name ?? '') as string,
    email:      (data.email      ?? '')               as string,
    accessCode: (data.accessCode ?? '')               as string,
    role:       (data.role       ?? 'visualizador')   as AnyRole,
    cargo:      (data.cargo      ?? undefined)        as string | undefined,
    active:     (data.active     ?? undefined)        as boolean | undefined,
    blocked:    (data.blocked    ?? undefined)        as boolean | undefined,
    lastLogin:  tsToDate(data.lastLogin),
    lastSeen:   tsToDate(data.lastSeen),
    createdAt:  tsToDate(data.createdAt),
  }
}

function normalizeLog(id: string, data: DocData): AccessLog {
  return {
    id,
    action:           (data.action          ?? 'user_created') as AccessLogAction,
    userId:           (data.userId          ?? '')             as string,
    userName:         (data.userName        ?? '')             as string,
    userAccessCode:   (data.userAccessCode  ?? '')             as string,
    performedBy:      (data.performedBy     ?? '')             as string,
    performedByName:  (data.performedByName ?? 'Sistema')      as string,
    timestamp:        tsToDate(data.timestamp) ?? new Date(),
    details:          (data.details         ?? undefined)      as Record<string, string> | undefined,
  }
}

// ── Access Email Generation ───────────────────────────────────

export function generateEmail(accessCode: string): string {
  const normalized = accessCode.toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${normalized}@proraca.siga`
}

export function suggestAccessCode(nome: string): string {
  const parts = nome.trim().toUpperCase().replace(/[^A-Z\s]/g, '').split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  if (parts.length === 1) return parts[0].slice(0, 8)
  const first = parts[0][0] ?? ''
  const last  = parts[parts.length - 1].slice(0, 7)
  return (first + last).slice(0, 8)
}

export function generatePassword(length = 10): string {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower   = 'abcdefghjkmnpqrstuvwxyz'
  const digits  = '23456789'
  const special = '@#!'
  const all     = upper + lower + digits + special

  // Ensure at least one of each category
  const mandatory = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ]
  const rest = Array.from({ length: length - 4 }, () =>
    all[Math.floor(Math.random() * all.length)])

  return [...mandatory, ...rest]
    .sort(() => Math.random() - 0.5)
    .join('')
}

// ── Fetch All Users ───────────────────────────────────────────

export async function fetchAllUsers(): Promise<SystemUser[]> {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map(d => normalizeUser(d.id, d.data() as DocData))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

// ── Fetch Single User ─────────────────────────────────────────

export async function fetchUser(uid: string): Promise<SystemUser | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  return normalizeUser(snap.id, snap.data() as DocData)
}

// ── Write Access Log ──────────────────────────────────────────

async function writeLog(entry: Omit<AccessLog, 'id' | 'timestamp'>): Promise<void> {
  try {
    await addDoc(collection(db, 'access_logs'), {
      ...entry,
      timestamp: serverTimestamp(),
    })
  } catch {
    // Logging must never break the primary action
  }
}

// ── Create System User ────────────────────────────────────────
// Uses a secondary Firebase app instance so the admin's session
// is never interrupted.

export async function createSystemUser(
  payload:      CreateUserPayload,
  adminUid:     string,
  adminName:    string,
): Promise<{ success: boolean; uid?: string; error?: string }> {

  // 1. Check accessCode uniqueness client-side is caller's responsibility,
  //    but do a final Firestore guard here.
  const existing = await getDocs(
    query(collection(db, 'users'), where('accessCode', '==', payload.accessCode.toUpperCase()))
  )
  if (!existing.empty) {
    return { success: false, error: 'Código de acesso já está em uso por outro usuário.' }
  }

  // 2. Create Firebase Auth user via secondary app (preserves admin session)
  const appName = `siga_create_${Date.now()}`
  const secondaryApp = initializeApp(firebaseConfig, appName)
  const secondaryAuth = getAuth(secondaryApp)

  let uid: string
  try {
    const cred = await createUserWithEmailAndPassword(
      secondaryAuth, payload.email, payload.initialPassword,
    )
    uid = cred.user.uid
    await fbSignOut(secondaryAuth)
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? ''
    await deleteApp(secondaryApp).catch(() => undefined)
    if (code === 'auth/email-already-in-use') {
      return { success: false, error: 'Esse e-mail gerado já está em uso. Tente outro código de acesso.' }
    }
    if (code === 'auth/weak-password') {
      return { success: false, error: 'Senha muito fraca. Use pelo menos 6 caracteres.' }
    }
    return { success: false, error: `Erro ao criar conta Firebase: ${code}` }
  } finally {
    await deleteApp(secondaryApp).catch(() => undefined)
  }

  // 3. Create Firestore document
  try {
    await setDoc(doc(db, 'users', uid), {
      nome:       payload.nome.trim(),
      email:      payload.email,
      accessCode: payload.accessCode.toUpperCase(),
      role:       payload.role,
      cargo:      payload.cargo?.trim() || null,
      active:     true,
      blocked:    false,
      createdAt:  serverTimestamp(),
      createdBy:  adminUid,
    })
  } catch {
    // Firestore write failed — user exists in Auth but not Firestore
    return { success: false, error: 'Conta criada no Firebase Auth mas falhou ao salvar perfil. Contate o suporte.' }
  }

  // 4. Audit log
  await writeLog({
    action:          'user_created',
    userId:          uid,
    userName:        payload.nome.trim(),
    userAccessCode:  payload.accessCode.toUpperCase(),
    performedBy:     adminUid,
    performedByName: adminName,
    details:         { role: payload.role, cargo: payload.cargo ?? '' },
  })

  return { success: true, uid }
}

// ── Update User Role ──────────────────────────────────────────

export async function updateUserRole(
  uid:          string,
  targetName:   string,
  targetCode:   string,
  newRole:      SystemRole,
  previousRole: AnyRole,
  adminUid:     string,
  adminName:    string,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { role: newRole })
  await writeLog({
    action:          'role_changed',
    userId:          uid,
    userName:        targetName,
    userAccessCode:  targetCode,
    performedBy:     adminUid,
    performedByName: adminName,
    details:         { from: previousRole, to: newRole },
  })
}

// ── Set User Active Status ────────────────────────────────────

export async function setUserStatus(
  uid:          string,
  targetName:   string,
  targetCode:   string,
  active:       boolean,
  adminUid:     string,
  adminName:    string,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { active })
  await writeLog({
    action:          active ? 'user_activated' : 'user_deactivated',
    userId:          uid,
    userName:        targetName,
    userAccessCode:  targetCode,
    performedBy:     adminUid,
    performedByName: adminName,
  })
}

// ── Set User Blocked ──────────────────────────────────────────

export async function setUserBlocked(
  uid:          string,
  targetName:   string,
  targetCode:   string,
  blocked:      boolean,
  adminUid:     string,
  adminName:    string,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { blocked })
  await writeLog({
    action:          blocked ? 'user_blocked' : 'user_unblocked',
    userId:          uid,
    userName:        targetName,
    userAccessCode:  targetCode,
    performedBy:     adminUid,
    performedByName: adminName,
  })
}

// ── Delete System User ────────────────────────────────────────
// Removes only the Firestore document (revokes accessCode lookup).
// The Firebase Auth account must be deleted manually from the console.

export async function deleteSystemUser(
  uid:          string,
  targetName:   string,
  targetCode:   string,
  adminUid:     string,
  adminName:    string,
): Promise<void> {
  await deleteDoc(doc(db, 'users', uid))
  await writeLog({
    action:          'user_deleted',
    userId:          uid,
    userName:        targetName,
    userAccessCode:  targetCode,
    performedBy:     adminUid,
    performedByName: adminName,
    details:         { note: 'Perfil Firestore removido. Auth Firebase requer remoção manual.' },
  })
}

// ── Fetch Access Logs ─────────────────────────────────────────

export async function fetchAccessLogs(
  targetUserId?: string,
  maxRecords = 50,
): Promise<AccessLog[]> {
  let q
  if (targetUserId) {
    q = query(
      collection(db, 'access_logs'),
      where('userId', '==', targetUserId),
      orderBy('timestamp', 'desc'),
      fsLimit(maxRecords),
    )
  } else {
    q = query(
      collection(db, 'access_logs'),
      orderBy('timestamp', 'desc'),
      fsLimit(maxRecords),
    )
  }

  const snap = await getDocs(q)
  return snap.docs.map(d => normalizeLog(d.id, d.data() as DocData))
}

// ── Check AccessCode Availability ────────────────────────────

export async function isAccessCodeAvailable(code: string): Promise<boolean> {
  const snap = await getDocs(
    query(collection(db, 'users'), where('accessCode', '==', code.toUpperCase()))
  )
  return snap.empty
}

/**
 * auth.ts — Access-code based authentication service
 *
 * Flow: accessCode → Firestore lookup → email → Firebase Auth signIn
 * Admin creates users internally; users never see their email address.
 */

import {
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from './firebase'

// ── Error taxonomy ────────────────────────────────────────
export type LoginErrorCode =
  | 'access_code_not_found'
  | 'wrong_password'
  | 'user_inactive'
  | 'user_blocked'
  | 'network_error'
  | 'too_many_requests'
  | 'unknown'

export const LOGIN_ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  access_code_not_found: 'Código de acesso não encontrado. Verifique e tente novamente.',
  wrong_password:        'Senha incorreta. Verifique e tente novamente.',
  user_inactive:         'Usuário inativo. Contate o administrador do sistema.',
  user_blocked:          'Acesso bloqueado. Contate o administrador do sistema.',
  network_error:         'Falha na conexão. Verifique sua internet e tente novamente.',
  too_many_requests:     'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',
  unknown:               'Erro inesperado. Tente novamente ou contate o suporte.',
}

export interface LoginResult {
  success: boolean
  error?: LoginErrorCode
}

// ── Login with access code ────────────────────────────────
export async function loginWithAccessCode(
  accessCode: string,
  password: string,
  rememberMe: boolean
): Promise<LoginResult> {
  const normalizedCode = accessCode.trim().toUpperCase()

  // 1. Look up user by access code
  const usersRef = collection(db, 'users')
  const q        = query(usersRef, where('accessCode', '==', normalizedCode))

  let snap: Awaited<ReturnType<typeof getDocs>>
  try {
    snap = await getDocs(q)
  } catch {
    return { success: false, error: 'network_error' }
  }

  if (snap.empty) {
    return { success: false, error: 'access_code_not_found' }
  }

  const userDoc  = snap.docs[0]
  const userData = userDoc.data() as Record<string, unknown>

  // 2. Validate user status
  if (userData['active'] === false) {
    return { success: false, error: 'user_inactive' }
  }
  if (userData['blocked'] === true) {
    return { success: false, error: 'user_blocked' }
  }

  const email = userData['email'] as string | undefined
  if (!email) {
    return { success: false, error: 'unknown' }
  }

  // 3. Set session persistence based on rememberMe
  try {
    await setPersistence(
      auth,
      rememberMe ? browserLocalPersistence : browserSessionPersistence
    )
  } catch {
    // Non-fatal — continue with default persistence
  }

  // 4. Sign in with Firebase Auth
  try {
    await signInWithEmailAndPassword(auth, email, password)
    return { success: true }
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? ''
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-email') {
      return { success: false, error: 'wrong_password' }
    }
    if (code === 'auth/network-request-failed') {
      return { success: false, error: 'network_error' }
    }
    if (code === 'auth/too-many-requests') {
      return { success: false, error: 'too_many_requests' }
    }
    return { success: false, error: 'unknown' }
  }
}

// ── Logout ────────────────────────────────────────────────
export async function logout(): Promise<void> {
  await signOut(auth)
}

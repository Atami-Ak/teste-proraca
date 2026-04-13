/**
 * db-auth.js — SIGA Authentication System v2 (Production-Ready)
 *
 * ============================================================
 * BUGS FIXED FROM v1:
 * ============================================================
 *
 * [CRITICAL #1] _currentProfile initialized as `null` instead of `undefined`.
 *   The check `_currentProfile !== undefined` was ALWAYS true (null !== undefined
 *   is true), causing getCurrentUser() to return null immediately on every call
 *   without ever waiting for Firebase auth. This was the root cause of all
 *   "user gets redirected to login even when logged in" issues.
 *
 * [CRITICAL #2] Path calculation wrong for subdirectory pages.
 *   For /os/os.html, _resolverCaminhoLogin() returned `auth/login.html` instead
 *   of `../auth/login.html`. The condition `depth > 1` was off by one; should
 *   be `depth > 0`. All pages in subdirectories (os/, compras/, dashboard/)
 *   received a broken login URL.
 *
 * [STABILITY #3] onAuthStateChanged immediately unsubscribed (unsub()).
 *   The listener fired once and was removed. Subsequent auth changes (logout,
 *   token expiry) were not tracked. _currentProfile became stale.
 *
 * [STABILITY #4] No initAuth() singleton — multiple parallel calls to
 *   getCurrentUser() would each create a new onAuthStateChanged listener,
 *   causing duplicate profile fetches and unpredictable race conditions.
 *
 * [SECURITY #5] Missing Firestore profile silently assigned default role.
 *   When a Firebase Auth user had no `users/{uid}` document, _carregarPerfil()
 *   returned a default profile with role "operations". This is a security hole.
 *   Now: missing profile → force logout.
 *
 * [UX #6] No loading state. Page content was visible while auth was being
 *   resolved, causing flickering and unauthorized content flash.
 *
 * [UX #7] After login, always redirected to index.html even if the user was
 *   trying to access a specific page. Now uses ?redirect= param.
 *
 * ============================================================
 * ARCHITECTURE:
 * ============================================================
 *
 *   initAuth()        → Singleton. Wraps onAuthStateChanged in a Promise.
 *                       Resolves ONCE on first Firebase confirmation.
 *                       Observer stays active for subsequent auth changes.
 *
 *   getCurrentUser()  → Fast-path if already initialized. Else awaits initAuth().
 *
 *   checkAuth()       → Page guard. Hides page, awaits getCurrentUser(),
 *                       validates role, shows page or redirects.
 *
 *   login()           → Auth + profile fetch + cache + redirect.
 *
 *   logout()          → Signs out + clears all caches + redirects.
 */

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";

// ============================================================
// CONSTANTS
// ============================================================

export const ROLES = {
  ADMIN: "admin",
  MAINTENANCE: "maintenance",
  OPERATIONS: "operations",
  PURCHASING: "purchasing",
};

export const ROLE_LABELS = {
  admin: "Administrador",
  maintenance: "Manutenção",
  operations: "Operações",
  purchasing: "Compras",
};

/** Whitelist of page IDs per role. "*" = all pages. */
export const ROLE_PERMISSIONS = {
  admin: ["*"],
  maintenance: [
    "index", "maquinario", "formulario-maquinario", "historico-maquina",
    "detalhes-relatorio", "os", "os-detalhe", "documentos", "frota",
    "formulario-frota", "historico-frota", "limpeza", "formulario-limpeza",
    "historico-limpeza", "preventiva", "dashboard",
  ],
  operations: [
    "index", "maquinario", "frota", "formulario-frota", "historico-frota",
    "limpeza", "formulario-limpeza", "historico-limpeza", "os", "os-detalhe",
    "documentos", "dashboard",
  ],
  purchasing: [
    "index", "compras", "compra-detalhe", "documentos", "dashboard", "fornecedores",
  ],
};

/** localStorage key for soft profile cache. */
const _LS_KEY = "siga_auth_v2";

// ============================================================
// INTERNAL STATE
// ============================================================

/**
 * `undefined` = not yet initialized (waiting for Firebase)
 * `null`      = initialized, user is NOT logged in
 * `{Object}`  = initialized, user IS logged in (profile)
 *
 * CRITICAL: Must start as `undefined`, NOT `null`.
 * null !== undefined is true, which would cause getCurrentUser()
 * to return null immediately without waiting for Firebase.
 */
let _currentProfile = undefined;

/** Whether onAuthStateChanged has fired at least once. */
let _isInitialized = false;

/** Singleton Promise — resolved once Firebase confirms initial auth state. */
let _authPromise = null;

// ============================================================
// AUTH INITIALIZATION — SINGLETON
// ============================================================

/**
 * Creates a single onAuthStateChanged observer and wraps it in a Promise.
 * The Promise resolves ONCE (on first Firebase auth confirmation).
 * The observer continues running to track subsequent login/logout events.
 *
 * Calling initAuth() multiple times returns the same Promise (singleton).
 */
function initAuth() {
  if (_authPromise) {
    _log("INIT", "Returning existing auth promise");
    return _authPromise;
  }

  _log("INIT", "Creating onAuthStateChanged observer");

  let _resolveAuth;
  _authPromise = new Promise((resolve) => {
    _resolveAuth = resolve;
  });

  onAuthStateChanged(auth, async (firebaseUser) => {
    _log("STATE CHANGED", firebaseUser ? `uid=${firebaseUser.uid}` : "signed out");

    if (!firebaseUser) {
      _currentProfile = null;
      _clearCache();
    } else {
      try {
        const perfil = await _fetchProfile(firebaseUser);

        if (!perfil) {
          // Firebase Auth user exists but has no Firestore profile.
          // This is a configuration error — force logout for security.
          _log("PROFILE FETCH", "No Firestore profile found → forcing logout");
          _currentProfile = null;
          _clearCache();
          await signOut(auth);
          // Don't redirect here — let the checkAuth() handle it
        } else {
          _currentProfile = perfil;
          _saveCache(perfil);
          _log("PROFILE FETCH", `Loaded: ${perfil.nome} (${perfil.role})`);
        }
      } catch (err) {
        _log("PROFILE FETCH ERROR", err.message);
        // On Firestore error, use cached profile as fallback to avoid
        // locking out users during temporary network issues.
        const cached = _loadCache();
        if (cached && cached.uid === firebaseUser.uid) {
          _log("PROFILE FETCH", "Using localStorage cache as fallback");
          _currentProfile = cached;
        } else {
          _currentProfile = null;
        }
      }
    }

    // Resolve the init Promise on first fire only.
    if (!_isInitialized) {
      _isInitialized = true;
      _resolveAuth(_currentProfile);
      _log("INIT", "Auth initialization complete");
    }
    // For subsequent fires (login/logout in same tab), _currentProfile is
    // updated directly. Pages that called getCurrentUser() already have their
    // result, but checkAuth() on the NEXT page load will re-run initAuth()
    // (since _isInitialized resets on each page load for multi-page apps).
  });

  return _authPromise;
}

// ============================================================
// PUBLIC: GET CURRENT USER
// ============================================================

/**
 * Returns the current authenticated user profile.
 *
 * Fast-path: if auth is already initialized, returns the cached profile
 * synchronously (wrapped in Promise for consistency).
 *
 * Cold-path: awaits initAuth() to let Firebase confirm auth state.
 *
 * @returns {Promise<Object|null>} Profile object or null if not logged in.
 */
export async function getCurrentUser() {
  if (_isInitialized) {
    return _currentProfile;
  }
  return initAuth();
}

/** Alias for getCurrentUser(). Does NOT redirect. */
export async function getAuthSilent() {
  return getCurrentUser();
}

// ============================================================
// PAGE GUARD — checkAuth()
// ============================================================

/**
 * Guards a page. Must be called at the top of every protected module.
 *
 * Behavior:
 *   1. Hides page content to prevent unauthorized flash.
 *   2. Awaits Firebase auth initialization.
 *   3. If not authenticated → redirect to login (with ?redirect= param).
 *   4. If account inactive → logout + redirect to login.
 *   5. If role not allowed → alert + redirect to index.
 *   6. If authorized → show page + return profile.
 *
 * Usage (top-level await in ES Module):
 *   const perfil = await checkAuth("os");
 *
 * @param {string|null} paginaId  Page ID for permission check.
 *   Defaults to current HTML filename without extension.
 * @returns {Promise<Object|null>}  Profile or null (redirects before null).
 */
export async function checkAuth(paginaId = null) {
  // Step 1: Hide page immediately to prevent content flash while auth resolves.
  _hidePage();

  const pagina = paginaId || _currentPageName();
  _log("CHECK AUTH", `Page: ${pagina}`);

  // Step 2: Await Firebase auth state (fast if already initialized).
  const perfil = await getCurrentUser();

  // Step 3: Not authenticated.
  if (!perfil) {
    _log("CHECK AUTH → REDIRECT", "Not authenticated → login");
    _redirect(_loginPath(true));
    return null;
  }

  // Step 4: Account deactivated.
  if (perfil.ativo === false) {
    _log("CHECK AUTH → LOGOUT", "Account inactive");
    await logout(false); // false = don't redirect (we'll redirect below)
    _redirect(_loginPath(false));
    return null;
  }

  // Step 5: Role not allowed for this page.
  if (!_hasPermission(perfil.role, pagina)) {
    _log("CHECK AUTH → DENIED", `Role ${perfil.role} cannot access ${pagina}`);
    _showPage(); // Show page briefly while alert is shown
    alert(
      `Acesso negado.\n\nA sua conta (${ROLE_LABELS[perfil.role]}) não tem permissão para esta página.`
    );
    _redirect(_indexPath());
    return null;
  }

  // Step 6: All checks passed — show the page.
  _showPage();
  _log("CHECK AUTH → OK", `${perfil.nome} (${perfil.role}) on ${pagina}`);
  return perfil;
}

// ============================================================
// LOGIN
// ============================================================

/**
 * Authenticates the user with email + password.
 *
 * Flow:
 *   1. signInWithEmailAndPassword
 *   2. Fetch Firestore profile (validates existence and active status)
 *   3. Cache profile
 *   4. Update lastLogin timestamp (non-blocking)
 *   5. Return profile (caller handles redirect)
 *
 * @throws {Error} Localized error message for display.
 */
export async function login(email, senha) {
  _log("LOGIN", `Attempting login for ${email}`);

  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, email, senha);
  } catch (err) {
    _log("LOGIN FAILED", err.code);
    throw _translateError(err);
  }

  // Fetch profile immediately after auth (don't wait for onAuthStateChanged)
  let perfil;
  try {
    perfil = await _fetchProfile(cred.user);
  } catch (err) {
    _log("LOGIN — PROFILE ERROR", err.message);
    await signOut(auth);
    throw new Error("Erro ao carregar perfil de utilizador. Tente novamente.");
  }

  if (!perfil) {
    // Firebase Auth succeeded but no Firestore profile exists.
    await signOut(auth);
    throw new Error(
      "Conta sem perfil configurado. Contacte o administrador do sistema."
    );
  }

  if (!perfil.ativo) {
    await signOut(auth);
    throw new Error("Esta conta está desactivada. Contacte o administrador.");
  }

  // Cache the profile so getCurrentUser() returns it immediately on next call
  // in the same tab (before onAuthStateChanged fires).
  _currentProfile = perfil;
  _isInitialized = true;
  _saveCache(perfil);

  // Update lastLogin non-blocking (don't block redirect on this)
  updateDoc(doc(db, "users", cred.user.uid), {
    lastLogin: serverTimestamp(),
  }).catch(() => {});

  _log("LOGIN → OK", `${perfil.nome} (${perfil.role})`);
  return perfil;
}

// ============================================================
// LOGOUT
// ============================================================

/**
 * Signs out the current user and clears all caches.
 *
 * @param {boolean} redirect  Whether to redirect to login page (default true).
 */
export async function logout(redirect = true) {
  _log("LOGOUT", "Signing out");
  _currentProfile = null;
  _isInitialized = false;
  _authPromise = null; // Reset singleton so next page re-initializes
  _clearCache();

  try {
    await signOut(auth);
  } catch (err) {
    _log("LOGOUT ERROR", err.message);
  }

  if (redirect) {
    _redirect(_loginPath(false));
  }
}

// ============================================================
// ROLE HELPERS
// ============================================================

export async function isAdmin() {
  const u = await getCurrentUser();
  return u?.role === ROLES.ADMIN;
}

export async function isMaintenance() {
  const u = await getCurrentUser();
  return [ROLES.ADMIN, ROLES.MAINTENANCE].includes(u?.role);
}

export async function isOperations() {
  const u = await getCurrentUser();
  return [ROLES.ADMIN, ROLES.OPERATIONS].includes(u?.role);
}

export async function isPurchasing() {
  const u = await getCurrentUser();
  return [ROLES.ADMIN, ROLES.PURCHASING].includes(u?.role);
}

/**
 * Synchronous role check against a profile object already in hand.
 * Does NOT need to await — use when you already have perfil from checkAuth().
 */
export function hasRole(perfil, ...roles) {
  if (!perfil) return false;
  return perfil.role === ROLES.ADMIN || roles.includes(perfil.role);
}

// ============================================================
// AUTH STATE OBSERVER (for reactive UI elements)
// ============================================================

/**
 * Registers a callback fired on auth state changes.
 * Returns unsubscribe function.
 *
 * Usage:
 *   const unsub = onAuthChange((perfil) => updateNavbar(perfil));
 *   // later: unsub();
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      _currentProfile = null;
      _clearCache();
      callback(null);
      return;
    }
    const perfil = await _fetchProfile(firebaseUser);
    if (perfil) {
      _currentProfile = perfil;
      _saveCache(perfil);
    }
    callback(_currentProfile);
  });
}

// ============================================================
// USER MANAGEMENT (admin only — enforced via Firestore rules)
// ============================================================

/**
 * Creates a new user profile in Firestore.
 * Firebase Auth account must be created separately (Console or Admin SDK).
 *
 * [CF-ready]: Move to Cloud Function onUserCreate trigger for atomicity.
 */
export async function criarPerfilUsuario(uid, { nome, email, role }) {
  await setDoc(doc(db, "users", uid), {
    nome,
    email,
    role: role || ROLES.OPERATIONS,
    ativo: true,
    criadoEm: serverTimestamp(),
    lastLogin: null,
  });
}

export async function atualizarRoleUsuario(uid, novoRole) {
  if (!Object.values(ROLES).includes(novoRole)) {
    throw new Error(`Role inválido: ${novoRole}`);
  }
  await updateDoc(doc(db, "users", uid), { role: novoRole });
}

export async function desativarUsuario(uid) {
  await updateDoc(doc(db, "users", uid), { ativo: false });
}

export async function listarUsuarios() {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listarUsuariosPorRole(role) {
  const q = query(
    collection(db, "users"),
    where("role", "==", role),
    where("ativo", "==", true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ============================================================
// PASSWORD
// ============================================================

export async function alterarSenha(senhaAtual, novaSenha) {
  const user = auth.currentUser;
  if (!user) throw new Error("Não autenticado.");

  const cred = EmailAuthProvider.credential(user.email, senhaAtual);
  await reauthenticateWithCredential(user, cred).catch((e) => {
    throw _translateError(e);
  });
  await updatePassword(user, novaSenha).catch((e) => {
    throw _translateError(e);
  });
}

// ============================================================
// PRIVATE: PROFILE FETCH
// ============================================================

/**
 * Fetches user profile from Firestore for the given Firebase user.
 *
 * Returns null if:
 *   - Firestore document does not exist (no profile configured)
 *
 * Does NOT handle ativo check here — that is done in checkAuth() so that
 * the error message is user-visible.
 *
 * @param {import("firebase/auth").User} firebaseUser
 * @returns {Promise<Object|null>}
 */
async function _fetchProfile(firebaseUser) {
  const snap = await getDoc(doc(db, "users", firebaseUser.uid));

  if (!snap.exists()) {
    _log("PROFILE FETCH", `No document at users/${firebaseUser.uid}`);
    return null;
  }

  const data = snap.data();
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    nome: data.nome || firebaseUser.displayName || firebaseUser.email,
    role: data.role || ROLES.OPERATIONS,
    ativo: data.ativo !== false,
    ...data,
  };
}

// ============================================================
// PRIVATE: PAGE VISIBILITY
// ============================================================

/**
 * Hides the page body while auth resolves.
 * Uses opacity (not display/visibility) to preserve layout and avoid FOUC.
 */
function _hidePage() {
  if (document.body) {
    document.body.style.opacity = "0";
    document.body.style.pointerEvents = "none";
  }
}

function _showPage() {
  if (document.body) {
    document.body.style.opacity = "";
    document.body.style.pointerEvents = "";
  }
}

// ============================================================
// PRIVATE: PATH RESOLUTION
// ============================================================

/**
 * Returns the number of directory levels deep the current page is.
 *
 * Examples:
 *   /index.html              → 0
 *   /os/os.html              → 1
 *   /dashboard/dashboard.html → 1
 *   /compras/compra-detalhe.html → 1
 */
function _getDepth() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  // parts = ["os", "os.html"] → depth = 1 (only directory segments)
  return Math.max(0, parts.length - 1);
}

function _prefix() {
  const depth = _getDepth();
  return depth > 0 ? "../".repeat(depth) : "";
}

/**
 * Builds the path to the login page, optionally with a ?redirect= param
 * so the user is returned to the page they were trying to access.
 *
 * @param {boolean} withRedirect
 */
function _loginPath(withRedirect = true) {
  const path = `${_prefix()}auth/login.html`;
  if (!withRedirect) return path;

  // Encode the full current URL so login can redirect back after success.
  const redirectUrl = encodeURIComponent(window.location.href);
  return `${path}?redirect=${redirectUrl}`;
}

function _indexPath() {
  return `${_prefix()}index.html`;
}

function _currentPageName() {
  const file = window.location.pathname.split("/").pop() || "index.html";
  return file.replace(".html", "") || "index";
}

function _redirect(url) {
  _log("REDIRECT", url);
  window.location.href = url;
}

// ============================================================
// PRIVATE: LOCALSTORAGE SOFT CACHE
// ============================================================

/**
 * Saves a lightweight profile snapshot to localStorage.
 * Used as a fallback when Firestore is temporarily unreachable.
 * TTL: 8 hours.
 */
function _saveCache(perfil) {
  try {
    localStorage.setItem(
      _LS_KEY,
      JSON.stringify({
        uid: perfil.uid,
        email: perfil.email,
        nome: perfil.nome,
        role: perfil.role,
        ativo: perfil.ativo,
        _cachedAt: Date.now(),
      })
    );
  } catch (e) {
    // Private browsing or storage full — silently ignore
  }
}

function _loadCache() {
  try {
    const raw = localStorage.getItem(_LS_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    const TTL = 8 * 60 * 60 * 1000; // 8 hours
    if (Date.now() - (cached._cachedAt || 0) > TTL) {
      localStorage.removeItem(_LS_KEY);
      return null;
    }
    return cached;
  } catch (e) {
    return null;
  }
}

function _clearCache() {
  try {
    localStorage.removeItem(_LS_KEY);
  } catch (e) {
    // Silently ignore
  }
}

// ============================================================
// PRIVATE: PERMISSION CHECK
// ============================================================

function _hasPermission(role, pagina) {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes("*") || perms.includes(pagina);
}

// ============================================================
// PRIVATE: ERROR TRANSLATION
// ============================================================

function _translateError(err) {
  const map = {
    "auth/user-not-found": "Utilizador não encontrado.",
    "auth/wrong-password": "Senha incorrecta.",
    "auth/invalid-email": "Endereço de email inválido.",
    "auth/user-disabled": "Esta conta foi desactivada.",
    "auth/too-many-requests": "Demasiadas tentativas falhadas. Aguarde alguns minutos.",
    "auth/network-request-failed": "Sem ligação à internet. Verifique a rede.",
    "auth/invalid-credential": "Email ou senha incorrectos.",
    "auth/requires-recent-login": "Sessão expirada. Faça login novamente.",
    "auth/weak-password": "Senha demasiado fraca (mínimo 6 caracteres).",
    "auth/email-already-in-use": "Este email já está registado.",
    "auth/operation-not-allowed": "Método de login não permitido.",
  };
  const code = err?.code || "";
  _log("AUTH ERROR", code || err?.message);
  return new Error(map[code] || err?.message || "Erro de autenticação desconhecido.");
}

// ============================================================
// PRIVATE: DEBUG LOGGING
// ============================================================

const _DEBUG = true; // Set to false in production

function _log(category, message) {
  if (!_DEBUG) return;
  const time = new Date().toISOString().slice(11, 23);
  console.log(`%c[AUTH ${category}]%c ${time} — ${message}`, "color:#3b82f6;font-weight:bold", "color:#64748b");
}

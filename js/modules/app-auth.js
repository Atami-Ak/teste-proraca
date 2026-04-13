/**
 * app-auth.js — Login Page Controller
 *
 * Handles:
 *   - Redirect away if already authenticated
 *   - Login form submission (prevents double-submit)
 *   - Redirect back to the page the user was trying to reach (?redirect= param)
 *   - User-friendly error display
 */

import { login, getCurrentUser } from "../core/db-auth.js";

// ============================================================
// ELEMENTS
// ============================================================

const emailInput  = document.getElementById("email");
const senhaInput  = document.getElementById("senha");
const btnEntrar   = document.getElementById("btn-entrar");
const msgErro     = document.getElementById("msg-erro");

// ============================================================
// REDIRECT IF ALREADY LOGGED IN
// ============================================================

// Login page is public — do NOT call checkAuth() here.
// Instead, silently check and redirect if already authenticated.
getCurrentUser().then((perfil) => {
  if (perfil) {
    // Already logged in → go to the intended page (admin → dashboard)
    window.location.href = _resolvePostLoginUrl(perfil);
  }
  // Not logged in → stay on login page, show the form
  document.body.style.opacity = ""; // Ensure page is visible
});

// ============================================================
// FORM EVENT LISTENERS
// ============================================================

emailInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") senhaInput.focus();
  _clearError();
});

senhaInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") _tentarLogin();
  _clearError();
});

btnEntrar.addEventListener("click", _tentarLogin);

// ============================================================
// LOGIN LOGIC
// ============================================================

let _submitting = false; // Guard against double-submit

async function _tentarLogin() {
  if (_submitting) return; // Prevent double-submit

  const email = emailInput.value.trim();
  const senha = senhaInput.value;

  if (!email || !senha) {
    _showError("Preencha o email e a senha.");
    if (!email) emailInput.focus();
    else senhaInput.focus();
    return;
  }

  _submitting = true;
  _setLoading(true);
  _clearError();

  try {
    const perfil = await login(email, senha);
    // Login succeeded — redirect to intended page (admin → dashboard)
    window.location.href = _resolvePostLoginUrl(perfil);
  } catch (err) {
    _showError(err.message || "Erro ao entrar. Tente novamente.");
    _setLoading(false);
    _submitting = false;
    senhaInput.value = "";
    senhaInput.focus();
  }
}

// ============================================================
// POST-LOGIN REDIRECT RESOLUTION
// ============================================================

/**
 * If the user was redirected to login from a protected page,
 * the original URL is stored in ?redirect=<encoded URL>.
 * After login, we go back there instead of always going to index.
 *
 * Security: only redirect to same-origin URLs.
 */
function _resolvePostLoginUrl(perfil) {
  const defaultPath = _defaultPath(perfil);
  try {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("redirect");
    if (!encoded) return defaultPath;

    const target = decodeURIComponent(encoded);
    const targetUrl = new URL(target);

    // Security: only allow redirects to the same origin
    if (targetUrl.origin !== window.location.origin) return defaultPath;

    // Don't redirect back to login itself
    if (targetUrl.pathname.includes("login.html")) return defaultPath;

    return target;
  } catch {
    return defaultPath;
  }
}

function _defaultPath(perfil) {
  // Admins go directly to the dashboard — their primary workspace
  if (perfil && perfil.role === "admin") return "../dashboard/dashboard.html";
  return "../index.html";
}

// ============================================================
// UI HELPERS
// ============================================================

function _setLoading(loading) {
  if (loading) {
    btnEntrar.disabled = true;
    btnEntrar.innerHTML = '<span class="spinner"></span>A entrar...';
  } else {
    btnEntrar.disabled = false;
    btnEntrar.textContent = "Entrar";
  }
}

function _showError(texto) {
  if (!msgErro) return;
  msgErro.textContent = texto;
  msgErro.style.display = "block";
}

function _clearError() {
  if (!msgErro) return;
  msgErro.style.display = "none";
  msgErro.textContent = "";
}

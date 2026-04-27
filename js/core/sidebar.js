/**
 * sidebar.js — Auto-inject Sidebar Navigation Component
 *
 * Import on any page to activate the sidebar:
 *   <script type="module" src="../js/core/sidebar.js"></script>
 *
 * This module:
 *  1. Detects base path from current URL (subdir vs root)
 *  2. Injects sidebar.css into <head>
 *  3. Builds and injects the sidebar HTML into <body>
 *  4. Adds body.has-sidebar for CSS layout shift
 *  5. Determines active nav item from URL
 *  6. Handles collapse/expand with localStorage persistence
 *  7. Handles mobile overlay
 *  8. Loads user info asynchronously (non-blocking)
 */

// ── Path detection ─────────────────────────────────────
const _SUBDIRS = ['ativos','maquinario','frota','limpeza','os','compras','dashboard','auth'];
const _PATH    = window.location.pathname;
const _IN_SUB  = _SUBDIRS.some(d => _PATH.includes('/' + d + '/'));
const BASE     = _IN_SUB ? '../' : '';

// ── CSS injection (before DOM paint) ──────────────────
const _css = document.createElement('link');
_css.rel  = 'stylesheet';
_css.href = BASE + 'css/sidebar.css';
document.head.prepend(_css);

// ── Active page detection ──────────────────────────────
function _active(key) {
  const MAP = {
    dashboard:  ['/dashboard/'],
    ativos:     ['/ativos/ativos', '/ativos/ativo-form', '/ativos/fornecedores'],
    manutencao: ['/ativos/manutencao'],
    inventario: ['/ativos/inventario'],
    categorias: ['/ativos/categorias'],
    os:         ['/os/os'],
    documentos: ['/os/documentos'],
    compras:    ['/compras/'],
    limpeza:    ['/limpeza/'],
    frota:      ['/frota/'],
  };
  return (MAP[key] || []).some(p => _PATH.includes(p));
}

function _cls(key) {
  return _active(key) ? ' active' : '';
}

// ── Nav definition ─────────────────────────────────────
function _buildNav() {
  const b = BASE;
  return `
  <!-- Dashboard -->
  <div class="sb-grp">
    <a href="${b}dashboard/dashboard.html" class="sb-item${_cls('dashboard')}" data-tip="Dashboard">
      <span class="sb-icon">📊</span><span class="sb-lbl">Dashboard</span>
    </a>
  </div>

  <div class="sb-sep-line"></div>

  <!-- Patrimônio -->
  <div class="sb-grp">
    <div class="sb-grp-lbl">Patrimônio</div>
    <a href="${b}ativos/ativos.html" class="sb-item${_cls('ativos')}" data-tip="Ativos">
      <span class="sb-icon">🏷️</span><span class="sb-lbl">Ativos</span>
    </a>
    <a href="${b}ativos/manutencao.html" class="sb-item${_cls('manutencao')}" data-tip="Manutenções">
      <span class="sb-icon">🔧</span><span class="sb-lbl">Manutenções</span>
    </a>
    <a href="${b}ativos/inventario.html" class="sb-item${_cls('inventario')}" data-tip="Inventário">
      <span class="sb-icon">📋</span><span class="sb-lbl">Inventário</span>
    </a>
    <a href="${b}ativos/categorias.html" class="sb-item${_cls('categorias')}" data-tip="Categorias">
      <span class="sb-icon">⚙️</span><span class="sb-lbl">Categorias</span>
    </a>
  </div>

  <div class="sb-sep-line"></div>

  <!-- Operações -->
  <div class="sb-grp">
    <div class="sb-grp-lbl">Operações</div>
    <a href="${b}os/os.html" class="sb-item${_cls('os')}" data-tip="Ordens de Serviço">
      <span class="sb-icon">📑</span><span class="sb-lbl">Ordens de Serviço</span>
    </a>
    <a href="${b}compras/compras.html" class="sb-item${_cls('compras')}" data-tip="Compras">
      <span class="sb-icon">🛒</span><span class="sb-lbl">Compras</span>
    </a>
    <a href="${b}os/documentos.html" class="sb-item${_cls('documentos')}" data-tip="Documentos">
      <span class="sb-icon">📄</span><span class="sb-lbl">Documentos</span>
    </a>
  </div>

  <div class="sb-sep-line"></div>

  <!-- Facilities -->
  <div class="sb-grp">
    <div class="sb-grp-lbl">Facilities</div>
    <a href="${b}limpeza/limpeza.html" class="sb-item${_cls('limpeza')}" data-tip="Limpeza 5S">
      <span class="sb-icon">🧹</span><span class="sb-lbl">Limpeza 5S</span>
    </a>
    <a href="${b}frota/painel-frota.html" class="sb-item${_cls('frota')}" data-tip="Frota">
      <span class="sb-icon">🚛</span><span class="sb-lbl">Frota</span>
    </a>
  </div>`;
}

// ── Sidebar HTML ───────────────────────────────────────
const _HTML = `
<aside class="siga-sidebar" id="siga-sidebar" role="navigation" aria-label="Menu principal">

  <!-- Header / Logo -->
  <div class="sb-header">
    <a href="${BASE}index.html" class="sb-logo">
      <div class="sb-logo-mark">S</div>
      <div class="sb-logo-text">
        <span class="sb-logo-name">SIGA</span>
        <span class="sb-logo-sub">Gestão de Ativos</span>
      </div>
    </a>
    <button class="sb-toggle" id="sb-toggle" aria-label="Recolher menu">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/>
      </svg>
    </button>
  </div>

  <!-- Navigation -->
  <nav class="sb-nav" id="sb-nav">
    ${_buildNav()}
  </nav>

  <!-- Footer: user + logout -->
  <div class="sb-footer">
    <div class="sb-user-row">
      <div class="sb-avatar" id="sb-avatar">?</div>
      <div class="sb-user-meta">
        <span class="sb-user-name" id="sb-uname">Carregando…</span>
        <span class="sb-user-role" id="sb-urole">—</span>
      </div>
    </div>
    <button class="sb-logout" id="sb-logout">
      <span class="sb-icon">🚪</span>
      <span class="sb-lbl">Sair</span>
    </button>
  </div>

</aside>

<!-- Mobile controls -->
<button class="sb-ham" id="sb-ham" aria-label="Abrir menu">☰</button>
<div class="sb-backdrop" id="sb-backdrop"></div>`;

// ── Inject into DOM ────────────────────────────────────
(function _inject() {
  // Insert HTML at the very start of body
  const frag = document.createRange().createContextualFragment(_HTML);
  document.body.prepend(frag);
  document.body.classList.add('has-sidebar');
})();

// ── Collapse persistence ──────────────────────────────
const _CKEY = 'siga-sb-col';

(function _initCollapse() {
  if (localStorage.getItem(_CKEY) === '1') {
    document.body.classList.add('sb-collapsed');
  }

  document.getElementById('sb-toggle')?.addEventListener('click', () => {
    const now = document.body.classList.toggle('sb-collapsed');
    localStorage.setItem(_CKEY, now ? '1' : '0');
  });
})();

// ── Mobile toggle ─────────────────────────────────────
(function _initMobile() {
  const $ham      = document.getElementById('sb-ham');
  const $backdrop = document.getElementById('sb-backdrop');

  $ham?.addEventListener('click', () => document.body.classList.toggle('sb-open'));
  $backdrop?.addEventListener('click', () => document.body.classList.remove('sb-open'));

  // Close sidebar on nav item click (mobile)
  document.querySelectorAll('.siga-sidebar .sb-item').forEach(a => {
    a.addEventListener('click', () => {
      if (window.innerWidth < 900) {
        document.body.classList.remove('sb-open');
      }
    });
  });
})();

// ── User info (async, non-blocking) ───────────────────
(async function _loadUser() {
  try {
    const { getAuthSilent, logout, ROLE_LABELS } = await import('./db-auth.js');
    const perfil = await getAuthSilent();
    if (!perfil) return;

    const name = perfil.nome || '—';
    const role = (ROLE_LABELS && ROLE_LABELS[perfil.role]) || perfil.role || '—';

    const $n = document.getElementById('sb-uname');
    const $r = document.getElementById('sb-urole');
    const $a = document.getElementById('sb-avatar');

    if ($n) $n.textContent = name;
    if ($r) $r.textContent = role;
    if ($a) $a.textContent = name.charAt(0).toUpperCase();

    document.getElementById('sb-logout')?.addEventListener('click', () => {
      if (confirm('Terminar sessão?')) logout();
    });
  } catch (e) {
    // Silently fail — sidebar still works without auth
  }
})();

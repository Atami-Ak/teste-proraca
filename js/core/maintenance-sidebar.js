/**
 * maintenance-sidebar.js — Category-based Maintenance Sidebar
 *
 * Import on any ativos/* page (AFTER sidebar.js):
 *   <script type="module" src="../js/core/maintenance-sidebar.js"></script>
 *
 * This module:
 *  1. Injects sidebar shell synchronously (no layout flash)
 *  2. Loads categories from Firestore async, fills accordion
 *  3. Highlights active category from URL ?cat= param
 *  4. Marks active sub-item (Items vs Suppliers) from URL path
 *  5. Persists expand/collapse per category in localStorage
 *  6. Follows global sidebar collapse (via CSS var(--sb-w))
 */

import { getCategories } from './db-ativos.js';
import { DEFAULT_CATEGORIES } from '../data/ativos-categorias.js';

// ── Path / URL helpers ────────────────────────────────
const _PATH  = window.location.pathname;
const _INDIR = _PATH.includes('/ativos/');
const BASE   = _INDIR ? '../' : '';

const _params    = new URLSearchParams(window.location.search);
const _activeCat = _params.get('cat');   // Firestore category ID

function _isItemsPage()     { return /\/ativos\/(ativos|ativo-form)/.test(_PATH); }
function _isSuppliersPage() { return _PATH.includes('/ativos/fornecedores'); }
function _isMaintPage()     { return _PATH.includes('/ativos/manutencao'); }

// ── Expand-state persistence ──────────────────────────
const _SKEY = 'msb-exp';

function _getExpanded() {
  try { return JSON.parse(localStorage.getItem(_SKEY)) || {}; }
  catch { return {}; }
}

function _saveExpanded(catId, val) {
  const s = _getExpanded();
  s[catId] = val;
  localStorage.setItem(_SKEY, JSON.stringify(s));
}

// ── Build accordion nav from category list ────────────
function _buildNav(categories) {
  const exp = _getExpanded();

  return categories.map(cat => {
    const isActive = cat.id === _activeCat;
    const isOpen   = isActive || !!exp[cat.id];

    const itemsCls = (isActive && _isItemsPage())     ? ' active' : '';
    const suppCls  = (isActive && _isSuppliersPage()) ? ' active' : '';
    const maintCls = (isActive && _isMaintPage())     ? ' active' : '';

    return `
    <div class="msb-cat${isActive ? ' msb-cat-active' : ''}" data-cat-id="${cat.id}">
      <button class="msb-cat-btn${isOpen ? ' open' : ''}"
              data-msb-toggle="${cat.id}"
              title="${cat.name}">
        <span class="msb-cat-dot" style="background:${cat.color || '#94a3b8'}"></span>
        <span class="msb-cat-icon">${cat.icon  || '📎'}</span>
        <span class="msb-cat-name">${cat.name}</span>
        <span class="msb-cat-count">${cat.assetCount || 0}</span>
        <span class="msb-chevron">▾</span>
      </button>
      <div class="msb-cat-sub${isOpen ? ' open' : ''}" id="msb-sub-${cat.id}">
        <a href="${BASE}ativos/ativos.html?cat=${cat.id}"
           class="msb-sub-item${itemsCls}">
          📦 Itens
        </a>
        <a href="${BASE}ativos/fornecedores.html?cat=${cat.id}"
           class="msb-sub-item${suppCls}">
          🏢 Fornecedores
        </a>
        <a href="${BASE}ativos/manutencao.html?cat=${cat.id}"
           class="msb-sub-item${maintCls}">
          🔧 Manutenções
        </a>
      </div>
    </div>`;
  }).join('');
}

// ── Sidebar shell (injected immediately) ─────────────
const _SHELL = `
<aside class="maint-sidebar" id="maint-sidebar" aria-label="Navegação de manutenção">
  <div class="msb-header">
    <span class="msb-module-label">Módulo</span>
    <span class="msb-title">Manutenção &amp; Ativos</span>
  </div>
  <nav class="msb-nav" id="msb-nav">
    <p class="msb-loading">Carregando categorias…</p>
  </nav>
  <div class="msb-footer">
    <a href="${BASE}ativos/ativo-form.html" class="msb-add-btn">
      ＋ Novo Item
    </a>
  </div>
</aside>`;

// ── Accordion toggle handler ──────────────────────────
function _bindToggles() {
  document.querySelectorAll('[data-msb-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const catId  = btn.dataset.msbToggle;
      const sub    = document.getElementById(`msb-sub-${catId}`);
      const isOpen = btn.classList.toggle('open');
      if (sub) sub.classList.toggle('open', isOpen);
      _saveExpanded(catId, isOpen);
    });
  });
}

// ── Auto-scroll active category into view ────────────
function _scrollActiveIntoView() {
  if (!_activeCat) return;
  const el = document.querySelector(`.msb-cat[data-cat-id="${_activeCat}"] .msb-cat-btn`);
  el?.scrollIntoView({ block: 'nearest' });
}

// ── Main ──────────────────────────────────────────────
(function _injectShell() {
  const frag = document.createRange().createContextualFragment(_SHELL);
  document.body.prepend(frag);
  document.body.classList.add('has-maint-sb');
})();

(async function _loadCategories() {
  const $nav = document.getElementById('msb-nav');
  if (!$nav) return;

  try {
    let cats = await getCategories();

    // Fallback: use static defaults if Firestore returns nothing
    if (!cats || cats.length === 0) {
      cats = DEFAULT_CATEGORIES.map((c, i) => ({ id: `default-${i}`, ...c, assetCount: 0 }));
    }

    $nav.innerHTML = _buildNav(cats);
    _bindToggles();
    _scrollActiveIntoView();
  } catch (err) {
    // Graceful fallback: static categories without Firestore IDs
    const cats = DEFAULT_CATEGORIES.map((c, i) => ({
      id: `default-${i}`, ...c, assetCount: 0,
    }));
    $nav.innerHTML = _buildNav(cats);
    _bindToggles();
  }
})();

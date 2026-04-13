/**
 * router.js — Navigation Helper
 *
 * Provides path-safe navigation that works on both localhost and
 * GitHub Pages (where the repo name sits before every path segment).
 *
 * Usage:
 *   import { navigateTo, buildUrl } from "../core/router.js";
 *
 *   navigateTo("os/os.html");
 *   navigateTo("auth/login.html?redirect=" + encodeURIComponent(location.href));
 *
 *   element.href = buildUrl("maquinario/maquinario.html");
 */

import { getBasePath } from "./base-path.js";

/**
 * Navigates to a path relative to the project root.
 *
 * @param {string} path  — e.g. "os/os.html" or "auth/login.html?redirect=..."
 */
export function navigateTo(path) {
  window.location.href = buildUrl(path);
}

/**
 * Returns the full URL for a path relative to the project root.
 *
 * @param {string} path  — e.g. "dashboard/dashboard.html"
 * @returns {string}
 */
export function buildUrl(path) {
  const base = getBasePath();
  return `${base}/${path.replace(/^\//, "")}`;
}

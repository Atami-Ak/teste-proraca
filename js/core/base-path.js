/**
 * base-path.js — GitHub Pages Base Path Detection
 *
 * PROBLEM:
 *   On GitHub Pages, every URL includes the repository name as the first
 *   path segment:
 *
 *     Local:  http://localhost:3000/os/os.html
 *     GHPages: https://user.github.io/teste-pr-main/os/os.html
 *
 *   Without this module, any code that counts path depth to build relative
 *   URLs (e.g. "../../auth/login.html") overcounts by 1 on GitHub Pages,
 *   producing broken links that escape the repo root.
 *
 * SOLUTION:
 *   Detect the deployment base path by checking whether the first URL
 *   segment is a known module directory or an HTML file. If it is neither,
 *   it is treated as the deployment prefix (repo name / sub-directory mount).
 *
 * WORKS ON:
 *   ✔ localhost (no prefix)
 *   ✔ GitHub Pages  (prefix = repo name)
 *   ✔ Any sub-path deployment (e.g. /myapp/...)
 */

/** All first-level directories that belong to this project. */
const KNOWN_DIRS = new Set([
  "auth",
  "maquinario",
  "frota",
  "os",
  "limpeza",
  "compras",
  "dashboard",
  "css",
  "js",
]);

/**
 * Returns the base URL for this deployment.
 *
 * Examples:
 *   Local  → "http://localhost:3000"
 *   GHPages → "https://user.github.io/teste-pr-main"
 */
export function getBasePath() {
  const { origin, pathname } = window.location;
  const parts = pathname.split("/").filter(Boolean);

  if (
    parts.length > 0 &&
    !KNOWN_DIRS.has(parts[0]) &&
    !parts[0].endsWith(".html")
  ) {
    // First segment is not a project dir → it is the deployment prefix
    return `${origin}/${parts[0]}`;
  }

  return origin;
}

/**
 * Returns the number of extra path segments introduced by the deployment
 * prefix (0 on localhost, 1 on GitHub Pages with a repo name).
 */
export function getBaseDepth() {
  const { pathname } = window.location;
  const parts = pathname.split("/").filter(Boolean);

  if (
    parts.length > 0 &&
    !KNOWN_DIRS.has(parts[0]) &&
    !parts[0].endsWith(".html")
  ) {
    return 1;
  }

  return 0;
}

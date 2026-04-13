/**
 * draft-engine.js — Fleet Inspection Draft Persistence Engine
 *
 * Pure persistence layer — no DOM, no Firebase, no UI.
 *
 * Responsibilities:
 *  - localStorage for structured form state (debounce-friendly)
 *  - IndexedDB for photo blobs (survives page refresh, survives memory limits)
 *  - Draft lifecycle: save → list → load → restore → delete
 *  - 48-hour TTL with automatic pruning on load
 *  - Storage quota and incognito detection
 *  - Corrupted JSON guard (parse-and-validate, never throw to caller)
 */

// ============================================================
// CONSTANTS
// ============================================================

export const DRAFT_PREFIX   = "frota_draft_";
export const TEMP_KEY       = "frota_draft_temp";
export const SCHEMA_VERSION = 1;
export const MAX_AGE_MS     = 48 * 60 * 60 * 1000; // 48 h

const PHOTO_DB_NAME    = "frota_photos_v1";
const PHOTO_DB_VERSION = 1;
const PHOTO_STORE      = "photos";

// ============================================================
// KEY HELPERS
// ============================================================

/**
 * Derives a deterministic localStorage key from a vehicle plate.
 * Normalizes the plate (strip spaces, uppercase) so "ABC 1234"
 * and "abc1234" produce the same key.
 */
export function draftKey(placa) {
  if (!placa) return TEMP_KEY;
  return DRAFT_PREFIX + placa.replace(/\s+/g, "").toUpperCase();
}

// ============================================================
// STORAGE CAPABILITY
// ============================================================

/**
 * Returns true if localStorage is usable (false in strict incognito / Safari ITP).
 */
export function isStorageAvailable() {
  try {
    const probe = "__frota_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// DRAFT SAVE
// ============================================================

/**
 * Saves a draft snapshot to localStorage.
 *
 * @param {string} key   — localStorage key (use draftKey() helper)
 * @param {Object} data  — serialisable form state object
 * @returns {boolean}    — true on success, false on quota exceeded
 */
export function saveDraft(key, data) {
  if (!key) return false;
  try {
    const payload = JSON.stringify({
      ...data,
      schemaVersion: SCHEMA_VERSION,
      lastUpdated:   Date.now(),
    });
    localStorage.setItem(key, payload);
    return true;
  } catch (err) {
    if (_isQuotaError(err)) {
      // Try once after pruning stale drafts
      pruneOldDrafts();
      try {
        localStorage.setItem(key, JSON.stringify({
          ...data,
          schemaVersion: SCHEMA_VERSION,
          lastUpdated:   Date.now(),
        }));
        return true;
      } catch {
        return false;
      }
    }
    console.error("[DRAFT] Save error:", err);
    return false;
  }
}

// ============================================================
// DRAFT LOAD
// ============================================================

/**
 * Loads and validates a draft from localStorage.
 * Returns null if not found, expired, or corrupted.
 * Automatically deletes corrupted entries.
 */
export function loadDraft(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    // Structural validation
    if (typeof parsed !== "object" || parsed === null) {
      localStorage.removeItem(key);
      return null;
    }
    if (!parsed.lastUpdated || typeof parsed.lastUpdated !== "number") {
      localStorage.removeItem(key);
      return null;
    }

    return parsed;
  } catch {
    // Corrupted JSON
    console.warn(`[DRAFT] Corrupted entry at "${key}" — discarding.`);
    localStorage.removeItem(key);
    return null;
  }
}

// ============================================================
// DRAFT DELETE
// ============================================================

export function deleteDraft(key) {
  if (!key) return;
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// ============================================================
// DRAFT LIST + CLEANUP
// ============================================================

/**
 * Returns all valid drafts, sorted by lastUpdated desc.
 * Silently skips corrupted or expired entries.
 */
// Machinery draft prefix (separate namespace from fleet drafts)
export const MAQ_DRAFT_PREFIX = "maq_draft_";

/**
 * Builds a localStorage key for a machinery inspection draft.
 */
export function maqDraftKey(machineId) {
  if (!machineId) return `${MAQ_DRAFT_PREFIX}temp`;
  return `${MAQ_DRAFT_PREFIX}${machineId}`;
}

export function listDrafts(prefix = DRAFT_PREFIX) {
  const results = [];
  const now = Date.now();

  // snapshot keys so pruning doesn't mutate the iterator
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith(prefix) || (prefix === DRAFT_PREFIX && k === TEMP_KEY))) keys.push(k);
  }

  for (const key of keys) {
    const draft = loadDraft(key); // handles parse errors + removes corrupt ones
    if (!draft) continue;
    if (now - draft.lastUpdated > MAX_AGE_MS) {
      localStorage.removeItem(key);
      continue;
    }
    results.push({ key, draft });
  }

  return results.sort((a, b) => (b.draft.lastUpdated || 0) - (a.draft.lastUpdated || 0));
}

/**
 * Removes all drafts older than MAX_AGE_MS.
 * Should be called once on page load.
 * @param {string} prefix — optional prefix override for scoped cleanup
 */
export function pruneOldDrafts(prefix = DRAFT_PREFIX) {
  const now  = Date.now();
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith(prefix) || (prefix === DRAFT_PREFIX && k === TEMP_KEY))) keys.push(k);
  }
  for (const key of keys) {
    const draft = loadDraft(key);
    if (!draft || now - draft.lastUpdated > MAX_AGE_MS) {
      localStorage.removeItem(key);
      _deletePhotosInDB(key); // also clean IDB
    }
  }
}

// ============================================================
// INDEXEDDB — PHOTO STORE
// ============================================================

let _photoDB   = null;
let _dbOpening = false;
let _dbQueue   = [];

/**
 * Opens (or returns cached) the IndexedDB connection.
 * Queues concurrent callers so only one open() is issued.
 */
async function _openPhotoDB() {
  if (_photoDB) return _photoDB;

  if (_dbOpening) {
    // Wait for the pending open
    return new Promise((resolve, reject) => _dbQueue.push({ resolve, reject }));
  }

  _dbOpening = true;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);

    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(PHOTO_STORE);
    };

    req.onsuccess = (e) => {
      _photoDB = e.target.result;
      _dbOpening = false;
      _dbQueue.forEach((p) => p.resolve(_photoDB));
      _dbQueue = [];
      resolve(_photoDB);
    };

    req.onerror = (e) => {
      _dbOpening = false;
      const err = e.target.error;
      _dbQueue.forEach((p) => p.reject(err));
      _dbQueue = [];
      reject(err);
    };
  });
}

/**
 * Stores a photo Blob/File in IndexedDB.
 * Key: "{draftKey}::{itemId}::{index}"
 * Fire-and-forget safe — errors are swallowed.
 */
export async function storePhoto(key, itemId, idx, blob) {
  try {
    const db = await _openPhotoDB();
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).put(blob, `${key}::${itemId}::${idx}`);
    return new Promise((res, rej) => {
      tx.oncomplete = () => res(true);
      tx.onerror    = () => rej(tx.error);
    });
  } catch (err) {
    console.warn("[DRAFT] storePhoto error:", err);
    return false;
  }
}

/**
 * Loads all photos for a draft from IndexedDB.
 * Returns Map<itemId, Blob[]> — order within each array is preserved.
 */
export async function loadPhotos(key) {
  const map = new Map();
  if (!key) return map;

  try {
    const db     = await _openPhotoDB();
    const tx     = db.transaction(PHOTO_STORE, "readonly");
    const store  = tx.objectStore(PHOTO_STORE);
    const prefix = `${key}::`;

    return new Promise((resolve) => {
      // Collect all entries, then group
      const raw = {};
      const req = store.openCursor();

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) {
          // Reconstruct map preserving insertion order
          for (const [idbKey, blob] of Object.entries(raw)) {
            const parts  = idbKey.split("::");
            if (parts.length !== 3) continue;
            const itemId = parts[1];
            const idx    = parseInt(parts[2], 10);
            if (!map.has(itemId)) map.set(itemId, []);
            map.get(itemId)[idx] = blob; // use idx to preserve order
          }
          // Compact arrays (remove holes from sparse assignments)
          map.forEach((arr, itemId) => map.set(itemId, arr.filter(Boolean)));
          resolve(map);
          return;
        }
        if (cursor.key.startsWith(prefix)) {
          raw[cursor.key] = cursor.value;
        }
        cursor.continue();
      };

      req.onerror = () => resolve(map); // non-fatal fallback
    });
  } catch (err) {
    console.warn("[DRAFT] loadPhotos error:", err);
    return map;
  }
}

/**
 * Deletes all photos for a given item in a draft from IndexedDB.
 * Call before re-storing to keep IDB in sync after removals.
 */
export async function deletePhotosForItem(key, itemId) {
  if (!key || !itemId) return;
  try {
    const db     = await _openPhotoDB();
    const tx     = db.transaction(PHOTO_STORE, "readwrite");
    const store  = tx.objectStore(PHOTO_STORE);
    const prefix = `${key}::${itemId}::`;
    return _deleteCursorByPrefix(store, prefix, tx);
  } catch { /* non-fatal */ }
}

/**
 * Deletes ALL photos for an entire draft from IndexedDB.
 */
export async function deletePhotos(key) {
  if (!key) return;
  try {
    const db     = await _openPhotoDB();
    const tx     = db.transaction(PHOTO_STORE, "readwrite");
    const store  = tx.objectStore(PHOTO_STORE);
    return _deleteCursorByPrefix(store, `${key}::`, tx);
  } catch { /* non-fatal */ }
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

function _isQuotaError(err) {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" ||
     err.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

function _deleteCursorByPrefix(store, prefix, tx) {
  return new Promise((resolve) => {
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) { resolve(); return; }
      if (cursor.key.startsWith(prefix)) cursor.delete();
      cursor.continue();
    };
    req.onerror  = () => resolve();
    tx.oncomplete = () => resolve();
  });
}

// Non-async internal helper for pruning (avoids top-level await in module body)
function _deletePhotosInDB(key) {
  deletePhotos(key).catch(() => {});
}

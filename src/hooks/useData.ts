/**
 * useData.ts — Data loading hooks
 *
 * Each hook fetches from Firestore once (if not already in store)
 * and populates the Zustand store. Components just read from the store.
 */

import { useEffect, useState } from 'react'
import { useStore } from '@/store/useStore'
import {
  getCategories, getAssets, getSuppliers, getMaintenance, seedDefaultCategories,
  getServiceOrders, getPurchaseOrders,
} from '@/lib/db'
import { DEFAULT_CATEGORIES } from '@/data/categories'
import type {
  AssetStatus, MaintenanceStatus, MaintenanceType, SupplierType,
  ServiceOrderStatus, PurchaseOrderStatus, Priority,
} from '@/types'

// ── Categories ────────────────────────────────────────

// Module-level lock: prevents concurrent bootstrap calls when multiple
// components mount simultaneously and all see categories.length === 0.
let _categoryBootstrap: Promise<void> | null = null

function deduplicateCategories<T extends { id: string; name: string }>(cats: T[]): T[] {
  // Deduplicate by name — safety net if a Firestore race condition created
  // multiple documents with the same category content (different auto-IDs).
  const seen = new Set<string>()
  return cats.filter(c => {
    const key = c.name.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function useCategories() {
  const { categories, setCategories } = useStore()
  const [loading, setLoading] = useState(categories.length === 0)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (categories.length > 0) { setLoading(false); return }
    setLoading(true)

    if (!_categoryBootstrap) {
      _categoryBootstrap = (async () => {
        let cats = await getCategories()
        if (cats.length === 0) {
          // Firestore collection is empty — seed defaults once, then re-fetch
          await seedDefaultCategories(
            DEFAULT_CATEGORIES as Parameters<typeof seedDefaultCategories>[0]
          )
          cats = await getCategories()
        }
        setCategories(deduplicateCategories(cats))
      })().finally(() => {
        _categoryBootstrap = null
      })
    }

    _categoryBootstrap
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { categories, loading, error }
}

// ── Assets ────────────────────────────────────────────

interface AssetFilters {
  categoryId?: string
  status?:     AssetStatus
  location?:   string
  forceReload?: boolean
}

export function useAssets(filters: AssetFilters = {}) {
  const { assets, setAssets } = useStore()
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const cacheKey = JSON.stringify(filters)

  useEffect(() => {
    setLoading(true)
    getAssets(filters)
      .then(setAssets)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [cacheKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return { assets, loading, error }
}

// ── Suppliers ─────────────────────────────────────────

interface SupplierFilters {
  categoryId?:  string
  type?:        SupplierType
  active?:      boolean
  forceReload?: boolean
}

export function useSuppliers(filters: SupplierFilters = {}) {
  const { suppliers, setSuppliers } = useStore()
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  const cacheKey = JSON.stringify(filters)

  useEffect(() => {
    setLoading(true)
    getSuppliers(filters)
      .then(setSuppliers)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [cacheKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return { suppliers, loading, error }
}

// ── Maintenance ───────────────────────────────────────

interface MaintFilters {
  assetId?:     string
  status?:      MaintenanceStatus
  type?:        MaintenanceType
  forceReload?: boolean
}

export function useMaintenance(filters: MaintFilters = {}) {
  const { maintenance, setMaintenance } = useStore()
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)

  const cacheKey = JSON.stringify(filters)

  useEffect(() => {
    setLoading(true)
    getMaintenance(filters)
      .then(setMaintenance)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [cacheKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return { maintenance, loading, error }
}

// ── Service Orders ────────────────────────────────────

interface ServiceOrderFilters {
  status?:      ServiceOrderStatus
  priority?:    Priority
  assetId?:     string
  forceReload?: boolean
}

export function useServiceOrders(filters: ServiceOrderFilters = {}) {
  const { serviceOrders, setServiceOrders } = useStore()
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const cacheKey = JSON.stringify(filters)

  useEffect(() => {
    setLoading(true)
    getServiceOrders(filters)
      .then(setServiceOrders)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [cacheKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return { serviceOrders, loading, error }
}

// ── Purchase Orders ───────────────────────────────────

interface PurchaseOrderFilters {
  status?:      PurchaseOrderStatus
  supplierId?:  string
  assetId?:     string
  forceReload?: boolean
}

export function usePurchaseOrders(filters: PurchaseOrderFilters = {}) {
  const { purchaseOrders, setPurchaseOrders } = useStore()
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const cacheKey = JSON.stringify(filters)

  useEffect(() => {
    setLoading(true)
    getPurchaseOrders(filters)
      .then(setPurchaseOrders)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [cacheKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return { purchaseOrders, loading, error }
}

// ── Auth ──────────────────────────────────────────────

import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc }        from 'firebase/firestore'
import { auth, db }           from '@/lib/firebase'

// Module-level flag: only one listener should ever exist.
// Prevents double-subscription when both App and AppLayout call useAuth.
let _authListenerActive = false

export function useAuth() {
  const { user, authReady, setUser, setAuthReady } = useStore()

  useEffect(() => {
    // Skip if a listener is already active (e.g. called from multiple components)
    if (_authListenerActive) return
    _authListenerActive = true

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
          if (snap.exists()) {
            setUser({ uid: firebaseUser.uid, ...snap.data() } as Parameters<typeof setUser>[0])
          } else {
            // Auth user exists but Firestore doc is missing — use minimal profile
            setUser({
              uid:   firebaseUser.uid,
              nome:  firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuário',
              email: firebaseUser.email || '',
              role:  'operador',
            })
          }
        } catch {
          // Firestore blocked (AdBlock / Brave / network error) — fallback to Auth data
          // so the app never freezes on the loading screen.
          setUser({
            uid:   firebaseUser.uid,
            nome:  firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuário',
            email: firebaseUser.email || '',
            role:  'operador',
          })
        }
      } else {
        setUser(null)
      }
      // Always mark auth as resolved — never leave the app stuck on spinner
      setAuthReady(true)
    })

    return () => {
      _authListenerActive = false
      unsub()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { user, authReady }
}

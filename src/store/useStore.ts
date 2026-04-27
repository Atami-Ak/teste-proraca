import { create } from 'zustand'
import type { Category, Asset, Supplier, MaintenanceRecord, UserProfile, ServiceOrder, PurchaseOrder } from '@/types'

interface SIGAState {
  // Auth
  user:       UserProfile | null
  authReady:  boolean

  // Data
  categories:    Category[]
  assets:        Asset[]
  suppliers:     Supplier[]
  maintenance:   MaintenanceRecord[]
  serviceOrders: ServiceOrder[]
  purchaseOrders: PurchaseOrder[]

  // UI
  activeCategoryId: string | null

  // Auth actions
  setUser:      (user: UserProfile | null) => void
  setAuthReady: (ready: boolean)           => void

  // Data setters (batch load)
  setCategories:    (cats: Category[])                => void
  setAssets:        (assets: Asset[])                 => void
  setSuppliers:     (suppliers: Supplier[])           => void
  setMaintenance:   (records: MaintenanceRecord[])    => void
  setServiceOrders: (orders: ServiceOrder[])          => void
  setPurchaseOrders:(orders: PurchaseOrder[])         => void

  // UI
  setActiveCategoryId: (id: string | null) => void

  // Optimistic updates
  upsertAsset:          (a: Asset)          => void
  removeAsset:          (id: string)        => void
  upsertSupplier:       (s: Supplier)       => void
  removeSupplier:       (id: string)        => void
  upsertMaint:          (m: MaintenanceRecord) => void
  removeMaint:          (id: string)        => void
  updateCatCount:       (id: string, delta: number) => void
  upsertServiceOrder:   (o: ServiceOrder)   => void
  removeServiceOrder:   (id: string)        => void
  upsertPurchaseOrder:  (o: PurchaseOrder)  => void
  removePurchaseOrder:  (id: string)        => void
}

export const useStore = create<SIGAState>((set) => ({
  // Auth
  user:      null,
  authReady: false,

  // Data
  categories:     [],
  assets:         [],
  suppliers:      [],
  maintenance:    [],
  serviceOrders:  [],
  purchaseOrders: [],

  // UI
  activeCategoryId: null,

  // Auth
  setUser:      user      => set({ user }),
  setAuthReady: authReady => set({ authReady }),

  // Bulk
  setCategories:     categories     => set({ categories }),
  setAssets:         assets         => set({ assets }),
  setSuppliers:      suppliers      => set({ suppliers }),
  setMaintenance:    maintenance    => set({ maintenance }),
  setServiceOrders:  serviceOrders  => set({ serviceOrders }),
  setPurchaseOrders: purchaseOrders => set({ purchaseOrders }),

  // UI
  setActiveCategoryId: activeCategoryId => set({ activeCategoryId }),

  // Optimistic — assets
  upsertAsset: asset => set(s => ({
    assets: s.assets.some(a => a.id === asset.id)
      ? s.assets.map(a => (a.id === asset.id ? asset : a))
      : [asset, ...s.assets],
  })),
  removeAsset: id => set(s => ({ assets: s.assets.filter(a => a.id !== id) })),

  // Optimistic — suppliers
  upsertSupplier: supplier => set(s => ({
    suppliers: s.suppliers.some(x => x.id === supplier.id)
      ? s.suppliers.map(x => (x.id === supplier.id ? supplier : x))
      : [supplier, ...s.suppliers],
  })),
  removeSupplier: id => set(s => ({ suppliers: s.suppliers.filter(x => x.id !== id) })),

  // Optimistic — maintenance
  upsertMaint: record => set(s => ({
    maintenance: s.maintenance.some(m => m.id === record.id)
      ? s.maintenance.map(m => (m.id === record.id ? record : m))
      : [record, ...s.maintenance],
  })),
  removeMaint: id => set(s => ({ maintenance: s.maintenance.filter(m => m.id !== id) })),

  updateCatCount: (id, delta) => set(s => ({
    categories: s.categories.map(c =>
      c.id === id ? { ...c, assetCount: Math.max(0, c.assetCount + delta) } : c
    ),
  })),

  // Optimistic — service orders
  upsertServiceOrder: order => set(s => ({
    serviceOrders: s.serviceOrders.some(o => o.id === order.id)
      ? s.serviceOrders.map(o => (o.id === order.id ? order : o))
      : [order, ...s.serviceOrders],
  })),
  removeServiceOrder: id => set(s => ({
    serviceOrders: s.serviceOrders.filter(o => o.id !== id),
  })),

  // Optimistic — purchase orders
  upsertPurchaseOrder: order => set(s => ({
    purchaseOrders: s.purchaseOrders.some(o => o.id === order.id)
      ? s.purchaseOrders.map(o => (o.id === order.id ? order : o))
      : [order, ...s.purchaseOrders],
  })),
  removePurchaseOrder: id => set(s => ({
    purchaseOrders: s.purchaseOrders.filter(o => o.id !== id),
  })),
}))

// ── Typed selectors (use these to avoid over-subscribing) ──

export const selectCategoryMap = (s: SIGAState) =>
  Object.fromEntries(s.categories.map(c => [c.id, c]))

export const selectServiceOrderMap = (s: SIGAState) =>
  Object.fromEntries(s.serviceOrders.map(o => [o.id, o]))

/**
 * checklist-engine.ts — TypeScript port of js/data/checklist-engine.js
 *
 * Pure functions: no Firebase, no side effects.
 * Builds the dynamic checklist for a vehicle based on its category.
 */

import type { Vehicle, ChecklistItem, ChecklistCategory, CapabilitySet, CategoryGroup, ChecklistStats } from '@/types/vehicle'
import { ITEM_CATALOG, MOTO_CAB_ITEMS, CATEGORY_META, CAPABILITY_RULES } from '@/data/fleet-catalog'

/**
 * Resolves which capability categories a vehicle supports.
 * Uses the first matching rule from CAPABILITY_RULES (short-circuit).
 */
export function resolveCapabilities(vehicle: Vehicle, overrides: Partial<CapabilitySet> = {}): CapabilitySet {
  for (const rule of CAPABILITY_RULES) {
    if (rule.match(vehicle)) {
      return { ...rule.capabilities, ...overrides }
    }
  }
  // Fallback: full checklist
  const full = Object.fromEntries(
    (Object.keys(ITEM_CATALOG) as ChecklistCategory[]).map(k => [k, true])
  ) as unknown as CapabilitySet
  return { ...full, ...overrides }
}

/**
 * Builds the active checklist items for a vehicle.
 *
 * @param vehicle   - from FROTA_DB
 * @param overrides - capability overrides (e.g. { advanced_lighting: true })
 * @param existing  - existing checklist to preserve answers on rebuild (merge)
 */
export function buildChecklist(
  vehicle:   Vehicle,
  overrides: Partial<CapabilitySet> = {},
  existing:  ChecklistItem[]        = [],
): ChecklistItem[] {
  const capabilities = resolveCapabilities(vehicle, overrides)
  const isMoto       = vehicle.categoria === 'Motos'

  // Build lookup from existing answers to preserve on rebuild
  const prevByItemId = new Map(existing.map(i => [i.id, i]))

  // Category order from meta
  const orderedCategories = (Object.entries(CATEGORY_META) as [ChecklistCategory, typeof CATEGORY_META[ChecklistCategory]][])
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key]) => key)

  const items: ChecklistItem[] = []

  for (const catKey of orderedCategories) {
    if (!capabilities[catKey]) continue

    const catalogItems = catKey === 'cab_internal' && isMoto
      ? MOTO_CAB_ITEMS
      : ITEM_CATALOG[catKey] ?? []

    for (const def of catalogItems) {
      const prev = prevByItemId.get(def.id)
      items.push({
        id:       def.id,
        label:    def.label,
        category: catKey,
        // Preserve previously entered answers on rebuild
        status:   prev?.status   ?? null,
        notes:    prev?.notes    ?? '',
        photos:   prev?.photos   ?? [],
        required: def.required,
      })
    }
  }

  return items
}

/**
 * Groups a flat items array by category for rendering section headers.
 */
export function groupByCategory(items: ChecklistItem[]): CategoryGroup[] {
  const groups: Record<string, CategoryGroup> = {}
  for (const item of items) {
    if (!groups[item.category]) {
      groups[item.category] = {
        key:   item.category,
        meta:  CATEGORY_META[item.category] ?? { label: item.category, icon: '📋', order: 99 },
        items: [],
      }
    }
    groups[item.category].items.push(item)
  }
  return Object.values(groups).sort((a, b) => a.meta.order - b.meta.order)
}

/**
 * Returns summary stats for a checklist.
 */
export function checklistStats(items: ChecklistItem[]): ChecklistStats {
  const total     = items.length
  const answered  = items.filter(i => i.status !== null).length
  const ncCount   = items.filter(i => i.status === 'NC').length
  const cCount    = items.filter(i => i.status === 'C').length
  const remaining = total - answered
  const pct       = total > 0 ? Math.round((answered / total) * 100) : 0
  return { total, answered, ncCount, cCount, remaining, pct }
}

/**
 * Validates the entire checklist.
 * Returns an array of error messages (empty = valid).
 */
export function validateChecklist(items: ChecklistItem[], _photoMap: Map<string, File[]>): string[] {
  const errors: string[] = []
  const unanswered = items.filter(i => i.status === null)
  if (unanswered.length > 0) {
    errors.push(`${unanswered.length} item(s) sem avaliação. Todos os itens devem ser marcados como Conforme ou Não Conforme.`)
  }

  const ncItems = items.filter(i => i.status === 'NC')
  for (const item of ncItems) {
    if (!item.notes || item.notes.trim().length < 5) {
      errors.push(`"${item.label}": descrição da NC é obrigatória (mín. 5 caracteres).`)
    }
  }

  return errors
}

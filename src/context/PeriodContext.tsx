// src/context/PeriodContext.tsx

import { createContext, useContext, useState, useMemo, useCallback } from 'react'
import type { Period, DateRange } from '@/types/dashboard'
import { getPeriodRanges }        from '@/types/dashboard'

const STORAGE_KEY = 'dashboard-period'

interface PeriodContextValue {
  period:    Period
  setPeriod: (p: Period) => void
  current:   DateRange
  prev:      DateRange
}

const PeriodContext = createContext<PeriodContextValue | null>(null)

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const VALID: Period[] = ['30d', '90d', '6m', '1a']

  const [period, setPeriodState] = useState<Period>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored !== null && (VALID as string[]).includes(stored)
      ? (stored as Period)
      : '30d'
  })

  const setPeriod = useCallback((p: Period) => {
    localStorage.setItem(STORAGE_KEY, p)
    setPeriodState(p)
  }, [])

  const ranges = useMemo(() => getPeriodRanges(period), [period])

  return (
    <PeriodContext.Provider value={{
      period,
      setPeriod,
      current: ranges.current,
      prev:    ranges.prev,
    }}>
      {children}
    </PeriodContext.Provider>
  )
}

export function usePeriod(): PeriodContextValue {
  const ctx = useContext(PeriodContext)
  if (!ctx) throw new Error('usePeriod must be used inside PeriodProvider')
  return ctx
}

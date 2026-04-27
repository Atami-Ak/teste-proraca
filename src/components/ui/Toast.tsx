import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import s from './Toast.module.css'

// ── Types ────────────────────────────────────────────────
export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id:       string
  message:  string
  variant:  ToastVariant
  duration: number
}

// ── Singleton event bus ───────────────────────────────────
type ToastListener = (toast: Omit<ToastItem, 'id'>) => void
const listeners: Set<ToastListener> = new Set()

function emit(toast: Omit<ToastItem, 'id'>) {
  listeners.forEach(fn => fn(toast))
}

// ── Public API ────────────────────────────────────────────
export const toast = {
  success: (message: string, duration = 4000) => emit({ message, variant: 'success', duration }),
  error:   (message: string, duration = 5000) => emit({ message, variant: 'error',   duration }),
  warning: (message: string, duration = 4500) => emit({ message, variant: 'warning', duration }),
  info:    (message: string, duration = 4000) => emit({ message, variant: 'info',    duration }),
}

// ── Individual toast item ─────────────────────────────────
const ICONS: Record<ToastVariant, string> = {
  success: '✅',
  error:   '🚫',
  warning: '⚠️',
  info:    'ℹ️',
}

interface ToastItemProps {
  item:    ToastItem
  onClose: (id: string) => void
}

function ToastItemEl({ item, onClose }: ToastItemProps) {
  const [exiting, setExiting] = useState(false)

  function handleClose() {
    setExiting(true)
    setTimeout(() => onClose(item.id), 280)
  }

  useEffect(() => {
    const timer = setTimeout(handleClose, item.duration)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`${s.toast} ${s[item.variant]} ${exiting ? s.exit : ''}`}
      role="alert"
      aria-live="polite"
    >
      <span className={s.icon}>{ICONS[item.variant]}</span>
      <span className={s.message}>{item.message}</span>
      <button className={s.closeBtn} onClick={handleClose} aria-label="Fechar">×</button>
      <div
        className={s.progress}
        style={{ animationDuration: `${item.duration}ms` }}
      />
    </div>
  )
}

// ── ToastContainer — mount once at root ───────────────────
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counterRef = useRef(0)

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    const listener: ToastListener = (t) => {
      const id = `toast-${++counterRef.current}`
      setToasts(prev => [...prev.slice(-4), { ...t, id }]) // max 5 visible
    }
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  if (toasts.length === 0) return null

  return createPortal(
    <div className={s.container} aria-label="Notificações">
      {toasts.map(t => (
        <ToastItemEl key={t.id} item={t} onClose={removeToast} />
      ))}
    </div>,
    document.body
  )
}

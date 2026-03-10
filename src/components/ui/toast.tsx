'use client'
import { createContext, useCallback, useContext, useState } from 'react'
import { X, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastVariant = 'success' | 'error'

interface Toast {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  let nextId = 0

  const toast = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = ++nextId
    setToasts((prev) => [...prev, { id, message, variant }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg text-sm font-medium animate-in slide-in-from-bottom-2 fade-in',
              t.variant === 'success'
                ? 'bg-white border-green-200 text-green-800'
                : 'bg-white border-red-200 text-red-800'
            )}
          >
            {t.variant === 'success'
              ? <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
              : <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />}
            <span>{t.message}</span>
            <button
              className="ml-1 rounded hover:bg-black/5 p-0.5"
              onClick={() => dismiss(t.id)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx.toast
}

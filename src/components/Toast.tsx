import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

interface ToastItem {
  id: number
  text: string
}

/** Durée d'affichage d'un message : 2,8 s, un peu plus pour un texte long (6 s au plus). */
export function toastDuration(text: string): number {
  return Math.min(6000, Math.max(2800, text.length * 65))
}

const ToastContext = createContext<(text: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setItems((cur) => [...cur.slice(-2), { id, text }])
    // un message long (nom de fichier, par exemple) reste le temps d'être lu
    window.setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), toastDuration(text))
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

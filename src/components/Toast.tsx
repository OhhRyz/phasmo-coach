import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

interface ToastItem {
  id: number
  text: string
}

const ToastContext = createContext<(text: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setItems((cur) => [...cur.slice(-2), { id, text }])
    window.setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 2800)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            <Icon name="check" size={18} />
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

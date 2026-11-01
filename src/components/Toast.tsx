import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/** Un bouton dans le message (« Annuler » après un effacement), le temps de se raviser. */
export interface ToastAction {
  label: string
  onClick: () => void
  /**
   * Le geste venait du clavier : le bouton prend le focus (le message est le dernier élément de la page, loin
   * au bout de la touche Tab) ; `restore` le rend à la page quand le message part (bouton, Échap).
   */
  focus?: boolean
  restore?: () => void
}

interface ToastItem {
  id: number
  text: string
  action?: ToastAction
}

/** Durée d'affichage d'un message : 2,8 s, un peu plus pour un texte long (6 s au plus). */
export function toastDuration(text: string): number {
  return Math.min(6000, Math.max(2800, text.length * 65))
}

/** Un message qui propose d'annuler reste plus longtemps : le temps de lire, de comprendre et de toucher le bouton. */
export const ACTION_TOAST_MS = 8000

/** Affiche un message ; renvoie de quoi le retirer avant l'heure (la page qui l'a posé se ferme, par exemple). */
type Push = (text: string, action?: ToastAction) => () => void

const ToastContext = createContext<Push>(() => () => {})

function Toast({ item, onDone }: { item: ToastItem; onDone: (id: number) => void }) {
  const timer = useRef<number | undefined>(undefined)
  const start = useCallback(
    (ms: number) => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => onDone(item.id), ms)
    },
    [item.id, onDone],
  )
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    // un message long (nom de fichier, par exemple) reste le temps d'être lu
    start(item.action ? ACTION_TOAST_MS : toastDuration(item.text))
    return () => window.clearTimeout(timer.current)
  }, [item, start])
  // venu du clavier : le bouton prend le focus (et le message attend, voir hold)
  useEffect(() => {
    if (item.action?.focus) btn.current?.focus({ preventScroll: true })
  }, [item])
  if (!item.action) return <div className="toast">{item.text}</div>
  const { label, onClick, restore } = item.action
  // survolé ou atteint au clavier, le message attend qu'on ait fini
  const hold = () => window.clearTimeout(timer.current)
  const release = () => start(3000)
  const close = () => {
    onDone(item.id)
    restore?.()
  }
  return (
    <div
      className="toast toast--action"
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocus={hold}
      onBlur={release}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        close()
      }}
    >
      <span>{item.text}</span>
      <button
        ref={btn}
        type="button"
        className="link link-btn toast-act"
        onClick={() => {
          onClick()
          close()
        }}
      >
        {label}
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const remove = useCallback((id: number) => setItems((cur) => cur.filter((t) => t.id !== id)), [])
  const push = useCallback<Push>(
    (text, action) => {
      const id = Date.now() + Math.random()
      setItems((cur) => [...cur.slice(-2), { id, text, action }])
      return () => remove(id)
    },
    [remove],
  )
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <Toast key={t.id} item={t} onDone={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { justUpdated, updateOnRouteChange, type UpdateReload } from '../engine/update'
import { useToast } from './Toast'

/**
 * Une nouvelle version de l'app attend le bon moment (voir engine/update) : arriver sur une autre page en est un,
 * la page qu'on quitte n'a plus rien à perdre. Un paramètre de l'adresse qui change (une recherche tapée, une
 * liste dépliée) n'en est pas un.
 */
export function UpdateOnNavigate() {
  const { pathname } = useLocation()
  const last = useRef(pathname)
  useEffect(() => {
    if (last.current === pathname) return
    last.current = pathname
    updateOnRouteChange()
  }, [pathname])
  return null
}

let noticeShown = false

/** Juste après le passage à la nouvelle version : une ligne pour le dire, rien de plus (une fois par chargement). */
export function UpdateNotice({ update = justUpdated }: { update?: UpdateReload | null }) {
  const toast = useToast()
  useEffect(() => {
    if (!update || noticeShown) return
    noticeShown = true
    toast('Nouvelle version installée')
  }, [toast, update])
  return null
}

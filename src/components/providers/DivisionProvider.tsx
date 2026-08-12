'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'
import { useDivisions, type Division } from '@/hooks/useDivisions'
import { queryKeys } from '@/lib/queryKeys'

const VIEW_KEY = 'mms:view_division_ids'

interface AvailableDivision {
  id: string
  name: string
  short_name: string | null
  company_id: string | null
}

interface ActiveDivisionContextValue {
  /**
   * Derived SINGLE active division for server-side RLS narrowing (JWT claim).
   * `null` = "All" — either 0 or 2+ divisions are in the view set, so the
   * server returns everything the caller can access and the client narrows the
   * displayed rows via `viewDivisionIds`. When exactly one division is in the
   * view set, that value narrows server-side exactly as before.
   */
  activeDivisionId: string | null
  /** Client-side multi-select "view" filter. Empty set = All divisions. */
  viewDivisionIds: Set<string>
  /** Divisions the user is allowed to switch INTO (active only). */
  availableDivisions: AvailableDivision[]
  /** True for Owner/Accountant — sees every active division + "All". */
  isSuperViewer: boolean
  /** True once JWT claims + division list have loaded at least once. */
  isReady: boolean
  /** True while a server division-sync is in flight. */
  isSwitching: boolean
  /** Add/remove one division from the view set (multi-select). */
  toggleViewDivision: (divisionId: string) => void
  /** Replace the whole view set. */
  setViewDivisions: (ids: string[]) => void
  /** Clear the view set → "All divisions". */
  clearViewDivisions: () => void
  /** Legacy single setter — sets the view set to {id} (or All when null). */
  setActiveDivision: (divisionId: string | null) => Promise<void>
}

const ActiveDivisionContext = createContext<ActiveDivisionContextValue | null>(null)

/** Read the active_division_id claim from the current JWT (SQL null → JS null). */
function readActiveFromJwt(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as {
      active_division_id?: string | null
    }
    const value = payload.active_division_id
    if (value === null || value === undefined || value === '') return null
    return value
  } catch {
    return null
  }
}

function readViewFromStorage(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(VIEW_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    return new Set(Array.isArray(arr) ? (arr as string[]).filter((x) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeViewToStorage(ids: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    if (ids.size === 0) window.localStorage.removeItem(VIEW_KEY)
    else window.localStorage.setItem(VIEW_KEY, JSON.stringify(Array.from(ids)))
  } catch {
    /* localStorage disabled / quota — fine, JWT + memory remain source of truth */
  }
}

export function DivisionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { isSuperViewer, userDivisionIds } = useUserDivisionScope()
  const { data: allActive = [] } = useDivisions()

  const [viewDivisionIds, setViewState] = useState<Set<string>>(readViewFromStorage)
  const [serverActiveId, setServerActiveId] = useState<string | null>(null)
  const [isSwitching, setIsSwitching] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const jwtCheckedRef = useRef(false)

  const availableDivisions = useMemo<AvailableDivision[]>(() => {
    const filtered = isSuperViewer
      ? allActive
      : allActive.filter((d) => userDivisionIds.includes(d.id))
    return filtered.map((d: Division) => ({
      id: d.id,
      name: d.name,
      short_name: d.short_name ?? null,
      company_id: d.company_id ?? null,
    }))
  }, [isSuperViewer, allActive, userDivisionIds])

  // Derived single active id for server-side RLS. One selected → that division;
  // zero or many → null ("All").
  const activeDivisionId = viewDivisionIds.size === 1 ? Array.from(viewDivisionIds)[0]! : null

  const applyView = useCallback((next: Set<string>) => {
    writeViewToStorage(next)
    setViewState(next)
  }, [])

  // Reconcile the persisted view set against the server-authoritative JWT once.
  useEffect(() => {
    if (jwtCheckedRef.current) return
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled || !session?.access_token) return
      jwtCheckedRef.current = true
      const claim = readActiveFromJwt(session.access_token)
      setServerActiveId(claim)
      // If nothing persisted, seed the view from the JWT claim so the UI matches
      // whatever the server currently narrows to.
      setViewState((prev) => (prev.size > 0 ? prev : claim ? new Set([claim]) : new Set()))
      setIsReady(true)
    })()
    return () => { cancelled = true }
  }, [])

  // Drop any view ids the user no longer has access to.
  useEffect(() => {
    if (!isReady || availableDivisions.length === 0) return
    const allowed = new Set(availableDivisions.map((d) => d.id))
    setViewState((prev) => {
      const next = new Set(Array.from(prev).filter((id) => allowed.has(id)))
      if (next.size === prev.size) return prev
      writeViewToStorage(next)
      return next
    })
  }, [isReady, availableDivisions])

  // Push the derived single active division to the server whenever it diverges
  // from the JWT — preserves the exact server-scoping behaviour of the old
  // single-division switcher.
  useEffect(() => {
    if (!isReady || activeDivisionId === serverActiveId) return
    let cancelled = false
    ;(async () => {
      setIsSwitching(true)
      try {
        const supabase = createClient()
        const { error } = await supabase.rpc('set_active_division', {
          p_division_id: activeDivisionId as unknown as string,
        })
        if (error) throw error
        const { error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError) throw refreshError
        if (cancelled) return
        setServerActiveId(activeDivisionId)
        await queryClient.invalidateQueries({ queryKey: queryKeys.userDivisionScope.jwtClaims })
        await queryClient.invalidateQueries()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to switch division')
      } finally {
        if (!cancelled) setIsSwitching(false)
      }
    })()
    return () => { cancelled = true }
  }, [isReady, activeDivisionId, serverActiveId, queryClient])

  const toggleViewDivision = useCallback((id: string) => {
    setViewState((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      writeViewToStorage(next)
      return next
    })
  }, [])

  const setViewDivisions = useCallback((ids: string[]) => { applyView(new Set(ids)) }, [applyView])
  const clearViewDivisions = useCallback(() => { applyView(new Set()) }, [applyView])
  const setActiveDivision = useCallback(
    async (divisionId: string | null) => { applyView(divisionId ? new Set([divisionId]) : new Set()) },
    [applyView],
  )

  const value = useMemo<ActiveDivisionContextValue>(() => ({
    activeDivisionId,
    viewDivisionIds,
    availableDivisions,
    isSuperViewer,
    isReady,
    isSwitching,
    toggleViewDivision,
    setViewDivisions,
    clearViewDivisions,
    setActiveDivision,
  }), [
    activeDivisionId, viewDivisionIds, availableDivisions, isSuperViewer, isReady,
    isSwitching, toggleViewDivision, setViewDivisions, clearViewDivisions, setActiveDivision,
  ])

  return (
    <ActiveDivisionContext.Provider value={value}>
      {children}
    </ActiveDivisionContext.Provider>
  )
}

export function useActiveDivision(): ActiveDivisionContextValue {
  const ctx = useContext(ActiveDivisionContext)
  if (!ctx) {
    throw new Error('useActiveDivision must be used within <DivisionProvider>')
  }
  return ctx
}

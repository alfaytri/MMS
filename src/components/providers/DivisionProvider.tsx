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

const LOCALSTORAGE_KEY = 'mms:active_division_id'

interface AvailableDivision {
  id:         string
  name:       string
  short_name: string | null
  company_id: string | null
}

interface ActiveDivisionContextValue {
  /** null = "All divisions" (super-viewer default) or "not yet chosen" (regular user auto-picked). */
  activeDivisionId:   string | null
  /** Divisions the user is allowed to switch INTO. Excludes inactive rows. */
  availableDivisions: AvailableDivision[]
  /** True for Owner/Accountant — sees "All Divisions" option + every active division. */
  isSuperViewer:      boolean
  /** True once JWT claims + division list have loaded at least once. */
  isReady:            boolean
  /** True while a switch is in flight (RPC + session refresh + query invalidate). */
  isSwitching:        boolean
  /** Set active. Pass null to clear ("All divisions"). Throws + toasts on error. */
  setActiveDivision:  (divisionId: string | null) => Promise<void>
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

function readLocalStorageHint(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LOCALSTORAGE_KEY)
    return raw && raw !== '' ? raw : null
  } catch {
    return null
  }
}

function writeLocalStorageHint(divisionId: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (divisionId === null) window.localStorage.removeItem(LOCALSTORAGE_KEY)
    else                     window.localStorage.setItem(LOCALSTORAGE_KEY, divisionId)
  } catch {
    /* localStorage disabled / quota — fine, JWT is source of truth */
  }
}

export function DivisionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  // Reuse the existing scope hook — it already parses user_type + division_ids from JWT.
  const { isSuperViewer, userDivisionIds } = useUserDivisionScope()

  // Full division list (active only), used to build the available list.
  const { data: allActive = [] } = useDivisions()

  const [activeDivisionId, setActiveDivisionState] = useState<string | null>(readLocalStorageHint)
  const [isSwitching, setIsSwitching]              = useState(false)
  const [isReady, setIsReady]                      = useState(false)
  const jwtCheckedRef = useRef(false)

  // Once JWT is available, reconcile local hint against the server-authoritative claim.
  useEffect(() => {
    if (jwtCheckedRef.current) return
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session?.access_token) {
        // Not logged in yet — the provider will re-run when a session appears.
        return
      }
      jwtCheckedRef.current = true
      const claim = readActiveFromJwt(session.access_token)
      // JWT wins. Update state + localStorage if they differ.
      if (claim !== activeDivisionId) {
        setActiveDivisionState(claim)
        writeLocalStorageHint(claim)
      }
      setIsReady(true)
    })()
    return () => { cancelled = true }
    // Intentionally only running once per mount — reconcile again after setActiveDivision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Build available list based on scope.
  const availableDivisions = useMemo<AvailableDivision[]>(() => {
    const filtered = isSuperViewer
      ? allActive
      : allActive.filter((d) => userDivisionIds.includes(d.id))
    return filtered.map((d: Division) => ({
      id:         d.id,
      name:       d.name,
      short_name: d.short_name ?? null,
      company_id: d.company_id ?? null,
    }))
  }, [isSuperViewer, allActive, userDivisionIds])

  // Guard: if the active claim references a division the user no longer has access to,
  // reset to null (which reflects "All" for super-viewers, "not chosen" for regulars).
  useEffect(() => {
    if (!isReady) return
    if (activeDivisionId === null) return
    if (availableDivisions.length === 0) return
    const stillAccessible = availableDivisions.some((d) => d.id === activeDivisionId)
    if (stillAccessible) return
    // Fire and forget — clear on the server too so the JWT catches up on next refresh.
    writeLocalStorageHint(null)
    setActiveDivisionState(null)
    void (async () => {
      const supabase = createClient()
      await supabase.rpc('set_active_division', { p_division_id: null as unknown as string })
      await supabase.auth.refreshSession()
    })()
  }, [isReady, activeDivisionId, availableDivisions])

  const setActiveDivision = useCallback(async (divisionId: string | null): Promise<void> => {
    const previous = activeDivisionId
    if (divisionId === previous) return

    // Optimistic update — instant UI response.
    setActiveDivisionState(divisionId)
    writeLocalStorageHint(divisionId)
    setIsSwitching(true)

    try {
      const supabase = createClient()
      const { error: rpcError } = await supabase.rpc('set_active_division', {
        p_division_id: divisionId as unknown as string,
      })
      if (rpcError) throw rpcError

      // Refresh session → new JWT with updated active_division_id claim.
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) throw refreshError

      // Refetch the parsed-claims cache the scope hook reads.
      await queryClient.invalidateQueries({ queryKey: queryKeys.userDivisionScope.jwtClaims })

      // Blow away every list cache — RLS filters server-side, so every fetch returns fresh data.
      await queryClient.invalidateQueries()
    } catch (err) {
      // Revert.
      setActiveDivisionState(previous)
      writeLocalStorageHint(previous)
      const message = err instanceof Error ? err.message : 'Failed to switch division'
      toast.error(message)
      throw err
    } finally {
      setIsSwitching(false)
    }
  }, [activeDivisionId, queryClient])

  const value = useMemo<ActiveDivisionContextValue>(() => ({
    activeDivisionId,
    availableDivisions,
    isSuperViewer,
    isReady,
    isSwitching,
    setActiveDivision,
  }), [activeDivisionId, availableDivisions, isSuperViewer, isReady, isSwitching, setActiveDivision])

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

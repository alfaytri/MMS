// src/app/(dashboard)/team-leader/page.tsx
'use client'

import { useState, useMemo, useEffect } from 'react'
import { Loader2, AlertTriangle, Users } from 'lucide-react'
import { isToday, parseISO } from 'date-fns'
import { useTeamLeaderIdentity, useAllTeamsForSelect } from '@/hooks/useTeamLeaderIdentity'
import { useTeamLeaderOrders } from '@/hooks/useTeamLeaderOrders'
import { useDeductOrderStock } from '@/hooks/useDeductOrderStock'
import { useGpsTracking } from '@/hooks/useGpsTracking'
import { TlHeader } from '@/components/team-leader/TlHeader'
import { TlVisitList } from '@/components/team-leader/TlVisitList'
import { OrderDetailDispatch } from '@/components/team-leader/OrderDetailDispatch'
import { TlInvoiceDialog } from '@/components/team-leader/TlInvoiceDialog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { clearDraft } from '@/lib/visitDrafts'
import type { TlVisit, OrderCompletionData } from '@/types/team-leader'

export default function TeamLeaderPage() {
  const { data: identity, isLoading: identityLoading } = useTeamLeaderIdentity()
  const isAdmin = identity?.isAdmin ?? false
  const isDivMgr = identity?.isDivisionManager ?? false
  const { data: allTeams = [] } = useAllTeamsForSelect(
    isDivMgr ? identity?.divisionIds : isAdmin ? undefined : undefined
  )

  const [adminOverride, setAdminOverride]       = useState<string | null>(null)
  const [viewMode, setViewMode]                 = useState<'today' | 'all'>('today')
  const [startedVisits, setStartedVisits]       = useState<Set<string>>(new Set())
  const [completedVisits, setCompletedVisits]   = useState<Set<string>>(new Set())
  const [activeVisit, setActiveVisit]           = useState<TlVisit | null>(null)
  const [invoiceVisit, setInvoiceVisit]         = useState<{ visit: TlVisit; data: OrderCompletionData } | null>(null)
  const [teamPickerOpen, setTeamPickerOpen]     = useState(false)
  const [pendingDivision, setPendingDivision]   = useState<string | null>(null)
  const [pendingTeamId, setPendingTeamId]       = useState<string | null>(null)

  const effectiveTeamId = adminOverride ?? identity?.teamId ?? null
  const showTeamSelector = isAdmin || (isDivMgr && allTeams.length > 1)

  // Derive unique divisions from available teams
  const divisions = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of allTeams) {
      const divName = t.division_name ?? 'Unassigned'
      if (!map.has(divName)) map.set(divName, divName)
    }
    return [...map.keys()]
  }, [allTeams])

  const hasOneDivision = divisions.length === 1

  // Auto-lock division when there's only one
  useEffect(() => {
    if (hasOneDivision && !pendingDivision) {
      setPendingDivision(divisions[0])
    }
  }, [hasOneDivision, divisions, pendingDivision])

  // Filter teams by selected division
  const filteredPickerTeams = useMemo(() => {
    if (!pendingDivision) return allTeams
    return allTeams.filter((t) => (t.division_name ?? 'Unassigned') === pendingDivision)
  }, [allTeams, pendingDivision])

  // Reset team when division changes
  useEffect(() => {
    setPendingTeamId(null)
  }, [pendingDivision])

  // Auto-open team picker on first load when admin/manager has no team pre-selected
  useEffect(() => {
    if (!identityLoading && showTeamSelector && !effectiveTeamId && allTeams.length > 0) {
      setTeamPickerOpen(true)
    }
  }, [identityLoading, showTeamSelector, effectiveTeamId, allTeams.length])

  const { data: allVisits = [], isLoading: visitsLoading } = useTeamLeaderOrders(effectiveTeamId)

  const deductStock = useDeductOrderStock()

  // Start GPS tracking when any visit is started
  const hasStartedVisit = startedVisits.size > 0
  useGpsTracking({ teamId: effectiveTeamId, enabled: hasStartedVisit })

  const filteredVisits = useMemo(() => {
    if (viewMode === 'today') {
      return allVisits.filter((v) => isToday(parseISO(v.date)))
    }
    return allVisits
  }, [allVisits, viewMode])

  const todayCount = useMemo(
    () => allVisits.filter((v) => isToday(parseISO(v.date))).length,
    [allVisits]
  )

  function handleStart(visitId: string) {
    setStartedVisits((prev) => new Set([...prev, visitId]))
  }

  function handleComplete(visitId: string) {
    setCompletedVisits((prev) => new Set([...prev, visitId]))
    setActiveVisit(null)
  }

  async function handleDialogComplete(visitId: string, data: OrderCompletionData) {
    const visit = allVisits.find((v) => v.id === visitId)
    if (!identity || !effectiveTeamId || !visit) return

    const items = Object.entries(data.inventoryUsage).flatMap(([serviceId, records]) =>
      records
        .filter((r) => r.brandVariantId && r.qtyUsed > 0)
        .map((r) => ({ serviceId, brandVariantId: r.brandVariantId, qtyUsed: r.qtyUsed }))
    )

    if (items.length > 0) {
      const result = await deductStock.mutateAsync({
        visitId, teamId: effectiveTeamId, profileId: identity.profileId, items,
      }).catch((err: Error) => {
        toast.error(err.message)
        return null
      })
      if (!result) return
    }

    await clearDraft(visitId)

    // QC visits: close and done
    if (data.visitType === 'qc') {
      handleComplete(visitId)
      toast.success('QC scores submitted')
      return
    }

    // All others: open invoice dialog
    setInvoiceVisit({ visit, data })
    setActiveVisit(null)
  }

  // Loading
  if (identityLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  // No team access — allow admins and division managers
  if (!identity?.teamId && !isAdmin && !isDivMgr) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 px-6 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <h2 className="text-lg font-semibold">No Team Assigned</h2>
        <p className="text-sm text-muted-foreground">
          You are not assigned as a team leader. Contact your administrator.
        </p>
      </div>
    )
  }

  const teamName = allTeams.find((t) => t.id === effectiveTeamId)?.name
    ?? (effectiveTeamId ? 'My Team' : 'Select a Team')

  return (
    <div className="flex flex-col h-screen bg-background">
      <TlHeader
        teamName={teamName}
        isAdmin={isAdmin}
        showTeamSelector={showTeamSelector}
        allTeams={allTeams}
        effectiveTeamId={effectiveTeamId}
        onTeamChange={setAdminOverride}
        todayCount={todayCount}
        totalCount={allVisits.length}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {visitsLoading ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <TlVisitList
          visits={filteredVisits}
          teamId={effectiveTeamId ?? ''}
          startedVisits={startedVisits}
          completedVisits={completedVisits}
          onStart={handleStart}
          onTapCard={setActiveVisit}
        />
      )}

      {/* Order detail dialog */}
      {activeVisit && identity && (
        <OrderDetailDispatch
          visit={activeVisit}
          profileId={identity.profileId}
          onComplete={handleDialogComplete}
          onClose={() => setActiveVisit(null)}
        />
      )}

      {/* Invoice dialog */}
      {invoiceVisit && identity && (
        <TlInvoiceDialog
          visit={invoiceVisit.visit}
          data={invoiceVisit.data}
          profileId={identity.profileId}
          onDone={(visitId) => {
            handleComplete(visitId)
            setInvoiceVisit(null)
          }}
          onClose={() => setInvoiceVisit(null)}
        />
      )}

      {/* Team selection popup — shown on first visit when no team is pre-selected */}
      <Dialog open={teamPickerOpen} onOpenChange={setTeamPickerOpen}>
        <DialogContent className="max-w-sm w-full mx-4 sm:mx-auto">
          <DialogHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle>Select Your Team</DialogTitle>
            <DialogDescription>
              Choose a team to view their visits and orders for today.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Division dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Division</label>
              <Select
                value={pendingDivision ?? ''}
                onValueChange={(v) => { if (v) setPendingDivision(v) }}
                disabled={hasOneDivision}
              >
                <SelectTrigger className="h-11 text-sm">
                  <SelectValue placeholder="Select division…" />
                </SelectTrigger>
                <SelectContent>
                  {divisions.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Team dropdown — only enabled after division is selected */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Team</label>
              <Select
                value={pendingTeamId ?? ''}
                onValueChange={(v) => { if (v) setPendingTeamId(v) }}
                disabled={!pendingDivision}
              >
                <SelectTrigger className="h-11 text-sm">
                  <SelectValue placeholder="Select team…" />
                </SelectTrigger>
                <SelectContent>
                  {filteredPickerTeams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full h-11"
              disabled={!pendingTeamId}
              onClick={() => {
                if (pendingTeamId) {
                  setAdminOverride(pendingTeamId)
                  setTeamPickerOpen(false)
                }
              }}
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

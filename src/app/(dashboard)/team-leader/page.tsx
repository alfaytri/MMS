// src/app/(dashboard)/team-leader/page.tsx
'use client'

import { useState, useMemo } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { isToday, parseISO } from 'date-fns'
import { useTeamLeaderIdentity, useAllTeamsForSelect } from '@/hooks/useTeamLeaderIdentity'
import { useTeamLeaderOrders } from '@/hooks/useTeamLeaderOrders'
import { useDeductOrderStock } from '@/hooks/useDeductOrderStock'
import { useGpsTracking } from '@/hooks/useGpsTracking'
import { TlHeader } from '@/components/team-leader/TlHeader'
import { TlVisitList } from '@/components/team-leader/TlVisitList'
import { OrderDetailDispatch } from '@/components/team-leader/OrderDetailDispatch'
import { TlInvoiceDialog } from '@/components/team-leader/TlInvoiceDialog'
import { toast } from 'sonner'
import { clearDraft } from '@/lib/visitDrafts'
import type { TlVisit, OrderCompletionData } from '@/types/team-leader'

export default function TeamLeaderPage() {
  const { data: identity, isLoading: identityLoading } = useTeamLeaderIdentity()
  const isAdmin = identity?.isAdmin ?? false
  const hasMultiTeam = !isAdmin && (identity?.divisionIds?.length ?? 0) > 0
  const { data: allTeams = [] } = useAllTeamsForSelect(
    isAdmin ? undefined : identity?.divisionIds
  )

  const [adminOverride, setAdminOverride]       = useState<string | null>(null)
  const [viewMode, setViewMode]                 = useState<'today' | 'all'>('today')
  const [startedVisits, setStartedVisits]       = useState<Set<string>>(new Set())
  const [completedVisits, setCompletedVisits]   = useState<Set<string>>(new Set())
  const [activeVisit, setActiveVisit]           = useState<TlVisit | null>(null)
  const [invoiceVisit, setInvoiceVisit]         = useState<{ visit: TlVisit; data: OrderCompletionData } | null>(null)

  const effectiveTeamId = adminOverride ?? identity?.teamId ?? null

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

  // No team access — allow admins and managers with divisions
  if (!identity?.teamId && !isAdmin && !hasMultiTeam) {
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
        showTeamSelector={isAdmin || (hasMultiTeam && allTeams.length > 1)}
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
    </div>
  )
}

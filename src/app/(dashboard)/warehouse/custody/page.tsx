'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronDown, ChevronRight, HandCoins, Inbox, MapPin, Package, PackageCheck,
  Send, Truck, Undo2, UserRound, Users2,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CustodyAssignDialog } from '@/components/warehouse/custody/CustodyAssignDialog'
import { CustodyReturnDialog } from '@/components/warehouse/custody/CustodyReturnDialog'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { useTeams } from '@/hooks/useTeamSubContainers'
import { usePlaces } from '@/hooks/usePlaceSubContainers'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { usePermissions } from '@/hooks/usePermissions'
import {
  usePendingCustodyAssigns,
  useAcceptCustodyAssign,
  useDispatchCustodyAssign,
  type PendingCustodyAssign,
} from '@/hooks/useCustodyMoves'
import type { Warehouse } from '@/hooks/useWarehouses'

// ─── Types ──────────────────────────────────────────────────────────────

type CustodyRow = {
  id:                              string
  name:                            string
  division_id:                     string
  division_name:                   string
  is_active:                       boolean
  responsible_person_profile_id:   string | null
  responsible_person_name:         string | null
  responsible_person_phone:        string | null
}

const QAR = new Intl.NumberFormat('en-QA', {
  style: 'currency',
  currency: 'QAR',
  maximumFractionDigits: 2,
})

// ─── Page ───────────────────────────────────────────────────────────────

export default function CustodyPage() {
  const { data: warehouses = [] } = useWarehouses({ includeVirtual: true })

  const teamsWh  = useMemo(() => warehouses.find((w) => w.warehouse_kind === 'teams'),  [warehouses])
  const placesWh = useMemo(() => warehouses.find((w) => w.warehouse_kind === 'places'), [warehouses])
  // Warehouses only — used by cards to check whether the current user is a
  // field RP of a specific source warehouse (for the Dispatch button gate).
  const realWarehouses = useMemo(() => warehouses.filter((w) => !w.is_virtual), [warehouses])

  return (
    <PageWrapper>
      <PageHeader
        title="Custody"
        description="Stock that has left the warehouse and lives with a team or at a client site. Assign from a warehouse, return unused stock, or consume on a job."
      />

      <Tabs defaultValue="teams" className="flex flex-col gap-4">
        <TabsList className="self-start">
          <TabsTrigger value="teams" className="gap-1.5">
            <Users2 className="h-3.5 w-3.5" /> Teams
          </TabsTrigger>
          <TabsTrigger value="places" className="gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> Places
          </TabsTrigger>
        </TabsList>

        <TabsContent value="teams" className="mt-0">
          <CustodyTab kind="team" virtualWhId={teamsWh?.id ?? null} realWarehouses={realWarehouses} />
        </TabsContent>
        <TabsContent value="places" className="mt-0">
          <CustodyTab kind="place" virtualWhId={placesWh?.id ?? null} realWarehouses={realWarehouses} />
        </TabsContent>
      </Tabs>
    </PageWrapper>
  )
}

// ─── Shared tab body ────────────────────────────────────────────────────

function CustodyTab({
  kind, virtualWhId, realWarehouses,
}: {
  kind:            'team' | 'place'
  virtualWhId:     string | null
  realWarehouses:  Warehouse[]
}) {
  const teams  = useTeams()
  const places = usePlaces()

  const query = kind === 'team' ? teams : places
  const rows: CustodyRow[] = useMemo(() => {
    const raw = kind === 'team' ? (teams.data ?? []) : (places.data ?? [])
    // Only surface active subs on the Custody page — deactivated ones live in Master Data only.
    return (raw as CustodyRow[]).filter((r) => r.is_active)
  }, [kind, teams.data, places.data])

  const { data: stock = [], isLoading: stockLoading } = useWarehouseStock(virtualWhId ?? undefined, null)
  const { data: pending = [] }                        = usePendingCustodyAssigns()

  const pendingBySub = useMemo(() => {
    const map = new Map<string, PendingCustodyAssign[]>()
    for (const p of pending) {
      const arr = map.get(p.to_sub_container_id) ?? []
      arr.push(p)
      map.set(p.to_sub_container_id, arr)
    }
    return map
  }, [pending])

  // Group rows by division for the section headers.
  const grouped = useMemo(() => {
    const map = new Map<string, CustodyRow[]>()
    for (const r of rows) {
      const key = r.division_name
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [rows])

  const isLoading = query.isLoading || stockLoading

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={kind === 'team' ? <Users2 className="h-6 w-6 text-muted-foreground" /> : <MapPin className="h-6 w-6 text-muted-foreground" />}
        title={kind === 'team' ? 'No teams yet' : 'No places yet'}
        description={
          kind === 'team'
            ? 'Add a team in Master Data → Teams to start assigning stock out of the warehouse.'
            : 'Add a place in Master Data → Places to track stock at off-site custody locations.'
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      {grouped.map(([divisionName, subs]) => (
        <div key={divisionName} className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{divisionName}</h3>
            <span className="text-[11px] text-muted-foreground">
              {subs.length} {kind === 'team' ? (subs.length === 1 ? 'team' : 'teams') : (subs.length === 1 ? 'place' : 'places')}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subs.map((sub) => (
              <CustodyCard
                key={sub.id}
                kind={kind}
                sub={sub}
                virtualWhId={virtualWhId}
                realWarehouses={realWarehouses}
                stockRows={stock.filter((s) => s.sub_container_id === sub.id)}
                pending={pendingBySub.get(sub.id) ?? []}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Card ───────────────────────────────────────────────────────────────

function CustodyCard({
  kind, sub, virtualWhId, realWarehouses, stockRows, pending,
}: {
  kind:           'team' | 'place'
  sub:            CustodyRow
  virtualWhId:    string | null
  realWarehouses: Warehouse[]
  stockRows:      Array<{ brand_variant_id: string; item_name: string; brand: string | null; sku: string | null; qty: number; total_value: number; unit: string }>
  pending:        PendingCustodyAssign[]
}) {
  const [expanded, setExpanded]     = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)

  const { data: profile } = useCurrentUserProfile()
  const { data: perms }   = usePermissions()
  const accept            = useAcceptCustodyAssign()
  const dispatch          = useDispatchCustodyAssign()

  const isResponsible      = !!profile?.id && profile.id === sub.responsible_person_profile_id
  const isPrivileged       = !!perms && (perms.isSystemAdmin || perms.roles.includes('inventory_manager'))
  // Server-side gate on rpc_accept_custody_assign: sub responsible person OR
  // system admin / inventory_manager. Mirror it so we only show Accept there.
  const canAccept          = isResponsible || isPrivileged
  const hasPending         = pending.length > 0

  // For each pending row, resolve whether the current user can DISPATCH it
  // (server-side gate: field RP of source WH OR privileged). We use the
  // warehouse row's responsible_persons list — same source as
  // is_field_rp_of() DB check.
  function canDispatch(fromWhId: string): boolean {
    if (isPrivileged) return true
    if (!profile?.id) return false
    const wh = realWarehouses.find((w) => w.id === fromWhId)
    if (!wh) return false
    return wh.responsible_persons.some((rp) => rp.profile_id === profile.id)
  }

  const totalValue = stockRows.reduce((sum, r) => sum + (r.total_value ?? 0), 0)
  const totalQty   = stockRows.reduce((sum, r) => sum + (r.qty ?? 0), 0)

  const kindLabel: 'Team' | 'Place' = kind === 'team' ? 'Team' : 'Place'
  const KindIcon = kind === 'team' ? Users2 : MapPin

  async function handleAccept(transfer: PendingCustodyAssign) {
    try {
      await accept.mutateAsync({
        transfer_id:             transfer.transfer_id,
        accepted_by_profile_id:  profile?.id ?? null,
        accepted_by_name:        profile?.full_name ?? null,
      })
      toast.success(`Accepted ${transfer.transfer_number} — stock is now on ${sub.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept custody')
    }
  }

  async function handleDispatch(transfer: PendingCustodyAssign) {
    try {
      await dispatch.mutateAsync({
        transfer_id:               transfer.transfer_id,
        dispatched_by_profile_id:  profile?.id ?? null,
        dispatched_by_name:        profile?.full_name ?? null,
      })
      toast.success(`Dispatched ${transfer.transfer_number} — awaiting ${sub.responsible_person_name ?? 'custodian'} to accept`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to dispatch custody request')
    }
  }

  function handleConsumeStub() {
    toast('Consume from custody', {
      description: 'The New Consumption dialog ships in Task 9 — hook up when the /consumption page lands.',
    })
  }

  return (
    <div className="rounded-lg border bg-card shadow-sm flex flex-col min-h-[10rem]">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <KindIcon className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-semibold text-sm truncate">{sub.name}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">{sub.division_name}</Badge>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-semibold tabular-nums">{QAR.format(totalValue)}</div>
            <div className="text-[10px] text-muted-foreground">
              {stockRows.length} item{stockRows.length === 1 ? '' : 's'} · {totalQty} units
            </div>
          </div>
        </div>

        {/* Responsible person */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <UserRound className="h-3 w-3 text-muted-foreground shrink-0" />
          {sub.responsible_person_name ? (
            <>
              <span className="text-foreground truncate">{sub.responsible_person_name}</span>
              {sub.responsible_person_phone && (
                <span className="text-muted-foreground">· {sub.responsible_person_phone}</span>
              )}
              {isResponsible && (
                <Badge className="text-[9px] h-4 px-1 bg-primary/10 text-primary border-0 hover:bg-primary/10">You</Badge>
              )}
            </>
          ) : (
            <span className="italic text-muted-foreground">No responsible person assigned</span>
          )}
        </div>
      </div>

      {/* Pending banner — mixes status='pending' (awaiting dispatch) and
          status='in_transit' (awaiting acceptance). Each row shows the
          action button only to users the RPC allows. */}
      {hasPending && (
        <div className="mx-4 mb-2 rounded-md border border-primary/30 bg-primary/5 p-2 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
            <Inbox className="h-3 w-3" />
            {pending.length} pending {pending.length === 1 ? 'request' : 'requests'}
          </div>
          {pending.map((p) => {
            const isRequest    = p.status === 'pending'      // needs dispatch
            const isInTransit  = p.status === 'in_transit'   // needs accept
            const dispatchOk   = isRequest   && canDispatch(p.from_warehouse_id)
            const acceptOk     = isInTransit && canAccept
            return (
              <div key={p.transfer_id} className="flex items-center justify-between gap-2 text-[11px]">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium truncate">{p.transfer_number}</span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] h-4 px-1 font-normal ${isRequest ? 'border-amber-500/40 text-amber-700 bg-amber-500/10' : 'border-blue-500/40 text-blue-700 bg-blue-500/10'}`}
                    >
                      {isRequest ? 'Awaiting dispatch' : 'In transit'}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    From {p.from_warehouse_name ?? 'warehouse'} · {p.item_count} item{p.item_count === 1 ? '' : 's'} · {p.total_qty} units
                  </div>
                </div>
                {dispatchOk ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-6 text-[10px] gap-1 shrink-0"
                    onClick={() => handleDispatch(p)}
                    disabled={dispatch.isPending}
                  >
                    <Truck className="h-3 w-3" />
                    Dispatch
                  </Button>
                ) : acceptOk ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-6 text-[10px] gap-1 shrink-0"
                    onClick={() => handleAccept(p)}
                    disabled={accept.isPending}
                  >
                    <PackageCheck className="h-3 w-3" />
                    Accept
                  </Button>
                ) : (
                  <span className="text-[10px] text-muted-foreground italic shrink-0">
                    {isRequest
                      ? `Awaiting ${p.from_warehouse_name ?? 'warehouse'} team`
                      : `Awaiting ${sub.responsible_person_name ?? 'custodian'}`}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Items expand */}
      {stockRows.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1 px-4 py-1.5 text-[11px] text-muted-foreground hover:text-foreground border-t border-b border-dashed transition-colors"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {expanded ? 'Hide items' : 'Show items'}
          </button>
          {expanded && (
            <div className="px-4 py-2 space-y-1 max-h-48 overflow-y-auto">
              {stockRows.map((r) => (
                <div key={r.brand_variant_id} className="flex items-center justify-between gap-2 text-[11px]">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.item_name}</div>
                    {r.brand && <div className="text-[10px] text-muted-foreground truncate">{r.brand}{r.sku ? ` · ${r.sku}` : ''}</div>}
                  </div>
                  <div className="text-right tabular-nums text-[11px] shrink-0">
                    <div>{r.qty} {r.unit}</div>
                    <div className="text-[10px] text-muted-foreground">{QAR.format(r.total_value ?? 0)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Empty custody hint when nothing to expand */}
      {stockRows.length === 0 && !hasPending && (
        <div className="mx-4 mb-2 flex flex-col items-center justify-center py-4 border border-dashed rounded-md text-muted-foreground">
          <Package className="h-5 w-5 mb-1 opacity-30" />
          <p className="text-[11px]">No stock in custody</p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto flex items-center justify-between gap-1 px-3 py-2 border-t bg-muted/30 rounded-b-lg">
        <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => setAssignOpen(true)}>
          <Send className="h-3 w-3" /> Request
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[11px] gap-1"
          onClick={() => setReturnOpen(true)}
          disabled={stockRows.length === 0}
        >
          <Undo2 className="h-3 w-3" /> Return
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[11px] gap-1"
          onClick={handleConsumeStub}
          disabled={stockRows.length === 0}
        >
          <HandCoins className="h-3 w-3" /> Consume
        </Button>
      </div>

      {/* Dialogs */}
      <CustodyAssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        destSubId={sub.id}
        destSubName={sub.name}
        destKindLabel={kindLabel}
      />
      {virtualWhId && (
        <CustodyReturnDialog
          open={returnOpen}
          onOpenChange={setReturnOpen}
          sourceSubId={sub.id}
          sourceSubName={sub.name}
          sourceWhId={virtualWhId}
          sourceKindLabel={kindLabel}
        />
      )}
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronDown, ChevronRight, HandCoins, Inbox, Package, PackageCheck,
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
import { AcceptCustodyDialog } from '@/components/warehouse/custody/AcceptCustodyDialog'
import { NewConsumptionDialog } from '@/components/consumption/NewConsumptionDialog'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { useCustodyLocations, type CustodyLocationRow } from '@/hooks/useCustodyLocations'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { usePermissions, useCanCreateConsumptionFor } from '@/hooks/usePermissions'
import {
  usePendingCustodyAssigns,
  useDispatchCustodyAssign,
  type PendingCustodyAssign,
} from '@/hooks/useCustodyMoves'
import type { Warehouse } from '@/hooks/useWarehouses'

const QAR = new Intl.NumberFormat('en-QA', {
  style: 'currency',
  currency: 'QAR',
  maximumFractionDigits: 2,
})

// ─── Page ───────────────────────────────────────────────────────────────

export default function CustodyPage() {
  const { data: warehouses = [] } = useWarehouses({ includeVirtual: true })
  const { data: perms } = usePermissions()
  const { data: profile } = useCurrentUserProfile()
  // All custody locations across every custody warehouse. Used to light up a
  // warehouse for a user who is the Responsible Person of a location inside it,
  // even when their role holds no custody.<id>.* grant.
  const allLocations = useCustodyLocations()

  const custodyWhs = useMemo(
    () => warehouses.filter((w) => w.warehouse_kind === 'custody'),
    [warehouses],
  )
  // Warehouses only — used by cards to check whether the current user is a
  // field RP of a specific source warehouse (for the Dispatch button gate).
  const realWarehouses = useMemo(() => warehouses.filter((w) => !w.is_virtual), [warehouses])

  // Warehouses where the current user is the RP of at least one ACTIVE location.
  // Being an RP is a data assignment, not a permission — but a custodian must be
  // able to see (and accept into) their own location without an explicit grant.
  const rpWarehouseIds = useMemo(() => {
    const s = new Set<string>()
    if (profile?.id) {
      for (const r of allLocations.data ?? []) {
        if (r.is_active && r.responsible_person_profile_id === profile.id) s.add(r.warehouse_id)
      }
    }
    return s
  }, [allLocations.data, profile?.id])

  // "Full" visibility = system-admin OR an explicit custody.<id>.view/edit/manage
  // grant → the user sees the WHOLE warehouse (every location/division in it).
  const hasFullView = useMemo(() => {
    return (whId: string): boolean => {
      if (!perms) return false
      if (perms.isSystemAdmin) return true
      return ['view', 'edit', 'manage'].some((v) => perms.permissions.includes(`custody.${whId}.${v}`))
    }
  }, [perms])
  // A warehouse tab shows when the user has full view OR is an RP inside it.
  const canView = useMemo(() => {
    return (whId: string): boolean => hasFullView(whId) || rpWarehouseIds.has(whId)
  }, [hasFullView, rpWarehouseIds])
  const canEdit = useMemo(() => {
    return (whId: string): boolean => {
      if (!perms) return false
      if (perms.isSystemAdmin) return true
      return ['edit', 'manage'].some((v) => perms.permissions.includes(`custody.${whId}.${v}`))
    }
  }, [perms])

  const visibleWhs = useMemo(() => custodyWhs.filter((w) => canView(w.id)), [custodyWhs, canView])
  const defaultTab = visibleWhs[0]?.id ?? ''

  return (
    <PageWrapper>
      <PageHeader
        title="Custody"
        description="Stock that has left the warehouse and lives with a team or at a project / client site. Assign from a warehouse, return unused stock, or consume on a job."
      />

      {visibleWhs.length === 0 ? (
        <EmptyState
          icon={<Users2 className="h-6 w-6 text-muted-foreground" />}
          title="No custody warehouses"
          description="Create a Custody-type warehouse in Master Data → Warehouses, then add locations to it — or ask an admin to grant you access to one."
        />
      ) : (
        <Tabs defaultValue={defaultTab} className="flex flex-col gap-4">
          <TabsList className="self-start max-w-full overflow-x-auto">
            {visibleWhs.map((w) => (
              <TabsTrigger key={w.id} value={w.id} className="gap-1.5">
                <Users2 className="h-3.5 w-3.5" /> {w.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {visibleWhs.map((w) => (
            <TabsContent key={w.id} value={w.id} className="mt-0">
              <CustodyTab
                warehouseId={w.id}
                warehouseName={w.name}
                canEdit={canEdit(w.id)}
                realWarehouses={realWarehouses}
                restrictToOwn={!hasFullView(w.id)}
                ownProfileId={profile?.id ?? null}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </PageWrapper>
  )
}

// ─── Shared tab body ────────────────────────────────────────────────────

function CustodyTab({
  warehouseId, warehouseName, canEdit, realWarehouses, restrictToOwn, ownProfileId,
}: {
  warehouseId:    string
  warehouseName:  string
  canEdit:        boolean
  realWarehouses: Warehouse[]
  restrictToOwn:  boolean
  ownProfileId:   string | null
}) {
  const locations = useCustodyLocations(warehouseId)
  const rows: CustodyLocationRow[] = useMemo(
    // Only surface active locations on the Custody page — deactivated ones live in Master Data only.
    // When the user reaches this warehouse purely as an RP (no full-view grant),
    // restrict the cards to the location(s) they are personally responsible for.
    () => (locations.data ?? []).filter(
      (r) => r.is_active && (!restrictToOwn || r.responsible_person_profile_id === ownProfileId),
    ),
    [locations.data, restrictToOwn, ownProfileId],
  )

  const { data: stock = [], isLoading: stockLoading } = useWarehouseStock(warehouseId, null)
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
    const map = new Map<string, CustodyLocationRow[]>()
    for (const r of rows) {
      const key = r.division_name ?? 'Unassigned'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [rows])

  const isLoading = locations.isLoading || stockLoading

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
        icon={<Users2 className="h-6 w-6 text-muted-foreground" />}
        title={restrictToOwn ? 'No custody assigned to you' : `No locations in ${warehouseName} yet`}
        description={
          restrictToOwn
            ? `Stock you're responsible for in ${warehouseName} will appear here once a location is assigned to you.`
            : `Add a location in Master Data → Custody Locations to start assigning stock into ${warehouseName}.`
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
              {subs.length} location{subs.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subs.map((sub) => (
              <CustodyCard
                key={sub.id}
                sub={sub}
                warehouseId={warehouseId}
                warehouseName={warehouseName}
                canEdit={canEdit}
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
  sub, warehouseId, warehouseName, canEdit, realWarehouses, stockRows, pending,
}: {
  sub:            CustodyLocationRow
  warehouseId:    string
  warehouseName:  string
  canEdit:        boolean
  realWarehouses: Warehouse[]
  stockRows:      Array<{ brand_variant_id: string; item_name: string; brand: string | null; sku: string | null; qty: number; total_value: number; unit: string }>
  pending:        PendingCustodyAssign[]
}) {
  const [expanded, setExpanded]     = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [consumeOpen, setConsumeOpen] = useState(false)

  const { data: profile } = useCurrentUserProfile()
  const { data: perms }   = usePermissions()
  const dispatch          = useDispatchCustodyAssign()
  const [acceptRow, setAcceptRow] = useState<PendingCustodyAssign | null>(null)

  const canCreateConsumption = useCanCreateConsumptionFor('custody')

  const isResponsible      = !!profile?.id && profile.id === sub.responsible_person_profile_id
  const isPrivileged       = !!perms && (perms.isSystemAdmin || perms.roles.includes('inventory_manager'))
  // Server-side gate on rpc_accept_custody_assign: sub responsible person OR
  // system admin / inventory_manager. Mirror it so we only show Accept there.
  const canAccept          = isResponsible || isPrivileged
  const hasPending         = pending.length > 0

  // A location's RP can act on their OWN card without any custody/consumption
  // grant: every underlying RPC authorises the sub's responsible person directly
  // (rpc_create_custody_assign → dest RP, rpc_create_custody_return → source RP,
  // rpc_post_consumption → source-sub RP; all verified against the live bodies).
  const canRequest = canEdit || isResponsible
  const canReturn  = canEdit || isResponsible
  const canConsume = canCreateConsumption || isResponsible

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

  return (
    <div className="rounded-lg border bg-card shadow-sm flex flex-col min-h-[10rem] min-w-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Users2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-semibold text-sm truncate">{sub.name}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">{sub.division_name ?? 'Unassigned'}</Badge>
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
              <div key={p.transfer_id} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 text-[11px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium break-all">{p.transfer_number}</span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] h-4 px-1 font-normal shrink-0 ${isRequest ? 'border-amber-500/40 text-amber-700 bg-amber-500/10' : 'border-blue-500/40 text-blue-700 bg-blue-500/10'}`}
                    >
                      {isRequest ? 'Awaiting dispatch' : 'In transit'}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground break-words">
                    From {p.from_warehouse_name ?? 'warehouse'} · {p.item_count} item{p.item_count === 1 ? '' : 's'} · {p.total_qty} units
                  </div>
                </div>
                {dispatchOk ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-11 sm:h-6 text-[10px] gap-1 w-full sm:w-auto justify-center shrink-0"
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
                    className="h-11 sm:h-6 text-[10px] gap-1 w-full sm:w-auto justify-center shrink-0"
                    onClick={() => setAcceptRow(p)}
                  >
                    <PackageCheck className="h-3 w-3" />
                    Accept
                  </Button>
                ) : (
                  <span className="text-[10px] text-muted-foreground italic sm:shrink-0 sm:text-right">
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
            <div className="px-4 py-2 space-y-2 max-h-48 overflow-y-auto">
              {stockRows.map((r) => (
                <div key={r.brand_variant_id} className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-2 text-[11px]">
                  <div className="min-w-0">
                    <div className="font-medium break-words">{r.item_name}</div>
                    {r.brand && <div className="text-[10px] text-muted-foreground break-words">{r.brand}{r.sku ? ` · ${r.sku}` : ''}</div>}
                  </div>
                  <div className="flex items-baseline gap-1.5 tabular-nums text-[11px] shrink-0 sm:flex-col sm:items-end sm:gap-0 sm:text-right">
                    <span className="text-foreground">{r.qty} {r.unit}</span>
                    <span className="text-[10px] text-muted-foreground">{QAR.format(r.total_value ?? 0)}</span>
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

      {/* Actions — hidden entirely when the caller can't do any of them */}
      {(canRequest || canReturn || canConsume) && (
        <div className="mt-auto flex items-center gap-1 px-3 py-2 border-t bg-muted/30 rounded-b-lg">
          {canRequest && (
            <Button size="sm" variant="ghost" className="h-11 sm:h-7 flex-1 min-w-0 justify-center text-[11px] gap-1" onClick={() => setAssignOpen(true)}>
              <Send className="h-3 w-3 shrink-0" /> Request
            </Button>
          )}
          {canReturn && (
            <Button
              size="sm"
              variant="ghost"
              className="h-11 sm:h-7 flex-1 min-w-0 justify-center text-[11px] gap-1"
              onClick={() => setReturnOpen(true)}
              disabled={stockRows.length === 0}
            >
              <Undo2 className="h-3 w-3 shrink-0" /> Return
            </Button>
          )}
          {canConsume && (
            <Button
              size="sm"
              variant="ghost"
              className="h-11 sm:h-7 flex-1 min-w-0 justify-center text-[11px] gap-1"
              onClick={() => setConsumeOpen(true)}
              disabled={stockRows.length === 0}
            >
              <HandCoins className="h-3 w-3 shrink-0" /> Consume
            </Button>
          )}
        </div>
      )}

      {/* Dialogs */}
      <CustodyAssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        destSubId={sub.id}
        destSubName={sub.name}
        destKindLabel={warehouseName}
      />
      <CustodyReturnDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        sourceSubId={sub.id}
        sourceSubName={sub.name}
        sourceWhId={warehouseId}
        sourceKindLabel={warehouseName}
      />
      <NewConsumptionDialog
        open={consumeOpen}
        onOpenChange={setConsumeOpen}
        presetSource={{
          warehouseId:      warehouseId,
          subContainerId:   sub.id,
          subContainerName: sub.name,
          kindLabel:        'Custody',
        }}
        restrictConsumerTypes={['custody']}
      />
      <AcceptCustodyDialog
        open={!!acceptRow}
        onOpenChange={(o) => { if (!o) setAcceptRow(null) }}
        transferId={acceptRow?.transfer_id ?? null}
        transferNumber={acceptRow?.transfer_number ?? null}
        destSubName={sub.name}
        sourceWarehouseName={acceptRow?.from_warehouse_name ?? null}
      />
    </div>
  )
}

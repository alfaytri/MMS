'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  CheckCircle2, Clock, XCircle, ChevronDown, ChevronRight,
  Milestone, User, AlertCircle, ArrowDownUp,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  useInventoryCheck,
  useInventoryCheckAssignments,
  useInventoryCheckLog,
  useInventoryCheckApprovals,
  useInventoryCheckGeneratedSAs,
  usePostCountMovements,
  useWarehouseStock,
  useSaveItemCount,
  useCompleteAssignment,
  useApproveCheckStep,
} from '@/hooks/useWarehouseOperations'
import type { InventoryCheck, InventoryCheckItem, PostCountMovement } from '@/hooks/useWarehouseOperations'
import { cn } from '@/lib/utils'
import { ItemTreeCell } from './ItemTreeCell'
import type { Profile } from '@/hooks/useProfiles'
import { format } from 'date-fns'
import { toast } from 'sonner'

// ─── Movement type labels ─────────────────────────────────────────────────────

const MOVEMENT_LABELS: Record<string, string> = {
  purchase_receival: 'Purchase Receival',
  sale_delivery: 'Sale Delivery',
  adjustment: 'Adjustment',
  transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out',
  cost_adjustment: 'Cost Adjustment',
  free_receival: 'Free Receival',
  sale_return: 'Sale Return',
  purchase_return: 'Purchase Return',
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  in_progress:     'bg-blue-500/10 text-blue-600',
  pending_approval:'bg-warning/10 text-warning',
  approved:        'bg-success/10 text-success',
  rejected:        'bg-destructive/10 text-destructive',
  submitted:       'bg-warning/10 text-warning',
  draft:           'bg-muted text-muted-foreground',
}

function statusLabel(s: string) {
  return {
    in_progress:     'In Progress',
    pending_approval:'Pending Approval',
    approved:        'Approved',
    rejected:        'Rejected',
    submitted:       'Submitted',
    draft:           'Draft',
  }[s] ?? s
}

// ─── Timeline tab ─────────────────────────────────────────────────────────────

function EventIcon({ type }: { type: string }) {
  if (type === 'initialized')     return <Milestone   className="h-3.5 w-3.5 text-primary" />
  if (type === 'user_completed')  return <CheckCircle2 className="h-3.5 w-3.5 text-success" />
  if (type === 'all_counted')     return <CheckCircle2 className="h-3.5 w-3.5 text-success" />
  if (type === 'approved')        return <CheckCircle2 className="h-3.5 w-3.5 text-success" />
  if (type === 'rejected')        return <XCircle      className="h-3.5 w-3.5 text-destructive" />
  if (type === 'approval_action') return <User         className="h-3.5 w-3.5 text-primary" />
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />
}

function eventLabel(type: string, meta?: Record<string, unknown> | null) {
  const map: Record<string, string> = {
    initialized:     'Check initialized',
    user_completed:  'Completed their count',
    all_counted:     'All counters done — moved to approval',
    approved:        'Check approved',
    rejected:        'Check rejected',
    approval_action: `${(meta?.action as string) === 'approved' ? 'Approved' : 'Rejected'} (approval step)`,
  }
  return map[type] ?? type
}

// ─── Tree item row ─────────────────────────────────────────────────────────────

function ItemCountRow({
  item,
  checkId: _checkId,
  readOnly,
  countMap,
  varianceTypeMap,
  itemType,
  onCountChange,
  onVarianceTypeChange,
}: {
  item: InventoryCheckItem
  checkId: string
  readOnly: boolean
  countMap: Map<string, string>
  varianceTypeMap: Map<string, string>
  itemType?: string | null
  onCountChange: (id: string, val: string) => void
  onVarianceTypeChange: (id: string, val: string) => void
}) {
  const countedStr = countMap.get(item.id) ?? (item.counted_qty != null ? String(item.counted_qty) : '')
  const counted    = countedStr !== '' ? parseFloat(countedStr) : null
  const variance   = counted !== null ? counted - item.system_qty : (item.variance ?? null)
  const isCounted  = item.is_counted || countedStr !== ''
  const rowBg      = !isCounted ? '' : variance === 0 ? 'bg-success/5' : 'bg-warning/5'

  return (
    <div className={`grid grid-cols-[1fr_60px_60px_90px_80px_90px] gap-2 items-center px-3 py-1.5 border-b text-xs ${rowBg}`}>
      {/* Item (category → item → brand) */}
      <ItemTreeCell
        category={item.category_name}
        itemType={itemType}
        itemName={item.item_name}
        brand={item.brand}
      />

      {/* SKU */}
      <span className="text-[10px] text-muted-foreground truncate">{item.sku ?? '—'}</span>

      {/* System qty */}
      <span className="text-right tabular-nums">{item.system_qty}</span>

      {/* Count input or static */}
      {readOnly ? (
        <span className="text-right tabular-nums">{item.counted_qty ?? '—'}</span>
      ) : (
        <Input
          type="text"
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          className="h-7 text-xs text-right w-full"
          value={countedStr}
          onChange={(e) => {
            const v = e.target.value
            if (v === '' || /^\d*\.?\d*$/.test(v)) onCountChange(item.id, v)
          }}
        />
      )}

      {/* Variance */}
      <span className={`text-right tabular-nums ${variance === null ? 'text-muted-foreground' : variance > 0 ? 'text-success' : variance < 0 ? 'text-destructive' : ''}`}>
        {variance === null ? '—' : variance > 0 ? `+${variance}` : variance}
      </span>

      {/* Variance type — only when there's a negative variance and not read-only */}
      {!readOnly && variance !== null && variance !== 0 ? (
        <Select
          value={varianceTypeMap.get(item.id) ?? ''}
          onValueChange={(v) => onVarianceTypeChange(item.id, v ?? '')}
        >
          <SelectTrigger className="h-7 text-[10px]">
            <SelectValue placeholder="Type…" />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto">
            <SelectItem value="increase"  className="text-[10px]">Increase</SelectItem>
            <SelectItem value="decrease"  className="text-[10px]">Decrease</SelectItem>
            <SelectItem value="damage"    className="text-[10px]">Damage</SelectItem>
            <SelectItem value="write_off" className="text-[10px]">Write-off</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <span className="text-[10px] text-muted-foreground">
          {item.variance_type ? item.variance_type.replace(/_/g, ' ') : ''}
        </span>
      )}
    </div>
  )
}

// ─── Counting tab for one user's assignment ───────────────────────────────────

function CountingPanel({
  checkId,
  items,
  assignmentId,
  currentProfile,
  readOnly,
  itemTypeMap,
}: {
  checkId: string
  items: InventoryCheckItem[]
  assignmentId: string | null
  currentProfile: Profile | null
  readOnly: boolean
  itemTypeMap?: Map<string, string | null>
}) {
  const [countMap, setCountMap]               = useState<Map<string, string>>(new Map())
  const [varianceTypeMap, setVarianceTypeMap] = useState<Map<string, string>>(new Map())
  const [saving, setSaving]                   = useState(false)
  const [completing, setCompleting]           = useState(false)
  const saveCount                             = useSaveItemCount()
  const completeAssignment                    = useCompleteAssignment()

  const grouped = useMemo(() => {
    const catMap = new Map<string, InventoryCheckItem[]>()
    for (const item of items) {
      const cat = item.category_name ?? '(No category)'
      if (!catMap.has(cat)) catMap.set(cat, [])
      catMap.get(cat)!.push(item)
    }
    return catMap
  }, [items])

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(grouped.keys()))

  const countedCount    = items.filter((i) => i.is_counted || countMap.has(i.id)).length
  const hasAnyNewCounts = countMap.size > 0

  async function handleSave() {
    setSaving(true)
    try {
      for (const [itemId, countedStr] of countMap.entries()) {
        if (countedStr === '') continue
        await saveCount.mutateAsync({
          itemId,
          checkId,
          countedQty:   parseFloat(countedStr),
          varianceType: varianceTypeMap.get(itemId) ?? null,
        })
      }
      setCountMap(new Map())
      toast.success('Counts saved')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleComplete() {
    if (!assignmentId) return
    setCompleting(true)
    try {
      // Save unsaved counts first
      for (const [itemId, countedStr] of countMap.entries()) {
        if (countedStr === '') continue
        await saveCount.mutateAsync({
          itemId,
          checkId,
          countedQty:   parseFloat(countedStr),
          varianceType: varianceTypeMap.get(itemId) ?? null,
        })
      }
      await completeAssignment.mutateAsync({
        assignmentId,
        checkId,
        profileId:   currentProfile?.id ?? null,
        profileName: currentProfile?.full_name ?? 'Unknown',
      })
      toast.success('Your count is complete!')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to complete')
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {countedCount} / {items.length} items counted
        </p>
        {!readOnly && hasAnyNewCounts && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save counts'}
          </Button>
        )}
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_60px_60px_90px_80px_90px] gap-2 px-3 py-1.5 bg-muted/30 border rounded-t-md text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Item</span>
        <span>SKU</span>
        <span className="text-right">System</span>
        <span className="text-right">Counted</span>
        <span className="text-right">Variance</span>
        <span>Type</span>
      </div>

      <div className="border rounded-b-md overflow-hidden overflow-y-auto max-h-[300px] -mt-1">
        {Array.from(grouped.entries()).map(([cat, catItems]) => {
          const isOpen = expandedCats.has(cat)
          return (
            <React.Fragment key={cat}>
              <div
                className="flex items-center gap-2 px-3 py-1.5 bg-muted/20 cursor-pointer hover:bg-muted/40 border-b text-xs font-semibold"
                onClick={() => setExpandedCats((prev) => {
                  const n = new Set(prev)
                  if (n.has(cat)) { n.delete(cat) } else { n.add(cat) }
                  return n
                })}
              >
                {isOpen
                  ? <ChevronDown  className="h-3 w-3 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                {cat}
                {(() => {
                  const catType = itemTypeMap?.get(catItems[0]?.brand_variant_id) ?? null
                  const TYPE_LABELS: Record<string, string> = { 'products': 'Products', 'spare-parts': 'Spare Parts', 'consumables': 'Consumables', 'tools': 'Tools' }
                  return catType && TYPE_LABELS[catType] ? (
                    <span className="text-[9px] font-normal text-muted-foreground border border-border rounded px-1 py-0.5">
                      {TYPE_LABELS[catType]}
                    </span>
                  ) : null
                })()}
                <span className="text-[10px] font-normal text-muted-foreground ml-1">
                  {catItems.filter((i) => i.is_counted || countMap.has(i.id)).length}/{catItems.length}
                </span>
              </div>
              {isOpen && catItems.map((item) => (
                <ItemCountRow
                  key={item.id}
                  item={item}
                  checkId={checkId}
                  readOnly={readOnly}
                  countMap={countMap}
                  varianceTypeMap={varianceTypeMap}
                  itemType={itemTypeMap?.get(item.brand_variant_id)}
                  onCountChange={(id, v) => setCountMap((m) => { const n = new Map(m); n.set(id, v); return n })}
                  onVarianceTypeChange={(id, v) => setVarianceTypeMap((m) => { const n = new Map(m); n.set(id, v); return n })}
                />
              ))}
            </React.Fragment>
          )
        })}
      </div>

      {!readOnly && assignmentId && (
        <div className="flex justify-end">
          <Button
            size="sm"
            className="text-xs bg-success text-success-foreground hover:bg-success/90"
            onClick={handleComplete}
            disabled={completing}
          >
            {completing ? 'Completing…' : 'Mark my count as complete'}
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Main detail dialog ───────────────────────────────────────────────────────

interface Props {
  check: InventoryCheck
  open: boolean
  onClose: () => void
  currentProfile: Profile | null
}

export function WhInventoryCheckDetail({ check, open, onClose, currentProfile }: Props) {
  const [reviewNotes, setReviewNotes] = useState('')
  const [approvingStep, setApprovingStep] = useState<string | null>(null)
  const [expandedAssignments, setExpandedAssignments] = useState<Set<string>>(new Set())

  function toggleAssignment(id: string) {
    setExpandedAssignments((prev) => {
      const n = new Set(prev)
      if (n.has(id)) { n.delete(id) } else { n.add(id) }
      return n
    })
  }

  const { data: detail }      = useInventoryCheck(check.id)
  const { data: assignments = [] } = useInventoryCheckAssignments(check.id)
  const { data: logEntries = [] }  = useInventoryCheckLog(check.id)
  const { data: approvals = [] }   = useInventoryCheckApprovals(check.id)
  const { data: generatedSAs = [] } = useInventoryCheckGeneratedSAs(check.id)
  const approveStep                = useApproveCheckStep()

  const items = detail?.items ?? []

  const countCompletedAt = useMemo(() => {
    const allCountedEntry = logEntries.find((e) => e.event_type === 'all_counted')
    return allCountedEntry?.created_at ?? null
  }, [logEntries])

  const approvedAt = useMemo(() => {
    if (check.reviewed_at) return check.reviewed_at
    if (check.status === 'approved' && approvals.length > 0) {
      const lastStep = [...approvals].reverse().find(s => s.status === 'approved')
      if (lastStep?.action_at) return lastStep.action_at
    }
    return null
  }, [check.reviewed_at, check.status, approvals])

  const { data: postCountMovements = [] } = usePostCountMovements(
    check.id,
    check.warehouse_id,
    countCompletedAt,
    approvedAt,
  )

  const postCountByVariant = useMemo(() => {
    const map = new Map<string, PostCountMovement[]>()
    for (const m of postCountMovements) {
      if (!map.has(m.brand_variant_id)) map.set(m.brand_variant_id, [])
      map.get(m.brand_variant_id)!.push(m)
    }
    return map
  }, [postCountMovements])

  // Live stock for the check's warehouse — used in reconciliation table
  const { data: liveStock = [] } = useWarehouseStock(check.warehouse_id)
  const liveStockMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of liveStock) map.set(s.brand_variant_id, s.qty)
    return map
  }, [liveStock])

  // item_type lookup from stock view (check items don't store item_type)
  const itemTypeMap = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const s of liveStock) {
      if (!map.has(s.brand_variant_id)) map.set(s.brand_variant_id, s.item_type ?? null)
    }
    return map
  }, [liveStock])

  // Current user's assignment (if any)
  const myAssignment = assignments.find((a) => a.profile_id === currentProfile?.id)
  const checkDone = check.status === 'approved' || check.status === 'pending_approval' || check.status === 'completed'
  const isInitiator = currentProfile?.id === check.initiated_by_profile_id
  const canSeeAll = isInitiator || !myAssignment

  // Group items by assignment for manager view
  // Primary: match by assignment_id. Fallback: match by assigned_profile_id.
  const byAssignment = useMemo(() => {
    const itms = detail?.items ?? []
    const map = new Map<string, InventoryCheckItem[]>()
    for (const a of assignments) { map.set(a.id, []) }
    const unmatched: InventoryCheckItem[] = []
    for (const item of itms) {
      if (item.assignment_id && map.has(item.assignment_id)) {
        map.get(item.assignment_id)!.push(item)
      } else {
        unmatched.push(item)
      }
    }
    for (const item of unmatched) {
      const match = assignments.find((a) => a.profile_id === item.assigned_profile_id)
      if (match) {
        map.get(match.id)!.push(item)
      }
    }
    return map
  }, [detail?.items, assignments])

  const activeApprovalStep = approvals.find((s) => s.status === 'pending')

  // Controlled tab state — set once per check open; doesn't react to async data changes
  const [activeTab, setActiveTab] = useState('timeline')
  useEffect(() => {
    if (myAssignment?.status === 'pending' || myAssignment?.status === 'in_progress') {
      setActiveTab('count')
    } else if (check.status === 'pending_approval' && canSeeAll) {
      setActiveTab('approval')
    } else if (check.status === 'pending_approval' && myAssignment) {
      setActiveTab('count')
    } else {
      setActiveTab('timeline')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check.id])

  async function handleApproval(approvalId: string, action: 'approved' | 'rejected') {
    setApprovingStep(approvalId)
    try {
      await approveStep.mutateAsync({
        approvalId,
        checkId:     check.id,
        action,
        profileId:   currentProfile?.id ?? null,
        profileName: currentProfile?.full_name ?? 'Unknown',
        notes:       reviewNotes || null,
      })
      setReviewNotes('')
      toast.success(action === 'approved' ? 'Step approved' : 'Check rejected')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setApprovingStep(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full h-full rounded-none sm:rounded-lg sm:w-[64rem] sm:h-[85vh] sm:max-w-[95vw] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2 flex-wrap">
            {check.check_number}
            <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_BADGE[check.status] ?? 'bg-muted text-muted-foreground'}`}>
              {statusLabel(check.status)}
            </Badge>
            <span className="text-xs font-normal text-muted-foreground">{check.warehouse_name}</span>
            {check.started_at && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                Started {format(new Date(check.started_at), 'dd MMM yyyy')}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Assignment progress — chip grid with status per counter */}
        {assignments.length > 0 && (() => {
          const completed = assignments.filter((a) => a.status === 'completed').length
          const inProgress = assignments.filter((a) => a.status === 'in_progress').length
          const pct = Math.round((completed / assignments.length) * 100)
          return (
            <div className="flex-shrink-0 border rounded-md bg-muted/10 p-3 space-y-2">
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Counters</span>
                <span>
                  <span className="text-success font-medium">{completed} done</span>
                  {inProgress > 0 && <> · <span className="text-primary font-medium">{inProgress} counting</span></>}
                  {' · '}
                  <span>{assignments.length} total</span>
                </span>
                <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden ml-auto max-w-[180px]">
                  <div className="h-full bg-success transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="tabular-nums text-[10px]">{pct}%</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                {assignments.map((a) => {
                  const initials = a.profile_name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()
                  const statusCfg =
                    a.status === 'completed'
                      ? { bg: 'bg-success/10', ring: 'ring-success/30', dot: 'bg-success', label: 'Done', tone: 'text-success' }
                      : a.status === 'in_progress'
                      ? { bg: 'bg-primary/10', ring: 'ring-primary/30', dot: 'bg-primary animate-pulse', label: 'Counting', tone: 'text-primary' }
                      : { bg: 'bg-muted/40', ring: 'ring-border', dot: 'bg-muted-foreground/40', label: 'Pending', tone: 'text-muted-foreground' }
                  return (
                    <div
                      key={a.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md ring-1 ${statusCfg.bg} ${statusCfg.ring}`}
                      title={a.profile_name}
                    >
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold bg-background text-foreground shrink-0`}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate leading-tight">{a.profile_name}</p>
                        <div className="flex items-center gap-1">
                          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                          <span className={`text-[9px] ${statusCfg.tone}`}>{statusCfg.label}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="flex-shrink-0 text-xs h-8">
            <TabsTrigger value="timeline"  className="text-xs h-7 px-3">Timeline</TabsTrigger>
            <TabsTrigger value="count"     className="text-xs h-7 px-3">
              Count
              {myAssignment && myAssignment.status !== 'completed' && (
                <AlertCircle className="h-3 w-3 ml-1 text-warning" />
              )}
            </TabsTrigger>
            {generatedSAs.length > 0 && (
              <TabsTrigger value="adjustments" className="text-xs h-7 px-3">
                Adjustments
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[9px] font-semibold">
                  {generatedSAs.length}
                </Badge>
              </TabsTrigger>
            )}
            {canSeeAll && (check.status === 'pending_approval' || check.status === 'approved' || check.status === 'rejected') && (
              <TabsTrigger value="approval" className="text-xs h-7 px-3">Approval Chain</TabsTrigger>
            )}
          </TabsList>

          {/* ── Timeline ── */}
          <TabsContent value="timeline" className="flex-1 min-h-0 overflow-y-auto mt-2">
            <div className="space-y-1">
              {logEntries.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No activity yet</p>
              )}
              {logEntries.map((entry, i) => (
                <div key={entry.id} className="flex gap-3 items-start">
                  <div className="flex flex-col items-center">
                    <div className="h-7 w-7 rounded-full bg-muted/40 flex items-center justify-center flex-shrink-0">
                      <EventIcon type={entry.event_type} />
                    </div>
                    {i < logEntries.length - 1 && (
                      <div className="w-px flex-1 bg-border min-h-[8px] mt-0.5" />
                    )}
                  </div>
                  <div className="pb-3 min-w-0">
                    <p className="text-xs font-medium">{eventLabel(entry.event_type, entry.meta)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {entry.profile_name && `${entry.profile_name} · `}
                      {format(new Date(entry.created_at), 'dd MMM yyyy, HH:mm')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── Count ── */}
          <TabsContent value="count" className="flex-1 min-h-0 overflow-y-auto mt-2">
            {(() => {
              const myItems = myAssignment ? (byAssignment.get(myAssignment.id) ?? []) : []

              // Counter with active assignment (still counting, not canSeeAll) — show only their items with input
              if (myAssignment && myAssignment.status !== 'completed' && !canSeeAll && !checkDone) {
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/5 border border-primary/20">
                      <AlertCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                      <p className="text-xs text-primary">
                        You are assigned to count: <strong>{myAssignment.assigned_categories.join(', ')}</strong>
                      </p>
                    </div>
                    <CountingPanel
                      checkId={check.id}
                      items={myItems}
                      assignmentId={myAssignment.id}
                      currentProfile={currentProfile}
                      readOnly={false}
                      itemTypeMap={itemTypeMap}
                    />
                  </div>
                )
              }

              // Regular counter (completed or check done) — show only their own items read-only
              if (myAssignment && !canSeeAll) {
                return (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{myAssignment.profile_name}</span>
                      <Badge className={`text-[10px] px-1.5 py-0 ${
                        myAssignment.status === 'completed' ? 'bg-success/10 text-success' :
                        'bg-blue-500/10 text-blue-600'
                      }`}>
                        {myAssignment.status === 'completed' ? 'Done' : 'Counting'}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {myItems.filter((i) => i.is_counted).length}/{myItems.length} items
                      </span>
                      {myAssignment.completed_at && (
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          Completed {format(new Date(myAssignment.completed_at), 'dd MMM, HH:mm')}
                        </span>
                      )}
                    </div>
                    <CountingPanel
                      checkId={check.id}
                      items={myItems}
                      assignmentId={null}
                      currentProfile={currentProfile}
                      readOnly
                      itemTypeMap={itemTypeMap}
                    />
                  </div>
                )
              }

              // Initiator or non-counter (manager/owner) — sees all counters' results
              // If they also have their own assignment, show their counting panel at top,
              // then collapsed cards for other counters below.
              const otherAssignments = assignments.filter((a) => a.id !== myAssignment?.id)
              const myActiveCounting = myAssignment && myAssignment.status !== 'completed' && !checkDone

              return (
                <div className="space-y-4">
                  {/* My own counting panel — pinned to top */}
                  {myAssignment && (
                    <div className="space-y-2 border rounded-md p-3 bg-primary/5 border-primary/30">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="text-xs font-semibold">Your count</span>
                        <Badge className={`text-[10px] px-1.5 py-0 ${
                          myAssignment.status === 'completed' ? 'bg-success/10 text-success' :
                          myAssignment.status === 'in_progress' ? 'bg-primary/10 text-primary' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {myAssignment.status === 'completed' ? 'Done' : myAssignment.status === 'in_progress' ? 'Counting' : 'Pending'}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {myItems.filter((i) => i.is_counted).length}/{myItems.length} items
                        </span>
                        {myAssignment.completed_at && (
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            Completed {format(new Date(myAssignment.completed_at), 'dd MMM, HH:mm')}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Categories: <strong className="text-foreground">{myAssignment.assigned_categories.join(', ')}</strong>
                      </p>
                      <CountingPanel
                        checkId={check.id}
                        items={myItems}
                        assignmentId={myActiveCounting ? myAssignment.id : null}
                        currentProfile={currentProfile}
                        readOnly={!myActiveCounting}
                        itemTypeMap={itemTypeMap}
                      />
                    </div>
                  )}

                  {/* Other counters — collapsed by default */}
                  {otherAssignments.length > 0 && (
                    <div className="space-y-2">
                      {myAssignment && (
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
                          Other counters
                        </p>
                      )}
                      {otherAssignments.map((a) => {
                        const aItems = byAssignment.get(a.id) ?? []
                        const isExpanded = expandedAssignments.has(a.id)
                        const countedCount = aItems.filter((i) => i.is_counted).length
                        const statusCfg =
                          a.status === 'completed' ? { badge: 'bg-success/10 text-success', label: 'Done' } :
                          a.status === 'in_progress' ? { badge: 'bg-blue-500/10 text-blue-600', label: 'Counting' } :
                          { badge: 'bg-muted text-muted-foreground', label: 'Pending' }
                        return (
                          <div key={a.id} className="border rounded-md overflow-hidden">
                            <button
                              type="button"
                              onClick={() => toggleAssignment(a.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
                            >
                              {isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                              <span className="text-xs font-semibold">{a.profile_name}</span>
                              <Badge className={`text-[10px] px-1.5 py-0 ${statusCfg.badge}`}>
                                {statusCfg.label}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {countedCount}/{aItems.length} items
                              </span>
                              {a.completed_at && (
                                <span className="text-[10px] text-muted-foreground ml-auto">
                                  Completed {format(new Date(a.completed_at), 'dd MMM, HH:mm')}
                                </span>
                              )}
                            </button>
                            {isExpanded && (
                              <div className="px-3 pb-3 pt-1 border-t">
                                <CountingPanel
                                  checkId={check.id}
                                  items={aItems}
                                  assignmentId={null}
                                  currentProfile={currentProfile}
                                  readOnly
                                  itemTypeMap={itemTypeMap}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {assignments.length === 0 && items.length > 0 && (
                    <CountingPanel
                      checkId={check.id}
                      items={items}
                      assignmentId={null}
                      currentProfile={currentProfile}
                      readOnly
                      itemTypeMap={itemTypeMap}
                    />
                  )}
                </div>
              )
            })()}
          </TabsContent>

          {/* ── Generated Stock Adjustments ── */}
          <TabsContent value="adjustments" className="flex-1 min-h-0 overflow-y-auto mt-2">
            <div className="space-y-2">
              <div className="rounded-md border overflow-hidden bg-background">
                <div className="grid grid-cols-[1fr_90px_60px_110px_100px] gap-2 px-3 py-1.5 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Item</span>
                  <span>Type</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Created</span>
                  <span className="text-right">Status</span>
                </div>
                {generatedSAs.map((sa) => {
                  const typeTone =
                    sa.adjustment_type === 'increase'  ? 'bg-success/10 text-success'
                    : sa.adjustment_type === 'damage'    ? 'bg-destructive/10 text-destructive'
                    : sa.adjustment_type === 'write_off' ? 'bg-destructive/15 text-destructive'
                    :                                       'bg-warning/10 text-warning'
                  const statusTone =
                    sa.status === 'approved'         ? 'bg-success/10 text-success'
                    : sa.status === 'rejected'         ? 'bg-destructive/10 text-destructive'
                    : sa.status === 'pending_approval' ? 'bg-warning/10 text-warning'
                    :                                     'bg-muted text-muted-foreground'
                  return (
                    <div
                      key={sa.id}
                      className="grid grid-cols-[1fr_90px_60px_110px_100px] gap-2 px-3 py-1.5 border-t text-xs items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{sa.item_name ?? '—'}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {sa.brand ?? '—'}{sa.sku ? ` · ${sa.sku}` : ''}
                        </p>
                      </div>
                      <span className={cn('inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize w-fit', typeTone)}>
                        {sa.adjustment_type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-right tabular-nums font-medium">{sa.qty}</span>
                      <span className="text-right text-[10px] text-muted-foreground">
                        {format(new Date(sa.created_at), 'dd MMM, HH:mm')}
                      </span>
                      <span className={cn('inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize w-fit ml-auto', statusTone)}>
                        {sa.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] text-muted-foreground px-1">
                These adjustments were auto-generated when the check was approved. Each one now goes through the Stock Adjustment approval chain — actual stock only changes on its final approval.
              </p>
            </div>
          </TabsContent>

          {/* ── Approval chain ── */}
          <TabsContent value="approval" className="flex-1 min-h-0 overflow-y-auto mt-2">
            <div className="space-y-4">
              {/* Post-count stock movements */}
              {/* ── Post-count movement log ── */}
              {postCountMovements.length > 0 && (
                <div className="border border-warning/40 rounded-md bg-warning/5 p-3 space-y-3">
                  <p className="text-xs font-semibold text-warning flex items-center gap-1.5">
                    <ArrowDownUp className="h-3.5 w-3.5" />
                    Stock movements since count completed
                  </p>
                  <div className="rounded-md border overflow-hidden bg-background">
                    <div className="grid grid-cols-[1fr_100px_60px_110px] gap-2 px-3 py-1.5 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span>Item</span>
                      <span>Type</span>
                      <span className="text-right">Qty</span>
                      <span className="text-right">Date</span>
                    </div>
                    {postCountMovements.map((m) => {
                      const checkItem = items.find((i) => i.brand_variant_id === m.brand_variant_id)
                      return (
                        <div key={m.id} className="grid grid-cols-[1fr_100px_60px_110px] gap-2 px-3 py-1.5 border-t text-xs items-center">
                          <ItemTreeCell
                            category={checkItem?.category_name}
                            itemType={itemTypeMap.get(m.brand_variant_id)}
                            itemName={checkItem?.item_name ?? m.item_name}
                            brand={checkItem?.brand}
                          />
                          <span className="text-[10px] text-muted-foreground">{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</span>
                          <span className={`text-right tabular-nums font-medium ${m.qty > 0 ? 'text-success' : 'text-destructive'}`}>
                            {m.qty > 0 ? `+${m.qty}` : m.qty}
                          </span>
                          <span className="text-right text-[10px] text-muted-foreground">
                            {format(new Date(m.created_at), 'dd MMM, HH:mm')}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Reconciliation table ── */}
              {(() => {
                const reconItems = items.filter((i) => i.is_counted && (postCountByVariant.has(i.brand_variant_id) || (i.variance ?? 0) !== 0))
                if (reconItems.length === 0) return null
                return (
                  <div className="border rounded-md p-3 space-y-2">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      Reconciliation
                    </p>
                    <div className="px-1 space-y-1 text-[10px] text-muted-foreground">
                      <p>
                        <span className="font-semibold text-foreground">Two reconciliations, one row:</span>{' '}
                        the count variance (Start vs Counted) becomes a pending Stock Adjustment,
                        while post-count movements (Moved) are already reflected in the live system.
                      </p>
                      <p>
                        <span className="text-success font-medium">Match</span> = physical stock (Counted + Moved) equals what the system currently shows.
                        <span className="mx-1">·</span>
                        <span className="font-medium">Book expected</span> = System-at-start + Moved (what the books would show if no variance existed).
                      </p>
                    </div>
                    <div className="rounded-md border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <th className="text-left px-3 py-1.5 font-semibold">Item</th>
                            <th className="text-right px-2 py-1.5 font-semibold w-[60px]" title="What the system said at the moment the check started">Start</th>
                            <th className="text-right px-2 py-1.5 font-semibold w-[65px]" title="What the counter physically counted during the check">Counted</th>
                            <th className="text-right px-2 py-1.5 font-semibold w-[55px]" title="Net stock movement since the count was completed (purchases, sales, transfers …)">Moved</th>
                            <th className="text-right px-2 py-1.5 font-semibold w-[110px]" title="Counted + Moved — the real physical stock right now">Physical</th>
                            <th className="text-right px-2 py-1.5 font-semibold w-[110px]" title="Start + Moved — what the books say should be here (before any pending SA)">Book expected</th>
                            <th className="text-right px-2 py-1.5 font-semibold w-[65px]" title="What the system actually shows right now">System</th>
                            <th className="text-right px-3 py-1.5 font-semibold w-[80px]">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                      {reconItems.map((item) => {
                        const movements = postCountByVariant.get(item.brand_variant_id) ?? []
                        const netMoved = movements.reduce((sum, m) => sum + m.qty, 0)
                        const startQty = item.system_qty
                        const physicalNow = (item.counted_qty ?? 0) + netMoved
                        const bookExpected = startQty + netMoved
                        const checkClosed = check.status === 'approved' || check.status === 'rejected'
                        const systemNow = checkClosed && item.system_qty_at_close != null
                          ? item.system_qty_at_close
                          : liveStockMap.get(item.brand_variant_id) ?? (item.system_qty + netMoved)
                        const diff = physicalNow - systemNow
                        const isMatch = diff === 0
                        const countVariance = (item.counted_qty ?? 0) - startQty

                        return (
                          <tr key={item.id} className={`border-t ${isMatch ? '' : 'bg-destructive/5'}`}>
                            <td className="px-3 py-2 align-top">
                              <ItemTreeCell
                                category={item.category_name}
                                itemType={itemTypeMap.get(item.brand_variant_id)}
                                itemName={item.item_name}
                                brand={item.brand}
                              />
                            </td>
                            <td className="text-right px-2 py-2 tabular-nums align-middle text-muted-foreground">
                              {startQty}
                            </td>
                            <td className="text-right px-2 py-2 tabular-nums align-middle">
                              <span className="inline-flex items-baseline gap-1 justify-end">
                                <span>{item.counted_qty}</span>
                                {countVariance !== 0 && (
                                  <span className={`text-[9px] font-medium ${countVariance > 0 ? 'text-success' : 'text-destructive'}`}>
                                    ({countVariance > 0 ? '+' : ''}{countVariance})
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className={`text-right px-2 py-2 tabular-nums align-middle ${netMoved > 0 ? 'text-success' : netMoved < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {netMoved === 0 ? '—' : netMoved > 0 ? `+${netMoved}` : netMoved}
                            </td>
                            <td className="text-right px-2 py-2 tabular-nums align-middle">
                              {netMoved !== 0 ? (
                                <span className="inline-flex items-baseline gap-1 justify-end">
                                  <span className="text-[10px] text-muted-foreground">
                                    {item.counted_qty ?? 0}{netMoved > 0 ? ` + ${netMoved}` : ` − ${Math.abs(netMoved)}`} =
                                  </span>
                                  <span className="font-semibold">{physicalNow}</span>
                                </span>
                              ) : (
                                <span className="font-medium">{physicalNow}</span>
                              )}
                            </td>
                            <td className="text-right px-2 py-2 tabular-nums align-middle">
                              {netMoved !== 0 ? (
                                <span className="inline-flex items-baseline gap-1 justify-end">
                                  <span className="text-[10px] text-muted-foreground">
                                    {startQty}{netMoved > 0 ? ` + ${netMoved}` : ` − ${Math.abs(netMoved)}`} =
                                  </span>
                                  <span className="font-semibold">{bookExpected}</span>
                                </span>
                              ) : (
                                <span className="font-medium">{bookExpected}</span>
                              )}
                            </td>
                            <td className="text-right px-2 py-2 tabular-nums align-middle">{systemNow}</td>
                            <td className="text-right px-3 py-2 align-middle">
                              <span className={`inline-flex items-center justify-end gap-0.5 text-[10px] font-semibold ${isMatch ? 'text-success' : 'text-destructive'}`}>
                                {isMatch ? (
                                  <><CheckCircle2 className="h-3 w-3 shrink-0" /> Match</>
                                ) : (
                                  <><XCircle className="h-3 w-3 shrink-0" /> {diff > 0 ? `+${diff}` : diff}</>
                                )}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}

              {/* Approval steps */}
              <div className="space-y-2">
                {approvals.map((step, i) => {
                  const isActive  = step.status === 'pending' && (i === 0 || approvals[i - 1]?.status === 'approved')
                  return (
                    <div
                      key={step.id}
                      className={`border rounded-md px-3 py-2.5 space-y-2 ${
                        isActive  ? 'border-primary/40 bg-primary/5' :
                        step.status === 'approved'  ? 'border-success/30 bg-success/5' :
                        step.status === 'rejected'  ? 'border-destructive/30 bg-destructive/5' :
                        'border-border bg-muted/10 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[10px] text-muted-foreground w-5 text-right">{step.step_order}.</span>
                        <span className="font-semibold">{step.step_label}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 ml-auto ${
                          step.status === 'approved' ? 'bg-success/10 text-success' :
                          step.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                          isActive ? 'bg-primary/10 text-primary' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {step.status === 'approved' ? 'Approved' : step.status === 'rejected' ? 'Rejected' : isActive ? 'Awaiting' : 'Pending'}
                        </Badge>
                      </div>

                      {step.profile_name && (
                        <p className="text-[10px] text-muted-foreground pl-7">
                          {step.status === 'approved' ? 'Approved' : 'Reviewed'} by {step.profile_name}
                          {step.action_at ? ` · ${format(new Date(step.action_at), 'dd MMM yyyy, HH:mm')}` : ''}
                        </p>
                      )}
                      {step.notes && (
                        <p className="text-[10px] text-muted-foreground pl-7 italic">{step.notes}</p>
                      )}

                      {isActive && activeApprovalStep?.id === step.id && (
                        <div className="pl-7 space-y-2">
                          <Textarea
                            placeholder="Reason (required for rejection)..."
                            className="text-xs min-h-[52px]"
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm" variant="outline"
                              className="h-7 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10"
                              disabled={!!approvingStep || !reviewNotes.trim()}
                              onClick={() => handleApproval(step.id, 'rejected')}
                            >
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-[10px] bg-success text-success-foreground hover:bg-success/90"
                              disabled={!!approvingStep}
                              onClick={() => handleApproval(step.id, 'approved')}
                            >
                              {approvingStep === step.id ? 'Saving…' : 'Approve'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {approvals.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    Approval chain will appear once all counting is complete.
                  </p>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

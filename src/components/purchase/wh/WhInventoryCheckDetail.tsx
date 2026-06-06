'use client'

import React, { useState, useMemo } from 'react'
import {
  CheckCircle2, Clock, XCircle, ChevronDown, ChevronRight,
  Milestone, User, AlertCircle,
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
  useSaveItemCount,
  useCompleteAssignment,
  useApproveCheckStep,
} from '@/hooks/useWarehouseOperations'
import type { InventoryCheck, InventoryCheckItem } from '@/hooks/useWarehouseOperations'
import type { Profile } from '@/hooks/useProfiles'
import { format } from 'date-fns'
import { toast } from 'sonner'

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
  checkId,
  readOnly,
  countMap,
  varianceTypeMap,
  onCountChange,
  onVarianceTypeChange,
}: {
  item: InventoryCheckItem
  checkId: string
  readOnly: boolean
  countMap: Map<string, string>
  varianceTypeMap: Map<string, string>
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
      <div className="flex flex-col gap-0.5 min-w-0">
        {item.category_name && (
          <span className="text-[10px] text-muted-foreground truncate">{item.category_name}</span>
        )}
        <span className="font-medium truncate" style={{ paddingLeft: item.category_name ? 10 : 0 }}>
          {item.item_name}
        </span>
        {item.brand && (
          <span className="text-[10px] text-primary truncate" style={{ paddingLeft: item.category_name ? 20 : 10 }}>
            {item.brand}
          </span>
        )}
      </div>

      {/* SKU */}
      <span className="text-[10px] text-muted-foreground truncate">{item.sku ?? '—'}</span>

      {/* System qty */}
      <span className="text-right tabular-nums">{item.system_qty}</span>

      {/* Count input or static */}
      {readOnly ? (
        <span className="text-right tabular-nums">{item.counted_qty ?? '—'}</span>
      ) : (
        <Input
          type="number"
          min="0"
          step="0.01"
          className="h-7 text-xs text-right w-full"
          value={countedStr}
          onChange={(e) => onCountChange(item.id, e.target.value)}
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
          <SelectContent>
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
}: {
  checkId: string
  items: InventoryCheckItem[]
  assignmentId: string | null
  currentProfile: Profile | null
  readOnly: boolean
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

      <div className="border rounded-b-md overflow-hidden -mt-1">
        {Array.from(grouped.entries()).map(([cat, catItems]) => {
          const isOpen = expandedCats.has(cat)
          return (
            <React.Fragment key={cat}>
              <div
                className="flex items-center gap-2 px-3 py-1.5 bg-muted/20 cursor-pointer hover:bg-muted/40 border-b text-xs font-semibold"
                onClick={() => setExpandedCats((prev) => {
                  const n = new Set(prev)
                  n.has(cat) ? n.delete(cat) : n.add(cat)
                  return n
                })}
              >
                {isOpen
                  ? <ChevronDown  className="h-3 w-3 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                {cat}
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

  const { data: detail }      = useInventoryCheck(check.id)
  const { data: assignments = [] } = useInventoryCheckAssignments(check.id)
  const { data: logEntries = [] }  = useInventoryCheckLog(check.id)
  const { data: approvals = [] }   = useInventoryCheckApprovals(check.id)
  const approveStep                = useApproveCheckStep()

  const items = detail?.items ?? []

  // Current user's assignment (if any)
  const myAssignment = assignments.find((a) => a.profile_id === currentProfile?.id)
  const myItems      = myAssignment
    ? items.filter((i) => i.assignment_id === myAssignment.id)
    : []

  // Group items by assignment for manager view
  const byAssignment = useMemo(() => {
    const map = new Map<string, InventoryCheckItem[]>()
    for (const a of assignments) { map.set(a.id, []) }
    for (const item of items) {
      if (item.assignment_id) map.get(item.assignment_id)?.push(item)
    }
    return map
  }, [items, assignments])

  const activeApprovalStep = approvals.find((s) => s.status === 'pending')

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

  // Determine default tab
  const defaultTab = myAssignment?.status === 'pending' || myAssignment?.status === 'in_progress'
    ? 'count'
    : check.status === 'pending_approval'
    ? 'approval'
    : 'timeline'

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
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

        {/* Assignment progress bar */}
        {assignments.length > 0 && (
          <div className="flex gap-2 flex-shrink-0">
            {assignments.map((a) => (
              <div key={a.id} className="flex-1 text-center">
                <div className={`h-1.5 rounded-full ${
                  a.status === 'completed' ? 'bg-success' :
                  a.status === 'in_progress' ? 'bg-primary' :
                  'bg-muted'
                }`} />
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{a.profile_name}</p>
              </div>
            ))}
          </div>
        )}

        <Tabs defaultValue={defaultTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="flex-shrink-0 text-xs h-8">
            <TabsTrigger value="timeline"  className="text-xs h-7 px-3">Timeline</TabsTrigger>
            <TabsTrigger value="count"     className="text-xs h-7 px-3">
              Count
              {myAssignment && myAssignment.status !== 'completed' && (
                <AlertCircle className="h-3 w-3 ml-1 text-warning" />
              )}
            </TabsTrigger>
            {(check.status === 'pending_approval' || check.status === 'approved' || check.status === 'rejected') && (
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
            {myAssignment && myAssignment.status !== 'completed' ? (
              /* Current user has active assignment */
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
                />
              </div>
            ) : (
              /* Manager view — all users' items grouped by assignment */
              <div className="space-y-4">
                {assignments.map((a) => {
                  const aItems = byAssignment.get(a.id) ?? []
                  return (
                    <div key={a.id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">{a.profile_name}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 ${
                          a.status === 'completed' ? 'bg-success/10 text-success' :
                          a.status === 'in_progress' ? 'bg-blue-500/10 text-blue-600' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {a.status === 'completed' ? 'Done' : a.status === 'in_progress' ? 'Counting' : 'Pending'}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {aItems.filter((i) => i.is_counted).length}/{aItems.length} items
                        </span>
                        {a.completed_at && (
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            Completed {format(new Date(a.completed_at), 'dd MMM, HH:mm')}
                          </span>
                        )}
                      </div>
                      <CountingPanel
                        checkId={check.id}
                        items={aItems}
                        assignmentId={null}
                        currentProfile={currentProfile}
                        readOnly
                      />
                    </div>
                  )
                })}
                {assignments.length === 0 && items.length > 0 && (
                  /* Legacy check (old system) — show all items read-only */
                  <CountingPanel
                    checkId={check.id}
                    items={items}
                    assignmentId={null}
                    currentProfile={currentProfile}
                    readOnly
                  />
                )}
              </div>
            )}
          </TabsContent>

          {/* ── Approval chain ── */}
          <TabsContent value="approval" className="flex-1 min-h-0 overflow-y-auto mt-2">
            <div className="space-y-2">
              {approvals.map((step, i) => {
                const isActive  = step.status === 'pending' && (i === 0 || approvals[i - 1]?.status === 'approved')
                const isPending = step.status === 'pending' && !isActive
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
                          placeholder="Notes (optional)…"
                          className="text-xs min-h-[52px]"
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm" variant="outline"
                            className="h-7 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10"
                            disabled={!!approvingStep}
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
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

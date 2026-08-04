'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck, Users, ChevronRight, ChevronDown, Package } from 'lucide-react'
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { GuardedDialog, type GuardedFormDialogHandle } from '@/components/shared/GuardedFormDialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useWarehouseStock, useStartInventoryCheck } from '@/hooks/useWarehouseOperations'
import { useWarehouseSubContainers } from '@/hooks/useWarehouseSubContainers'
import { useProfiles } from '@/hooks/useProfiles'
import type { Warehouse } from '@/hooks/useWarehouses'
import type { Profile } from '@/hooks/useProfiles'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface Props {
  warehouses: Warehouse[]
  currentProfile: Profile | null
  children: React.ReactNode
}

type UserOption = { id: string; name: string; title: string }

function distributeCategories(categories: string[], users: UserOption[]): Map<string, string[]> {
  const result = new Map<string, string[]>()
  if (users.length === 0) return result
  users.forEach((u) => result.set(u.id, []))
  categories.forEach((cat, i) => {
    const user = users[i % users.length]
    result.get(user.id)!.push(cat)
  })
  return result
}

export function WhInventoryCheckStartDialog({ warehouses, currentProfile, children }: Props) {
  const [open, setOpen]             = useState(false)
  const [warehouseId, setWarehouseId] = useState('')
  const [subContainerId, setSubContainerId] = useState<string | null>(null)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [notes, setNotes]           = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep]             = useState<1 | 2>(1)
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const { data: allProfiles = [] } = useProfiles()
  const { data: warehouseStock = [] } = useWarehouseStock(warehouseId || undefined)
  const startCheck                 = useStartInventoryCheck()

  const { data: allSubs = [] } = useWarehouseSubContainers(warehouseId || null)
  const eligibleSubs = useMemo(() => allSubs.filter((sc) => sc.is_active), [allSubs])

  useEffect(() => {
    if (eligibleSubs.length === 1) setSubContainerId(eligibleSubs[0].id)
    else if (eligibleSubs.length === 0) setSubContainerId(null)
    else if (subContainerId && !eligibleSubs.some((sc) => sc.id === subContainerId)) setSubContainerId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, eligibleSubs.length])

  // Scope the count list to the picked sub-container's FIFO layers. Falls
  // back to warehouse-wide until a sub-container is resolved so the picker
  // doesn't blink empty on first render.
  const { data: subContainerLayers = [] } = useQuery({
    queryKey: ['inv-check-sub-container-stock', subContainerId],
    queryFn: async () => {
      if (!subContainerId) return [] as Array<{ brand_variant_id: string }>
      const supabase = createClient()
      const { data, error } = await supabase
        .from('fifo_cost_layers')
        .select('brand_variant_id')
        .eq('sub_container_id', subContainerId)
        .gt('remaining_qty', 0)
        .limit(5000)
      if (error) throw error
      return (data ?? []) as Array<{ brand_variant_id: string }>
    },
    enabled: !!subContainerId,
    staleTime: 60_000,
  })

  const scopedBvIds = useMemo(() => new Set(subContainerLayers.map((l) => l.brand_variant_id)), [subContainerLayers])

  const stock = useMemo(
    () => (subContainerId ? warehouseStock.filter((s) => scopedBvIds.has(s.brand_variant_id)) : warehouseStock),
    [warehouseStock, subContainerId, scopedBvIds],
  )

  const activeProfiles = useMemo(
    () => allProfiles.filter((p) => p.is_active !== false).map((p): UserOption => ({
      id: p.id, name: p.full_name, title: p.title,
    })),
    [allProfiles],
  )

  const categories = useMemo(() => {
    const seen = new Set<string>()
    return stock.map((s) => s.category_name ?? s.item_name).filter((c) => {
      if (seen.has(c)) return false
      seen.add(c); return true
    })
  }, [stock])

  const selectedUsers = useMemo(
    () => activeProfiles.filter((p) => selectedUserIds.has(p.id)),
    [activeProfiles, selectedUserIds],
  )

  const distribution = useMemo(
    () => distributeCategories(categories, selectedUsers),
    [categories, selectedUsers],
  )

  function toggleUser(id: string) {
    setSelectedUserIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) { n.delete(id) } else { n.add(id) }
      return n
    })
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setWarehouseId(''); setSubContainerId(null); setSelectedUserIds(new Set()); setNotes(''); setStep(1)
    }
    setOpen(next)
  }

  const isDirty =
    warehouseId !== '' ||
    selectedUserIds.size > 0 ||
    notes.trim() !== ''

  async function handleStart() {
    if (!warehouseId || selectedUsers.length === 0) return
    if (eligibleSubs.length === 0) { toast.error('Warehouse has no active sub-container'); return }
    if (eligibleSubs.length > 1 && !subContainerId) { toast.error('Pick a sub-container'); return }
    setSubmitting(true)
    try {
      const wh = warehouses.find((w) => w.id === warehouseId)

      const assignments = selectedUsers.map((user) => {
        const userCategories = distribution.get(user.id) ?? []
        const items = stock.filter((s) =>
          userCategories.includes(s.category_name ?? s.item_name),
        ).map((s) => ({
          brand_variant_id: s.brand_variant_id,
          item_name:        s.item_name,
          brand:            s.brand,
          sku:              s.sku,
          qty:              s.qty,
          category_name:    s.category_name,
        }))
        return { profileId: user.id, profileName: user.name, categories: userCategories, items }
      })

      await startCheck.mutateAsync({
        warehouseId,
        subContainerId,
        warehouseName:         wh?.name ?? '',
        initiatedByProfileId:  currentProfile?.id ?? null,
        initiatedByName:       currentProfile?.full_name ?? null,
        notes:                 notes || null,
        assignments,
      })

      toast.success('Inventory check started')
      guardRef.current?.closeAfterSubmit()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to start check')
    } finally {
      setSubmitting(false)
    }
  }

  const warehouseName = warehouses.find((w) => w.id === warehouseId)?.name ?? ''
  const subResolved   = eligibleSubs.length > 0 && (eligibleSubs.length === 1 || !!subContainerId)
  const canAdvance    = !!warehouseId && subResolved && selectedUsers.length > 0

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>

      <GuardedDialog open={open} onOpenChange={handleOpenChange} isDirty={isDirty} ref={guardRef}>
        <DialogContent className="w-full h-full rounded-none sm:rounded-lg sm:w-[48rem] sm:h-[80vh] sm:max-w-[95vw] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Start Inventory Check
              {step === 2 && (
                <Badge variant="outline" className="text-[10px] ml-1">Step 2 of 2 — Review</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
            {/* ── Step 1: Select warehouse + users ── */}
            {step === 1 && (
              <>
                {/* Warehouse */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Warehouse</Label>
                  <Select
                    value={warehouseId}
                    onValueChange={(v) => { setWarehouseId(v ?? ''); setSelectedUserIds(new Set()) }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select warehouse…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {warehouses.map((wh) => (
                        <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {warehouseId && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap min-h-7 pt-0.5">
                      <span className="inline-flex items-center gap-1 flex-shrink-0">
                        <Package className="h-3 w-3" />
                        Sub-container:
                      </span>
                      {eligibleSubs.length === 0 ? (
                        <span className="italic text-destructive">No active sub-container in this warehouse.</span>
                      ) : eligibleSubs.length === 1 ? (
                        <>
                          <span className="font-medium text-foreground truncate max-w-[380px]" title={eligibleSubs[0].name}>
                            {eligibleSubs[0].name}
                          </span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 flex-shrink-0">Auto</Badge>
                        </>
                      ) : (
                        <Select value={subContainerId ?? ''} onValueChange={(v) => { setSubContainerId(v || null); setSelectedUserIds(new Set()) }}>
                          <SelectTrigger className="h-7 text-[11px] w-auto min-w-[220px] max-w-[380px]">
                            <SelectValue placeholder="Pick sub-container…" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60 overflow-y-auto">
                            {eligibleSubs.map((sc) => (
                              <SelectItem key={sc.id} value={sc.id} className="text-[11px]">
                                {sc.name}{sc.division_name && !sc.name.includes(sc.division_name) ? ` — ${sc.division_name}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                </div>

                {/* User assignment */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Assign counters</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Select team members — categories will be distributed evenly among them.
                  </p>
                  <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                    {activeProfiles.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
                      >
                        <Checkbox
                          checked={selectedUserIds.has(p.id)}
                          onCheckedChange={() => toggleUser(p.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground">{p.title}</p>
                        </div>
                        {selectedUserIds.has(p.id) && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {(distribution.get(p.id) ?? []).length} cats
                          </Badge>
                        )}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Live distribution preview */}
                {selectedUsers.length > 0 && warehouseId && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Category distribution preview</Label>
                    <div className="border rounded-md divide-y">
                      {selectedUsers.map((user) => {
                        const cats = distribution.get(user.id) ?? []
                        const itemCount = stock.filter((s) =>
                          cats.includes(s.category_name ?? s.item_name)
                        ).length
                        return (
                          <div key={user.id} className="flex items-start gap-2 px-3 py-2 text-xs">
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{user.name}</span>
                              <span className="text-muted-foreground ml-2 text-[10px]">
                                {cats.length} categor{cats.length === 1 ? 'y' : 'ies'} · {itemCount} items
                              </span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {cats.map((c) => (
                                  <span key={c} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                                    {c}
                                  </span>
                                ))}
                                {cats.length === 0 && (
                                  <span className="text-[10px] text-muted-foreground">No categories assigned</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label htmlFor="check-notes" className="text-xs">Notes (optional)</Label>
                  <Textarea
                    id="check-notes"
                    className="text-xs min-h-[60px]"
                    placeholder="Any notes for this inventory check…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* ── Step 2: Review & confirm ── */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="rounded-md border p-3 bg-muted/20 space-y-1 text-xs">
                  <p><span className="text-muted-foreground">Warehouse:</span> <span className="font-medium">{warehouseName}</span></p>
                  <p><span className="text-muted-foreground">Initiated by:</span> <span className="font-medium">{currentProfile?.full_name ?? '—'}</span></p>
                  <p><span className="text-muted-foreground">Counters:</span> <span className="font-medium">{selectedUsers.length} people</span></p>
                  <p><span className="text-muted-foreground">Total items:</span> <span className="font-medium">{stock.length}</span></p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Assignment summary</Label>
                  {selectedUsers.map((user) => {
                    const cats = distribution.get(user.id) ?? []
                    const itemCount = stock.filter((s) =>
                      cats.includes(s.category_name ?? s.item_name)
                    ).length
                    return (
                      <div key={user.id} className="border rounded-md px-3 py-2 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Users className="h-3.5 w-3.5 text-primary" />
                            <span className="font-medium">{user.name}</span>
                            <span className="text-[10px] text-muted-foreground">{user.title}</span>
                          </div>
                          <Badge variant="outline" className="text-[10px]">{itemCount} items</Badge>
                        </div>
                        <div className="flex flex-wrap gap-1 pl-5">
                          {cats.map((c) => (
                            <span key={c} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{c}</span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {notes && (
                  <div className="text-xs p-3 rounded-md bg-muted/30 text-muted-foreground">
                    {notes}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => guardRef.current?.requestClose()}>
              Cancel
            </Button>
            {step === 1 ? (
              <Button
                size="sm"
                className="text-xs gap-1"
                disabled={!canAdvance}
                onClick={() => setStep(2)}
              >
                Review
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setStep(1)}>
                  <ChevronDown className="h-3.5 w-3.5 rotate-90" />
                  Back
                </Button>
                <Button
                  size="sm"
                  className="text-xs bg-success text-success-foreground hover:bg-success/90 gap-1"
                  disabled={submitting}
                  onClick={handleStart}
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  {submitting ? 'Starting…' : 'Start Check'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </GuardedDialog>
    </>
  )
}

'use client'

import React, { useState, useMemo } from 'react'
import { ClipboardCheck, Users, ChevronRight, ChevronDown } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useWarehouseStock, useStartInventoryCheck } from '@/hooks/useWarehouseOperations'
import { useProfiles } from '@/hooks/useProfiles'
import type { Warehouse } from '@/hooks/useWarehouses'
import type { Profile } from '@/hooks/useProfiles'
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
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [notes, setNotes]           = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep]             = useState<1 | 2>(1)

  const { data: allProfiles = [] } = useProfiles()
  const { data: stock = [] }       = useWarehouseStock(warehouseId || undefined)
  const startCheck                 = useStartInventoryCheck()

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

  function handleClose() {
    setOpen(false)
    setWarehouseId(''); setSelectedUserIds(new Set()); setNotes(''); setStep(1)
  }

  async function handleStart() {
    if (!warehouseId || selectedUsers.length === 0) return
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
        warehouseName:         wh?.name ?? '',
        initiatedByProfileId:  currentProfile?.id ?? null,
        initiatedByName:       currentProfile?.full_name ?? null,
        notes:                 notes || null,
        assignments,
      })

      toast.success('Inventory check started')
      handleClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to start check')
    } finally {
      setSubmitting(false)
    }
  }

  const warehouseName = warehouses.find((w) => w.id === warehouseId)?.name ?? ''
  const canAdvance    = !!warehouseId && selectedUsers.length > 0

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
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
            <Button variant="outline" size="sm" className="text-xs" onClick={handleClose}>
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
      </Dialog>
    </>
  )
}

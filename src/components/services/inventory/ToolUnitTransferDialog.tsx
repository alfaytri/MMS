'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { GuardedDialog, type GuardedFormDialogHandle } from '@/components/shared/GuardedFormDialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { useTransferToolUnit, type ToolAssetUnit } from '@/hooks/useInventory'
import { useDivisions, useAllDivisions } from '@/hooks/useDivisions'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  itemId: string
  unit: ToolAssetUnit | null
}

/** Task 2b.3: reassign which division OWNS a serialized unit. The person the
 *  unit is assigned to (if any) is untouched — division owns, person holds. */
export function ToolUnitTransferDialog({ open, onOpenChange, itemId, unit }: Props) {
  const transfer = useTransferToolUnit()
  const { data: divisions = [] } = useDivisions()
  const { data: allDivisions = [] } = useAllDivisions()
  const [toDivisionId, setToDivisionId] = useState('')
  const [notes, setNotes] = useState('')
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const currentDivisionId = unit?.division_id ?? null
  // Everything except the unit's current division — moving "to" where it
  // already is isn't a transfer.
  const targetOptions = divisions.filter((d) => d.id !== currentDivisionId)
  // Same seeding rule the effect below applies — used to judge dirtiness
  // against what was actually pre-selected, not against "empty".
  const seededToDivisionId = targetOptions.length === 1 ? targetOptions[0].id : ''

  useEffect(() => {
    if (open) {
      setNotes('')
      setToDivisionId(targetOptions.length === 1 ? targetOptions[0].id : '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unit?.id, targetOptions.length])

  // A pristine single-option open pre-seeds toDivisionId — that alone must not
  // read as dirty. Only an actual user pick (multi-option case) or notes count.
  const isDirty = toDivisionId !== seededToDivisionId || notes.trim() !== ''

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!unit) return
    if (!toDivisionId) { toast.error('Select a destination division'); return }
    transfer.mutate(
      { unit_id: unit.id, item_id: itemId, from_division_id: currentDivisionId, to_division_id: toDivisionId, notes: notes.trim() || null },
      {
        onSuccess: () => { toast.success('Unit transferred'); guardRef.current?.closeAfterSubmit() },
        onError: (err) => toast.error(humanizeDbError(err)),
      },
    )
  }

  // Resolve against ALL divisions (not just the active list) so a since-
  // deactivated owning division still shows its real name — "Inactive
  // division" is a distinct state from "no division set" and must not be
  // conflated with "Unassigned".
  const currentDivisionRecord = currentDivisionId
    ? allDivisions.find((d) => d.id === currentDivisionId)
    : undefined
  const currentDivisionName = !currentDivisionId
    ? 'Unassigned'
    : !currentDivisionRecord
      ? 'Inactive division'
      : currentDivisionRecord.is_active
        ? currentDivisionRecord.name
        : `${currentDivisionRecord.name} (inactive)`

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-lg flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Transfer Unit{unit?.serial_number ? ` — ${unit.serial_number}` : ''}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Current division</Label>
              <div className="h-10 flex items-center px-3 rounded-md border border-input bg-muted/40 text-sm truncate">
                {currentDivisionName}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="transfer-to-division">Transfer to *</Label>
              {targetOptions.length === 0 ? (
                <div className="h-10 flex items-center px-3 rounded-md border border-dashed text-sm text-muted-foreground">
                  No other division available
                </div>
              ) : (
                <Select
                  value={toDivisionId}
                  onValueChange={(v) => { if (v !== null) setToDivisionId(v) }}
                  disabled={targetOptions.length === 1}
                >
                  <SelectTrigger id="transfer-to-division" className="h-10 w-full min-w-0">
                    <span className="truncate">
                      {targetOptions.find((d) => d.id === toDivisionId)?.name ?? 'Select division…'}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {targetOptions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="transfer-notes">Notes</Label>
              <Textarea
                id="transfer-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes…"
                className="min-h-[72px] resize-none text-sm"
              />
            </div>

            <p className="text-[11px] text-muted-foreground">
              This changes which division owns the unit. If it&apos;s currently assigned to a
              person, they keep holding it — only the owning division changes.
            </p>
          </div>
          <DialogFooter className="pt-4 mt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => guardRef.current?.requestClose()}>Cancel</Button>
            <Button type="submit" disabled={transfer.isPending || !toDivisionId}>
              {transfer.isPending ? 'Transferring…' : 'Transfer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </GuardedDialog>
  )
}

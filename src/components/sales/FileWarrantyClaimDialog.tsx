'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FilePlus2, AlertCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { SearchInput } from '@/components/shared/SearchInput'
import { useWarrantyRecords, type WarrantyRecordRow } from '@/hooks/useWarrantyRecords'
import { useFileWarrantyClaim } from '@/hooks/useWarrantyClaims'
import { humanizeDbError } from '@/lib/dbErrors'

// Local copy of the Warranties page's source-type label map — kept self-contained
// so this dialog doesn't depend on page.tsx internals (page.tsx doesn't export it).
const SOURCE_TYPE_LABELS: Record<string, string> = {
  sale:     'Sale',
  service:  'Service',
  contract: 'Contract',
}

function sourceTypeLabel(value: string): string {
  if (SOURCE_TYPE_LABELS[value]) return SOURCE_TYPE_LABELS[value]
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '—'
}

function RecordSummaryCard({ record }: { record: WarrantyRecordRow }) {
  const exhausted = record.remaining_qty <= 0
  return (
    <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-primary truncate">{record.warranty_number}</span>
        <Badge variant="outline" className="text-[10px] shrink-0">{sourceTypeLabel(record.source_type)}</Badge>
      </div>
      <p className="text-sm font-medium truncate">{record.item_name}</p>
      <p className="text-xs text-muted-foreground">
        {record.sku ? `${record.sku} · ` : ''}{record.qty} unit{record.qty !== 1 ? 's' : ''} covered
      </p>
      <p className={exhausted ? 'text-xs font-medium text-destructive' : 'text-xs font-medium text-emerald-700 dark:text-emerald-400'}>
        {exhausted
          ? 'No coverage left — every unit is already claimed'
          : `${record.remaining_qty} of ${record.qty} unit${record.qty !== 1 ? 's' : ''} still under warranty`}
      </p>
    </div>
  )
}

interface FileWarrantyClaimDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-selected warranty record (opened from the record detail dialog). When
   * omitted/null, a searchable record picker is shown instead (opened from the
   * Claims tab's "File a claim" button). */
  record?: WarrantyRecordRow | null
  /** Scope the built-in record picker to one source (e.g. 'consumption' on the
   * Consumption Warranties page). Omit to show all records (Sales default). */
  source?: string
  onFiled?: (claimId: string) => void
}

export function FileWarrantyClaimDialog({ open, onOpenChange, record = null, source, onFiled }: FileWarrantyClaimDialogProps) {
  const [pickerSearch, setPickerSearch] = useState('')
  const [selectedRecord, setSelectedRecord] = useState<WarrantyRecordRow | null>(null)
  const [issue, setIssue] = useState('')
  const [qty, setQty] = useState(1)

  const fileClaim = useFileWarrantyClaim()

  // Always called (rules of hooks) — when a record is pre-selected the result is
  // simply unused. Its default filters ({ search: '' }) match the Records tab's
  // own default query key, so this normally reuses an already-warm cache entry
  // instead of firing an extra request.
  const { data: candidateRecords = [], isLoading: candidatesLoading, error: candidatesError } =
    useWarrantyRecords({ search: pickerSearch, source })

  // Reset local form state every time the dialog opens (or the pre-selected
  // record changes) so a previous attempt never leaks into the next one.
  useEffect(() => {
    if (open) {
      setSelectedRecord(null)
      setPickerSearch('')
      setIssue('')
      setQty(1)
      fileClaim.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record])

  const targetRecord = record ?? selectedRecord
  const isPreselected = !!record
  const remaining = targetRecord?.remaining_qty ?? 0
  const qtyValid = qty >= 1 && qty <= remaining

  // Reset the qty to 1 whenever the target warranty changes (picker selection).
  useEffect(() => { setQty(1) }, [targetRecord?.id])

  function handleSubmit() {
    const trimmedIssue = issue.trim()
    if (!targetRecord || trimmedIssue === '' || !qtyValid) return
    fileClaim.mutate(
      { warranty_record_id: targetRecord.id, issue: trimmedIssue, claim_qty: qty },
      {
        onSuccess: (claimId) => {
          toast.success('Warranty claim filed')
          onFiled?.(claimId)
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false) }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <FilePlus2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg tracking-tight">File a Warranty Claim</DialogTitle>
              <p className="text-sm text-muted-foreground">Open a claim against a warranty record</p>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        {/* Body — single scroll region */}
        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Warranty record *</Label>
            {isPreselected && record ? (
              <RecordSummaryCard record={record} />
            ) : selectedRecord ? (
              <div className="space-y-1.5">
                <RecordSummaryCard record={selectedRecord} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 md:min-h-0"
                  onClick={() => setSelectedRecord(null)}
                >
                  Change record
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <SearchInput value={pickerSearch} onChange={setPickerSearch} placeholder="Search warranty #, item or SKU…" />
                {candidatesError ? (
                  <p className="text-xs text-destructive">{humanizeDbError(candidatesError, 'load warranty records')}</p>
                ) : (
                  <div className="rounded-lg border max-h-56 overflow-y-auto divide-y">
                    {candidatesLoading ? (
                      <p className="p-4 text-xs text-muted-foreground text-center">Loading…</p>
                    ) : candidateRecords.length === 0 ? (
                      <p className="p-4 text-xs text-muted-foreground text-center">No warranty records match your search.</p>
                    ) : (
                      candidateRecords.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          disabled={r.remaining_qty <= 0}
                          onClick={() => setSelectedRecord(r)}
                          className="w-full text-left px-3 py-2.5 min-h-11 transition-colors enabled:hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-sm font-medium text-primary truncate">{r.warranty_number}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">{sourceTypeLabel(r.source_type)}</Badge>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground truncate">
                              {r.item_name}{r.sku ? ` · ${r.sku}` : ''}
                            </p>
                            <span className={r.remaining_qty > 0
                              ? 'text-[10px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0 tabular-nums'
                              : 'text-[10px] font-medium text-destructive shrink-0'}>
                              {r.remaining_qty > 0 ? `${r.remaining_qty}/${r.qty} left` : 'fully claimed'}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {targetRecord && (
            <div className="space-y-2">
              <Label htmlFor="claim-qty" className="text-xs text-muted-foreground">Quantity to claim *</Label>
              <Input
                id="claim-qty"
                type="number"
                inputMode="numeric"
                min={1}
                max={remaining}
                step={1}
                value={qty}
                disabled={remaining <= 0}
                onChange={(e) => setQty(Math.min(remaining, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                {remaining > 0
                  ? `Up to ${remaining} unit${remaining !== 1 ? 's' : ''} can be claimed — the warranty stays valid for the rest.`
                  : 'This warranty has no remaining coverage to claim.'}
              </p>
              {remaining > 0 && qty > remaining && (
                <p className="text-xs text-destructive">Only {remaining} unit{remaining !== 1 ? 's' : ''} remain under this warranty.</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="claim-issue" className="text-xs text-muted-foreground">Issue description *</Label>
            <Textarea
              id="claim-issue"
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              placeholder="Describe the fault or issue being claimed…"
              className="min-h-24"
            />
          </div>

          <div className="min-h-5">
            {fileClaim.error && (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {fileClaim.error.message}
              </p>
            )}
          </div>
        </div>

        <Separator />

        {/* Footer — normal flow, never sticky */}
        <div className="px-6 py-3 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 md:min-h-0"
            disabled={fileClaim.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="min-h-11 md:min-h-0"
            loading={fileClaim.isPending}
            disabled={!targetRecord || issue.trim() === '' || !qtyValid || fileClaim.isPending}
            onClick={handleSubmit}
          >
            {fileClaim.isPending ? 'Filing…' : 'File claim'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

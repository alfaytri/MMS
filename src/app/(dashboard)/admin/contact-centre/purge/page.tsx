'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DesktopOnlyGate } from '@/components/shared/DesktopOnlyGate'
import { confirmPhrase } from '@/lib/contact-center/confirm-phrase'
import type { PurgeFilter, PurgeSource } from '@/lib/contact-center/purge-filter'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PreviewResult {
  message_count: number
  attachment_bytes: number
}

interface BatchRow {
  id: string
  performed_by: string
  filter_payload: PurgeFilter
  message_count: number
  attachment_bytes: number
  soft_deleted_at: string
  hard_deleted_at: string | null
  restored_at: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-QA')
}

const SOURCE_OPTIONS: { label: string; value: PurgeSource }[] = [
  { label: 'WATI', value: 'whatsapp_api' },
  { label: 'WHAPI', value: 'whatsapp_whapi' },
  { label: '3CX', value: '3cx_call' },
  { label: 'Manual', value: 'manual' },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PurgePage() {
  // --- Filter state ---------------------------------------------------------
  const [filter, setFilter] = useState<PurgeFilter>({
    date_from: '',
    date_to: '',
    sources: [],
    media_only: false,
  })

  // --- Preview state --------------------------------------------------------
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)

  // --- Confirmation state ---------------------------------------------------
  const [typed, setTyped] = useState('')
  const [purging, setPurging] = useState(false)

  // --- History state --------------------------------------------------------
  const [batches, setBatches] = useState<BatchRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // --- Derived values -------------------------------------------------------
  const phrase = useMemo(() => {
    if (!filter.date_from || !filter.date_to) return ''
    return confirmPhrase(filter)
  }, [filter])

  const canConfirm =
    phrase !== '' &&
    typed === phrase &&
    preview !== null &&
    preview.message_count > 0

  // Reset confirmation when filter changes
  useEffect(() => {
    setTyped('')
    setPreview(null)
  }, [filter])

  // Load history on mount
  useEffect(() => {
    void loadHistory()
  }, [])

  // --- Actions --------------------------------------------------------------

  async function loadHistory() {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/admin/contact-centre/purge/history')
      if (!res.ok) {
        toast.error('Failed to load purge history')
        return
      }
      const data = (await res.json()) as { batches: BatchRow[] }
      setBatches(data.batches ?? [])
    } catch {
      toast.error('Failed to load purge history')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handlePreview() {
    if (!filter.date_from || !filter.date_to) {
      toast.error('Please select a date range')
      return
    }
    setPreviewing(true)
    try {
      const res = await fetch('/api/admin/contact-centre/purge/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filter),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Preview failed')
        return
      }
      setPreview(data as PreviewResult)
    } catch {
      toast.error('Preview request failed')
    } finally {
      setPreviewing(false)
    }
  }

  async function handlePurge() {
    if (!canConfirm) return
    setPurging(true)
    try {
      const res = await fetch('/api/admin/contact-centre/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter, confirmation: typed }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Purge failed')
        return
      }
      toast.success(`Soft-deleted ${preview!.message_count} messages`)
      setFilter({ date_from: '', date_to: '', sources: [], media_only: false })
      setTyped('')
      setPreview(null)
      void loadHistory()
    } catch {
      toast.error('Purge request failed')
    } finally {
      setPurging(false)
    }
  }

  async function handleRestore(batchId: string) {
    if (!confirm('Restore this batch?')) return
    try {
      const res = await fetch('/api/admin/contact-centre/purge/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batchId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Restore failed')
        return
      }
      toast.success('Batch restored')
      void loadHistory()
    } catch {
      toast.error('Restore request failed')
    }
  }

  function toggleSource(src: PurgeSource) {
    setFilter((prev) => {
      const current = prev.sources ?? []
      const next = current.includes(src)
        ? current.filter((s) => s !== src)
        : [...current, src]
      return { ...prev, sources: next }
    })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <DesktopOnlyGate>
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
      <h1 className="text-xl font-semibold">Purge Messages</h1>

      {/* ------------------------------------------------------------------ */}
      {/* Filter form                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="rounded-lg border p-5 space-y-5">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Filter
        </h2>

        {/* Date range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="date-from">From</Label>
            <Input
              id="date-from"
              type="date"
              value={filter.date_from}
              onChange={(e) =>
                setFilter((f) => ({ ...f, date_from: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date-to">To</Label>
            <Input
              id="date-to"
              type="date"
              value={filter.date_to}
              onChange={(e) =>
                setFilter((f) => ({ ...f, date_to: e.target.value }))
              }
            />
          </div>
        </div>

        {/* Sources */}
        <div className="space-y-2">
          <Label>Sources</Label>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {SOURCE_OPTIONS.map(({ label, value }) => (
              <div key={value} className="flex items-center gap-2 min-h-[44px]">
                <Checkbox
                  id={`src-${value}`}
                  checked={(filter.sources ?? []).includes(value)}
                  onCheckedChange={() => toggleSource(value)}
                />
                <Label
                  htmlFor={`src-${value}`}
                  className="cursor-pointer text-sm font-normal"
                >
                  {label}
                </Label>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            (none selected = all sources)
          </p>
        </div>

        {/* Media-only */}
        <div className="flex items-center gap-2 min-h-[44px]">
          <Checkbox
            id="media-only"
            checked={filter.media_only ?? false}
            onCheckedChange={(checked) =>
              setFilter((f) => ({ ...f, media_only: checked === true }))
            }
          />
          <Label
            htmlFor="media-only"
            className="cursor-pointer text-sm font-normal"
          >
            Media-only (messages with attachments only)
          </Label>
        </div>

        {/* Preview button + result */}
        <div className="flex flex-wrap items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreview}
            disabled={previewing || !filter.date_from || !filter.date_to}
          >
            {previewing ? 'Previewing…' : 'Preview'}
          </Button>

          {preview !== null && (
            <span className="text-sm text-muted-foreground">
              {preview.message_count === 0 ? (
                'No messages match this filter.'
              ) : (
                <>
                  <strong className="text-foreground">
                    {preview.message_count}
                  </strong>{' '}
                  message{preview.message_count !== 1 ? 's' : ''} ·{' '}
                  <strong className="text-foreground">
                    {bytes(preview.attachment_bytes)}
                  </strong>{' '}
                  attachments
                </>
              )}
            </span>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Confirmation section — only when preview has results                */}
      {/* ------------------------------------------------------------------ */}
      {preview !== null && preview.message_count > 0 && (
        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-5 space-y-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <h2 className="text-sm font-semibold">Confirm destructive action</h2>
          </div>

          <p className="text-sm text-muted-foreground">
            Type the phrase below exactly to enable the delete button:
          </p>

          <pre className="select-all rounded bg-muted px-3 py-2 text-sm font-mono break-all whitespace-pre-wrap">
            {phrase}
          </pre>

          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type the phrase above…"
            spellCheck={false}
            className="font-mono text-sm"
          />

          <Button
            variant="destructive"
            size="sm"
            disabled={!canConfirm || purging}
            onClick={handlePurge}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {purging
              ? 'Deleting…'
              : `Soft-delete ${preview.message_count} message${preview.message_count !== 1 ? 's' : ''}`}
          </Button>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* History list                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Purge History
        </h2>

        {historyLoading && (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        )}

        {!historyLoading && batches.length === 0 && (
          <p className="text-sm text-muted-foreground">No purge batches yet.</p>
        )}

        {batches.map((batch) => {
          const status: 'restored' | 'hard-deleted' | 'soft-deleted' =
            batch.restored_at
              ? 'restored'
              : batch.hard_deleted_at
              ? 'hard-deleted'
              : 'soft-deleted'

          const statusClasses: Record<typeof status, string> = {
            restored:
              'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
            'hard-deleted':
              'bg-muted text-muted-foreground',
            'soft-deleted':
              'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
          }

          return (
            <div
              key={batch.id}
              className="rounded-lg border p-4 flex flex-wrap items-start gap-x-6 gap-y-2"
            >
              {/* Date range */}
              <div className="min-w-[140px]">
                <p className="text-xs text-muted-foreground">Date range</p>
                <p className="text-sm font-medium">
                  {batch.filter_payload.date_from} → {batch.filter_payload.date_to}
                </p>
              </div>

              {/* Counts */}
              <div className="min-w-[110px]">
                <p className="text-xs text-muted-foreground">Messages</p>
                <p className="text-sm font-medium">
                  {batch.message_count.toLocaleString('en-QA')}
                </p>
              </div>

              <div className="min-w-[90px]">
                <p className="text-xs text-muted-foreground">Attachments</p>
                <p className="text-sm font-medium">
                  {bytes(batch.attachment_bytes)}
                </p>
              </div>

              {/* Timestamp */}
              <div className="min-w-[160px]">
                <p className="text-xs text-muted-foreground">Purged at</p>
                <p className="text-sm">{formatDate(batch.soft_deleted_at)}</p>
              </div>

              {/* Status badge */}
              <div className="flex items-center gap-3 ml-auto flex-wrap">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClasses[status]}`}
                >
                  {status}
                </span>

                {status === 'soft-deleted' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => void handleRestore(batch.id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Restore
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </section>
    </div>
    </DesktopOnlyGate>
  )
}

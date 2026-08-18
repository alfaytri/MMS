'use client'

import { toast } from 'sonner'
import { useRecordInspection, type InspectionVerdict } from '@/hooks/useToolInspections'

const OPTIONS: { verdict: InspectionVerdict; label: string; title: string }[] = [
  { verdict: 'good',         label: 'Good',   title: 'Mark condition Good' },
  { verdict: 'bad',          label: 'Bad',    title: 'Bad / needs attention (records condition Fair)' },
  { verdict: 'under_repair', label: 'Repair', title: 'Send to Under-repair' },
]

/** Three-button on-demand condition check for one tool unit (§6 mapping applied server-side). */
export function InspectionVerdictButtons({ unitId, label }: { unitId: string; label: string }) {
  const record = useRecordInspection()

  async function check(verdict: InspectionVerdict, word: string) {
    try {
      await record.mutateAsync({ unitId, verdict })
      toast.success(`${label}: ${word}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record check')
    }
  }

  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label="Condition check">
      {OPTIONS.map((o) => (
        <button
          key={o.verdict}
          type="button"
          title={o.title}
          disabled={record.isPending}
          onClick={() => check(o.verdict, o.label)}
          className="h-8 min-h-11 md:min-h-0 rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

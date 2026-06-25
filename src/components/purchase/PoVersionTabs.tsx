'use client'

import { cn } from '@/lib/utils'
import { PencilLine } from 'lucide-react'
import type { PoVersion, POType } from '@/hooks/usePurchaseOrders'
import { stageOf, type Stage } from '@/lib/poVersionHelper'

interface PoVersionTabsProps {
  versions:        PoVersion[]
  currentPoType:   POType
  activeStage:     Stage
  activeVersion:   number | null  // null = viewing the live current
  onChange:        (stage: Stage, version: number | null) => void
}

const STAGE_ORDER: Stage[] = ['rfq', 'draft', 'po']
const STAGE_LABELS: Record<Stage, string> = {
  rfq:   'RFQ',
  draft: 'Draft',
  po:    'PO',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function PoVersionTabs({
  versions,
  currentPoType,
  activeStage,
  activeVersion,
  onChange,
}: PoVersionTabsProps) {
  const liveStage = stageOf(currentPoType)

  // Bucket versions by stage
  const byStage: Record<Stage, PoVersion[]> = { rfq: [], draft: [], po: [] }
  for (const v of versions) {
    byStage[v.stage].push(v)
  }
  for (const s of STAGE_ORDER) {
    byStage[s].sort((a, b) => a.version_number - b.version_number)
  }

  const selectedVersions = byStage[activeStage]
  const showCurrentChip  = activeStage === liveStage

  return (
    <div className="shrink-0 border-b bg-background">
      {/* Row 1 — stage tabs */}
      <div className="flex items-center gap-1 px-4 md:px-6 pt-3 pb-1 overflow-x-auto">
        {STAGE_ORDER.map((stage) => {
          const count    = byStage[stage].length
          const isActive = stage === activeStage
          const isLive   = stage === liveStage
          return (
            <button
              key={stage}
              type="button"
              onClick={() => onChange(stage, null)}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted',
              )}
              aria-pressed={isActive}
            >
              <span>{STAGE_LABELS[stage]}</span>
              <span className={cn('opacity-75', isActive && 'opacity-90')}>({count})</span>
              {isLive && (
                <span className={cn('ml-0.5', isActive ? 'text-primary-foreground' : 'text-emerald-600')}>
                  ✓
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Row 2 — versions of the selected stage */}
      <div className="flex items-center gap-1 px-4 md:px-6 py-2 overflow-x-auto min-h-[40px]">
        {selectedVersions.length === 0 && !showCurrentChip && (
          <p className="text-xs text-muted-foreground italic">
            No {STAGE_LABELS[activeStage]} versions yet
          </p>
        )}
        {selectedVersions.map((v) => {
          const isActive = activeVersion === v.version_number
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onChange(activeStage, v.version_number)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted',
              )}
            >
              <span>v{v.version_number}</span>
              <span className="opacity-70">·</span>
              <span className="opacity-70">{formatDate(v.submitted_at)}</span>
            </button>
          )
        })}
        {showCurrentChip && (
          <button
            type="button"
            onClick={() => onChange(activeStage, null)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap',
              activeVersion === null
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100',
            )}
          >
            <span>Current</span>
            <PencilLine className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}

// src/components/team-leader/shared/BaseOrderDialog.tsx
'use client'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Info, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  headerLabel: string
  headerSubtitle?: string
  headerColorClass: string
  otherTeams?: string[]
  isLastTeam?: boolean
  onComplete: () => void
  completeLabel?: string
  completeDisabled?: boolean
  children: ReactNode
}

export function BaseOrderDialog({
  open,
  onClose,
  headerLabel,
  headerSubtitle,
  headerColorClass,
  otherTeams = [],
  isLastTeam = true,
  onComplete,
  completeLabel = 'Complete Order',
  completeDisabled = false,
  children,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-xl flex flex-col p-0 gap-0">
        <div className={cn('px-5 py-3 shrink-0', headerColorClass)}>
          <p className="text-base font-bold">{headerLabel}</p>
          {headerSubtitle && (
            <p className="text-[11px] opacity-90">{headerSubtitle}</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {children}

            {otherTeams.length > 0 && (
              <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  Other Teams on This Job
                </div>
                <div className="flex flex-wrap gap-1">
                  {otherTeams.map((t) => (
                    <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t shrink-0 space-y-2">
          {!isLastTeam && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Another team will complete invoicing for this order.</span>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 min-h-11" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className={cn(
                'flex-1 min-h-11',
                isLastTeam
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              )}
              onClick={onComplete}
              disabled={completeDisabled}
            >
              {isLastTeam ? completeLabel : 'Mark Complete — Other Team Will Invoice'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

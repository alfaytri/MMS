'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { ClipboardCheck, Users, CheckCircle2, Clock, XCircle, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useInventoryChecks } from '@/hooks/useWarehouseOperations'
import type { Warehouse } from '@/hooks/useWarehouses'
import type { Profile } from '@/hooks/useProfiles'
import { format } from 'date-fns'
import { WhInventoryCheckStartDialog } from '@/components/purchase/wh/WhInventoryCheckStartDialog'
import { WarehouseReportButton } from './WarehouseReportButton'
import { WhInventoryCheckDetail }      from '@/components/purchase/wh/WhInventoryCheckDetail'
import type { InventoryCheck }         from '@/hooks/useWarehouseOperations'

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  in_progress:     { icon: <Clock className="h-4 w-4" />,         color: 'text-blue-600',      bg: 'bg-blue-500/10',    label: 'In Progress'      },
  pending_approval:{ icon: <Clock className="h-4 w-4" />,         color: 'text-warning',       bg: 'bg-warning/10',     label: 'Pending Approval' },
  approved:        { icon: <CheckCircle2 className="h-4 w-4" />,  color: 'text-success',       bg: 'bg-success/10',     label: 'Approved'         },
  rejected:        { icon: <XCircle className="h-4 w-4" />,       color: 'text-destructive',   bg: 'bg-destructive/10', label: 'Rejected'         },
  submitted:       { icon: <Clock className="h-4 w-4" />,         color: 'text-warning',       bg: 'bg-warning/10',     label: 'Submitted'        },
  draft:           { icon: <Clock className="h-4 w-4" />,         color: 'text-muted-foreground', bg: 'bg-muted/20',   label: 'Draft'            },
}

interface Props {
  warehouses: Warehouse[]
  currentProfile: Profile | null
}

export const WhInventoryChecksTab = React.memo(function WhInventoryChecksTab({ warehouses, currentProfile }: Props) {
  const { data: checks = [] } = useInventoryChecks()
  const [selectedCheck, setSelectedCheck] = useState<InventoryCheck | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25
  const totalPages = Math.max(1, Math.ceil(checks.length / PAGE_SIZE))
  useEffect(() => { setPage(1) }, [checks.length])
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return checks.slice(start, start + PAGE_SIZE)
  }, [checks, page])

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header with new check button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Inventory Checks</h3>
          <p className="text-[10px] text-muted-foreground">
            Team-based physical stock counts with multi-step approval
          </p>
        </div>
        <div className="flex items-center gap-2">
          <WarehouseReportButton reportType="inventory-checks" label="Report" />
          <WhInventoryCheckStartDialog warehouses={warehouses} currentProfile={currentProfile}>
            <Button size="sm" variant="outline" className="gap-1.5 h-8 min-h-11 md:min-h-0 text-xs">
              <ClipboardCheck className="h-3.5 w-3.5" />
              New Check
            </Button>
          </WhInventoryCheckStartDialog>
        </div>
      </div>

      {/* Check list */}
      {checks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2">
          <ClipboardCheck className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">No inventory checks yet.</p>
          <WhInventoryCheckStartDialog warehouses={warehouses} currentProfile={currentProfile}>
            <Button size="sm" variant="outline" className="gap-1.5 min-h-11 md:min-h-0 text-xs mt-1">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Start first check
            </Button>
          </WhInventoryCheckStartDialog>
        </div>
      ) : (
        <div className="space-y-1.5">
          {paged.map((c) => {
            const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.draft
            const isActive = c.status === 'in_progress' || c.status === 'pending_approval'
            return (
              <div
                key={c.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors ${isActive ? 'border-primary/20 bg-primary/5' : ''}`}
                onClick={() => setSelectedCheck(c)}
              >
                {/* Status icon */}
                <div className={`h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
                  {cfg.icon}
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold">{c.check_number}</span>
                    <Badge className={`text-[10px] px-1.5 py-0 ${cfg.bg} ${cfg.color} border-0`}>
                      {cfg.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">{c.warehouse_name}</span>
                    {c.initiated_by_name && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Users className="h-2.5 w-2.5" />
                        by {c.initiated_by_name}
                      </span>
                    )}
                    {/* Legacy: submitted_by_name */}
                    {!c.initiated_by_name && c.submitted_by_name && (
                      <span className="text-[10px] text-muted-foreground">by {c.submitted_by_name}</span>
                    )}
                  </div>
                </div>

                {/* Date + view */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-muted-foreground">
                    {c.started_at
                      ? format(new Date(c.started_at), 'dd MMM')
                      : c.created_at
                      ? format(new Date(c.created_at), 'dd MMM')
                      : ''}
                  </span>
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {checks.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>{checks.length} check{checks.length !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 min-h-11 min-w-11 md:min-h-0 md:min-w-0" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="tabular-nums min-w-[80px] text-center">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 min-h-11 min-w-11 md:min-h-0 md:min-w-0" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Next page">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail dialog */}
      {selectedCheck && (
        <WhInventoryCheckDetail
          check={selectedCheck}
          open={!!selectedCheck}
          onClose={() => setSelectedCheck(null)}
          currentProfile={currentProfile}
        />
      )}
    </div>
  )
})

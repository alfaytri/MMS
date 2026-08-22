'use client'

import { Pencil, Archive } from 'lucide-react'
import { TableCell, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SubscriptionPackageWithCount } from '@/hooks/useSubscriptionPackages'

const PRIORITY_BADGE: Record<string, { label: string; className: string }> = {
  none:        { label: '—',        className: 'bg-muted text-muted-foreground' },
  '24_48hr':   { label: '24–48 HR', className: 'bg-warning/10 text-warning' },
  under_24hr:  { label: '< 24 HR',  className: 'bg-primary/10 text-primary' },
}

interface Props {
  pkg: SubscriptionPackageWithCount
  showStatus: boolean
  onEdit: (pkg: SubscriptionPackageWithCount) => void
  onArchive: (pkg: SubscriptionPackageWithCount) => void
}

export function SubscriptionPackageRow({ pkg, showStatus, onEdit, onArchive }: Props) {
  const priority = PRIORITY_BADGE[pkg.priority_response] ?? PRIORITY_BADGE.none

  return (
    <TableRow className={cn(!pkg.is_active && 'opacity-50')}>
      {/* Name */}
      <TableCell className="text-xs">
        <p className="font-medium">{pkg.name}</p>
        {pkg.name_ar && (
          <p className="text-muted-foreground text-[10px] text-right" dir="rtl">
            {pkg.name_ar}
          </p>
        )}
      </TableCell>

      {/* Discount */}
      <TableCell>
        <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-0">
          {pkg.discount_percent}%
        </Badge>
      </TableCell>

      {/* Initial Fee */}
      <TableCell className="text-xs">
        QAR {Number(pkg.initial_fee).toLocaleString('en-QA', { minimumFractionDigits: 0 })}
      </TableCell>

      {/* Priority */}
      <TableCell>
        <Badge className={cn('text-[10px] px-1.5 py-0 border-0', priority.className)}>
          {priority.label}
        </Badge>
      </TableCell>

      {/* Services count — sourced from the DB view, no extra query */}
      <TableCell>
        <span className="text-[10px] border border-primary/30 text-primary rounded-full px-2 py-0.5">
          {pkg.service_count} services
        </span>
      </TableCell>

      {/* Duration */}
      <TableCell className="text-xs">{pkg.duration_months} mo</TableCell>

      {/* Subscribers */}
      <TableCell>
        <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-2 py-0.5 font-medium">
          {pkg.subscriber_count}
        </span>
      </TableCell>

      {/* Status — only visible when Show Archived is on */}
      {showStatus && (
        <TableCell>
          <Badge
            className={cn(
              'text-[10px] px-1.5 py-0 border-0',
              pkg.is_active
                ? 'bg-success/10 text-success'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {pkg.is_active ? 'Active' : 'Archived'}
          </Badge>
        </TableCell>
      )}

      {/* Actions */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onEdit(pkg)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          {pkg.is_active && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onArchive(pkg)}
            >
              <Archive className="h-3 w-3" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

/**
 * Visual chain of approval steps for a Sales Order slip — mirrors
 * `PoApprovalChain` so the Sales Approvals page and PO Approvals page look
 * identical. Each row in the slip becomes a colored disc:
 *   approved  → green check
 *   rejected  → red cross
 *   pending + active   → primary pulse with role abbreviation
 *   pending + inactive → muted (a later step in the chain)
 */

import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SalesApprovalRow } from '@/hooks/useSalesApprovals'

const ROLE_ABBR: Record<string, string> = {
  purchase_manager: 'PM',
  accountant:       'AC',
  sales_manager:    'SM',
  owner:            'OW',
  finance_manager:  'FM',
  brand_manager:    'BM',
}

function abbrFor(role: string | null): string {
  if (!role) return '?'
  if (ROLE_ABBR[role]) return ROLE_ABBR[role]
  // Fallback: first letter of each word, max 2 chars
  return role
    .split(/[_\s]+/)
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'
}

export function SoApprovalChain({ rows }: { rows: SalesApprovalRow[] }) {
  if (!rows || rows.length === 0) return null

  // Show only the latest iteration's rows
  const maxIter = Math.max(...rows.map((r) => r.iteration ?? 1))
  const current = rows
    .filter((r) => (r.iteration ?? 1) === maxIter)
    .sort((a, b) => a.step_order - b.step_order)

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {current.map((row, idx) => (
        <div key={row.id} className="flex items-center gap-0.5">
          {idx > 0 && <div className="h-px w-3 bg-muted-foreground/30" />}
          <div
            title={`${row.step_role ?? '?'}: ${row.status}`}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold',
              row.status === 'approved'              && 'border-success bg-success/10 text-success',
              row.status === 'rejected'              && 'border-destructive bg-destructive/10 text-destructive',
              row.status === 'pending' && row.is_active  && 'border-primary/40 bg-primary/5 text-primary animate-pulse',
              row.status === 'pending' && !row.is_active && 'border-muted-foreground/20 bg-muted text-muted-foreground/50',
            )}
          >
            {row.status === 'approved' ? (
              <Check className="h-3 w-3" />
            ) : row.status === 'rejected' ? (
              <X className="h-3 w-3" />
            ) : (
              <span>{abbrFor(row.step_role)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

'use client'

import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RiskTier } from '@/lib/customers/risk'

interface Props {
  tier: RiskTier | null | undefined
  /** 'badge' = pill w/ label; 'dot' = small square; 'bar' = absolute left accent (card must be relative + overflow-hidden). */
  variant?: 'badge' | 'dot' | 'bar'
  className?: string
}

/**
 * Renders a customer's payment-risk tier consistently everywhere (pending
 * cards, order booking, contact centre). The tier color is admin-chosen and
 * arbitrary, so the badge keeps the label in the normal text color and shows
 * the color as a dot + tint + border — always readable whatever hue is picked.
 */
export function CustomerRiskIndicator({ tier, variant = 'badge', className }: Props) {
  if (!tier) return null

  if (variant === 'bar') {
    return (
      <span
        aria-hidden="true"
        className={cn('absolute left-0 top-0 bottom-0 w-[5px]', className)}
        style={{ background: tier.color }}
      />
    )
  }

  if (variant === 'dot') {
    return (
      <span
        aria-hidden="true"
        className={cn('inline-block h-3 w-3 rounded-[3px]', className)}
        style={{ background: tier.color }}
      />
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium text-foreground',
        className,
      )}
      style={{ backgroundColor: `${tier.color}14`, borderColor: tier.color }}
      title={tier.requires_approval ? `${tier.label} — new orders need approval` : tier.label}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: tier.color }} />
      {tier.label}
      {tier.requires_approval && <Lock className="h-3 w-3 text-muted-foreground" />}
    </span>
  )
}

'use client'

import { Minus, Plus } from 'lucide-react'

// Big − N + stepper — never a keyboard. Buttons are ≥44px touch targets and
// the whole control keeps a fixed height (no layout shift on change).
export function QtyStepper({
  value,
  min = 1,
  max,
  onChange,
}: {
  value: number
  min?: number
  max?: number
  onChange: (n: number) => void
}) {
  const clamp = (n: number) => Math.max(min, max != null ? Math.min(max, n) : n)
  return (
    <div className="flex items-center justify-between rounded-xl bg-primary/10 p-1.5">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className="grid h-11 w-11 place-items-center rounded-lg bg-background text-primary shadow-sm transition disabled:opacity-40"
      >
        <Minus className="h-5 w-5" />
      </button>
      <span className="min-w-[2ch] text-center text-2xl font-extrabold tabular-nums text-primary">{value}</span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={max != null && value >= max}
        aria-label="Increase quantity"
        className="grid h-11 w-11 place-items-center rounded-lg bg-background text-primary shadow-sm transition disabled:opacity-40"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  )
}

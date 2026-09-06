'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { useCustomerRiskTiers, useSaveCustomerRiskTiers } from '@/hooks/useCustomerRiskTiers'
import type { RiskTier } from '@/lib/customers/risk'

export function CustomerRiskSettingsAdmin() {
  const { data: saved, isLoading } = useCustomerRiskTiers()
  const save = useSaveCustomerRiskTiers()
  const [tiers, setTiers] = useState<RiskTier[]>([])

  useEffect(() => {
    if (saved) setTiers(saved)
  }, [saved])

  function patch(i: number, p: Partial<RiskTier>) {
    setTiers((t) => t.map((x, j) => (j === i ? { ...x, ...p } : x)))
  }
  function remove(i: number) {
    setTiers((t) => t.filter((_, j) => j !== i))
  }
  function add() {
    const maxDays = tiers.reduce((m, t) => Math.max(m, t.min_days), -30)
    setTiers((t) => [
      ...t,
      { id: `tier_${Date.now()}`, label: 'New tier', min_days: maxDays + 30, color: '#888780', requires_approval: false },
    ])
  }

  const days = tiers.map((t) => t.min_days)
  const hasDupDays = new Set(days).size !== days.length
  const hasEmptyLabel = tiers.some((t) => !t.label.trim())
  const hasNegative = days.some((d) => !Number.isFinite(d) || d < 0)
  const valid = tiers.length > 0 && !hasDupDays && !hasEmptyLabel && !hasNegative
  const dirty = JSON.stringify(saved ?? []) !== JSON.stringify(tiers)

  async function handleSave() {
    if (!valid) {
      toast.error('Fix the tiers first — each needs a label and a unique, non-negative day threshold.')
      return
    }
    try {
      await save.mutateAsync([...tiers].sort((a, b) => a.min_days - b.min_days))
      toast.success('Risk tiers saved')
    } catch (e) {
      toast.error((e as Error).message || 'Failed to save')
    }
  }

  if (isLoading) {
    return <p className="py-6 text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-xs text-muted-foreground">
        A customer&apos;s tier is decided by how many days their <span className="font-medium">oldest unpaid order
        invoice</span> has been outstanding — the highest tier whose threshold they&apos;ve passed. Tiers marked
        &ldquo;needs approval&rdquo; route that customer&apos;s new orders through the Service Order Approval queue.
      </p>

      {/* Header row */}
      <div className="hidden sm:grid grid-cols-[1fr,120px,150px,120px,40px] gap-3 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Label</span>
        <span>Oldest unpaid ≥</span>
        <span>Color</span>
        <span>Needs approval</span>
        <span />
      </div>

      <div className="space-y-2">
        {tiers.map((tier, i) => (
          <div
            key={tier.id}
            className="grid grid-cols-2 sm:grid-cols-[1fr,120px,150px,120px,40px] items-center gap-3 rounded-lg border bg-card p-3"
          >
            <Input
              value={tier.label}
              onChange={(e) => patch(i, { label: e.target.value })}
              placeholder="Tier name"
              className="h-9"
            />
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                value={tier.min_days}
                onChange={(e) => patch(i, { min_days: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                className="h-9"
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={tier.color}
                onChange={(e) => patch(i, { color: e.target.value })}
                aria-label={`${tier.label} color`}
                className="h-9 w-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
              />
              <Input
                value={tier.color}
                onChange={(e) => patch(i, { color: e.target.value })}
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={tier.requires_approval}
                onCheckedChange={(v) => patch(i, { requires_approval: v })}
                aria-label={`${tier.label} needs approval`}
              />
              {tier.requires_approval && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-destructive hover:bg-destructive/10 justify-self-end"
              onClick={() => remove(i)}
              aria-label={`Remove ${tier.label}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {hasDupDays && (
        <p className="text-xs text-destructive">Two tiers share the same day threshold — make each unique.</p>
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={add}>
          <Plus className="h-4 w-4" /> Add tier
        </Button>
        <Button onClick={handleSave} disabled={!valid || !dirty || save.isPending} className="gap-1.5">
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  )
}

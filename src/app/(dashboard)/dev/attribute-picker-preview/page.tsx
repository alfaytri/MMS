'use client'

/**
 * Scratch route for smoke-testing the guided attribute picker in isolation
 * BEFORE Phase 5 wires it into production surfaces (SO, quotations,
 * service links, consumption). Not linked from any nav — reach it by
 * typing the URL directly.
 *
 * SAFE TO DELETE once Phase 5 has landed and Phase 6 smoke is done.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ProductAttributePicker } from '@/components/shared/ProductAttributePicker'
import { useInventoryCategories } from '@/hooks/useInventory'

export default function AttributePickerPreviewPage() {
  const { data: categories = [] } = useInventoryCategories()
  const active = categories.filter((c) => c.status === 'active')

  const [lockedCategoryId, setLockedCategoryId] = useState<string | null>(null)
  const [lastPick, setLastPick] = useState<{ itemId: string; brandVariantId: string; at: string } | null>(null)
  const [key, setKey] = useState(0) // remount to reset picker state

  const handlePick = (itemId: string, brandVariantId: string) => {
    setLastPick({ itemId, brandVariantId, at: new Date().toLocaleTimeString() })
    toast.success(`Picked item ${itemId.slice(0, 8)} — variant ${brandVariantId.slice(0, 8)}`)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Attribute Picker — Preview</h1>
        <p className="text-xs text-muted-foreground">
          Scratch page for smoke-testing <code className="font-mono">ProductAttributePicker</code>. Not linked from nav.
          Delete after Phase 5 lands.
        </p>
      </header>

      <section className="rounded-lg border p-4 space-y-3 bg-card">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[240px] space-y-1">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Lock category (optional)
            </label>
            <Select
              value={lockedCategoryId ?? ''}
              onValueChange={(v) => {
                setLockedCategoryId(v || null)
                setKey((k) => k + 1)
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Unlocked — operator picks category inside" />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                <SelectItem value="__none__">— unlocked —</SelectItem>
                {active.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={() => setKey((k) => k + 1)}>
            Reset picker state
          </Button>
        </div>
      </section>

      <section className="rounded-lg border p-4 bg-background">
        <ProductAttributePicker
          key={key}
          categoryFilter={lockedCategoryId && lockedCategoryId !== '__none__' ? lockedCategoryId : undefined}
          onPick={handlePick}
          title="Guided item pick"
        />
      </section>

      {lastPick && (
        <section className="rounded-lg border p-3 text-xs bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900">
          <div className="font-medium mb-1">Last pick (fired at {lastPick.at})</div>
          <div className="font-mono text-[11px] space-y-0.5">
            <div>item_id:          {lastPick.itemId}</div>
            <div>brand_variant_id: {lastPick.brandVariantId}</div>
          </div>
        </section>
      )}
    </div>
  )
}

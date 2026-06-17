'use client'
import { useEffect, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ConfirmFollowUpBody } from '@/types/follow-ups'

interface ParentService { id: string; name: string; qty: number; duration: number | null }

interface Props {
  parentServices: ParentService[]
  initialSelectedIds?: Set<string>
  onChange: (value: {
    reused_services: ConfirmFollowUpBody['reused_services']
    new_services:    ConfirmFollowUpBody['new_services']
  }) => void
}

export function FollowUpServiceSection({ parentServices, initialSelectedIds, onChange }: Props) {
  const [selected, setSelected] = useState<Set<string>>(initialSelectedIds ?? new Set())
  const [newSvcs, setNewSvcs] = useState<ConfirmFollowUpBody['new_services']>([])

  // Re-sync selection when pre-filled IDs arrive from a Path A request
  useEffect(() => {
    if (initialSelectedIds) setSelected(initialSelectedIds)
  }, [initialSelectedIds])

  useEffect(() => {
    const reused = parentServices
      .filter((s) => selected.has(s.id))
      .map((s) => ({ parent_order_service_id: s.id, name: s.name, qty: s.qty, duration: s.duration }))
    onChange({ reused_services: reused, new_services: newSvcs })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, newSvcs])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addNew() {
    setNewSvcs((prev) => [...prev, { service_id: '', name: '', path: [], qty: 1, price: 0, duration: null }])
  }

  function patchNew(i: number, patch: Partial<ConfirmFollowUpBody['new_services'][number]>) {
    setNewSvcs((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  function removeNew(i: number) {
    setNewSvcs((prev) => prev.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-semibold">From parent order (0 QAR)</p>
        {parentServices.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No services on the parent order.</p>
        ) : (
          parentServices.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded border p-2 min-h-11 cursor-pointer">
              <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
              <span className="text-sm flex-1">{s.name}</span>
              <span className="text-xs text-muted-foreground">×{s.qty}</span>
            </label>
          ))
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Add new services (charged)</p>
        {newSvcs.map((s, i) => (
          <div key={i} className="rounded border p-2 grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_auto] gap-2">
            <Input
              placeholder="Name"
              value={s.name}
              onChange={(e) => patchNew(i, { name: e.target.value })}
              className="h-11"
            />
            <Input
              type="number" min={1} placeholder="Qty"
              value={s.qty || ''}
              onChange={(e) => patchNew(i, { qty: Number(e.target.value) || 1 })}
              className="h-11"
            />
            <Input
              type="number" min={0} placeholder="Price"
              value={s.price || ''}
              onChange={(e) => patchNew(i, { price: Number(e.target.value) || 0 })}
              className="h-11"
            />
            <Button variant="ghost" size="sm" onClick={() => removeNew(i)} className="h-11">×</Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addNew} className="h-11">+ Add service</Button>
      </div>
    </div>
  )
}

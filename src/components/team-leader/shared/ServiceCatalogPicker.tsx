// src/components/team-leader/shared/ServiceCatalogPicker.tsx
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useServiceTree } from '@/hooks/useServices'
import type { AddedBillableService } from '@/types/team-leader'

interface ServiceNode {
  id: string
  name_en: string
  parent_id: string | null
  price: number | null
}

const PLACEHOLDERS = [
  'Select category…',
  'Select sub-category…',
  'Select service…',
  'Select sub-service…',
  'Select…',
]

interface Props {
  onAdd: (service: AddedBillableService) => void
}

export function ServiceCatalogPicker({ onAdd }: Props) {
  const { data: services = [] } = useServiceTree('normal', [], true)
  const [selections, setSelections] = useState<Record<number, string>>({})
  const [qty, setQty] = useState(1)

  function getChildren(parentId: string | null): ServiceNode[] {
    return (services ?? []).filter((s: ServiceNode) => s.parent_id === parentId)
  }

  function getOptionsForLevel(level: number): ServiceNode[] {
    if (level === 0) return getChildren(null)
    const parentId = selections[level - 1]
    if (!parentId) return []
    return getChildren(parentId)
  }

  function handleLevelChange(level: number, value: string) {
    const newSelections: Record<number, string> = {}
    for (let i = 0; i < level; i++) newSelections[i] = selections[i]
    newSelections[level] = value
    setSelections(newSelections)
    setQty(1)
  }

  let deepestFilledLevel = -1
  for (let i = 0; i <= 4; i++) {
    if (selections[i]) deepestFilledLevel = i
    else break
  }
  const lastSelectedId = deepestFilledLevel >= 0 ? selections[deepestFilledLevel] : undefined
  const lastSelected = lastSelectedId
    ? (services ?? []).find((s: ServiceNode) => s.id === lastSelectedId)
    : null
  const isLeaf = lastSelected ? getChildren(lastSelected.id).length === 0 : false

  const level4Options = getOptionsForLevel(4)
  const show5th = !!selections[3] && level4Options.length > 0

  function handleAdd() {
    if (!lastSelected || !isLeaf) return
    const pathNames = Array.from(
      { length: deepestFilledLevel + 1 },
      (_, i) => (services ?? []).find((s: ServiceNode) => s.id === selections[i])?.name_en ?? ''
    )
    onAdd({
      id: lastSelected.id,
      name: lastSelected.name_en,
      path: pathNames.join(' › '),
      qty,
      unitPrice: lastSelected.price ?? 0,
    })
    setSelections({})
    setQty(1)
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }, (_, i) => {
          const options = getOptionsForLevel(i)
          const isDisabled = i > 0 && !selections[i - 1]
          return (
            <Select
              key={i}
              value={selections[i] ?? ''}
              onValueChange={(v) => handleLevelChange(i, v ?? '')}
              disabled={isDisabled || options.length === 0}
            >
              <SelectTrigger className="h-11 w-full overflow-hidden">
                <SelectValue placeholder={PLACEHOLDERS[i]} />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        })}
      </div>

      {show5th && (
        <Select
          value={selections[4] ?? ''}
          onValueChange={(v) => handleLevelChange(4, v ?? '')}
        >
          <SelectTrigger className="h-11">
            <SelectValue placeholder={PLACEHOLDERS[4]} />
          </SelectTrigger>
          <SelectContent>
            {level4Options.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.name_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {isLeaf && lastSelected && (
        <div className="rounded-md border bg-muted/50 p-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-14 rounded border bg-background px-2 py-1 text-center text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Quantity"
            />
            <span className="flex-1 text-right text-xs text-muted-foreground">
              QAR {((lastSelected.price ?? 0) * qty).toFixed(0)}
            </span>
            <Button size="sm" className="h-8 gap-1" onClick={handleAdd}>
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useServiceTree } from '@/hooks/useServices'
import type { OrderServiceDraft } from '@/types/orders'

interface ServiceNode {
  id: string
  name_en: string
  parent_id: string | null
  price: number | null
  duration: number | null
  division: string[] | null
}

interface Props {
  onAdd: (service: OrderServiceDraft) => void
  divisionFilters?: string[]
  treeType?: string
}

const PLACEHOLDERS = [
  'Select category…',
  'Select sub-category…',
  'Select service…',
  'Select sub-service…',
  'Select…',
]

export function ServiceSelector({ onAdd, divisionFilters = [], treeType = 'normal' }: Props) {
  const { data: services = [] } = useServiceTree(treeType, divisionFilters, true)
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

  // Find deepest consecutive filled level
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
      serviceId: lastSelected.id as string,
      serviceName: lastSelected.name_en,
      path: pathNames,
      qty,
      price: lastSelected.price ?? 0,
      duration: lastSelected.duration ?? 0,
      rootSkillId: lastSelected.id as string,
    })
    setSelections({})
    setQty(1)
  }

  return (
    <div className="space-y-2">
      {/* Fixed 2×2 grid — all four slots always visible */}
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }, (_, i) => {
          const options = getOptionsForLevel(i)
          const isDisabled = i > 0 && !selections[i - 1]
          return (
            <div key={i} className="min-w-0">
              <Select
                value={selections[i] ?? ''}
                onValueChange={(v) => handleLevelChange(i, v ?? '')}
                disabled={isDisabled || options.length === 0}
              >
                <SelectTrigger className="h-9 w-full overflow-hidden">
                  <SelectValue placeholder={PLACEHOLDERS[i]} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id as string}>
                      {opt.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        })}
      </div>

      {/* 5th slot — appears only when the 4th has children */}
      {show5th && (
        <Select
          value={selections[4] ?? ''}
          onValueChange={(v) => handleLevelChange(4, v ?? '')}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder={PLACEHOLDERS[4]} />
          </SelectTrigger>
          <SelectContent>
            {level4Options.map((opt) => (
              <SelectItem key={opt.id} value={opt.id as string}>
                {opt.name_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Add panel — shows when a leaf node is selected */}
      {isLeaf && lastSelected && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="flex items-center gap-2">
            {/* Qty free input */}
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-14 rounded border border-slate-200 bg-white px-2 py-1 text-center text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-400"
              aria-label="Quantity"
            />

            {/* Total price updates as qty changes */}
            <span className="flex-1 text-right text-xs text-slate-500">
              QAR {((lastSelected.price ?? 0) * qty).toFixed(0)}
            </span>

            {/* Add button */}
            <Button size="sm" className="h-8 gap-1" onClick={handleAdd}>
              <Plus className="h-3.5 w-3.5" />
              Add Service
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

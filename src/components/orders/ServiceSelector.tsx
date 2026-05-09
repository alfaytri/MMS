'use client'
import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Plus, Minus } from 'lucide-react'
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

export function ServiceSelector({ onAdd, divisionFilters = [], treeType = 'normal' }: Props) {
  const { data: services = [] } = useServiceTree(treeType, divisionFilters, true)
  const [selections, setSelections] = useState<Record<number, string>>({})
  const [qty, setQty] = useState(1)

  function getChildren(parentId: string | null): ServiceNode[] {
    return (services ?? []).filter((s: ServiceNode) => s.parent_id === parentId)
  }

  function buildLevels(): Array<{ options: ServiceNode[]; selectedId: string | undefined }> {
    const levels = []
    let parentId: string | null = null
    let levelIndex = 0
    while (true) {
      const options = getChildren(parentId)
      if (options.length === 0) break
      const selectedId = selections[levelIndex]
      levels.push({ options, selectedId })
      if (!selectedId) break
      parentId = selectedId
      levelIndex++
    }
    return levels
  }

  const levels = buildLevels()
  const lastSelectedId = selections[Object.keys(selections).length - 1]
  const lastSelected = lastSelectedId
    ? (services ?? []).find((s: ServiceNode) => s.id === lastSelectedId)
    : null
  const isLeaf = lastSelected && getChildren(lastSelected.id).length === 0

  function handleLevelChange(level: number, value: string) {
    const newSelections: Record<number, string> = {}
    for (let i = 0; i < level; i++) newSelections[i] = selections[i]
    newSelections[level] = value
    setSelections(newSelections)
    setQty(1)
  }

  function handleAdd() {
    if (!lastSelected || !isLeaf) return
    const pathNames = Object.values(selections).map(
      (id) => (services ?? []).find((s: ServiceNode) => s.id === id)?.name_en ?? ''
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
      {levels.map((level, i) => (
        <Select
          key={i}
          value={(level.selectedId ?? '') as string}
          onValueChange={(v) => handleLevelChange(i, v ?? '')}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder={i === 0 ? 'Select category…' : 'Select…'} />
          </SelectTrigger>
          <SelectContent>
            {level.options.map((opt) => (
              <SelectItem key={opt.id} value={opt.id as string}>
                {opt.name_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {isLeaf && lastSelected && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="flex items-center gap-2">
            {/* Qty stepper */}
            <div className="flex items-center rounded border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                className="px-1.5 py-1 text-slate-500 hover:text-slate-900 disabled:opacity-40"
                aria-label="Decrease quantity"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-6 select-none text-center text-xs font-medium text-slate-900">
                {qty}
              </span>
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                className="px-1.5 py-1 text-slate-500 hover:text-slate-900"
                aria-label="Increase quantity"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            {/* Unit price */}
            <span className="flex-1 text-right text-xs text-slate-500">
              QAR {lastSelected.price ?? 0}
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

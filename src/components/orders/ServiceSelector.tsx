'use client'
import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Clock } from 'lucide-react'
import { useServiceTree } from '@/hooks/useServices'
import type { OrderServiceDraft } from '@/types/orders'

interface ServiceNode {
  id: string
  name_en: string
  parent_id: string | null
  price: number | null
  duration: number | null
  division: string
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
    return (services ?? []).filter((s: ServiceNode) =>
      s.parent_id === parentId &&
      (divisionFilters.length === 0 || divisionFilters.includes(s.division))
    )
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
        <Select key={i} value={(level.selectedId ?? '') as string} onValueChange={(v) => handleLevelChange(i, v ?? '')}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder={i === 0 ? 'Select category…' : 'Select…'} />
          </SelectTrigger>
          <SelectContent>
            {level.options.map((opt) => (
              <SelectItem key={opt.id} value={opt.id as string}>{opt.name_en}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {isLeaf && lastSelected && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-slate-500">
              <Clock className="h-3.5 w-3.5" /> {lastSelected.duration} min
            </span>
            <span className="font-semibold text-slate-900">QAR {lastSelected.price}</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="h-8 w-16 text-center"
            />
            <Button size="sm" className="flex-1 h-8 gap-1" onClick={handleAdd}>
              <Plus className="h-3.5 w-3.5" /> Add Service
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

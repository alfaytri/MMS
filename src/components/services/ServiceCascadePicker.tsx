'use client'
import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useServiceTree } from '@/hooks/useServices'

/**
 * A single leaf node picked from the cascade — the raw shape each consumer maps
 * into its own draft type (order line, team-leader billable, …).
 */
export interface CascadePickedService {
  id: string
  name_en: string
  parent_id: string | null
  price: number | null
  emergency_price: number | null
  duration: number | null
  division: string[] | null
}

interface Props {
  /** Called with the chosen leaf, its quantity, and the tree-path names (root→leaf). */
  onAdd: (service: CascadePickedService, qty: number, pathNames: string[]) => void
  treeType?: string
  divisionFilters?: string[]
  /** Trigger height: 'sm' = h-9 (order/quotation forms), 'md' = h-11 (team-leader dialogs). */
  size?: 'sm' | 'md'
}

const PLACEHOLDERS = [
  'Select category…',
  'Select sub-category…',
  'Select service…',
  'Select sub-service…',
  'Select…',
]

/**
 * The single cascading category→sub-category→service→sub-service picker shared
 * by the order/quotation forms and the team-leader dialogs. Reads the flat
 * `useServiceTree` list and walks it by `parent_id`; emits the leaf via `onAdd`.
 * (The contract flow keeps its own dialog — it configures pricing per node.)
 */
export function ServiceCascadePicker({ onAdd, treeType = 'normal', divisionFilters = [], size = 'sm' }: Props) {
  const { data: services = [] } = useServiceTree(treeType, divisionFilters, true)
  const [selections, setSelections] = useState<Record<number, string>>({})
  const [qty, setQty] = useState(1)

  const triggerH = size === 'md' ? 'h-11' : 'h-9'

  function getChildren(parentId: string | null): CascadePickedService[] {
    return (services ?? []).filter((s: CascadePickedService) => s.parent_id === parentId)
  }

  function getOptionsForLevel(level: number): CascadePickedService[] {
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

  // Deepest consecutively-filled level
  let deepestFilledLevel = -1
  for (let i = 0; i <= 4; i++) {
    if (selections[i]) deepestFilledLevel = i
    else break
  }
  const lastSelectedId = deepestFilledLevel >= 0 ? selections[deepestFilledLevel] : undefined
  const lastSelected = lastSelectedId
    ? (services ?? []).find((s: CascadePickedService) => s.id === lastSelectedId)
    : null
  const isLeaf = lastSelected ? getChildren(lastSelected.id).length === 0 : false

  const level4Options = getOptionsForLevel(4)
  const show5th = !!selections[3] && level4Options.length > 0

  function handleAdd() {
    if (!lastSelected || !isLeaf) return
    const pathNames = Array.from(
      { length: deepestFilledLevel + 1 },
      (_, i) => (services ?? []).find((s: CascadePickedService) => s.id === selections[i])?.name_en ?? '',
    )
    onAdd(lastSelected, qty, pathNames)
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
                <SelectTrigger className={`${triggerH} w-full overflow-hidden`}>
                  <SelectValue placeholder={PLACEHOLDERS[i]} />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {options.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
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
        <Select value={selections[4] ?? ''} onValueChange={(v) => handleLevelChange(4, v ?? '')}>
          <SelectTrigger className={triggerH}>
            <SelectValue placeholder={PLACEHOLDERS[4]} />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto">
            {level4Options.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.name_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Add panel — shows when a leaf node is selected */}
      {isLeaf && lastSelected && (
        <div className="rounded-md border border-border bg-muted p-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-14 rounded border border-border bg-white px-2 py-1 text-center text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-orange-400"
              aria-label="Quantity"
            />

            <span className="flex-1 text-right text-xs text-muted-foreground">
              QAR {((lastSelected.price ?? 0) * qty).toFixed(0)}
            </span>

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

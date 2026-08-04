'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, ArrowUp, ArrowDown, Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import {
  useAttributeOptionsForDefinition,
  useUpsertAttributeOption,
  useDeleteAttributeOption,
  type AttributeOption,
} from '@/hooks/useAttributes'

type Props = {
  definitionId: string
  disabled?: boolean
}

export function AttributeOptionsEditor({ definitionId, disabled }: Props) {
  const { data: options = [] } = useAttributeOptionsForDefinition(definitionId)
  const upsert = useUpsertAttributeOption()
  const del = useDeleteAttributeOption()

  const sorted = useMemo(() => [...options].sort((a, b) => a.sort_order - b.sort_order), [options])

  const [newEn, setNewEn] = useState('')
  const [newAr, setNewAr] = useState('')

  async function handleAdd() {
    const value_en = newEn.trim()
    if (!value_en) {
      toast.error('English value required')
      return
    }
    const nextSort = (sorted[sorted.length - 1]?.sort_order ?? -1) + 1
    try {
      await upsert.mutateAsync({
        definition_id: definitionId,
        value_en,
        value_ar: newAr.trim() || null,
        sort_order: nextSort,
      })
      setNewEn('')
      setNewAr('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add option'
      toast.error(msg.includes('duplicate') || msg.includes('unique') ? `"${value_en}" already exists (case-insensitive)` : msg)
    }
  }

  async function handleUpdate(opt: AttributeOption, patch: Partial<Pick<AttributeOption, 'value_en' | 'value_ar' | 'sort_order' | 'is_archived'>>) {
    try {
      await upsert.mutateAsync({
        id: opt.id,
        definition_id: opt.definition_id,
        value_en: patch.value_en ?? opt.value_en,
        value_ar: patch.value_ar !== undefined ? patch.value_ar : opt.value_ar,
        sort_order: patch.sort_order ?? opt.sort_order,
        is_archived: patch.is_archived ?? opt.is_archived,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update option')
    }
  }

  async function handleReorder(opt: AttributeOption, direction: 'up' | 'down') {
    const idx = sorted.findIndex((o) => o.id === opt.id)
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= sorted.length) return
    const target = sorted[targetIdx]
    await Promise.all([
      handleUpdate(opt,    { sort_order: target.sort_order }),
      handleUpdate(target, { sort_order: opt.sort_order }),
    ])
  }

  async function handleDelete(opt: AttributeOption) {
    if (!confirm(`Delete option "${opt.value_en}"? If any item currently uses it, deletion is blocked — archive instead.`)) return
    try {
      await del.mutateAsync({ optionId: opt.id })
      toast.success('Option deleted')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete option'
      toast.error(msg.includes('foreign key') || msg.includes('violates') ? 'Cannot delete — items are using this option. Archive it instead.' : msg)
    }
  }

  return (
    <div className="space-y-3">
      {sorted.length === 0 ? (
        <div className="rounded border border-dashed p-3 text-xs text-muted-foreground text-center">
          No options yet
        </div>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((o, idx) => (
            <OptionRow
              key={o.id}
              option={o}
              disabled={!!disabled}
              canMoveUp={idx > 0}
              canMoveDown={idx < sorted.length - 1}
              onCommit={(patch) => handleUpdate(o, patch)}
              onMoveUp={() => handleReorder(o, 'up')}
              onMoveDown={() => handleReorder(o, 'down')}
              onArchiveToggle={() => handleUpdate(o, { is_archived: !o.is_archived })}
              onDelete={() => handleDelete(o)}
            />
          ))}
        </div>
      )}

      {!disabled && (
        <div className="flex items-end gap-2 pt-2 border-t">
          <div className="flex-1 min-w-0">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">English value</label>
            <Input
              value={newEn}
              onChange={(e) => setNewEn(e.target.value)}
              placeholder="e.g. Copper"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Arabic (optional)</label>
            <Input
              value={newAr}
              onChange={(e) => setNewAr(e.target.value)}
              dir="rtl"
              className="h-8 text-sm"
            />
          </div>
          <Button size="sm" onClick={handleAdd} className="h-8 gap-1.5 shrink-0" disabled={!newEn.trim()}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      )}
    </div>
  )
}

function OptionRow({
  option,
  disabled,
  canMoveUp,
  canMoveDown,
  onCommit,
  onMoveUp,
  onMoveDown,
  onArchiveToggle,
  onDelete,
}: {
  option: AttributeOption
  disabled: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onCommit: (patch: { value_en?: string; value_ar?: string | null }) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onArchiveToggle: () => void
  onDelete: () => void
}) {
  const [en, setEn] = useState(option.value_en)
  const [ar, setAr] = useState(option.value_ar ?? '')

  return (
    <div className={`flex items-center gap-2 rounded border p-2 ${option.is_archived ? 'bg-muted/40 opacity-70' : 'bg-card'}`}>
      <Input
        value={en}
        onChange={(e) => setEn(e.target.value)}
        onBlur={() => { if (en !== option.value_en && en.trim()) onCommit({ value_en: en.trim() }) }}
        disabled={disabled || option.is_archived}
        className="h-7 text-sm flex-1 min-w-0"
      />
      <Input
        value={ar}
        onChange={(e) => setAr(e.target.value)}
        onBlur={() => { const v = ar.trim() || null; if (v !== option.value_ar) onCommit({ value_ar: v }) }}
        disabled={disabled || option.is_archived}
        dir="rtl"
        placeholder="—"
        className="h-7 text-sm flex-1 min-w-0"
      />
      {!disabled && (
        <div className="flex items-center gap-0.5 shrink-0">
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveUp || option.is_archived} onClick={onMoveUp} title="Move up">
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveDown || option.is_archived} onClick={onMoveDown} title="Move down">
            <ArrowDown className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onArchiveToggle} title={option.is_archived ? 'Restore' : 'Archive'}>
            {option.is_archived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import {
  useEffectiveAttributes,
  useAttributeDefinitionsForCategory,
  useAttributeOptionsForDefinition,
  useDeleteAttributeDefinition,
  useUpsertAttributeDefinition,
  type EffectiveAttribute,
  type AttributeDefinition,
} from '@/hooks/useAttributes'
import { useHasManagePermission } from '@/hooks/usePermissions'
import { AttributeFormDialog } from './AttributeFormDialog'

type Props = { categoryId: string }

export function AttributesTab({ categoryId }: Props) {
  const canManage = useHasManagePermission('master_data.inventory.attributes')
  const canCreate = canManage
  const canEdit   = canManage

  const { data: effective = [], isLoading } = useEffectiveAttributes(categoryId)
  const { data: local = [] } = useAttributeDefinitionsForCategory(categoryId)
  const upsertDef = useUpsertAttributeDefinition()
  const deleteDef = useDeleteAttributeDefinition()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AttributeDefinition | null>(null)

  const inherited = effective.filter((e) => e.is_inherited)

  function handleOpenCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function handleOpenEdit(def: AttributeDefinition) {
    setEditing(def)
    setDialogOpen(true)
  }

  async function handleDelete(def: AttributeDefinition) {
    if (!confirm(`Delete attribute "${def.label_en}"? This removes it from this category and all its descendants, and clears every item's value for it.`)) return
    try {
      await deleteDef.mutateAsync({ definitionId: def.id })
      toast.success('Attribute deleted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete attribute')
    }
  }

  async function handleReorder(def: AttributeDefinition, direction: 'up' | 'down') {
    const sorted = [...local].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex((d) => d.id === def.id)
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= sorted.length) return
    const target = sorted[targetIdx]
    try {
      await Promise.all([
        upsertDef.mutateAsync({
          id: def.id,
          category_id: def.category_id,
          attribute_key: def.attribute_key,
          label_en: def.label_en,
          label_ar: def.label_ar,
          sort_order: target.sort_order,
        }),
        upsertDef.mutateAsync({
          id: target.id,
          category_id: target.category_id,
          attribute_key: target.attribute_key,
          label_en: target.label_en,
          label_ar: target.label_ar,
          sort_order: def.sort_order,
        }),
      ])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reorder')
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Attributes are inherited from parent categories and add to what's defined here.
        Each attribute key can appear only once per top-level tree.
      </p>

      {inherited.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Inherited attributes ({inherited.length})
          </h3>
          <div className="space-y-2">
            {inherited.map((a) => (
              <InheritedRow key={a.definition_id} attr={a} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
            Local attributes ({local.length})
          </h3>
          {canCreate && (
            <Button size="sm" onClick={handleOpenCreate} className="h-7 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add attribute
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="rounded border border-dashed p-4 text-sm text-muted-foreground text-center">Loading…</div>
        ) : local.length === 0 ? (
          <div className="rounded border border-dashed p-4 text-sm text-muted-foreground text-center">
            No attributes defined at this category
          </div>
        ) : (
          <div className="space-y-2">
            {[...local]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((d, idx, arr) => (
                <LocalRow
                  key={d.id}
                  def={d}
                  canEdit={canEdit}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < arr.length - 1}
                  onEdit={() => handleOpenEdit(d)}
                  onDelete={() => handleDelete(d)}
                  onMoveUp={() => handleReorder(d, 'up')}
                  onMoveDown={() => handleReorder(d, 'down')}
                />
              ))}
          </div>
        )}
      </section>

      <AttributeFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categoryId={categoryId}
        editing={editing}
      />
    </div>
  )
}

function InheritedRow({ attr }: { attr: EffectiveAttribute }) {
  const { data: options = [] } = useAttributeOptionsForDefinition(attr.definition_id)
  const active = options.filter((o) => !o.is_archived)
  return (
    <div className="rounded border bg-muted/30 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{attr.label_en}</div>
          <div className="text-[11px] text-muted-foreground truncate">↑ inherited from {attr.category_name}</div>
        </div>
        <div className="text-[11px] text-muted-foreground shrink-0">
          {active.length} option{active.length === 1 ? '' : 's'}
        </div>
      </div>
      {active.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {active.map((o) => (
            <span key={o.id} className="text-[11px] px-1.5 py-0.5 rounded bg-background border">
              {o.value_en}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function LocalRow({
  def,
  canEdit,
  canMoveUp,
  canMoveDown,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  def: AttributeDefinition
  canEdit: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onEdit: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const { data: options = [] } = useAttributeOptionsForDefinition(def.id)
  const active = options.filter((o) => !o.is_archived)
  const archivedCount = options.length - active.length

  return (
    <div className="rounded border bg-card p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{def.label_en}</div>
          <div className="text-[11px] font-mono text-muted-foreground truncate">{def.attribute_key}</div>
        </div>
        <div className="text-[11px] text-muted-foreground shrink-0">
          {active.length} option{active.length === 1 ? '' : 's'}
          {archivedCount > 0 && ` (+${archivedCount} archived)`}
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveUp} onClick={onMoveUp} title="Move up">
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveDown} onClick={onMoveDown} title="Move down">
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit} title="Edit">
              <Pencil className="h-3 w-3" />
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
      {active.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {active.map((o) => (
            <span key={o.id} className="text-[11px] px-1.5 py-0.5 rounded bg-muted border">
              {o.value_en}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

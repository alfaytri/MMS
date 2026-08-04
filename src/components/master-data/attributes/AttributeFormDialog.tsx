'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  GuardedDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useUpsertAttributeDefinition, type AttributeDefinition } from '@/hooks/useAttributes'
import { AttributeOptionsEditor } from './AttributeOptionsEditor'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  categoryId: string
  editing: AttributeDefinition | null
}

const KEY_REGEX = /^[a-z][a-z0-9_]*$/

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
}

type Snapshot = { labelEn: string; labelAr: string; attributeKey: string }

export function AttributeFormDialog({ open, onOpenChange, categoryId, editing }: Props) {
  const upsert = useUpsertAttributeDefinition()
  const [labelEn, setLabelEn] = useState('')
  const [labelAr, setLabelAr] = useState('')
  const [attributeKey, setAttributeKey] = useState('')
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedDefinitionId, setSavedDefinitionId] = useState<string | null>(null)
  // Snapshot of the last persisted values — dirty check compares against this.
  // Refreshed on open (to editing's values or empty) and after every save.
  const [savedSnapshot, setSavedSnapshot] = useState<Snapshot>({ labelEn: '', labelAr: '', attributeKey: '' })
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  useEffect(() => {
    if (open) {
      if (editing) {
        setLabelEn(editing.label_en)
        setLabelAr(editing.label_ar ?? '')
        setAttributeKey(editing.attribute_key)
        setKeyManuallyEdited(true)
        setSavedDefinitionId(editing.id)
        setSavedSnapshot({
          labelEn: editing.label_en,
          labelAr: editing.label_ar ?? '',
          attributeKey: editing.attribute_key,
        })
      } else {
        setLabelEn('')
        setLabelAr('')
        setAttributeKey('')
        setKeyManuallyEdited(false)
        setSavedDefinitionId(null)
        setSavedSnapshot({ labelEn: '', labelAr: '', attributeKey: '' })
      }
    }
  }, [open, editing])

  function handleLabelEnChange(v: string) {
    setLabelEn(v)
    if (!keyManuallyEdited && !editing) {
      setAttributeKey(slugify(v))
    }
  }

  function handleKeyChange(v: string) {
    setKeyManuallyEdited(true)
    setAttributeKey(v)
  }

  async function handleSave() {
    const en = labelEn.trim()
    const key = attributeKey.trim()
    if (!en) {
      toast.error('English label is required')
      return
    }
    if (!KEY_REGEX.test(key)) {
      toast.error('Attribute key must be snake_case: lowercase letters, digits, and underscores; must start with a letter')
      return
    }
    setSaving(true)
    try {
      const saved = await upsert.mutateAsync({
        id: editing?.id ?? savedDefinitionId ?? undefined,
        category_id: categoryId,
        attribute_key: key,
        label_en: en,
        label_ar: labelAr.trim() || null,
        sort_order: editing?.sort_order ?? 0,
      })
      setSavedDefinitionId(saved.id)
      setSavedSnapshot({ labelEn: en, labelAr: labelAr.trim(), attributeKey: key })
      toast.success(editing || savedDefinitionId ? 'Attribute updated' : 'Attribute created')
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      let msg = raw
      if (raw.includes('inventory_attribute_definitions_category_id_attribute_key_key')) {
        msg = `An attribute with key "${key}" already exists on this category.`
      } else if (raw.includes('already defined at ancestor')) {
        msg = raw
      } else if (raw.includes('already defined at descendant')) {
        msg = raw
      }
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const isDirty =
    labelEn.trim() !== savedSnapshot.labelEn.trim() ||
    labelAr.trim() !== savedSnapshot.labelAr.trim() ||
    attributeKey.trim() !== savedSnapshot.attributeKey.trim()

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit attribute' : 'New attribute'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-2">
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="label-en" className="text-xs">English label *</Label>
              <Input
                id="label-en"
                value={labelEn}
                onChange={(e) => handleLabelEnChange(e.target.value)}
                placeholder="e.g. Material"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="label-ar" className="text-xs">Arabic label (optional)</Label>
              <Input
                id="label-ar"
                value={labelAr}
                onChange={(e) => setLabelAr(e.target.value)}
                dir="rtl"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="attr-key" className="text-xs">Attribute key (snake_case) *</Label>
              <Input
                id="attr-key"
                value={attributeKey}
                onChange={(e) => handleKeyChange(e.target.value)}
                placeholder="e.g. material"
                className="h-9 font-mono text-sm"
                disabled={!!editing}
              />
              <p className="text-[11px] text-muted-foreground">
                {editing
                  ? 'Key cannot be changed after creation.'
                  : 'Auto-generated from the English label; edit if needed. Must be unique across this category tree (ancestors + descendants).'}
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Options</Label>
              {!savedDefinitionId && (
                <span className="text-[11px] text-muted-foreground">Save the attribute first to add options</span>
              )}
            </div>
            {savedDefinitionId ? (
              <AttributeOptionsEditor definitionId={savedDefinitionId} />
            ) : (
              <div className="rounded border border-dashed p-3 text-xs text-muted-foreground text-center">
                Options can be added after the attribute is saved
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="border-t pt-3 mt-0">
          <Button variant="outline" onClick={() => guardRef.current?.requestClose()} disabled={saving}>Close</Button>
          <Button onClick={handleSave} disabled={saving || !labelEn.trim() || !attributeKey.trim()}>
            {saving ? 'Saving…' : (editing ? 'Save changes' : (savedDefinitionId ? 'Update' : 'Create attribute'))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </GuardedDialog>
  )
}

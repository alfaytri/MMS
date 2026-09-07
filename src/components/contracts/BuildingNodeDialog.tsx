'use client'

import { useState, useEffect } from 'react'
import { Building2, Layers, MapPinned, Check, type LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { NODE_TYPE_CHILDREN, ROOT_NODE_TYPES } from '@/lib/contractUtils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  parentType: string | null
  onAdd: (name: string, type: string) => void
}

const TYPE_META: Record<string, { label: string; icon: LucideIcon; hint: string; active: string; tile: string }> = {
  complex:  { label: 'Complex',  icon: Building2, hint: 'Multiple buildings', active: 'border-blue-500 bg-blue-500/5',     tile: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  building: { label: 'Building', icon: Layers,    hint: 'A single building',  active: 'border-indigo-500 bg-indigo-500/5', tile: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
  floor:    { label: 'Floor',    icon: Layers,    hint: 'A floor or level',   active: 'border-violet-500 bg-violet-500/5', tile: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  area:     { label: 'Area',     icon: MapPinned, hint: 'A room or zone',     active: 'border-purple-500 bg-purple-500/5', tile: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
}

export function BuildingNodeDialog({ open, onOpenChange, parentType, onAdd }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState('')

  const isRoot = !parentType
  const allowedTypes = parentType
    ? NODE_TYPE_CHILDREN[parentType] || []
    : ROOT_NODE_TYPES

  // Reset on open; pre-select when there's only one choice.
  useEffect(() => {
    if (open) {
      setName('')
      setType(allowedTypes.length === 1 ? allowedTypes[0] : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleAdd() {
    if (!name.trim() || !type) return
    onAdd(name.trim(), type)
    setName('')
    setType('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isRoot ? 'Add building or complex' : 'Add floor or area'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="space-y-2">
            <Label htmlFor="node-name">Name</Label>
            <Input
              id="node-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder={isRoot ? 'e.g. Building A' : 'e.g. Floor 1, Reception'}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {allowedTypes.map((t) => {
                const meta = TYPE_META[t]
                const Icon = meta.icon
                const active = type === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                      active ? meta.active : 'hover:bg-muted/50',
                    )}
                  >
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', meta.tile)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {meta.label}
                        {active && <Check className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{meta.hint}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={!name.trim() || !type}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

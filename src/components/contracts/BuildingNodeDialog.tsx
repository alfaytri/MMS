'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NODE_TYPE_CHILDREN, ROOT_NODE_TYPES } from '@/lib/contractUtils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  parentType: string | null
  onAdd: (name: string, type: string) => void
}

export function BuildingNodeDialog({ open, onOpenChange, parentType, onAdd }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState('')

  const isRoot = !parentType
  const allowedTypes = parentType
    ? NODE_TYPE_CHILDREN[parentType] || []
    : ROOT_NODE_TYPES

  function handleAdd() {
    if (!name.trim() || !type) return
    onAdd(name.trim(), type)
    setName('')
    setType('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isRoot ? 'Add Building / Complex' : 'Add Floor / Area'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="node-name">Name</Label>
            <Input
              id="node-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isRoot ? 'e.g., Building A' : 'e.g., Floor 1, Reception Area'}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bnode-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v ?? '')}>
              <SelectTrigger id="bnode-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {allowedTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

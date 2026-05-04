'use client'

import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Wrench, X, Plus, Loader2 } from 'lucide-react'
import {
  useToolAssignments,
  useAvailableToolUnits,
  useAssignToolToTeam,
  useUnassignToolFromTeam,
} from '@/hooks/useTeams'
import { useToolAssetItems } from '@/hooks/useInventory'
import { useTeamsPage } from '../TeamsPageContext'

const CONDITION_COLORS: Record<string, string> = {
  New:         'bg-green-100 text-green-700',
  Good:        'bg-blue-100 text-blue-700',
  Fair:        'bg-yellow-100 text-yellow-700',
  Maintenance: 'bg-red-100 text-red-700',
}

export function TeamToolsSheet() {
  const { toolsSheet, closeToolsSheet } = useTeamsPage()
  const { open, teamId, teamName } = toolsSheet

  const [selectedItemId, setSelectedItemId] = useState<string>('')
  const [selectedUnitId, setSelectedUnitId] = useState<string>('')
  const [addError, setAddError]             = useState<string | null>(null)

  const { data: assignments = [], isLoading } = useToolAssignments('team', teamId)
  const { data: toolItems = [] }              = useToolAssetItems()
  const { data: availableUnits = [] }        = useAvailableToolUnits(selectedItemId || null)
  const assignTool   = useAssignToolToTeam()
  const unassignTool = useUnassignToolFromTeam()

  function handleClose() {
    setSelectedItemId('')
    setSelectedUnitId('')
    setAddError(null)
    closeToolsSheet()
  }

  async function handleAdd() {
    if (!teamId || !selectedUnitId) return
    setAddError(null)
    try {
      await assignTool.mutateAsync({ teamId, toolUnitId: selectedUnitId })
      setSelectedItemId('')
      setSelectedUnitId('')
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to assign tool.')
    }
  }

  async function handleRemove(assignmentId: string) {
    if (!teamId) return
    await unassignTool.mutateAsync({ assignmentId, teamId })
  }

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) handleClose() }}>
      <SheetContent side="right" className="w-full sm:w-[420px] flex flex-col p-0 gap-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Team Tools — {teamName}
          </SheetTitle>
        </SheetHeader>

        {/* ── Current assignments ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && assignments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No tools assigned yet</p>
          )}

          {assignments.map(a => {
            const unit = a.tool_unit
            const item = unit?.item
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5 bg-muted/30"
              >
                <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item?.name_en ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    SN: {unit?.serial_number ?? '—'}
                    {unit?.brand ? ` · ${unit.brand}` : ''}
                  </p>
                </div>
                {unit?.condition && (
                  <Badge
                    className={`text-[10px] px-1.5 shrink-0 ${CONDITION_COLORS[unit.condition] ?? ''}`}
                  >
                    {unit.condition}
                  </Badge>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(a.id)}
                  disabled={unassignTool.isPending}
                  className="p-1 hover:text-destructive text-muted-foreground transition-colors shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>

        {/* ── Add tool ── */}
        <div className="border-t px-5 py-4 space-y-3 bg-muted/10">
          <p className="text-sm font-medium">Add Tool</p>

          {/* Select item */}
          <Select
            value={selectedItemId}
            onValueChange={v => { setSelectedItemId(v ?? ''); setSelectedUnitId('') }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select tool type…" />
            </SelectTrigger>
            <SelectContent>
              {toolItems.map(item => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name_en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Select unit */}
          <Select
            value={selectedUnitId}
            onValueChange={v => setSelectedUnitId(v ?? '')}
            disabled={!selectedItemId}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={
                !selectedItemId
                  ? 'Select tool type first'
                  : availableUnits.length === 0
                  ? 'No available units'
                  : 'Select unit…'
              } />
            </SelectTrigger>
            <SelectContent>
              {availableUnits.map(u => u && (
                <SelectItem key={u.id} value={u.id}>
                  {u.serial_number}
                  {u.brand ? ` · ${u.brand}` : ''}
                  {u.condition ? ` (${u.condition})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {addError && <p className="text-xs text-destructive">{addError}</p>}

          <Button
            className="w-full"
            disabled={!selectedUnitId || assignTool.isPending}
            onClick={handleAdd}
          >
            {assignTool.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Assigning…</>
              : <><Plus className="h-4 w-4 mr-2" />Assign Tool</>
            }
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

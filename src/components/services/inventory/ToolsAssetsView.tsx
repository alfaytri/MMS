'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, Plus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ToolAssetItemEditDialog, ToolAssetUnitEditDialog } from './ToolAssetEditDialog'
import { useToolAssetItems, useToolAssetUnits, type ToolAssetItem, type ToolAssetUnit } from '@/hooks/useInventory'
import { formatDate } from '@/lib/utils/formatters'

function ToolUnitRows({ itemId }: { itemId: string }) {
  const { data: units = [], isLoading } = useToolAssetUnits(itemId)
  const [editUnit, setEditUnit] = useState<ToolAssetUnit | null>(null)
  const [addUnitOpen, setAddUnitOpen] = useState(false)

  const statusColor: Record<string, string> = {
    available: 'bg-green-100 text-green-700',
    assigned: 'bg-blue-100 text-blue-700',
    maintenance: 'bg-amber-100 text-amber-700',
    retired: 'bg-slate-100 text-slate-500',
  }

  return (
    <>
      <tr className="bg-slate-50/50">
        <td colSpan={6} className="py-2 pl-12 pr-4">
          <div className="rounded border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">SERIAL #</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">BRAND</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">CONDITION</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">STATUS</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">EXPIRY</th>
                  <th className="text-right text-[10px] font-semibold py-1.5 px-2" />
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={6}><Skeleton className="h-6 w-full m-2" /></td></tr>}
                {!isLoading && units.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-[11px] text-muted-foreground py-3">No units added yet</td></tr>
                )}
                {units.map((unit) => (
                  <tr key={unit.id} className="border-t border-border">
                    <td className="py-1.5 px-2 font-mono">{unit.serial_number}</td>
                    <td className="py-1.5 px-2">{unit.brand}</td>
                    <td className="py-1.5 px-2">{unit.condition}</td>
                    <td className="py-1.5 px-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor[unit.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {unit.status}
                      </span>
                    </td>
                    <td className="py-1.5 px-2">{unit.expiry ? formatDate(unit.expiry) : '—'}</td>
                    <td className="py-1.5 px-2 text-right">
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditUnit(unit)}>
                        <Pencil className="h-2.5 w-2.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1" onClick={() => setAddUnitOpen(true)}>
            <Plus className="h-3 w-3" /> Add Unit
          </button>
        </td>
      </tr>
      <ToolAssetUnitEditDialog open={addUnitOpen} onOpenChange={setAddUnitOpen} itemId={itemId} />
      {editUnit && (
        <ToolAssetUnitEditDialog open={!!editUnit} onOpenChange={(v) => { if (!v) setEditUnit(null) }} itemId={itemId} unit={editUnit} />
      )}
    </>
  )
}

function ToolItemRow({ item }: { item: ToolAssetItem }) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  return (
    <>
      <tr className="border-b border-border hover:bg-muted/20 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <td className="py-2.5 pl-3 pr-2">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className="text-sm font-medium">{item.name_en}</span>
            {item.name_ar && <span className="text-[10px] text-muted-foreground" dir="rtl">{item.name_ar}</span>}
          </div>
        </td>
        <td className="py-2.5 px-2 text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>
      {expanded && <ToolUnitRows itemId={item.id} />}
      <ToolAssetItemEditDialog open={editOpen} onOpenChange={setEditOpen} item={item} />
    </>
  )
}

export function ToolsAssetsView({ enabled }: { enabled: boolean }) {
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const { data: items = [], isLoading } = useToolAssetItems(search)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border">
        <Input placeholder="Search tools & assets…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-7 text-xs w-64" />
        <Button size="sm" className="ml-auto h-7 text-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3 w-3 mr-1" /> Add Tool/Asset
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left text-[11px] font-semibold py-2 pl-3 pr-2">TOOL / ASSET</th>
                <th className="text-right text-[11px] font-semibold py-2 px-2">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={2} className="text-center text-xs text-muted-foreground py-12">No tools or assets yet</td></tr>
              )}
              {items.map((item) => <ToolItemRow key={item.id} item={item} />)}
            </tbody>
          </table>
        )}
      </div>
      <ToolAssetItemEditDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

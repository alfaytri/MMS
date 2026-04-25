'use client'

import { useState, useEffect } from 'react'
import { X, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
  useInventoryItemsAll,
  useInventoryBrandVariants,
  useServiceInventoryLinks,
  useUpdateServiceInventoryLinks,
  useAllServices,
  type BrandVariant,
} from '@/hooks/useInventory'

function ManageLinksDialog({
  variant,
  onClose,
}: {
  variant: BrandVariant
  onClose: () => void
}) {
  const { data: links = [] } = useServiceInventoryLinks(variant.id)
  const { data: allServices = [] } = useAllServices()
  const update = useUpdateServiceInventoryLinks()

  const [linkedIds, setLinkedIds] = useState<string[]>(() => links.map((l) => l.service_id))

  useEffect(() => {
    setLinkedIds(links.map((l) => l.service_id))
  }, [links.length])

  const linkedServices = allServices.filter((s) => linkedIds.includes(s.id))
  const unlinkedServices = allServices.filter((s) => !linkedIds.includes(s.id))

  function addService(id: string) {
    setLinkedIds((ids) => [...ids, id])
  }

  function removeService(id: string) {
    setLinkedIds((ids) => ids.filter((x) => x !== id))
  }

  function handleSave() {
    update.mutate(
      { brandVariantId: variant.id, serviceIds: linkedIds },
      {
        onSuccess: () => { toast.success('Links saved'); onClose() },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-lg sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Manage Service Links — {variant.brand}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Linked services</p>
            {linkedServices.length === 0 ? (
              <p className="text-xs text-muted-foreground">None linked yet</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {linkedServices.map((s) => (
                  <Badge key={s.id} variant="secondary" className="gap-1 text-xs">
                    {s.name_en}
                    <button onClick={() => removeService(s.id)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Search to add</p>
            <Command className="rounded-md border border-border">
              <CommandInput placeholder="Search services…" className="text-xs" />
              <CommandList className="max-h-48">
                <CommandEmpty className="text-xs py-4 text-center text-muted-foreground">No services found</CommandEmpty>
                <CommandGroup>
                  {unlinkedServices.map((s) => (
                    <CommandItem key={s.id} value={s.name_en} onSelect={() => addService(s.id)} className="text-xs cursor-pointer">
                      {s.name_en}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save Links'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function VariantLinkRow({ variant }: { variant: BrandVariant }) {
  const { data: links = [] } = useServiceInventoryLinks(variant.id)
  const [manageOpen, setManageOpen] = useState(false)

  return (
    <>
      <tr className="border-b border-border text-xs hover:bg-muted/20">
        <td className="py-2 pl-8 pr-2">
          <span className="font-medium">{variant.brand}</span>
          {variant.code && <span className="ml-2 font-mono text-[10px] text-muted-foreground">{variant.code}</span>}
        </td>
        <td className="py-2 px-2">
          {links.length > 0 ? (
            <Badge variant="outline" className="text-[10px] px-1.5 gap-0.5 text-blue-600 border-blue-200">
              <Link2 className="h-2.5 w-2.5" /> {links.length}
            </Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          )}
        </td>
        <td className="py-2 px-2 text-right">
          <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => setManageOpen(true)}>
            Manage Links
          </Button>
        </td>
      </tr>
      {manageOpen && <ManageLinksDialog variant={variant} onClose={() => setManageOpen(false)} />}
    </>
  )
}

function ItemLinkSection({ item, search }: { item: { id: string; name_en: string; sku: string }; search: string }) {
  const [expanded, setExpanded] = useState(false)
  const { data: variants = [] } = useInventoryBrandVariants(expanded ? item.id : null)

  if (search && !item.name_en.toLowerCase().includes(search.toLowerCase())) return null

  return (
    <>
      <tr
        className="border-b border-border bg-slate-50/80 cursor-pointer hover:bg-slate-100/60"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-2.5 pl-3 pr-2 font-medium text-sm">{item.name_en}</td>
        <td className="py-2.5 px-2 font-mono text-[11px] text-muted-foreground">{item.sku}</td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground" colSpan={2}>
          Click to manage variant links
        </td>
      </tr>
      {expanded && variants.map((v) => <VariantLinkRow key={v.id} variant={v} />)}
    </>
  )
}

export function ServiceLinksView({ enabled }: { enabled: boolean }) {
  const [search, setSearch] = useState('')
  const { data: items = [], isLoading } = useInventoryItemsAll(enabled)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border">
        <Input placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-7 text-xs w-64" />
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left text-[11px] font-semibold py-2 pl-3 pr-2">ITEM</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2">SKU</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2">LINKED SERVICES</th>
                <th className="text-right text-[11px] font-semibold py-2 px-2">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={4} className="text-center text-xs text-muted-foreground py-12">No inventory items found</td></tr>
              )}
              {items.map((item) => (
                <ItemLinkSection key={item.id} item={item} search={search} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

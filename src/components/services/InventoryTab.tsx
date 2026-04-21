// src/components/services/InventoryTab.tsx
'use client'

import { useState } from 'react'
import { Package } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useInventoryItemsAll, useServicesWithInventory } from '@/hooks/useInventory'
import type { InventoryItem, ServiceWithInventory } from '@/hooks/useInventory'

interface InventoryTabProps {
  enabled: boolean
}

export function InventoryTab({ enabled }: InventoryTabProps) {
  return (
    <Tabs defaultValue="items" className="flex flex-col h-full">
      <div className="px-4 pt-2 border-b border-border">
        <TabsList className="h-8 bg-transparent p-0 gap-4">
          <TabsTrigger value="items" className="text-xs px-0 py-1.5 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none">
            Items
          </TabsTrigger>
          <TabsTrigger value="service-items" className="text-xs px-0 py-1.5 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none">
            Service Items
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="items" className="flex-1 overflow-auto m-0">
        <ItemsSubTab enabled={enabled} />
      </TabsContent>

      <TabsContent value="service-items" className="flex-1 overflow-auto m-0">
        <ServiceItemsSubTab enabled={enabled} />
      </TabsContent>
    </Tabs>
  )
}

function ItemsSubTab({ enabled }: { enabled: boolean }) {
  const { data: items = [], isLoading } = useInventoryItemsAll(enabled)
  const [search, setSearch] = useState('')

  const filtered = items.filter((item) =>
    item.name_en.toLowerCase().includes(search.toLowerCase()) ||
    item.sku.toLowerCase().includes(search.toLowerCase()) ||
    (item.name_ar ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Input
          placeholder="Search by name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs w-72"
        />
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} items</span>
      </div>

      <div className="p-4">
        <div className="rounded border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-[11px] h-8">Name</TableHead>
                <TableHead className="text-[11px] h-8">SKU</TableHead>
                <TableHead className="text-[11px] h-8">Unit</TableHead>
                <TableHead className="text-[11px] h-8 text-right">Cost</TableHead>
                <TableHead className="text-[11px] h-8 text-right">Stock</TableHead>
                <TableHead className="text-[11px] h-8 text-right">Services</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                    {search ? 'No items match your search' : 'No inventory items found'}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((item) => (
                <TableRow key={item.id} className="text-xs">
                  <TableCell>
                    <div className="font-medium">{item.name_en}</div>
                    {item.name_ar && (
                      <div className="text-[10px] text-muted-foreground" dir="rtl">{item.name_ar}</div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-[11px]">{item.sku}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell className="text-right">
                    {item.cost_price != null ? `QAR ${item.cost_price.toFixed(2)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={item.total_stock != null && item.total_stock < 10
                      ? 'text-destructive font-medium'
                      : ''
                    }>
                      {item.total_stock ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.linked_services_count ?? 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

function ServiceItemsSubTab({ enabled }: { enabled: boolean }) {
  const { data: services = [], isLoading } = useServicesWithInventory(enabled)
  const [search, setSearch] = useState('')

  const filtered = services.filter((s) =>
    s.name_en.toLowerCase().includes(search.toLowerCase()),
  )

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
        <Package className="h-8 w-8 opacity-30" />
        <p className="text-xs">No services have inventory items linked</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Input
          placeholder="Search services…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs w-64"
        />
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} services</span>
      </div>

      <div className="p-4">
        <div className="rounded border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-[11px] h-8">Service</TableHead>
                <TableHead className="text-[11px] h-8">Type</TableHead>
                <TableHead className="text-[11px] h-8 text-right">Items Linked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-8">
                    No services match your search
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((service) => {
                const itemCount = Array.isArray(service.inventory_items)
                  ? service.inventory_items.length
                  : 0
                return (
                  <TableRow key={service.id} className="text-xs">
                    <TableCell className="font-medium">{service.name_en}</TableCell>
                    <TableCell>
                      <Badge className="text-[10px] px-1.5 py-0 border-0 bg-slate-100 text-slate-600 capitalize">
                        {service.tree_type ?? 'normal'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{itemCount}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

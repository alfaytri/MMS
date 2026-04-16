'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, Plus, Package } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { InventoryItemFormDialog } from '@/components/master-data/InventoryItemFormDialog'
import { BrandVariantFormDialog } from '@/components/master-data/BrandVariantFormDialog'
import { useInventoryItems, useBrandVariants, type InventoryItem, type BrandVariant } from '@/hooks/useInventory'
import { formatCurrency, formatNumber } from '@/lib/utils/formatters'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const INVENTORY_TABS = [
  { value: 'product', label: 'Products' },
  { value: 'spare_part', label: 'Spare Parts' },
  { value: 'consumable', label: 'Consumables' },
] as const

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<string>('product')
  const [search, setSearch] = useState('')
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item: InventoryItem | null }>({ open: false, item: null })
  const [variantDialog, setVariantDialog] = useState<{ open: boolean; variant: BrandVariant | null; itemId: string }>({ open: false, variant: null, itemId: '' })
  const [expandedItem, setExpandedItem] = useState<string | null>(null)

  const { data: items, isLoading } = useInventoryItems(activeTab)
  const { data: variants } = useBrandVariants(expandedItem)

  const columns = useMemo<ColumnDef<InventoryItem>[]>(() => [
    {
      accessorKey: 'name_en',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <button
          className="font-medium text-left hover:text-primary transition-colors"
          onClick={() => setExpandedItem(expandedItem === row.original.id ? null : row.original.id)}
        >
          {row.getValue('name_en')}
        </button>
      ),
    },
    {
      accessorKey: 'sku',
      header: 'SKU',
      cell: ({ row }) => <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{row.getValue('sku')}</code>,
    },
    {
      accessorKey: 'unit',
      header: 'Unit',
      meta: { hideBelow: 'md' },
    },
    {
      accessorKey: 'cost_price',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cost" />,
      cell: ({ row }) => formatCurrency(row.getValue('cost_price') as number),
      meta: { hideBelow: 'sm' },
    },
    {
      accessorKey: 'total_stock',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stock" />,
      cell: ({ row }) => formatNumber(row.getValue('total_stock') as number),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setItemDialog({ open: true, item: row.original })}>
                <Pencil className="h-4 w-4 mr-2" />Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setVariantDialog({ open: true, variant: null, itemId: row.original.id })}>
                <Plus className="h-4 w-4 mr-2" />Add Variant
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [expandedItem])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Items"
        description="Manage products, spare parts, and consumables"
        action={{ label: 'Add Item', onClick: () => setItemDialog({ open: true, item: null }) }}
      />

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setExpandedItem(null) }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            {INVENTORY_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>
          <SearchInput value={search} onChange={setSearch} placeholder="Search items…" />
        </div>

        {INVENTORY_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <DataTable columns={columns} data={(items as InventoryItem[] | undefined) ?? []} isLoading={isLoading} globalFilter={search} />
          </TabsContent>
        ))}
      </Tabs>

      {expandedItem && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Brand Variants
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setVariantDialog({ open: true, variant: null, itemId: expandedItem })}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add Variant
            </Button>
          </CardHeader>
          <CardContent>
            {variants && variants.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Selling</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead className="hidden md:table-cell">Incoming</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {((variants as unknown) as (BrandVariant & { brands?: { name: string } | null })[]).map((v) => (
                      <TableRow key={v.id}>
                        <TableCell><code className="text-xs">{v.code || '—'}</code></TableCell>
                        <TableCell>{v.brands?.name || '—'}</TableCell>
                        <TableCell>{formatCurrency(Number(v.cost_price))}</TableCell>
                        <TableCell>{formatCurrency(Number(v.selling_price))}</TableCell>
                        <TableCell>{formatNumber(v.stock_level ?? 0)}</TableCell>
                        <TableCell className="hidden md:table-cell">{formatNumber(v.incoming ?? 0)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8 min-h-11 sm:min-h-0"
                            onClick={() => setVariantDialog({ open: true, variant: v as BrandVariant, itemId: expandedItem })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No brand variants yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      <InventoryItemFormDialog
        open={itemDialog.open}
        onOpenChange={(open) => setItemDialog((s) => ({ ...s, open }))}
        item={itemDialog.item}
        defaultCategoryId=""
      />
      <BrandVariantFormDialog
        open={variantDialog.open}
        onOpenChange={(open) => setVariantDialog((s) => ({ ...s, open }))}
        variant={variantDialog.variant}
        itemId={variantDialog.itemId}
      />
    </div>
  )
}

'use client'

import { InventoryTab } from '@/components/services/InventoryTab'

export default function InventoryPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-semibold">Inventory</h1>
        <p className="text-sm text-muted-foreground">Manage products, spare parts, consumables, and tools</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <InventoryTab enabled />
      </div>
    </div>
  )
}

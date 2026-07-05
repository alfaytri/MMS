'use client'

import { useState } from 'react'
import { ItemsListView } from './inventory/ItemsListView'
import { ToolsAssetsView } from './inventory/ToolsAssetsView'

type SubTab = 'products' | 'spare-parts' | 'consumables' | 'tools'

const TABS: { key: SubTab; label: string }[] = [
  { key: 'products', label: 'Products (Installation)' },
  { key: 'spare-parts', label: 'Spare Parts (Sales)' },
  { key: 'consumables', label: 'Consumables (Internal)' },
  { key: 'tools', label: 'Tools & Assets' },
]

interface InventoryTabProps {
  enabled: boolean
}

export function InventoryTab({ enabled }: InventoryTabProps) {
  const [activeTab, setTab] = useState<SubTab>('products')

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab bar */}
      <div className="px-4 pt-2 border-b border-border overflow-x-auto">
        <div className="flex gap-4 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={[
                'text-xs px-0 py-1.5 border-b-2 whitespace-nowrap transition-colors',
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600 font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'products' && (
          <ItemsListView type="products" enabled={enabled} />
        )}
        {activeTab === 'spare-parts' && (
          <ItemsListView type="spare-parts" enabled={enabled} />
        )}
        {activeTab === 'consumables' && (
          <ItemsListView type="consumables" enabled={enabled} />
        )}
        {activeTab === 'tools' && (
          <ToolsAssetsView enabled={enabled} />
        )}
      </div>
    </div>
  )
}

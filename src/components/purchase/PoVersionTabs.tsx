'use client'

import { cn } from '@/lib/utils'
import { PencilLine } from 'lucide-react'
import type { PoVersion } from '@/hooks/usePurchaseOrders'

interface PoVersionTabsProps {
  versions: PoVersion[]
  currentVersionNumber: number
  activeTab: number
  onTabChange: (versionNumber: number) => void
}

export function PoVersionTabs({
  versions,
  currentVersionNumber,
  activeTab,
  onTabChange,
}: PoVersionTabsProps) {
  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const tabs = [
    ...versions
      .filter((v) => v.version_number !== currentVersionNumber)
      .map((v) => ({
        versionNumber: v.version_number,
        label: `V${v.version_number}`,
        sub: formatDate(v.submitted_at),
        isCurrent: false,
      })),
    {
      versionNumber: currentVersionNumber,
      label: `V${currentVersionNumber}`,
      sub: 'Current',
      isCurrent: true,
    },
  ]

  return (
    <div className="shrink-0 flex items-center gap-1 px-4 md:px-6 py-2 border-b bg-background overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.versionNumber}
          type="button"
          onClick={() => onTabChange(tab.versionNumber)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap',
            activeTab === tab.versionNumber
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
          )}
        >
          <span>{tab.label}</span>
          <span className="opacity-70">{tab.sub}</span>
          {tab.isCurrent && <PencilLine className="h-3 w-3 opacity-70" />}
        </button>
      ))}
    </div>
  )
}

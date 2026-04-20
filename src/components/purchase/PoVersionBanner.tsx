'use client'

import { RotateCcw, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PoVersion } from '@/hooks/usePurchaseOrders'

interface PoVersionBannerProps {
  version: PoVersion
  onRestore: () => void
}

export function PoVersionBanner({ version, onRestore }: PoVersionBannerProps) {
  const date = new Date(version.submitted_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5">
      <div className="flex items-center gap-2 text-amber-800">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">
          Viewing V{version.version_number} — submitted {date}
        </span>
        <span className="text-xs text-amber-600">Read-only</span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-100"
        onClick={onRestore}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Restore to this version
      </Button>
    </div>
  )
}

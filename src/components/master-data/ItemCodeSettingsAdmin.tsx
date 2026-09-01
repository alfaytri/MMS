'use client'

import { Loader2, Hash } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useAutoGenerateCodes, useUpdateAutoGenerateCodes } from '@/hooks/useAutoGenerateCodes'

export function ItemCodeSettingsAdmin() {
  const { data: enabled = false, isLoading } = useAutoGenerateCodes()
  const update = useUpdateAutoGenerateCodes()

  async function handleToggle(next: boolean) {
    try {
      await update.mutateAsync(next)
      toast.success(
        next
          ? 'Auto-generate is ON — codes are generated automatically'
          : 'Auto-generate is OFF — enter codes manually',
      )
    } catch (err) {
      toast.error((err as Error).message || 'Failed to update setting')
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl space-y-5">
      <div className="flex items-center gap-2">
        <Hash className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Item Codes</h1>
      </div>

      <div className="rounded-lg border p-4 flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <Label htmlFor="auto-code-toggle" className="text-sm font-medium">
            Auto-generate item codes
          </Label>
          <p className="text-xs text-muted-foreground">
            When <strong>ON</strong>, every brand/variant code is generated automatically
            (e.g. <span className="font-mono">ACR-INV-001</span>) and the manual code box is hidden.
            When <strong>OFF</strong> (default), you type the code yourself when adding a
            variant — and any code you leave blank is still filled in automatically, so
            nothing is ever left without one.
          </p>
        </div>
        <div className="flex items-center gap-2 pt-0.5 shrink-0">
          {(isLoading || update.isPending) && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Switch
            id="auto-code-toggle"
            checked={enabled}
            disabled={isLoading || update.isPending}
            onCheckedChange={handleToggle}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Current: codes are <strong>{enabled ? 'auto-generated' : 'entered manually'}</strong>.
        Changing this affects the code field on the Add / Edit Variant form across the app.
      </p>
    </div>
  )
}

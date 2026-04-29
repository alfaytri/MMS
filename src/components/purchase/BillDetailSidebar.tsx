// src/components/purchase/BillDetailSidebar.tsx
'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Division } from '@/hooks/useDivisions'
import type { Company } from '@/hooks/useCompanies'

type ToggleKey = 'showReceival' | 'showPaymentPlan' | 'showNotes' | 'showQR'

type Props = {
  companies: Company[]
  selectedCompanyId: string
  onCompanyChange: (id: string) => void
  divisions: Division[]
  selectedDivisionId: string
  onDivisionChange: (id: string) => void
  showReceival: boolean
  showPaymentPlan: boolean
  showNotes: boolean
  showQR: boolean
  onToggle: (key: ToggleKey, value: boolean) => void
  hasReceival: boolean
  hasPaymentPlan: boolean
  hasNotes: boolean
}

const ALWAYS_ON_SECTIONS = [
  'Company Header',
  'Supplier Info',
  'Line Items',
  'Totals',
  'Payment History',
]

export function BillDetailSidebar({
  companies,
  selectedCompanyId,
  onCompanyChange,
  divisions,
  selectedDivisionId,
  onDivisionChange,
  showReceival,
  showPaymentPlan,
  showNotes,
  showQR,
  onToggle,
  hasReceival,
  hasPaymentPlan,
  hasNotes,
}: Props) {
  return (
    <aside className="bill-sidebar w-[280px] shrink-0 flex flex-col gap-5 p-5 border-r bg-muted/20 min-h-full lg:min-h-screen lg:sticky lg:top-0 overflow-y-auto">
      {/* Company selector */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company</p>
        <Select value={selectedCompanyId} onValueChange={(v) => { if (v) onCompanyChange(v) }}>
          <SelectTrigger>
            <SelectValue placeholder="Select company…" />
          </SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Division selector */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Division</p>
        <Select
          value={selectedDivisionId}
          onValueChange={(v) => { if (v) onDivisionChange(v) }}
          disabled={!selectedCompanyId}
        >
          <SelectTrigger>
            <SelectValue placeholder={selectedCompanyId ? 'Select division…' : 'Select company first…'} />
          </SelectTrigger>
          <SelectContent>
            {divisions.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Always-on sections */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Always Shown</p>
        {ALWAYS_ON_SECTIONS.map((label) => (
          <div key={label} className="flex items-center gap-2 text-sm text-muted-foreground pl-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
            {label}
          </div>
        ))}
      </div>

      {/* Toggleable sections */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Document Options</p>
        <SidebarToggle
          label="Receival Info"
          checked={showReceival}
          disabled={!hasReceival}
          disabledHint="No receival linked"
          onCheckedChange={(v) => onToggle('showReceival', v)}
        />
        <SidebarToggle
          label="Payment Plan"
          checked={showPaymentPlan}
          disabled={!hasPaymentPlan}
          disabledHint="No payment plan"
          onCheckedChange={(v) => onToggle('showPaymentPlan', v)}
        />
        <SidebarToggle
          label="Notes / Remarks"
          checked={showNotes}
          disabled={!hasNotes}
          disabledHint="No notes"
          onCheckedChange={(v) => onToggle('showNotes', v)}
        />
        <SidebarToggle
          label="QR Code / Stamp"
          checked={showQR}
          onCheckedChange={(v) => onToggle('showQR', v)}
        />
      </div>

      <div className="flex-1" />

      <Button onClick={() => window.print()} className="w-full gap-2">
        <Printer className="h-4 w-4" />
        Print Bill
      </Button>
    </aside>
  )
}

function SidebarToggle({
  label,
  checked,
  disabled,
  disabledHint,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  disabledHint?: string
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <Label className={cn('text-sm', disabled && 'text-muted-foreground/50')}>{label}</Label>
        {disabled && disabledHint && (
          <p className="text-xs text-muted-foreground/40">{disabledHint}</p>
        )}
      </div>
      <Switch
        checked={checked && !disabled}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}

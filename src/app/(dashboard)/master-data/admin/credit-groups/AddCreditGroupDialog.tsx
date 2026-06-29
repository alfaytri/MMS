'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  useCreateCreditGroup,
  useUpdateCreditGroup,
  type CreditGroup,
} from '@/hooks/useCreditGroups'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}K`
  return ''
}

interface CreditGroupDialogProps {
  open:         boolean
  onOpenChange: (open: boolean) => void
  group?:       CreditGroup
}

export function AddCreditGroupDialog({ open, onOpenChange, group }: CreditGroupDialogProps) {
  const isEdit = !!group
  const create = useCreateCreditGroup()
  const update = useUpdateCreditGroup()
  const { data: paymentMethods = [] } = usePaymentMethods()

  const [name, setName]                       = useState('')
  const [selectedMethods, setSelectedMethods] = useState<string[]>([])
  const [maxAmount, setMaxAmount]             = useState('')
  const [maxDays, setMaxDays]                 = useState('')
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState<string>('')

  useEffect(() => {
    if (open) {
      setName(group?.name ?? '')
      setSelectedMethods(group?.payment_method_ids ?? [])
      setMaxAmount(group?.credit_limit != null ? String(group.credit_limit) : '')
      setMaxDays(group?.max_days != null ? String(group.max_days) : '')
      setDefaultPaymentTerms(group?.default_payment_terms ?? '')
    }
  }, [open, group])

  const PAYMENT_TERM_OPTIONS = [
    '100% Advance',
    '100% After Delivery',
    '50/50',
    'Net 30',
    'Net 60',
    'Custom',
  ] as const

  function toggleMethod(key: string) {
    setSelectedMethods((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  function handleSubmit() {
    if (!name.trim()) { toast.error('Name is required'); return }
    const credit_limit = maxAmount !== '' ? parseFloat(maxAmount) : 0
    if (isNaN(credit_limit) || credit_limit < 0) { toast.error('Enter a valid max amount'); return }
    const max_days = maxDays !== '' ? parseInt(maxDays, 10) : null
    if (max_days !== null && (isNaN(max_days) || max_days < 1)) { toast.error('Enter a valid number of days'); return }

    const default_payment_terms = defaultPaymentTerms || null

    if (isEdit) {
      update.mutate(
        { id: group.id, name: name.trim(), credit_limit, payment_method_ids: selectedMethods, max_days, default_payment_terms },
        {
          onSuccess: () => { toast.success('Credit group updated'); onOpenChange(false) },
          onError:   (err) => toast.error(err.message),
        }
      )
    } else {
      create.mutate(
        { name: name.trim(), credit_limit, payment_method_ids: selectedMethods, max_days, default_payment_terms },
        {
          onSuccess: () => { toast.success('Credit group added'); onOpenChange(false) },
          onError:   (err) => toast.error(err.message),
        }
      )
    }
  }

  const isPending = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Credit Group' : 'Add Credit Group'}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {isEdit ? 'Update this credit group.' : 'Create a new credit group.'}
          </p>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name *</label>
            <Input
              placeholder="e.g. Premium"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Payment Methods</label>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((pm) => {
                const selected = selectedMethods.includes(pm.id)
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => toggleMethod(pm.id)}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                      selected
                        ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300'
                        : 'border-input bg-background hover:bg-muted/50 text-foreground'
                    }`}
                  >
                    {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                    <span className={selected ? '' : 'ml-5'}>{pm.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Max Amount (QAR)</label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={maxAmount ? Number(maxAmount).toLocaleString('en-US', { maximumFractionDigits: 2 }) : ''}
                onChange={(e) => setMaxAmount(e.target.value.replace(/,/g, ''))}
              />
              {maxAmount && Number(maxAmount) >= 1000 && (
                <p className="text-[10px] text-muted-foreground/60">{formatCompact(Number(maxAmount))}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Max Days</label>
              <Input type="number" min="1" placeholder="—" value={maxDays} onChange={(e) => setMaxDays(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Default Payment Terms</label>
            <select
              value={defaultPaymentTerms}
              onChange={(e) => setDefaultPaymentTerms(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">No default — user picks per order</option>
              {PAYMENT_TERM_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">
              Pre-selected on the SO create page when a customer in this group is chosen.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save Changes' : 'Add Category')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

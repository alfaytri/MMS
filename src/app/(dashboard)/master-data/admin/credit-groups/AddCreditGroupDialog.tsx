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
  PAYMENT_METHODS,
  type CreditGroup,
} from '@/hooks/useCreditGroups'

interface CreditGroupDialogProps {
  open:         boolean
  onOpenChange: (open: boolean) => void
  group?:       CreditGroup
}

export function AddCreditGroupDialog({ open, onOpenChange, group }: CreditGroupDialogProps) {
  const isEdit = !!group
  const create = useCreateCreditGroup()
  const update = useUpdateCreditGroup()

  const [name, setName]                       = useState('')
  const [selectedMethods, setSelectedMethods] = useState<string[]>([])
  const [maxAmount, setMaxAmount]             = useState('')
  const [maxDays, setMaxDays]                 = useState('')

  useEffect(() => {
    if (open) {
      setName(group?.name ?? '')
      setSelectedMethods(group?.payment_methods ?? [])
      setMaxAmount(group?.credit_limit != null ? String(group.credit_limit) : '')
      setMaxDays(group?.max_days != null ? String(group.max_days) : '')
    }
  }, [open, group])

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

    if (isEdit) {
      update.mutate(
        { id: group.id, name: name.trim(), credit_limit, payment_methods: selectedMethods, max_days },
        {
          onSuccess: () => { toast.success('Credit group updated'); onOpenChange(false) },
          onError:   (err) => toast.error(err.message),
        }
      )
    } else {
      create.mutate(
        { name: name.trim(), credit_limit, payment_methods: selectedMethods, max_days },
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
              {PAYMENT_METHODS.map(({ key, label }) => {
                const selected = selectedMethods.includes(key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleMethod(key)}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                      selected
                        ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300'
                        : 'border-input bg-background hover:bg-muted/50 text-foreground'
                    }`}
                  >
                    {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                    <span className={selected ? '' : 'ml-5'}>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Max Amount (QAR)</label>
              <Input type="number" min="0" step="0.01" placeholder="0" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Max Days</label>
              <Input type="number" min="1" placeholder="—" value={maxDays} onChange={(e) => setMaxDays(e.target.value)} />
            </div>
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

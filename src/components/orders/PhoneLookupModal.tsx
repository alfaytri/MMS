'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CheckCircle, UserPlus, Phone } from 'lucide-react'
import { useCustomerLookup, type CustomerLookupResult } from '@/hooks/useCustomerLookup'
import { toast } from 'sonner'

type Step = 'phone' | 'found' | 'new-customer'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (result: CustomerLookupResult) => void
}

export function PhoneLookupModal({ open, onOpenChange, onConfirm }: Props) {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [linkPhone, setLinkPhone] = useState('')
  const [showLinkPhone, setShowLinkPhone] = useState(false)
  const [lookupResult, setLookupResult] = useState<CustomerLookupResult | null>(null)

  const { lookupPhone, quickCreate } = useCustomerLookup()

  function handleReset() {
    setStep('phone')
    setPhone('')
    setName('')
    setLinkPhone('')
    setShowLinkPhone(false)
    setLookupResult(null)
  }

  async function handleLookup() {
    if (!phone.trim()) return
    const result = await lookupPhone.mutateAsync(phone.trim())
    if (result.found) {
      setLookupResult(result)
      setStep('found')
    } else {
      setStep('new-customer')
    }
  }

  async function handleCreate() {
    if (!name.trim()) return
    try {
      const result = await quickCreate.mutateAsync({
        name: name.trim(),
        phone: phone.trim(),
        linkPhone: showLinkPhone ? linkPhone.trim() || undefined : undefined,
      })
      onConfirm(result)
      onOpenChange(false)
      handleReset()
    } catch {
      toast.error('Failed to create customer')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) handleReset() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Order</DialogTitle>
        </DialogHeader>

        {step === 'phone' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Customer Phone Number</Label>
              <Input
                id="phone"
                placeholder="+974 XXXX XXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleLookup} disabled={!phone.trim() || lookupPhone.isPending}>
                {lookupPhone.isPending ? 'Looking up…' : 'Look Up →'}
              </Button>
            </div>
          </div>
        )}

        {step === 'found' && lookupResult && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
              <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div>
                <p className="font-semibold text-slate-900">{lookupResult.customerName}</p>
                <p className="text-sm text-slate-500">
                  {lookupResult.addressCount} address{lookupResult.addressCount !== 1 ? 'es' : ''} ·{' '}
                  {lookupResult.orderCount} past order{lookupResult.orderCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep('phone')}>Change Number</Button>
              <Button onClick={() => { onConfirm(lookupResult); onOpenChange(false); handleReset() }}>
                Continue →
              </Button>
            </div>
          </div>
        )}

        {step === 'new-customer' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <UserPlus className="h-4 w-4" />
              New customer — {phone}
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Customer Name</Label>
              <Input
                id="name"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-600">
                Does this customer use another number for service requests?
              </p>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={!showLinkPhone} onChange={() => setShowLinkPhone(false)} />
                  No
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={showLinkPhone} onChange={() => setShowLinkPhone(true)} />
                  Yes
                </label>
              </div>
              {showLinkPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Other number"
                    value={linkPhone}
                    onChange={(e) => setLinkPhone(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep('phone')}>Back</Button>
              <Button onClick={handleCreate} disabled={!name.trim() || quickCreate.isPending}>
                {quickCreate.isPending ? 'Creating…' : 'Continue →'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

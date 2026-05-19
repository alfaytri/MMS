'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle, UserPlus } from 'lucide-react'
import { useCustomerLookup, type CustomerLookupResult } from '@/hooks/useCustomerLookup'
import { useContactCenterContext } from '@/contexts/ContactCenterContext'
import { toast } from 'sonner'

const COUNTRY_CODES = [
  { code: '+974', flag: '🇶🇦', label: 'QA' },
  { code: '+971', flag: '🇦🇪', label: 'AE' },
  { code: '+966', flag: '🇸🇦', label: 'SA' },
  { code: '+965', flag: '🇰🇼', label: 'KW' },
  { code: '+973', flag: '🇧🇭', label: 'BH' },
  { code: '+968', flag: '🇴🇲', label: 'OM' },
  { code: '+20',  flag: '🇪🇬', label: 'EG' },
  { code: '+1',   flag: '🇺🇸', label: 'US' },
  { code: '+44',  flag: '🇬🇧', label: 'GB' },
  { code: '+91',  flag: '🇮🇳', label: 'IN' },
  { code: '+92',  flag: '🇵🇰', label: 'PK' },
  { code: '+880', flag: '🇧🇩', label: 'BD' },
  { code: '+63',  flag: '🇵🇭', label: 'PH' },
  { code: '+94',  flag: '🇱🇰', label: 'LK' },
  { code: '+977', flag: '🇳🇵', label: 'NP' },
]

function PhoneInput({
  id,
  countryCode,
  onCountryCodeChange,
  value,
  onChange,
  placeholder,
  onKeyDown,
}: {
  id?: string
  countryCode: string
  onCountryCodeChange: (v: string) => void
  value: string
  onChange: (v: string) => void
  placeholder?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="flex">
      <Select value={countryCode} onValueChange={(v) => onCountryCodeChange(v ?? countryCode)}>
        <SelectTrigger className="w-24 shrink-0 rounded-r-none border-r-0 focus:z-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COUNTRY_CODES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              <span className="flex items-center gap-1.5">
                <span>{c.flag}</span>
                <span className="text-xs text-slate-500">{c.code}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        className="rounded-l-none"
        placeholder={placeholder ?? '5XXX XXXX'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}

type Step = 'phone' | 'found' | 'new-customer'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (result: CustomerLookupResult) => void
}

export function PhoneLookupModal({ open, onOpenChange, onConfirm }: Props) {
  const [step, setStep] = useState<Step>('phone')
  const [countryCode, setCountryCode] = useState('+974')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [entityType, setEntityType] = useState<'individual' | 'business'>('individual')
  const [linkCountryCode, setLinkCountryCode] = useState('+974')
  const [linkPhone, setLinkPhone] = useState('')
  const [showLinkPhone, setShowLinkPhone] = useState(false)
  const [lookupResult, setLookupResult] = useState<CustomerLookupResult | null>(null)

  const { lookupPhone, quickCreate } = useCustomerLookup()
  const { openCustomerByPhone, ccSidebar } = useContactCenterContext()

  const fullPhone = `${countryCode}${phone.trim().replace(/^0/, '')}`
  const fullLinkPhone = `${linkCountryCode}${linkPhone.trim().replace(/^0/, '')}`

  function handleReset() {
    setStep('phone')
    setCountryCode('+974')
    setPhone('')
    setName('')
    setEntityType('individual')
    setLinkCountryCode('+974')
    setLinkPhone('')
    setShowLinkPhone(false)
    setLookupResult(null)
  }

  async function handleLookup() {
    if (!phone.trim()) return
    // Open CRM sidebar for this phone immediately (only if user has CC access)
    if (ccSidebar !== 'none') openCustomerByPhone(fullPhone)
    const result = await lookupPhone.mutateAsync(fullPhone)
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
        phone: fullPhone,
        linkPhone: showLinkPhone ? fullLinkPhone || undefined : undefined,
        entityType,
      })
      onConfirm(result)
      onOpenChange(false)
      handleReset()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to create customer')
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
              <PhoneInput
                id="phone"
                countryCode={countryCode}
                onCountryCodeChange={setCountryCode}
                value={phone}
                onChange={setPhone}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.stopPropagation()
                    handleLookup()
                  }
                }}
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
              New customer — {fullPhone}
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
              <Label>Customer Type</Label>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="entity_type" checked={entityType === 'individual'} onChange={() => setEntityType('individual')} />
                  Individual
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="entity_type" checked={entityType === 'business'} onChange={() => setEntityType('business')} />
                  Business
                </label>
              </div>
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
                <PhoneInput
                  countryCode={linkCountryCode}
                  onCountryCodeChange={setLinkCountryCode}
                  value={linkPhone}
                  onChange={setLinkPhone}
                  placeholder="Other number"
                />
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

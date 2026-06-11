'use client'

import { useState } from 'react'
import { Phone, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PhoneInputWithCode } from '@/components/shared/PhoneInputWithCode'
import { useClickToCall } from '@/hooks/contact-center/useClickToCall'

export function DialPad() {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('+974')
  const [digits, setDigits] = useState('')
  const { dial, loading } = useClickToCall()

  async function handleCall() {
    const e164 = `${code}${digits.replace(/\D/g, '')}`
    if (digits.replace(/\D/g, '').length < 6) return
    await dial(e164)
    setDigits('')
  }

  return (
    <div className="border-b border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 h-10 text-sm hover:bg-muted/40"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2"><Phone className="h-4 w-4" /> Dial pad</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="px-3 py-3 space-y-2 min-h-32">
          <PhoneInputWithCode
            countryCode={code}
            onCountryCodeChange={setCode}
            value={digits}
            onChange={setDigits}
            placeholder="Number to dial"
          />
          <Button
            onClick={handleCall}
            disabled={loading || digits.replace(/\D/g, '').length < 6}
            className="w-full h-10"
          >
            <Phone className="h-4 w-4 mr-2" />
            {loading ? 'Calling…' : 'Call'}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Your softphone will ring first — answer it to connect to the customer.
          </p>
        </div>
      )}
    </div>
  )
}

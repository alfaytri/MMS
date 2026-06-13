'use client'

import { useState } from 'react'
import { Phone, ChevronDown, ChevronUp, Delete } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useClickToCall } from '@/hooks/contact-center/useClickToCall'
import { useCountryCodes } from '@/hooks/useCountryCodes'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const KEYS = [
  { digit: '1', sub: '' },
  { digit: '2', sub: 'ABC' },
  { digit: '3', sub: 'DEF' },
  { digit: '4', sub: 'GHI' },
  { digit: '5', sub: 'JKL' },
  { digit: '6', sub: 'MNO' },
  { digit: '7', sub: 'PQRS' },
  { digit: '8', sub: 'TUV' },
  { digit: '9', sub: 'WXYZ' },
  { digit: '*', sub: '' },
  { digit: '0', sub: '+' },
  { digit: '#', sub: '' },
] as const

export function DialPad() {
  const [open, setOpen] = useState(true)
  const [code, setCode] = useState('+974')
  const [digits, setDigits] = useState('')
  const { dial, loading } = useClickToCall()
  const { data: codes = [] } = useCountryCodes()

  const cleaned = digits.replace(/\D/g, '')
  const canCall = cleaned.length >= 6

  function press(key: string) {
    setDigits((d) => d + key)
  }

  function backspace() {
    setDigits((d) => d.slice(0, -1))
  }

  async function handleCall() {
    if (!canCall) return
    const codeWithoutPlus = code.slice(1)
    const finalDigits = cleaned.startsWith(codeWithoutPlus)
      ? cleaned.slice(codeWithoutPlus.length)
      : cleaned
    const e164 = `${code}${finalDigits}`
    const ok = await dial(e164)
    if (ok) setDigits('')
  }

  const currentCode = codes.find((c) => c.code === code)

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
        <div className="px-3 pb-3 pt-1">
          {/* Country code + number display */}
          <div className="flex items-center gap-1.5 mb-2">
            <Select value={code} onValueChange={(v) => { if (v) setCode(v) }}>
              <SelectTrigger className="h-9 w-[90px] text-xs px-2 shrink-0">
                <SelectValue>
                  {currentCode ? `${currentCode.flag} ${currentCode.code}` : code}
                </SelectValue>
              </SelectTrigger>
              <SelectContent side="right" align="start" alignItemWithTrigger={false} className="max-h-60">
                {codes.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="flex items-center gap-1.5">
                      <span>{c.flag}</span>
                      <span className="text-xs font-mono">{c.code}</span>
                      <span className="text-xs text-muted-foreground">{c.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1 flex items-center h-9 rounded-md border border-input bg-background px-2">
              <input
                type="tel"
                value={digits}
                onChange={(e) => setDigits(e.target.value.replace(/[^\d*#+]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter' && canCall) void handleCall() }}
                placeholder="Enter number"
                className="flex-1 bg-transparent text-sm font-mono tracking-wider outline-none placeholder:text-muted-foreground min-w-0"
              />
              {digits && (
                <button
                  type="button"
                  onClick={backspace}
                  className="ml-1 p-0.5 text-muted-foreground hover:text-foreground flex-shrink-0"
                  aria-label="Backspace"
                >
                  <Delete className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Numeric keypad grid */}
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {KEYS.map(({ digit, sub }) => (
              <button
                key={digit}
                type="button"
                onClick={() => press(digit)}
                className="flex flex-col items-center justify-center h-11 rounded-lg bg-muted/50 hover:bg-muted active:bg-muted/80 transition-colors select-none"
              >
                <span className="text-base font-semibold leading-none">{digit}</span>
                {sub && <span className="text-[8px] text-muted-foreground tracking-widest leading-none mt-0.5">{sub}</span>}
              </button>
            ))}
          </div>

          {/* Call button */}
          <Button
            onClick={handleCall}
            disabled={loading || !canCall}
            className="w-full h-11"
          >
            <Phone className="h-4 w-4 mr-2" />
            {loading ? 'Calling…' : 'Call'}
          </Button>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Your softphone will ring first — answer it to connect.
          </p>
        </div>
      )}
    </div>
  )
}

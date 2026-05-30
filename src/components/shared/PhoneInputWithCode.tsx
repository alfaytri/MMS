'use client'

import { useCountryCodes } from '@/hooks/useCountryCodes'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

// Known country code prefixes sorted longest-first so +880 matches before +8
const KNOWN_PREFIXES = [
  '+974', '+971', '+966', '+965', '+973', '+968',
  '+880', '+977', '+44', '+91', '+92', '+63', '+94', '+20', '+1',
].sort((a, b) => b.length - a.length)

/**
 * Split a stored phone string (e.g. "+97472195504") into { code, digits }.
 * Tries to match known country code prefixes; defaults to +974 if none match.
 */
export function splitPhone(stored: string | null | undefined): { code: string; digits: string } {
  if (!stored) return { code: '+974', digits: '' }
  const s = stored.trim()
  for (const prefix of KNOWN_PREFIXES) {
    if (s.startsWith(prefix)) {
      return { code: prefix, digits: s.slice(prefix.length) }
    }
  }
  // No prefix matched — return raw value as digits with default code
  return { code: '+974', digits: s.replace(/^\+/, '') }
}

interface PhoneInputWithCodeProps {
  value: string
  onChange: (digits: string) => void
  countryCode: string
  onCountryCodeChange: (code: string) => void
  disabled?: boolean
  placeholder?: string
  id?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

/** Strip to digits only */
function digitsOnly(v: string) {
  return v.replace(/\D/g, '')
}

export function PhoneInputWithCode({
  value,
  onChange,
  countryCode,
  onCountryCodeChange,
  disabled,
  placeholder = 'XXXX XXXX',
  id,
  onKeyDown,
}: PhoneInputWithCodeProps) {
  const { data: codes = [] } = useCountryCodes()

  // While loading, show a static trigger with the current code
  const currentEntry = codes.find((c) => c.code === countryCode)
  const triggerLabel = currentEntry
    ? `${currentEntry.flag} ${currentEntry.code}`
    : countryCode

  return (
    <div className="flex">
      <Select
        value={countryCode}
        onValueChange={(v) => { if (v) onCountryCodeChange(v) }}
        disabled={disabled}
      >
        <SelectTrigger className="w-[100px] shrink-0 rounded-r-none border-r-0 focus:z-10 h-9 text-sm">
          <SelectValue>{triggerLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
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
      <Input
        id={id}
        className="rounded-l-none h-9 text-sm"
        value={value}
        onChange={(e) => onChange(digitsOnly(e.target.value))}
        placeholder={placeholder}
        disabled={disabled}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}

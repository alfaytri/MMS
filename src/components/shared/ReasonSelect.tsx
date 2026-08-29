'use client'

import { useEffect, useMemo, useState } from 'react'
import { useReasonLists } from '@/hooks/useReasonLists'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const OTHER = '__other__'

interface ReasonSelectProps {
  /** reason_lists category slug, e.g. 'adjustment', 'write_off', 'cancellation' */
  category: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** show an "Other…" option that reveals a free-text box (default true) */
  allowOther?: boolean
  disabled?: boolean
  id?: string
  className?: string
}

/**
 * DB-driven reason picker. Renders the active reasons for `category`
 * (managed in Master Data › Reason Lists) plus an optional "Other…" escape
 * that reveals a free-text box. `value` is the plain reason string — a chosen
 * label, or the typed text when "Other" is used — so it drops in wherever a
 * free-text reason `value`/`onChange` was used before.
 */
export function ReasonSelect({
  category, value, onChange, placeholder = 'Select a reason…',
  allowOther = true, disabled, id, className,
}: ReasonSelectProps) {
  const { reasons, isLoading } = useReasonLists(category)
  const labels = useMemo(() => reasons.map((r) => r.label), [reasons])
  const [other, setOther] = useState(false)

  // Reflect an existing free-text value (e.g. editing a saved record) as "Other".
  useEffect(() => {
    if (value && labels.length > 0 && !labels.includes(value)) setOther(true)
  }, [value, labels])

  const selectValue = other ? OTHER : (labels.includes(value) ? value : '')

  return (
    <div className={cn('space-y-2', className)}>
      <Select
        value={selectValue}
        onValueChange={(v) => {
          const next = v ?? ''
          if (next === OTHER) { setOther(true); onChange('') }
          else { setOther(false); onChange(next) }
        }}
        disabled={disabled || isLoading}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={isLoading ? 'Loading…' : placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-60 overflow-y-auto">
          {reasons.map((r) => (
            <SelectItem key={r.id} value={r.label}>{r.label}</SelectItem>
          ))}
          {allowOther && <SelectItem value={OTHER}>Other…</SelectItem>}
        </SelectContent>
      </Select>
      {other && (
        <Input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type the reason…"
        />
      )}
    </div>
  )
}

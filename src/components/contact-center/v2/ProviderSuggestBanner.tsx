'use client'

import { ArrowRightLeft, X } from 'lucide-react'

interface Props {
  suggested:     'wati' | 'whapi' | null
  onSwitch:      () => void
  onDismiss:     () => void
}

const NAME: Record<'wati' | 'whapi', string> = { wati: 'WATI', whapi: 'WHAPI' }

export function ProviderSuggestBanner({ suggested, onSwitch, onDismiss }: Props) {
  if (!suggested) return null
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-y border-amber-200 text-amber-700 text-xs">
      <ArrowRightLeft className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="flex-1">
        Customer replied via <span className="font-semibold">{NAME[suggested]}</span> — switch?
      </span>
      <button
        onClick={onSwitch}
        className="text-xs font-semibold underline hover:no-underline"
      >
        Switch
      </button>
      <button
        onClick={onDismiss}
        className="opacity-60 hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

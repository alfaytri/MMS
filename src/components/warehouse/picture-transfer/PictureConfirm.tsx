'use client'

import { Check } from 'lucide-react'
import { PicturePhoto } from './PicturePhoto'
import type { CartLine } from './PictureItemFind'

/**
 * "Confirm & send" step — one card per line: big photo · name · "→ dest" ·
 * big count. One giant SEND button.
 */
export function PictureConfirm({
  lines,
  destLabel,
  sending,
  onSend,
}: {
  lines: CartLine[]
  destLabel: string
  sending: boolean
  onSend: () => void
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-base font-semibold">
        Sending to <span className="text-primary">{destLabel}</span>
      </p>
      <div className="flex flex-col gap-3">
        {lines.map(({ item, qty }) => (
          <div key={item.brand_variant_id} className="flex items-center gap-4 rounded-2xl border bg-card p-3">
            <PicturePhoto url={item.image_url} name={item.item_name} size={72} />
            <div className="min-w-0 flex-1">
              <div className="break-words text-base font-bold leading-tight">{item.item_name}</div>
              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                → {destLabel}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-extrabold tabular-nums">{qty}</div>
              <div className="text-[11px] font-semibold text-muted-foreground">{item.unit ?? 'pcs'}</div>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onSend}
        disabled={sending || lines.length === 0}
        className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-6 py-5 text-xl font-extrabold text-white transition disabled:opacity-50"
      >
        <Check className="h-6 w-6" /> {sending ? 'Sending…' : 'SEND'}
      </button>
    </div>
  )
}

'use client'

import { Phone } from 'lucide-react'
import { PhoneNumber } from './PhoneNumber'

interface PhoneEntry {
  id:         string
  phone:      string
  is_primary: boolean
}

export function PhonesRow({ phones }: { phones: PhoneEntry[] }) {
  if (phones.length === 0) {
    return <p className="text-xs text-muted-foreground px-3 py-1.5">No phones</p>
  }

  const primary    = phones.find((p) => p.is_primary) ?? phones[0]
  const secondary  = phones.filter((p) => p.id !== primary.id)

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 flex-wrap">
      <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-xs font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
        <PhoneNumber number={primary.phone} className="text-xs font-mono text-primary" />
      </span>
      {secondary.map((p) => (
        <PhoneNumber key={p.id} number={p.phone} className="text-xs font-mono text-muted-foreground" />
      ))}
    </div>
  )
}

'use client'

import { Phone } from 'lucide-react'

interface Props {
  number: string
  className?: string
}

export function PhoneNumber({ number, className }: Props) {
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      <Phone className="h-3 w-3" />
      <span>{number}</span>
    </span>
  )
}

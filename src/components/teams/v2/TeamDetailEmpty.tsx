'use client'

import { Users } from 'lucide-react'

export function TeamDetailEmpty() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
      <Users className="h-16 w-16 text-muted-foreground/30" />
      <p className="text-base font-medium">Select a team</p>
      <p className="text-sm text-muted-foreground max-w-sm">
        Pick a team from the left to view details. You can also drag from the pools drawer onto any team in the list.
      </p>
    </div>
  )
}

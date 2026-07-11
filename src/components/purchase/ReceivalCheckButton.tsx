'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Printer, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface Props {
  poId:            string
  poNumber:        string
  mode:            'per_receival' | 'blank'
  receivalId?:     string
  receivalNumber?: string
  label?:          string
  size?:           'sm' | 'default'
  className?:      string
}

export function ReceivalCheckButton({
  poId, mode, receivalId,
  label, size = 'sm', className,
}: Props) {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (busy) return
    setBusy(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const params = new URLSearchParams()
      params.set('mode', mode)
      if (mode === 'per_receival') {
        if (!receivalId) throw new Error('receivalId is required for per_receival mode')
        params.set('receivalId', receivalId)
      }

      const res = await fetch(`/api/purchase/po/${poId}/receival-check-pdf?${params}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      const json = await res.json() as { url: string }
      window.open(json.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate check sheet')
    } finally {
      setBusy(false)
    }
  }

  const defaultLabel = mode === 'blank' ? 'Print Blank Check Sheet' : 'Print'

  return (
    <Button
      variant="outline"
      size={size}
      onClick={handleClick}
      disabled={busy}
      className={className}
    >
      {busy
        ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
        : <Printer className="h-3.5 w-3.5 mr-1.5" />}
      {label ?? defaultLabel}
    </Button>
  )
}

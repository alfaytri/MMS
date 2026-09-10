'use client'

import { useQuery } from '@tanstack/react-query'

export type WatiTemplateOption = {
  elementName: string
  status: string
  category: string
}

/**
 * Lists the operator's WATI message templates (via /api/wati/templates) for the
 * Services → Notifications template picker. Returns [] when WATI isn't
 * configured — the picker then just shows the currently-assigned name.
 */
export function useWatiTemplates() {
  return useQuery({
    queryKey: ['wati-templates'],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<WatiTemplateOption[]> => {
      const res = await fetch('/api/wati/templates')
      if (!res.ok) return []
      const data = await res.json().catch(() => ({}))
      const list = (data?.messageTemplates ?? []) as Array<{ elementName?: string; status?: string; category?: string }>
      return list
        .filter((t) => !!t.elementName)
        .map((t) => ({ elementName: t.elementName as string, status: t.status ?? '', category: t.category ?? '' }))
        .sort((a, b) => a.elementName.localeCompare(b.elementName))
    },
  })
}

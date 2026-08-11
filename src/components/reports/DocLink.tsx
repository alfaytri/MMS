'use client'

import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

/**
 * Drill-down cell for a report grid: renders a document number as a link that
 * opens the source doc (new tab), or plain text when there's nothing to link to.
 * Use inside a ReportColumn `render` — it never affects the Excel/PDF export.
 */
export function DocLink({ href, label }: { href: string | null; label: string | null | undefined }) {
  if (!href || !label) return <span>{label ?? '—'}</span>
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
    >
      {label}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </Link>
  )
}

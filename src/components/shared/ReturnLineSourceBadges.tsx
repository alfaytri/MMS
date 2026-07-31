import { Badge } from '@/components/ui/badge'
import type { ReturnLineSourceInfo } from '@/hooks/useReturnLineSources'

/**
 * Renders the provenance badge trio for a return line: reference number
 * (receival# or delivery#), warehouse, and sub-container.
 *
 * Pass `info` from the resolved map returned by useReturnLineSources. When
 * null/undefined (legacy pre-D.4.a/b returns), renders a muted "no link" note.
 */
export function ReturnLineSourceBadges({ info }: { info: ReturnLineSourceInfo | null | undefined }) {
  if (!info) {
    return <span className="text-[10px] text-muted-foreground italic">Legacy — no source link</span>
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">{info.refNumber}</Badge>
      <Badge variant="outline" className="text-[10px] h-4 px-1.5">{info.warehouseName}</Badge>
      {info.subContainerName && (
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">{info.subContainerName}</Badge>
      )}
    </div>
  )
}

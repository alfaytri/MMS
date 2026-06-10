'use client'

interface Props {
  source:      'whatsapp_api' | 'whatsapp_whapi' | '3cx_call' | 'manual'
  phoneLast4?: string | null
  dateLabel?:  string | null
}

const LABEL: Record<Props['source'], string> = {
  whatsapp_api:   'WATI',
  whatsapp_whapi: 'WHAPI',
  '3cx_call':     '3CX',
  manual:         'Manual',
}

export function SourceDivider({ source, phoneLast4, dateLabel }: Props) {
  const parts = [LABEL[source]]
  if (phoneLast4)  parts.push(`••${phoneLast4}`)
  if (dateLabel)   parts.push(dateLabel)

  return (
    <div className="flex items-center gap-2 my-2 px-1">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap">
        {parts.join(' · ')}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

// Day-only divider, used when the source/phone don't change but the day flips
export function DayDivider({ dateLabel }: { dateLabel: string }) {
  return (
    <div className="flex items-center gap-2 my-1.5 px-1">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium whitespace-nowrap">
        {dateLabel}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

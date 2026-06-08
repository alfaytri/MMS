import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

interface ActivityLog {
  id: string
  action: string | null
  details: string | null
  performer_name: string | null
  severity: string | null
  created_at: string | null
}

interface DotColorRule {
  match: string
  className: string
}

interface ActivityTimelineProps {
  logs: ActivityLog[]
  dotColorRules?: DotColorRule[]
}

const DEFAULT_RULES: DotColorRule[] = [
  { match: 'Cancelled', className: 'bg-destructive border-destructive' },
  { match: 'Rejected', className: 'bg-destructive border-destructive' },
  { match: 'Approved', className: 'bg-green-500 border-green-500' },
  { match: 'Confirmed', className: 'bg-green-500 border-green-500' },
  { match: 'Delivered', className: 'bg-green-500 border-green-500' },
  { match: 'Received', className: 'bg-green-500 border-green-500' },
  { match: 'Payment', className: 'bg-purple-500 border-purple-500' },
  { match: 'Return', className: 'bg-orange-500 border-orange-500' },
  { match: 'Receival', className: 'bg-teal-500 border-teal-500' },
  { match: 'Force', className: 'bg-orange-500 border-orange-500' },
]

function getDotClass(action: string, rules: DotColorRule[]): string {
  for (const rule of rules) {
    if (action.includes(rule.match)) return rule.className
  }
  return 'bg-primary border-primary'
}

export function ActivityTimeline({ logs, dotColorRules = DEFAULT_RULES }: ActivityTimelineProps) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
  }

  return (
    <div className="relative pl-6 space-y-0">
      {logs.map((log, idx) => {
        const a = log.action ?? ''
        const dotClass = getDotClass(a, dotColorRules)
        return (
          <div key={log.id} className="relative pb-4">
            {idx < logs.length - 1 && (
              <span className="absolute left-[-16px] top-3 bottom-0 w-px bg-border" />
            )}
            <span className={cn('absolute left-[-20px] top-1.5 h-3 w-3 rounded-full border-2', dotClass)} />
            <div className="text-sm flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{log.action}</span>
              {log.severity === 'warning' && (
                <span className="text-xs text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">Warning</span>
              )}
              {log.severity === 'critical' && (
                <span className="text-xs text-red-700 bg-red-100 px-1.5 py-0.5 rounded">Critical</span>
              )}
              {log.performer_name && (
                <span className="text-muted-foreground text-xs">· {log.performer_name}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(log.created_at ?? '')}</p>
            {log.details && (
              <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

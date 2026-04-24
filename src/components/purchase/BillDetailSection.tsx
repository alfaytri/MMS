// src/components/purchase/BillDetailSection.tsx
import { cn } from '@/lib/utils'

type Props = {
  title?: string
  children: React.ReactNode
  className?: string
}

export function BillDetailSection({ title, children, className }: Props) {
  return (
    <div className={cn('break-inside-avoid', className)}>
      {title && (
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b pb-1">
          {title}
        </p>
      )}
      {children}
    </div>
  )
}

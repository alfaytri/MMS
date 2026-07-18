import { cn } from '@/lib/utils'

interface PageContainerProps {
  children: React.ReactNode
  compact?: boolean
  className?: string
}

export function PageContainer({ children, compact = false, className }: PageContainerProps) {
  return (
    <div
      className={cn(
        'w-full',
        !compact && 'px-3 sm:px-4 lg:px-6 2xl:px-10 py-3 sm:py-4 lg:py-6 space-y-6',
        className
      )}
    >
      {children}
    </div>
  )
}

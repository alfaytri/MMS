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
        'w-full max-w-screen-2xl mx-auto',
        !compact && 'px-4 sm:px-6 lg:px-8 py-4 lg:py-6 space-y-6',
        className
      )}
    >
      {children}
    </div>
  )
}

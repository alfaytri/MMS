import { cn } from '@/lib/utils'

interface ResponsivePageHeaderProps {
  title: React.ReactNode
  /** Optional subtitle / description displayed under the title. */
  description?: React.ReactNode
  /** Right-cluster action buttons. Stacks below the title on mobile. */
  actions?: React.ReactNode
  /** Truthy = sticky header (top:0). Pass top offset if outer scroll context. */
  sticky?: boolean
  className?: string
}

/**
 * Page-header layout primitive.
 *
 * On phone (< sm): title block on top, actions wrap underneath full-width.
 * On tablet+ (sm:+): title on the left, actions cluster on the right.
 *
 * Pair with PageContainer so the title and actions land inside the
 * max-w-screen-2xl rail on 4K TVs.
 */
export function ResponsivePageHeader({
  title,
  description,
  actions,
  sticky = false,
  className,
}: ResponsivePageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-b border-border bg-background px-4 sm:px-6 py-3 sm:py-4',
        'sm:flex-row sm:items-start sm:justify-between sm:gap-4',
        sticky && 'sticky top-0 z-10',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-lg sm:text-xl 2xl:text-2xl font-semibold leading-tight">
          {title}
        </h1>
        {description ? (
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-1.5 sm:flex-shrink-0">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

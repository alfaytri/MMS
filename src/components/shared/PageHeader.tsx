import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    icon?: ReactNode
  }
  actions?: ReactNode
}

export function PageHeader({ title, description, action, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl 2xl:text-3xl font-bold text-foreground">{title}</h1>
        {description && (
          <p className="text-sm 2xl:text-base text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {(action || actions) && (
        <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
          {actions}
          {action && (
            <Button onClick={action.onClick} className="w-full sm:w-auto">
              {action.icon ?? <Plus className="h-4 w-4 mr-1" />}
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

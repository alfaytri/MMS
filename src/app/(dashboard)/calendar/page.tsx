import { PageWrapper } from '@/components/shared/PageWrapper'
import { PageHeader } from '@/components/shared/PageHeader'

export default function CalendarPage() {
  return (
    <PageWrapper>
      <PageHeader title="Operations Calendar" />
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Calendar coming soon
      </div>
    </PageWrapper>
  )
}

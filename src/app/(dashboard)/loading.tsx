import { Skeleton } from '@/components/ui/skeleton'

/**
 * Shown by Next.js streaming while the requested (dashboard) route segment
 * downloads + hydrates. Renders instantly on navigation — users see content
 * skeletons rather than a blank screen for the 200-1500ms it takes the
 * client page to mount.
 */
export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-48" />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>

      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  )
}

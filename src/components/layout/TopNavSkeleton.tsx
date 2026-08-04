import { Wrench } from 'lucide-react'

/**
 * Render-blocking-free placeholder for TopNav while its auth + profile
 * fetches resolve. Matches TopNav's height/layout exactly so there's no
 * shift when the real header swaps in.
 */
export function TopNavSkeleton() {
  return (
    <header className="sticky top-0 z-50 h-14 bg-background border-b border-border flex items-center px-4 gap-2">
      <div className="flex items-center gap-2 text-primary font-bold mr-4 shrink-0">
        <Wrench className="h-5 w-5" />
        <span className="h-4 w-20 rounded bg-muted animate-pulse" aria-hidden />
      </div>
      <nav className="flex items-center gap-1 flex-1 overflow-x-auto" aria-hidden>
        <div className="h-6 w-24 rounded-md bg-muted animate-pulse" />
        <div className="h-6 w-20 rounded-md bg-muted animate-pulse" />
        <div className="h-6 w-24 rounded-md bg-muted animate-pulse" />
        <div className="h-6 w-20 rounded-md bg-muted animate-pulse" />
      </nav>
      <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
    </header>
  )
}

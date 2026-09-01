import Link from 'next/link'
import { Compass } from 'lucide-react'

/**
 * Custom 404. Rendered by Next.js for any unmatched route, inside the root
 * layout (theme available), so it works for both signed-in and signed-out
 * visitors. Standalone card matching the login / gate screens — no app shell.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-sm p-6 sm:p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Compass className="h-7 w-7" aria-hidden />
        </div>

        <p className="mt-5 text-4xl font-bold text-foreground tabular-nums">404</p>
        <h1 className="mt-1 text-xl font-semibold text-foreground">Page not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist, or it may have moved.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}

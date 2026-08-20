'use client'

// Top-level error boundary — catches a crash in the ROOT layout itself (the one
// case the existing app/error.tsx + dashboard error.tsx can't). Reports to Sentry
// (no-op until the DSN is set) and shows the default Next.js error page.
import * as Sentry from '@sentry/nextjs'
import NextError from 'next/error'
import { useEffect } from 'react'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        {/* App Router doesn't expose a status code here; 0 renders a generic message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  )
}

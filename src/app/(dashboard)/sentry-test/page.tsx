'use client'

// TEMPORARY — a one-off page to confirm Sentry is receiving events end-to-end.
// It lives under (dashboard) so it's behind auth and runs through SentryUser,
// meaning the test event is tagged with your name (proving the "who" too).
// DELETE this route (src/app/(dashboard)/sentry-test) once verified.
import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'

export default function SentryTestPage() {
  const [sent, setSent] = useState(false)

  return (
    <div className="p-8 space-y-4 max-w-md">
      <h1 className="text-lg font-semibold">Sentry test</h1>
      <p className="text-sm text-muted-foreground">
        Temporary check for error monitoring. Click a button below, then open
        Sentry → <strong>Issues</strong> — the event should appear within a few
        seconds, tagged with your name. Tell Claude once you see it and this page
        gets removed.
      </p>

      <div className="flex flex-col gap-2">
        <Button
          variant="destructive"
          onClick={() => {
            // Explicit capture — the most reliable check that the SDK is live.
            Sentry.captureException(new Error('Sentry test — captured client error'))
            setSent(true)
          }}
        >
          Send a test error to Sentry
        </Button>

        <Button
          variant="outline"
          onClick={() => {
            // Unhandled throw — verifies the global error handler path too.
            throw new Error('Sentry test — unhandled client error')
          }}
        >
          Throw an unhandled error
        </Button>

        {sent && (
          <p className="text-xs text-green-600">
            Sent. Check Sentry → Issues (allow a few seconds).
          </p>
        )}
      </div>
    </div>
  )
}

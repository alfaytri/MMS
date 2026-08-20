// Sentry — browser/client. Captures client-side JS errors (the monitoring gap:
// server errors already land in Vercel logs). Inert until NEXT_PUBLIC_SENTRY_DSN
// is set. Error monitoring only — no performance tracing, no session replay, to
// keep the client bundle light and stay within the free tier.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,
})

// Lets the SDK instrument App Router navigations (no-op while tracing is off).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

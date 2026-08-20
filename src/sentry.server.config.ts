// Sentry — server runtime (Node). Loaded by instrumentation.ts.
// Inert until NEXT_PUBLIC_SENTRY_DSN is set (e.g. as a Vercel env var), so this
// is a no-op in dev / before go-live. Error monitoring only — no performance
// tracing (tracesSampleRate: 0) to stay light and within the Sentry free tier.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: 0,
  sendDefaultPii: false,
})

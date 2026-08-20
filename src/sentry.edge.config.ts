// Sentry — edge runtime (middleware, edge routes). Loaded by instrumentation.ts.
// Inert until NEXT_PUBLIC_SENTRY_DSN is set. Error monitoring only.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: 0,
  sendDefaultPii: false,
})

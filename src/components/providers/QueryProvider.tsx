'use client'

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { isUnexpectedDbError } from '@/lib/dbErrors'

// Report EVERY query/mutation failure to Sentry with the RAW DB detail so we can
// debug it — while the app itself shows the humanized message (humanizeDbError).
// Real faults are captured at level 'error'; expected, user-caused conditions
// (permission, FK/unique/check, business rules, network) at level 'warning' so
// genuine bugs stand out but nothing is invisible. Sentry is inert until
// NEXT_PUBLIC_SENTRY_DSN is set, so this is a no-op locally. Handled errors
// never showed up before because nothing was ever sent — only unhandled crashes
// auto-report.
function reportToSentry(error: unknown, context: Record<string, unknown>) {
  if (error == null) return
  const e = error as { code?: string; message?: string; details?: string; hint?: string } | null
  const expected = !isUnexpectedDbError(error)
  // A PostgrestError is a plain object, not an Error — captureException would
  // serialize it poorly and drop code/details/hint. Wrap it in a real Error
  // carrying the verbatim raw detail (a thrown Error keeps its own stack).
  const rawMessage =
    [
      e?.code ? `[${e.code}]` : null,
      e?.message,
      e?.details ? `details: ${e.details}` : null,
      e?.hint ? `hint: ${e.hint}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Unknown error'
  const captured = error instanceof Error ? error : new Error(rawMessage)
  Sentry.captureException(captured, {
    level: expected ? 'warning' : 'error',
    tags: {
      source: 'react-query',
      kind: String(context.kind ?? ''),
      db_code: e?.code,
      expected: String(expected),
    },
    extra: {
      ...context,
      raw_code: e?.code,
      raw_message: e?.message,
      raw_details: e?.details,
      raw_hint: e?.hint,
    },
  })
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) =>
            reportToSentry(error, { source: 'react-query', kind: 'query', queryKey: query.queryKey }),
        }),
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) =>
            reportToSentry(error, { source: 'react-query', kind: 'mutation', mutationKey: mutation.options.mutationKey }),
        }),
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 5 * 60 * 1000,
            // retry: 1 — a single retry rides out a transient blip without the
            // old 4-attempts-per-query storm hammering Supabase during an outage
            // (on a query-heavy page that amplified load exactly when it hurt).
            retry: 1,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  )
}

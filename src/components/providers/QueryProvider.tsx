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

// Report a query/mutation failure to Sentry — but only genuine faults, not the
// routine, user-caused conditions we already turn into friendly toasts
// (permission blocks, FK/unique/check violations, business rules, network
// blips). Sentry is inert until NEXT_PUBLIC_SENTRY_DSN is set, so this is a
// no-op locally. This is why handled errors (a toast) never showed up before —
// nothing was ever sent; only unhandled crashes auto-report.
function reportToSentry(error: unknown, context: Record<string, unknown>) {
  if (!isUnexpectedDbError(error)) return
  Sentry.captureException(error, { extra: context })
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

/**
 * Shared react-query behaviour presets.
 *
 * The app disables `refetchOnWindowFocus` globally in QueryProvider to protect
 * the Supabase Free-plan quota. The side effect is that operational lists go
 * stale until a manual refresh — a request another user just made, or a status
 * another user just changed, doesn't appear on its own.
 *
 * Spread one of these into a `useQuery` for surfaces that must reflect other
 * users' actions without a manual refresh. Tune the cadence HERE, once, instead
 * of per hook.
 *
 * Budget rules (docs/supabase-budget.md): poll no faster than 5s, and only while
 * visible. react-query pauses the interval when the browser tab is hidden
 * (`refetchIntervalInBackground` defaults to false), and the interval only runs
 * while the query has an active observer (i.e. the page/tab is mounted), so these
 * are safe to reach for — but only on BOUNDED lists (keep the query's `.limit()`).
 */

/**
 * Live operational inbox — pending queues and small transfer/assignment lists
 * that staff watch to act on. Polls every 20s while visible, refetches on focus,
 * and treats data older than 15s as stale so returning to the tab refreshes.
 *
 * Only spread onto bounded queries (always keep a `.limit(N)`); never onto a
 * large or unbounded list.
 */
export const liveInboxQueryOptions = {
  staleTime: 15 * 1000,
  refetchInterval: 20 * 1000,
  refetchOnWindowFocus: true,
} as const

/**
 * Refresh when the user returns to the tab, but do NOT poll. For heavier lists
 * where a continuous interval would cost too much, but stale-on-return is still
 * worth fixing.
 */
export const refreshOnFocusQueryOptions = {
  staleTime: 30 * 1000,
  refetchOnWindowFocus: true,
} as const

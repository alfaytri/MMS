import type { PurgeFilter } from './purge-filter';

/**
 * Builds the exact confirmation phrase the admin must type to authorise a purge.
 *
 * The phrase is intentionally verbose so it cannot be triggered by accident.
 * Both the UI (which displays it) and the server (which validates it) import
 * this function so the strings are guaranteed to match.
 */
export function confirmPhrase(filter: PurgeFilter): string {
  return `DELETE messages from ${filter.date_from} to ${filter.date_to}`;
}

/**
 * Strict byte-equality check — no trimming, no case normalisation,
 * no whitespace collapsing. Returns true only when `typed` is exactly
 * the same string as `expected`.
 */
export function phraseMatches(typed: string, expected: string): boolean {
  return typed === expected;
}

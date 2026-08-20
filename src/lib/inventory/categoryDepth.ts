/**
 * Nesting-depth styling for the inventory category tree (products + tools).
 *
 * The old ramp (slate → blue → violet → amber) was hard to read: blue and
 * violet looked nearly identical, and every level past 2 collapsed into the
 * same amber. This ramp gives each level a hue that's clearly distinct from its
 * neighbours, and — the strong cue — a saturated coloured folder icon per
 * level. Row backgrounds stay light (`-50`) so the blue category-name text
 * keeps its contrast; the icon carries the unambiguous per-level signal.
 * Anything deeper than the last entry reuses the deepest style.
 */
export const CATEGORY_DEPTH_STYLES = [
  { row: 'bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700',        icon: 'text-slate-500 dark:text-slate-400' },   // 0 · top level
  { row: 'bg-sky-50 hover:bg-sky-100/80 dark:bg-sky-950/50 dark:hover:bg-sky-900/40',           icon: 'text-sky-600 dark:text-sky-400' },       // 1
  { row: 'bg-emerald-50 hover:bg-emerald-100/80 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/40', icon: 'text-emerald-600 dark:text-emerald-400' }, // 2
  { row: 'bg-amber-50 hover:bg-amber-100/80 dark:bg-amber-950/50 dark:hover:bg-amber-900/40',   icon: 'text-amber-600 dark:text-amber-400' },   // 3
  { row: 'bg-violet-50 hover:bg-violet-100/80 dark:bg-violet-950/50 dark:hover:bg-violet-900/40', icon: 'text-violet-600 dark:text-violet-400' }, // 4
  { row: 'bg-rose-50 hover:bg-rose-100/80 dark:bg-rose-950/50 dark:hover:bg-rose-900/40',       icon: 'text-rose-600 dark:text-rose-400' },     // 5+
] as const

export function categoryDepthStyle(depth: number) {
  const i = Math.min(Math.max(depth, 0), CATEGORY_DEPTH_STYLES.length - 1)
  return CATEGORY_DEPTH_STYLES[i]
}

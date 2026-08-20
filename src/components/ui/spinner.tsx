import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The single loading spinner for the whole app. Before this, `Loader2` +
 * `animate-spin` was hand-rolled in ~40 files with inconsistent sizes and no
 * accessible label. Prefer this everywhere a wait needs a spinner; the Button
 * `loading` prop uses it too.
 *
 * `animate-spin` keeps spinning under `prefers-reduced-motion` (a frozen
 * spinner reads as broken — see the guard in globals.css). `role="status"` +
 * the visually-hidden label announce the wait to screen readers.
 */
const SIZES = {
  xs: "size-3",
  sm: "size-4",
  default: "size-5",
  lg: "size-6",
  xl: "size-8",
} as const

type SpinnerProps = React.ComponentProps<"span"> & {
  size?: keyof typeof SIZES
  /** Announced to assistive tech; visually hidden. */
  label?: string
}

function Spinner({
  size = "default",
  label = "Loading",
  className,
  ...props
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      data-slot="spinner"
      className={cn("inline-flex items-center justify-center text-current", className)}
      {...props}
    >
      <Loader2 className={cn("animate-spin", SIZES[size])} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export { Spinner }

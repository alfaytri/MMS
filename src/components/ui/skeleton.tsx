import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      // `animate-shimmer` (globals.css) sweeps a soft highlight across the
      // block so it reads as "content is loading"; `bg-muted` is the base/
      // reduced-motion fallback.
      className={cn("rounded-md bg-muted animate-shimmer", className)}
      {...props}
    />
  )
}

export { Skeleton }

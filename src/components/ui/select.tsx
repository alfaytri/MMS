"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"

// ── Label registry ─────────────────────────────────────────────────────────────
// Each <Select> owns a stable Map<stringifiedValue, displayLabel>.
// <SelectItem> populates it on mount via useLayoutEffect.
// When new entries are added, bump() is called — this increments a version
// counter held in context, causing <SelectValue> to re-render so
// itemToStringLabel returns the human-readable label instead of the raw value.
interface RegistryCtx {
  registry: Map<string, string>
  bump: () => void
}
const SelectRegistryCtx = React.createContext<RegistryCtx>({
  registry: new Map(),
  bump: () => {},
})

// ── Select (root) ──────────────────────────────────────────────────────────────
function Select({ children, ...props }: SelectPrimitive.Root.Props) {
  const [registry] = React.useState<Map<string, string>>(() => new Map())
  const [version, bump] = React.useReducer((v: number) => v + 1, 0)

  const itemToStringLabel = React.useCallback(
    (value: unknown): string => registry.get(String(value ?? "")) ?? "",
    [registry],
  )

  // Re-create context value only when version changes so SelectValue and
  // SelectItem only re-render when registry entries are actually added.
  const ctxValue = React.useMemo(
    () => ({ registry, bump }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registry, version],
  )

  return (
    <SelectRegistryCtx.Provider value={ctxValue}>
      <SelectPrimitive.Root
        itemToStringLabel={
          props.itemToStringLabel ??
          (itemToStringLabel as SelectPrimitive.Root.Props["itemToStringLabel"])
        }
        {...props}
      >
        {children}
      </SelectPrimitive.Root>
    </SelectRegistryCtx.Provider>
  )
}

// ── SelectGroup ────────────────────────────────────────────────────────────────
function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

// ── SelectValue ────────────────────────────────────────────────────────────────
function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  // Subscribe to the registry context so this re-renders whenever bump() is
  // called — i.e. after SelectItem mounts and populates a new registry entry.
  React.useContext(SelectRegistryCtx)

  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  )
}

// ── SelectTrigger ──────────────────────────────────────────────────────────────
function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

// ── SelectContent ──────────────────────────────────────────────────────────────
function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn("relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className)}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

// ── SelectLabel ────────────────────────────────────────────────────────────────
function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

// ── SelectItem ─────────────────────────────────────────────────────────────────
function SelectItem({
  className,
  children,
  value,
  ...props
}: SelectPrimitive.Item.Props) {
  const { registry, bump } = React.useContext(SelectRegistryCtx)
  const textRef = React.useRef<HTMLElement | null>(null)

  // Populate the registry after the DOM is committed, then signal SelectValue
  // to re-render by calling bump(). Guards with has(key) so each value is only
  // registered once — prevents infinite bump loops.
  React.useLayoutEffect(() => {
    if (value == null) return
    const key = String(value)
    if (registry.has(key)) return

    let label: string | undefined
    if (typeof children === "string" && children) {
      label = children
    } else if (textRef.current) {
      label = textRef.current.textContent?.trim()
    }
    if (label) {
      registry.set(key, label)
      bump()
    }
  })

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      value={value}
      {...props}
    >
      <SelectPrimitive.ItemText
        ref={textRef as React.Ref<HTMLElement>}
        className="flex flex-1 shrink-0 gap-2 whitespace-nowrap"
      >
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

// ── SelectSeparator ────────────────────────────────────────────────────────────
function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

// ── Scroll arrows ──────────────────────────────────────────────────────────────
function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}

/**
 * Shared motion vocabulary
 * ────────────────────────
 * One place for the app's overlay-UI entrance/exit motion, so every dialog,
 * sheet, popover, dropdown, select, tooltip and hover-card animates with the
 * same timing and easing. Change a curve or a duration here and it updates
 * everywhere — instead of the same class soup being copy-pasted into each
 * `ui/*` primitive.
 *
 * Timing follows the product-motion budget: state-conveying, not decorative.
 *   • Surfaces (dialogs, sheets, alert dialogs): 200 ms in / 150 ms out.
 *   • Anchored menus (popover, dropdown, select, hover-card): 150 ms in / 100 ms out.
 *   • Exits run shorter than entrances — dismissal should feel immediate.
 * Easing is `ease-out-quint` (defined in tailwind.config.ts). tailwindcss-animate
 * routes `duration-*`/`ease-*` onto BOTH the CSS transition and the
 * `animate-in`/`animate-out` keyframes, so these classes work whether a
 * primitive animates via keyframes (Base UI `data-open`) or transitions.
 *
 * Reduced motion is handled globally in globals.css (`prefers-reduced-motion`),
 * so these presets deliberately carry no `motion-reduce:` variants.
 *
 * Two attribute dialects coexist in this codebase:
 *   • Base UI (`@base-ui/react`)  → `data-open` / `data-closed`
 *   • Radix   (`@radix-ui/react`) → `data-[state=open]` / `data-[state=closed]`
 * Presets are suffixed `Radix` for the latter. Side-slide classes
 * (`slide-in-from-*`) stay in each component because they depend on the
 * resolved side; these presets own only fade, zoom, easing and duration.
 */

// ── Base UI (data-open / data-closed) ───────────────────────────────────────

/** Backdrop/overlay fade — Dialog & Sheet overlays. */
export const motionOverlay =
  'ease-out-quint duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 data-closed:duration-150'

/**
 * Centered modal surface — Dialog.
 * The translate is pinned to -50%/-50% (matching the `-translate-x/y-1/2`
 * centering) so the surface zooms IN PLACE. Without the pin, tailwindcss-animate's
 * `enter` keyframe resets translate to 0 and the modal visibly slides in from
 * the top-left as it scales.
 */
export const motionDialog =
  'ease-out-quint duration-200 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-open:slide-in-from-left-1/2 data-open:slide-in-from-top-1/2 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-closed:slide-out-to-left-1/2 data-closed:slide-out-to-top-1/2 data-closed:duration-150'

/**
 * Anchored menu surface — Popover, DropdownMenu, Select.
 * Positioned by a Positioner (zoom origin = `--transform-origin`), so no
 * translate pin is needed. Each component keeps its own `slide-in-from-<side>`.
 */
export const motionPopover =
  'ease-out-quint duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-closed:duration-100'

// ── Radix (data-[state=open] / data-[state=closed]) ─────────────────────────

/** Backdrop/overlay fade — AlertDialog overlay. */
export const motionOverlayRadix =
  'ease-out-quint data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150'

/**
 * Centered modal surface — AlertDialog. Fade + zoom only; the component keeps
 * its own `slide-in-from-left-1/2` / `slide-in-from-top-[48%]` translate pin.
 */
export const motionDialogRadix =
  'ease-out-quint data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150'

/** Anchored surface — Tooltip, HoverCard. Component keeps its `slide-in-from-<side>`. */
export const motionPopoverRadix =
  'ease-out-quint data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-100'

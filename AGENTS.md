<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Responsive Design — Mandatory Rule

Every UI component and page MUST be fully responsive across all four breakpoints:

| Breakpoint | Target | Tailwind prefix |
|---|---|---|
| `< 640px` | Phone | (default / no prefix) |
| `640px – 1024px` | Tablet | `sm:` / `md:` |
| `1024px – 1920px` | Laptop / Desktop | `lg:` / `xl:` |
| `> 1920px` | TV / Large screen | `2xl:` |

**Rules:**
- Never hardcode pixel widths on layout containers — use `w-full`, `max-w-*`, or responsive fractions
- Tables must collapse gracefully on mobile: hide lower-priority columns below `md:`, use horizontal scroll as fallback
- Dialogs/modals: full-screen on mobile (`w-full h-full rounded-none`), centered card on `md:+`
- Navigation: TopNav is desktop-first — implement a hamburger/drawer for `< lg:` screens
- Font sizes, padding, and spacing must scale — avoid fixed `px` values that look wrong on 4K
- Touch targets must be at least `44px` tall on mobile (use `min-h-11` or `h-11`)
- Test mentally at each breakpoint before marking any UI task complete

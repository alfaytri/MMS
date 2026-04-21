# Services Hub — Notifications Tab Redesign

**Date:** 2026-04-21
**Route:** `/master-data/services` → Notifications tab (`reminders` key in tab bar)
**Status:** Approved, ready for implementation

---

## 1. Goal

Replace the current `NotificationsTab.tsx` (basic table, read-only fixed list, CRUD reminder dialogs) with a polished, density-matched UI that follows the inch-by-inch spec. The new design:

- Renders `<NotificationsTableView>` as the entry point
- Splits into two sub-tabs: Fixed Notifications and Service Reminders
- Uses fixed-width sticky columns, collapsible category groups, active switches, and template preview dialogs
- Makes Service Reminders read-only (no add/edit)

---

## 2. Database Changes

### 2a. One new migration file

**File:** `supabase/migrations/20260421XXXXXX_notification_config_body_text.sql`

```sql
ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS body_text TEXT;
```

`notification_config` table already exists (migration `20260416121000_missing_tables.sql`) with the correct schema:
- `id`, `slug` (UNIQUE), `label`, `label_ar`, `notes`, `category`, `trigger_type`, `timing_description`
- `template_slug TEXT REFERENCES notification_templates(slug)` — slug-based FK (not UUID)
- `is_active BOOLEAN`, `sort_order INT`
- `updated_at` auto-maintained by existing `set_updated_at()` trigger

### 2b. Seed file

**File:** `supabase/migrations/20260421XXXXXX_notification_config_seed.sql`

One `INSERT` block per category group (booking, visit, contract, payment, system). Rows reference existing `notification_templates.slug` values. `body_text` populated inline in the same seed on the templates rows via `UPDATE`.

---

## 3. Hook — `useNotificationConfig.ts`

**Location:** `src/hooks/useNotificationConfig.ts`

### Return shape

```ts
type NotificationConfigRow = {
  id: string
  slug: string
  category: string
  label: string
  labelAr: string | null
  notes: string | null
  templateName: string       // notification_templates.wati_template_name
  templateSlug: string       // notification_templates.slug
  bodyText: string | null    // notification_templates.body_text
  mediaType: string          // notification_templates.media_type
  triggerType: string
  timingDescription: string | null
  isActive: boolean
}

type UseNotificationConfigReturn = {
  grouped: Record<string, NotificationConfigRow[]>  // keyed by category, ordered by sort_order
  loading: boolean
  error: string | null
  toggleActive: (id: string, isActive: boolean) => Promise<boolean>
}
```

### Query

Supabase join: `notification_config` → `notification_templates` on `template_slug = slug`, selecting all needed columns. `staleTime: 5min`.

Grouping done once after fetch via `reduce` — no per-render work in components.

Category order derived from minimum `sort_order` within each group.

### `toggleActive` mutation

| Step | Detail |
|------|--------|
| `onMutate` | Snapshot current cache; flip `is_active` in cached row; stash `slug` from snapshot for logging |
| Supabase call | `UPDATE notification_config SET is_active = newValue WHERE id = id` |
| `onSuccess` | Best-effort insert into `activity_log`: `{ action: 'services/notification-toggled', module: 'services', entity_type: 'notification_config', entity_id: id, details: JSON.stringify({ slug, is_active: newValue }) }`. Silent fail — log error does not surface to user. |
| `onError` | Restore snapshot; return `false` |
| `onSettled` | Invalidate `['notification_config']` query |
| Returns | `true` on success, `false` on Supabase error |

Each toggle is an independent mutation cycle — no batching, no debounce.

---

## 4. Components

### 4a. `NotificationsTableView.tsx`

**Location:** `src/components/services/NotificationsTableView.tsx`

Entry point. Owns:
- Notifications header strip: `flex items-center gap-2 px-4 py-3 border-b border-border bg-card` with `<Bell h-4 w-4 text-muted-foreground/>` + `<h2 text-sm font-semibold>Notifications</h2>`
- Sub-tab strip: `<Tabs defaultValue="fixed">` with `h-8 bg-transparent p-0 gap-0` TabsList
- Two sub-tab triggers (Fixed Notifications / Service Reminders) with `MessageSquare` / `Clock` icons, `text-xs rounded-none border-b-2 border-transparent px-4 py-1.5 gap-1.5` classes, active state adds `border-primary`
- `previewItem` state (`NotificationConfigRow | ReminderPreviewItem | null`)
- Renders `<FixedNotificationsSection onPreview={setPreviewItem}/>` and `<ServiceRemindersSection onPreview={setPreviewItem}/>`
- Renders `<TemplatePreviewDialog open={!!previewItem} item={previewItem} onOpenChange={…}/>`

**Props:** `{ enabled: boolean }`

### 4b. `FixedNotificationsSection.tsx`

**Location:** `src/components/services/FixedNotificationsSection.tsx`

Reads from `useNotificationConfig()`. Renders:

**Column header row** (`flex items-center border-b border-border bg-muted/50 text-[10px] uppercase tracking-wider`):

| Width | Padding | Align | Label |
|-------|---------|-------|-------|
| `w-[320px]` | `px-4 py-2` | left | Notification |
| `w-[180px]` | `px-2 py-2` | left | Template |
| `w-[120px]` | `px-2 py-2` | left | Trigger |
| `w-[180px]` | `px-2 py-2` | left | Timing |
| `w-[80px]` | `px-2 py-2` | center | Active |
| `w-[50px]` | `px-2 py-2` | center | View |

**Category group header** (one per key in `grouped`):
- `flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30 cursor-pointer hover:bg-muted/50`
- Toggle: `ChevronDown` (expanded) / `ChevronRight` (collapsed) — all start expanded
- Category name capitalized + item count as `text-xs text-muted-foreground`

**Data row** (`flex items-center border-b border-border/50 hover:bg-muted/20 min-h-[44px]`):
- Cell 1 (`w-[320px] px-4 py-2 pl-10`): `label` (text-xs font-medium) + `labelAr` (text-[10px] text-muted-foreground) + `notes` (text-[10px] text-muted-foreground/60)
- Cell 2 (`w-[180px] px-2 py-2`): `templateName` + media badge if `mediaType !== 'none'`
- Cell 3 (`w-[120px] px-2 py-2`): `<Badge variant="outline" text-[9px]>{triggerType}</Badge>`
- Cell 4 (`w-[180px] px-2 py-2`): `timingDescription || '—'` as `text-xs text-muted-foreground`
- Cell 5 (`w-[80px] px-2 py-2 flex justify-center`): shadcn `<Switch>` bound to `isActive`, on change calls `toggleActive` → toast on result
- Cell 6 (`w-[50px] px-2 py-2 flex justify-center`): ghost icon button `h-6 w-6` with `<Eye h-3.5 w-3.5/>`, calls `onPreview(item)`

**Toast messages:**
- Toggle success on: `"Notification enabled"`
- Toggle success off: `"Notification disabled"`
- Toggle failure: destructive `"Error toggling notification"`

**Loading state:** `<div class="p-4 text-sm text-muted-foreground">Loading…</div>`
**Error state:** `<div class="p-4 text-sm text-destructive">Error loading notifications: {error}</div>`

### 4c. `ServiceRemindersSection.tsx`

**Location:** `src/components/services/ServiceRemindersSection.tsx`

Reads from `useReminderCategories()` + `useReminders()` (existing hooks in `useNotifications.ts`).

Same fixed-width column header and category/chevron group pattern as `FixedNotificationsSection`.

**Data row differences:**
- Notification cell: `name` + `name_ar` (no notes field)
- Template cell: `reminder.template` free-text, no media badge
- Trigger cell: static `'scheduled'` badge
- Timing cell: `reminder.timing || '—'`
- Active cell: `<Switch>` bound to `status === 'active'`, on change calls `useUpdateReminder` mutating `{ status: 'active' | 'inactive' }` with optimistic update; same toast pattern
- View cell: Eye button calls `onPreview` with a `ReminderPreviewItem` shaped from the reminder row

**No add/edit controls** — read-only. `ReminderEditDialog` is not imported.

### 4d. `TemplatePreviewDialog.tsx`

**Location:** `src/components/services/TemplatePreviewDialog.tsx`

**Props:**
```ts
type PreviewItem = {
  label: string
  labelAr?: string | null
  category: string
  triggerType: string
  timingDescription?: string | null
  bodyText?: string | null
  mediaType?: string
}
interface TemplatePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: PreviewItem | null
}
```

Renders shadcn `<Dialog>`. Content:
- Header: label + `labelAr` (RTL if present)
- Badges row: category, triggerType, mediaType (if not 'none')
- Timing line if present
- Body text in `<pre class="text-xs bg-muted rounded p-3 whitespace-pre-wrap font-mono">` — shows `"No preview available"` if `bodyText` is null
- Closes via ESC, outside click, or default close button

### 4e. `NotificationsTab.tsx` (gutted)

```tsx
export function NotificationsTab({ enabled }: { enabled: boolean }) {
  return <NotificationsTableView enabled={enabled} />
}
```

`ReminderEditDialog` import removed. All other internal functions removed.

---

## 5. File Manifest

| Action | File |
|--------|------|
| New migration | `supabase/migrations/20260421XXXXXX_notification_config_body_text.sql` |
| New seed | `supabase/migrations/20260421XXXXXX_notification_config_seed.sql` |
| New hook | `src/hooks/useNotificationConfig.ts` |
| New component | `src/components/services/NotificationsTableView.tsx` |
| New component | `src/components/services/FixedNotificationsSection.tsx` |
| New component | `src/components/services/ServiceRemindersSection.tsx` |
| New component | `src/components/services/TemplatePreviewDialog.tsx` |
| Modified | `src/components/services/NotificationsTab.tsx` (gutted to shell) |

---

## 6. Out of Scope

- Adding/editing notification config rows (Supabase admin only)
- Template body text population (manual via Supabase after seeding)
- `notification_trail` integration (separate feature)
- RTL layout for the full page (existing global RTL handles Arabic text inline)

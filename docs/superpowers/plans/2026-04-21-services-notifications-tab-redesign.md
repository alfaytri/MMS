# Services Hub — Notifications Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing `NotificationsTab.tsx` with a polished, density-matched UI featuring fixed-width columns, collapsible category groups, active toggle switches, and template preview dialogs — split across two read-only sub-tabs (Fixed Notifications and Service Reminders).

**Architecture:** Multi-file split — one hook (`useNotificationConfig.ts`), four new components (`NotificationsTableView`, `FixedNotificationsSection`, `ServiceRemindersSection`, `TemplatePreviewDialog`), and a gutted `NotificationsTab.tsx` shell. The hook owns data fetching, optimistic mutation, and activity logging. Components are purely presentational with callbacks.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query v5, Supabase JS v2, shadcn/ui (`Switch`, `Badge`, `Dialog`, `Tabs`), Lucide icons, Sonner toasts, Tailwind CSS.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| New migration | `supabase/migrations/20260421000003_notification_config_body_text.sql` | Add `body_text` to `notification_templates` |
| New seed | `supabase/migrations/20260421000004_notification_config_seed.sql` | Seed `notification_config` rows + `body_text` values |
| Update types | `src/types/database.types.ts` | Add `body_text` field to `notification_templates` Row/Insert/Update |
| New hook | `src/hooks/useNotificationConfig.ts` | Query, grouping (useMemo), toggleActive mutation |
| New component | `src/components/services/TemplatePreviewDialog.tsx` | Preview dialog (pure display, no data fetching) |
| New component | `src/components/services/FixedNotificationsSection.tsx` | Fixed notifications grid — calls hook, renders rows |
| New component | `src/components/services/ServiceRemindersSection.tsx` | Reminders grid — uses existing hooks, same grid shape |
| New component | `src/components/services/NotificationsTableView.tsx` | Entry point: header strip, sub-tab strip, preview state |
| Modify | `src/components/services/NotificationsTab.tsx` | Gut to thin shell |

---

## Task 1: DB Migration — Add `body_text` to `notification_templates`

**Files:**
- Create: `supabase/migrations/20260421000003_notification_config_body_text.sql`
- Modify: `src/types/database.types.ts`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260421000003_notification_config_body_text.sql
ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS body_text TEXT;
```

- [ ] **Step 2: Apply to local Supabase**

```bash
npx supabase db push
```

Expected output: `Applying migration 20260421000003_notification_config_body_text.sql... done`

- [ ] **Step 3: Manually update `database.types.ts` for `notification_templates`**

Find the `notification_templates` Row block (currently around line 1541) and add `body_text`:

```ts
// notification_templates → Row (add):
body_text: string | null

// notification_templates → Insert (add):
body_text?: string | null

// notification_templates → Update (add):
body_text?: string | null
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260421000003_notification_config_body_text.sql src/types/database.types.ts
git commit -m "feat(db): add body_text column to notification_templates"
```

---

## Task 2: Seed `notification_config` Rows

**Files:**
- Create: `supabase/migrations/20260421000004_notification_config_seed.sql`

**Before writing the seed:** run this in Supabase Studio SQL editor to see available template slugs:
```sql
SELECT slug, wati_template_name FROM notification_templates ORDER BY slug;
```

Use those real slug values in the INSERT below. The rows below are representative — replace the `template_slug` values with actual slugs from your DB.

- [ ] **Step 1: Write the seed migration**

```sql
-- supabase/migrations/20260421000004_notification_config_seed.sql

-- ── BOOKING category ──────────────────────────────────────────
INSERT INTO notification_config
  (slug, label, label_ar, category, trigger_type, timing_description, template_slug, is_active, sort_order, notes)
VALUES
  ('booking_confirmed', 'Booking Confirmed', 'تأكيد الحجز', 'booking', 'event', 'Sent immediately on booking confirmation', 'booking_confirmation', true, 10, NULL),
  ('booking_reminder_24h', 'Booking Reminder — 24h', 'تذكير بالحجز — 24 ساعة', 'booking', 'scheduled', '24 hours before visit', 'booking_reminder', true, 20, NULL),
  ('booking_cancelled', 'Booking Cancelled', 'إلغاء الحجز', 'booking', 'event', 'Sent immediately on cancellation', 'booking_cancellation', true, 30, NULL)
ON CONFLICT (slug) DO NOTHING;

-- ── VISIT category ────────────────────────────────────────────
INSERT INTO notification_config
  (slug, label, label_ar, category, trigger_type, timing_description, template_slug, is_active, sort_order, notes)
VALUES
  ('visit_technician_assigned', 'Technician Assigned', 'تعيين الفني', 'visit', 'event', 'Sent when technician is assigned', 'technician_assigned', true, 10, NULL),
  ('visit_technician_enroute', 'Technician En Route', 'الفني في الطريق', 'visit', 'event', 'Sent when technician departs', 'technician_enroute', true, 20, NULL),
  ('visit_completed', 'Visit Completed', 'اكتمال الزيارة', 'visit', 'event', 'Sent immediately on visit completion', 'visit_completed', true, 30, NULL)
ON CONFLICT (slug) DO NOTHING;

-- ── CONTRACT category ─────────────────────────────────────────
INSERT INTO notification_config
  (slug, label, label_ar, category, trigger_type, timing_description, template_slug, is_active, sort_order, notes)
VALUES
  ('contract_created', 'Contract Created', 'إنشاء العقد', 'contract', 'event', 'Sent immediately on contract creation', 'contract_created', true, 10, NULL),
  ('contract_expiry_30d', 'Contract Expiry — 30 Days', 'انتهاء العقد — 30 يوم', 'contract', 'scheduled', '30 days before expiry', 'contract_expiry_reminder', true, 20, NULL),
  ('contract_renewed', 'Contract Renewed', 'تجديد العقد', 'contract', 'event', 'Sent immediately on renewal', 'contract_renewed', true, 30, NULL)
ON CONFLICT (slug) DO NOTHING;

-- ── PAYMENT category ──────────────────────────────────────────
INSERT INTO notification_config
  (slug, label, label_ar, category, trigger_type, timing_description, template_slug, is_active, sort_order, notes)
VALUES
  ('payment_received', 'Payment Received', 'استلام الدفع', 'payment', 'event', 'Sent immediately on payment confirmation', 'payment_received', true, 10, NULL),
  ('invoice_sent', 'Invoice Sent', 'إرسال الفاتورة', 'payment', 'event', 'Sent when invoice is issued', 'invoice_sent', true, 20, NULL),
  ('payment_overdue', 'Payment Overdue', 'تأخر الدفع', 'payment', 'scheduled', 'Sent 3 days after due date', 'payment_overdue', false, 30, 'Disabled by default — enable when collection process is ready')
ON CONFLICT (slug) DO NOTHING;

-- ── SYSTEM category ───────────────────────────────────────────
INSERT INTO notification_config
  (slug, label, label_ar, category, trigger_type, timing_description, template_slug, is_active, sort_order, notes)
VALUES
  ('account_created', 'Account Created', 'إنشاء الحساب', 'system', 'event', 'Sent on new customer account creation', 'account_created', true, 10, NULL),
  ('otp_verification', 'OTP Verification', 'رمز التحقق', 'system', 'event', 'Sent during login / identity verification', 'otp_verification', true, 20, NULL)
ON CONFLICT (slug) DO NOTHING;

-- ── body_text seeds (update notification_templates) ──────────
UPDATE notification_templates SET body_text = 'Dear {{1}}, your booking #{{2}} has been confirmed for {{3}}. Our team will contact you shortly.' WHERE slug = 'booking_confirmation';
UPDATE notification_templates SET body_text = 'Reminder: Your appointment is scheduled for tomorrow, {{1}} at {{2}}. Reply HELP for assistance.' WHERE slug = 'booking_reminder';
UPDATE notification_templates SET body_text = 'Your booking #{{1}} has been cancelled. Contact us at {{2}} if this was a mistake.' WHERE slug = 'booking_cancellation';
UPDATE notification_templates SET body_text = 'Good news! Technician {{1}} has been assigned to your visit on {{2}}. Ref: {{3}}.' WHERE slug = 'technician_assigned';
UPDATE notification_templates SET body_text = 'Your technician {{1}} is on the way and will arrive in approximately {{2}} minutes.' WHERE slug = 'technician_enroute';
UPDATE notification_templates SET body_text = 'Your service visit is complete. Thank you for choosing us! Invoice: {{1}}.' WHERE slug = 'visit_completed';
UPDATE notification_templates SET body_text = 'Your contract #{{1}} has been created successfully. Valid from {{2}} to {{3}}.' WHERE slug = 'contract_created';
UPDATE notification_templates SET body_text = 'Your service contract #{{1}} expires in 30 days ({{2}}). Contact us to renew.' WHERE slug = 'contract_expiry_reminder';
UPDATE notification_templates SET body_text = 'Your contract #{{1}} has been renewed successfully until {{2}}.' WHERE slug = 'contract_renewed';
UPDATE notification_templates SET body_text = 'Payment of {{1}} received for invoice #{{2}}. Thank you!' WHERE slug = 'payment_received';
UPDATE notification_templates SET body_text = 'Invoice #{{1}} for {{2}} has been sent. Due date: {{3}}.' WHERE slug = 'invoice_sent';
UPDATE notification_templates SET body_text = 'Payment for invoice #{{1}} is overdue. Please settle {{2}} by {{3}} to avoid service interruption.' WHERE slug = 'payment_overdue';
UPDATE notification_templates SET body_text = 'Welcome to Alfaytri! Your account has been created. Username: {{1}}.' WHERE slug = 'account_created';
UPDATE notification_templates SET body_text = 'Your verification code is {{1}}. Valid for 10 minutes. Do not share this code.' WHERE slug = 'otp_verification';
```

- [ ] **Step 2: Apply to local Supabase**

```bash
npx supabase db push
```

Expected: `Applying migration 20260421000004_notification_config_seed.sql... done`

Verify rows inserted:
```sql
SELECT slug, category, label, is_active FROM notification_config ORDER BY category, sort_order;
```
Expected: 14 rows across 5 categories.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260421000004_notification_config_seed.sql
git commit -m "feat(db): seed notification_config rows and body_text values"
```

---

## Task 3: `useNotificationConfig.ts` Hook

**Files:**
- Create: `src/hooks/useNotificationConfig.ts`

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/useNotificationConfig.ts
'use client'

import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export type NotificationConfigRow = {
  id: string
  slug: string
  category: string
  label: string
  labelAr: string | null
  notes: string | null
  templateName: string
  templateSlug: string
  bodyText: string | null
  mediaType: string
  triggerType: string
  timingDescription: string | null
  isActive: boolean
}

export type UseNotificationConfigReturn = {
  grouped: Record<string, NotificationConfigRow[]>
  loading: boolean
  error: string | null
  toggleActive: (id: string, isActive: boolean) => Promise<boolean>
}

const QUERY_KEY = ['notification_config'] as const

export function useNotificationConfig(): UseNotificationConfigReturn {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('notification_config')
        .select(`
          id, slug, label, label_ar, notes, category,
          trigger_type, timing_description, is_active, sort_order,
          notification_templates!notification_config_template_slug_fkey (
            wati_template_name, slug, media_type, body_text
          )
        `)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as Array<{
        id: string
        slug: string
        label: string
        label_ar: string | null
        notes: string | null
        category: string
        trigger_type: string
        timing_description: string | null
        is_active: boolean
        sort_order: number
        notification_templates: {
          wati_template_name: string
          slug: string
          media_type: string
          body_text: string | null
        } | null
      }>
    },
    staleTime: 5 * 60 * 1000,
  })

  const grouped = useMemo(() => {
    if (!data) return {}
    const rows: NotificationConfigRow[] = data.map((row) => ({
      id: row.id,
      slug: row.slug,
      category: row.category,
      label: row.label,
      labelAr: row.label_ar,
      notes: row.notes,
      templateName: row.notification_templates?.wati_template_name ?? row.slug,
      templateSlug: row.notification_templates?.slug ?? row.slug,
      bodyText: row.notification_templates?.body_text ?? null,
      mediaType: row.notification_templates?.media_type ?? 'none',
      triggerType: row.trigger_type,
      timingDescription: row.timing_description,
      isActive: row.is_active,
    }))

    // Group by category, then sort groups by their minimum sort_order
    // with alphabetical tie-breaking on category name
    const acc: Record<string, NotificationConfigRow[]> = {}
    for (const row of rows) {
      if (!acc[row.category]) acc[row.category] = []
      acc[row.category].push(row)
    }

    const minSortOrder = (cat: string) =>
      Math.min(...(acc[cat]?.map((_, i) => {
        const found = data.find((r) => r.category === cat)
        return found?.sort_order ?? 0
      }) ?? [0]))

    return Object.fromEntries(
      Object.entries(acc).sort(([catA], [catB]) => {
        const diff = minSortOrder(catA) - minSortOrder(catB)
        return diff !== 0 ? diff : catA.localeCompare(catB)
      })
    )
  }, [data])

  const mutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('notification_config')
        .update({ is_active: isActive })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY })
      const snapshot = queryClient.getQueryData(QUERY_KEY)
      const slug = (snapshot as Array<{ id: string; slug: string }>)?.find(
        (r) => r.id === id
      )?.slug ?? id
      queryClient.setQueryData(QUERY_KEY, (old: typeof data) =>
        old?.map((r) => (r.id === id ? { ...r, is_active: isActive } : r))
      )
      return { snapshot, slug }
    },
    onSuccess: async (_data, { id, isActive }, context) => {
      try {
        const supabase = createClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('activity_log') as any).insert({
          action: 'services/notification-toggled',
          module: 'services',
          entity_type: 'notification_config',
          entity_id: id,
          details: JSON.stringify({ slug: context?.slug, is_active: isActive }),
        })
      } catch {
        // best-effort — log failure must not trigger onError or revert the optimistic update
      }
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(QUERY_KEY, context.snapshot)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })

  const toggleActive = async (id: string, isActive: boolean): Promise<boolean> => {
    try {
      await mutation.mutateAsync({ id, isActive })
      toast.success(isActive ? 'Notification enabled' : 'Notification disabled')
      return true
    } catch {
      toast.error('Error toggling notification')
      return false
    }
  }

  return {
    grouped,
    loading: isLoading,
    error: error ? (error as Error).message : null,
    toggleActive,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `useNotificationConfig.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useNotificationConfig.ts
git commit -m "feat(hook): add useNotificationConfig with optimistic toggle and activity log"
```

---

## Task 4: `TemplatePreviewDialog.tsx`

**Files:**
- Create: `src/components/services/TemplatePreviewDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/services/TemplatePreviewDialog.tsx
'use client'

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

export type PreviewItem = {
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

export function TemplatePreviewDialog({ open, onOpenChange, item }: TemplatePreviewDialogProps) {
  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">{item.label}</DialogTitle>
          {item.labelAr && (
            <p className="text-xs text-muted-foreground" dir="rtl">{item.labelAr}</p>
          )}
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5 mt-1">
          <Badge variant="outline" className="text-[10px] capitalize">{item.category}</Badge>
          <Badge variant="outline" className="text-[10px]">{item.triggerType}</Badge>
          {item.mediaType && item.mediaType !== 'none' && (
            <Badge variant="outline" className="text-[10px]">{item.mediaType}</Badge>
          )}
        </div>

        {item.timingDescription && (
          <p className="text-xs text-muted-foreground">{item.timingDescription}</p>
        )}

        <pre className="text-xs bg-muted rounded p-3 whitespace-pre-wrap font-mono leading-relaxed">
          {item.bodyText ?? 'No preview available'}
        </pre>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/TemplatePreviewDialog.tsx
git commit -m "feat(services): add TemplatePreviewDialog component"
```

---

## Task 5: `FixedNotificationsSection.tsx`

**Files:**
- Create: `src/components/services/FixedNotificationsSection.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/services/FixedNotificationsSection.tsx
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Eye } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useNotificationConfig, type NotificationConfigRow } from '@/hooks/useNotificationConfig'
import type { PreviewItem } from './TemplatePreviewDialog'

interface FixedNotificationsSectionProps {
  onPreview: (item: PreviewItem) => void
}

export function FixedNotificationsSection({ onPreview }: FixedNotificationsSectionProps) {
  const { grouped, loading, error, toggleActive } = useNotificationConfig()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading…</div>
  }
  if (error) {
    return <div className="p-4 text-sm text-destructive">Error loading notifications: {error}</div>
  }

  const toggleCollapsed = (cat: string) =>
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }))

  return (
    <div className="w-full">
      {/* Column header row */}
      <div className="flex items-center border-b border-border bg-muted/50 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        <div className="w-[320px] px-4 py-2">Notification</div>
        <div className="w-[180px] px-2 py-2">Template</div>
        <div className="w-[120px] px-2 py-2">Trigger</div>
        <div className="w-[180px] px-2 py-2">Timing</div>
        <div className="w-[80px] px-2 py-2 text-center">Active</div>
        <div className="w-[50px] px-2 py-2 text-center">View</div>
      </div>

      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          {/* Category group header */}
          <div
            className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => toggleCollapsed(category)}
          >
            {collapsed[category]
              ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            }
            <span className="text-sm font-semibold text-foreground capitalize">{category}</span>
            <span className="text-xs text-muted-foreground">({items.length})</span>
          </div>

          {/* Data rows */}
          {!collapsed[category] && items.map((item: NotificationConfigRow) => (
            <div
              key={item.id}
              className="flex items-center border-b border-border/50 hover:bg-muted/20 transition-colors min-h-[44px]"
            >
              {/* Notification */}
              <div className="w-[320px] px-4 py-2 pl-10">
                <div className="text-xs font-medium text-foreground">{item.label}</div>
                {item.labelAr && (
                  <div className="text-[10px] text-muted-foreground" dir="rtl">{item.labelAr}</div>
                )}
                {item.notes && (
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">{item.notes}</div>
                )}
              </div>

              {/* Template */}
              <div className="w-[180px] px-2 py-2">
                <div className="text-xs text-foreground truncate">{item.templateName}</div>
                {item.mediaType && item.mediaType !== 'none' && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 mt-0.5">
                    {item.mediaType}
                  </Badge>
                )}
              </div>

              {/* Trigger */}
              <div className="w-[120px] px-2 py-2">
                <Badge variant="outline" className="text-[9px] px-1.5 py-0.5">
                  {item.triggerType}
                </Badge>
              </div>

              {/* Timing */}
              <div className="w-[180px] px-2 py-2">
                <span className="text-xs text-muted-foreground">
                  {item.timingDescription ?? '—'}
                </span>
              </div>

              {/* Active */}
              <div className="w-[80px] px-2 py-2 flex justify-center">
                <Switch
                  checked={item.isActive}
                  onCheckedChange={(val) => toggleActive(item.id, val)}
                />
              </div>

              {/* View */}
              <div className="w-[50px] px-2 py-2 flex justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onPreview({
                    label: item.label,
                    labelAr: item.labelAr,
                    category: item.category,
                    triggerType: item.triggerType,
                    timingDescription: item.timingDescription,
                    bodyText: item.bodyText,
                    mediaType: item.mediaType,
                  })}
                >
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/FixedNotificationsSection.tsx
git commit -m "feat(services): add FixedNotificationsSection with collapsible category groups and active toggle"
```

---

## Task 6: `ServiceRemindersSection.tsx`

**Files:**
- Create: `src/components/services/ServiceRemindersSection.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/services/ServiceRemindersSection.tsx
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Eye } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  useReminderCategories, useReminders, useUpdateReminder,
  type Reminder, type ReminderCategory,
} from '@/hooks/useNotifications'
import type { PreviewItem } from './TemplatePreviewDialog'

interface ServiceRemindersSectionProps {
  onPreview: (item: PreviewItem) => void
}

export function ServiceRemindersSection({ onPreview }: ServiceRemindersSectionProps) {
  const { data: categories = [], isLoading: catLoading } = useReminderCategories()
  const { data: reminders = [], isLoading: remLoading } = useReminders()
  const updateReminder = useUpdateReminder()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  if (catLoading || remLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading…</div>
  }

  const byCategory = (catId: string) => reminders.filter((r: Reminder) => r.category_id === catId)

  const toggleCollapsed = (catId: string) =>
    setCollapsed((prev) => ({ ...prev, [catId]: !prev[catId] }))

  const handleToggle = async (reminder: Reminder, isActive: boolean) => {
    try {
      await updateReminder.mutateAsync({
        id: reminder.id,
        status: isActive ? 'active' : 'inactive',
      })
      toast.success(isActive ? 'Reminder enabled' : 'Reminder disabled')
    } catch {
      toast.error('Error toggling reminder')
    }
  }

  return (
    <div className="w-full">
      {/* Column header row */}
      <div className="flex items-center border-b border-border bg-muted/50 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        <div className="w-[320px] px-4 py-2">Notification</div>
        <div className="w-[180px] px-2 py-2">Template</div>
        <div className="w-[120px] px-2 py-2">Trigger</div>
        <div className="w-[180px] px-2 py-2">Timing</div>
        <div className="w-[80px] px-2 py-2 text-center">Active</div>
        <div className="w-[50px] px-2 py-2 text-center">View</div>
      </div>

      {categories.map((cat: ReminderCategory) => {
        const catReminders = byCategory(cat.id)
        return (
          <div key={cat.id}>
            {/* Category group header */}
            <div
              className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => toggleCollapsed(cat.id)}
            >
              {collapsed[cat.id]
                ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              }
              <span className="text-sm font-semibold text-foreground capitalize">{cat.name}</span>
              <span className="text-xs text-muted-foreground">({catReminders.length})</span>
            </div>

            {/* Data rows */}
            {!collapsed[cat.id] && catReminders.map((r: Reminder) => (
              <div
                key={r.id}
                className="flex items-center border-b border-border/50 hover:bg-muted/20 transition-colors min-h-[44px]"
              >
                {/* Notification */}
                <div className="w-[320px] px-4 py-2 pl-10">
                  <div className="text-xs font-medium text-foreground">{r.name}</div>
                  {r.name_ar && (
                    <div className="text-[10px] text-muted-foreground" dir="rtl">{r.name_ar}</div>
                  )}
                </div>

                {/* Template */}
                <div className="w-[180px] px-2 py-2">
                  <div className="text-xs text-foreground truncate">{r.template ?? '—'}</div>
                </div>

                {/* Trigger */}
                <div className="w-[120px] px-2 py-2">
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0.5">scheduled</Badge>
                </div>

                {/* Timing */}
                <div className="w-[180px] px-2 py-2">
                  <span className="text-xs text-muted-foreground">{r.timing ?? '—'}</span>
                </div>

                {/* Active */}
                <div className="w-[80px] px-2 py-2 flex justify-center">
                  <Switch
                    checked={r.status === 'active'}
                    onCheckedChange={(val) => handleToggle(r, val)}
                  />
                </div>

                {/* View */}
                <div className="w-[50px] px-2 py-2 flex justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onPreview({
                      label: r.name,
                      labelAr: r.name_ar,
                      category: cat.name,
                      triggerType: 'scheduled',
                      timingDescription: r.timing,
                      bodyText: r.template,
                      mediaType: undefined,
                    })}
                  >
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      })}

      {categories.length === 0 && (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          No reminder categories found
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/ServiceRemindersSection.tsx
git commit -m "feat(services): add ServiceRemindersSection read-only grid"
```

---

## Task 7: `NotificationsTableView.tsx`

**Files:**
- Create: `src/components/services/NotificationsTableView.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/services/NotificationsTableView.tsx
'use client'

import { useState } from 'react'
import { Bell, MessageSquare, Clock } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FixedNotificationsSection } from './FixedNotificationsSection'
import { ServiceRemindersSection } from './ServiceRemindersSection'
import { TemplatePreviewDialog, type PreviewItem } from './TemplatePreviewDialog'

interface NotificationsTableViewProps {
  enabled: boolean
}

export function NotificationsTableView({ enabled }: NotificationsTableViewProps) {
  const [previewItem, setPreviewItem] = useState<PreviewItem | null>(null)

  if (!enabled) return null

  return (
    <div className="w-full overflow-x-auto">
      {/* Notifications header strip */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
        </div>
      </div>

      {/* Sub-tab strip + content */}
      <Tabs defaultValue="fixed" className="flex flex-col">
        <div className="px-4 border-b border-border bg-card">
          <TabsList className="h-8 bg-transparent p-0 gap-0">
            <TabsTrigger
              value="fixed"
              className="text-xs rounded-none border-b-2 border-transparent px-4 py-1.5 gap-1.5 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Fixed Notifications
            </TabsTrigger>
            <TabsTrigger
              value="reminders"
              className="text-xs rounded-none border-b-2 border-transparent px-4 py-1.5 gap-1.5 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Clock className="h-3.5 w-3.5" />
              Service Reminders
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="fixed" className="m-0">
          <FixedNotificationsSection onPreview={setPreviewItem} />
        </TabsContent>

        <TabsContent value="reminders" className="m-0">
          <ServiceRemindersSection onPreview={setPreviewItem} />
        </TabsContent>
      </Tabs>

      <TemplatePreviewDialog
        open={!!previewItem}
        onOpenChange={(open) => { if (!open) setPreviewItem(null) }}
        item={previewItem}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/NotificationsTableView.tsx
git commit -m "feat(services): add NotificationsTableView entry point with header and sub-tabs"
```

---

## Task 8: Gut `NotificationsTab.tsx` to Shell

**Files:**
- Modify: `src/components/services/NotificationsTab.tsx`

- [ ] **Step 1: Replace file contents**

```tsx
// src/components/services/NotificationsTab.tsx
'use client'

import { NotificationsTableView } from './NotificationsTableView'

interface NotificationsTabProps {
  enabled: boolean
}

export function NotificationsTab({ enabled }: NotificationsTabProps) {
  return <NotificationsTableView enabled={enabled} />
}
```

- [ ] **Step 2: Verify TypeScript compiles and no import errors**

```bash
npx tsc --noEmit
```

Expected: no errors. `ReminderEditDialog`, `FixedNotificationsTab`, `ServiceRemindersTab` are now all deleted from this file — verify no other file imports those unexported names.

```bash
grep -r "FixedNotificationsTab\|ServiceRemindersTab" src/
```

Expected: no matches.

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/services/NotificationsTab.tsx
git commit -m "feat(services): wire NotificationsTableView — complete notifications tab redesign"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|-----------------|------|
| `body_text` column on `notification_templates` | Task 1 |
| `notification_config` seed rows (5 categories) | Task 2 |
| `useNotificationConfig` hook with grouped return | Task 3 |
| `useMemo` grouping with tie-breaker | Task 3 |
| Optimistic toggle with snapshot revert | Task 3 |
| Activity log try/catch, must not re-throw | Task 3 |
| `TemplatePreviewDialog` with `PreviewItem` union shape | Task 4 |
| Fixed-width column header row (6 cols, exact widths) | Task 5 |
| Collapsible category group headers — all start expanded | Task 5 |
| Data rows: label/labelAr/notes, template+badge, trigger badge, timing, Switch, Eye | Task 5 |
| Loading/error states in FixedNotificationsSection | Task 5 |
| Toast messages on toggle success/failure | Task 3 + Task 5 |
| ServiceRemindersSection — same grid, reminder data | Task 6 |
| `reminder.template → bodyText` mapping on preview | Task 6 |
| Switch in reminders maps to `status: 'active'/'inactive'` | Task 6 |
| `NotificationsTableView` with `overflow-x-auto` wrapper | Task 7 |
| Header strip (Bell + title) | Task 7 |
| Sub-tab strip (MessageSquare + Clock icons, border-primary active) | Task 7 |
| `previewItem` state wired to dialog | Task 7 |
| `NotificationsTab` gutted to shell | Task 8 |
| No layout.tsx changes | ✅ Not touched |

All requirements covered. ✅

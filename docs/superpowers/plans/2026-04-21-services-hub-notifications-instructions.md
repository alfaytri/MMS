# Services Hub — Notifications & Instructions Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Notifications tab (Fixed Notifications + Service Reminders sub-tabs) and Instructions tab (Materials + Service Links sub-tabs) in the Services Hub at `/master-data/services`.

**Architecture:** Two new tab components (`NotificationsTab`, `InstructionsTab`) each with two inner sub-tabs. Hooks live in `useNotifications.ts` (new) and extend `useServices.ts` (instruction mutations + junction hooks). Dialogs are standalone components. `page.tsx` wires the new tabs into the existing 7-tab shell.

**Tech Stack:** Next.js 15 App Router · TypeScript · Supabase (browser `createClient()`) · TanStack Query v5 · shadcn/ui · Tailwind CSS · Zod · react-hook-form · Lucide icons · Sonner toasts

---

## ⚠️ Critical DB Facts

| Table | Key columns |
|---|---|
| `notification_templates` | `id`, `slug`, `wati_template_name`, `description`, `media_type`, `param_count`, `is_active` |
| `reminder_categories` | `id`, `name`, `icon`, `sort_order` |
| `reminders` | `id`, `category_id`, `name`, `name_ar`, `description`, `template`, `channel` (enum: `'Email'\|'SMS'\|'WhatsApp'`), `timing`, `status` (enum: `'active'\|'inactive'`) |
| `instructions` | `id`, `name_en`, `name_ar`, `type` (enum: `'pre-service'\|'post-service'`), `content_type` (enum: `'text'\|'pdf'\|'image'\|'video'`), `content_preview`, `full_content`, `file_url`, `video_url`, `status`, `deleted_at` |
| `service_instructions` | `service_id`, `instruction_id`, `created_at` — composite PK |

Enums used in casts:
- `reminder_channel`: `'Email' | 'SMS' | 'WhatsApp'`
- `instruction_type`: `'pre-service' | 'post-service'`
- `instruction_content_type`: `'text' | 'pdf' | 'image' | 'video'`
- `service_status`: `'active' | 'inactive'`

---

## File Map

```
src/hooks/
  useNotifications.ts           NEW — useNotificationTemplates, useReminderCategories,
                                       useReminders, useCreateReminder, useUpdateReminder
  useServices.ts                EDIT — add useInstructionsFull, useCreateInstruction,
                                       useUpdateInstruction, useArchiveInstruction,
                                       useServiceInstructions, useLinkInstruction,
                                       useUnlinkInstruction

src/components/services/
  ReminderEditDialog.tsx         NEW — create/edit a reminder (name, category, channel, timing, status)
  NotificationsTab.tsx           NEW — Fixed Notifications sub-tab + Service Reminders sub-tab
  InstructionEditDialog.tsx      NEW — create/edit instruction (bilingual, content type, file/video URL)
  InstructionsTab.tsx            NEW — Materials sub-tab + Service Links sub-tab

src/app/(dashboard)/master-data/services/
  page.tsx                      EDIT — replace "Coming in next plan" placeholders for
                                        'reminders' and 'instructions' tab keys
```

---

## Task 1: useNotifications.ts

**Files:**
- Create: `src/hooks/useNotifications.ts`

- [ ] **Step 1: Create the file**

```ts
// src/hooks/useNotifications.ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database.types'

type NotificationTemplate = Database['public']['Tables']['notification_templates']['Row']
type ReminderCategory = Database['public']['Tables']['reminder_categories']['Row']
type Reminder = Database['public']['Tables']['reminders']['Row']
type ReminderInsert = Omit<Database['public']['Tables']['reminders']['Insert'], 'id' | 'created_at' | 'updated_at'>
type ReminderUpdate = Partial<ReminderInsert>

export type { NotificationTemplate, ReminderCategory, Reminder }

export function useNotificationTemplates() {
  return useQuery({
    queryKey: ['notification_templates'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('notification_templates')
        .select('*')
        .order('slug')
      if (error) throw error
      return (data ?? []) as NotificationTemplate[]
    },
    staleTime: 5 * 60_000,
  })
}

export function useReminderCategories() {
  return useQuery({
    queryKey: ['reminder_categories'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('reminder_categories')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as ReminderCategory[]
    },
    staleTime: 5 * 60_000,
  })
}

export function useReminders() {
  return useQuery({
    queryKey: ['reminders'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .order('category_id')
        .order('created_at')
      if (error) throw error
      return (data ?? []) as Reminder[]
    },
    staleTime: 5 * 60_000,
  })
}

export function useCreateReminder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: ReminderInsert) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('reminders') as any)
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reminders'] }),
  })
}

export function useUpdateReminder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: ReminderUpdate & { id: string }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('reminders') as any)
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reminders'] }),
  })
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors. If `notification_templates`, `reminder_categories`, or `reminders` are not in the generated types, replace the `Database['public']['Tables']['X']['Row']` references with `Record<string, unknown>` and add explicit field typings via an interface instead.

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add src/hooks/useNotifications.ts
git commit -m "feat(services): add useNotifications — templates, categories, reminders hooks"
```

---

## Task 2: Extend useServices.ts — Instruction + Junction Hooks

**Files:**
- Modify: `src/hooks/useServices.ts`

- [ ] **Step 1: Add InstructionFull type and useInstructionsFull hook**

In `src/hooks/useServices.ts`, after the existing `export type Instruction = ...` line, add:

```ts
export type InstructionFull = Database['public']['Tables']['instructions']['Row']
```

Then append `useInstructionsFull` after the existing `useInstructions` function:

```ts
export function useInstructionsFull(enabled = true) {
  return useQuery({
    queryKey: ['instructions', 'full'],
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('instructions')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as InstructionFull[]
    },
    staleTime: 5 * 60_000,
  })
}
```

- [ ] **Step 2: Add useCreateInstruction and useUpdateInstruction**

Append to `src/hooks/useServices.ts`:

```ts
export function useCreateInstruction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<Database['public']['Tables']['instructions']['Insert'], 'id' | 'created_at' | 'updated_at'>) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('instructions')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructions'] })
    },
  })
}

export function useUpdateInstruction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<Database['public']['Tables']['instructions']['Update']> & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('instructions')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructions'] })
    },
  })
}

export function useArchiveInstruction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('instructions')
        .update({ deleted_at: new Date().toISOString(), status: 'inactive' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructions'] })
    },
  })
}
```

- [ ] **Step 3: Add service_instructions junction hooks**

Append to `src/hooks/useServices.ts`:

```ts
export type ServiceInstructionLink = {
  service_id: string
  instruction_id: string
  created_at: string
  instructions: { id: string; name_en: string; type: string; content_type: string | null } | null
  services: { id: string; name_en: string; tree_type: string | null } | null
}

export function useServiceInstructions(serviceId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['service_instructions', serviceId],
    enabled: enabled && !!serviceId,
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('service_instructions') as any)
        .select('service_id, instruction_id, created_at, instructions(id, name_en, type, content_type)')
        .eq('service_id', serviceId)
      if (error) throw error
      return (data ?? []) as ServiceInstructionLink[]
    },
    staleTime: 2 * 60_000,
  })
}

export function useAllServiceInstructionLinks(enabled = true) {
  return useQuery({
    queryKey: ['service_instructions', 'all'],
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('service_instructions') as any)
        .select(`
          service_id,
          instruction_id,
          created_at,
          instructions(id, name_en, type, content_type),
          services(id, name_en, tree_type)
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ServiceInstructionLink[]
    },
    staleTime: 2 * 60_000,
  })
}

export function useLinkInstruction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ serviceId, instructionId }: { serviceId: string; instructionId: string }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('service_instructions') as any)
        .insert({ service_id: serviceId, instruction_id: instructionId })
      if (error && error.code !== '23505') throw error // 23505 = duplicate key, ignore
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service_instructions'] })
    },
  })
}

export function useUnlinkInstruction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ serviceId, instructionId }: { serviceId: string; instructionId: string }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('service_instructions') as any)
        .delete()
        .eq('service_id', serviceId)
        .eq('instruction_id', instructionId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service_instructions'] })
    },
  })
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd D:/MMS && git add src/hooks/useServices.ts
git commit -m "feat(services): add instruction CRUD hooks and service_instructions junction hooks"
```

---

## Task 3: ReminderEditDialog

**Files:**
- Create: `src/components/services/ReminderEditDialog.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/services/ReminderEditDialog.tsx
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useCreateReminder, useUpdateReminder, useReminderCategories,
  type Reminder, type ReminderCategory,
} from '@/hooks/useNotifications'

const reminderSchema = z.object({
  category_id: z.string().min(1, 'Category is required'),
  name: z.string().min(1, 'Name (EN) is required'),
  name_ar: z.string().nullable(),
  description: z.string().nullable(),
  template: z.string().nullable(),
  channel: z.enum(['Email', 'SMS', 'WhatsApp']),
  timing: z.string().nullable(),
  status: z.enum(['active', 'inactive']),
})

type ReminderFormValues = z.infer<typeof reminderSchema>

function toDefaults(reminder: Reminder | null): ReminderFormValues {
  return {
    category_id: reminder?.category_id ?? '',
    name: reminder?.name ?? '',
    name_ar: reminder?.name_ar ?? null,
    description: reminder?.description ?? null,
    template: reminder?.template ?? null,
    channel: (reminder?.channel as ReminderFormValues['channel']) ?? 'Email',
    timing: reminder?.timing ?? null,
    status: (reminder?.status as ReminderFormValues['status']) ?? 'active',
  }
}

interface ReminderEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'new' | 'edit'
  reminder: Reminder | null
  defaultCategoryId?: string
}

export function ReminderEditDialog({
  open,
  onOpenChange,
  mode,
  reminder,
  defaultCategoryId,
}: ReminderEditDialogProps) {
  const { data: categories = [] } = useReminderCategories()
  const createReminder = useCreateReminder()
  const updateReminder = useUpdateReminder()

  const form = useForm<ReminderFormValues>({
    resolver: zodResolver(reminderSchema),
    defaultValues: toDefaults(reminder),
  })

  useEffect(() => {
    if (open) {
      const defaults = toDefaults(reminder)
      if (defaultCategoryId && !reminder) defaults.category_id = defaultCategoryId
      form.reset(defaults)
    }
  }, [open, reminder, defaultCategoryId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(values: ReminderFormValues) {
    try {
      if (mode === 'new') {
        await createReminder.mutateAsync(values)
      } else if (reminder) {
        await updateReminder.mutateAsync({ id: reminder.id, ...values })
      }
      toast.success('Reminder saved')
      onOpenChange(false)
    } catch {
      toast.error('Failed to save reminder')
    }
  }

  const isSaving = createReminder.isPending || updateReminder.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'new' ? 'New Reminder' : 'Edit Reminder'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="category_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Category <span className="text-destructive">*</span></FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {categories.map((c: ReminderCategory) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (EN) <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="name_ar" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (AR)</FormLabel>
                  <FormControl><Input dir="rtl" {...field} value={field.value ?? ''} /></FormControl>
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="channel" render={({ field }) => (
                <FormItem>
                  <FormLabel>Channel</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Email">Email</SelectItem>
                      <SelectItem value="SMS">SMS</SelectItem>
                      <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="timing" render={({ field }) => (
              <FormItem>
                <FormLabel>Timing</FormLabel>
                <FormControl><Input placeholder="e.g. 30 days before, immediate" {...field} value={field.value ?? ''} /></FormControl>
              </FormItem>
            )} />

            <FormField control={form.control} name="template" render={({ field }) => (
              <FormItem>
                <FormLabel>Template Text</FormLabel>
                <FormControl><Textarea rows={3} placeholder="Message template…" {...field} value={field.value ?? ''} /></FormControl>
              </FormItem>
            )} />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add src/components/services/ReminderEditDialog.tsx
git commit -m "feat(services): add ReminderEditDialog — bilingual, channel, timing, category"
```

---

## Task 4: NotificationsTab

**Files:**
- Create: `src/components/services/NotificationsTab.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/services/NotificationsTab.tsx
'use client'

import { useState } from 'react'
import { Plus, Pencil, Mail, MessageSquare, Smartphone, CheckCircle2, XCircle } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  useNotificationTemplates, useReminderCategories, useReminders,
  type Reminder, type ReminderCategory,
} from '@/hooks/useNotifications'
import { ReminderEditDialog } from './ReminderEditDialog'

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  Email: <Mail className="h-3 w-3" />,
  SMS: <MessageSquare className="h-3 w-3" />,
  WhatsApp: <Smartphone className="h-3 w-3" />,
}

const CHANNEL_COLOR: Record<string, string> = {
  Email: 'bg-blue-100 text-blue-700',
  SMS: 'bg-yellow-100 text-yellow-700',
  WhatsApp: 'bg-green-100 text-green-700',
}

interface NotificationsTabProps {
  enabled: boolean
}

export function NotificationsTab({ enabled }: NotificationsTabProps) {
  const [reminderDialog, setReminderDialog] = useState<{
    open: boolean; mode: 'new' | 'edit'; reminder: Reminder | null; categoryId?: string
  }>({ open: false, mode: 'new', reminder: null })

  return (
    <>
      <Tabs defaultValue="fixed" className="flex flex-col h-full">
        <div className="px-4 pt-2 border-b border-border">
          <TabsList className="h-8 bg-transparent p-0 gap-4">
            <TabsTrigger value="fixed" className="text-xs px-0 py-1.5 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none">
              Fixed Notifications
            </TabsTrigger>
            <TabsTrigger value="reminders" className="text-xs px-0 py-1.5 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none">
              Service Reminders
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="fixed" className="flex-1 overflow-auto m-0">
          <FixedNotificationsTab enabled={enabled} />
        </TabsContent>

        <TabsContent value="reminders" className="flex-1 overflow-auto m-0">
          <ServiceRemindersTab
            enabled={enabled}
            onNew={(categoryId) => setReminderDialog({ open: true, mode: 'new', reminder: null, categoryId })}
            onEdit={(r) => setReminderDialog({ open: true, mode: 'edit', reminder: r })}
          />
        </TabsContent>
      </Tabs>

      <ReminderEditDialog
        open={reminderDialog.open}
        onOpenChange={(open) => setReminderDialog((s) => ({ ...s, open }))}
        mode={reminderDialog.mode}
        reminder={reminderDialog.reminder}
        defaultCategoryId={reminderDialog.categoryId}
      />
    </>
  )
}

function FixedNotificationsTab({ enabled }: { enabled: boolean }) {
  const { data: templates = [], isLoading } = useNotificationTemplates()

  if (!enabled || isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-4">
      <p className="text-xs text-muted-foreground mb-3">
        WATI WhatsApp notification templates configured in the system. Read-only — managed via Supabase admin.
      </p>
      <div className="rounded border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-[11px] h-8">Slug</TableHead>
              <TableHead className="text-[11px] h-8">WATI Template Name</TableHead>
              <TableHead className="text-[11px] h-8">Description</TableHead>
              <TableHead className="text-[11px] h-8">Media</TableHead>
              <TableHead className="text-[11px] h-8">Params</TableHead>
              <TableHead className="text-[11px] h-8">Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                  No notification templates found
                </TableCell>
              </TableRow>
            )}
            {templates.map((t) => (
              <TableRow key={t.id} className="text-xs">
                <TableCell className="font-mono text-[11px]">{t.slug}</TableCell>
                <TableCell>{t.wati_template_name}</TableCell>
                <TableCell className="text-muted-foreground max-w-[200px] truncate">{t.description ?? '—'}</TableCell>
                <TableCell>{t.media_type !== 'none' ? t.media_type : '—'}</TableCell>
                <TableCell>{t.param_count}</TableCell>
                <TableCell>
                  {t.is_active
                    ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                    : <XCircle className="h-4 w-4 text-muted-foreground" />
                  }
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

interface ServiceRemindersTabProps {
  enabled: boolean
  onNew: (categoryId: string) => void
  onEdit: (r: Reminder) => void
}

function ServiceRemindersTab({ enabled, onNew, onEdit }: ServiceRemindersTabProps) {
  const { data: categories = [], isLoading: catLoading } = useReminderCategories()
  const { data: reminders = [], isLoading: remLoading } = useReminders()

  if (!enabled || catLoading || remLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const byCategory = (catId: string) => reminders.filter((r) => r.category_id === catId)

  return (
    <div className="p-4 space-y-4">
      {categories.map((cat: ReminderCategory) => {
        const catReminders = byCategory(cat.id)
        return (
          <div key={cat.id} className="rounded border border-border overflow-hidden">
            {/* Category header */}
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
              <div className="flex items-center gap-2">
                {cat.icon && <span className="text-sm">{cat.icon}</span>}
                <span className="text-sm font-semibold">{cat.name}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {catReminders.length}
                </Badge>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] gap-1"
                onClick={() => onNew(cat.id)}
              >
                <Plus className="h-3 w-3" />Add
              </Button>
            </div>

            {/* Reminders in this category */}
            {catReminders.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                No reminders in this category
              </div>
            ) : (
              <Table>
                <TableBody>
                  {catReminders.map((r: Reminder) => (
                    <TableRow key={r.id} className="text-xs">
                      <TableCell className="w-[220px] font-medium">
                        <div>{r.name}</div>
                        {r.name_ar && <div className="text-[10px] text-muted-foreground" dir="rtl">{r.name_ar}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-[10px] px-1.5 py-0 gap-1 border-0 ${CHANNEL_COLOR[r.channel ?? 'Email'] ?? ''}`}
                        >
                          {CHANNEL_ICON[r.channel ?? 'Email']}
                          {r.channel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.timing ?? '—'}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={r.status === 'active' ? 'border-green-500 text-green-600 text-[10px]' : 'text-[10px] text-muted-foreground'}
                        >
                          {r.status ?? 'active'}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-8">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => onEdit(r)}
                          aria-label="Edit reminder"
                        >
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
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

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add src/components/services/NotificationsTab.tsx
git commit -m "feat(services): add NotificationsTab — Fixed Notifications table + Service Reminders by category"
```

---

## Task 5: InstructionEditDialog

**Files:**
- Create: `src/components/services/InstructionEditDialog.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/services/InstructionEditDialog.tsx
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCreateInstruction, useUpdateInstruction, type InstructionFull } from '@/hooks/useServices'

const instructionSchema = z.object({
  name_en: z.string().min(1, 'Name (EN) is required'),
  name_ar: z.string().nullable(),
  type: z.enum(['pre-service', 'post-service']),
  content_type: z.enum(['text', 'pdf', 'image', 'video']),
  content_preview: z.string().nullable(),
  full_content: z.string().nullable(),
  file_url: z.string().url('Must be a valid URL').nullable().or(z.literal('')),
  video_url: z.string().url('Must be a valid URL').nullable().or(z.literal('')),
  status: z.enum(['active', 'inactive']),
})

type InstructionFormValues = z.infer<typeof instructionSchema>

function toDefaults(instruction: InstructionFull | null): InstructionFormValues {
  return {
    name_en: instruction?.name_en ?? '',
    name_ar: instruction?.name_ar ?? null,
    type: (instruction?.type as InstructionFormValues['type']) ?? 'pre-service',
    content_type: (instruction?.content_type as InstructionFormValues['content_type']) ?? 'text',
    content_preview: instruction?.content_preview ?? null,
    full_content: instruction?.full_content ?? null,
    file_url: instruction?.file_url ?? null,
    video_url: instruction?.video_url ?? null,
    status: (instruction?.status as InstructionFormValues['status']) ?? 'active',
  }
}

interface InstructionEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'new' | 'edit'
  instruction: InstructionFull | null
}

export function InstructionEditDialog({
  open,
  onOpenChange,
  mode,
  instruction,
}: InstructionEditDialogProps) {
  const createInstruction = useCreateInstruction()
  const updateInstruction = useUpdateInstruction()

  const form = useForm<InstructionFormValues>({
    resolver: zodResolver(instructionSchema),
    defaultValues: toDefaults(instruction),
  })

  useEffect(() => {
    if (open) form.reset(toDefaults(instruction))
  }, [open, instruction]) // eslint-disable-line react-hooks/exhaustive-deps

  const contentType = form.watch('content_type')

  async function onSubmit(values: InstructionFormValues) {
    try {
      const payload = {
        name_en: values.name_en,
        name_ar: values.name_ar || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: values.type as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content_type: values.content_type as any,
        content_preview: values.content_preview || null,
        full_content: contentType === 'text' ? values.full_content || null : null,
        file_url: (contentType === 'pdf' || contentType === 'image') ? values.file_url || null : null,
        video_url: contentType === 'video' ? values.video_url || null : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: values.status as any,
      }
      if (mode === 'new') {
        await createInstruction.mutateAsync(payload)
      } else if (instruction) {
        await updateInstruction.mutateAsync({ id: instruction.id, ...payload })
      }
      toast.success('Instruction saved')
      onOpenChange(false)
    } catch {
      toast.error('Failed to save instruction')
    }
  }

  const isSaving = createInstruction.isPending || updateInstruction.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'new' ? 'New Instruction' : 'Edit Instruction'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="name_en" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (EN) <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="name_ar" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (AR)</FormLabel>
                  <FormControl><Input dir="rtl" {...field} value={field.value ?? ''} /></FormControl>
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="pre-service">Pre-service</SelectItem>
                      <SelectItem value="post-service">Post-service</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="content_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Content Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="image">Image</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="content_preview" render={({ field }) => (
              <FormItem>
                <FormLabel>Content Preview (short summary)</FormLabel>
                <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
              </FormItem>
            )} />

            {contentType === 'text' && (
              <FormField control={form.control} name="full_content" render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Text Content</FormLabel>
                  <FormControl><Textarea rows={4} {...field} value={field.value ?? ''} /></FormControl>
                </FormItem>
              )} />
            )}

            {(contentType === 'pdf' || contentType === 'image') && (
              <FormField control={form.control} name="file_url" render={({ field }) => (
                <FormItem>
                  <FormLabel>File URL ({contentType === 'pdf' ? 'PDF' : 'Image'})</FormLabel>
                  <FormControl><Input type="url" placeholder="https://…" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {contentType === 'video' && (
              <FormField control={form.control} name="video_url" render={({ field }) => (
                <FormItem>
                  <FormLabel>Video URL</FormLabel>
                  <FormControl><Input type="url" placeholder="https://…" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add src/components/services/InstructionEditDialog.tsx
git commit -m "feat(services): add InstructionEditDialog — bilingual, content type switch, URL fields"
```

---

## Task 6: InstructionsTab

**Files:**
- Create: `src/components/services/InstructionsTab.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/services/InstructionsTab.tsx
'use client'

import { useState } from 'react'
import { Plus, Pencil, Archive, Link2, Unlink, FileText, Image, Video, AlignLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  useInstructionsFull, useArchiveInstruction, useAllServiceInstructionLinks,
  useLinkInstruction, useUnlinkInstruction,
  type InstructionFull, type ServiceInstructionLink,
} from '@/hooks/useServices'
import { InstructionEditDialog } from './InstructionEditDialog'

const CONTENT_ICON: Record<string, React.ReactNode> = {
  text: <AlignLeft className="h-3 w-3" />,
  pdf: <FileText className="h-3 w-3" />,
  image: <Image className="h-3 w-3" />,
  video: <Video className="h-3 w-3" />,
}

const CONTENT_COLOR: Record<string, string> = {
  text: 'bg-slate-100 text-slate-600',
  pdf: 'bg-red-100 text-red-600',
  image: 'bg-purple-100 text-purple-600',
  video: 'bg-orange-100 text-orange-600',
}

const TYPE_COLOR: Record<string, string> = {
  'pre-service': 'bg-blue-100 text-blue-700',
  'post-service': 'bg-green-100 text-green-700',
}

interface InstructionsTabProps {
  enabled: boolean
}

export function InstructionsTab({ enabled }: InstructionsTabProps) {
  const [editDialog, setEditDialog] = useState<{
    open: boolean; mode: 'new' | 'edit'; instruction: InstructionFull | null
  }>({ open: false, mode: 'new', instruction: null })

  return (
    <>
      <Tabs defaultValue="materials" className="flex flex-col h-full">
        <div className="px-4 pt-2 border-b border-border">
          <TabsList className="h-8 bg-transparent p-0 gap-4">
            <TabsTrigger value="materials" className="text-xs px-0 py-1.5 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none">
              Materials
            </TabsTrigger>
            <TabsTrigger value="links" className="text-xs px-0 py-1.5 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none">
              Service Links
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="materials" className="flex-1 overflow-auto m-0">
          <MaterialsSubTab
            enabled={enabled}
            onNew={() => setEditDialog({ open: true, mode: 'new', instruction: null })}
            onEdit={(i) => setEditDialog({ open: true, mode: 'edit', instruction: i })}
          />
        </TabsContent>

        <TabsContent value="links" className="flex-1 overflow-auto m-0">
          <ServiceLinksSubTab enabled={enabled} />
        </TabsContent>
      </Tabs>

      <InstructionEditDialog
        open={editDialog.open}
        onOpenChange={(open) => setEditDialog((s) => ({ ...s, open }))}
        mode={editDialog.mode}
        instruction={editDialog.instruction}
      />
    </>
  )
}

interface MaterialsSubTabProps {
  enabled: boolean
  onNew: () => void
  onEdit: (i: InstructionFull) => void
}

function MaterialsSubTab({ enabled, onNew, onEdit }: MaterialsSubTabProps) {
  const { data: instructions = [], isLoading } = useInstructionsFull(enabled)
  const archiveInstruction = useArchiveInstruction()
  const [archiveTarget, setArchiveTarget] = useState<InstructionFull | null>(null)
  const [search, setSearch] = useState('')

  const filtered = instructions.filter((i) =>
    i.name_en.toLowerCase().includes(search.toLowerCase()) ||
    (i.name_ar ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Input
          placeholder="Search instructions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs w-64"
        />
        <Button size="sm" className="h-7 text-[11px] gap-1 ml-auto" onClick={onNew}>
          <Plus className="h-3.5 w-3.5" />New Instruction
        </Button>
      </div>

      <div className="p-4">
        <div className="rounded border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-[11px] h-8">Name</TableHead>
                <TableHead className="text-[11px] h-8">Type</TableHead>
                <TableHead className="text-[11px] h-8">Content</TableHead>
                <TableHead className="text-[11px] h-8">Status</TableHead>
                <TableHead className="text-[11px] h-8 w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                    {search ? 'No instructions match your search' : 'No instructions yet'}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((instruction) => (
                <TableRow key={instruction.id} className="text-xs">
                  <TableCell>
                    <div className="font-medium">{instruction.name_en}</div>
                    {instruction.name_ar && (
                      <div className="text-[10px] text-muted-foreground" dir="rtl">{instruction.name_ar}</div>
                    )}
                    {instruction.content_preview && (
                      <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                        {instruction.content_preview}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`text-[10px] px-1.5 py-0 border-0 ${TYPE_COLOR[instruction.type] ?? ''}`}
                    >
                      {instruction.type === 'pre-service' ? 'Pre' : 'Post'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`text-[10px] px-1.5 py-0 gap-1 border-0 ${CONTENT_COLOR[instruction.content_type ?? 'text'] ?? ''}`}
                    >
                      {CONTENT_ICON[instruction.content_type ?? 'text']}
                      {instruction.content_type ?? 'text'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={instruction.status === 'active'
                        ? 'border-green-500 text-green-600 text-[10px]'
                        : 'text-[10px] text-muted-foreground'}
                    >
                      {instruction.status ?? 'active'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => onEdit(instruction)}
                        aria-label="Edit instruction"
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => setArchiveTarget(instruction)}
                        aria-label="Archive instruction"
                      >
                        <Archive className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Instruction</AlertDialogTitle>
            <AlertDialogDescription>
              Archive &ldquo;{archiveTarget?.name_en}&rdquo;? It will be deactivated and hidden from active lists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!archiveTarget) return
                archiveInstruction.mutate(archiveTarget.id, {
                  onSuccess: () => toast.success('Instruction archived'),
                  onError: () => toast.error('Failed to archive'),
                })
                setArchiveTarget(null)
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ServiceLinksSubTab({ enabled }: { enabled: boolean }) {
  const { data: links = [], isLoading } = useAllServiceInstructionLinks(enabled)
  const unlinkInstruction = useUnlinkInstruction()
  const { data: instructions = [] } = useInstructionsFull(enabled)
  const [search, setSearch] = useState('')
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [newServiceId, setNewServiceId] = useState('')
  const [newInstructionId, setNewInstructionId] = useState('')
  const linkInstruction = useLinkInstruction()

  const filtered = links.filter((l) => {
    const instrName = (l.instructions as { name_en?: string } | null)?.name_en?.toLowerCase() ?? ''
    const svcName = (l.services as { name_en?: string } | null)?.name_en?.toLowerCase() ?? ''
    const q = search.toLowerCase()
    return instrName.includes(q) || svcName.includes(q)
  })

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Input
          placeholder="Search by instruction or service name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs w-72"
        />
        <Button size="sm" className="h-7 text-[11px] gap-1 ml-auto" onClick={() => setLinkDialogOpen(true)}>
          <Link2 className="h-3.5 w-3.5" />New Link
        </Button>
      </div>

      <div className="p-4">
        <div className="rounded border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-[11px] h-8">Instruction</TableHead>
                <TableHead className="text-[11px] h-8">Type</TableHead>
                <TableHead className="text-[11px] h-8">Service</TableHead>
                <TableHead className="text-[11px] h-8">Tree</TableHead>
                <TableHead className="text-[11px] h-8 w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                    {search ? 'No links match your search' : 'No service-instruction links yet'}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((link: ServiceInstructionLink) => {
                const instr = link.instructions as { id?: string; name_en?: string; type?: string; content_type?: string } | null
                const svc = link.services as { id?: string; name_en?: string; tree_type?: string } | null
                return (
                  <TableRow key={`${link.service_id}-${link.instruction_id}`} className="text-xs">
                    <TableCell className="font-medium">{instr?.name_en ?? '—'}</TableCell>
                    <TableCell>
                      {instr?.type && (
                        <Badge className={`text-[10px] px-1.5 py-0 border-0 ${TYPE_COLOR[instr.type] ?? ''}`}>
                          {instr.type === 'pre-service' ? 'Pre' : 'Post'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{svc?.name_en ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">{svc?.tree_type ?? '—'}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6"
                        aria-label="Remove link"
                        onClick={() =>
                          unlinkInstruction.mutate(
                            { serviceId: link.service_id, instructionId: link.instruction_id },
                            {
                              onSuccess: () => toast.success('Link removed'),
                              onError: () => toast.error('Failed to remove link'),
                            },
                          )
                        }
                      >
                        <Unlink className="h-3 w-3 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Quick link dialog — paste service ID + pick instruction */}
      <AlertDialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Link Instruction to Service</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the Service ID and select an instruction to link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 my-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Service ID (UUID)</label>
              <Input
                className="h-8 text-xs font-mono"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={newServiceId}
                onChange={(e) => setNewServiceId(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Instruction</label>
              <select
                className="w-full h-8 rounded border border-input bg-background text-xs px-2"
                value={newInstructionId}
                onChange={(e) => setNewInstructionId(e.target.value)}
              >
                <option value="">Select instruction…</option>
                {instructions.map((i) => (
                  <option key={i.id} value={i.id}>{i.name_en} ({i.type})</option>
                ))}
              </select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setNewServiceId(''); setNewInstructionId('') }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!newServiceId || !newInstructionId) return
                linkInstruction.mutate(
                  { serviceId: newServiceId, instructionId: newInstructionId },
                  {
                    onSuccess: () => { toast.success('Link created'); setLinkDialogOpen(false); setNewServiceId(''); setNewInstructionId('') },
                    onError: () => toast.error('Failed to create link'),
                  },
                )
              }}
            >
              Link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add src/components/services/InstructionsTab.tsx
git commit -m "feat(services): add InstructionsTab — Materials CRUD + Service Links junction manager"
```

---

## Task 7: Wire page.tsx

**Files:**
- Modify: `src/app/(dashboard)/master-data/services/page.tsx`

The current page shows `"Coming in next plan"` for `reminders`, `instructions`, `inventory`, and `promotions` tabs. Wire the two new tabs.

- [ ] **Step 1: Add imports at the top of page.tsx**

After the existing `ServiceEditDialog` import, add:

```tsx
import { NotificationsTab } from '@/components/services/NotificationsTab'
import { InstructionsTab } from '@/components/services/InstructionsTab'
```

- [ ] **Step 2: Replace the "Coming in next plan" placeholder block**

Find this block in `page.tsx`:

```tsx
        {(activeTab === 'reminders' || activeTab === 'instructions' || activeTab === 'inventory' || activeTab === 'promotions') && (
          <div className="p-8 text-sm text-muted-foreground text-center">
            Coming in next plan
          </div>
        )}
```

Replace it with:

```tsx
        {activeTab === 'reminders' && (
          <NotificationsTab enabled={visitedTabs.has('reminders')} />
        )}
        {activeTab === 'instructions' && (
          <InstructionsTab enabled={visitedTabs.has('instructions')} />
        )}
        {(activeTab === 'inventory' || activeTab === 'promotions') && (
          <div className="p-8 text-sm text-muted-foreground text-center">
            Coming in next plan
          </div>
        )}
```

- [ ] **Step 3: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd D:/MMS && git add src/app/(dashboard)/master-data/services/page.tsx
git commit -m "feat(services): wire NotificationsTab and InstructionsTab into ServicesPage"
```

---

## Task 8: Integration Test + PROGRESS.md

- [ ] **Step 1: Full TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 2: Run tests**

```bash
cd D:/MMS && npm test -- --passWithNoTests 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 3: Build**

```bash
cd D:/MMS && npm run build 2>&1 | grep "master-data"
```

Expected: build succeeds. Confirm `/master-data/services` appears.

- [ ] **Step 4: Update PROGRESS.md**

In `PROGRESS.md`, update `## 🔄 In Progress` to:

```
Next: Services Hub — Inventory & Promotions tabs (plan: `docs/superpowers/plans/2026-04-21-services-hub-inventory-promotions.md`)
```

In `## ✅ Completed`, add:

```
- [2026-04-21] **Services Hub — Notifications & Instructions Tabs** — `src/hooks/useNotifications.ts`, `src/hooks/useServices.ts` (instruction + junction hooks), `src/components/services/ReminderEditDialog.tsx`, `src/components/services/NotificationsTab.tsx`, `src/components/services/InstructionEditDialog.tsx`, `src/components/services/InstructionsTab.tsx`, `src/app/(dashboard)/master-data/services/page.tsx` — Fixed Notifications table, Service Reminders by category, Materials CRUD, Service Links junction manager
```

Update the plan table: change `2026-04-21-services-hub-notifications-instructions.md` from `⏳ UPCOMING` to `✅ DONE`.

- [ ] **Step 5: Commit**

```bash
cd D:/MMS && git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — Notifications & Instructions tabs complete"
```

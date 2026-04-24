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
    channel: ((reminder?.channel ?? 'Email') as ReminderFormValues['channel']),
    timing: reminder?.timing ?? null,
    status: ((reminder?.status ?? 'active') as ReminderFormValues['status']),
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
                  <FormControl><SelectTrigger><SelectValue placeholder="Select category">
                    {(v: unknown) => {
                      const cat = categories.find((c: ReminderCategory) => c.id === String(v ?? ''))
                      return cat ? cat.name : (categories.length > 0 ? String(v) : undefined)
                    }}
                  </SelectValue></SelectTrigger></FormControl>
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

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
                    aria-label={`Toggle ${r.name}`}
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

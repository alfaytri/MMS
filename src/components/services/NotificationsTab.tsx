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

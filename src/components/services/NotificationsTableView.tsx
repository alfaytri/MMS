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

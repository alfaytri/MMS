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
                  aria-label={`Toggle ${item.label}`}
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

      {Object.keys(grouped).length === 0 && (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          No notifications configured
        </div>
      )}
    </div>
  )
}

// src/components/services/NotificationsTab.tsx
'use client'

import { NotificationsTableView } from './NotificationsTableView'

interface NotificationsTabProps {
  enabled: boolean
}

export function NotificationsTab({ enabled }: NotificationsTabProps) {
  return <NotificationsTableView enabled={enabled} />
}

'use client'

import { usePermissions } from '@/hooks/usePermissions'
import { ShieldAlert } from 'lucide-react'

interface PermissionGateProps {
  permission: string | string[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function PermissionGate({ permission, children, fallback }: PermissionGateProps) {
  const { data, isLoading } = usePermissions()

  if (isLoading) return null

  const userPerms = data?.permissions ?? []
  const isSystemAdmin = data?.isSystemAdmin ?? false

  if (isSystemAdmin) return <>{children}</>

  const required = Array.isArray(permission) ? permission : [permission]
  const hasAccess = required.some((p) => userPerms.includes(p))

  if (hasAccess) return <>{children}</>

  if (fallback) return <>{fallback}</>

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
      <ShieldAlert className="h-16 w-16" />
      <h2 className="text-xl font-semibold text-foreground">Access Denied</h2>
      <p className="text-sm max-w-md text-center">
        You don&apos;t have permission to view this page. Contact your administrator to request access.
      </p>
    </div>
  )
}

'use client'

import { useState, useMemo, useEffect } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { AuditDetailDialog } from '@/components/master-data/AuditDetailDialog'
import { useActivityLog, AUDIT_MODULES, AUDIT_SEVERITIES, type ActivityLog } from '@/hooks/useActivityLog'
import { formatRelative } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default function AuditTrailPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])
  const [module, setModule] = useState('')
  const [severity, setSeverity] = useState('')
  const [detail, setDetail] = useState<ActivityLog | null>(null)

  const { data: logs, isLoading } = useActivityLog({ search: debouncedSearch, module: module || undefined, severity: severity || undefined })

  const columns = useMemo<ColumnDef<ActivityLog>[]>(() => [
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">{formatRelative(row.getValue('created_at') as string)}</span>
      ),
    },
    {
      accessorKey: 'action',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Action" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('action')}</span>,
    },
    {
      accessorKey: 'module',
      header: 'Module',
      cell: ({ row }) => <Badge variant="outline" className="text-xs">{row.getValue('module') as string ?? '—'}</Badge>,
    },
    {
      accessorKey: 'performer_name',
      header: 'User',
      cell: ({ row }) => row.getValue('performer_name') || <span className="text-muted-foreground">System</span>,
    },
    {
      accessorKey: 'severity',
      header: 'Severity',
      cell: ({ row }) => {
        const sev = row.getValue('severity') as string
        return <Badge variant="outline" className={sev === 'critical' ? 'border-destructive text-destructive' : sev === 'warning' ? 'border-warning text-warning' : 'text-xs'}>{sev ?? 'info'}</Badge>
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetail(row.original)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ], [])

  return (
    <PageWrapper>
      <PageHeader title="Audit Trail" description="Activity log across all modules" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search actions…" />
        <select
          value={module}
          onChange={(e) => setModule(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-background px-3 text-sm w-full sm:w-40"
        >
          <option value="">All Modules</option>
          {AUDIT_MODULES.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
        </select>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-background px-3 text-sm w-full sm:w-36"
        >
          <option value="">All Severities</option>
          {AUDIT_SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <DataTable columns={columns} data={logs ?? []} isLoading={isLoading} pageSize={50} />

      <AuditDetailDialog
        open={!!detail}
        onOpenChange={(open) => { if (!open) setDetail(null) }}
        entry={detail}
      />
    </PageWrapper>
  )
}

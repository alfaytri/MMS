'use client'

import { useState, useMemo } from 'react'
import { PackageCheck, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  useSubscriptionPackages,
  useArchivePackage,
  usePackageServices,
  type SubscriptionPackageWithCount,
  type PackageServiceEntry,
} from '@/hooks/useSubscriptionPackages'
import { SubscriptionPackageRow } from './SubscriptionPackageRow'
import { PackageEditDialog } from './PackageEditDialog'
import type { Profile } from '@/hooks/useProfiles'

interface Props {
  currentProfile: Profile | null
}

export function SubscriptionsPage({ currentProfile }: Props) {
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [editTarget, setEditTarget] = useState<SubscriptionPackageWithCount | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<SubscriptionPackageWithCount | null>(null)
  const [editServices, setEditServices] = useState<PackageServiceEntry[]>([])

  const { data: packages = [], isLoading } = useSubscriptionPackages({ includeArchived: showArchived })
  const archive = useArchivePackage()

  // Load existing services when edit dialog opens for an existing package
  const { data: existingServices = [] } = usePackageServices(editTarget?.id ?? null)

  // Sync existing services into dialog state when target changes
  useMemo(() => {
    if (editTarget && existingServices.length > 0) {
      setEditServices(existingServices)
    }
  }, [editTarget, existingServices])

  const filtered = useMemo(() => {
    if (!search.trim()) return packages
    const q = search.toLowerCase()
    return packages.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.name_ar ?? '').toLowerCase().includes(q),
    )
  }, [packages, search])

  const activeCount = packages.filter((p) => p.is_active).length

  function openCreate() {
    setEditTarget(null)
    setEditServices([])
    setDialogOpen(true)
  }

  function openEdit(pkg: SubscriptionPackageWithCount) {
    setEditTarget(pkg)
    setEditServices([]) // will be overwritten by useMemo above once existingServices loads
    setDialogOpen(true)
  }

  function handleArchiveConfirm() {
    if (!archiveTarget) return
    archive.mutate(
      { id: archiveTarget.id, performerName: currentProfile?.full_name ?? null },
      {
        onSuccess: () => toast.success(`"${archiveTarget.name}" archived`),
        onError: (e) => toast.error(e.message),
        onSettled: () => setArchiveTarget(null),
      },
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-sm font-semibold">Subscription Packages</h1>
            <p className="text-xs text-muted-foreground">
              Manage annual subscription tiers for customers
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
            <Label htmlFor="show-archived" className="text-xs">
              Show Archived
            </Label>
          </div>
          <Button size="sm" className="text-xs gap-1 h-8" onClick={openCreate}>
            <Plus className="h-3 w-3" />
            New Package
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Input
          className="h-8 text-xs max-w-xs"
          placeholder="Search packages…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
          {activeCount} active
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Discount</TableHead>
              <TableHead className="text-xs">Initial Fee</TableHead>
              <TableHead className="text-xs">Priority</TableHead>
              <TableHead className="text-xs">Services</TableHead>
              <TableHead className="text-xs">Duration</TableHead>
              <TableHead className="text-xs">Subscribers</TableHead>
              {showArchived && <TableHead className="text-xs">Status</TableHead>}
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: showArchived ? 9 : 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showArchived ? 9 : 8}
                  className="text-center py-10"
                >
                  {search ? (
                    <p className="text-xs text-muted-foreground">
                      No packages match your search.
                    </p>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-xs text-muted-foreground">No packages yet.</p>
                      <Button variant="ghost" size="sm" className="text-xs" onClick={openCreate}>
                        <Plus className="h-3 w-3 mr-1" />
                        Create your first package
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((pkg) => (
                <SubscriptionPackageRow
                  key={pkg.id}
                  pkg={pkg}
                  showStatus={showArchived}
                  onEdit={openEdit}
                  onArchive={setArchiveTarget}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit / Create dialog */}
      <PackageEditDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditTarget(null)
        }}
        pkg={editTarget}
        performerName={currentProfile?.full_name ?? null}
        selectedServices={editServices}
        onServicesChange={setEditServices}
      />

      {/* Archive confirmation */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              Archive &ldquo;{archiveTarget?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This package will no longer appear in new sign-up flows. Existing customer
              subscriptions will not be cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="text-xs bg-destructive hover:bg-destructive/90"
              onClick={handleArchiveConfirm}
              disabled={archive.isPending}
            >
              {archive.isPending ? 'Archiving…' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

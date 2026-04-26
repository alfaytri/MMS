// src/app/(dashboard)/master-data/credit-groups/page.tsx
'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  useCreditGroups,
  useUpdateCreditGroup,
  useDeleteCreditGroup,
  useCreditGroupCustomerCounts,
  PAYMENT_METHODS,
  type CreditGroup,
} from '@/hooks/useCreditGroups'
import { formatCurrency } from '@/lib/utils/formatters'
import { AddCreditGroupDialog } from './AddCreditGroupDialog'

function resolveMethodLabels(keys: string[]): string {
  if (!keys || keys.length === 0) return '—'
  return keys
    .map((k) => PAYMENT_METHODS.find((m) => m.key === k)?.label ?? k)
    .join(', ')
}

export default function CreditGroupsPage() {
  const { data: groups = [], isLoading } = useCreditGroups()
  const { data: counts = {} }            = useCreditGroupCustomerCounts()
  const update = useUpdateCreditGroup()
  const remove = useDeleteCreditGroup()

  const [dialogOpen, setDialogOpen]     = useState(false)
  const [editId, setEditId]             = useState<string | null>(null)
  const [editName, setEditName]         = useState('')
  const [editLimit, setEditLimit]       = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CreditGroup | null>(null)

  function startEdit(g: CreditGroup) {
    setEditId(g.id); setEditName(g.name); setEditLimit(String(g.credit_limit))
  }
  function cancelEdit() { setEditId(null) }

  function submitEdit() {
    if (!editId) return
    const limit = parseFloat(editLimit)
    if (!editName.trim() || isNaN(limit) || limit < 0) { toast.error('Enter a valid name and credit limit'); return }
    update.mutate(
      { id: editId, name: editName.trim(), credit_limit: limit },
      {
        onSuccess: () => { toast.success('Updated'); setEditId(null) },
        onError:   (err) => toast.error(err.message),
      }
    )
  }

  function handleDelete(g: CreditGroup) {
    const n = counts[g.id] ?? 0
    if (n > 0) { toast.error(`Cannot delete — ${n} customer(s) assigned`); return }
    setDeleteTarget(g)
  }

  function confirmDelete() {
    if (!deleteTarget) return
    remove.mutate(deleteTarget.id, {
      onSuccess: () => { toast.success('Deleted'); setDeleteTarget(null) },
      onError:   (err) => { toast.error(err.message); setDeleteTarget(null) },
    })
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Credit Groups"
        description="Define credit tiers — each customer must be assigned a group before creating a sales order"
      />

      <div className="rounded-md border overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group Name</TableHead>
              <TableHead className="text-right">Credit Limit (QAR)</TableHead>
              <TableHead className="hidden md:table-cell">Methods</TableHead>
              <TableHead className="hidden md:table-cell text-right">Max Days</TableHead>
              <TableHead className="text-right">Customers</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-10 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10 ml-auto" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))
              : groups.map((g) =>
                  editId === g.id ? (
                    <TableRow key={g.id}>
                      <TableCell>
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-sm" autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') submitEdit(); if (e.key === 'Escape') cancelEdit() }} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" min={0} value={editLimit} onChange={(e) => setEditLimit(e.target.value)} className="h-8 text-sm text-right"
                          onKeyDown={(e) => { if (e.key === 'Enter') submitEdit(); if (e.key === 'Escape') cancelEdit() }} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {resolveMethodLabels(g.payment_methods)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right text-sm text-muted-foreground">
                        {g.max_days ?? '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{counts[g.id] ?? 0}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={submitEdit} disabled={update.isPending}>
                            <Check className="h-3.5 w-3.5 text-success" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(g.credit_limit, 'QAR')}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                        {resolveMethodLabels(g.payment_methods)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right text-sm text-muted-foreground">
                        {g.max_days ?? '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{counts[g.id] ?? 0}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(g)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/60 hover:text-destructive" onClick={() => handleDelete(g)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                )}
          </TableBody>
        </Table>
      </div>

      <Button variant="outline" size="sm" className="gap-1.5 self-start" onClick={() => setDialogOpen(true)}>
        <Plus className="h-4 w-4" /> Add Credit Group
      </Button>

      <AddCreditGroupDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. The group must have zero customers assigned.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  )
}

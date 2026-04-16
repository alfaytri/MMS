'use client'

import { useState, useMemo, useEffect } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type ReasonList = DBTable<'reason_lists'>

function useReasonLists() {
  return useQuery({
    queryKey: ['reason-lists'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('reason_lists')
        .select('*')
        .is('deleted_at', null)
        .order('category', { ascending: true })
        .order('sort_order')
      if (error) throw error
      return data as ReasonList[]
    },
  })
}

const rlSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  label: z.string().min(1, 'Label is required'),
  sort_order: z.coerce.number().int().default(0),
  active: z.boolean().default(true),
})

const CATEGORIES = [
  'cancellation', 'return', 'adjustment', 'credit_note', 'refund',
  'discount', 'complaint', 'reschedule', 'void',
]

export default function ReasonListsPage() {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ReasonList | null>(null)
  const { data, isLoading } = useReasonLists()
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof rlSchema>) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('reason_lists').insert(values).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reason-lists'] }),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: z.infer<typeof rlSchema> & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('reason_lists').update(values).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reason-lists'] }),
  })

  const form = useForm<z.infer<typeof rlSchema>>({
    resolver: zodResolver(rlSchema) as never,
    defaultValues: { category: '', label: '', sort_order: 0, active: true },
  })

  useEffect(() => {
    if (dialogOpen && editing) {
      form.reset({
        category: editing.category,
        label: editing.label,
        sort_order: editing.sort_order ?? 0,
        active: editing.active ?? true,
      })
    } else if (dialogOpen) {
      form.reset()
    }
  }, [dialogOpen, editing, form])

  function onSubmit(values: z.infer<typeof rlSchema>) {
    const mutation = editing
      ? () => updateMutation.mutateAsync({ id: editing.id, ...values })
      : () => createMutation.mutateAsync(values)

    mutation()
      .then(() => { toast.success(editing ? 'Updated' : 'Created'); setDialogOpen(false); setEditing(null) })
      .catch((err: Error) => toast.error(err.message))
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  const columns = useMemo<ColumnDef<ReasonList>[]>(() => [
    {
      accessorKey: 'category',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => <Badge variant="outline">{(row.getValue('category') as string).replace(/_/g, ' ')}</Badge>,
    },
    {
      accessorKey: 'label',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Label" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('label')}</span>,
    },
    {
      accessorKey: 'sort_order',
      header: 'Order',
    },
    {
      accessorKey: 'active',
      header: 'Status',
      cell: ({ row }) => (
        <StatusBadge variant={row.getValue('active') ? 'active' : 'inactive'}>
          {row.getValue('active') ? 'Active' : 'Inactive'}
        </StatusBadge>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => { setEditing(row.original); setDialogOpen(true) }}>
                <Pencil className="h-4 w-4 mr-2" />Edit
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [])

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Reason Lists</h2>
          <div className="flex gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search…" />
            <Button onClick={() => { setEditing(null); setDialogOpen(true) }}>Add</Button>
          </div>
        </div>
        <DataTable columns={columns} data={data ?? []} isLoading={isLoading} globalFilter={search} />
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} Reason</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem><FormLabel>Category *</FormLabel><FormControl>
                  <select {...field} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                    <option value="">Select category</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="label" render={({ field }) => (
                <FormItem><FormLabel>Label *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="sort_order" render={({ field }) => (
                <FormItem><FormLabel>Sort Order</FormLabel><FormControl><Input type="number" min="0" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>Cancel</Button>
                <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : editing ? 'Update' : 'Create'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}

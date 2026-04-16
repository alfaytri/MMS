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
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
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

// brand_groups is not in generated types — manual type
type BrandGroup = {
  id: string
  name: string
  name_ar: string | null
  scope: string
  created_at: string
  updated_at: string
  created_by: string | null
  deleted_at: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

function useBrandGroups() {
  return useQuery({
    queryKey: ['brand-groups'],
    queryFn: async () => {
      const supabase = createClient() as AnyClient
      const { data, error } = await supabase
        .from('brand_groups')
        .select('*')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data as BrandGroup[]
    },
  })
}

const bgSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  name_ar: z.string().optional().default(''),
  scope: z.string().min(1, 'Scope is required'),
})

export default function BrandGroupsPage() {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<BrandGroup | null>(null)
  const { data, isLoading } = useBrandGroups()
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof bgSchema>) => {
      const supabase = createClient() as AnyClient
      const { data, error } = await supabase
        .from('brand_groups')
        .insert({ ...values, name_ar: values.name_ar || null })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-groups'] }),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: z.infer<typeof bgSchema> & { id: string }) => {
      const supabase = createClient() as AnyClient
      const { data, error } = await supabase
        .from('brand_groups')
        .update({ ...values, name_ar: values.name_ar || null })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-groups'] }),
  })

  const form = useForm<z.infer<typeof bgSchema>>({
    resolver: zodResolver(bgSchema) as never,
    defaultValues: { name: '', name_ar: '', scope: 'inventory' },
  })

  useEffect(() => {
    if (dialogOpen && editing) {
      form.reset({ name: editing.name, name_ar: editing.name_ar ?? '', scope: editing.scope })
    } else if (dialogOpen) {
      form.reset()
    }
  }, [dialogOpen, editing, form])

  function onSubmit(values: z.infer<typeof bgSchema>) {
    const mutation = editing
      ? () => updateMutation.mutateAsync({ id: editing.id, ...values })
      : () => createMutation.mutateAsync(values)

    mutation()
      .then(() => { toast.success(editing ? 'Updated' : 'Created'); setDialogOpen(false); setEditing(null) })
      .catch((err: Error) => toast.error(err.message))
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  const columns = useMemo<ColumnDef<BrandGroup>[]>(() => [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('name')}</span>,
    },
    {
      accessorKey: 'name_ar',
      header: 'Arabic Name',
      cell: ({ row }) => row.getValue('name_ar') || <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'scope',
      header: 'Scope',
      cell: ({ row }) => <Badge variant="outline">{row.getValue('scope') as string}</Badge>,
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
          <h2 className="text-lg font-semibold">Brand Groups</h2>
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
            <DialogTitle>{editing ? 'Edit' : 'Add'} Brand Group</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="name_ar" render={({ field }) => (
                <FormItem><FormLabel>Arabic Name</FormLabel><FormControl><Input dir="rtl" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="scope" render={({ field }) => (
                <FormItem><FormLabel>Scope *</FormLabel><FormControl>
                  <select {...field} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                    <option value="inventory">Inventory</option>
                    <option value="tools">Tools</option>
                  </select>
                </FormControl><FormMessage /></FormItem>
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

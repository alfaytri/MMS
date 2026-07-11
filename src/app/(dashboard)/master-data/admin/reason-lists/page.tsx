'use client'

import { useState, useMemo, useEffect } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Settings2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'
import { SearchInput } from '@/components/shared/SearchInput'
import { PageWrapper } from '@/components/shared/PageWrapper'
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
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { queryKeys } from '@/lib/queryKeys'

type ReasonList = DBTable<'reason_lists'>
type ReasonCategory = {
  id:         string
  slug:       string
  label:      string
  sort_order: number
  active:     boolean
  deleted_at: string | null
  created_at: string
}

function useReasonLists() {
  return useQuery({
    queryKey: queryKeys.reasonLists.all,
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

function useReasonCategories() {
  return useQuery({
    queryKey: ['reason_list_categories', 'all'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('reason_list_categories')
        .select('*')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as ReasonCategory[]
    },
    staleTime: 60_000,
  })
}

const rlSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  label: z.string().min(1, 'Label is required'),
  sort_order: z.coerce.number().int().default(0),
  active: z.boolean().default(true),
})

const categorySchema = z.object({
  slug:       z.string().min(1, 'Slug is required')
              .regex(/^[a-z][a-z0-9_]*$/, 'Lowercase letters, digits, underscores; must start with a letter'),
  label:      z.string().min(1, 'Label is required'),
  sort_order: z.coerce.number().int().default(0),
  active:     z.boolean().default(true),
})

export default function ReasonListsPage() {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ReasonList | null>(null)
  const [catDialogOpen, setCatDialogOpen] = useState(false)
  const { data, isLoading } = useReasonLists()
  const { data: categories = [] } = useReasonCategories()
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof rlSchema>) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('reason_lists').insert(values).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.reasonLists.all }),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: z.infer<typeof rlSchema> & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('reason_lists').update(values).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.reasonLists.all }),
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
    <PageWrapper>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Reason Lists</h2>
          <div className="flex gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search…" />
            <Button variant="outline" onClick={() => setCatDialogOpen(true)}>
              <Settings2 className="h-4 w-4 mr-2" />Manage Categories
            </Button>
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
                    {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
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

      <ManageCategoriesDialog open={catDialogOpen} onOpenChange={setCatDialogOpen} categories={categories} />
    </PageWrapper>
  )
}

// ─── Manage Categories dialog ─────────────────────────────────────────────────
interface ManageCategoriesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: ReasonCategory[]
}

function ManageCategoriesDialog({ open, onOpenChange, categories }: ManageCategoriesDialogProps) {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)

  const form = useForm<z.infer<typeof categorySchema>>({
    resolver: zodResolver(categorySchema) as never,
    defaultValues: { slug: '', label: '', sort_order: 0, active: true },
  })

  const editing = editingId ? categories.find((c) => c.id === editingId) ?? null : null

  useEffect(() => {
    if (!open) {
      setEditingId(null)
      form.reset({ slug: '', label: '', sort_order: 0, active: true })
      return
    }
    if (editing) {
      form.reset({
        slug:       editing.slug,
        label:      editing.label,
        sort_order: editing.sort_order,
        active:     editing.active,
      })
    } else {
      form.reset({ slug: '', label: '', sort_order: 0, active: true })
    }
  }, [open, editingId, editing, form])

  const upsert = useMutation({
    mutationFn: async (values: z.infer<typeof categorySchema>) => {
      const supabase = createClient()
      if (editing) {
        const { error } = await supabase
          .from('reason_list_categories')
          .update({ label: values.label, sort_order: values.sort_order, active: values.active })
          .eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('reason_list_categories')
          .insert({ slug: values.slug, label: values.label, sort_order: values.sort_order, active: values.active })
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editing ? 'Category updated' : 'Category created')
      queryClient.invalidateQueries({ queryKey: ['reason_list_categories', 'all'] })
      setEditingId(null)
      form.reset({ slug: '', label: '', sort_order: 0, active: true })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('reason_list_categories')
        .update({ deleted_at: new Date().toISOString(), active: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Category archived')
      queryClient.invalidateQueries({ queryKey: ['reason_list_categories', 'all'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Manage Reason Categories</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No categories yet — create the first one below.</p>
          ) : (
            <div className="rounded-md border divide-y">
              {categories.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.label}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{c.slug} · order {c.sort_order}</div>
                  </div>
                  <StatusBadge variant={c.active ? 'active' : 'inactive'}>
                    {c.active ? 'Active' : 'Inactive'}
                  </StatusBadge>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(c.id)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      if (confirm(`Archive "${c.label}"? Existing reasons under this category stay; new reasons can no longer be added to it.`)) {
                        softDelete.mutate(c.id)
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-2 border-t">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {editing ? `Edit "${editing.label}"` : 'Add new category'}
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => upsert.mutate(v))} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField control={form.control} name="slug" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug *</FormLabel>
                    <FormControl><Input placeholder="e.g. delivery_issue" disabled={!!editing} {...field} /></FormControl>
                    <p className="text-[10px] text-muted-foreground">Used in code; can't change after creation.</p>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="label" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Label *</FormLabel>
                    <FormControl><Input placeholder="e.g. Delivery Issue" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="sort_order" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl><Input type="number" min="0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="active" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border border-border p-3 bg-card">
                    <FormLabel className="text-sm">Active</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <DialogFooter>
                {editing && (
                  <Button type="button" variant="outline" onClick={() => setEditingId(null)} disabled={upsert.isPending}>
                    Cancel Edit
                  </Button>
                )}
                <Button type="submit" disabled={upsert.isPending}>
                  {upsert.isPending ? 'Saving…' : editing ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

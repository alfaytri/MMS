'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

// ─── Types ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

type Brand = { id: string; name: string; name_ar: string | null }

type BrandGroupMember = { id: string; brand_id: string; brands: Brand }

type BrandGroup = {
  id: string
  name: string
  name_ar: string | null
  scope: string
  created_at: string
  deleted_at: string | null
  brand_group_members: BrandGroupMember[]
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const bgSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  name_ar: z.string().optional().default(''),
  scope: z.string().min(1, 'Scope is required'),
})

const SCOPES = [
  { value: 'contract', label: 'Contract' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'tools', label: 'Tools' },
  { value: 'services', label: 'Services' },
]

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useBrandGroups() {
  return useQuery({
    queryKey: ['brand-groups'],
    queryFn: async () => {
      const supabase = createClient() as AnyClient
      const { data, error } = await supabase
        .from('brand_groups')
        .select('*, brand_group_members(id, brand_id, brands(id, name, name_ar))')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data as BrandGroup[]
    },
  })
}

function useBrands() {
  return useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const supabase = createClient() as AnyClient
      const { data, error } = await supabase
        .from('brands')
        .select('id, name, name_ar')
        .order('name')
      if (error) throw error
      return data as Brand[]
    },
  })
}

// ─── Manage Brands Dialog ─────────────────────────────────────────────────────

function ManageBrandsDialog({
  group,
  allBrands,
  open,
  onClose,
}: {
  group: BrandGroup
  allBrands: Brand[]
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Initialise from current members when the dialog opens
  useEffect(() => {
    if (open) {
      setSelected(new Set(group.brand_group_members.map((m) => m.brand_id)))
      setSearch('')
    }
  }, [open, group])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const supabase = createClient() as AnyClient
      const currentIds = new Set(group.brand_group_members.map((m) => m.brand_id))

      // IDs to add
      const toAdd = [...selected].filter((id) => !currentIds.has(id))
      // IDs to remove (members whose brand_id is no longer selected)
      const toRemove = group.brand_group_members
        .filter((m) => !selected.has(m.brand_id))
        .map((m) => m.id)

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('brand_group_members')
          .delete()
          .in('id', toRemove)
        if (error) throw error
      }

      if (toAdd.length > 0) {
        const { error } = await supabase
          .from('brand_group_members')
          .insert(toAdd.map((brand_id) => ({ group_id: group.id, brand_id })))
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-groups'] })
      toast.success('Brands updated')
      onClose()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const filtered = useMemo(
    () =>
      allBrands.filter((b) =>
        b.name.toLowerCase().includes(search.toLowerCase())
      ),
    [allBrands, search]
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Manage Brands — {group.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="Search brands…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-64 overflow-y-auto space-y-1 rounded-md border border-border p-2">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No brands found</p>
            )}
            {filtered.map((brand) => (
              <label
                key={brand.id}
                className="flex items-center gap-3 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-muted"
              >
                <Checkbox
                  checked={selected.has(brand.id)}
                  onCheckedChange={() => toggle(brand.id)}
                />
                <span>{brand.name}</span>
                {brand.name_ar && (
                  <span className="text-muted-foreground text-xs ml-auto" dir="rtl">{brand.name_ar}</span>
                )}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{selected.size} brand{selected.size !== 1 ? 's' : ''} selected</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Group Form Dialog ────────────────────────────────────────────────────────

function GroupFormDialog({
  open,
  editing,
  onClose,
}: {
  open: boolean
  editing: BrandGroup | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  const form = useForm<z.infer<typeof bgSchema>>({
    resolver: zodResolver(bgSchema) as never,
    defaultValues: { name: '', name_ar: '', scope: 'contract' },
  })

  useEffect(() => {
    if (open) {
      form.reset(
        editing
          ? { name: editing.name, name_ar: editing.name_ar ?? '', scope: editing.scope }
          : { name: '', name_ar: '', scope: 'contract' }
      )
    }
  }, [open, editing, form])

  const saveMutation = useMutation({
    mutationFn: async (values: z.infer<typeof bgSchema>) => {
      const supabase = createClient() as AnyClient
      const payload = { ...values, name_ar: values.name_ar || null }
      if (editing) {
        const { error } = await supabase
          .from('brand_groups')
          .update(payload)
          .eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('brand_groups')
          .insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-groups'] })
      toast.success(editing ? 'Brand group updated' : 'Brand group created')
      onClose()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit' : 'New'} Brand Group</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Name *</FormLabel>
                <FormControl><Input {...field} placeholder="e.g. AC Brands" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="name_ar" render={({ field }) => (
              <FormItem>
                <FormLabel>Arabic Name</FormLabel>
                <FormControl><Input dir="rtl" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="scope" render={({ field }) => (
              <FormItem>
                <FormLabel>Scope *</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Select scope" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {SCOPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={saveMutation.isPending}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : editing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Scope badge colour map ───────────────────────────────────────────────────

const SCOPE_COLOURS: Record<string, string> = {
  contract: 'bg-blue-50 text-blue-700 border-blue-200',
  inventory: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  tools: 'bg-amber-50 text-amber-700 border-amber-200',
  services: 'bg-purple-50 text-purple-700 border-purple-200',
}

function ScopeBadge({ scope }: { scope: string }) {
  const colour = SCOPE_COLOURS[scope.toLowerCase()] ?? 'bg-muted text-muted-foreground border-border'
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${colour}`}>
      {scope}
    </span>
  )
}

// ─── Brand Group Card ─────────────────────────────────────────────────────────

function BrandGroupCard({
  group,
  allBrands,
  onEdit,
  onDelete,
}: {
  group: BrandGroup
  allBrands: Brand[]
  onEdit: (g: BrandGroup) => void
  onDelete: (g: BrandGroup) => void
}) {
  const [manageOpen, setManageOpen] = useState(false)

  const brands = group.brand_group_members.map((m) => m.brands).filter(Boolean)

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm text-foreground leading-tight">{group.name}</h3>
          <ScopeBadge scope={group.scope} />
        </div>

        {/* Brand chips */}
        <div className="flex flex-wrap gap-1.5 min-h-[24px]">
          {brands.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">No brands assigned</span>
          ) : (
            brands.map((b) => (
              <span
                key={b.id}
                className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-foreground"
              >
                {b.name}
              </span>
            ))
          )}
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/60">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setManageOpen(true)}
          >
            <Tag className="h-3.5 w-3.5" />
            Manage Brands
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(group)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onDelete(group)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <ManageBrandsDialog
        group={group}
        allBrands={allBrands}
        open={manageOpen}
        onClose={() => setManageOpen(false)}
      />
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrandGroupsPage() {
  const [scopeFilter, setScopeFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<BrandGroup | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BrandGroup | null>(null)

  const { data: groups = [], isLoading } = useBrandGroups()
  const { data: allBrands = [] } = useBrands()
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient() as AnyClient
      const { error } = await supabase
        .from('brand_groups')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-groups'] })
      toast.success('Brand group deleted')
      setDeleteTarget(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const filtered = useMemo(
    () =>
      scopeFilter === 'all'
        ? groups
        : groups.filter((g) => g.scope.toLowerCase() === scopeFilter),
    [groups, scopeFilter]
  )

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Filter by scope:</span>
          <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v ?? 'all')}>
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scopes</SelectItem>
              {SCOPES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="h-8 text-sm gap-1.5"
          onClick={() => { setEditing(null); setFormOpen(true) }}
        >
          <Plus className="h-4 w-4" />
          New Brand Group
        </Button>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-lg border border-border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Tag className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No brand groups found</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {scopeFilter !== 'all' ? 'Try a different scope filter' : 'Click "+ New Brand Group" to get started'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((group) => (
            <BrandGroupCard
              key={group.id}
              group={group}
              allBrands={allBrands}
              onEdit={(g) => { setEditing(g); setFormOpen(true) }}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* Group form dialog */}
      <GroupFormDialog
        open={formOpen}
        editing={editing}
        onClose={() => { setFormOpen(false); setEditing(null) }}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete brand group"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
      />
    </>
  )
}

'use client'

import { useState, useMemo, useEffect, type CSSProperties } from 'react'
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Pencil, Trash2, MoreHorizontal, Check, X, FolderPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { humanizeDbError } from '@/lib/dbErrors'
import { queryKeys } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import type { DBTable } from '@/types/database.types'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type ReasonList = DBTable<'reason_lists'>
type Category = {
  id: string
  slug: string
  label: string
  sort_order: number
  active: boolean
  deleted_at: string | null
}

const CATEGORIES_KEY = ['reason_list_categories', 'all'] as const

// ─── queries ──────────────────────────────────────────────────────────────────
function useCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('reason_list_categories')
        .select('id, slug, label, sort_order, active, deleted_at')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as Category[]
    },
    staleTime: 60_000,
  })
}

function useReasons() {
  return useQuery({
    queryKey: queryKeys.reasonLists.all,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('reason_lists')
        .select('*')
        .is('deleted_at', null)
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as ReasonList[]
    },
  })
}

/** Invalidate the admin reason list — the `['reason-lists']` prefix also covers
 *  every consumer's `byCategory` dropdown, so those refresh too. */
const invalidateReasons = (qc: QueryClient) =>
  qc.invalidateQueries({ queryKey: queryKeys.reasonLists.all })
const invalidateCategories = (qc: QueryClient) =>
  qc.invalidateQueries({ queryKey: CATEGORIES_KEY })

// ─── page ─────────────────────────────────────────────────────────────────────
export default function ReasonListsPage() {
  const { data: categories = [], isLoading: catLoading } = useCategories()
  const { data: reasons = [], isLoading: reasonsLoading } = useReasons()
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [addCatOpen, setAddCatOpen] = useState(false)

  // default to the first category once loaded
  useEffect(() => {
    if (!selectedSlug && categories.length) setSelectedSlug(categories[0].slug)
  }, [categories, selectedSlug])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of reasons) m.set(r.category, (m.get(r.category) ?? 0) + 1)
    return m
  }, [reasons])

  const selectedCategory = categories.find((c) => c.slug === selectedSlug) ?? null
  const reasonsForSelected = useMemo(
    () => reasons.filter((r) => r.category === selectedSlug),
    [reasons, selectedSlug],
  )
  const nextCatSort = categories.reduce((m, c) => Math.max(m, c.sort_order), 0) + 10

  return (
    <PageWrapper>
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Reason Lists</h2>
          <p className="text-sm text-muted-foreground">
            Pick a category on the left to manage its reasons — drag to reorder, use the switch to activate, the menu to rename or delete.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row rounded-lg border bg-card overflow-hidden">
          <CategoryRail
            categories={categories}
            counts={counts}
            selectedSlug={selectedSlug}
            onSelect={setSelectedSlug}
            loading={catLoading}
            onAdd={() => setAddCatOpen(true)}
          />
          <ReasonPanel category={selectedCategory} reasons={reasonsForSelected} loading={reasonsLoading} />
        </div>
      </div>

      <AddCategoryDialog open={addCatOpen} onOpenChange={setAddCatOpen} nextSort={nextCatSort} />
    </PageWrapper>
  )
}

// ─── left rail: categories ──────────────────────────────────────────────────────
interface CategoryRailProps {
  categories: Category[]
  counts: Map<string, number>
  selectedSlug: string | null
  onSelect: (slug: string) => void
  loading: boolean
  onAdd: () => void
}

function CategoryRail({ categories, counts, selectedSlug, onSelect, loading, onAdd }: CategoryRailProps) {
  const qc = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const rename = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { error } = await createClient().from('reason_list_categories').update({ label }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => setEditingId(null),
    onError: (e: Error) => toast.error(humanizeDbError(e)),
    onSettled: () => invalidateCategories(qc),
  })

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await createClient().from('reason_list_categories').update({ active }).eq('id', id)
      if (error) throw error
    },
    onError: (e: Error) => toast.error(humanizeDbError(e)),
    onSettled: () => invalidateCategories(qc),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient()
        .from('reason_list_categories')
        .update({ deleted_at: new Date().toISOString(), active: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => toast.success('Category deleted'),
    onError: (e: Error) => toast.error(humanizeDbError(e)),
    onSettled: () => invalidateCategories(qc),
  })

  function saveRename(c: Category) {
    const label = draft.trim()
    if (!label || label === c.label) { setEditingId(null); return }
    rename.mutate({ id: c.id, label })
  }

  return (
    <div className="flex flex-col border-b lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Categories</span>
        <span className="text-xs tabular-nums text-muted-foreground">{categories.length}</span>
      </div>

      <div className="max-h-64 flex-1 space-y-0.5 overflow-y-auto px-2 lg:max-h-[62vh]">
        {loading ? (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">Loading…</p>
        ) : categories.length === 0 ? (
          <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">No categories yet.</p>
        ) : (
          categories.map((c) => {
            const isSel = c.slug === selectedSlug
            const isEditing = editingId === c.id
            return (
              <div
                key={c.id}
                className={cn(
                  'group flex items-center gap-1.5 rounded-md py-1.5 pl-2.5 pr-1',
                  isSel ? 'bg-accent' : 'hover:bg-muted',
                )}
              >
                {isEditing ? (
                  <div className="flex flex-1 items-center gap-1">
                    <Input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename(c)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="h-7 text-sm"
                    />
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => saveRename(c)}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onSelect(c.slug)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', c.active ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                      <span className={cn('truncate text-sm', isSel ? 'font-semibold' : 'font-medium', !c.active && 'text-muted-foreground')}>
                        {c.label}
                      </span>
                    </button>
                    <span className="min-w-[1.25rem] rounded bg-muted px-1.5 py-0.5 text-center text-[11px] tabular-nums text-muted-foreground">
                      {counts.get(c.slug) ?? 0}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-6 w-6 items-center justify-center rounded opacity-0 hover:bg-background/60 focus:opacity-100 group-hover:opacity-100">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditingId(c.id); setDraft(c.label) }}>
                          <Pencil className="mr-2 h-3.5 w-3.5" />Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggle.mutate({ id: c.id, active: !c.active })}>
                          {c.active
                            ? <><X className="mr-2 h-3.5 w-3.5" />Deactivate</>
                            : <><Check className="mr-2 h-3.5 w-3.5" />Activate</>}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            if (confirm(`Delete category "${c.label}"? Its existing reasons stay, but you can't add new ones to it.`)) {
                              remove.mutate(c.id)
                            }
                          }}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="p-2">
        <Button type="button" variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={onAdd}>
          <FolderPlus className="mr-2 h-4 w-4" />Add category
        </Button>
      </div>
    </div>
  )
}

// ─── right pane: reasons for the selected category ──────────────────────────────
interface ReasonPanelProps {
  category: Category | null
  reasons: ReasonList[]
  loading: boolean
}

function ReasonPanel({ category, reasons, loading }: ReasonPanelProps) {
  const qc = useQueryClient()
  const [items, setItems] = useState<ReasonList[]>(reasons)
  const [newLabel, setNewLabel] = useState('')

  // resync from server whenever the (memoized) reasons prop changes
  useEffect(() => { setItems(reasons) }, [reasons])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const add = useMutation({
    mutationFn: async (label: string) => {
      if (!category) throw new Error('Select a category first')
      const nextSort = items.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0) + 10
      const { error } = await createClient()
        .from('reason_lists')
        .insert({ category: category.slug, label, sort_order: nextSort, active: true })
      if (error) throw error
    },
    onSuccess: () => setNewLabel(''),
    onError: (e: Error) => toast.error(humanizeDbError(e)),
    onSettled: () => invalidateReasons(qc),
  })

  const rename = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { error } = await createClient().from('reason_lists').update({ label }).eq('id', id)
      if (error) throw error
    },
    onError: (e: Error) => toast.error(humanizeDbError(e)),
    onSettled: () => invalidateReasons(qc),
  })

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await createClient().from('reason_lists').update({ active }).eq('id', id)
      if (error) throw error
    },
    onError: (e: Error) => toast.error(humanizeDbError(e)),
    onSettled: () => invalidateReasons(qc),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await createClient()
        .from('reason_lists')
        .update({ deleted_at: new Date().toISOString(), active: false })
        .eq('id', id)
      if (error) throw error
    },
    onError: (e: Error) => toast.error(humanizeDbError(e)),
    onSettled: () => invalidateReasons(qc),
  })

  const reorder = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const supabase = createClient()
      await Promise.all(
        orderedIds.map(async (id, idx) => {
          const { error } = await supabase.from('reason_lists').update({ sort_order: (idx + 1) * 10 }).eq('id', id)
          if (error) throw error
        }),
      )
    },
    onError: (e: Error) => toast.error(humanizeDbError(e)),
    onSettled: () => invalidateReasons(qc),
  })

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(items, oldIndex, newIndex)
    setItems(next)                                  // optimistic
    reorder.mutate(next.map((i) => i.id))
  }

  // optimistic local edits (server is invalidated → resyncs via the effect above)
  const onToggle = (r: ReasonList, active: boolean) => {
    setItems((prev) => prev.map((i) => (i.id === r.id ? { ...i, active } : i)))
    toggle.mutate({ id: r.id, active })
  }
  const onRename = (r: ReasonList, label: string) => {
    setItems((prev) => prev.map((i) => (i.id === r.id ? { ...i, label } : i)))
    rename.mutate({ id: r.id, label })
  }
  const onDelete = (r: ReasonList) => {
    setItems((prev) => prev.filter((i) => i.id !== r.id))
    remove.mutate(r.id)
  }

  if (!category) {
    return (
      <div className="grid flex-1 place-items-center p-10 text-sm text-muted-foreground">
        Select a category to see its reasons.
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
      <div className="mb-3 min-w-0">
        <h3 className="truncate text-base font-semibold">{category.label}</h3>
        <p className="text-xs text-muted-foreground">
          {items.length} reason{items.length === 1 ? '' : 's'}{!category.active && ' · category inactive'}
        </p>
      </div>

      {loading ? (
        <p className="py-6 text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          No reasons yet — add the first one below.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="divide-y rounded-md border">
              {items.map((r) => (
                <SortableReasonRow key={r.id} reason={r} onToggle={onToggle} onRename={onRename} onDelete={onDelete} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); const l = newLabel.trim(); if (l) add.mutate(l) }}
        className="mt-3 flex items-center gap-2"
      >
        <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Add a reason…" className="h-9" />
        <Button type="submit" disabled={!newLabel.trim() || add.isPending}>
          <Plus className="mr-1 h-4 w-4" />Add
        </Button>
      </form>
    </div>
  )
}

// ─── one draggable reason row ───────────────────────────────────────────────────
interface SortableReasonRowProps {
  reason: ReasonList
  onToggle: (r: ReasonList, active: boolean) => void
  onRename: (r: ReasonList, label: string) => void
  onDelete: (r: ReasonList) => void
}

function SortableReasonRow({ reason, onToggle, onRename, onDelete }: SortableReasonRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: reason.id })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(reason.label)

  useEffect(() => { if (!editing) setDraft(reason.label) }, [reason.label, editing])

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : undefined,
  }

  function save() {
    const label = draft.trim()
    if (label && label !== reason.label) onRename(reason, label)
    setEditing(false)
  }

  return (
    <div ref={setNodeRef} style={style} className={cn('flex items-center gap-2 bg-card px-2 py-2', isDragging && 'rounded-md shadow-lg')}>
      <button
        type="button"
        aria-label="Drag to reorder"
        className="cursor-grab touch-none p-1 text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {editing ? (
        <div className="flex flex-1 items-center gap-1">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') { setDraft(reason.label); setEditing(false) }
            }}
            className="h-8 text-sm"
          />
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={save}>
            <Check className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setDraft(reason.label); setEditing(false) }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <span className={cn('flex-1 truncate text-sm', !reason.active && 'text-muted-foreground')}>{reason.label}</span>
          <Switch
            checked={!!reason.active}
            onCheckedChange={(v) => onToggle(reason, v)}
            aria-label={reason.active ? 'Active' : 'Inactive'}
          />
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setDraft(reason.label); setEditing(true) }}>
                <Pencil className="mr-2 h-3.5 w-3.5" />Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => { if (confirm(`Delete reason "${reason.label}"?`)) onDelete(reason) }}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  )
}

// ─── add-category dialog ────────────────────────────────────────────────────────
const categorySchema = z.object({
  slug: z.string().min(1, 'Slug is required')
    .regex(/^[a-z][a-z0-9_]*$/, 'Lowercase letters, digits, underscores; must start with a letter'),
  label: z.string().min(1, 'Label is required'),
})

interface AddCategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nextSort: number
}

function AddCategoryDialog({ open, onOpenChange, nextSort }: AddCategoryDialogProps) {
  const qc = useQueryClient()
  const form = useForm<z.infer<typeof categorySchema>>({
    resolver: zodResolver(categorySchema) as never,
    defaultValues: { slug: '', label: '' },
  })

  useEffect(() => { if (!open) form.reset({ slug: '', label: '' }) }, [open, form])

  const create = useMutation({
    mutationFn: async (v: z.infer<typeof categorySchema>) => {
      const { error } = await createClient()
        .from('reason_list_categories')
        .insert({ slug: v.slug, label: v.label, sort_order: nextSort, active: true })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Category created'); invalidateCategories(qc); onOpenChange(false) },
    onError: (e: Error) => toast.error(humanizeDbError(e)),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Add Category</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4">
            <FormField control={form.control} name="label" render={({ field }) => (
              <FormItem>
                <FormLabel>Display Label *</FormLabel>
                <FormControl><Input placeholder="e.g. Delivery Issue" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="slug" render={({ field }) => (
              <FormItem>
                <FormLabel>Slug *</FormLabel>
                <FormControl><Input placeholder="e.g. delivery_issue" {...field} /></FormControl>
                <p className="text-[11px] text-muted-foreground">Used in code; can&apos;t change after creation.</p>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

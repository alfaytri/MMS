'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Plus, Pencil, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/queryKeys'

type PaymentMethod = {
  id: string
  name: string
  slug: string
  is_active: boolean
  sort_order: number
  requires_payment_link: boolean
}

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

export function PaymentMethodsAdmin() {
  const supabase = createClient()
  const qc = useQueryClient()

  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const newSlug = slugify(newName)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const { data: methods = [], isLoading, isError } = useQuery<PaymentMethod[]>({
    queryKey: queryKeys.payments.methods,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('id, name, slug, is_active, sort_order, requires_payment_link')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('payment_methods')
        .update({ is_active })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey: queryKeys.payments.methods })
      const prev = qc.getQueryData<PaymentMethod[]>(queryKeys.payments.methods)
      qc.setQueryData<PaymentMethod[]>(queryKeys.payments.methods, (old = []) =>
        old.map((m) => (m.id === id ? { ...m, is_active } : m))
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.payments.methods, ctx.prev)
      toast.error('Failed to update payment method')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.methods })
    },
  })

  const addMutation = useMutation({
    mutationFn: async ({ name, slug }: { name: string; slug: string }) => {
      const live = qc.getQueryData<PaymentMethod[]>(queryKeys.payments.methods) ?? []
      const maxOrder = live.reduce((m, r) => Math.max(m, r.sort_order), 0)
      const { error } = await supabase
        .from('payment_methods')
        .insert({ name, slug, sort_order: maxOrder + 1 })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.methods })
      setNewName('')
      setAddOpen(false)
      toast.success('Payment method added')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to add payment method')
    },
  })

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const newSlugVal = slugify(name)
      const { error } = await supabase.rpc('rename_payment_method', {
        p_id: id,
        p_new_name: name,
        p_new_slug: newSlugVal,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.methods })
      setEditingId(null)
      toast.success('Renamed')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to rename')
    },
  })

  function handleAdd() {
    const trimmed = newName.trim()
    if (!trimmed) return
    const currentMethods = qc.getQueryData<PaymentMethod[]>(queryKeys.payments.methods) ?? []
    if (currentMethods.some((m) => m.slug === newSlug)) {
      toast.error(`A method with slug "${newSlug}" already exists`)
      return
    }
    addMutation.mutate({ name: trimmed, slug: newSlug })
  }

  function startRename(m: PaymentMethod) {
    setEditingId(m.id)
    setEditName(m.name)
  }

  function confirmRename() {
    if (!editingId || !editName.trim()) return
    const trimmed = editName.trim()
    const newSlugVal = slugify(trimmed)
    const currentMethods = qc.getQueryData<PaymentMethod[]>(queryKeys.payments.methods) ?? []
    if (currentMethods.some((m) => m.slug === newSlugVal && m.id !== editingId)) {
      toast.error(`A method with slug "${newSlugVal}" already exists`)
      return
    }
    renameMutation.mutate({ id: editingId, name: trimmed })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    return (
      <p className="py-12 text-sm text-center text-destructive">
        Failed to load payment methods. Please refresh.
      </p>
    )
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="rounded-lg border divide-y">
        {methods.map((m) => (
          <div
            key={m.id}
            className={cn(
              'group/row flex items-center justify-between px-4 py-3 gap-2',
              !m.is_active && 'opacity-40'
            )}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {editingId === m.id ? (
                <div className="flex flex-col gap-1 flex-1">
                  <div className="flex items-center gap-1.5">
                  <Input
                    className="h-7 text-sm"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmRename()
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    autoFocus
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-green-600"
                    onClick={confirmRename}
                    disabled={renameMutation.isPending}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  </div>
                  {editName && slugify(editName) !== m.slug && (
                    <p className="text-[10px] text-muted-foreground">
                      Slug: <span className="font-mono">{m.slug}</span> → <span className="font-mono">{slugify(editName)}</span>
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <span className="text-sm font-medium truncate">{m.name}</span>
                  <Badge variant="outline" className="text-[10px] font-mono shrink-0">{m.slug}</Badge>
                  {m.requires_payment_link && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">Online Link</Badge>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover/row:opacity-100 hover:opacity-100 focus:opacity-100"
                    onClick={() => startRename(m)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
            <Switch
              checked={m.is_active}
              aria-label={`Toggle ${m.name}`}
              onCheckedChange={(checked) =>
                toggleMutation.mutate({ id: m.id, is_active: checked })
              }
            />
          </div>
        ))}
        {methods.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">
            No payment methods yet.
          </p>
        )}
      </div>

      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
        <Plus className="h-4 w-4" /> Add Payment Method
      </Button>

      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setNewName('') }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-sm sm:rounded-lg">
          <DialogHeader>
            <DialogTitle>Add Payment Method</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="pm-name">Name</Label>
              <Input
                id="pm-name"
                placeholder="e.g. Cheque"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              />
              {newName && (
                <p className="text-xs text-muted-foreground">
                  Slug: <span className="font-mono">{newSlug}</span>
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setNewName('') }}>Cancel</Button>
            <Button
              onClick={handleAdd}
              disabled={!newName.trim() || addMutation.isPending}
            >
              {addMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Plus className="h-3.5 w-3.5" />}
              Add Method
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

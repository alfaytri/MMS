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
import { Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

type PaymentMethod = {
  id: string
  name: string
  slug: string
  is_active: boolean
  sort_order: number
}

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

export function PaymentMethodsAdmin() {
  const supabase = createClient()
  const qc = useQueryClient()

  const [newName, setNewName] = useState('')
  const newSlug = slugify(newName)

  const { data: methods = [], isLoading, isError } = useQuery<PaymentMethod[]>({
    queryKey: ['payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('id, name, slug, is_active, sort_order')
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
      await qc.cancelQueries({ queryKey: ['payment_methods'] })
      const prev = qc.getQueryData<PaymentMethod[]>(['payment_methods'])
      qc.setQueryData<PaymentMethod[]>(['payment_methods'], (old = []) =>
        old.map((m) => (m.id === id ? { ...m, is_active } : m))
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['payment_methods'], ctx.prev)
      toast.error('Failed to update payment method')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment_methods'] })
    },
  })

  const addMutation = useMutation({
    mutationFn: async ({ name, slug }: { name: string; slug: string }) => {
      const live = qc.getQueryData<PaymentMethod[]>(['payment_methods']) ?? []
      const maxOrder = live.reduce((m, r) => Math.max(m, r.sort_order), 0)
      const { error } = await supabase
        .from('payment_methods')
        .insert({ name, slug, sort_order: maxOrder + 1 })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment_methods'] })
      setNewName('')
      toast.success('Payment method added')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to add payment method')
    },
  })

  function handleAdd() {
    const trimmed = newName.trim()
    if (!trimmed) return
    const currentMethods = qc.getQueryData<PaymentMethod[]>(['payment_methods']) ?? []
    if (currentMethods.some((m) => m.slug === newSlug)) {
      toast.error(`A method with slug "${newSlug}" already exists`)
      return
    }
    addMutation.mutate({ name: trimmed, slug: newSlug })
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
    <div className="space-y-6 max-w-lg">
      {/* List */}
      <div className="rounded-lg border divide-y">
        {methods.map((m) => (
          <div
            key={m.id}
            className={cn(
              'flex items-center justify-between px-4 py-3',
              !m.is_active && 'opacity-40'
            )}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{m.name}</span>
              <Badge variant="outline" className="text-[10px] font-mono">{m.slug}</Badge>
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

      {/* Add form */}
      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-sm font-semibold">Add Payment Method</p>
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
        <Button
          size="sm"
          className="gap-1.5"
          onClick={handleAdd}
          disabled={!newName.trim() || addMutation.isPending}
        >
          {addMutation.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Plus className="h-3.5 w-3.5" />}
          Add Method
        </Button>
      </div>
    </div>
  )
}

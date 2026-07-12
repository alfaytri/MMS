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
import { Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/queryKeys'

type CountryCodeRow = {
  id: number
  code: string
  iso: string
  flag: string
  name: string
  is_active: boolean
  sort_order: number
}

function normaliseCode(input: string) {
  const trimmed = input.trim().replace(/[^0-9+]/g, '')
  if (!trimmed) return ''
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`
}

export function CountryCodesAdmin() {
  const supabase = createClient()
  const qc = useQueryClient()

  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newIso, setNewIso] = useState('')
  const [newFlag, setNewFlag] = useState('')

  const adminKey = ['country-codes', 'admin'] as const

  const { data: rows = [], isLoading, isError } = useQuery<CountryCodeRow[]>({
    queryKey: adminKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('country_codes')
        .select('id, code, iso, flag, name, is_active, sort_order')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as CountryCodeRow[]
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      const { error } = await supabase
        .from('country_codes')
        .update({ is_active })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey: adminKey })
      const prev = qc.getQueryData<CountryCodeRow[]>(adminKey)
      qc.setQueryData<CountryCodeRow[]>(adminKey, (old = []) =>
        old.map((r) => (r.id === id ? { ...r, is_active } : r)),
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(adminKey, ctx.prev)
      toast.error('Failed to update country code')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: adminKey })
      qc.invalidateQueries({ queryKey: queryKeys.countryCodes.all })
    },
  })

  const addMutation = useMutation({
    mutationFn: async (values: { code: string; iso: string; flag: string; name: string }) => {
      const existing = qc.getQueryData<CountryCodeRow[]>(adminKey) ?? []
      const maxOrder = existing.reduce((m, r) => Math.max(m, r.sort_order), 0)
      const { error } = await supabase
        .from('country_codes')
        .insert({ ...values, sort_order: maxOrder + 1 })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKey })
      qc.invalidateQueries({ queryKey: queryKeys.countryCodes.all })
      resetForm()
      setAddOpen(false)
      toast.success('Country code added')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to add country code')
    },
  })

  function resetForm() {
    setNewName('')
    setNewCode('')
    setNewIso('')
    setNewFlag('')
  }

  function handleAdd() {
    const name = newName.trim()
    const code = normaliseCode(newCode)
    const iso = newIso.trim().toUpperCase()
    const flag = newFlag.trim()

    if (!name || !code || !iso || !flag) {
      toast.error('All fields are required')
      return
    }
    if (iso.length !== 2) {
      toast.error('ISO must be 2 letters (e.g. QA)')
      return
    }
    if (rows.some((r) => r.code === code)) {
      toast.error(`Country code "${code}" already exists`)
      return
    }

    addMutation.mutate({ code, iso, flag, name })
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
        Failed to load country codes. Please refresh.
      </p>
    )
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Country Codes</h2>
        <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Country
        </Button>
      </div>

      <div className="rounded-lg border divide-y">
        {rows.map((r) => (
          <div
            key={r.id}
            className={cn(
              'flex items-center justify-between px-4 py-3',
              !r.is_active && 'opacity-40',
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-lg leading-none shrink-0">{r.flag}</span>
              <span className="text-sm font-medium truncate">{r.name}</span>
              <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                {r.code}
              </Badge>
              <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                {r.iso}
              </Badge>
            </div>
            <Switch
              checked={r.is_active}
              aria-label={`Toggle ${r.name}`}
              onCheckedChange={(checked) =>
                toggleMutation.mutate({ id: r.id, is_active: checked })
              }
            />
          </div>
        ))}
        {rows.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">
            No country codes yet.
          </p>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm() }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-sm sm:rounded-lg">
          <DialogHeader>
            <DialogTitle>Add Country Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cc-name">Name</Label>
              <Input
                id="cc-name"
                placeholder="e.g. Turkey"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cc-code">Dial Code</Label>
                <Input
                  id="cc-code"
                  placeholder="+90"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cc-iso">ISO</Label>
                <Input
                  id="cc-iso"
                  placeholder="TR"
                  maxLength={2}
                  value={newIso}
                  onChange={(e) => setNewIso(e.target.value.toUpperCase())}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cc-flag">Flag emoji</Label>
              <Input
                id="cc-flag"
                placeholder="🇹🇷"
                maxLength={4}
                value={newFlag}
                onChange={(e) => setNewFlag(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); resetForm() }}>Cancel</Button>
            <Button
              onClick={handleAdd}
              disabled={
                !newName.trim() ||
                !newCode.trim() ||
                !newIso.trim() ||
                !newFlag.trim() ||
                addMutation.isPending
              }
            >
              {addMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add Country
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

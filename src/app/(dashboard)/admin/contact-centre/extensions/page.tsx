'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Row {
  id:                string
  full_name:         string | null
  email:             string | null
  threecx_extension: string | null
}

export default function ExtensionsPage() {
  const [rows, setRows]       = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [edits, setEdits]     = useState<Record<string, string>>({})
  const [saving, setSaving]   = useState<Record<string, boolean>>({})

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('id, full_name, email, threecx_extension')
      .order('full_name', { ascending: true })
      .then(({ data, error }) => {
        if (error) { toast.error(error.message); setLoading(false); return }
        setRows((data ?? []) as Row[])
        setLoading(false)
      })
  }, [])

  async function save(rowId: string) {
    const raw = edits[rowId] ?? ''
    const next = raw.trim() === '' ? null : raw.trim()
    if (next !== null && !/^\d{2,8}$/.test(next)) {
      toast.error('Extension must be 2-8 digits')
      return
    }
    setSaving((s) => ({ ...s, [rowId]: true }))
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ threecx_extension: next })
      .eq('id', rowId)
    setSaving((s) => ({ ...s, [rowId]: false }))
    if (error) {
      if (/duplicate|unique/i.test(error.message)) toast.error('That extension is already assigned to another user')
      else toast.error(error.message)
      return
    }
    setRows((rs) => rs.map((r) => r.id === rowId ? { ...r, threecx_extension: next } : r))
    setEdits((e) => { const { [rowId]: _unused, ...rest } = e; return rest })
    toast.success('Saved')
  }

  if (loading) return <div className="p-6">Loading…</div>

  return (
    <div className="p-6 w-full max-w-3xl">
      <h1 className="text-xl font-semibold mb-1">3CX Extension Assignment</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Map MMS users to their 3CX extension number. Click-to-call and the dial pad use this mapping
        to know which softphone to ring first.
      </p>

      <div className="border rounded-md divide-y">
        <div className="grid grid-cols-12 gap-3 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
          <div className="col-span-5">User</div>
          <div className="col-span-4">Email</div>
          <div className="col-span-2">Extension</div>
          <div className="col-span-1 text-right"></div>
        </div>

        {rows.map((r) => {
          const editing  = edits[r.id] !== undefined
          const editVal  = editing ? edits[r.id] : (r.threecx_extension ?? '')
          const isSaving = !!saving[r.id]
          const dirty    = editing && editVal !== (r.threecx_extension ?? '')
          return (
            <div key={r.id} className="grid grid-cols-12 gap-3 px-3 py-2 items-center min-h-11">
              <div className="col-span-5 truncate">{r.full_name ?? '—'}</div>
              <div className="col-span-4 truncate text-xs text-muted-foreground">{r.email ?? '—'}</div>
              <div className="col-span-2">
                <Input
                  value={editVal}
                  onChange={(e) => setEdits((s) => ({ ...s, [r.id]: e.target.value }))}
                  placeholder="—"
                  inputMode="numeric"
                  className="h-8"
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <Button
                  size="sm"
                  variant={dirty ? 'default' : 'ghost'}
                  disabled={!dirty || isSaving}
                  onClick={() => save(r.id)}
                >
                  {isSaving ? '…' : 'Save'}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

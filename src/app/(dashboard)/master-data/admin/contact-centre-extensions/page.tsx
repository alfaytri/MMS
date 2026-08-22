'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Search, Headphones, Phone, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { DesktopOnlyGate } from '@/components/shared/DesktopOnlyGate'

interface Row {
  id:                          string
  full_name:                   string | null
  email:                       string | null
  threecx_extension:           string | null
  has_contact_centre_access:   boolean
}

interface Draft {
  extension?: string
  access?:    boolean
}

function initialsOf(name: string | null, email: string | null): string {
  const source = (name ?? email ?? '').trim()
  if (!source) return '?'
  const parts = source.split(/[\s.@_-]+/).filter(Boolean)
  const first = parts[0]?.[0] ?? source[0]
  const second = parts[1]?.[0] ?? ''
  return (first + second).toUpperCase()
}

export default function ContactCentreExtensionsPage() {
  const [rows, setRows]     = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery]   = useState('')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('user_data')
      .select('id, full_name, email, threecx_extension, has_contact_centre_access')
      .order('full_name', { ascending: true })
      .then(({ data, error }) => {
        if (error) { toast.error(error.message); setLoading(false); return }
        setRows((data ?? []) as Row[])
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      (r.full_name ?? '').toLowerCase().includes(q) ||
      (r.email ?? '').toLowerCase().includes(q) ||
      (r.threecx_extension ?? '').includes(q)
    )
  }, [rows, query])

  const stats = useMemo(() => ({
    total: rows.length,
    withAccess: rows.filter((r) => r.has_contact_centre_access).length,
    withExtension: rows.filter((r) => !!r.threecx_extension).length,
  }), [rows])

  function patchDraft(rowId: string, patch: Draft) {
    setDrafts((d) => ({ ...d, [rowId]: { ...d[rowId], ...patch } }))
  }

  function dropDraft(rowId: string) {
    setDrafts((d) => { const { [rowId]: _drop, ...rest } = d; return rest })
  }

  async function save(rowId: string) {
    const row = rows.find((r) => r.id === rowId)
    if (!row) return
    const draft = drafts[rowId] ?? {}
    const nextExt = (draft.extension ?? row.threecx_extension ?? '').trim()
    const nextAccess = draft.access ?? row.has_contact_centre_access

    if (nextExt !== '' && !/^\d{2,8}$/.test(nextExt)) {
      toast.error('Extension must be 2-8 digits')
      return
    }

    setSaving((s) => ({ ...s, [rowId]: true }))
    const supabase = createClient()
    const { error } = await supabase
      .from('user_data')
      .update({
        threecx_extension: nextExt === '' ? null : nextExt,
        has_contact_centre_access: nextAccess,
      })
      .eq('id', rowId)
    setSaving((s) => ({ ...s, [rowId]: false }))

    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        toast.error('That extension is already assigned to another user')
      } else {
        toast.error(error.message)
      }
      return
    }

    setRows((rs) => rs.map((r) => r.id === rowId ? {
      ...r,
      threecx_extension: nextExt === '' ? null : nextExt,
      has_contact_centre_access: nextAccess,
    } : r))
    dropDraft(rowId)
    toast.success('Saved')
  }

  if (loading) {
    return (
      <DesktopOnlyGate>
        <div className="p-6 text-sm text-muted-foreground">Loading users…</div>
      </DesktopOnlyGate>
    )
  }

  return (
    <DesktopOnlyGate>
      <div className="w-full max-w-4xl mx-auto pb-12">
        {/* Header */}
        <div className="flex flex-col gap-1 mb-5">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10">
              <Headphones className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Contact Centre Extensions</h1>
              <p className="text-xs text-muted-foreground">
                Manage Contact Centre access and 3CX extension assignment for every user.
              </p>
            </div>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatTile label="Total users" value={stats.total} />
          <StatTile label="With CC access" value={stats.withAccess} accent="primary" />
          <StatTile label="With extension" value={stats.withExtension} accent="emerald" />
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, or extension…"
            className="pl-8 h-9"
          />
        </div>

        {/* User list */}
        <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {query ? 'No users match this search.' : 'No users found.'}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((r) => {
                const draft       = drafts[r.id] ?? {}
                const editExt     = draft.extension ?? (r.threecx_extension ?? '')
                const editAccess  = draft.access ?? r.has_contact_centre_access
                const dirty =
                  editExt !== (r.threecx_extension ?? '') ||
                  editAccess !== r.has_contact_centre_access
                const isSaving = !!saving[r.id]

                return (
                  <li key={r.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                    {/* Avatar */}
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-primary text-xs font-semibold flex-shrink-0 ring-1 ring-primary/10">
                      {initialsOf(r.full_name, r.email)}
                    </div>

                    {/* Name + email */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{r.full_name ?? '—'}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{r.email ?? '—'}</div>
                    </div>

                    {/* Access toggle */}
                    <label className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={editAccess}
                        onCheckedChange={(v) => patchDraft(r.id, { access: v })}
                        aria-label="Contact Centre access"
                      />
                      <span className="text-[11px] text-muted-foreground hidden sm:inline">Access</span>
                    </label>

                    {/* Extension input */}
                    <div className="relative flex-shrink-0">
                      <Phone className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                      <Input
                        value={editExt}
                        onChange={(e) => patchDraft(r.id, { extension: e.target.value })}
                        placeholder="—"
                        inputMode="numeric"
                        maxLength={8}
                        className="h-8 w-28 pl-7 text-xs font-mono tabular-nums"
                        disabled={!editAccess}
                      />
                    </div>

                    {/* Save / cancel */}
                    <div className="flex items-center gap-1 flex-shrink-0 w-16 justify-end">
                      {dirty && !isSaving && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => dropDraft(r.id)}
                            title="Discard"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => save(r.id)}
                            title="Save"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {isSaving && (
                        <div className="h-7 w-7 flex items-center justify-center text-xs text-muted-foreground">…</div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </DesktopOnlyGate>
  )
}

function StatTile({ label, value, accent }: { label: string; value: number; accent?: 'primary' | 'emerald' }) {
  const accentClass =
    accent === 'primary' ? 'text-primary'  :
    accent === 'emerald' ? 'text-emerald-600' :
    'text-foreground'
  return (
    <div className="rounded-xl border bg-card px-4 py-2.5 shadow-sm">
      <div className={`text-2xl font-semibold tabular-nums leading-tight ${accentClass}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  )
}

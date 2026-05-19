'use client'

import { useState } from 'react'
import { User, Phone, AlertTriangle, Edit2, Plus, Trash2, Lock, MapPin, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { tryNormalisePhone } from '@/lib/contact-center/normalise-phone'
import type { useCustomerData, ServiceCustomerAddress } from '@/hooks/contact-center/useCustomerData'

type CustomerDataReturn = ReturnType<typeof useCustomerData>

function formatAddress(a: ServiceCustomerAddress): string {
  if (a.address_type === 'blue-plate') {
    const parts = [
      a.zone     && `Zone ${a.zone}`,
      a.street   && `St ${a.street}`,
      a.building && `Bldg ${a.building}`,
      a.unit     && `Unit ${a.unit}`,
    ].filter(Boolean)
    return parts.length ? parts.join(', ') : a.label ?? 'No details'
  }
  if (a.lat != null && a.lng != null) return `${a.lat}, ${a.lng}`
  return a.label ?? 'GPS address'
}

interface Props {
  customerData: CustomerDataReturn
  onCustomerResolved?: (customerId: string, customerName: string, primaryPhone: string) => void
  pendingPhone?: string | null
}

export function CrmSection({ customerData, onCustomerResolved, pendingPhone }: Props) {
  const {
    customer, customerLoading, phones, addresses, crmMode, setCrmMode,
    unknownStep, setUnknownStep,
    updateCustomer, addPhone, removePhone, blockCustomer, unblockCustomer, searchByPhone,
  } = customerData

  const [editName, setEditName]       = useState('')
  const [editType, setEditType]       = useState<'individual' | 'business'>('individual')
  const [newPhone, setNewPhone]       = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [blockNotes, setBlockNotes]   = useState('')

  const [attachSearch, setAttachSearch] = useState(pendingPhone ?? '')
  const [createName, setCreateName]     = useState('')
  const [createPhone, setCreatePhone]   = useState(pendingPhone ?? '')

  function enterEdit() {
    setEditName(customer?.name ?? '')
    setEditType(customer?.customer_type ?? 'individual')
    setCrmMode('edit')
  }

  async function saveEdit() {
    try {
      await updateCustomer.mutateAsync({ name: editName.trim(), customer_type: editType })
      setCrmMode('view')
      toast.success('Customer updated')
    } catch {
      toast.error('Failed to update customer')
    }
  }

  async function handleAddPhone() {
    const canonical = tryNormalisePhone(newPhone)
    if (!canonical) { toast.error('Invalid phone number'); return }
    try {
      await addPhone.mutateAsync({ phone: canonical })
      setNewPhone('')
      toast.success('Phone added')
    } catch {
      toast.error('Failed to add phone')
    }
  }

  async function handleBlock() {
    if (!blockReason.trim()) { toast.error('Reason is required'); return }
    try {
      await blockCustomer.mutateAsync({ reason: blockReason.trim(), notes: blockNotes.trim() || undefined })
      setBlockReason('')
      setBlockNotes('')
      toast.success('Customer blocked')
    } catch {
      toast.error('Failed to block customer')
    }
  }

  async function handleUnblock() {
    try {
      await unblockCustomer.mutateAsync()
      toast.success('Customer unblocked')
    } catch {
      toast.error('Failed to unblock customer')
    }
  }

  async function handleAttach() {
    const result = await searchByPhone(attachSearch)
    if (result?.customer_id) {
      onCustomerResolved?.(result.customer_id, result.service_customers?.name ?? 'Unknown', attachSearch)
    } else {
      toast.error('No customer found with that phone')
    }
  }

  async function handleCreate() {
    if (!createName.trim() || !createPhone.trim()) {
      toast.error('Name and phone are required')
      return
    }
    const canonical = tryNormalisePhone(createPhone)
    if (!canonical) { toast.error('Invalid phone number'); return }
    const supabase = (await import('@/lib/supabase/client')).createClient()
    try {
      const { data, error } = await (supabase as any).rpc('create_service_customer', {
        p_name: createName.trim(), p_phone: canonical, p_link_phone: null,
      })
      if (error) throw error
      onCustomerResolved?.(data.customer_id, data.customer_name, canonical)
      toast.success('Customer created')
    } catch {
      toast.error('Failed to create customer')
    }
  }

  // ── Unknown caller view ────────────────────────────────────────────────────
  // Also shown when there's simply no linked customer (no need to set crmMode
  // explicitly — the !customer path falls through here automatically).
  if (crmMode === 'unknown' || (!customerLoading && !customer)) {
    return (
      <div className="px-3 py-2 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Unknown Caller</p>

        {unknownStep === 'prompt' && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={() => setUnknownStep('attach')}>
              Attach to existing
            </Button>
            <Button size="sm" className="flex-1 text-xs h-8" onClick={() => setUnknownStep('create')}>
              Create new
            </Button>
          </div>
        )}

        {unknownStep === 'attach' && (
          <div className="space-y-2">
            <Label className="text-xs">Search by phone</Label>
            <div className="flex gap-1.5">
              <Input
                value={attachSearch}
                onChange={(e) => setAttachSearch(e.target.value)}
                placeholder="+974XXXXXXXX"
                className="h-8 text-xs"
              />
              <Button size="sm" className="h-8 text-xs" onClick={handleAttach}>Find</Button>
            </div>
            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setUnknownStep('prompt')}>Back</Button>
          </div>
        )}

        {unknownStep === 'create' && (
          <div className="space-y-2">
            <Label className="text-xs">Name</Label>
            <Input value={createName} onChange={(e) => setCreateName(e.target.value)} className="h-8 text-xs" placeholder="Full name" />
            <Label className="text-xs">Phone</Label>
            <Input value={createPhone} onChange={(e) => setCreatePhone(e.target.value)} className="h-8 text-xs font-mono" placeholder="+974XXXXXXXX" />
            <div className="flex gap-1.5">
              <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleCreate}>Create</Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setUnknownStep('prompt')}>Back</Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (customerLoading) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
  }


  // ── View mode ──────────────────────────────────────────────────────────────
  if (crmMode === 'view') {
    if (!customer) return null
    return (
      <div className="px-3 py-2 space-y-2 overscroll-contain">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium truncate">{customer.name}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Badge variant="outline" className="text-xs uppercase">
              {customer.customer_type === 'business' ? 'BIZ' : 'IND'}
            </Badge>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={enterEdit}>
              <Edit2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {customer.is_blocked && (
          <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 border border-destructive/30 px-2 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
            <span className="text-xs text-destructive flex-1">Blocked</span>
            <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive hover:text-destructive" onClick={handleUnblock}>
              Unblock
            </Button>
          </div>
        )}

        {customer.pending_payment_amount > 0 && (
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
            Pending: QAR {customer.pending_payment_amount.toFixed(2)}
          </Badge>
        )}

        <div className="space-y-1">
          {phones.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5 text-xs">
              <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="font-mono">{p.phone}</span>
              {p.is_primary && <Badge variant="secondary" className="text-xs py-0 px-1">primary</Badge>}
              {p.label && <span className="text-muted-foreground">{p.label}</span>}
            </div>
          ))}
        </div>

        {(() => {
          const normWatiPhone = tryNormalisePhone(pendingPhone ?? '')
          const activePhoneId = normWatiPhone
            ? phones.find((p) => p.phone === normWatiPhone)?.id ?? null
            : null
          return (
            <>
              {addresses.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-border/50">
                  {addresses.map((a) => {
                    const isLinked = a.phone_id != null && a.phone_id === activePhoneId
                    const googleMapsUrl =
                      a.lat != null && a.lng != null
                        ? `https://maps.google.com/?q=${a.lat},${a.lng}`
                        : null

                    return (
                      <div
                        key={a.id}
                        className={`flex items-start gap-1.5 text-xs rounded px-1.5 py-1 ${
                          isLinked ? 'bg-primary/10 border border-primary/20' : ''
                        }`}
                      >
                        <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 flex-wrap">
                            {a.label && (
                              <span className="font-medium">{a.label}</span>
                            )}
                            <Badge variant="outline" className="text-[9px] py-0 px-1">
                              {a.address_type === 'blue-plate' ? 'Blue Plate' : 'GPS'}
                            </Badge>
                            {a.is_primary && (
                              <Badge variant="secondary" className="text-[9px] py-0 px-1">primary</Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground truncate">{formatAddress(a)}</p>
                          <div className="flex gap-2 mt-0.5">
                            {googleMapsUrl && (
                              <a
                                href={googleMapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-primary hover:underline"
                              >
                                <ExternalLink className="h-2.5 w-2.5" /> Maps
                              </a>
                            )}
                            {a.waze_link && (
                              <a
                                href={a.waze_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-primary hover:underline"
                              >
                                <ExternalLink className="h-2.5 w-2.5" /> Waze
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {addresses.length === 0 && (
                <p className="text-xs text-muted-foreground pl-0.5 pt-1 border-t border-border/50">No addresses saved</p>
              )}
            </>
          )
        })()}
      </div>
    )
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────
  return (
    <div className="px-3 py-2 space-y-3 overscroll-contain">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Edit Customer</p>

      <div className="space-y-1">
        <Label className="text-xs">Name</Label>
        <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-xs" />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Type</Label>
        <Select value={editType} onValueChange={(v) => setEditType(v as 'individual' | 'business')}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="individual">Individual</SelectItem>
            <SelectItem value="business">Business</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Phones</Label>
        {phones.map((p) => (
          <div key={p.id} className="flex items-center gap-1.5">
            <span className="text-xs font-mono flex-1">{p.phone}</span>
            {!p.is_primary && (
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removePhone.mutate(p.id)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            )}
          </div>
        ))}
        <div className="flex gap-1.5">
          <Input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="+974XXXXXXXX"
            className="h-7 text-xs font-mono"
          />
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleAddPhone}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="space-y-1 border-t pt-2">
        <p className="text-xs font-medium text-destructive flex items-center gap-1">
          <Lock className="h-3 w-3" /> Block Customer
        </p>
        <Input
          value={blockReason}
          onChange={(e) => setBlockReason(e.target.value)}
          placeholder="Reason (required)"
          className="h-7 text-xs"
        />
        <Textarea
          value={blockNotes}
          onChange={(e) => setBlockNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="text-xs min-h-[48px] resize-none"
        />
        <Button size="sm" variant="destructive" className="h-7 text-xs w-full" onClick={handleBlock} disabled={!blockReason.trim()}>
          <Lock className="h-3 w-3 mr-1" /> Block
        </Button>
      </div>

      <div className="flex gap-1.5">
        <Button size="sm" className="flex-1 h-8 text-xs" onClick={saveEdit} disabled={updateCustomer.isPending}>
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setCrmMode('view')}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

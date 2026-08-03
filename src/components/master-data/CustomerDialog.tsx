'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Upload, FileCheck2, X, Lock, Plus, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { compressImageBeforeUpload } from '@/lib/compressImage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { PhoneInputWithCode, splitPhone } from '@/components/shared/PhoneInputWithCode'
import { useHasPermission } from '@/hooks/usePermissions'
import { useCreateCustomer, useUpdateCustomer, useToggleCustomerActive, type Customer } from '@/hooks/useSaleOrders'
import { useSubmitCreditGroupChange } from '@/hooks/useCreditGroupApprovals'
import { cn } from '@/lib/utils'

const BUCKET = 'customer-credit-docs'

type UploadedDoc = { path: string; name: string }
type Slot = 'cr' | 'establishment' | 'signed'

type GroupOption = { id: string; name: string; credit_limit?: number }

type PhoneRow = { key: string; countryCode: string; digits: string; is_primary: boolean }

interface CustomerDialogProps {
  mode:         'create' | 'edit'
  open:         boolean
  onOpenChange: (open: boolean) => void
  groups:       GroupOption[]
  customer?:    Customer | null
  onCreated?:   (customer: { id: string; name: string; credit_group_id: string | null }) => void
}

function displayNameFromPath(path: string, slot: Slot): string {
  const filename = path.split('/').pop() ?? path
  return filename.replace(new RegExp(`^\\d+-${slot}-`), '')
}

function newPhoneRow(is_primary: boolean): PhoneRow {
  return { key: `phone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, countryCode: '+974', digits: '', is_primary }
}

function seedPhoneRows(source: Customer['phones'] | null | undefined): PhoneRow[] {
  const rows = (source ?? []).map((p) => {
    const split = splitPhone(p.phone)
    return { key: `phone-${p.phone}`, countryCode: split.code, digits: split.digits, is_primary: p.is_primary }
  })
  if (rows.length === 0) return [newPhoneRow(true)]
  if (!rows.some((r) => r.is_primary)) rows[0].is_primary = true
  return rows
}

export function CustomerDialog({
  mode, open, onOpenChange, groups, customer, onCreated,
}: CustomerDialogProps) {
  const isEdit = mode === 'edit'
  const canChangeType        = useHasPermission('master_data.customers.change_type')
  const canChangeCreditGroup = useHasPermission('master_data.customers.change_credit_group')

  const [name, setName]                 = useState('')
  const [phones, setPhones]             = useState<PhoneRow[]>([newPhoneRow(true)])
  const [email, setEmail]               = useState('')
  const [customerType, setCustomerType] = useState<'cash' | 'credit'>('credit')
  const [entityType, setEntityType]     = useState<'individual' | 'business'>('individual')
  const [groupId, setGroupId]           = useState('')
  const [crDoc, setCrDoc]                       = useState<UploadedDoc | null>(null)
  const [establishmentIdDoc, setEstablishmentIdDoc] = useState<UploadedDoc | null>(null)
  const [signedFormDoc, setSignedFormDoc]       = useState<UploadedDoc | null>(null)
  const [uploading, setUploading]       = useState<Slot | null>(null)

  const createCustomer      = useCreateCustomer()
  const updateCustomer      = useUpdateCustomer()
  const toggleActive        = useToggleCustomerActive()
  const submitGroupChange   = useSubmitCreditGroupChange()
  const submitting = createCustomer.isPending || updateCustomer.isPending || submitGroupChange.isPending

  useEffect(() => {
    if (!open) return
    if (isEdit && customer) {
      setName(customer.name ?? '')
      setPhones(seedPhoneRows(customer.phones))
      setEmail(customer.email ?? '')
      // customer_type is derived from credit_group_id (column dropped 2026-07-24).
      setCustomerType(customer.credit_group_id ? 'credit' : 'cash')
      setEntityType((customer.entity_type as 'individual' | 'business') ?? 'individual')
      setGroupId(customer.credit_group_id ?? '')
      setCrDoc(customer.cr_url ? { path: customer.cr_url, name: displayNameFromPath(customer.cr_url, 'cr') } : null)
      setEstablishmentIdDoc(customer.establishment_id_url
        ? { path: customer.establishment_id_url, name: displayNameFromPath(customer.establishment_id_url, 'establishment') }
        : null)
      setSignedFormDoc(customer.signed_credit_form_url
        ? { path: customer.signed_credit_form_url, name: displayNameFromPath(customer.signed_credit_form_url, 'signed') }
        : null)
    } else if (!isEdit) {
      setName(''); setPhones([newPhoneRow(true)]); setEmail('')
      // New customers default to cash — a credit group must be picked to promote.
      setCustomerType('cash'); setEntityType('individual'); setGroupId('')
      setCrDoc(null); setEstablishmentIdDoc(null); setSignedFormDoc(null)
    }
    setUploading(null)
  }, [open, isEdit, customer])

  const selectedGroup    = groups.find((g) => g.id === groupId) ?? null
  const docsRequired     = customerType === 'credit' && !!groupId
  const businessDocsReq  = docsRequired && entityType === 'business'

  const isCashToCredit       = isEdit && !customer?.credit_group_id && customerType === 'credit'
  const isIndividualToBusiness = isEdit && customer?.entity_type === 'individual' && entityType === 'business'

  function updatePhone(key: string, patch: Partial<PhoneRow>) {
    setPhones((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  }

  function addPhone() {
    setPhones((prev) => [...prev, newPhoneRow(false)])
  }

  function removePhone(key: string) {
    setPhones((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((p) => p.key !== key)
      if (!next.some((p) => p.is_primary)) next[0].is_primary = true
      return next
    })
  }

  function setPrimary(key: string) {
    setPhones((prev) => prev.map((p) => ({ ...p, is_primary: p.key === key })))
  }

  async function uploadDoc(file: File, slot: Slot): Promise<UploadedDoc | null> {
    const supabase = createClient()
    setUploading(slot)
    try {
      // Credit-doc scans are often phone photos — compress images before
      // upload. CR / ID scans typically arrive as PDFs and pass through.
      const toUpload = await compressImageBeforeUpload(file)
      const sanitized = toUpload.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const folder = customer?.id ?? 'pending'
      const path = `${folder}/${Date.now()}-${slot}-${sanitized}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, toUpload)
      if (error) throw error
      return { path, name: file.name }
    } catch (err) {
      toast.error(`Upload failed: ${(err as Error).message}`)
      return null
    } finally {
      setUploading(null)
    }
  }

  async function removeDoc(doc: UploadedDoc | null, slot: Slot) {
    if (!doc) return
    if (doc.path.startsWith('pending/')) {
      const supabase = createClient()
      await supabase.storage.from(BUCKET).remove([doc.path])
    }
    if (slot === 'cr') setCrDoc(null)
    else if (slot === 'establishment') setEstablishmentIdDoc(null)
    else setSignedFormDoc(null)
  }

  function buildPhonesPayload(): { phone: string; is_primary: boolean }[] | null {
    const cleaned = phones
      .map((p) => ({ phone: `${p.countryCode}${p.digits.trim()}`, is_primary: p.is_primary, digits: p.digits.trim() }))
      .filter((p) => p.digits.length > 0)
    if (cleaned.length === 0) {
      toast.error('At least one phone number is required')
      return null
    }
    const primaryCount = cleaned.filter((p) => p.is_primary).length
    if (primaryCount !== 1) {
      toast.error('Exactly one phone must be marked primary')
      return null
    }
    const seen = new Set<string>()
    for (const p of cleaned) {
      if (seen.has(p.phone)) {
        toast.error(`Duplicate phone: ${p.phone}`)
        return null
      }
      seen.add(p.phone)
    }
    return cleaned.map((p) => ({ phone: p.phone, is_primary: p.is_primary }))
  }

  function handleSubmit() {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    const phonesPayload = buildPhonesPayload()
    if (!phonesPayload) return

    if (customerType === 'credit' && !groupId) {
      toast.error('Select a credit group for credit customers')
      return
    }
    if (docsRequired && !signedFormDoc) {
      toast.error('Signed credit form is required for credit customers')
      return
    }
    if (businessDocsReq && (!crDoc || !establishmentIdDoc)) {
      toast.error('CR and Establishment ID are required for business customers')
      return
    }
    if (isCashToCredit && signedFormDoc?.path === customer?.signed_credit_form_url) {
      toast.error('Promotion to Credit requires a freshly signed credit form upload')
      return
    }
    if (isIndividualToBusiness) {
      if (!crDoc || crDoc.path === customer?.cr_url) {
        toast.error('Promotion to Business requires a fresh CR upload')
        return
      }
      if (!establishmentIdDoc || establishmentIdDoc.path === customer?.establishment_id_url) {
        toast.error('Promotion to Business requires a fresh Establishment ID upload')
        return
      }
    }

    const newGroupNeedsApproval =
      customerType === 'credit'
      && !!selectedGroup
      && (selectedGroup.credit_limit ?? 0) > 0

    if (isEdit && customer) {
      const groupIsChanging = (customer.credit_group_id ?? null) !== (groupId || null)
      const routeGroupViaApproval = groupIsChanging && newGroupNeedsApproval

      updateCustomer.mutate(
        {
          id: customer.id,
          patch: {
            name:                   name.trim(),
            phones:                 phonesPayload,
            email:                  email.trim() || null,
            entity_type:            entityType,
            // customer_type is derived server-side from credit_group_id.
            // routeGroupViaApproval keeps the current group until approval
            // lands; otherwise clear it when saving as cash.
            credit_group_id:        routeGroupViaApproval
              ? (customer.credit_group_id ?? null)
              : (customerType === 'credit' ? groupId : null),
            cr_url:                 docsRequired ? crDoc?.path              ?? null : null,
            establishment_id_url:   docsRequired ? establishmentIdDoc?.path ?? null : null,
            signed_credit_form_url: docsRequired ? signedFormDoc?.path      ?? null : null,
          },
          previous: {
            name:                   customer.name,
            phones:                 customer.phones ?? [],
            email:                  customer.email,
            entity_type:            customer.entity_type,
            credit_group_id:        customer.credit_group_id,
            credit_group_name:      customer.credit_group_name ?? null,
            cr_url:                 customer.cr_url                 ?? null,
            establishment_id_url:   customer.establishment_id_url   ?? null,
            signed_credit_form_url: customer.signed_credit_form_url ?? null,
          },
          new_credit_group_name: selectedGroup?.name ?? null,
        },
        {
          onSuccess: () => {
            if (!routeGroupViaApproval) {
              toast.success('Customer updated')
              onOpenChange(false)
              return
            }
            submitGroupChange.mutate(
              { customerId: customer.id, groupId },
              {
                onSuccess: (data) => {
                  if (data.status === 'approved') {
                    toast.success(`Customer updated; assigned to ${selectedGroup?.name} (no approval needed)`)
                  } else {
                    toast.success(`Customer updated; credit group sent for approval`)
                  }
                  onOpenChange(false)
                },
                onError: (err) => {
                  toast.error(`Saved, but credit group not sent: ${err.message}`)
                  onOpenChange(false)
                },
              },
            )
          },
          onError: (err) => toast.error(err.message),
        }
      )
      return
    }

    createCustomer.mutate(
      {
        name:                   name.trim(),
        phones:                 phonesPayload,
        email:                  email.trim() || null,
        entity_type:            entityType,
        // customer_type is derived — leave credit_group_id NULL when the
        // group still needs approval OR the user picked cash.
        credit_group_id:        newGroupNeedsApproval
          ? null
          : (customerType === 'credit' ? groupId : null),
        cr_url:                 docsRequired ? crDoc?.path              ?? null : null,
        establishment_id_url:   docsRequired ? establishmentIdDoc?.path ?? null : null,
        signed_credit_form_url: docsRequired ? signedFormDoc?.path      ?? null : null,
      },
      {
        onSuccess: (created: { id: string }) => {
          const createdInfo = {
            id: created.id,
            name: name.trim(),
            credit_group_id: customerType === 'credit' ? groupId || null : null,
          }
          if (!newGroupNeedsApproval) {
            toast.success('Customer created')
            onCreated?.(createdInfo)
            onOpenChange(false)
            return
          }
          submitGroupChange.mutate(
            { customerId: created.id, groupId },
            {
              onSuccess: (data) => {
                if (data.status === 'approved') {
                  toast.success(`Customer created; assigned to ${selectedGroup?.name} (no approval needed)`)
                } else {
                  toast.success(`Customer created; credit group sent for approval`)
                }
                onCreated?.(createdInfo)
                onOpenChange(false)
              },
              onError: (err) => {
                toast.error(`Customer created, but credit group not sent: ${err.message}`)
                onCreated?.(createdInfo)
                onOpenChange(false)
              },
            },
          )
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const lockType  = isEdit && !canChangeType
  const lockGroup = isEdit && !canChangeCreditGroup

  function DocUploadRow({ label, required, doc, slot, accept }: {
    label: string; required: boolean; doc: UploadedDoc | null; slot: Slot; accept: string
  }) {
    return (
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1 text-xs">
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
        {doc ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-green-500/40 bg-green-500/5 px-2.5 py-1.5 text-xs min-w-0">
            <FileCheck2 className="h-4 w-4 shrink-0 text-green-600" />
            <span className="truncate flex-1 min-w-0 text-green-700" title={doc.name}>{doc.name}</span>
            <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0"
              onClick={() => removeDoc(doc, slot)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <label
            className={`flex items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-xs cursor-pointer hover:bg-muted/50 min-w-0 ${
              uploading === slot ? 'opacity-60 pointer-events-none' : ''
            }`}
          >
            <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1 min-w-0 text-muted-foreground">
              {uploading === slot ? 'Uploading…' : 'Choose file…'}
            </span>
            <input
              type="file"
              accept={accept}
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                const uploaded = await uploadDoc(f, slot)
                if (uploaded) {
                  if (slot === 'cr') setCrDoc(uploaded)
                  else if (slot === 'establishment') setEstablishmentIdDoc(uploaded)
                  else setSignedFormDoc(uploaded)
                }
              }}
            />
          </label>
        )}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg flex max-h-[90vh] flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Customer' : 'New Customer'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0 -mx-4 px-4">
          <div className="space-y-1.5">
            <Label htmlFor="cust-name">Name <span className="text-destructive">*</span></Label>
            <Input
              id="cust-name"
              placeholder="Customer name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Phones <span className="text-destructive">*</span></Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addPhone}
                className="h-7 gap-1 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Add phone
              </Button>
            </div>
            <div className="space-y-2">
              {phones.map((p) => {
                const canRemove = phones.length > 1
                return (
                  <div key={p.key} className="flex items-start gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPrimary(p.key)}
                      title={p.is_primary ? 'Primary phone' : 'Set as primary'}
                      className={cn(
                        'mt-2 h-8 w-8 shrink-0 rounded-md border flex items-center justify-center transition-colors',
                        p.is_primary
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted/50'
                      )}
                    >
                      <Star className={cn('h-3.5 w-3.5', p.is_primary && 'fill-current')} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <PhoneInputWithCode
                        value={p.digits}
                        onChange={(v) => updatePhone(p.key, { digits: v })}
                        countryCode={p.countryCode}
                        onCountryCodeChange={(v) => updatePhone(p.key, { countryCode: v })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-1 h-8 w-8 shrink-0 text-muted-foreground disabled:opacity-30"
                      onClick={() => removePhone(p.key)}
                      disabled={!canRemove}
                      title={canRemove ? 'Remove phone' : 'At least one phone is required'}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Tap the star to mark a phone as primary. Numbers must be unique across all customers.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cust-email">Email</Label>
            <Input
              id="cust-email"
              type="email"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cust-entity-type" className="flex items-center gap-1">
                Entity Type <span className="text-destructive">*</span>
                {lockType && <Lock className="h-3 w-3 text-muted-foreground" />}
              </Label>
              <Select
                value={entityType}
                onValueChange={(v) => setEntityType(v as 'individual' | 'business')}
                disabled={lockType}
              >
                <SelectTrigger id="cust-entity-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-customer-type" className="flex items-center gap-1">
                Customer Type <span className="text-destructive">*</span>
                {lockType && <Lock className="h-3 w-3 text-muted-foreground" />}
              </Label>
              <Select
                value={customerType}
                onValueChange={(v) => { setCustomerType(v as 'cash' | 'credit'); setGroupId('') }}
                disabled={lockType}
              >
                <SelectTrigger id="cust-customer-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  <SelectItem value="credit">Credit</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {customerType === 'credit' && (
            <div className="space-y-1.5">
              <Label htmlFor="cust-credit-group" className="flex items-center gap-1">
                Credit Group <span className="text-destructive">*</span>
                {lockGroup && <Lock className="h-3 w-3 text-muted-foreground" />}
              </Label>
              <Select
                value={groupId}
                onValueChange={(v) => { if (v) setGroupId(v) }}
                disabled={lockGroup}
              >
                <SelectTrigger id="cust-credit-group" className="w-full">
                  <SelectValue placeholder="Select group…" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {groups
                    .filter((g) => (g.credit_limit ?? 0) > 0)
                    .map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isEdit && customer && (
            <div className={`flex items-center justify-between rounded-md border p-3 ${
              customer.is_active ? 'bg-muted/30' : 'bg-destructive/5 border-destructive/30'
            }`}>
              <div className="space-y-0.5">
                <div className="text-xs font-medium">
                  {customer.is_active ? 'Customer is Active' : 'Customer is Disabled'}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {customer.is_active
                    ? 'Disable to prevent this customer from being used in new sale orders'
                    : 'This customer cannot be selected for new sale orders'}
                </p>
              </div>
              <Button
                type="button"
                variant={customer.is_active ? 'outline' : 'default'}
                size="sm"
                className={customer.is_active
                  ? 'text-destructive border-destructive/40 hover:bg-destructive/10 text-xs'
                  : 'text-xs'}
                disabled={toggleActive.isPending}
                onClick={() => {
                  toggleActive.mutate(
                    { id: customer.id, is_active: !customer.is_active },
                    {
                      onSuccess: () => {
                        toast.success(customer.is_active ? 'Customer disabled' : 'Customer enabled')
                        onOpenChange(false)
                      },
                      onError: (err) => toast.error(err.message),
                    },
                  )
                }}
              >
                {toggleActive.isPending
                  ? (customer.is_active ? 'Disabling…' : 'Enabling…')
                  : (customer.is_active ? 'Disable Customer' : 'Enable Customer')}
              </Button>
            </div>
          )}

          {docsRequired && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 min-w-0">
              <div className="text-xs font-medium">
                Credit Documents{isEdit && ' (replace by removing then re-uploading)'}
              </div>
              {businessDocsReq && (
                <>
                  <DocUploadRow label="Commercial Registration (CR)" required doc={crDoc} slot="cr" accept=".pdf,.jpg,.jpeg,.png" />
                  <DocUploadRow label="Establishment ID" required doc={establishmentIdDoc} slot="establishment" accept=".pdf,.jpg,.jpeg,.png" />
                </>
              )}
              <DocUploadRow label="Signed Credit Form" required doc={signedFormDoc} slot="signed" accept=".pdf,.jpg,.jpeg,.png" />
              {(isCashToCredit || isIndividualToBusiness) && (
                <p className="text-[10px] text-amber-600">
                  Type promotion detected — a fresh upload is required for{' '}
                  {isCashToCredit && 'Signed Credit Form'}
                  {isCashToCredit && isIndividualToBusiness && ', '}
                  {isIndividualToBusiness && 'CR + Establishment ID'}.
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? (isEdit ? 'Saving…' : 'Creating…')
              : (isEdit ? 'Save Changes' : 'Create Customer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

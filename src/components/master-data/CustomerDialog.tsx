'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Upload, FileCheck2, X, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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
import { useCreateCustomer, useUpdateCustomer, type Customer } from '@/hooks/useSaleOrders'
import { useSubmitCreditGroupChange } from '@/hooks/useCreditGroupApprovals'

const BUCKET = 'customer-credit-docs'

type UploadedDoc = { path: string; name: string }
type Slot = 'cr' | 'establishment' | 'signed'

// credit_limit is needed so the dialog can decide whether the chosen group
// triggers the PM → AM → Owner approval chain (non-zero limit) or is a
// direct assignment (zero-limit / cash group).
type GroupOption = { id: string; name: string; credit_limit?: number }

interface CustomerDialogProps {
  mode:         'create' | 'edit'
  open:         boolean
  onOpenChange: (open: boolean) => void
  groups:       GroupOption[]
  // Required only in edit mode
  customer?:    Customer | null
}

/** Strip the `<timestamp>-<slot>-` prefix from a storage path to get a friendly display name. */
function displayNameFromPath(path: string, slot: Slot): string {
  const filename = path.split('/').pop() ?? path
  return filename.replace(new RegExp(`^\\d+-${slot}-`), '')
}

export function CustomerDialog({
  mode, open, onOpenChange, groups, customer,
}: CustomerDialogProps) {
  const isEdit = mode === 'edit'
  const canChangeType        = useHasPermission('master_data.customers.change_type')
  const canChangeCreditGroup = useHasPermission('master_data.customers.change_credit_group')

  const [name, setName]                 = useState('')
  const [phone, setPhone]               = useState('')
  const [countryCode, setCountryCode]   = useState('+974')
  const [email, setEmail]               = useState('')
  const [customerType, setCustomerType] = useState<'cash' | 'credit'>('credit')
  const [entityType, setEntityType]     = useState<'individual' | 'business'>('individual')
  const [groupId, setGroupId]           = useState('')
  const [crDoc, setCrDoc]                       = useState<UploadedDoc | null>(null)
  const [establishmentIdDoc, setEstablishmentIdDoc] = useState<UploadedDoc | null>(null)
  const [signedFormDoc, setSignedFormDoc]       = useState<UploadedDoc | null>(null)
  const [uploading, setUploading]       = useState<Slot | null>(null)

  const createCustomer    = useCreateCustomer()
  const updateCustomer    = useUpdateCustomer()
  const submitGroupChange = useSubmitCreditGroupChange()
  const submitting = createCustomer.isPending || updateCustomer.isPending || submitGroupChange.isPending

  // Seed form from `customer` when opening in edit mode (or clear it on close).
  useEffect(() => {
    if (!open) return
    if (isEdit && customer) {
      const split = splitPhone(customer.phone)
      setName(customer.name ?? '')
      setPhone(split.digits)
      setCountryCode(split.code)
      setEmail(customer.email ?? '')
      setCustomerType((customer.customer_type as 'cash' | 'credit') ?? 'cash')
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
      setName(''); setPhone(''); setCountryCode('+974'); setEmail('')
      setCustomerType('credit'); setEntityType('individual'); setGroupId('')
      setCrDoc(null); setEstablishmentIdDoc(null); setSignedFormDoc(null)
    }
    setUploading(null)
  }, [open, isEdit, customer])

  const selectedGroup    = groups.find((g) => g.id === groupId) ?? null
  const isCashGroupPick  = selectedGroup?.name === 'Cash Customers'
  const docsRequired     = customerType === 'credit' && !!groupId && !isCashGroupPick
  const businessDocsReq  = docsRequired && entityType === 'business'

  // In edit mode, a "promotion" means an existing classification that escalated:
  //   cash → credit, OR individual → business. Those force fresh docs.
  // (Doc presence still matters — if the customer is already credit+business with
  // valid docs and we're not changing anything, no re-upload is required.)
  const isCashToCredit       = isEdit && customer?.customer_type === 'cash' && customerType === 'credit'
  const isIndividualToBusiness = isEdit && customer?.entity_type === 'individual' && entityType === 'business'

  async function uploadDoc(file: File, slot: Slot): Promise<UploadedDoc | null> {
    const supabase = createClient()
    setUploading(slot)
    try {
      const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const folder = customer?.id ?? 'pending'
      const path = `${folder}/${Date.now()}-${slot}-${sanitized}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, file)
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
    // Only delete from storage if it's a freshly-uploaded file (under `pending/`).
    // Existing files attached to a customer stay until the dialog is saved with a
    // replacement; otherwise a cancel would lose the file forever.
    if (doc.path.startsWith('pending/')) {
      const supabase = createClient()
      await supabase.storage.from(BUCKET).remove([doc.path])
    }
    if (slot === 'cr') setCrDoc(null)
    else if (slot === 'establishment') setEstablishmentIdDoc(null)
    else setSignedFormDoc(null)
  }

  function handleSubmit() {
    if (!name.trim() || !phone.trim()) {
      toast.error('Name and phone are required')
      return
    }
    if (customerType === 'credit' && !groupId) {
      toast.error('Select a credit group for credit customers')
      return
    }
    if (customerType === 'credit' && isCashGroupPick) {
      toast.error('Pick a real credit group — "Cash Customers" is for cash-type customers only')
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
    // Promotion guard: force a re-uploaded signed credit form on Cash→Credit,
    // and fresh CR + Establishment ID on Individual→Business. We detect "fresh"
    // by the path being under `pending/` or under the customer's own folder,
    // not the original placeholder — easiest check is that the path differs from
    // what was persisted on the customer record.
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

    const fullPhone = `${countryCode}${phone.trim()}`

    // A non-zero-limit credit group must go through the configurable
    // credit_group approval workflow. Cash group (limit = 0) assigns directly.
    const newGroupNeedsApproval =
      customerType === 'credit'
      && !!selectedGroup
      && (selectedGroup.credit_limit ?? 0) > 0

    if (isEdit && customer) {
      // If the user picked a different non-zero-limit group, save every other
      // change directly but keep the old group on the row — the new group is
      // submitted for approval. The list dropdown uses the same RPC; the two
      // entry points share one chain so there's no double-routing.
      const groupIsChanging = (customer.credit_group_id ?? null) !== (groupId || null)
      const routeGroupViaApproval = groupIsChanging && newGroupNeedsApproval

      updateCustomer.mutate(
        {
          id: customer.id,
          patch: {
            name:                   name.trim(),
            phone:                  fullPhone,
            email:                  email.trim() || null,
            customer_type:          customerType,
            entity_type:            entityType,
            credit_group_id:        routeGroupViaApproval
              ? (customer.credit_group_id ?? null)
              : (customerType === 'credit' ? groupId : null),
            cr_url:                 docsRequired ? crDoc?.path              ?? null : null,
            establishment_id_url:   docsRequired ? establishmentIdDoc?.path ?? null : null,
            signed_credit_form_url: docsRequired ? signedFormDoc?.path      ?? null : null,
          },
          previous: {
            name:                   customer.name,
            phone:                  customer.phone,
            email:                  customer.email,
            customer_type:          customer.customer_type,
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
                  // Other fields already saved — surface the approval-submit
                  // error so the user knows the group is still on the old value.
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

    // Create: insert the customer first (with all docs + everything except the
    // pending group), then submit the credit-group change for approval if the
    // picked group needs it. The customer exists either way — they just can't
    // place credit SOs until the chain approves the group.
    createCustomer.mutate(
      {
        name:                   name.trim(),
        phone:                  fullPhone,
        email:                  email.trim() || null,
        customer_type:          customerType,
        entity_type:            entityType,
        credit_group_id:        newGroupNeedsApproval
          ? null
          : (customerType === 'credit' ? groupId : null),
        cr_url:                 docsRequired ? crDoc?.path              ?? null : null,
        establishment_id_url:   docsRequired ? establishmentIdDoc?.path ?? null : null,
        signed_credit_form_url: docsRequired ? signedFormDoc?.path      ?? null : null,
      },
      {
        onSuccess: (created: { id: string }) => {
          if (!newGroupNeedsApproval) {
            toast.success('Customer created')
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
                onOpenChange(false)
              },
              onError: (err) => {
                toast.error(`Customer created, but credit group not sent: ${err.message}`)
                onOpenChange(false)
              },
            },
          )
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  // In edit mode, type and entity selects are gated by change_type permission.
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
            <Label>Phone <span className="text-destructive">*</span></Label>
            <PhoneInputWithCode
              value={phone}
              onChange={setPhone}
              countryCode={countryCode}
              onCountryCodeChange={setCountryCode}
            />
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
                <SelectContent>
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
                <SelectContent>
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
                <SelectContent>
                  {groups.map((g) => {
                    const isCashGroup = g.name === 'Cash Customers'
                    return (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                        {isCashGroup && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            (cash-type customers only)
                          </span>
                        )}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {isCashGroupPick && (
                <p className="text-[10px] text-amber-600">
                  This customer is in the &quot;Cash Customers&quot; group but is set to Credit type. Pick a real credit group before saving.
                </p>
              )}
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

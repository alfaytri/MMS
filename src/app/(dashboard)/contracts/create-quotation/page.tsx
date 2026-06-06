'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { nanoid } from 'nanoid'
import {
  ArrowLeft, Save, Wrench, Phone, User, RefreshCw,
  FileText, X, Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'
import { useCreateContractQuotation } from '@/hooks/useCreateContractQuotation'
import { PhoneLookupModal } from '@/components/orders/PhoneLookupModal'
import { useContactCenterContext } from '@/contexts/ContactCenterContext'
import { createClient } from '@/lib/supabase/client'
import { tryNormalisePhone } from '@/lib/contact-center/normalise-phone'
import type { CustomerLookupResult } from '@/hooks/useCustomerLookup'
import {
  computeSubtotal, computeNetTotal, computeMonthlyValue, computePaymentValue,
  validateBeforeSave, validateTreeIntegrity,
} from '@/lib/contractUtils'
import { AddressPicker } from '@/components/orders/AddressPicker'
import { formatAddressLine } from '@/lib/orders/warrantyUtils'
import type { CustomerAddress } from '@/types/orders'
import { SectionCard, FieldDisplay } from '@/components/contracts/ContractQuotationShared'
import { WorkflowProgressBar } from '@/components/contracts/WorkflowProgressBar'
import { ContractBuildingTree } from '@/components/contracts/ContractBuildingTree'
import { AreaServiceCard } from '@/components/contracts/AreaServiceCard'
import { AddContractServiceDialog } from '@/components/contracts/AddContractServiceDialog'
import { PaymentScheduleSection } from '@/components/contracts/PaymentScheduleSection'
// ContractTermsSection replaced by PDF upload
import { VisitSummarySection } from '@/components/contracts/VisitSummarySection'
import type {
  BuildingTree, ContractService, ContractMilestone,
  ContractFormData,
} from '@/types/contracts'

const SOURCE_TYPES = [
  { value: 'direct', label: 'Direct' },
  { value: 'site_visit', label: 'Site Visit' },
]

export default function CreateContractQuotationPage() {
  const router = useRouter()
  const sessionId = useRef(nanoid())
  const { data: profile } = useCurrentUserProfile()
  const { divisions: userDivisions } = useUserDivisionScope()
  const createQuotation = useCreateContractQuotation()
  const { selectedCustomer } = useContactCenterContext()

  // Customer lookup state
  const [lookupOpen, setLookupOpen] = useState(true)
  const [serviceCustomerId, setServiceCustomerId] = useState<string | null>(null)
  const [phoneId, setPhoneId] = useState<string | null>(null)

  // Form state
  const [sourceType, setSourceType] = useState<'direct' | 'site_visit'>('direct')
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [selectedAddress, setSelectedAddress] = useState<CustomerAddress | null>(null)
  const [siteName, setSiteName] = useState('')
  const [divisions, setDivisions] = useState<string[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [discount, setDiscount] = useState(0)
  const [paymentMode, setPaymentMode] = useState<'fixed' | 'milestone' | 'completion'>('fixed')
  const [paymentFrequency, setPaymentFrequency] = useState('monthly')
  const [buildingTree, setBuildingTree] = useState<BuildingTree>({ nodes: [] })
  const [notes, setNotes] = useState('')
  const [services, setServices] = useState<ContractService[]>([])
  const [milestones, setMilestones] = useState<ContractMilestone[]>([])

  // Terms PDF
  const [termsFile, setTermsFile] = useState<File | null>(null)
  const termsInputRef = useRef<HTMLInputElement>(null)

  // Dialog state
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false)
  const [serviceDialogNodeId, setServiceDialogNodeId] = useState<string | null>(null)
  const [editingService, setEditingService] = useState<ContractService | null>(null)

  function handleCustomerConfirm(result: CustomerLookupResult) {
    setServiceCustomerId(result.customerId)
    setPhoneId(result.phoneId)
    setCustomerName(result.customerName)
    setPhone(result.phone)
    setSelectedAddress(null)
    setAddress('')
    setLookupOpen(false)
  }

  // Sync from Contact Centre when a customer is resolved there
  useEffect(() => {
    if (!selectedCustomer) return
    if (serviceCustomerId === selectedCustomer.customerId) return

    const supabase = createClient()
    let cancelled = false
    ;(async () => {
      const normalised = tryNormalisePhone(selectedCustomer.primaryPhone) ?? selectedCustomer.primaryPhone
      const { data } = await supabase
        .from('service_customer_phones')
        .select('id')
        .eq('customer_id', selectedCustomer.customerId)
        .eq('phone', normalised)
        .maybeSingle()
      if (cancelled) return
      setServiceCustomerId(selectedCustomer.customerId)
      setPhoneId(data?.id ?? null)
      setCustomerName(selectedCustomer.customerName)
      setPhone(normalised)
      setLookupOpen(false)
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer?.customerId])

  // Auto-select single division
  useEffect(() => {
    if (userDivisions.length === 1 && divisions.length === 0) {
      setDivisions([userDivisions[0].id])
    }
  }, [userDivisions, divisions.length])

  // Computed values
  const subtotal = computeSubtotal(services, startDate, endDate)
  const netTotal = computeNetTotal(subtotal, discount)
  const monthlyValue = startDate && endDate ? computeMonthlyValue(netTotal, startDate, endDate) : 0
  const paymentValue = startDate && endDate ? computePaymentValue(netTotal, startDate, endDate, paymentFrequency) : 0
  const frequencyLabel: Record<string, string> = {
    monthly: 'Monthly', quarterly: 'Quarterly',
    semi_annual: 'Semi-Annual', annual: 'Annual',
  }
  const generalServices = services.filter((s) => s.is_general)

  const toggleDivision = (divId: string) => {
    setDivisions((prev) =>
      prev.includes(divId) ? prev.filter((d) => d !== divId) : [...prev, divId],
    )
  }

  const handleAddService = useCallback((nodeId: string) => {
    setServiceDialogNodeId(nodeId)
    setEditingService(null)
    setServiceDialogOpen(true)
  }, [])

  const handleAddGeneralService = useCallback(() => {
    setServiceDialogNodeId(null)
    setEditingService(null)
    setServiceDialogOpen(true)
  }, [])

  const handleEditService = useCallback((serviceId: string) => {
    const svc = services.find((s) => s.id === serviceId)
    if (svc) {
      setEditingService(svc)
      setServiceDialogNodeId(svc.building_node_id)
      setServiceDialogOpen(true)
    }
  }, [services])

  const handleRemoveService = useCallback((serviceId: string) => {
    setServices((prev) => prev.filter((s) => s.id !== serviceId))
  }, [])

  const handleServiceSave = useCallback((service: ContractService) => {
    setServices((prev) => {
      const idx = prev.findIndex((s) => s.id === service.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = service
        return updated
      }
      return [...prev, service]
    })
  }, [])

  const divisionSlugs = userDivisions
    .filter((d) => divisions.includes(d.id))
    .map((d) => d.slug)

  function buildFormData(): ContractFormData {
    const areaCount = buildingTree.nodes.filter((n) => n.type === 'area').length
    const servicesSummary = services.map((s) => s.service_name).join(', ')
    return {
      sourceType,
      serviceCustomerId: serviceCustomerId || undefined,
      phoneId: phoneId || undefined,
      customerName,
      phone,
      address,
      siteName,
      divisions: divisionSlugs,
      startDate,
      endDate,
      discount,
      paymentMode,
      paymentFrequency,
      buildingTree,
      notes,
      services,
      milestones,
      agentName: profile?.full_name || '',
      createdBy: profile?.id || '',
      areaCount,
      servicesSummary,
      totalValue: netTotal,
      monthlyValue,
      subtotal,
      termsFile,
    }
  }

  async function handleSave() {
    const formData = buildFormData()
    const validation = validateBeforeSave(formData)
    if (!validation.valid) {
      validation.errors.forEach((e) => toast.error(e))
      return
    }

    const treeCheck = validateTreeIntegrity(buildingTree, services)
    if (!treeCheck.valid) {
      toast.error(treeCheck.message || 'Building tree has integrity issues')
      return
    }

    try {
      const contract = await createQuotation.mutateAsync(formData)
      toast.success('Quotation created successfully')
      router.push(`/contracts/detail/${contract.id}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create quotation')
    }
  }

  const canSave = customerName && siteName && startDate && endDate && divisions.length > 0

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">New Contract Quotation</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline">{sourceType === 'site_visit' ? 'Site Visit' : 'Direct'}</Badge>
              <WorkflowProgressBar currentStatus="draft" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSave} disabled={!canSave || createQuotation.isPending}>
            <Save className="h-4 w-4 mr-1" />
            Save Draft
          </Button>
        </div>
      </div>

      {/* Phone Lookup Modal */}
      <PhoneLookupModal
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        onConfirm={handleCustomerConfirm}
        title="New Contract Quotation"
      />

      {/* Customer Info */}
      <SectionCard title="Customer Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cq-source-type">Source Type</Label>
            <Select value={sourceType} onValueChange={(v) => v && setSourceType(v as 'direct' | 'site_visit')}>
              <SelectTrigger id="cq-source-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cq-customer-name">Customer Name *</Label>
            {serviceCustomerId ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{customerName}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-9 w-9"
                  onClick={() => setLookupOpen(true)}
                  title="Change customer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input id="cq-customer-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-9 w-9"
                  onClick={() => setLookupOpen(true)}
                  title="Look up customer by phone"
                >
                  <Phone className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cq-phone">Phone</Label>
            {serviceCustomerId ? (
              <div className="flex items-center gap-2 h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>{phone}</span>
              </div>
            ) : (
              <Input id="cq-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="cq-address">Address</Label>
            {serviceCustomerId && phoneId ? (
              <AddressPicker
                customerId={serviceCustomerId}
                phoneId={phoneId}
                selected={selectedAddress}
                onSelect={(addr) => {
                  setSelectedAddress(addr)
                  setAddress(formatAddressLine(addr))
                  if (addr.label) setSiteName(addr.label)
                }}
              />
            ) : (
              <Input id="cq-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full address" />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cq-site-name">Site Name *</Label>
            <Input id="cq-site-name" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Site / building name" />
          </div>
        </div>
      </SectionCard>

      {/* Contract Details */}
      <SectionCard title="Contract Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cq-start-date">Start Date *</Label>
            <DatePicker value={startDate} onChange={setStartDate} placeholder="dd-mm-yyyy" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cq-end-date">End Date *</Label>
            <DatePicker value={endDate} onChange={setEndDate} placeholder="dd-mm-yyyy" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="cq-divisions">Divisions *</Label>
            <Select
              value={divisions.length === 1 ? divisions[0] : divisions.length > 1 ? '__multiple__' : ''}
              onValueChange={(v) => {
                if (v && v !== '__multiple__') {
                  setDivisions([v])
                }
              }}
            >
              <SelectTrigger id="cq-divisions">
                <SelectValue placeholder="Select division">
                  {divisions.length === 0
                    ? 'Select division'
                    : divisions.length === 1
                      ? userDivisions.find((d) => d.id === divisions[0])?.name || 'Select division'
                      : `${divisions.length} divisions selected`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {userDivisions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      {/* Building Structure + Services */}
      <SectionCard
        title="Building Structure & Services"
        actions={
          <Button variant="outline" size="sm" onClick={handleAddGeneralService}>
            <Wrench className="h-3.5 w-3.5 mr-1" />
            Add General Service
          </Button>
        }
      >
        <ContractBuildingTree
          buildingTree={buildingTree}
          services={services.filter((s) => !s.is_general)}
          editable
          onTreeChange={setBuildingTree}
          onServicesChange={setServices}
          onAddService={handleAddService}
          onEditService={handleEditService}
          onRemoveService={handleRemoveService}
          renderServiceCard={(svc) => (
            <AreaServiceCard
              key={svc.id}
              service={svc}
              editable
              onEdit={() => handleEditService(svc.id)}
              onRemove={() => handleRemoveService(svc.id)}
            />
          )}
        />

        {generalServices.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">General Services</h4>
            <div className="space-y-2">
              {generalServices.map((svc) => (
                <AreaServiceCard
                  key={svc.id}
                  service={svc}
                  editable
                  onEdit={() => handleEditService(svc.id)}
                  onRemove={() => handleRemoveService(svc.id)}
                />
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Visit Summary */}
      {services.length > 0 && startDate && endDate && (
        <SectionCard title="Visit Summary">
          <VisitSummarySection services={services} startDate={startDate} endDate={endDate} />
        </SectionCard>
      )}

      {/* Terms & Conditions PDF */}
      <SectionCard title="Terms & Conditions">
        <input
          ref={termsInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) {
              if (f.size > 10 * 1024 * 1024) {
                toast.error('File too large. Maximum 10 MB.')
                return
              }
              setTermsFile(f)
            }
          }}
        />
        {termsFile ? (
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted p-3">
            <FileText className="h-5 w-5 text-destructive shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{termsFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(termsFile.size / 1024).toFixed(0)} KB
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8"
              onClick={() => {
                setTermsFile(null)
                if (termsInputRef.current) termsInputRef.current.value = ''
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => termsInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-border py-8 text-sm text-muted-foreground transition-colors hover:border-slate-400 hover:bg-muted"
          >
            <Upload className="h-4 w-4" />
            Upload Terms & Conditions PDF
          </button>
        )}
      </SectionCard>

      {/* Notes */}
      <SectionCard title="Notes">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Additional notes about this contract..."
        />
      </SectionCard>

      {/* Payment Schedule */}
      <SectionCard title="Payment Schedule">
        <PaymentScheduleSection
          mode={paymentMode}
          frequency={paymentFrequency}
          milestones={milestones}
          contractTotal={subtotal}
          discount={discount}
          startDate={startDate}
          endDate={endDate}
          editable
          onChange={(updates) => {
            if (updates.mode) setPaymentMode(updates.mode)
            if (updates.frequency) setPaymentFrequency(updates.frequency)
            if (updates.milestones) setMilestones(updates.milestones)
          }}
        />
      </SectionCard>

      {/* Pricing Summary */}
      <SectionCard title="Pricing Summary">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cq-discount">Discount (QAR)</Label>
            <Input
              id="cq-discount"
              type="number"
              min={0}
              value={discount || ''}
              onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <FieldDisplay label="Subtotal" value={`${subtotal.toLocaleString()} QAR`} />
          <FieldDisplay label="Net Total" value={`${netTotal.toLocaleString()} QAR`} />
          <FieldDisplay label={`${frequencyLabel[paymentFrequency] || 'Monthly'} Value`} value={`${paymentValue.toLocaleString()} QAR`} />
        </div>
      </SectionCard>

      {/* Service Dialog */}
      <AddContractServiceDialog
        open={serviceDialogOpen}
        onOpenChange={setServiceDialogOpen}
        buildingTree={buildingTree}
        nodeId={serviceDialogNodeId}
        divisions={divisionSlugs}
        editService={editingService}
        onSave={handleServiceSave}
      />
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { nanoid } from 'nanoid'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useServiceBrands } from '@/hooks/useServiceBrands'
import { computeUnitPrice, buildPathFromTree } from '@/lib/contractUtils'
import type { ContractService, BuildingTree, ServiceFrequency } from '@/types/contracts'

const FREQUENCIES: { value: ServiceFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'bi_weekly', label: 'Bi-Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semi_annual', label: 'Semi-Annual' },
  { value: 'annual', label: 'Annual' },
]

const CONDITIONS = [
  { value: 'good', label: 'Good', factor: 1.0 },
  { value: 'fair', label: 'Fair', factor: 1.25 },
  { value: 'poor', label: 'Poor', factor: 1.5 },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  buildingTree: BuildingTree
  nodeId: string | null
  divisions: string[]
  editService?: ContractService | null
  onSave: (service: ContractService) => void
}

export function AddContractServiceDialog({
  open,
  onOpenChange,
  buildingTree,
  nodeId,
  divisions,
  editService,
  onSave,
}: Props) {
  const supabase = createClient()
  const [step, setStep] = useState(1)

  // Step 1: Service selection
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)
  const [selectedServiceName, setSelectedServiceName] = useState('')
  const [basePrice, setBasePrice] = useState(0)

  // Step 2: Configuration
  const [frequency, setFrequency] = useState<ServiceFrequency>('monthly')
  const [brandId, setBrandId] = useState<string | null>(null)
  const [brandName, setBrandName] = useState<string | null>(null)
  const [reliabilityFactor, setReliabilityFactor] = useState(1.0)
  const [condition, setCondition] = useState<string | null>(null)
  const [conditionFactor, setConditionFactor] = useState(1.0)
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [serviceDivisions, setServiceDivisions] = useState<string[]>([])

  const { data: brands } = useServiceBrands(selectedServiceId)

  // Fetch service categories (top-level services with no parent)
  const { data: categories } = useQuery({
    queryKey: ['serviceCategories'],
    queryFn: async () => {
      const { data } = await supabase
        .from('services')
        .select('id, name_en, parent_id')
        .is('parent_id', null)
        .order('name_en')
      return data || []
    },
    enabled: open,
  })

  // Fetch services under selected category
  const { data: servicesInCategory } = useQuery({
    queryKey: ['servicesInCategory', selectedCategoryId],
    queryFn: async () => {
      if (!selectedCategoryId) return []
      const { data } = await supabase
        .from('services')
        .select('id, name_en, price')
        .eq('parent_id', selectedCategoryId)
        .order('name_en')
      return data || []
    },
    enabled: !!selectedCategoryId,
  })

  // Pre-fill when editing
  useEffect(() => {
    if (editService) {
      setStep(2)
      setSelectedServiceId(editService.service_id)
      setSelectedServiceName(editService.service_name)
      setBasePrice(editService.base_price)
      setFrequency(editService.frequency)
      setBrandId(editService.brand_id)
      setBrandName(editService.brand_name)
      setReliabilityFactor(editService.reliability_factor)
      setCondition(editService.condition)
      setConditionFactor(editService.condition_factor)
      setQuantity(editService.quantity)
      setNote(editService.note || '')
      setServiceDivisions(editService.divisions)
    } else {
      resetForm()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editService, open])

  function resetForm() {
    setStep(1)
    setSelectedCategoryId(null)
    setSelectedServiceId(null)
    setSelectedServiceName('')
    setBasePrice(0)
    setFrequency('monthly')
    setBrandId(null)
    setBrandName(null)
    setReliabilityFactor(1.0)
    setCondition(null)
    setConditionFactor(1.0)
    setQuantity(1)
    setNote('')
    setServiceDivisions(divisions.length === 1 ? [divisions[0]] : [])
  }

  function handleSelectService(serviceId: string | null) {
    if (!serviceId) return
    const svc = (servicesInCategory || []).find((s: any) => s.id === serviceId)
    if (!svc) return
    setSelectedServiceId(svc.id)
    setSelectedServiceName(svc.name_en)
    setBasePrice(svc.price || 0)
    setStep(2)
  }

  function handleBrandChange(bId: string | null) {
    if (!bId) return
    const brand = brands?.find((b) => b.brand_id === bId)
    if (brand) {
      setBrandId(brand.brand_id)
      setBrandName(brand.brand_name)
      setReliabilityFactor(brand.reliability_factor)
    } else {
      setBrandId(null)
      setBrandName(null)
      setReliabilityFactor(1.0)
    }
  }

  function handleConditionChange(cond: string | null) {
    if (!cond) return
    const c = CONDITIONS.find((co) => co.value === cond)
    setCondition(cond)
    setConditionFactor(c?.factor || 1.0)
  }

  function toggleDivision(div: string) {
    setServiceDivisions((prev) =>
      prev.includes(div) ? prev.filter((d) => d !== div) : [...prev, div],
    )
  }

  const unitPrice = computeUnitPrice(basePrice, reliabilityFactor, conditionFactor)
  const totalPrice = unitPrice * quantity

  function handleSave() {
    const isGeneral = !nodeId
    const servicePath = nodeId
      ? buildPathFromTree(buildingTree, nodeId, selectedServiceName)
      : [selectedServiceName]

    const service: ContractService = {
      id: editService?.id || nanoid(),
      contract_id: editService?.contract_id || '',
      service_id: selectedServiceId,
      building_node_id: nodeId,
      service_name: selectedServiceName,
      service_path: servicePath,
      brand_id: brandId,
      brand_name: brandName,
      reliability_factor: reliabilityFactor,
      condition: condition as ContractService['condition'],
      condition_factor: conditionFactor,
      frequency,
      quantity,
      base_price: basePrice,
      unit_price: unitPrice,
      total_price: totalPrice,
      divisions: serviceDivisions,
      note: note || null,
      is_general: isGeneral,
      sort_order: editService?.sort_order || 0,
      _isNew: !editService,
      _isDirty: !!editService,
    }

    onSave(service)
    onOpenChange(false)
    resetForm()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editService ? 'Edit Service' : step === 1 ? 'Select Service' : 'Configure Service'}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={selectedCategoryId || ''} onValueChange={setSelectedCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories || []).map((cat: any) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Service</Label>
                <Select
                  value={selectedServiceId || ''}
                  onValueChange={handleSelectService}
                  disabled={!selectedCategoryId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                  <SelectContent>
                    {(servicesInCategory || []).map((svc: any) => (
                      <SelectItem key={svc.id} value={svc.id}>{svc.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-4">
            <p className="text-sm font-medium">{selectedServiceName}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as ServiceFrequency)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Brand (optional)</Label>
                <Select value={brandId || 'none'} onValueChange={(v) => handleBrandChange(v === 'none' ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="No brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No brand</SelectItem>
                    {(brands || []).map((b) => (
                      <SelectItem key={b.brand_id} value={b.brand_id}>
                        {b.brand_name} ({b.reliability_factor}x)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Condition (optional)</Label>
                <Select value={condition || 'none'} onValueChange={(v) => handleConditionChange(v === 'none' ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="No condition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No condition</SelectItem>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label} ({c.factor}x)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Divisions</Label>
              <div className="flex flex-wrap gap-2">
                {divisions.map((d) => (
                  <Badge
                    key={d}
                    variant={serviceDivisions.includes(d) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleDivision(d)}
                  >
                    {d}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Additional notes about this service..."
              />
            </div>

            {/* Price breakdown */}
            <div className="rounded-lg bg-blue-50 p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Base Price</span>
                <span>{basePrice.toLocaleString()} QAR</span>
              </div>
              {reliabilityFactor !== 1.0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Brand reliability</span>
                  <span>&times; {reliabilityFactor}</span>
                </div>
              )}
              {conditionFactor !== 1.0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Condition factor</span>
                  <span>&times; {conditionFactor}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1">
                <span>Unit Price</span>
                <span className="font-medium">{unitPrice.toLocaleString()} QAR</span>
              </div>
              <div className="flex justify-between font-bold text-base">
                <span>Total ({quantity} units)</span>
                <span>{totalPrice.toLocaleString()} QAR</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 2 && !editService && (
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
          )}
          <Button variant="ghost" onClick={() => { onOpenChange(false); resetForm() }}>Cancel</Button>
          {step === 2 && (
            <Button onClick={handleSave} disabled={!selectedServiceId || serviceDivisions.length === 0}>
              {editService ? 'Update Service' : 'Add Service'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

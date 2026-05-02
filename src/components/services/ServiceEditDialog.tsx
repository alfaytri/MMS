// src/components/services/ServiceEditDialog.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Form } from '@/components/ui/form'
import { cn } from '@/lib/utils'
import { useServiceTree, useCreateService, useUpdateService, type Service } from '@/hooks/useServices'
import { collectDescendantIds, buildTreeMap } from './ServiceTree'
import {
  serviceSchema, toDefaults, type ServiceFormValues,
  CoreSection, CatalogImageSection, StatusSection, DivisionSection,
  ContractSection, PricingSection, DurationWarrantySection,
  InvoiceTextSection, PhotoRequirementSection, FeatureFieldsSection,
} from './ServiceEditSections'

interface ServiceEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'new' | 'edit'
  type: 'normal' | 'contract' | 'mobile'
  node: Service | null
  parentId: string | null
}

export function ServiceEditDialog({
  open,
  onOpenChange,
  mode,
  type,
  node,
  parentId,
}: ServiceEditDialogProps) {
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
  const [parentOpen, setParentOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const createService = useCreateService()
  const updateService = useUpdateService()
  const { data: treeData = [] } = useServiceTree(type, [], open)

  const parentDivision = useMemo(
    () => (parentId ? (treeData.find((s) => s.id === parentId)?.division ?? null) : null),
    [parentId, treeData],
  )

  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema) as Resolver<ServiceFormValues>,
    defaultValues: toDefaults(node, type, parentId, parentDivision),
  })

  useEffect(() => {
    if (open) {
      form.reset(toDefaults(node, type, parentId, parentDivision))
      setPendingFile(null)
    }
  }, [open, node, parentId, type, parentDivision]) // eslint-disable-line react-hooks/exhaustive-deps

  // Parent combobox items — excludes the node itself and all its descendants
  const parentComboItems = useMemo(() => {
    const treeMap = buildTreeMap(treeData)
    const excludeIds = new Set<string>()
    if (node) {
      excludeIds.add(node.id)
      collectDescendantIds(node.id, treeMap).forEach((id) => excludeIds.add(id))
    }
    type ComboItem = {
      id: string; name_en: string; name_ar: string | null; depth: number; breadcrumb: string
    }
    function traverse(key: string | null, depth: number, breadcrumb: string): ComboItem[] {
      const children = treeMap.get(key) ?? []
      const result: ComboItem[] = []
      for (const child of children) {
        if (excludeIds.has(child.id)) continue
        result.push({ id: child.id, name_en: child.name_en, name_ar: child.name_ar, depth, breadcrumb })
        const next = breadcrumb ? `${breadcrumb} > ${child.name_en}` : child.name_en
        result.push(...traverse(child.id, depth + 1, next))
      }
      return result
    }
    return traverse(null, 0, '')
  }, [treeData, node])

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && form.formState.isDirty) {
      setConfirmDiscardOpen(true)
      return
    }
    onOpenChange(nextOpen)
  }

  async function onSubmit(values: ServiceFormValues) {
    try {
      const supabase = createClient()
      const serviceId = mode === 'edit' && node ? node.id : crypto.randomUUID()

      let catalogImageUrl: string | undefined
      if (pendingFile) {
        const ext = pendingFile.name.split('.').pop() ?? 'jpg'
        const path = `catalog/${serviceId}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('service-photos')
          .upload(path, pendingFile, { upsert: true })
        if (uploadError) throw uploadError
        const { data: { publicUrl } } = supabase.storage
          .from('service-photos')
          .getPublicUrl(path)
        catalogImageUrl = publicUrl
      }

      const payload = {
        name_en: values.name_en,
        name_ar: values.name_ar || null,
        code: values.code || null,
        legacy_service_id: values.legacy_service_id || null,
        status: values.status,
        division: values.division,
        parent_id: values.parent_id,
        tree_type: type,
        price: values.price,
        emergency_price: type !== 'contract' ? values.emergency_price : null,
        discount: type === 'contract' ? values.discount : null,
        price_unit: values.contract_type === 'area' ? values.price_unit : null,
        contract_type: type === 'contract' ? values.contract_type : null,
        duration: values.duration,
        warranty: values.warranty,
        invoice_text_en: type !== 'contract' ? values.invoice_text_en || null : null,
        invoice_text_ar: type !== 'contract' ? values.invoice_text_ar || null : null,
        photo_requirement: type !== 'contract' ? values.photo_requirement : null,
        instructions: false,
        reminder_days: values.has_reminders ? values.reminder_days : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inventory_items: values.has_inventory ? (values.inventory_items_list as any) : null,
        qc_checklist: type !== 'contract' ? values.qc_checklist : null,
        spare_parts: type !== 'contract' ? values.spare_parts : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        service_type: type !== 'contract' ? (values.service_type as any) : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        components: values.service_type === 'configurable' ? (values.component_service_ids as any) : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        qc_items: type !== 'contract' && values.qc_items.length > 0 ? (values.qc_items as any) : null,
        ...(catalogImageUrl !== undefined && { catalog_image_url: catalogImageUrl }),
      }

      if (mode === 'new') {
        await createService.mutateAsync({ ...payload, id: serviceId, sort_order: 0, treeType: type })
      } else {
        const changedFields = Object.keys(form.formState.dirtyFields)
        await updateService.mutateAsync({ id: serviceId, ...payload, treeType: type, changedFields })
      }
      toast.success('Service saved')
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to save service')
      console.error(err)
    }
  }

  const isSaving = createService.isPending || updateService.isPending
  const title = mode === 'new'
    ? `New ${type === 'contract' ? 'Contract ' : type === 'mobile' ? 'Mobile App ' : ''}Service`
    : 'Edit Service'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentImageUrl = (node as any)?.catalog_image_url ?? null

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto sm:rounded-lg rounded-none">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

              <CoreSection form={form} />
              <CatalogImageSection
                pendingFile={pendingFile}
                currentUrl={currentImageUrl}
                onFileChange={setPendingFile}
              />
              <div className="grid grid-cols-2 gap-3">
                <StatusSection form={form} />
                <DivisionSection form={form} mode={mode} hasParent={parentId !== null} />
              </div>

              {/* Parent service combobox */}
              <div>
                <label className="text-sm font-medium">Parent Service (optional)</label>
                <Popover open={parentOpen} onOpenChange={setParentOpen}>
                  <PopoverTrigger
                    className="w-full justify-between font-normal h-9 text-sm mt-1.5 inline-flex items-center rounded-md border border-input bg-background px-3 shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    render={(props) => <button type="button" role="combobox" {...props} />}
                  >
                    {parentComboItems.find((i) => i.id === form.watch('parent_id'))?.name_en ?? 'None (root level)'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </PopoverTrigger>
                  <PopoverContent className="w-[420px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search services…" />
                      <CommandList className="max-h-60">
                        <CommandEmpty>No services found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="__none__"
                            onSelect={() => {
                              form.setValue('parent_id', null, { shouldDirty: true })
                              setParentOpen(false)
                            }}
                          >
                            <Check className={cn('mr-2 h-4 w-4', form.watch('parent_id') === null ? 'opacity-100' : 'opacity-0')} />
                            <span className="text-sm text-muted-foreground italic">None (root level)</span>
                          </CommandItem>
                          {parentComboItems.map((item) => (
                            <CommandItem
                              key={item.id}
                              value={`${item.breadcrumb} ${item.name_en}`}
                              onSelect={() => {
                                form.setValue('parent_id', item.id, { shouldDirty: true })
                                setParentOpen(false)
                              }}
                            >
                              <Check className={cn('mr-2 h-4 w-4 shrink-0', form.watch('parent_id') === item.id ? 'opacity-100' : 'opacity-0')} />
                              <div style={{ paddingInlineStart: item.depth * 16 }}>
                                {item.breadcrumb && (
                                  <div className="text-[10px] text-muted-foreground leading-tight">{item.breadcrumb}</div>
                                )}
                                <div className="text-xs">
                                  {item.name_en}
                                  {item.name_ar && (
                                    <span className="text-muted-foreground ml-1.5">{item.name_ar}</span>
                                  )}
                                </div>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {type === 'contract' && <ContractSection form={form} />}
              <PricingSection form={form} type={type} />
              <DurationWarrantySection form={form} />
              {type !== 'contract' && <InvoiceTextSection form={form} />}
              {type !== 'contract' && <PhotoRequirementSection form={form} />}
              {type !== 'contract' && (
                <FeatureFieldsSection
                  form={form}
                  treeData={treeData}
                  currentServiceId={node?.id ?? null}
                />
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Unsaved-changes guard */}
      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. They will be lost if you close now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmDiscardOpen(false); onOpenChange(false) }}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

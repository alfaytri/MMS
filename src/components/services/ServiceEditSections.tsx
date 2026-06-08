// src/components/services/ServiceEditSections.tsx
'use client'

import { z } from 'zod'
import type { Service } from '@/hooks/useServices'

// ─── Schema ───────────────────────────────────────────────────────────────────

export const serviceSchema = z.object({
  name_en: z.string().min(1, 'Name (EN) is required'),
  name_ar: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  legacy_service_id: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive']),
  division: z.array(z.string()).min(1, 'Select at least one division'),
  parent_id: z.string().nullable(),
  // Pricing
  price: z.coerce.number().nullable(),
  emergency_price: z.coerce.number().nullable(),
  discount: z.coerce.number().nullable(),
  price_unit: z.string().nullable(),
  // Contract
  contract_type: z.enum(['preventive', 'area', 'general']).nullable(),
  item_kind: z.enum(['service', 'product']).nullable(),
  pricing_mode: z.enum(['fixed', 'by_condition']).nullable(),
  discount_scope: z.enum(['services_only', 'services_and_products']).nullable(),
  // Duration & Warranty
  duration: z.coerce.number().nullable(),
  warranty: z.coerce.number().nullable(),
  // Invoice text
  invoice_text_en: z.string().nullable(),
  invoice_text_ar: z.string().nullable(),
  // Photo requirement
  photo_requirement: z.enum(['none', 'before', 'after', 'both', 'optional']),
  // Feature toggles
  has_inventory: z.boolean(),
  inventory_items_list: z.array(
    z.object({ name: z.string().min(1), qty: z.coerce.number().min(0) }),
  ),
  has_reminders: z.boolean(),
  reminder_days: z.coerce.number().nullable(),
  qc_checklist: z.boolean(),
  spare_parts: z.boolean(),
  service_type: z.enum(['standard', 'configurable']),
  component_service_ids: z.array(
    z.object({ id: z.string(), qty: z.coerce.number().min(1).default(1) }),
  ).nullable(),
  qc_items: z.array(
    z.object({ label: z.string().min(1), max_score: z.coerce.number().min(0) }),
  ),
})

export type ServiceFormValues = z.infer<typeof serviceSchema>

export function toDefaults(
  node: Service | null,
  type: 'normal' | 'contract' | 'mobile',
  parentId: string | null,
  parentDivision?: string[] | null,
): ServiceFormValues {
  return {
    name_en: node?.name_en ?? '',
    name_ar: node?.name_ar ?? null,
    code: node?.code ?? null,
    legacy_service_id: node?.legacy_service_id ?? null,
    status: (node?.status as 'active' | 'inactive') ?? 'active',
    division: Array.isArray(node?.division) && node.division.length > 0
      ? node.division
      : (Array.isArray(parentDivision) && parentDivision.length > 0 ? parentDivision : []),
    parent_id: node?.parent_id ?? parentId,
    price: node?.price ?? null,
    emergency_price: node?.emergency_price ?? null,
    discount: node?.discount ?? null,
    price_unit: node?.price_unit ?? null,
    contract_type: (node?.contract_type as ServiceFormValues['contract_type']) ?? null,
    item_kind: node?.item_kind as ServiceFormValues['item_kind'] ?? 'service',
    pricing_mode: node?.pricing_mode as ServiceFormValues['pricing_mode'] ?? 'by_condition',
    discount_scope: node?.discount_scope as ServiceFormValues['discount_scope'] ?? 'services_only',
    duration: node?.duration ?? null,
    warranty: node?.warranty ?? null,
    invoice_text_en: node?.invoice_text_en ?? null,
    invoice_text_ar: node?.invoice_text_ar ?? null,
    photo_requirement: (node?.photo_requirement as ServiceFormValues['photo_requirement']) ?? 'none',
    has_inventory: Array.isArray(node?.inventory_items)
      ? (node.inventory_items as unknown[]).length > 0
      : !!node?.inventory_items,
    inventory_items_list: Array.isArray(node?.inventory_items)
      ? (node.inventory_items as Array<{ name: string; qty: number }>)
      : [],
    has_reminders: node?.reminder_days != null,
    reminder_days: node?.reminder_days ?? null,
    qc_checklist: node?.qc_checklist ?? false,
    spare_parts: node?.spare_parts ?? false,
    service_type: (node?.service_type as 'standard' | 'configurable') ?? 'standard',
    component_service_ids: Array.isArray(node?.components)
      ? (node.components as unknown[]).map((c) =>
          typeof c === 'string' ? { id: c, qty: 1 } : (c as { id: string; qty: number }),
        )
      : null,
    qc_items: Array.isArray(node?.qc_items)
      ? (node.qc_items as Array<{ label: string; max_score: number }>)
      : [],
  }
}

// ─── Re-exports from split files ──────────────────────────────────────────────

export { CoreSection, CatalogImageSection, StatusSection, DivisionSection } from './ServiceEditBasicInfo'
export {
  ContractSection, ItemKindSection, PricingModeSection, DiscountScopeSection,
  PricingSection, DurationWarrantySection, InvoiceTextSection, PhotoRequirementSection,
} from './ServiceEditPricing'
export { FeatureFieldsSection } from './ServiceEditFeatures'

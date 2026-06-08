'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import type { ContractFormData } from '@/types/contracts'
import { queryKeys } from '@/lib/queryKeys'

export function useCreateContractQuotation() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: ContractFormData) => {
      const { data: quotationNumber, error: rpcError } = await supabase.rpc(
        'generate_quotation_number',
      )
      if (rpcError)
        throw new Error(`Failed to generate quotation number: ${rpcError.message}`)

      const { data: contract, error } = await supabase
        .from('contracts')
        .insert({
          quotation_number: quotationNumber as string,
          status: 'draft',
          source_type: data.sourceType,
          service_customer_id: data.serviceCustomerId || null,
          phone_id: data.phoneId || null,
          customer_name: data.customerName,
          phone: data.phone,
          address: data.address,
          site_name: data.siteName,
          divisions: data.divisions,
          start_date: data.startDate,
          end_date: data.endDate,
          discount: data.discount,
          payment_mode: data.paymentMode,
          payment_frequency: data.paymentFrequency,
          building_tree: data.buildingTree as unknown as import('@/types/database.types').Json,
          notes: data.notes,
          monthly_value: data.monthlyValue,
          total_value: data.totalValue,
          agent_name: data.agentName,
          created_by: data.createdBy,
          area_count: data.areaCount,
          services_summary: data.servicesSummary,
        })
        .select()
        .single()
      if (error) throw error

      if (data.services.length > 0) {
        const serviceRows = data.services.map((s, i) => ({
          contract_id: contract.id,
          service_id: s.service_id,
          building_node_id: s.building_node_id,
          service_name: s.service_name,
          service_path: s.service_path,
          brand_id: s.brand_id,
          brand_name: s.brand_name,
          reliability_factor: s.reliability_factor,
          condition: s.condition,
          condition_factor: s.condition_factor,
          frequency: s.frequency,
          quantity: s.quantity,
          base_price: s.base_price,
          unit_price: s.unit_price,
          total_price: s.total_price,
          divisions: s.divisions,
          note: s.note,
          is_general: s.is_general,
          contract_type: s.contract_type,
          item_kind: s.item_kind,
          pricing_mode: s.pricing_mode,
          discount: s.discount,
          discount_scope: s.discount_scope,
          price_unit: s.price_unit,
          sort_order: i,
        }))
        const { error: svcError } = await supabase
          .from('contract_services')
          .insert(serviceRows)
        if (svcError) throw svcError
      }

      if (data.paymentMode === 'milestone' && data.milestones.length > 0) {
        const milestoneRows = data.milestones.map((m, i) => ({
          contract_id: contract.id,
          name: m.name,
          percentage: m.percentage,
          amount: m.amount,
          due_date: m.due_date,
          sort_order: i,
        }))
        const { error: msError } = await supabase
          .from('contract_milestones')
          .insert(milestoneRows)
        if (msError) throw msError
      }

      // Upload terms PDF if provided
      if (data.termsFile) {
        const ext = data.termsFile.name.split('.').pop() || 'pdf'
        const storagePath = `${contract.id}/terms_${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('contract-documents')
          .upload(storagePath, data.termsFile)
        if (!uploadError) {
          await supabase
            .from('contracts')
            .update({ terms_pdf_url: storagePath })
            .eq('id', contract.id)
        }
      }

      await logActivity({
        action: 'contract_created',
        module: 'contracts',
        entity_id: contract.id,
        details: `Quotation ${quotationNumber} created for ${data.customerName}`,
        performer_name: data.agentName,
      })

      return contract
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contracts.quotationsAll })
    },
  })
}

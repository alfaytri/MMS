import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { CustomerHistoryOrder, InstalledProduct, OrderStatus } from '@/types/orders'

export function useCustomerHistory(
  customerId: string | null,
  year: number,
  month: number,
  orderPage: number = 0,
  productPage: number = 0,
  pageSize: number = 4
) {
  const supabase = createClient()

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = new Date(year, month, 0).toISOString().split('T')[0]

  const orders = useQuery({
    queryKey: ['customer-history-orders', customerId, year, month, orderPage, pageSize],
    queryFn: async (): Promise<{ data: CustomerHistoryOrder[]; count: number }> => {
      if (!customerId) return { data: [], count: 0 }
      const { data, error, count } = await supabase
        .from('orders')
        .select('id, order_id, status, scheduled_date, has_invoice, invoice_number', { count: 'exact' })
        .eq('customer_id', customerId)
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate)
        .order('scheduled_date', { ascending: false })
        .range(orderPage * pageSize, (orderPage + 1) * pageSize - 1)
      if (error) throw error
      return {
        data: (data ?? []).map(
          (o) =>
            ({
              id: o.id,
              order_id: o.order_id,
              status: (o.status ?? 'tentative') as OrderStatus,
              scheduled_date: o.scheduled_date,
              has_invoice: o.has_invoice ?? false,
              invoice_number: o.invoice_number,
              services_summary: '',
            }) as CustomerHistoryOrder
        ),
        count: count ?? 0,
      }
    },
    enabled: !!customerId,
  })

  const products = useQuery({
    queryKey: ['customer-history-products', customerId, year, month, productPage, pageSize],
    queryFn: async (): Promise<{ data: InstalledProduct[]; count: number }> => {
      if (!customerId) return { data: [], count: 0 }
      const { data, error, count } = await supabase
        .from('installed_products')
        .select('*', { count: 'exact' })
        .eq('customer_id', customerId)
        .gte('installed_at', startDate)
        .lte('installed_at', endDate)
        .order('installed_at', { ascending: false })
        .range(productPage * pageSize, (productPage + 1) * pageSize - 1)
      if (error) throw error
      return { data: data ?? [], count: count ?? 0 }
    },
    enabled: !!customerId,
  })

  return { orders, products }
}

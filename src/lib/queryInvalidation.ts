import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'

/** Every query key the Inventory list + item pickers read stock / reservation numbers
 *  from. Any mutation that changes on-hand qty, reserved qty, or FIFO layers must call
 *  this so the list, category badges, and pickers refresh without a manual reload. */
export function invalidateInventoryStockViews(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: queryKeys.inventory.itemVariantsBatch })      // ['item-variants-batch']
  qc.invalidateQueries({ queryKey: ['category-stock-aggregates'] })
  qc.invalidateQueries({ queryKey: queryKeys.inventory.variantWarehouseStock })  // ['variant_warehouse_stock']
  qc.invalidateQueries({ queryKey: ['item-variant-division-stock'] })
  qc.invalidateQueries({ queryKey: ['variant-stock-by-division'] })
}

/** Customer credit views: master-data balance column, SO/customer payment
 *  "available credit", and the open-credit-notes list. */
export function invalidateCustomerCreditViews(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['customer-credit-balances'] })
  qc.invalidateQueries({ queryKey: ['open-credit-notes'] })
}

/** Supplier credit views: master-data balance column + open-debit-notes list. */
export function invalidateSupplierCreditViews(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['supplier-credit-balances'] })
  qc.invalidateQueries({ queryKey: ['open-debit-notes'] })
}

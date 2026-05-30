'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, addMonths, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, ChevronDown, ReceiptText, Wrench, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCustomerHistory } from '@/hooks/useCustomerHistory'
import { getWarrantyInfo } from '@/lib/orders/warrantyUtils'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { CustomerHistoryOrder, OrderStatus } from '@/types/orders'

const STATUS_COLORS: Record<OrderStatus, string> = {
  completed: 'bg-green-100 text-green-800',
  scheduled: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  'in-progress': 'bg-orange-100 text-orange-800',
  cancelled: 'bg-red-100 text-red-800',
  waitlist: 'bg-yellow-100 text-yellow-800',
  tentative: 'bg-slate-100 text-slate-600',
  'pending-confirmation': 'bg-orange-100 text-orange-800',
  'pending-approval': 'bg-yellow-100 text-yellow-800',
}

const WARRANTY_COLORS = {
  active: 'text-green-600',
  expiring_soon: 'text-yellow-600',
  expired: 'text-red-600',
}

const PAGE_SIZE = 4

// ---------------------------------------------------------------------------
// OrderHistoryCard — single order card with popover details + action dropdown
// ---------------------------------------------------------------------------

function OrderHistoryCard({
  order,
  onCreateBackwork,
  onCreateFollowUp,
}: {
  order: CustomerHistoryOrder
  onCreateBackwork?: (orderId: string) => void
  onCreateFollowUp?: (orderId: string) => void
}) {
  return (
    <Popover>
      <PopoverTrigger
        className="w-full rounded-lg border border-slate-200 px-2.5 py-2 space-y-0.5 text-left hover:border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-900">{order.order_id}</span>
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-xs font-medium',
              STATUS_COLORS[order.status as OrderStatus]
            )}
          >
            {order.status}
          </span>
        </div>
        {order.scheduled_date && (
          <p className="text-xs text-slate-500">
            {format(new Date(order.scheduled_date), 'dd MMM yyyy')}
          </p>
        )}
      </PopoverTrigger>

      <PopoverContent side="left" align="start" className="w-72 p-0 gap-0" sideOffset={8}>
        {/* Services list */}
        <div className="p-3 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Requested Services
          </p>
          {order.services.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No services</p>
          ) : (
            <div className="space-y-1.5">
              {order.services.map((s, i) => (
                <div key={i} className="flex items-start justify-between gap-3">
                  <span className="text-xs text-slate-700 leading-snug">
                    {s.qty > 1 && <span className="font-semibold">{s.qty}× </span>}
                    {s.name}
                  </span>
                  <span className="text-xs font-medium text-slate-500 shrink-0 pt-px">
                    {(s.price * s.qty).toLocaleString()} QAR
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Total + invoice badge */}
        <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
          <span className="text-xs font-semibold text-slate-900">
            Total: {order.total_amount.toLocaleString()} QAR
          </span>
          <Badge
            className={cn(
              'text-[10px] h-5',
              order.has_invoice
                ? 'bg-green-100 text-green-700 hover:bg-green-100'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-100'
            )}
          >
            {order.has_invoice ? 'Invoiced' : 'Not Invoiced'}
          </Badge>
        </div>

        {/* Action row */}
        {order.status === 'completed' && (
          <div className="border-t border-slate-100 px-3 py-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Actions
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  className="text-xs gap-2 cursor-pointer"
                  onClick={() => onCreateFollowUp?.(order.id)}
                >
                  <Repeat className="h-3.5 w-3.5" />
                  Follow Up
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs gap-2 cursor-pointer text-red-600 focus:text-red-600"
                  onClick={() => onCreateBackwork?.(order.id)}
                >
                  <Wrench className="h-3.5 w-3.5" />
                  Backwork
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function useCustomerQuotations(customerId: string | null) {
  return useQuery({
    queryKey: ['customer-quotations', customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('quotations')
        .select('id, quotation_id, status, total_amount')
        .eq('customer_id', customerId as string)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return data ?? []
    },
  })
}

interface Props {
  customerId: string | null
  onViewOrder?: (orderId: string) => void
  onCreateBackwork?: (orderId: string) => void
  onCreateFollowUp?: (orderId: string) => void
}

export function CustomerHistoryPanel({ customerId, onViewOrder, onCreateBackwork, onCreateFollowUp }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeMonth, setActiveMonth] = useState(new Date())
  const [orderPage, setOrderPage] = useState(0)
  const [productPage, setProductPage] = useState(0)

  const year = activeMonth.getFullYear()
  const month = activeMonth.getMonth() + 1

  const { orders, products } = useCustomerHistory(customerId, year, month, orderPage, productPage, PAGE_SIZE)
  const { data: customerQuotations, isLoading: quotationsLoading } = useCustomerQuotations(customerId)

  const orderItems = orders.data?.data ?? []
  const orderCount = orders.data?.count ?? 0
  const productItems = products.data?.data ?? []
  const productCount = products.data?.count ?? 0
  const orderTotalPages = Math.max(1, Math.ceil(orderCount / PAGE_SIZE))
  const productTotalPages = Math.max(1, Math.ceil(productCount / PAGE_SIZE))

  if (collapsed) {
    return (
      <div className="flex w-8 flex-col items-center border-l bg-slate-50 pt-4">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCollapsed(false)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex w-80 shrink-0 flex-col border-l bg-white">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-semibold text-slate-900">Customer History</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCollapsed(true)}>
          <ChevronRight className="h-4 w-4 rotate-180" />
        </Button>
      </div>

      {!customerId ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400 p-4 text-center">
          Lookup a customer to see their history
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Month strip */}
          <div className="flex items-center justify-between border-b px-3 py-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setActiveMonth((m) => subMonths(m, 1))
                setOrderPage(0)
                setProductPage(0)
              }}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs font-medium text-slate-700">{format(activeMonth, 'MMMM yyyy')}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setActiveMonth((m) => addMonths(m, 1))
                setOrderPage(0)
                setProductPage(0)
              }}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Orders section */}
          <div className="border-b px-2 py-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Orders</span>
              <Badge variant="secondary" className="text-xs">
                {orderCount}
              </Badge>
            </div>
            {orders.isLoading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : orderItems.length === 0 ? (
              <p className="text-xs text-slate-400">No orders in {format(activeMonth, 'MMMM')}</p>
            ) : (
              <div className="space-y-1.5">
                {orderItems.map((order) => (
                  <OrderHistoryCard
                    key={order.id}
                    order={order}
                    onCreateBackwork={onCreateBackwork}
                    onCreateFollowUp={onCreateFollowUp}
                  />
                ))}
              </div>
            )}
            {orderCount > PAGE_SIZE && (
              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <button
                  onClick={() => setOrderPage((p) => Math.max(0, p - 1))}
                  disabled={orderPage === 0}
                  className="disabled:opacity-30"
                >
                  ← Prev
                </button>
                <span>
                  {orderPage + 1}/{orderTotalPages}
                </span>
                <button
                  onClick={() => setOrderPage((p) => Math.min(orderTotalPages - 1, p + 1))}
                  disabled={orderPage >= orderTotalPages - 1}
                  className="disabled:opacity-30"
                >
                  Next →
                </button>
              </div>
            )}
          </div>

          {/* Products section */}
          <div className="px-2 py-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Installed Products</span>
              <Badge variant="secondary" className="text-xs">
                {productCount}
              </Badge>
            </div>
            {products.isLoading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : productItems.length === 0 ? (
              <p className="text-xs text-slate-400">No products installed in {format(activeMonth, 'MMMM')}</p>
            ) : (
              <div className="space-y-2">
                {productItems.map((product) => {
                  const warranty = getWarrantyInfo(product.warranty_expires_at, product.warranty_months)
                  return (
                    <div key={product.id} className="rounded-lg border border-slate-200 p-2.5 space-y-1">
                      <p className="text-xs font-semibold text-slate-900">{product.product_name}</p>
                      <p className="text-xs text-slate-500">
                        Installed: {format(new Date(product.installed_at), 'dd MMM yyyy')}
                      </p>
                      <p className={cn('text-xs font-medium', WARRANTY_COLORS[warranty.status])}>{warranty.label}</p>
                    </div>
                  )
                })}
              </div>
            )}
            {productCount > PAGE_SIZE && (
              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <button
                  onClick={() => setProductPage((p) => Math.max(0, p - 1))}
                  disabled={productPage === 0}
                  className="disabled:opacity-30"
                >
                  ← Prev
                </button>
                <span>
                  {productPage + 1}/{productTotalPages}
                </span>
                <button
                  onClick={() => setProductPage((p) => Math.min(productTotalPages - 1, p + 1))}
                  disabled={productPage >= productTotalPages - 1}
                  className="disabled:opacity-30"
                >
                  Next →
                </button>
              </div>
            )}
          </div>

          {/* Quotations */}
          <div className="border-t px-2 py-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quotations</span>
            </div>
            {quotationsLoading ? (
              <p className="px-4 py-2 text-xs text-slate-400">Loading…</p>
            ) : (!customerQuotations || customerQuotations.length === 0) ? (
              <p className="px-4 py-2 text-xs text-slate-400">No quotations yet</p>
            ) : (
              customerQuotations.map((q: any) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between px-4 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                >
                  <div>
                    <p className="text-xs font-mono font-semibold text-slate-700">
                      {q.quotation_id}
                    </p>
                    <p className="text-[11px] text-slate-400 capitalize">{q.status}</p>
                  </div>
                  <p className="text-xs font-medium text-slate-700">
                    QAR {(q.total_amount ?? 0).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

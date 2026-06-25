// src/app/(dashboard)/quotations/[id]/page.tsx
'use client'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronLeft, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import { PageContainer } from '@/components/shared/PageContainer'
import { QuotationPdfPreviewIframe } from '@/components/quotations/QuotationPdfPreviewIframe'
import { useQuotationDetail } from '@/hooks/useQuotationDetail'
import { computeDiscount, roundMoney } from '@/lib/money'
import { computeSubtotal } from '@/hooks/useCreateQuotation'
import { cn } from '@/lib/utils'
import type { QuotationDraft } from '@/types/quotations'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent:  'bg-blue-100 text-blue-800',
}

export default function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: q, isLoading } = useQuotationDetail(id)

  const previewDraft: QuotationDraft | null = q
    ? {
        quotationId: q.quotation_id,
        customerId: q.customer_id,
        phoneId: '',
        customerName: q.customer_name,
        phone: q.customer_phone,
        division: q.division,
        services: q.line_items.map((li) => ({
          serviceId: li.service_id ?? '',
          name: li.name,
          path: li.path,
          qty: li.qty,
          price: li.price,
          duration: li.duration,
          division: q.division,
        })),
        notes: q.notes ?? '',
        discountType: q.discount_type ?? 'flat',
        discountValue: q.discount_value ?? 0,
      }
    : null

  const previewSubtotal = previewDraft ? computeSubtotal(previewDraft.services) : 0
  const previewDiscountAmount = previewDraft
    ? computeDiscount(previewSubtotal, previewDraft.discountType, previewDraft.discountValue)
    : 0
  const previewTotal = previewDraft ? roundMoney(previewSubtotal - previewDiscountAmount) : 0

  return (
    <PageContainer compact className="flex flex-col h-full">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 border-b px-4 sm:px-6 py-3 sm:py-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-9 -ml-2"
          onClick={() => router.push('/quotations')}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>

        {isLoading || !q ? (
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Loading…</h1>
        ) : (
          <div className="flex flex-1 items-center gap-2 flex-wrap">
            <h1 className="font-mono text-xl sm:text-2xl font-bold text-foreground">
              {q.quotation_id}
            </h1>
            <Badge
              className={cn(
                'text-xs capitalize',
                STATUS_STYLES[q.status] ?? 'bg-muted text-muted-foreground',
              )}
            >
              {q.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              · {q.customer_name} · {q.customer_phone}
            </span>
            <Button
              size="sm"
              className="gap-1.5 h-9 ml-auto"
              onClick={() => router.push(`/quotations/${id}/edit`)}
            >
              <Pencil className="h-4 w-4" />
              <span className="hidden sm:inline">
                {q.status === 'draft' ? 'Edit & Send' : 'Edit & Resend'}
              </span>
              <span className="sm:hidden">Edit</span>
            </Button>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      {isLoading || !q ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : (
        <Tabs defaultValue="preview" className="flex flex-1 flex-col overflow-hidden">
          <TabsList variant="line" className="mx-4 sm:mx-6 mt-3 w-auto justify-start">
            {(['preview', 'logs'] as const).map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="capitalize px-3 py-1.5 text-sm rounded-none border-b-2 border-transparent data-active:border-orange-500"
              >
                {tab === 'preview' ? 'Preview' : 'Logs'}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="preview" className="mt-0 h-full">
              {previewDraft && q && (
                <QuotationPdfPreviewIframe
                  draft={previewDraft}
                  subtotal={previewSubtotal}
                  discountAmount={previewDiscountAmount}
                  total={previewTotal}
                  creatorName={null}
                  issuingDate={q.created_date ? format(new Date(q.created_date), 'dd MMM yyyy') : undefined}
                  validUntilDate={q.expiry_date ? format(new Date(q.expiry_date), 'dd MMM yyyy') : undefined}
                />
              )}
            </TabsContent>

            <TabsContent value="logs" className="mt-0 px-4 sm:px-6 py-3">
              {q.logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No log entries yet.</p>
              ) : (
                <div className="space-y-3">
                  {q.logs.map((log, i) => (
                    <div key={log.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-2 w-2 rounded-full bg-slate-300 mt-1" />
                        {i < q.logs.length - 1 && (
                          <div className="w-px flex-1 bg-slate-200 mt-1" />
                        )}
                      </div>
                      <div className="pb-3">
                        <p className="text-sm font-medium">
                          {log.action}{' '}
                          <span className="font-normal text-muted-foreground">
                            by {log.user_name}
                          </span>
                        </p>
                        {log.details && (
                          <p className="text-xs text-muted-foreground">{log.details}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      )}
    </PageContainer>
  )
}

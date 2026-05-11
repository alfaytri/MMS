// src/components/quotations/QuotationDetailSheet.tsx
'use client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { useQuotationDetail } from '@/hooks/useQuotationDetail'
import { QuotationPdfPreview } from './QuotationPdfPreview'
import { cn } from '@/lib/utils'
import type { QuotationDraft } from '@/types/quotations'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent:  'bg-blue-100 text-blue-800',
}

interface Props {
  quotationId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function QuotationDetailSheet({ quotationId, open, onOpenChange }: Props) {
  const { data: q, isLoading } = useQuotationDetail(quotationId)

  // Build a read-only QuotationDraft for the preview
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
      }
    : null

  const previewTotal = q?.line_items.reduce(
    (sum, li) => sum + li.price * li.qty,
    0,
  ) ?? 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        {isLoading || !q ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Loading…
          </div>
        ) : (
          <>
            <SheetHeader className="border-b px-4 py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <SheetTitle className="font-mono font-bold text-slate-900">
                  {q.quotation_id}
                </SheetTitle>
                <Badge
                  className={cn(
                    'text-xs capitalize',
                    STATUS_STYLES[q.status] ?? 'bg-slate-100 text-slate-600',
                  )}
                >
                  {q.status}
                </Badge>
              </div>
              <p className="text-sm text-slate-500">
                {q.customer_name} · {q.customer_phone}
              </p>
            </SheetHeader>

            <Tabs defaultValue="preview" className="flex flex-1 flex-col overflow-hidden">
              <TabsList
                variant="line"
                className="mx-4 mt-3 w-auto justify-start"
              >
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
                  {previewDraft && (
                    <QuotationPdfPreview
                      draft={previewDraft}
                      total={previewTotal}
                    />
                  )}
                </TabsContent>

                <TabsContent value="logs" className="mt-0 px-4 py-3">
                  {q.logs.length === 0 ? (
                    <p className="text-sm text-slate-400">No log entries yet.</p>
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
                              <span className="font-normal text-slate-500">
                                by {log.user_name}
                              </span>
                            </p>
                            {log.details && (
                              <p className="text-xs text-slate-500">{log.details}</p>
                            )}
                            <p className="text-xs text-slate-400">
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
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

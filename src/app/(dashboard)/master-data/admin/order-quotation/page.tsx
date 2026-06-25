import { PageWrapper } from '@/components/shared/PageWrapper'
import { OrderQuotationSettingsAdmin } from '@/components/master-data/OrderQuotationSettingsAdmin'

export const metadata = { title: 'Order Quotation Settings' }

export default function OrderQuotationSettingsPage() {
  return (
    <PageWrapper>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Order Quotation Settings</h2>
        <p className="text-sm text-muted-foreground">
          Default validity period applied to new order quotations.
        </p>
        <OrderQuotationSettingsAdmin />
      </div>
    </PageWrapper>
  )
}

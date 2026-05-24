import { PageWrapper } from '@/components/shared/PageWrapper'
import { PaymentMethodsAdmin } from '@/components/master-data/PaymentMethodsAdmin'

export const metadata = { title: 'Payment Methods' }

export default function PaymentMethodsPage() {
  return (
    <PageWrapper>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Payment Methods</h2>
        <PaymentMethodsAdmin />
      </div>
    </PageWrapper>
  )
}

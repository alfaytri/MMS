import { PageWrapper } from '@/components/shared/PageWrapper'
import { PaymentMethodsAdmin } from '@/components/master-data/PaymentMethodsAdmin'

export const metadata = { title: 'Payment Methods' }

export default function PaymentMethodsPage() {
  return (
    <PageWrapper>
      <PaymentMethodsAdmin />
    </PageWrapper>
  )
}

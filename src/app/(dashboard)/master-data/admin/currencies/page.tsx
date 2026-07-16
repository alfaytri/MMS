import { PageWrapper } from '@/components/shared/PageWrapper'
import { CurrenciesAdmin } from '@/components/master-data/CurrenciesAdmin'

export const metadata = { title: 'Currencies' }

export default function CurrenciesPage() {
  return (
    <PageWrapper>
      <CurrenciesAdmin />
    </PageWrapper>
  )
}

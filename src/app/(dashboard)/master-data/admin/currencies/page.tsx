import { PageWrapper } from '@/components/shared/PageWrapper'
import { CurrenciesAdmin } from '@/components/master-data/CurrenciesAdmin'

export const metadata = { title: 'Currencies' }

export default function CurrenciesPage() {
  return (
    <PageWrapper>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Currencies</h2>
        <CurrenciesAdmin />
      </div>
    </PageWrapper>
  )
}

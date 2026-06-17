'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DivisionFilter } from '@/components/layout/DivisionFilter'
import { ShoppingCart, Package, Receipt, AlertTriangle } from 'lucide-react'
import { PageContainer } from '@/components/shared/PageContainer'

const STAT_CARDS = [
  {
    title: 'Open Purchase Orders',
    icon: ShoppingCart,
    value: '—',
    description: 'Approved, awaiting receipt',
  },
  {
    title: 'Pending Approvals',
    icon: AlertTriangle,
    value: '—',
    description: 'POs awaiting approval',
  },
  {
    title: 'Low Stock Items',
    icon: Package,
    value: '—',
    description: 'Below reorder threshold',
  },
  {
    title: 'Outstanding Invoices',
    icon: Receipt,
    value: '—',
    description: 'Unpaid invoices',
  },
]

export default function DashboardPage() {
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null)

  return (
    <PageContainer>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl 2xl:text-4xl font-bold text-foreground">Dashboard</h1>
      </div>

      <DivisionFilter
        selected={selectedDivision}
        onSelect={setSelectedDivision}
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {STAT_CARDS.map((card) => (
          <Card key={card.title} className="2xl:p-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2 2xl:pb-4">
              <CardTitle className="text-sm 2xl:text-base font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className="h-4 w-4 2xl:h-6 2xl:w-6 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl 2xl:text-5xl font-bold">{card.value}</div>
              <p className="text-xs 2xl:text-sm text-muted-foreground mt-1">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageContainer>
  )
}

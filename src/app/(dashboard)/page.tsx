'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DivisionFilter } from '@/components/layout/DivisionFilter'
import { ShoppingCart, Package, Receipt, AlertTriangle } from 'lucide-react'
import { PageWrapper } from '@/components/shared/PageWrapper'

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
    <PageWrapper>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      </div>

      <DivisionFilter
        selected={selectedDivision}
        onSelect={setSelectedDivision}
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageWrapper>
  )
}

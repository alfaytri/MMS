'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { Ship, TrendingUp, FileText } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Button } from '@/components/ui/button'
import { useHasPermission } from '@/hooks/usePermissions'
import { ShipmentsSection, type ShipmentsSectionHandle } from '@/components/purchase/shipments/ShipmentsSection'
import { ForecastSection, type ForecastSectionHandle } from '@/components/purchase/forecast/ForecastSection'

export default function ShipmentsPage() {
  const shipmentsRef = useRef<ShipmentsSectionHandle>(null)
  const forecastRef = useRef<ForecastSectionHandle>(null)
  const canForecast = useHasPermission('purchase.forecast.view')

  return (
    <PageWrapper>
      <PageHeader
        title="Shipments & Forecast"
        description="Track shipments carrying your purchase orders, and plan upcoming purchases — all in one place"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Create switch — pick what to create */}
            <div className="inline-flex items-center rounded-lg border bg-background p-0.5 shadow-xs">
              <button
                onClick={() => shipmentsRef.current?.openCreate()}
                className="inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-sm font-medium hover:bg-accent"
              >
                <Ship className="h-4 w-4" /> New shipment
              </button>
              {canForecast && (
                <>
                  <span className="h-5 w-px bg-border" aria-hidden />
                  <button
                    onClick={() => forecastRef.current?.openCreate()}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-sm font-medium hover:bg-accent"
                  >
                    <TrendingUp className="h-4 w-4" /> New forecast
                  </button>
                </>
              )}
            </div>
            <Link href="/purchase/shipments/report">
              <Button variant="outline"><FileText className="h-4 w-4 mr-1.5" /> Report</Button>
            </Link>
          </div>
        }
      />

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Ship className="h-4 w-4" /> Shipments
        </h2>
        <ShipmentsSection ref={shipmentsRef} />
      </section>

      {canForecast && (
        <section className="space-y-3 pt-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <TrendingUp className="h-4 w-4" /> Forecast
          </h2>
          <ForecastSection ref={forecastRef} />
        </section>
      )}
    </PageWrapper>
  )
}

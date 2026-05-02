// src/components/services/inventory/ServiceLinksView.tsx
'use client'

import { useState, useMemo } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useServicesForLinks, useAllServiceLinks } from '@/hooks/useInventory'
import {
  buildTreeMap,
  buildBreadcrumbMap,
  buildParentIdSet,
  type ServiceInventoryLinkFull,
} from './serviceInventoryHelpers'
import { ServiceLinksColumnBrowser } from './ServiceLinksColumnBrowser'
import { ServiceLeafPanel } from './ServiceLeafPanel'

export function ServiceLinksView({ enabled }: { enabled: boolean }) {
  const [selectedLeafId, setSelectedLeafId] = useState<string | null>(null)

  const { data: allServices = [], isLoading: servicesLoading } = useServicesForLinks(enabled)
  const { data: allLinks = [], isLoading: linksLoading } = useAllServiceLinks(enabled)
  const isLoading = servicesLoading || linksLoading

  const treeMap = useMemo(() => buildTreeMap(allServices), [allServices])
  const breadcrumbs = useMemo(() => buildBreadcrumbMap(allServices), [allServices])
  const parentIds = useMemo(() => buildParentIdSet(allServices), [allServices])

  const linksByService = useMemo(() => {
    const map = new Map<string, ServiceInventoryLinkFull[]>()
    for (const link of allLinks) {
      const arr = map.get(link.service_id) ?? []
      arr.push(link)
      map.set(link.service_id, arr)
    }
    return map
  }, [allLinks])

  // Stats — leaf services only (no children)
  const leafIds = useMemo(
    () => allServices.filter((s) => !parentIds.has(s.id)).map((s) => s.id),
    [allServices, parentIds],
  )
  const supplyLinkedCount = useMemo(
    () =>
      leafIds.filter((id) =>
        (linksByService.get(id) ?? []).some((l) => l.link_type === 'supply'),
      ).length,
    [leafIds, linksByService],
  )
  const noSupplyCount = leafIds.length - supplyLinkedCount

  const selectedService = selectedLeafId
    ? (allServices.find((s) => s.id === selectedLeafId) ?? null)
    : null
  const selectedLinks = selectedLeafId
    ? (linksByService.get(selectedLeafId) ?? [])
    : []

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Stats bar ── */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-muted/20 shrink-0 flex-wrap">
        <span className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{leafIds.length}</span> services
        </span>
        <span className="text-xs text-emerald-700 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          <span className="font-semibold">{supplyLinkedCount}</span> supply linked
        </span>
        <span className="text-xs text-amber-700 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          <span className="font-semibold">{noSupplyCount}</span> no supply
        </span>
        <span className="text-xs text-muted-foreground ml-auto hidden sm:block">
          Navigate → select a service → manage links
        </span>
      </div>

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">
        <ServiceLinksColumnBrowser
          services={allServices}
          treeMap={treeMap}
          linksByService={linksByService}
          selectedLeafId={selectedLeafId}
          onLeafSelect={setSelectedLeafId}
        />

        {selectedService && (
          <ServiceLeafPanel
            serviceId={selectedService.id}
            serviceName={selectedService.name_en}
            breadcrumb={breadcrumbs.get(selectedService.id) ?? ''}
            links={selectedLinks}
            warranty={selectedService.warranty ?? null}
            onClose={() => setSelectedLeafId(null)}
          />
        )}
      </div>
    </div>
  )
}

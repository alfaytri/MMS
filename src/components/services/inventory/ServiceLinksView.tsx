// src/components/services/inventory/ServiceLinksView.tsx
'use client'

import { useState, useMemo } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useServicesForLinks, useAllServiceLinks } from '@/hooks/useInventory'
import {
  buildBreadcrumbMap,
  buildParentIdSet,
} from './serviceInventoryHelpers'
import { ServiceLinksMasterList } from './ServiceLinksMasterList'
import { ServiceLinksZeroState } from './ServiceLinksZeroState'
import { ServiceLinksBulkPanel } from './ServiceLinksBulkPanel'
import { ServiceLeafPanel } from './ServiceLeafPanel'

export function ServiceLinksView({ enabled }: { enabled: boolean }) {
  const { data: allServices = [], isLoading: servicesLoading } = useServicesForLinks(enabled)
  const { data: allLinks = [], isLoading: linksLoading } = useAllServiceLinks(enabled)
  const isLoading = servicesLoading || linksLoading

  const breadcrumbs = useMemo(() => buildBreadcrumbMap(allServices), [allServices])
  const parentIds = useMemo(() => buildParentIdSet(allServices), [allServices])

  // Leaf IDs: services with no children
  const leafIdSet = useMemo(
    () => new Set(allServices.filter(s => !parentIds.has(s.id)).map(s => s.id)),
    [allServices, parentIds],
  )

  // New state for master-detail layout
  const [activeId, setActiveId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())

  const handleToggleCheck = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleClearAll = () => setCheckedIds(new Set())

  // Derived values
  const leafServices = useMemo(
    () => allServices.filter(s => leafIdSet.has(s.id)),
    [allServices, leafIdSet],
  )

  const hasSupplySet = useMemo(
    () =>
      new Set(
        allLinks
          .filter(l => l.link_type === 'supply' && leafIdSet.has(l.service_id))
          .map(l => l.service_id),
      ),
    [allLinks, leafIdSet],
  )

  const linkedCount = hasSupplySet.size
  const noSupplyCount = leafServices.length - linkedCount

  const rightPanelMode: 'zero' | 'single' | 'bulk' =
    checkedIds.size >= 2 ? 'bulk' : activeId ? 'single' : 'zero'

  // Resolve selected service for ServiceLeafPanel
  const activeService = useMemo(
    () => (activeId ? (allServices.find(s => s.id === activeId) ?? null) : null),
    [activeId, allServices],
  )
  const activeLinks = useMemo(
    () =>
      activeId
        ? allLinks.filter(l => l.service_id === activeId)
        : [],
    [activeId, allLinks],
  )

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
    <div className="flex h-full">
      {/* Left panel — 40% on lg+, full-width when nothing selected (mobile/tablet) */}
      <div
        className={`
          h-full flex flex-col shrink-0
          lg:w-[40%]
          ${rightPanelMode === 'zero' ? 'w-full' : 'hidden lg:flex'}
        `}
      >
        <ServiceLinksMasterList
          leafServices={leafServices}
          breadcrumbMap={breadcrumbs}
          hasSupplySet={hasSupplySet}
          activeId={activeId}
          checkedIds={checkedIds}
          onActivate={setActiveId}
          onToggleCheck={handleToggleCheck}
          totalCount={leafServices.length}
          linkedCount={linkedCount}
          noSupplyCount={noSupplyCount}
        />
      </div>

      {/* Right panel — 60% on lg+, slides in on mobile/tablet */}
      <div
        className={`
          flex-1 h-full overflow-y-auto
          ${rightPanelMode === 'zero' ? 'hidden lg:block' : 'block'}
        `}
      >
        {/* Back button — mobile/tablet only, shown when right panel is active */}
        {rightPanelMode !== 'zero' && (
          <div className="lg:hidden border-b p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveId(null)
                setCheckedIds(new Set())
              }}
            >
              ← Back to list
            </Button>
          </div>
        )}

        {rightPanelMode === 'zero' && (
          <ServiceLinksZeroState
            leafServices={leafServices}
            breadcrumbMap={breadcrumbs}
            hasSupplySet={hasSupplySet}
          />
        )}

        {rightPanelMode === 'single' && activeId && activeService && (
          <ServiceLeafPanel
            serviceId={activeService.id}
            serviceName={activeService.name_en}
            breadcrumb={breadcrumbs.get(activeService.id) ?? ''}
            links={activeLinks}
            warranty={activeService.warranty ?? null}
            onClose={() => setActiveId(null)}
          />
        )}

        {rightPanelMode === 'bulk' && (
          <ServiceLinksBulkPanel
            checkedIds={checkedIds}
            services={allServices}
            allLinks={allLinks}
            onClearAll={handleClearAll}
          />
        )}
      </div>
    </div>
  )
}

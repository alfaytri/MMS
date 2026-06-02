// src/app/(dashboard)/master-data/services/page.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ListTree, FileText, Smartphone, Bell, Package, Tag,
  Filter, Plus, Ruler, Percent, Search, BookOpen, ClipboardCheck, Wrench, GripVertical,
  CheckCircle2, Clock,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DivisionMultiSelect } from '@/components/shared/DivisionMultiSelect'
import { ServiceTableView } from '@/components/services/ServiceTableView'
import { ContractTableView } from '@/components/services/ContractTableView'
import { ServiceEditDialog } from '@/components/services/ServiceEditDialog'
import { ServiceChangeHistoryDialog } from '@/components/services/ServiceChangeHistoryDialog'
import { NotificationsTab } from '@/components/services/NotificationsTab'
import { InstructionsTab } from '@/components/services/InstructionsTab'
import { InventoryTab } from '@/components/services/InventoryTab'
import { PromotionsTab } from '@/components/services/PromotionsTab'
import { usePendingAddRequests } from '@/hooks/useServiceChangeRequests'
import { useHasPermission } from '@/hooks/usePermissions'
import type { Service } from '@/hooks/useServices'

type TabKey = 'normal' | 'contract' | 'mobile' | 'reminders' | 'instructions' | 'inventory' | 'promotions'

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'normal', label: 'Normal', icon: ListTree },
  { key: 'contract', label: 'Contract', icon: FileText },
  { key: 'mobile', label: 'Mobile', icon: Smartphone },
  { key: 'reminders', label: 'Notifications', icon: Bell },
  { key: 'instructions', label: 'Instructions', icon: FileText },
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'promotions', label: 'Promotions', icon: Tag },
]

const CONTRACT_TYPES = [
  { key: 'preventive', label: 'Preventive', icon: FileText },
  { key: 'area', label: 'Area-Based', icon: Ruler },
  { key: 'general', label: 'General', icon: Percent },
]

type LinkageKey = 'inventory' | 'reminders' | 'instructions' | 'qc' | 'parts'

const LINKAGE_CHIPS: { key: LinkageKey; label: string; icon: React.ElementType }[] = [
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'reminders', label: 'Reminders', icon: Bell },
  { key: 'instructions', label: 'Instructions', icon: BookOpen },
  { key: 'qc', label: 'QC', icon: ClipboardCheck },
  { key: 'parts', label: 'Parts', icon: Wrench },
]

const FILTER_BAR_HIDDEN_TABS: TabKey[] = ['reminders', 'instructions', 'inventory', 'promotions']

export default function ServicesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('normal')
  const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(new Set(['normal']))
  const [divisionFilter, setDivisionFilter] = useState<string[]>([])
  const [contractTypeFilter, setContractTypeFilter] = useState<'all' | 'preventive' | 'area' | 'general'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [linkageFilter, setLinkageFilter] = useState<LinkageKey[]>([])
  const [dragMode, setDragMode] = useState(false)
  const [historyDialog, setHistoryDialog] = useState<{ serviceId: string; name: string } | null>(null)

  const canApprove = useHasPermission('master_data.services.approve')
  const { data: pendingAdds = [] } = usePendingAddRequests()

  const [editDialog, setEditDialog] = useState<{
    open: boolean
    mode: 'new' | 'edit'
    type: 'normal' | 'contract' | 'mobile'
    node: Service | null
    parentId: string | null
  }>({ open: false, mode: 'new', type: 'normal', node: null, parentId: null })

  function handleTabChange(tab: string) {
    const t = tab as TabKey
    setActiveTab(t)
    setDivisionFilter([])
    setContractTypeFilter('all')
    setSearchQuery('')
    setLinkageFilter([])
    setDragMode(false)
    setVisitedTabs((prev) => new Set([...prev, t]))
  }

  function toggleLinkage(key: LinkageKey) {
    setLinkageFilter((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  function openNew() {
    const type = activeTab === 'contract' ? 'contract' : activeTab === 'mobile' ? 'mobile' : 'normal'
    setEditDialog({ open: true, mode: 'new', type, node: null, parentId: null })
  }

  function openEdit(node: Service) {
    const type = activeTab === 'contract' ? 'contract' : activeTab === 'mobile' ? 'mobile' : 'normal'
    setEditDialog({ open: true, mode: 'edit', type, node, parentId: null })
  }

  function openAddChild(parentId: string) {
    const type = activeTab === 'contract' ? 'contract' : activeTab === 'mobile' ? 'mobile' : 'normal'
    setEditDialog({ open: true, mode: 'new', type, node: null, parentId })
  }

  const showFilterBar = !FILTER_BAR_HIDDEN_TABS.includes(activeTab)
  const isTreeTab = ['normal', 'contract', 'mobile'].includes(activeTab)
  const newButtonLabel =
    activeTab === 'contract' ? 'New Contract Service' :
    activeTab === 'mobile' ? 'New Mobile Service' :
    'New Service'

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] overflow-hidden">
      {/* TAB BAR */}
      <div className="px-4 pt-2 border-b border-border bg-card">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="h-9 w-full justify-start bg-transparent p-0 gap-0 overflow-x-auto flex-nowrap">
            {TABS.map(({ key, label, icon: Icon }) => (
              <TabsTrigger
                key={key}
                value={key}
                className="px-3 py-2 text-xs gap-1.5 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* FILTER BAR */}
      {showFilterBar && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card overflow-x-auto flex-nowrap">
          {/* Left side: search + filter chips */}
          {isTreeTab && (
            <>
              <div className="relative shrink-0">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search services…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 pl-6 w-44 text-[11px]"
                />
              </div>
              <div className="h-4 w-px bg-border shrink-0" />
              <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {LINKAGE_CHIPS.map(({ key, label, icon: Icon }) => (
                <Button
                  key={key}
                  variant={linkageFilter.includes(key) ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-[11px] gap-1 shrink-0"
                  onClick={() => toggleLinkage(key)}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </Button>
              ))}
              <div className="h-4 w-px bg-border shrink-0" />
            </>
          )}

          {/* Contract type filter */}
          {activeTab === 'contract' && CONTRACT_TYPES.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              variant={contractTypeFilter === key ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-[11px] gap-1 shrink-0"
              onClick={() =>
                setContractTypeFilter((prev) => (prev === key ? 'all' : key as typeof contractTypeFilter))
              }
            >
              <Icon className="h-3 w-3" />
              {label}
            </Button>
          ))}

          {/* Right side: division filter + action buttons */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <DivisionMultiSelect value={divisionFilter} onChange={setDivisionFilter} />
            {canApprove && (
              <Link href="/master-data/services/approvals">
                <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approvals
                </Button>
              </Link>
            )}
            {isTreeTab && (
              <>
                <Button
                  size="sm"
                  variant={dragMode ? 'default' : 'outline'}
                  className="h-7 text-[11px] gap-1"
                  onClick={() => setDragMode((d) => !d)}
                >
                  <GripVertical className="h-3.5 w-3.5" />
                  Reorder
                </Button>
                <Button size="sm" className="h-7 text-[11px] gap-1" onClick={openNew}>
                  <Plus className="h-3.5 w-3.5" />
                  {newButtonLabel}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT */}
      <div className="flex-1 overflow-auto bg-card">
        {activeTab === 'normal' && (
          <>
            {pendingAdds.length > 0 && (
              <div className="mx-4 mt-3 border border-dashed border-orange-300 rounded-lg p-3 bg-orange-50/50 space-y-2">
                <div className="text-xs font-medium text-orange-700 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Pending New Services ({pendingAdds.length})
                </div>
                {pendingAdds.map((req) => (
                  <div key={req.id} className="flex items-center justify-between text-sm bg-white/60 rounded px-3 py-1.5">
                    <div>
                      <span className="font-medium">{String(req.changes.name_en?.new ?? 'Unnamed')}</span>
                      {!!req.changes.name_ar?.new && (
                        <span className="text-muted-foreground ml-2 text-xs">{String(req.changes.name_ar.new)}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      by {req.requester?.full_name ?? 'Unknown'} — {formatDistanceToNow(new Date(req.requested_at), { addSuffix: true })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <ServiceTableView
              serviceType="normal"
              divisionFilter={divisionFilter}
              searchQuery={searchQuery}
              linkageFilter={linkageFilter}
              dragMode={dragMode}
              enabled={visitedTabs.has('normal')}
              onEdit={openEdit}
              onAddChild={openAddChild}
              onShowHistory={(id, name) => setHistoryDialog({ serviceId: id, name })}
            />
          </>
        )}
        {activeTab === 'contract' && (
          <ContractTableView
            typeFilter={contractTypeFilter}
            divisionFilter={divisionFilter}
            searchQuery={searchQuery}
            linkageFilter={linkageFilter}
            dragMode={dragMode}
            enabled={visitedTabs.has('contract')}
            onEdit={openEdit}
            onAddChild={openAddChild}
            onShowHistory={(id, name) => setHistoryDialog({ serviceId: id, name })}
          />
        )}
        {activeTab === 'mobile' && (
          <ServiceTableView
            serviceType="mobile"
            divisionFilter={divisionFilter}
            searchQuery={searchQuery}
            linkageFilter={linkageFilter}
            dragMode={dragMode}
            enabled={visitedTabs.has('mobile')}
            onEdit={openEdit}
            onAddChild={openAddChild}
            onShowHistory={(id, name) => setHistoryDialog({ serviceId: id, name })}
          />
        )}
        {activeTab === 'reminders' && (
          <NotificationsTab enabled={visitedTabs.has('reminders')} />
        )}
        {activeTab === 'instructions' && (
          <InstructionsTab enabled={visitedTabs.has('instructions')} />
        )}
        {activeTab === 'inventory' && (
          <InventoryTab enabled={visitedTabs.has('inventory')} />
        )}
        {activeTab === 'promotions' && (
          <PromotionsTab enabled={visitedTabs.has('promotions')} />
        )}
      </div>

      <ServiceEditDialog
        open={editDialog.open}
        onOpenChange={(open) => setEditDialog((s) => ({ ...s, open }))}
        mode={editDialog.mode}
        type={editDialog.type}
        node={editDialog.node}
        parentId={editDialog.parentId}
      />

      <ServiceChangeHistoryDialog
        open={!!historyDialog}
        onOpenChange={(open) => { if (!open) setHistoryDialog(null) }}
        serviceId={historyDialog?.serviceId ?? null}
        serviceName={historyDialog?.name ?? ''}
      />
    </div>
  )
}

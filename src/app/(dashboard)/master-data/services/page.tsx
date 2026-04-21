// src/app/(dashboard)/master-data/services/page.tsx
'use client'

import { useState } from 'react'
import {
  ListTree, FileText, Smartphone, Bell, Package, Tag,
  Filter, Plus, Ruler, Percent, ClipboardCheck, Wrench,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DivisionMultiSelect } from '@/components/shared/DivisionMultiSelect'
import { ServiceTableView } from '@/components/services/ServiceTableView'
import { ContractTableView } from '@/components/services/ContractTableView'
import { ServiceEditDialog } from '@/components/services/ServiceEditDialog'
import type { Service } from '@/hooks/useServices'

type TabKey = 'normal' | 'contract' | 'mobile' | 'reminders' | 'instructions' | 'inventory' | 'promotions'

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'normal', label: 'Normal Services', icon: ListTree },
  { key: 'contract', label: 'Contract Services', icon: FileText },
  { key: 'mobile', label: 'Mobile App Services', icon: Smartphone },
  { key: 'reminders', label: 'Notifications', icon: Bell },
  { key: 'instructions', label: 'Instructions', icon: FileText },
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'promotions', label: 'Promotions', icon: Tag },
]

const FEATURE_FILTERS = [
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'reminders', label: 'Reminders', icon: Bell },
  { key: 'instructions', label: 'Instr', icon: FileText },
  { key: 'qc', label: 'QC', icon: ClipboardCheck },
  { key: 'parts', label: 'Parts', icon: Wrench },
]

const CONTRACT_TYPES = [
  { key: 'preventive', label: 'Preventive', icon: FileText },
  { key: 'area', label: 'Area-Based', icon: Ruler },
  { key: 'general', label: 'General', icon: Percent },
]

const FILTER_BAR_HIDDEN_TABS: TabKey[] = ['reminders', 'instructions', 'inventory']

export default function ServicesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('normal')
  const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(new Set(['normal']))
  const [divisionFilter, setDivisionFilter] = useState<string[]>([])
  const [featureFilters, setFeatureFilters] = useState<Set<string>>(new Set())
  const [contractTypeFilter, setContractTypeFilter] = useState<'all' | 'preventive' | 'area' | 'general'>('all')
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
    setFeatureFilters(new Set())
    setContractTypeFilter('all')
    setVisitedTabs((prev) => new Set([...prev, t]))
  }

  function toggleFeatureFilter(key: string) {
    setFeatureFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
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
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground shrink-0">Filter by:</span>

          {/* Normal + Mobile: feature toggles */}
          {(activeTab === 'normal' || activeTab === 'mobile') && (
            <>
              {FEATURE_FILTERS.map(({ key, label, icon: Icon }) => (
                <Button
                  key={key}
                  variant={featureFilters.has(key) ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-[11px] gap-1 shrink-0"
                  onClick={() => toggleFeatureFilter(key)}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </Button>
              ))}
              {/* Active filter chips */}
              {featureFilters.size > 0 && Array.from(featureFilters).map((key) => {
                const f = FEATURE_FILTERS.find((ff) => ff.key === key)
                if (!f) return null
                return (
                  <Badge
                    key={key}
                    variant="secondary"
                    className="text-[10px] gap-1 cursor-pointer shrink-0"
                    onClick={() => toggleFeatureFilter(key)}
                  >
                    ✓ {f.label} ✕
                  </Badge>
                )
              })}
            </>
          )}

          {/* Contract: type filter */}
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

          {/* Right cluster */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {activeTab !== 'promotions' && (
              <DivisionMultiSelect value={divisionFilter} onChange={setDivisionFilter} />
            )}
            {isTreeTab && (
              <Button size="sm" className="h-7 text-[11px] gap-1" onClick={openNew}>
                <Plus className="h-3.5 w-3.5" />
                {newButtonLabel}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT */}
      <div className="flex-1 overflow-auto bg-card">
        {activeTab === 'normal' && (
          <ServiceTableView
            serviceType="normal"
            divisionFilter={divisionFilter}
            featureFilters={featureFilters}
            enabled={visitedTabs.has('normal')}
            onEdit={openEdit}
            onAddChild={openAddChild}
          />
        )}
        {activeTab === 'contract' && (
          <ContractTableView
            typeFilter={contractTypeFilter}
            divisionFilter={divisionFilter}
            enabled={visitedTabs.has('contract')}
            onEdit={openEdit}
            onAddChild={openAddChild}
          />
        )}
        {activeTab === 'mobile' && (
          <ServiceTableView
            serviceType="mobile"
            divisionFilter={divisionFilter}
            featureFilters={featureFilters}
            enabled={visitedTabs.has('mobile')}
            onEdit={openEdit}
            onAddChild={openAddChild}
          />
        )}
        {(activeTab === 'reminders' || activeTab === 'instructions' || activeTab === 'inventory' || activeTab === 'promotions') && (
          <div className="p-8 text-sm text-muted-foreground text-center">
            Coming in next plan
          </div>
        )}
      </div>

      {/* EDIT DIALOG — shared by all tree tabs */}
      <ServiceEditDialog
        open={editDialog.open}
        onOpenChange={(open) => setEditDialog((s) => ({ ...s, open }))}
        mode={editDialog.mode}
        type={editDialog.type}
        node={editDialog.node}
        parentId={editDialog.parentId}
      />
    </div>
  )
}

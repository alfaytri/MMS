# Services Hub — Inventory & Promotions Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Inventory tab (all items + services-with-inventory cross-reference) and Promotions tab (campaigns + vouchers) in the Services Hub at `/master-data/services`.

**Architecture:** Both tabs are read-only cross-reference views — entities are managed in their own dedicated modules, and these tabs give an operations overview. Two new hook files (`useInventory.ts`, `usePromotions.ts`) feed two new tab components (`InventoryTab`, `PromotionsTab`). `page.tsx` wires the tabs and removes the "Coming in next plan" placeholder.

**Tech Stack:** Next.js 15 App Router · TypeScript · Supabase (browser `createClient()`) · TanStack Query v5 · shadcn/ui · Tailwind CSS · Lucide icons

---

## ⚠️ Critical DB Facts

| Table | Key columns |
|---|---|
| `inventory_items` | `id`, `name_en`, `name_ar`, `sku`, `category_id`, `unit`, `cost_price`, `markup_percent`, `total_stock`, `linked_services_count` |
| `services` | `id`, `name_en`, `tree_type`, `inventory_items` (Json\|null — array of linked items) |
| `promotion_campaigns` | `id`, `name`, `description`, `start_date`, `end_date`, `status` (enum: `'active'\|'scheduled'\|'expired'\|'disabled'`), `applicable_to`, `divisions` |
| `promotion_rules` | `id`, `campaign_id`, `type` (enum: `'percentage_discount'\|'fixed_discount'\|'buy_x_get_y_free'\|'buy_x_discount_get_y'`), `description`, `service_ids`, `discount_amount`, `discount_percent` |
| `vouchers` | `id`, `code`, `campaign_id`, `type` (enum: `'single_use'\|'multi_use'\|'limited'`), `is_active`, `usage_count`, `usage_limit`, `expires_at` |

Enums:
- `campaign_status`: `'active' | 'scheduled' | 'expired' | 'disabled'`
- `promotion_rule_type`: `'percentage_discount' | 'fixed_discount' | 'buy_x_get_y_free' | 'buy_x_discount_get_y'`
- `voucher_type`: `'single_use' | 'multi_use' | 'limited'`

Type helpers (from `@/types/database.types`):
- `DBTable<'inventory_items'>` — Row type for inventory_items
- `DBTable<'promotion_campaigns'>` — Row type for promotion_campaigns
- `DBTable<'promotion_rules'>` — Row type for promotion_rules
- `DBTable<'vouchers'>` — Row type for vouchers

**Critical patterns (must match exactly or quality review will fail):**
- `staleTime: 5 * 60 * 1000` (never `5 * 60_000`)
- Import: `import type { DBTable } from '@/types/database.types'`
- Supabase client: `const supabase = createClient()` from `@/lib/supabase/client`
- Error: `if (error) throw error`
- Tab trigger style: `"text-xs px-0 py-1.5 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none"`
- Loading spinner: `<div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />`
- Props interface for top-level tabs: `{ enabled: boolean }`

---

## File Map

```
src/hooks/
  useInventory.ts            NEW — useInventoryItems, useServicesWithInventory
  usePromotions.ts           NEW — usePromotionCampaigns (with rules embedded), useVouchers

src/components/services/
  InventoryTab.tsx           NEW — "Items" sub-tab (inventory_items list) + "Service Items" sub-tab (services with inventory JSON)
  PromotionsTab.tsx          NEW — "Campaigns" sub-tab (campaigns + rules) + "Vouchers" sub-tab

src/app/(dashboard)/master-data/services/
  page.tsx                   EDIT — import + render InventoryTab and PromotionsTab, add 'promotions' to FILTER_BAR_HIDDEN_TABS
```

---

## Task 1: useInventory.ts

**Files:**
- Create: `src/hooks/useInventory.ts`

- [ ] **Step 1: Create the file**

```ts
// src/hooks/useInventory.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'

type InventoryItem = DBTable<'inventory_items'>

type ServiceWithInventory = {
  id: string
  name_en: string
  tree_type: string | null
  inventory_items: unknown
}

export type { InventoryItem, ServiceWithInventory }

export function useInventoryItems(enabled = true) {
  return useQuery({
    queryKey: ['inventory_items'],
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name_en')
      if (error) throw error
      return (data ?? []) as InventoryItem[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useServicesWithInventory(enabled = true) {
  return useQuery({
    queryKey: ['services_with_inventory'],
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('services')
        .select('id, name_en, tree_type, inventory_items')
        .not('inventory_items', 'is', null)
        .order('name_en')
      if (error) throw error
      return (data ?? []).map((row) => ({
        id: row.id,
        name_en: row.name_en,
        tree_type: row.tree_type ?? null,
        inventory_items: row.inventory_items,
      })) as ServiceWithInventory[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add src/hooks/useInventory.ts
git commit -m "feat(services): add useInventory — inventory items + services-with-inventory hooks"
```

---

## Task 2: usePromotions.ts

**Files:**
- Create: `src/hooks/usePromotions.ts`

- [ ] **Step 1: Create the file**

```ts
// src/hooks/usePromotions.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'

type PromotionCampaign = DBTable<'promotion_campaigns'>
type PromotionRule = DBTable<'promotion_rules'>
type Voucher = DBTable<'vouchers'>

export type CampaignWithRules = PromotionCampaign & {
  promotion_rules: PromotionRule[]
}

export type VoucherWithCampaign = Voucher & {
  promotion_campaigns: { name: string } | null
}

export type { PromotionCampaign, PromotionRule, Voucher }

export function usePromotionCampaigns(enabled = true) {
  return useQuery({
    queryKey: ['promotion_campaigns'],
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('promotion_campaigns')
        .select('*, promotion_rules(*)')
        .order('start_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as CampaignWithRules[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useVouchers(enabled = true) {
  return useQuery({
    queryKey: ['vouchers'],
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('vouchers')
        .select('*, promotion_campaigns(name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as VoucherWithCampaign[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add src/hooks/usePromotions.ts
git commit -m "feat(services): add usePromotions — campaigns (with rules) + vouchers hooks"
```

---

## Task 3: InventoryTab

**Files:**
- Create: `src/components/services/InventoryTab.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/services/InventoryTab.tsx
'use client'

import { useState } from 'react'
import { Package } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useInventoryItems, useServicesWithInventory } from '@/hooks/useInventory'

interface InventoryTabProps {
  enabled: boolean
}

export function InventoryTab({ enabled }: InventoryTabProps) {
  return (
    <Tabs defaultValue="items" className="flex flex-col h-full">
      <div className="px-4 pt-2 border-b border-border">
        <TabsList className="h-8 bg-transparent p-0 gap-4">
          <TabsTrigger value="items" className="text-xs px-0 py-1.5 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none">
            Items
          </TabsTrigger>
          <TabsTrigger value="service-items" className="text-xs px-0 py-1.5 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none">
            Service Items
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="items" className="flex-1 overflow-auto m-0">
        <ItemsSubTab enabled={enabled} />
      </TabsContent>

      <TabsContent value="service-items" className="flex-1 overflow-auto m-0">
        <ServiceItemsSubTab enabled={enabled} />
      </TabsContent>
    </Tabs>
  )
}

function ItemsSubTab({ enabled }: { enabled: boolean }) {
  const { data: items = [], isLoading } = useInventoryItems(enabled)
  const [search, setSearch] = useState('')

  const filtered = items.filter((item) =>
    item.name_en.toLowerCase().includes(search.toLowerCase()) ||
    item.sku.toLowerCase().includes(search.toLowerCase()) ||
    (item.name_ar ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Input
          placeholder="Search by name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs w-72"
        />
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} items</span>
      </div>

      <div className="p-4">
        <div className="rounded border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-[11px] h-8">Name</TableHead>
                <TableHead className="text-[11px] h-8">SKU</TableHead>
                <TableHead className="text-[11px] h-8">Unit</TableHead>
                <TableHead className="text-[11px] h-8 text-right">Cost</TableHead>
                <TableHead className="text-[11px] h-8 text-right">Stock</TableHead>
                <TableHead className="text-[11px] h-8 text-right">Services</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                    {search ? 'No items match your search' : 'No inventory items found'}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((item) => (
                <TableRow key={item.id} className="text-xs">
                  <TableCell>
                    <div className="font-medium">{item.name_en}</div>
                    {item.name_ar && (
                      <div className="text-[10px] text-muted-foreground" dir="rtl">{item.name_ar}</div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-[11px]">{item.sku}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell className="text-right">
                    {item.cost_price != null ? `QAR ${item.cost_price.toFixed(2)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={item.total_stock != null && item.total_stock < 10
                      ? 'text-destructive font-medium'
                      : ''
                    }>
                      {item.total_stock ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.linked_services_count ?? 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

function ServiceItemsSubTab({ enabled }: { enabled: boolean }) {
  const { data: services = [], isLoading } = useServicesWithInventory(enabled)
  const [search, setSearch] = useState('')

  const filtered = services.filter((s) =>
    s.name_en.toLowerCase().includes(search.toLowerCase()),
  )

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
        <Package className="h-8 w-8 opacity-30" />
        <p className="text-xs">No services have inventory items linked</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Input
          placeholder="Search services…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs w-64"
        />
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} services</span>
      </div>

      <div className="p-4">
        <div className="rounded border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-[11px] h-8">Service</TableHead>
                <TableHead className="text-[11px] h-8">Type</TableHead>
                <TableHead className="text-[11px] h-8 text-right">Items Linked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-8">
                    No services match your search
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((service) => {
                const itemCount = Array.isArray(service.inventory_items)
                  ? service.inventory_items.length
                  : 1
                return (
                  <TableRow key={service.id} className="text-xs">
                    <TableCell className="font-medium">{service.name_en}</TableCell>
                    <TableCell>
                      <Badge className="text-[10px] px-1.5 py-0 border-0 bg-slate-100 text-slate-600 capitalize">
                        {service.tree_type ?? 'normal'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{itemCount}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add src/components/services/InventoryTab.tsx
git commit -m "feat(services): add InventoryTab — items list + service-items cross-reference"
```

---

## Task 4: PromotionsTab

**Files:**
- Create: `src/components/services/PromotionsTab.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/services/PromotionsTab.tsx
'use client'

import { useState } from 'react'
import { Tag } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { usePromotionCampaigns, useVouchers, type CampaignWithRules, type VoucherWithCampaign } from '@/hooks/usePromotions'

const CAMPAIGN_STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  scheduled: 'bg-blue-100 text-blue-700',
  expired: 'bg-slate-100 text-slate-500',
  disabled: 'bg-red-100 text-red-600',
}

const RULE_TYPE_LABEL: Record<string, string> = {
  percentage_discount: '% Discount',
  fixed_discount: 'Fixed Off',
  buy_x_get_y_free: 'Buy X Get Y',
  buy_x_discount_get_y: 'Buy X Disc Y',
}

const VOUCHER_TYPE_COLOR: Record<string, string> = {
  single_use: 'bg-purple-100 text-purple-700',
  multi_use: 'bg-blue-100 text-blue-700',
  limited: 'bg-orange-100 text-orange-700',
}

interface PromotionsTabProps {
  enabled: boolean
}

export function PromotionsTab({ enabled }: PromotionsTabProps) {
  return (
    <Tabs defaultValue="campaigns" className="flex flex-col h-full">
      <div className="px-4 pt-2 border-b border-border">
        <TabsList className="h-8 bg-transparent p-0 gap-4">
          <TabsTrigger value="campaigns" className="text-xs px-0 py-1.5 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none">
            Campaigns
          </TabsTrigger>
          <TabsTrigger value="vouchers" className="text-xs px-0 py-1.5 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none">
            Vouchers
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="campaigns" className="flex-1 overflow-auto m-0">
        <CampaignsSubTab enabled={enabled} />
      </TabsContent>

      <TabsContent value="vouchers" className="flex-1 overflow-auto m-0">
        <VouchersSubTab enabled={enabled} />
      </TabsContent>
    </Tabs>
  )
}

function CampaignsSubTab({ enabled }: { enabled: boolean }) {
  const { data: campaigns = [], isLoading } = usePromotionCampaigns(enabled)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.description ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  const selectedCampaign = campaigns.find((c) => c.id === selectedId) ?? null

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
        <Tag className="h-8 w-8 opacity-30" />
        <p className="text-xs">No promotion campaigns found</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Input
          placeholder="Search campaigns…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs w-64"
        />
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} campaigns</span>
      </div>

      <div className="p-4 space-y-4">
        <div className="rounded border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-[11px] h-8">Campaign</TableHead>
                <TableHead className="text-[11px] h-8">Status</TableHead>
                <TableHead className="text-[11px] h-8">Start</TableHead>
                <TableHead className="text-[11px] h-8">End</TableHead>
                <TableHead className="text-[11px] h-8">Applicable To</TableHead>
                <TableHead className="text-[11px] h-8 text-right">Rules</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                    No campaigns match your search
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((campaign: CampaignWithRules) => (
                <TableRow
                  key={campaign.id}
                  className={`text-xs cursor-pointer transition-colors ${selectedId === campaign.id ? 'bg-muted/40' : 'hover:bg-muted/20'}`}
                  onClick={() => setSelectedId(selectedId === campaign.id ? null : campaign.id)}
                >
                  <TableCell>
                    <div className="font-medium">{campaign.name}</div>
                    {campaign.description && (
                      <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{campaign.description}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] px-1.5 py-0 border-0 ${CAMPAIGN_STATUS_COLOR[campaign.status ?? 'disabled'] ?? ''}`}>
                      {campaign.status ?? 'disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(campaign.start_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(campaign.end_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{campaign.applicable_to ?? '—'}</TableCell>
                  <TableCell className="text-right">{campaign.promotion_rules.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {selectedCampaign && selectedCampaign.promotion_rules.length > 0 && (
          <div className="rounded border border-border overflow-hidden">
            <div className="px-3 py-1.5 bg-muted/30 border-b border-border text-[11px] font-medium text-muted-foreground">
              Rules — {selectedCampaign.name}
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10">
                  <TableHead className="text-[11px] h-7">Type</TableHead>
                  <TableHead className="text-[11px] h-7">Description</TableHead>
                  <TableHead className="text-[11px] h-7 text-right">Discount %</TableHead>
                  <TableHead className="text-[11px] h-7 text-right">Fixed Off</TableHead>
                  <TableHead className="text-[11px] h-7 text-right">Services</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedCampaign.promotion_rules.map((rule) => (
                  <TableRow key={rule.id} className="text-xs">
                    <TableCell>
                      <Badge className="text-[10px] px-1.5 py-0 border-0 bg-blue-50 text-blue-700">
                        {RULE_TYPE_LABEL[rule.type] ?? rule.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{rule.description ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      {rule.discount_percent != null ? `${rule.discount_percent}%` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {rule.discount_amount != null ? `QAR ${rule.discount_amount.toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {Array.isArray(rule.service_ids) ? rule.service_ids.length : 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}

function VouchersSubTab({ enabled }: { enabled: boolean }) {
  const { data: vouchers = [], isLoading } = useVouchers(enabled)
  const [search, setSearch] = useState('')

  const filtered = vouchers.filter((v) =>
    v.code.toLowerCase().includes(search.toLowerCase()) ||
    ((v.promotion_campaigns as { name?: string } | null)?.name ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (vouchers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
        <Tag className="h-8 w-8 opacity-30" />
        <p className="text-xs">No vouchers found</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Input
          placeholder="Search by code or campaign…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs w-72"
        />
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} vouchers</span>
      </div>

      <div className="p-4">
        <div className="rounded border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-[11px] h-8">Code</TableHead>
                <TableHead className="text-[11px] h-8">Type</TableHead>
                <TableHead className="text-[11px] h-8">Campaign</TableHead>
                <TableHead className="text-[11px] h-8">Status</TableHead>
                <TableHead className="text-[11px] h-8 text-right">Usage</TableHead>
                <TableHead className="text-[11px] h-8">Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                    No vouchers match your search
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((voucher: VoucherWithCampaign) => {
                const campaignName = (voucher.promotion_campaigns as { name?: string } | null)?.name ?? '—'
                const usageDisplay = voucher.usage_limit != null
                  ? `${voucher.usage_count ?? 0} / ${voucher.usage_limit}`
                  : `${voucher.usage_count ?? 0}`
                return (
                  <TableRow key={voucher.id} className="text-xs">
                    <TableCell className="font-mono font-medium">{voucher.code}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] px-1.5 py-0 border-0 ${VOUCHER_TYPE_COLOR[voucher.type ?? 'single_use'] ?? ''}`}>
                        {voucher.type ?? 'single_use'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{campaignName}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={voucher.is_active
                          ? 'border-green-500 text-green-600 text-[10px]'
                          : 'text-[10px] text-muted-foreground'}
                      >
                        {voucher.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{usageDisplay}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {voucher.expires_at ? new Date(voucher.expires_at).toLocaleDateString() : '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add src/components/services/PromotionsTab.tsx
git commit -m "feat(services): add PromotionsTab — campaigns (with expandable rules) + vouchers"
```

---

## Task 5: Wire page.tsx

**Files:**
- Modify: `src/app/(dashboard)/master-data/services/page.tsx`

- [ ] **Step 1: Add imports after the InstructionsTab import line**

Find this block in `page.tsx`:

```tsx
import { InstructionsTab } from '@/components/services/InstructionsTab'
```

Replace with:

```tsx
import { InstructionsTab } from '@/components/services/InstructionsTab'
import { InventoryTab } from '@/components/services/InventoryTab'
import { PromotionsTab } from '@/components/services/PromotionsTab'
```

- [ ] **Step 2: Add 'promotions' to FILTER_BAR_HIDDEN_TABS**

Find:

```tsx
const FILTER_BAR_HIDDEN_TABS: TabKey[] = ['reminders', 'instructions', 'inventory']
```

Replace with:

```tsx
const FILTER_BAR_HIDDEN_TABS: TabKey[] = ['reminders', 'instructions', 'inventory', 'promotions']
```

- [ ] **Step 3: Replace the "Coming in next plan" placeholder**

Find this block in `page.tsx`:

```tsx
        {(activeTab === 'inventory' || activeTab === 'promotions') && (
          <div className="p-8 text-sm text-muted-foreground text-center">
            Coming in next plan
          </div>
        )}
```

Replace with:

```tsx
        {activeTab === 'inventory' && (
          <InventoryTab enabled={visitedTabs.has('inventory')} />
        )}
        {activeTab === 'promotions' && (
          <PromotionsTab enabled={visitedTabs.has('promotions')} />
        )}
```

- [ ] **Step 4: Remove the redundant DivisionMultiSelect guard**

The existing page.tsx has:

```tsx
            {activeTab !== 'promotions' && (
              <DivisionMultiSelect value={divisionFilter} onChange={setDivisionFilter} />
            )}
```

Now that `promotions` is in `FILTER_BAR_HIDDEN_TABS`, the outer `showFilterBar` guard already hides the filter bar for promotions. Remove the `activeTab !== 'promotions'` condition so `DivisionMultiSelect` always renders when the filter bar is shown:

```tsx
            <DivisionMultiSelect value={divisionFilter} onChange={setDivisionFilter} />
```

- [ ] **Step 5: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd D:/MMS && git add src/app/(dashboard)/master-data/services/page.tsx
git commit -m "feat(services): wire InventoryTab and PromotionsTab into ServicesPage"
```

---

## Task 6: Integration Test + PROGRESS.md

**Files:**
- Modify: `D:/MMS/PROGRESS.md`

- [ ] **Step 1: Run full TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 2: Update PROGRESS.md**

In `PROGRESS.md`, find:

```
| `docs/superpowers/plans/2026-04-21-services-hub-inventory-promotions.md` | ⏳ UPCOMING | Services Hub — Inventory tab (linked items tree), Promotions tab (campaigns + vouchers) |
```

Replace with:

```
| `docs/superpowers/plans/2026-04-21-services-hub-inventory-promotions.md` | ✅ DONE | Services Hub — Inventory tab (linked items tree), Promotions tab (campaigns + vouchers) |
```

Then update the `## 🔄 In Progress` section:

Find:
```
Next: Services Hub — Inventory & Promotions tab (plan: `docs/superpowers/plans/2026-04-21-services-hub-inventory-promotions.md`)
```

Replace with:
```
Next: Review Phase 1 cleanup backlog and determine next plan
```

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — Services Hub Inventory & Promotions plan complete"
```

---

## Self-Review

**Spec coverage:**
- Inventory tab with two sub-tabs (Items + Service Items) ✅ Task 3
- Promotions tab with two sub-tabs (Campaigns + Vouchers) ✅ Task 4
- Hooks for inventory items and services-with-inventory ✅ Task 1
- Hooks for campaigns (with rules) and vouchers ✅ Task 2
- page.tsx wired, filter bar updated ✅ Task 5
- FILTER_BAR_HIDDEN_TABS updated for promotions ✅ Task 5 Step 2
- Redundant `activeTab !== 'promotions'` guard removed ✅ Task 5 Step 4

**Placeholder scan:** No TBD, no TODO, no "implement later". All code blocks are complete. ✅

**Type consistency:**
- `InventoryItem` from `useInventory.ts` used in `InventoryTab.tsx` ✅
- `ServiceWithInventory` from `useInventory.ts` used in `InventoryTab.tsx` ✅
- `CampaignWithRules`, `VoucherWithCampaign` from `usePromotions.ts` used in `PromotionsTab.tsx` ✅
- `useInventoryItems(enabled)`, `useServicesWithInventory(enabled)` — `enabled` param matches call sites ✅
- `usePromotionCampaigns(enabled)`, `useVouchers(enabled)` — `enabled` param matches call sites ✅

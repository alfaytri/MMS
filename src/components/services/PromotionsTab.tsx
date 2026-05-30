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
import { usePromotionCampaigns, useVouchers, type CampaignWithRules, type VoucherWithCampaign, type PromotionRule } from '@/hooks/usePromotions'

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
          onChange={(e) => { setSearch(e.target.value); setSelectedId(null) }}
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
              {filtered.map((campaign) => (
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
                    {campaign.start_date ? new Date(campaign.start_date).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {campaign.end_date ? new Date(campaign.end_date).toLocaleDateString() : '—'}
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
                {selectedCampaign.promotion_rules.map((rule: PromotionRule) => (
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
    (v.promotion_campaigns?.name ?? '').toLowerCase().includes(search.toLowerCase()),
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
              {filtered.map((voucher) => {
                const campaignName = voucher.promotion_campaigns?.name ?? '—'
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

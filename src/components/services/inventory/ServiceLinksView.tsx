'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight, ChevronDown, Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  useServicesForLinks,
  useAllServiceLinks,
  useAddServiceInventoryLink,
  useDeleteServiceInventoryLink,
  useUpdateServiceInventoryLink,
  useInventoryItemsAll,
  useInventoryBrandVariants,
} from '@/hooks/useInventory'
import {
  LINK_TYPE_CONFIG,
  WARRANTY_OPTIONS,
  collectLeaves,
  buildBreadcrumbMap,
  type LinkType,
  type ServiceInventoryLinkFull,
  type ServiceNode,
} from './serviceInventoryHelpers'

type TreeTypeFilter = 'all' | 'normal' | 'contract' | 'mobile'
type StatusFilter = 'all' | 'linked' | 'unlinked'

// ─── NewLinkDialog ────────────────────────────────────────────────────────────

function NewLinkDialog({
  services,
  breadcrumbs,
  preselectedServiceId,
  onClose,
}: {
  services: ServiceNode[]
  breadcrumbs: Map<string, string>
  preselectedServiceId?: string
  onClose: () => void
}) {
  const [step, setStep] = useState<'service' | 'variant'>(
    preselectedServiceId ? 'variant' : 'service',
  )
  const [serviceId, setServiceId] = useState(preselectedServiceId ?? '')
  const [itemId, setItemId] = useState<string | null>(null)
  const [variantId, setVariantId] = useState('')
  const [linkType, setLinkType] = useState<LinkType>('consumable')
  const [warrantyMonths, setWarrantyMonths] = useState(0)
  const [quantity, setQuantity] = useState(1)

  const { data: items = [] } = useInventoryItemsAll(step === 'variant')
  const { data: variants = [] } = useInventoryBrandVariants(itemId)
  const addLink = useAddServiceInventoryLink()

  const selectedService = services.find((s) => s.id === serviceId)

  function handleSave() {
    if (!serviceId || !variantId) return
    addLink.mutate(
      { service_id: serviceId, brand_variant_id: variantId, link_type: linkType, quantity, warranty_months: warrantyMonths },
      {
        onSuccess: () => { toast.success('Link created'); onClose() },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-lg sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>New Service Link</DialogTitle>
        </DialogHeader>

        {step === 'service' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Pick a service to link an item to.</p>
            <Command className="rounded-md border border-border">
              <CommandInput placeholder="Search services…" className="text-xs" />
              <CommandList className="max-h-64">
                <CommandEmpty className="text-xs py-4 text-center text-muted-foreground">
                  No services found
                </CommandEmpty>
                <CommandGroup>
                  {services.map((s) => (
                    <CommandItem
                      key={s.id}
                      value={s.name_en}
                      onSelect={() => { setServiceId(s.id); setStep('variant') }}
                      className="text-xs cursor-pointer flex flex-col items-start gap-0.5"
                    >
                      <span>{s.name_en}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {breadcrumbs.get(s.id) ?? ''}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        )}

        {step === 'variant' && (
          <div className="space-y-4">
            {selectedService && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Service:</span>
                <span className="font-medium">{selectedService.name_en}</span>
                {!preselectedServiceId && (
                  <button
                    onClick={() => setStep('service')}
                    className="text-blue-600 underline underline-offset-2"
                  >
                    change
                  </button>
                )}
              </div>
            )}

            <div>
              <p className="text-xs font-medium mb-1.5">Item</p>
              <Select value={itemId ?? ''} onValueChange={(v: string | null) => { setItemId(v); setVariantId('') }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select item…" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item: { id: string; name_en: string; sku: string }) => (
                    <SelectItem key={item.id} value={item.id} className="text-xs">
                      {item.name_en} · {item.sku}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {itemId && (
              <div>
                <p className="text-xs font-medium mb-1.5">Brand variant</p>
                <Select value={variantId} onValueChange={(v: string | null) => setVariantId(v ?? '')}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select variant…" />
                  </SelectTrigger>
                  <SelectContent>
                    {variants.map((v: { id: string; brand: string }) => (
                      <SelectItem key={v.id} value={v.id} className="text-xs">
                        {v.brand}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <p className="text-xs font-medium mb-1.5">Link type</p>
              <Select value={linkType} onValueChange={(v) => setLinkType(v as LinkType)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LINK_TYPE_CONFIG) as LinkType[]).map((k) => (
                    <SelectItem key={k} value={k} className="text-xs">
                      {LINK_TYPE_CONFIG[k].letter} — {LINK_TYPE_CONFIG[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium mb-1.5">Quantity</p>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <p className="text-xs font-medium mb-1.5">Warranty months</p>
                <Select
                  value={String(warrantyMonths)}
                  onValueChange={(v) => setWarrantyMonths(Number(v))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WARRANTY_OPTIONS.map((m) => (
                      <SelectItem key={m} value={String(m)} className="text-xs">
                        {m === 0 ? 'No warranty' : `${m} months`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {step === 'variant' && (
            <Button onClick={handleSave} disabled={!serviceId || !variantId || addLink.isPending}>
              {addLink.isPending ? 'Saving…' : 'Create Link'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── DeleteLinkButton ─────────────────────────────────────────────────────────

function DeleteLinkButton({ id, label }: { id: string; label: string }) {
  const deleteLink = useDeleteServiceInventoryLink()

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          className="text-muted-foreground hover:text-destructive transition-colors"
          title="Remove link"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove link?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes <span className="font-medium">{label}</span> from this service.
            Future orders will no longer auto-deduct or charge this item.
            Historical orders are unaffected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              deleteLink.mutate(id, {
                onSuccess: () => toast.success('Link removed'),
                onError: (err) => toast.error(err.message),
              })
            }
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─── ServiceLinkSubRow ────────────────────────────────────────────────────────

function ServiceLinkSubRow({ link }: { link: ServiceInventoryLinkFull }) {
  const updateLink = useUpdateServiceInventoryLink()
  const variant = link.inventory_brand_variants

  if (!variant) {
    return (
      <tr className="border-b border-border/60 bg-red-50/30">
        <td colSpan={6} className="py-2 pl-10 text-xs text-red-600">
          ⚠ Variant missing — link ID {link.id}
        </td>
      </tr>
    )
  }

  const item = variant.inventory_items

  function handleTypeChange(type: LinkType) {
    updateLink.mutate(
      { id: link.id, link_type: type },
      { onError: (err) => toast.error(err.message) },
    )
  }

  function handleWarrantyChange(months: string) {
    updateLink.mutate(
      { id: link.id, warranty_months: Number(months) },
      { onError: (err) => toast.error(err.message) },
    )
  }

  // Uses onBlur (not onChange) — fires once when focus leaves the field.
  // This pattern naturally avoids race conditions from rapid input changes
  // without needing a debounce, since only one request fires per focus cycle.
  function handleQtyBlur(e: React.FocusEvent<HTMLInputElement>) {
    const qty = Number(e.target.value)
    if (qty > 0) {
      updateLink.mutate(
        { id: link.id, quantity: qty },
        { onError: (err) => toast.error(err.message) },
      )
    }
  }

  const cfg = LINK_TYPE_CONFIG[link.link_type]
  const deleteLabel = `${variant.brand} · ${item?.name_en ?? 'unknown item'}`

  return (
    <tr className="border-b border-border/60 bg-muted/10 hover:bg-muted/20">
      <td className="py-2 pl-10 pr-2" colSpan={2}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold border ${cfg.badgeClass}`}>
            {cfg.letter}
          </span>
          <span className="text-xs font-medium">{variant.brand}</span>
          {item && (
            <span className="text-[11px] text-muted-foreground">· {item.name_en} · {item.sku}</span>
          )}
          {variant.selling_price != null && variant.selling_price > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 h-4 text-emerald-700 border-emerald-200 bg-emerald-50">
              QAR {variant.selling_price.toLocaleString()}
            </Badge>
          )}
        </div>
      </td>

      <td className="py-2 px-2">
        <Select value={link.link_type} onValueChange={(v: string | null) => { if (v) handleTypeChange(v as LinkType) }}>
          <SelectTrigger className="h-6 text-[11px] w-28 px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(LINK_TYPE_CONFIG) as LinkType[]).map((k) => (
              <SelectItem key={k} value={k} className="text-xs">
                {LINK_TYPE_CONFIG[k].letter} — {LINK_TYPE_CONFIG[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      <td className="py-2 px-2">
        <Select value={String(link.warranty_months)} onValueChange={(v: string | null) => { if (v != null) handleWarrantyChange(v) }}>
          <SelectTrigger className="h-6 text-[11px] w-24 px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WARRANTY_OPTIONS.map((m) => (
              <SelectItem key={m} value={String(m)} className="text-xs">
                {m === 0 ? 'None' : `${m} mo`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      <td className="py-2 px-2">
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={1}
            defaultValue={link.quantity}
            onBlur={handleQtyBlur}
            className="h-6 w-16 text-[11px] px-2"
          />
          {item && <span className="text-[10px] text-muted-foreground">{item.unit}</span>}
        </div>
      </td>

      <td className="py-2 px-2 text-right">
        <DeleteLinkButton id={link.id} label={deleteLabel} />
      </td>
    </tr>
  )
}

// ─── ServiceRow ───────────────────────────────────────────────────────────────

function ServiceRow({
  service,
  links,
  breadcrumbs,
  allServices,
  onAddLink,
}: {
  service: ServiceNode
  links: ServiceInventoryLinkFull[]
  breadcrumbs: Map<string, string>
  allServices: ServiceNode[]
  onAddLink: (serviceId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const linked = links.length > 0
  const breadcrumb = breadcrumbs.get(service.id) ?? service.name_en

  const variantLabels = links
    .map((l) => l.inventory_brand_variants?.brand)
    .filter(Boolean) as string[]
  const previewLabels = variantLabels.slice(0, 2)
  const overflowCount = variantLabels.length - 2

  const typeLetters = [...new Set(links.map((l) => LINK_TYPE_CONFIG[l.link_type].letter))]
  const totalQty = links.reduce((acc, l) => acc + (l.quantity ?? 0), 0)

  function toggle() {
    setExpanded((v) => !v)
  }

  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/20 cursor-pointer focus-within:bg-muted/10"
        onClick={toggle}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
      >
        <td className="py-2.5 pl-3 pr-2">
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            }
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{service.name_en}</p>
              <p className="text-[10px] text-muted-foreground truncate">{breadcrumb}</p>
            </div>
          </div>
        </td>

        <td className="py-2.5 px-2">
          {linked ? (
            <Badge variant="outline" className="text-[10px] px-1.5 h-5 text-emerald-700 border-emerald-200 bg-emerald-50 gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" /> {links.length}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] px-1.5 h-5 text-amber-700 border-amber-200 bg-amber-50 gap-1">
              <AlertTriangle className="h-2.5 w-2.5" /> 0
            </Badge>
          )}
        </td>

        <td className="py-2.5 px-2 hidden md:table-cell">
          <span className="text-xs text-muted-foreground">
            {previewLabels.join(', ')}
            {overflowCount > 0 && ` +${overflowCount}`}
          </span>
        </td>

        <td className="py-2.5 px-2 hidden lg:table-cell">
          <div className="flex gap-1">
            {typeLetters.map((letter) => {
              const cfg = Object.values(LINK_TYPE_CONFIG).find((c) => c.letter === letter)!
              return (
                <span key={letter} className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold border ${cfg.badgeClass}`}>
                  {letter}
                </span>
              )
            })}
          </div>
        </td>

        <td className="py-2.5 px-2 hidden lg:table-cell">
          <span className="text-xs text-muted-foreground">{totalQty > 0 ? totalQty : '—'}</span>
        </td>

        <td className="py-2.5 px-2 text-right" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            title="Add link to this service"
            onClick={() => onAddLink(service.id)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </td>
      </tr>

      {expanded && links.map((link) => (
        <ServiceLinkSubRow key={link.id} link={link} />
      ))}
    </>
  )
}

// ─── ServiceLinksView ─────────────────────────────────────────────────────────

export function ServiceLinksView({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Read filter state from URL (persists across navigation/refresh)
  const search = searchParams.get('slSearch') ?? ''
  const typeFilter = (searchParams.get('slType') ?? 'all') as TreeTypeFilter
  const statusFilter = (searchParams.get('slStatus') ?? 'all') as StatusFilter

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all' || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const [newLinkServiceId, setNewLinkServiceId] = useState<string | undefined>(undefined)
  const [showNewLink, setShowNewLink] = useState(false)

  const { data: allServices = [], isLoading: servicesLoading } = useServicesForLinks()
  const { data: allLinks = [], isLoading: linksLoading } = useAllServiceLinks()

  const isLoading = servicesLoading || linksLoading

  // Pre-compute breadcrumbs once when services load — O(n) total, not O(n) per filter
  const breadcrumbs = useMemo(() => buildBreadcrumbMap(allServices), [allServices])

  // Build a map: service_id → links for that service
  const linksByService = useMemo(() => {
    const map = new Map<string, ServiceInventoryLinkFull[]>()
    for (const link of allLinks) {
      const existing = map.get(link.service_id) ?? []
      existing.push(link)
      map.set(link.service_id, existing)
    }
    return map
  }, [allLinks])

  const leaves = useMemo(() => collectLeaves(allServices), [allServices])

  const totalLeaves = leaves.length
  const linkedLeaves = leaves.filter((s) => (linksByService.get(s.id)?.length ?? 0) > 0).length
  const unlinkedLeaves = totalLeaves - linkedLeaves

  const filteredLeaves = useMemo(() => {
    const lowerSearch = search.toLowerCase()
    return leaves.filter((s) => {
      if (lowerSearch) {
        const crumb = (breadcrumbs.get(s.id) ?? '').toLowerCase()
        if (!crumb.includes(lowerSearch)) return false
      }
      if (typeFilter !== 'all' && s.tree_type !== typeFilter) return false
      const linkCount = linksByService.get(s.id)?.length ?? 0
      if (statusFilter === 'linked' && linkCount === 0) return false
      if (statusFilter === 'unlinked' && linkCount > 0) return false
      return true
    })
  }, [leaves, breadcrumbs, search, typeFilter, statusFilter, linksByService])

  function openNewLink(serviceId?: string) {
    setNewLinkServiceId(serviceId)
    setShowNewLink(true)
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header counters ── */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-muted/20">
        <span className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{totalLeaves}</span> services
        </span>
        <span className="text-xs text-emerald-700 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          <span className="font-semibold">{linkedLeaves}</span> linked
        </span>
        <span className="text-xs text-amber-700 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          <span className="font-semibold">{unlinkedLeaves}</span> unlinked
        </span>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-wrap">
        <Input
          placeholder="Search services…"
          value={search}
          onChange={(e) => setParam('slSearch', e.target.value)}
          className="h-7 text-xs w-48 shrink-0"
        />
        <Select value={typeFilter} onValueChange={(v: string | null) => setParam('slType', v ?? 'all')}>
          <SelectTrigger className="h-7 text-xs w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Types</SelectItem>
            <SelectItem value="normal" className="text-xs">Normal</SelectItem>
            <SelectItem value="contract" className="text-xs">Contract</SelectItem>
            <SelectItem value="mobile" className="text-xs">Mobile</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v: string | null) => setParam('slStatus', v ?? 'all')}>
          <SelectTrigger className="h-7 text-xs w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
            <SelectItem value="linked" className="text-xs">Linked</SelectItem>
            <SelectItem value="unlinked" className="text-xs">Unlinked</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => openNewLink()}>
            <Plus className="h-3.5 w-3.5" /> New Link
          </Button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40 sticky top-0">
                <th className="text-left text-[11px] font-semibold py-2 pl-3 pr-2 w-64">SERVICE</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2 w-20">STATUS</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2 hidden md:table-cell">ITEMS</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2 hidden lg:table-cell w-20">TYPES</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2 hidden lg:table-cell w-16">QTY</th>
                <th className="text-right text-[11px] font-semibold py-2 px-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filteredLeaves.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-xs text-muted-foreground py-16">
                    No services match the current filters
                  </td>
                </tr>
              )}
              {filteredLeaves.map((service) => (
                <ServiceRow
                  key={service.id}
                  service={service}
                  links={linksByService.get(service.id) ?? []}
                  breadcrumbs={breadcrumbs}
                  allServices={allServices}
                  onAddLink={openNewLink}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── New Link Dialog ── */}
      {showNewLink && (
        <NewLinkDialog
          services={leaves}
          breadcrumbs={breadcrumbs}
          preselectedServiceId={newLinkServiceId}
          onClose={() => { setShowNewLink(false); setNewLinkServiceId(undefined) }}
        />
      )}
    </div>
  )
}

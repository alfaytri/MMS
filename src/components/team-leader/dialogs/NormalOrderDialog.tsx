// src/components/team-leader/dialogs/NormalOrderDialog.tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ServiceStatusList } from '../shared/ServiceStatusList'
import { PhotoCapture }       from '../shared/PhotoCapture'
import { DamageReport }       from '../shared/DamageReport'
import { SignaturePad }       from '../shared/SignaturePad'
import type { TlVisit, OrderCompletionData, InventoryUsageRecord } from '@/types/team-leader'

interface Props {
  visit: TlVisit
  profileId: string
  onComplete: (visitId: string, data: OrderCompletionData) => void
  onClose: () => void
}

export function NormalOrderDialog({ visit, profileId, onComplete, onClose }: Props) {
  const [statuses, setStatuses] = useState<Record<string, 'done' | 'skipped' | 'issue'>>({})
  const [inventory, setInventory] = useState<Record<string, InventoryUsageRecord[]>>({})
  const [photos,   setPhotos]   = useState<Blob[]>([])
  const [damage,   setDamage]   = useState({ noted: false })
  const [signature, setSignature] = useState<Blob | null>(null)

  function setQty(serviceId: string, brandVariantId: string, brandVariantName: string, qty: number) {
    setInventory((prev) => {
      const current = prev[serviceId] ?? []
      const idx = current.findIndex((r) => r.brandVariantId === brandVariantId)
      const next = [...current]
      if (idx >= 0) {
        next[idx] = { ...next[idx], qtyUsed: qty }
      } else {
        next.push({ brandVariantId, brandVariantName, qtyUsed: qty })
      }
      return { ...prev, [serviceId]: next.filter((r) => r.qtyUsed > 0) }
    })
  }

  function handleSubmit() {
    const data: OrderCompletionData = {
      orderId: visit.source_id, visitId: visit.id, visitType: visit.type,
      serviceStatuses: statuses, inventoryUsage: inventory,
      photos, damageReport: damage, signature: signature ?? undefined,
    }
    onComplete(visit.id, data)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-xl flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <DialogTitle>Normal Order</DialogTitle>
          <Badge className="w-fit">Order</Badge>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-6 p-4">
            <ServiceStatusList
              services={visit.services}
              statuses={statuses}
              onChange={(id, s) => setStatuses((p) => ({ ...p, [id]: s }))}
            />

            {/* Inventory per service */}
            {visit.services.map((svc) => (
              <div key={svc.id} className="space-y-2">
                <p className="text-sm font-semibold">{svc.name} — Inventory Used</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Qty Used</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      className="h-11"
                      onChange={(e) =>
                        setQty(svc.id, `${svc.id}-default`, svc.name, Number(e.target.value))
                      }
                    />
                  </div>
                </div>
              </div>
            ))}

            <PhotoCapture visitId={visit.id} photos={photos} onChange={setPhotos} />
            <DamageReport visitId={visit.id} value={damage} onChange={setDamage} />
            <SignaturePad visitId={visit.id} value={signature} onChange={setSignature} />
          </div>
        </ScrollArea>

        <div className="px-4 pb-4 pt-2 border-t shrink-0">
          <Button className="w-full min-h-11" onClick={handleSubmit} disabled={!signature}>
            Complete & Generate Invoice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

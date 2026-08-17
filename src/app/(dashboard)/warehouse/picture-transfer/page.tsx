'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useHasPermission } from '@/hooks/usePermissions'
import { useMyResponsibleWarehouses } from '@/hooks/useMyResponsibleWarehouses'
import { useWarehouseSubContainers } from '@/hooks/useWarehouseSubContainers'
import { PictureTransferHome } from '@/components/warehouse/picture-transfer/PictureTransferHome'
import { PictureSendFlow } from '@/components/warehouse/picture-transfer/PictureSendFlow'
import { PictureReceive } from '@/components/warehouse/picture-transfer/PictureReceive'

/**
 * Picture Transfer (v2) — a picture-first Send/Receive surface for low-literacy
 * warehouse staff. Gated by `warehouse.transfer.simple`; the source warehouse
 * is derived from the user's Responsible-Person assignment (never chosen). The
 * classic transfer surface (Master Data → Warehouses → Transfers) is untouched.
 */
export default function PictureTransferPage() {
  const canUse = useHasPermission('warehouse.transfer.simple')
  const { data: myWhs = [], isLoading } = useMyResponsibleWarehouses()
  const [mode, setMode] = useState<'home' | 'send' | 'receive'>('home')
  const [pickedWhId, setPickedWhId] = useState<string | null>(null)
  const [pickedAreaId, setPickedAreaId] = useState<string | null>(null)

  // Source warehouse: the only one he's RP of, or the one he tapped.
  const whId = pickedWhId ?? (myWhs.length === 1 ? myWhs[0].id : null)
  const { data: subs = [] } = useWarehouseSubContainers(whId)
  const activeSubs = useMemo(() => subs.filter((s) => s.is_active), [subs])
  // Source area (sub-container): the only active one, or the one he tapped.
  // create_transfer_v2 REQUIRES an explicit sub when a warehouse has >1.
  const subId = pickedAreaId ?? (activeSubs.length === 1 ? activeSubs[0].id : null)

  const myWarehouseIds = useMemo(() => myWhs.map((w) => w.id), [myWhs])

  if (!canUse) return <Center>You don’t have access to Picture Transfer.</Center>
  if (isLoading) return <Center>Loading…</Center>
  if (myWhs.length === 0)
    return (
      <Center>
        You’re not assigned to a warehouse yet.
        <br />
        Ask an admin to make you a Warehouse Responsible Person.
      </Center>
    )

  if (!whId)
    return (
      <Picker title="Which store are you in?">
        {myWhs.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setPickedWhId(w.id)}
            className="min-h-16 rounded-2xl border-2 border-border p-5 text-lg font-bold"
          >
            {w.name}
          </button>
        ))}
      </Picker>
    )

  if (!subId)
    return (
      <Picker title="Which area?">
        {activeSubs.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setPickedAreaId(s.id)}
            className="min-h-16 rounded-2xl border-2 border-border p-5 text-lg font-bold"
          >
            {s.name}
          </button>
        ))}
      </Picker>
    )

  const source = { warehouseId: whId, subContainerId: subId }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col bg-background">
      {mode === 'send' && <PictureSendFlow source={source} onExit={() => setMode('home')} />}
      {mode === 'receive' && <PictureReceive myWarehouseIds={myWarehouseIds} onExit={() => setMode('home')} />}
      {mode === 'home' && (
        <PictureTransferHome myWarehouseIds={myWarehouseIds} onSend={() => setMode('send')} onReceive={() => setMode('receive')} />
      )}
    </div>
  )
}

function Center({ children }: { children: ReactNode }) {
  return <div className="grid min-h-[60vh] place-items-center p-8 text-center text-base text-muted-foreground">{children}</div>
}

function Picker({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-xl font-extrabold">{title}</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </div>
  )
}

// src/components/team-leader/OrderDetailDispatch.tsx
'use client'

import { BackworkDialog }           from './dialogs/BackworkDialog'
import { FollowUpDialog }           from './dialogs/FollowUpDialog'
import { SiteVisitSingleDialog }    from './dialogs/SiteVisitSingleDialog'
import { SiteVisitContractDialog }  from './dialogs/SiteVisitContractDialog'
import { ContractVisitDialog }      from './dialogs/ContractVisitDialog'
import { QcDialog }                 from './dialogs/QcDialog'
import { NormalOrderDialog }        from './dialogs/NormalOrderDialog'
import type { TlVisit, OrderCompletionData } from '@/types/team-leader'

interface Props {
  visit: TlVisit
  profileId: string
  onComplete: (visitId: string, data: OrderCompletionData) => void
  onClose: () => void
}

export function OrderDetailDispatch({ visit, profileId, onComplete, onClose }: Props) {
  // key={visit.id} forces React to unmount + remount the dialog when the
  // selected visit changes, so per-dialog state (photos, statuses, notes,
  // follow-up draft) is reset to its initial values for each new visit
  // instead of leaking from the previous one.
  const shared = { visit, profileId, onComplete, onClose }

  switch (visit.type) {
    case 'backwork':            return <BackworkDialog           key={visit.id} {...shared} />
    case 'follow-up':           return <FollowUpDialog           key={visit.id} {...shared} />
    case 'site-visit-single':   return <SiteVisitSingleDialog    key={visit.id} {...shared} />
    case 'site-visit-contract': return <SiteVisitContractDialog  key={visit.id} {...shared} />
    case 'contract':            return <ContractVisitDialog      key={visit.id} {...shared} />
    case 'qc':                  return <QcDialog                 key={visit.id} {...shared} />
    default:                    return <NormalOrderDialog         key={visit.id} {...shared} />
  }
}

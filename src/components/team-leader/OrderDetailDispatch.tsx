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
  const shared = { visit, profileId, onComplete, onClose }

  switch (visit.type) {
    case 'backwork':            return <BackworkDialog           {...shared} />
    case 'follow-up':           return <FollowUpDialog           {...shared} />
    case 'site-visit-single':   return <SiteVisitSingleDialog    {...shared} />
    case 'site-visit-contract': return <SiteVisitContractDialog  {...shared} />
    case 'contract':            return <ContractVisitDialog      {...shared} />
    case 'qc':                  return <QcDialog                 {...shared} />
    default:                    return <NormalOrderDialog         {...shared} />
  }
}

import type { OrderServiceDraft } from '@/types/orders'
import type { ParentOrderForFollowUp } from '@/hooks/useParentOrderForFollowUp'

type ParentService = ParentOrderForFollowUp['services'][number]

// A ticked parent service becomes a backwork line at 0 QAR (redo, not charged).
export function backworkDraftService(s: ParentService): OrderServiceDraft {
  return {
    serviceId: s.service_id ?? '',
    serviceName: s.name,
    qty: s.qty,
    price: 0,
    duration: s.duration ?? 60,
    path: s.path ?? [],
    fromTime: null,
    toTime: null,
  }
}

/**
 * Append a service to a draft order/quotation line list, or bump the quantity
 * of the existing line when the SAME service node is added again.
 *
 * Keeps `serviceId` unique per order, so team assignments and the create/edit
 * save RPCs stay unambiguous and the React list carries no duplicate keys.
 * Different tree paths are different nodes with different ids, so they still add
 * as separate lines — only re-picking the identical leaf merges into quantity.
 *
 * Generic over `{ serviceId, qty }` so it serves both the order draft
 * (`OrderServiceDraft`) and the quotation draft (`QuotationLineDraft`).
 */
export function addOrBumpService<T extends { serviceId: string; qty: number }>(
  list: T[],
  svc: T,
): T[] {
  const idx = list.findIndex((s) => s.serviceId === svc.serviceId)
  if (idx === -1) return [...list, svc]
  return list.map((s, i) => (i === idx ? { ...s, qty: s.qty + svc.qty } : s))
}

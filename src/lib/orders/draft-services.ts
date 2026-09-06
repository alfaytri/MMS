/**
 * Append a service line to a draft list, or bump the quantity of the existing
 * line when the SAME service node is added again (identified by `key`).
 *
 * Keeps the service-node key unique per draft, so team assignments and the
 * create/edit save RPCs stay unambiguous and the React list carries no
 * duplicate keys. Different tree paths are different nodes with different keys,
 * so they still add as separate lines — only re-picking the identical leaf
 * merges into quantity.
 *
 * Generic over `{ qty }` + a `key` selector so it serves the order draft
 * (`OrderServiceDraft` keyed by `serviceId`), the quotation draft
 * (`QuotationLineDraft` by `serviceId`), and the team-leader billables
 * (`AddedBillableService` by `id`).
 */
export function addOrBumpService<T extends { qty: number }>(
  list: T[],
  svc: T,
  key: (s: T) => string,
): T[] {
  const svcKey = key(svc)
  const idx = list.findIndex((s) => key(s) === svcKey)
  if (idx === -1) return [...list, svc]
  return list.map((s, i) => (i === idx ? { ...s, qty: s.qty + svc.qty } : s))
}

/**
 * Deep-links to open a source document from a report grid. Each doc number
 * routes to its list page filtered to that number (the list reads the query
 * param into its search box), opened in a new tab so the report stays put.
 * PO/SO handlers live on `purchase/orders` + `sales/orders`; Bill/Invoice on
 * `purchase/bills` + `sales/invoices`.
 */
export type DocKind = 'po' | 'so' | 'bill' | 'invoice'

export function docHrefFor(kind: DocKind, docNumber: string | null | undefined): string | null {
  if (!docNumber) return null
  const n = encodeURIComponent(docNumber)
  switch (kind) {
    case 'po':      return `/purchase/orders?po=${n}`
    case 'so':      return `/sales/orders?so=${n}`
    case 'bill':    return `/purchase/bills?bill=${n}`
    case 'invoice': return `/sales/invoices?invoice=${n}`
    default:        return null
  }
}

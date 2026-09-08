export function normalizeUnitName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}
export function sameUnit(a: string, b: string): boolean {
  return normalizeUnitName(a).toLowerCase() === normalizeUnitName(b).toLowerCase()
}

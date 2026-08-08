export function normalizeBrandName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}
export function sameBrand(a: string, b: string): boolean {
  return normalizeBrandName(a).toLowerCase() === normalizeBrandName(b).toLowerCase()
}

/**
 * Build a safe, ASCII-only download filename slug.
 *
 * `Content-Disposition` header values are ByteStrings (Latin-1, code points
 * 0–255). Any character above 255 — an em dash "—" (8212), curly quotes,
 * accented or Arabic letters — makes `new Response(..., { headers })` throw
 * "Cannot convert argument to a ByteString …" server-side. So we fold accents
 * to their ASCII base (NFKD), drop anything still non-ASCII, then slugify. The
 * nice Unicode title stays in the document body and the client's `a.download`;
 * only the header filename is reduced to ASCII.
 */
export function fileSlug(name: string): string {
  return (name || 'report')
    .normalize('NFKD')               // fold accents: é → e + combining mark
    .replace(/[^ -~]/g, ' ')         // drop all non-ASCII (combining marks, em dash, …)
    .replace(/[\\/:*?"<>|]/g, ' ')   // filesystem-illegal characters
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'report'
}

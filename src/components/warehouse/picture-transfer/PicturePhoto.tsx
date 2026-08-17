// Big, clean product photo with a strong fallback for items that have no
// picture yet (the worker relies on the image, so it is NEVER a blank box):
// tinted square + big initials + a small 📦 corner glyph.
//
// Two sizing modes:
//   - `size` given  → a fixed square (px). Used for chips / confirm rows.
//   - `size` absent → fills its container (`aspect-square w-full`). Used in the grid.

export function PicturePhoto({
  url,
  name,
  size,
  className = '',
}: {
  url: string | null
  name: string
  size?: number
  className?: string
}) {
  const initials =
    (name || '')
      .replace(/[^A-Za-z0-9 ]/g, '')
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  const fixed = size != null

  return (
    <div
      className={`relative grid place-items-center overflow-hidden rounded-2xl bg-muted ${fixed ? '' : 'aspect-square w-full'} ${className}`}
      style={fixed ? { width: size, height: size } : undefined}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <>
          <span
            className={`font-extrabold text-muted-foreground ${fixed ? '' : 'text-3xl'}`}
            style={fixed ? { fontSize: Math.round(size! * 0.3) } : undefined}
          >
            {initials}
          </span>
          <span className="absolute bottom-1 right-1 text-sm opacity-50">📦</span>
        </>
      )}
    </div>
  )
}

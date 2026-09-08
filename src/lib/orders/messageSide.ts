export function messageSide(
  authorId: string | null,
  currentUserId: string | null,
): 'left' | 'right' {
  return authorId != null && authorId === currentUserId ? 'right' : 'left'
}

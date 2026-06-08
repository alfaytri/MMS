import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Verify a webhook signature using HMAC-SHA256.
 * Returns true if the signature matches, or if no secret is configured (skip validation).
 */
export function verifyHmacSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!secret) return true
  if (!signatureHeader) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signatureHeader, 'hex')
    )
  } catch {
    return false
  }
}

/**
 * Timing-safe string comparison for shared secrets.
 * Returns true if both strings match, or if no secret is configured.
 */
export function verifySharedSecret(
  provided: string | null,
  secret: string | undefined
): boolean {
  if (!secret) return true
  if (!provided) return false
  if (provided.length !== secret.length) return false
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
  } catch {
    return false
  }
}

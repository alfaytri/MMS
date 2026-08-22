export class NormalisePhoneError extends Error {
  constructor(raw: string) {
    super(`Cannot normalise phone number: "${raw}"`)
    this.name = 'NormalisePhoneError'
  }
}

export function normalisePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-().]/g, '')

  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1)
    if (digits.length >= 7 && digits.length <= 15 && /^\d+$/.test(digits)) {
      return cleaned
    }
    throw new NormalisePhoneError(raw)
  }

  const digits = cleaned.replace(/\D/g, '')

  if (digits.startsWith('00974') && digits.length === 13) {
    return `+${digits.slice(2)}`
  }

  if (digits.startsWith('974') && digits.length === 11) {
    return `+${digits}`
  }

  if (digits.length === 8 && /^[3-9]/.test(digits)) {
    return `+974${digits}`
  }

  throw new NormalisePhoneError(raw)
}

export function tryNormalisePhone(raw: string): string | null {
  try {
    return normalisePhone(raw)
  } catch {
    return null
  }
}

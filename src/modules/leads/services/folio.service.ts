const FOLIO_CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const FOLIO_PREFIX = 'MC-'
const FOLIO_SUFFIX_LENGTH = 5

export function generateFolioSuffix(): string {
  let suffix = ''
  for (let i = 0; i < FOLIO_SUFFIX_LENGTH; i++) {
    const index = Math.floor(Math.random() * FOLIO_CHARSET.length)
    suffix += FOLIO_CHARSET[index]
  }
  return suffix
}

export function generateFolio(): string {
  return `${FOLIO_PREFIX}${generateFolioSuffix()}`
}

export const FOLIO_REGEX = /\bMC-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}\b/

/** Convierte un nombre en slug: minusculas, separadores no alfanumericos -> '-', recorta lados. */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}
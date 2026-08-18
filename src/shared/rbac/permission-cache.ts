const TTL_MS = 60_000

type CacheEntry = {
  permissions: Set<string>
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

export function getCachedPermissions(userId: string): Set<string> | null {
  const entry = cache.get(userId)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(userId)
    return null
  }
  return entry.permissions
}

export function setCachedPermissions(userId: string, permissions: Set<string>): void {
  cache.set(userId, {
    permissions,
    expiresAt: Date.now() + TTL_MS,
  })
}

export function invalidateUserPermissions(userId: string): void {
  cache.delete(userId)
}

export function invalidateAllPermissions(): void {
  cache.clear()
}

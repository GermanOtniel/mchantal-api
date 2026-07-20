import type { FastifyRequest } from 'fastify'

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export function createRateLimitHook(maxPerMinute: number) {
  return async function rateLimitHook(request: FastifyRequest): Promise<void> {
    const ip =
      (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      request.ip
    const key = `${ip}:${request.url}`
    const now = Date.now()
    const windowMs = 60_000

    const current = buckets.get(key)
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return
    }

    if (current.count >= maxPerMinute) {
      const error = new Error('Too many requests')
      ;(error as Error & { statusCode: number; code: string }).statusCode = 429
      ;(error as Error & { statusCode: number; code: string }).code = 'RATE_LIMITED'
      throw error
    }

    current.count += 1
  }
}

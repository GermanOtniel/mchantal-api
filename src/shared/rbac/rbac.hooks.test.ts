import { describe, expect, it, vi } from 'vitest'

const { mockPermissionService } = vi.hoisted(() => ({
  mockPermissionService: { getPermissionKeysForUser: vi.fn() },
}))

vi.mock('../../modules/rbac/services/permission.service', () => ({
  PermissionService: vi.fn(function () {
    return mockPermissionService
  }),
  buildUserAccessProfile: vi.fn(),
}))

import { loadPermissionsHook, requirePermission } from './rbac.hooks'
import { HttpError } from '../../modules/auth/http-error'

function makeRequest(over: Partial<{ user: { sub: string }; permissions: Set<string> }> = {}) {
  return over as {
    user?: { sub: string }
    permissions?: Set<string>
  }
}

describe('rbac.hooks', () => {
  describe('loadPermissionsHook', () => {
    it('setea request.permissions con las keys del usuario', async () => {
      mockPermissionService.getPermissionKeysForUser.mockResolvedValue(new Set(['leads.read']))
      const req = makeRequest({ user: { sub: 'u1' } })
      await loadPermissionsHook(req as never, {} as never)
      expect(req.permissions).toEqual(new Set(['leads.read']))
      expect(mockPermissionService.getPermissionKeysForUser).toHaveBeenCalledWith('u1')
    })

    it('lanza 401 UNAUTHORIZED si no hay request.user.sub', async () => {
      const req = makeRequest({})
      await expect(loadPermissionsHook(req as never, {} as never)).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
      })
    })
  })

  describe('requirePermission', () => {
    it('no lanza si el permiso está presente', async () => {
      const guard = requirePermission('leads.read')
      const req = makeRequest({ permissions: new Set(['leads.read']) })
      await expect(guard(req as never, {} as never)).resolves.toBeUndefined()
    })

    it('lanza 403 FORBIDDEN si el permiso no está', async () => {
      const guard = requirePermission('leads.read')
      const req = makeRequest({ permissions: new Set(['roles.manage']) })
      await expect(guard(req as never, {} as never)).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      })
    })

    it('acepta si alguno de los permisos (OR) está presente', async () => {
      const guard = requirePermission('leads.read', 'campaigns.manage')
      const req = makeRequest({ permissions: new Set(['campaigns.manage']) })
      await expect(guard(req as never, {} as never)).resolves.toBeUndefined()
    })

    it('lanza 403 si request.permissions no existe', async () => {
      const guard = requirePermission('leads.read')
      const req = makeRequest({})
      await expect(guard(req as never, {} as never)).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      })
    })
  })

  it('HttpError sigue siendo el tipo lanzado', () => {
    expect(new HttpError('x', 401, 'UNAUTHORIZED').statusCode).toBe(401)
  })
})
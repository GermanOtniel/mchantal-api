import type { FastifyReply, FastifyRequest } from 'fastify'
import { PermissionService } from '../../modules/rbac/services/permission.service'
import { HttpError } from '../../modules/auth/http-error'

declare module 'fastify' {
  interface FastifyRequest {
    permissions?: Set<string>
  }
}

const permissionService = new PermissionService()

export async function loadPermissionsHook(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  if (!request.user?.sub) {
    throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED')
  }

  request.permissions = await permissionService.getPermissionKeysForUser(request.user.sub)
}

export function requirePermission(...keys: string[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.permissions) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN')
    }

    const allowed = keys.some((key) => request.permissions!.has(key))
    if (!allowed) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN')
    }
  }
}

/** Al menos uno de los permisos indicados (OR lógico). */
export function requireAnyPermission(...keys: string[]) {
  return requirePermission(...keys)
}

export { permissionService }

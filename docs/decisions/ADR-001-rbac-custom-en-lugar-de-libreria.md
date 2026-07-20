# ADR-001: RBAC custom en lugar de librería

- **Estado:** Aceptado
- **Fecha:** 2026-07-20
- **Módulos:** [RBAC](../modules/rbac.md), [Auth](../modules/auth.md)

## Contexto

El CRM necesita control de acceso por permisos finos (no solo roles globales): un agente ve conversaciones asignadas, un visor solo lee, un ejecutivo recibe leads, un admin gestiona roles. El catálogo de permisos está atado a features concretas del producto (whatsapp, leads, analytics, rbac).

## Decisión

Implementar RBAC custom:
- Catálogo de permisos en código (`permissions.catalog.ts`) con `module` y `description` por permiso.
- Roles y permisos persistidos en BD (`roles`, `permissions`, `role_permissions`, `user_roles`), seedados desde el catálogo.
- Hooks Fastify (`requirePermission`, `requireAnyPermission`, `loadPermissionsHook`) que validan en runtime.
- Cache de permisos en proceso.

## Alternativas consideradas

- **`@casl` / `accesscontrol`:** más flexible y estándar, pero agrega abstracción innecesaria para un conjunto fijo de permisos string y un solo sujeto (usuario). El catálogo en código ya es simple y autoexplicativo.
- **Solo roles (sin permisos):** insuficiente — los roles estándar (agent/viewer/executive) no cubren combinaciones custom por cliente.

## Consecuencias

- ✅ El catálogo es la fuente de verdad y se documenta solo (descripción por permiso).
- ✅ Sin dependencias externas; los hooks son triviales de leer.
- ⚠️ El catálogo se **duplica** en el CRM (`mchantal-crm/src/lib/rbac/permissions.ts`) porque el frontend necesita la lista para `hasPermission`. Riesgo de desincronía silenciosa.
- ⚠️ Agregar un permiso requiere: catálogo + migración/seed + protección de ruta + espejo en CRM. Proceso manual.
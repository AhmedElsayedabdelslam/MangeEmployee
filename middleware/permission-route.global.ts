import { getEmployeeProfileIdFromUser } from '~/utils/authEmployee'

/**
 * Runs when a page sets `definePageMeta({ requiredPermissions: ['some-permission'] })`.
 * Use for modules that must stay hidden from direct URL access (e.g. admin-only areas).
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  const requiredMetadata = to.meta.requiredPermissions
  if (requiredMetadata === undefined) return

  const required = Array.isArray(requiredMetadata)
    ? requiredMetadata
      .filter((permission): permission is string => typeof permission === 'string')
      .map(permission => permission.trim())
      .filter(Boolean)
    : []
  const permissionMode = to.meta.permissionMode === 'all' ? 'all' : 'any'

  const authStore = useAuthStore()
  if (!authStore.isAuthenticated) {
    authStore.init()
  }
  if (!authStore.isAuthenticated) {
    return navigateTo('/login')
  }

  // `undefined` means a generic authenticated route. An explicitly empty or
  // malformed permission declaration is a configuration error and must not
  // become an authorization bypass, including for Super-Admin.
  if (!required.length) {
    if (import.meta.dev) {
      console.warn('[PermissionConfigurationError]', {
        route: to.fullPath,
        requiredPermissions: requiredMetadata,
      })
    }
    if (to.path === '/forbidden') return
    return navigateTo('/forbidden')
  }

  const permissionsLoaded = await authStore.ensurePermissionsLoaded()
  if (!permissionsLoaded) {
    if (!authStore.isAuthenticated) {
      return navigateTo('/login')
    }
    if (authStore.isSuperAdmin) {
      return
    }
    return navigateTo('/forbidden')
  }

  const { canAccessRoute, hasPermission } = usePermissions()

  if (
    to.path === '/employees' &&
    authStore.user?.type === 'Employee' &&
    !hasPermission('employee-list')
  ) {
    const id = getEmployeeProfileIdFromUser(authStore.user)
    if (id) return navigateTo(`/employees/${id}`, { replace: true })
  }

  if (canAccessRoute(required, permissionMode)) return

  if (import.meta.dev) {
    console.warn('[PermissionDenied]', {
      route: to.fullPath,
      requiredPermissions: required,
      permissionMode,
    })
  }

  return navigateTo('/forbidden')
})

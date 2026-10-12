/**
 * The Set Salary detail page accepts two identifier modes with different
 * context requirements:
 * - salary UUID: salary-show is required to resolve the salary and its child IDs.
 * - employee/numeric key: salary-list or loan-list can provide a usable section.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  const authStore = useAuthStore()
  if (!authStore.isAuthenticated) {
    authStore.init()
  }
  if (!authStore.isAuthenticated) return navigateTo('/login')

  const loaded = await authStore.ensurePermissionsLoaded()
  if (!loaded && !authStore.isSuperAdmin) return navigateTo('/forbidden')

  const rawId = Array.isArray(to.params.id) ? to.params.id[0] : to.params.id
  const routeId = String(rawId ?? '').trim()
  const isSalaryUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(routeId)
  const { hasPermission } = usePermissions()

  if (isSalaryUuid) {
    if (hasPermission('salary-show')) return
    return navigateTo('/forbidden')
  }

  if (hasPermission('salary-list') || hasPermission('loan-list')) return
  return navigateTo('/forbidden')
})

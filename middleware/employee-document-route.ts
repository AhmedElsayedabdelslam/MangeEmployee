/**
 * Employee Documents is a combined route:
 * - List is usable with employee-document-list.
 * - Upload is usable only with employee-document-create + document-type-list.
 *
 * Non-Employee accounts also need a safe way to resolve the target employee:
 * an exact employee-show permission, or the numeric employee_id added by the
 * portal when navigating from the employee list/create flow.
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

  const { hasPermission } = usePermissions()
  const canList = hasPermission('employee-document-list')
  const canUpload =
    hasPermission('employee-document-create') &&
    hasPermission('document-type-list')

  if (!canList && !canUpload) return navigateTo('/forbidden')
  if (authStore.user?.type === 'Employee') return

  const rawQueryId = Array.isArray(to.query.employee_id)
    ? to.query.employee_id[0]
    : to.query.employee_id
  const rawRouteId = Array.isArray(to.params.id) ? to.params.id[0] : to.params.id
  const hasNumericEmployeeId = [rawQueryId, rawRouteId].some(value =>
    typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())
  )

  if (hasNumericEmployeeId || hasPermission('employee-show')) return
  return navigateTo('/forbidden')
})

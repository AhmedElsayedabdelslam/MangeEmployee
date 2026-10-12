import { getEmployeeProfileIdFromUser } from '~/utils/authEmployee'

/**
 * Employees opening /employees (list) are sent to their own profile so the flow matches:
 * Home → Employee → Manage Employee
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  if (to.path !== '/employees') return

  const authStore = useAuthStore()
  if (!authStore.isAuthenticated) authStore.init()
  if (!authStore.user || authStore.user.type !== 'Employee') return
  if (!await authStore.ensurePermissionsLoaded()) return
  if (usePermissions().hasPermission('employee-list')) return

  const id = getEmployeeProfileIdFromUser(authStore.user)
  if (!id) return

  return navigateTo(`/employees/${id}`, { replace: true })
})

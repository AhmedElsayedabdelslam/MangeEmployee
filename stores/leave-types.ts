import { defineStore } from 'pinia'
import { leaveTypeService, type CreateLeaveTypePayload, type UpdateLeaveTypePayload } from '~/services/leaveTypeService'
import type { LeaveType as ApiLeaveType } from '~/services/leaveTypeService'
import { useAuthStore } from '~/stores/auth'
import type { LeaveType } from '~/types/leave'
import { entityKeyMatches } from '~/utils/entityApiKey'
import { requireLoadedPermission } from '~/utils/permissionAccess'

function mapApiToDisplay(api: ApiLeaveType): LeaveType & { requiresHrApproval?: boolean; isActive?: boolean } {
  return {
    id: String(api.id),
    uuid: api.uuid != null && String(api.uuid).trim() !== '' ? String(api.uuid) : undefined,
    name: api.title,
    daysPerYear: api.days,
    createdAt: (api as { created_at?: string }).created_at ?? '',
    updatedAt: (api as { updated_at?: string }).updated_at ?? '',
    requiresHrApproval: api.requires_hr_approval,
    isActive: api.is_active
  }
}

export const useLeaveTypeStore = defineStore('leaveTypes', {
  state: () => ({
    leaveTypes: [] as LeaveType[],
    loading: false,
    error: null as string | null
  }),

  actions: {
    async fetchLeaveTypes() {
      requireLoadedPermission('leave-type-list')
      this.loading = true
      this.error = null
      const authStore = useAuthStore()
      const token = authStore.token
      if (!token) {
        this.loading = false
        this.error = 'Authentication required'
        return
      }
      try {
        const response = await leaveTypeService.getAll(token)
        const data = response.data
        this.leaveTypes = Array.isArray(data) ? data.map(mapApiToDisplay) : []
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'An unknown error occurred'
        this.error = message
        console.error('Failed to fetch leave types:', err)
        throw err
      } finally {
        this.loading = false
      }
    },

    async createLeaveType(payload: CreateLeaveTypePayload) {
      requireLoadedPermission('leave-type-create')
      this.loading = true
      this.error = null
      const authStore = useAuthStore()
      const token = authStore.token
      if (!token) throw new Error('Authentication required')
      try {
        const response = await leaveTypeService.create(payload, token)
        await this.fetchLeaveTypes()
        return response.data ? mapApiToDisplay(response.data) : null
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create leave type'
        this.error = message
        throw err
      } finally {
        this.loading = false
      }
    },

    async updateLeaveType(id: string, payload: UpdateLeaveTypePayload) {
      requireLoadedPermission('leave-type-edit')
      this.loading = true
      this.error = null
      const authStore = useAuthStore()
      const token = authStore.token
      if (!token) throw new Error('Authentication required')
      try {
        const response = await leaveTypeService.update(id, payload, token)
        await this.fetchLeaveTypes()
        return response.data ? mapApiToDisplay(response.data) : null
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to update leave type'
        this.error = message
        throw err
      } finally {
        this.loading = false
      }
    },

    async deleteLeaveType(id: string) {
      requireLoadedPermission('leave-type-delete')
      this.loading = true
      this.error = null
      const authStore = useAuthStore()
      const token = authStore.token
      if (!token) throw new Error('Authentication required')
      try {
        await leaveTypeService.delete(id, token)
        this.leaveTypes = this.leaveTypes.filter((lt) => !entityKeyMatches(lt, id))
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to delete leave type'
        this.error = message
        throw err
      } finally {
        this.loading = false
      }
    }
  }
})

import { defineStore } from 'pinia'
import { leaveService } from '~/services/leaveService'
import type { Leave as ApiLeave, CreateLeavePayload } from '~/services/leaveService'
import { useAuthStore } from '~/stores/auth'
import type { Leave, LeaveFilters, LeaveStatus } from '~/types/leave'
import { getEmployeeProfileIdFromUser } from '~/utils/authEmployee'
import { hasLoadedPermission, requireLoadedPermission } from '~/utils/permissionAccess'

type ApiLeaveWithRelations = ApiLeave & {
  employee?: { id?: string; name?: string; employee_id?: string }
  leave_type?: { id?: string; title?: string }
  replacement_employee?: { id?: string; name?: string }
}

function mapStatus(api: string): LeaveStatus {
  const s = (api || '').toLowerCase()
  if (s === 'approved') return 'Approved'
  if (s === 'rejected') return 'Rejected'
  if (s === 'cancelled') return 'Cancelled'
  return 'Pending'
}

function mapApiToDisplay(api: ApiLeaveWithRelations): Leave {
  const emp = api.employee
  const lt = api.leave_type
  const repl = api.replacement_employee
  const replId = (api as { replacement_employee_id?: string }).replacement_employee_id
  return {
    id: String(api.id),
    uuid: String(api.uuid ?? api.id),
    employee: emp?.name ?? (api as any).employee_name ?? `Employee #${api.employee_id}`,
    employeeId: String(emp?.employee_id ?? emp?.id ?? api.employee_id),
    employeeUuid: String((api as any).employee_uuid ?? ''),
    leaveType: lt?.title ?? `Leave Type #${api.leave_type_id}`,
    leaveTypeTitle: (api as any).leave_type_title,
    leaveTypeId: String(lt?.id ?? api.leave_type_id),
    employeeCode: (api as any).employee_code ?? emp?.employee_code ?? null,
    appliedOn: api.applied_on?.split('T')[0] ?? '',
    startDate: api.start_date ?? '',
    endDate: api.end_date ?? '',
    totalDays: api.total_leave_days ?? 0,
    replacement: repl?.name ?? api.replacement_employee_name ?? 'N/A',
    replacementId: repl ? String(repl.id) : (replId ? String(replId) : undefined),
    replacementEmployeeName: api.replacement_employee_name ?? repl?.name ?? null,
    leaveReason: api.leave_reason ?? '',
    status: mapStatus(api.status),
    actionBy: (api as { action_by?: string }).action_by,
    actionById: (api as { action_by_id?: string }).action_by_id ? String((api as { action_by_id: string }).action_by_id) : undefined,
    actionDate: (api as { action_date?: string }).action_date?.split('T')[0],
    createdById: api.created_by ? String(api.created_by) : undefined,
    createdByName: (api as any).created_by_name,
    createdAt: (api as { created_at?: string }).created_at ?? '',
    updatedAt: (api as { updated_at?: string }).updated_at ?? ''
  }
}

function leaveMatchesKey(leave: Leave, key: string): boolean {
  return leave.uuid === key || leave.id === key
}

function resolveLeaveUuid(leaves: Leave[], key: string): string {
  const leave = leaves.find((item) => leaveMatchesKey(item, key))
  const uuid = leave?.uuid || key
  if (!uuid.trim()) throw new Error('Invalid leave UUID')
  return uuid
}

export const useLeaveStore = defineStore('leaves', {
  state: () => ({
    leaves: [] as Leave[],
    filters: {
      status: 'All' as LeaveFilters['status'],
      branch: 'All',
      department: 'All',
      searchQuery: ''
    } as LeaveFilters,
    loading: false,
    error: null as string | null,
    pagination: null as { current_page: number; total_pages: number; total: number; per_page: number } | null
  }),

  getters: {
    filteredLeaves: (state) => {
      let filtered = state.leaves

      const authStore = useAuthStore()
      const isEmployeeSelfService = authStore.user?.type === 'Employee'

      if (isEmployeeSelfService) {
        const user = authStore.user as {
          id?: number | string
          employee_id?: number | string
          employee?: { id?: number | string; employee_id?: number | string }
        } | null

        const identities = new Set<string>()
        const pushIdentity = (value: unknown) => {
          const normalized = String(value ?? '').trim()
          if (normalized) identities.add(normalized)
        }

        pushIdentity(getEmployeeProfileIdFromUser(authStore.user))
        pushIdentity(user?.employee_id)
        pushIdentity(user?.employee?.id)
        pushIdentity(user?.employee?.employee_id)

        if (identities.size === 0) {
          return []
        }

        filtered = filtered.filter((l) => identities.has(String(l.employeeId)))
      }

      if (state.filters.status !== 'All') {
        filtered = filtered.filter((l) => l.status === state.filters.status)
      }

      if (state.filters.searchQuery) {
        const query = state.filters.searchQuery.toLowerCase()
        filtered = filtered.filter(
          (l) =>
            l.employee.toLowerCase().includes(query) ||
            l.leaveType.toLowerCase().includes(query) ||
            l.leaveReason.toLowerCase().includes(query)
        )
      }

      return filtered
    },

    leavesByStatus: (state) => (status: LeaveStatus) => {
      return state.leaves.filter((l) => l.status === status)
    }
  },

  actions: {
    async fetchLeaves() {
      requireLoadedPermission('leave-list')
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
        const response = await leaveService.getAll(token)
        const raw = response.data
        const data = Array.isArray(raw) ? raw : (raw as { data?: unknown[] })?.data ?? []
        this.leaves = Array.isArray(data) ? data.map((d) => mapApiToDisplay(d as ApiLeaveWithRelations)) : []
        const meta = (response as { meta?: { pagination?: typeof this.pagination } }).meta
        this.pagination = meta?.pagination ?? null
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch leaves'
        this.error = message
        console.error('Failed to fetch leaves:', err)
        throw err
      } finally {
        this.loading = false
      }
    },

    async createLeave(payload: CreateLeavePayload) {
      requireLoadedPermission('leave-create')
      this.loading = true
      this.error = null
      const authStore = useAuthStore()
      const token = authStore.token
      if (!token) throw new Error('Authentication required')
      try {
        const safePayload = {
          ...payload,
          replacement_employee_id: payload.replacement_employee_id
        }
        const response = await leaveService.create(safePayload, token)
        const created = response.data
          ? mapApiToDisplay(response.data as ApiLeaveWithRelations)
          : null
        if (hasLoadedPermission('leave-list')) {
          await this.fetchLeaves()
        } else if (created) {
          this.leaves = [created]
        }
        return created
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create leave'
        this.error = message
        throw err
      } finally {
        this.loading = false
      }
    },

    async approveLeave(id: string | number) {
      requireLoadedPermission('approve-leave')
      this.loading = true
      this.error = null
      const authStore = useAuthStore()
      const token = authStore.token
      if (!token) throw new Error('Authentication required')
      const key = String(id).trim()
      const uuid = resolveLeaveUuid(this.leaves, key)
      try {
        await leaveService.approveByUuid(uuid, token)
        const idx = this.leaves.findIndex((l) => leaveMatchesKey(l, key) || l.uuid === uuid)
        if (idx !== -1) this.leaves[idx].status = 'Approved'
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to approve leave'
        this.error = message
        throw err
      } finally {
        this.loading = false
      }
    },

    async rejectLeave(id: string | number) {
      requireLoadedPermission('reject-leave')
      this.loading = true
      this.error = null
      const authStore = useAuthStore()
      const token = authStore.token
      if (!token) throw new Error('Authentication required')
      const key = String(id).trim()
      const uuid = resolveLeaveUuid(this.leaves, key)
      try {
        await leaveService.rejectByUuid(uuid, token)
        const idx = this.leaves.findIndex((l) => leaveMatchesKey(l, key) || l.uuid === uuid)
        if (idx !== -1) this.leaves[idx].status = 'Rejected'
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to reject leave'
        this.error = message
        throw err
      } finally {
        this.loading = false
      }
    },

    async cancelLeave(id: string | number) {
      requireLoadedPermission('cancel-leave')
      this.loading = true
      this.error = null
      const authStore = useAuthStore()
      const token = authStore.token
      if (!token) throw new Error('Authentication required')
      const key = String(id).trim()
      const uuid = resolveLeaveUuid(this.leaves, key)
      try {
        await leaveService.cancelByUuid(uuid, token)
        this.leaves = this.leaves.filter((l) => !leaveMatchesKey(l, key) && l.uuid !== uuid)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to cancel leave'
        this.error = message
        throw err
      } finally {
        this.loading = false
      }
    },

    async deleteLeave(id: string | number) {
      requireLoadedPermission('leave-delete')
      this.loading = true
      this.error = null
      const authStore = useAuthStore()
      const token = authStore.token
      if (!token) throw new Error('Authentication required')
      const normalizedId = String(id).trim()
      if (!normalizedId) throw new Error('Invalid leave ID')
      const uuid = resolveLeaveUuid(this.leaves, normalizedId)
      try {
        await leaveService.deleteByUuid(uuid, token)
        this.leaves = this.leaves.filter((l) => !leaveMatchesKey(l, normalizedId) && l.uuid !== uuid)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to delete leave'
        this.error = message
        throw err
      } finally {
        this.loading = false
      }
    },

    setFilters(filters: Partial<LeaveFilters>) {
      this.filters = { ...this.filters, ...filters }
    }
  }
})

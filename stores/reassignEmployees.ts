import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { reassignEmployeeService } from '~/services/reassignEmployeeService'
import { useAuthStore } from '~/stores/auth'
import type {
  CreateReassignEmployeePayload,
  ReassignEmployee,
  ReassignEmployeePagination,
  UpdateReassignEmployeePayload,
} from '~/types/reassignEmployee.types'
import type { ApiError } from '~/utils/apiError'

const defaultPagination = (): ReassignEmployeePagination => ({
  page: 1,
  perPage: 10,
  total: 0,
  lastPage: 1,
})

function getAuthToken() {
  const authStore = useAuthStore()
  if (!authStore.token) throw new Error('Authentication required')
  return authStore.token
}

function normalizePagination(
  page: number,
  perPage: number,
  source?: {
    total?: number
    per_page?: number
    current_page?: number
    last_page?: number
    total_pages?: number
  },
): ReassignEmployeePagination {
  const total = Number(source?.total ?? 0)
  const normalizedPerPage = Number(source?.per_page ?? perPage) || perPage
  const lastPage = Number(source?.last_page ?? source?.total_pages ?? Math.max(1, Math.ceil(total / normalizedPerPage))) || 1

  return {
    page: Number(source?.current_page ?? page) || page,
    perPage: normalizedPerPage,
    total,
    lastPage,
  }
}

export const useReassignEmployeesStore = defineStore('reassignEmployees', () => {
  const reassignments = ref<ReassignEmployee[]>([])
  const currentReassignment = ref<ReassignEmployee | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref<ReassignEmployeePagination>(defaultPagination())

  const byEmployeeId = computed(() => {
    return reassignments.value.reduce<Record<string, ReassignEmployee[]>>((groups, item) => {
      const key = String(item.employee_id)
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
      return groups
    }, {})
  })

  async function fetchReassignments(page = 1, perPage = pagination.value.perPage, search = '') {
    loading.value = true
    error.value = null

    try {
      const response = await reassignEmployeeService.getAll(
        page,
        perPage,
        getAuthToken(),
        search,
        'created_at',
        'desc',
      )
      reassignments.value = response.data || []
      pagination.value = normalizePagination(page, perPage, response.pagination || response.meta?.pagination)
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to fetch employee reassignments'
      reassignments.value = []
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchReassignmentById(uuid: string) {
    loading.value = true
    error.value = null

    try {
      const response = await reassignEmployeeService.getByUuid(uuid, getAuthToken())
      currentReassignment.value = response.data
      return response.data
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to fetch employee reassignment'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchReassignmentsByEmployeeId(employeeId: number | string) {
    loading.value = true
    error.value = null

    try {
      const response = await reassignEmployeeService.getByEmployeeId(employeeId, getAuthToken())
      return response.data || []
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to fetch employee reassignment history'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createReassignment(payload: CreateReassignEmployeePayload) {
    loading.value = true
    error.value = null

    try {
      const response = await reassignEmployeeService.create(payload, getAuthToken())
      reassignments.value.unshift(response.data)
      pagination.value.total += 1
      return response.data
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to create employee reassignment'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function updateReassignment(uuid: string, payload: UpdateReassignEmployeePayload) {
    loading.value = true
    error.value = null

    try {
      const response = await reassignEmployeeService.updateByUuid(uuid, payload, getAuthToken())
      const index = reassignments.value.findIndex((item) => item.uuid === uuid)
      if (index !== -1) reassignments.value[index] = response.data
      if (currentReassignment.value?.uuid === uuid) currentReassignment.value = response.data
      return response.data
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to update employee reassignment'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function deleteReassignment(uuid: string) {
    loading.value = true
    error.value = null

    try {
      await reassignEmployeeService.deleteByUuid(uuid, getAuthToken())
      reassignments.value = reassignments.value.filter((item) => item.uuid !== uuid)
      if (pagination.value.total > 0) pagination.value.total -= 1
      if (currentReassignment.value?.uuid === uuid) currentReassignment.value = null
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to delete employee reassignment'
      throw err
    } finally {
      loading.value = false
    }
  }

  function clearError() {
    error.value = null
  }

  function resetCurrentReassignment() {
    currentReassignment.value = null
  }

  return {
    reassignments,
    currentReassignment,
    loading,
    error,
    pagination,
    byEmployeeId,
    fetchReassignments,
    fetchReassignmentById,
    fetchReassignmentsByEmployeeId,
    createReassignment,
    updateReassignment,
    deleteReassignment,
    clearError,
    resetCurrentReassignment,
  }
})

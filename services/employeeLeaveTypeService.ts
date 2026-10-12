import type { ApiResponse } from '~/types/api'
import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'

export interface EmployeeLeaveType {
  id: string
  employee_id: string
  leave_type_id: string
  leave_type_name: string
  leave_days: number
  used_days: number
}

export interface CreateEmployeeLeaveTypePayload {
  employee_id: number | string
  leave_type_id: number | string
  leave_days?: number
}

export interface UpdateEmployeeLeaveTypePayload {
  leave_days?: number
  used_days?: number
}

function getBaseUrl() {
  const config = useRuntimeConfig()
  return config.public.apiUrl || 'http://127.0.0.1:8000/api'
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

function normalizeEmployeeLeaveType(item: EmployeeLeaveType): EmployeeLeaveType {
  return {
    ...item,
    id: String(item.id),
    employee_id: String(item.employee_id),
    leave_type_id: String(item.leave_type_id)
  }
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer.`)
  }
  return parsed
}

export const employeeLeaveTypeService = {
  async getAll(token?: string): Promise<ApiResponse<EmployeeLeaveType[]>> {
    // requireLoadedPermission('employee-leave-type-list')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/employee-leave-types`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to fetch employee leave types', response.status, err)
    }
    const json = await response.json()
    if (Array.isArray(json.data)) json.data = json.data.map(normalizeEmployeeLeaveType)
    return json
  },

  async getById(id: string, token?: string): Promise<ApiResponse<EmployeeLeaveType>> {
    requireLoadedPermission('employee-leave-type-show')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/employee-leave-types/${id}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to fetch employee leave type', response.status, err)
    }
    const json = await response.json()
    if (json.data) json.data = normalizeEmployeeLeaveType(json.data)
    return json
  },

  async getByEmployeeId(employeeId: number | string, token?: string): Promise<ApiResponse<EmployeeLeaveType[]>> {
    requireLoadedPermission('employee-leave-type-list')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/employee-leave-types?employee_id=${encodeURIComponent(String(employeeId))}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to fetch employee leave types', response.status, err)
    }
    const json = await response.json()
    if (Array.isArray(json.data)) json.data = json.data.map(normalizeEmployeeLeaveType)
    return json
  },

  async create(payload: CreateEmployeeLeaveTypePayload, token?: string): Promise<ApiResponse<EmployeeLeaveType>> {
    requireLoadedPermission('employee-leave-type-create')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')
    const body: CreateEmployeeLeaveTypePayload = {
      employee_id: positiveInteger(payload.employee_id, 'Employee ID'),
      leave_type_id: positiveInteger(payload.leave_type_id, 'Leave type ID')
    }
    if (payload.leave_days !== undefined) {
      body.leave_days = positiveInteger(payload.leave_days, 'Leave days')
    }

    const response = await fetch(`${getBaseUrl()}/employee-leave-types`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to create employee leave type', response.status, err)
    }
    const json = await response.json()
    if (json.data) json.data = normalizeEmployeeLeaveType(json.data)
    return json
  },

  async update(id: string, payload: UpdateEmployeeLeaveTypePayload, token?: string): Promise<ApiResponse<EmployeeLeaveType>> {
    requireLoadedPermission('employee-leave-type-edit')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/employee-leave-types/${id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to update employee leave type', response.status, err)
    }
    const json = await response.json()
    if (json.data) json.data = normalizeEmployeeLeaveType(json.data)
    return json
  },

  async delete(id: string, token?: string): Promise<ApiResponse<unknown>> {
    requireLoadedPermission('employee-leave-type-delete')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/employee-leave-types/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to delete employee leave type', response.status, err)
    }
    return response.json()
  },

  async getRemainingDays(employeeId: string, leaveTypeId: string, token?: string): Promise<number> {
    const result = await this.getByEmployeeId(employeeId, token)
    const item = result.data.find(item => String(item.leave_type_id) === String(leaveTypeId))
    if (!item) return 0
    return item.leave_days - item.used_days
  }
}

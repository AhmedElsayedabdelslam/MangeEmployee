import type { ApiResponse } from '~/types/api'
import type {
  AssignEmployeesToBranchPayload,
  AssignEmployeesToDepartmentPayload,
  AssignHrToCompanyPayload,
  AssignmentEntityId,
  AssignResult,
} from '~/types/assignments'
import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'

function getBaseUrl() {
  const config = useRuntimeConfig()
  return config.public.apiUrl || 'http://127.0.0.1:8000/api'
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

async function post<T>(endpoint: string, body: object, token: string): Promise<ApiResponse<T>> {
  const response = await fetch(`${getBaseUrl()}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw createApiError(err.message || `Request to ${endpoint} failed`, response.status, err)
  }
  return response.json()
}

function assignmentResult(data: unknown): AssignResult {
  const result = data && typeof data === 'object' ? data as Partial<AssignResult> : {}

  return {
    attached: Array.isArray(result.attached) ? result.attached.map(String) : [],
    detached: Array.isArray(result.detached) ? result.detached.map(String) : [],
    updated: Array.isArray(result.updated) ? result.updated.map(String) : [],
  }
}

async function postAssignment(endpoint: string, body: object, token: string): Promise<ApiResponse<AssignResult>> {
  const response = await post<unknown>(endpoint, body, token)

  return {
    ...response,
    success: response.success ?? true,
    message: response.message ?? 'Assignment updated successfully',
    status_code: response.status_code ?? 200,
    data: assignmentResult(response.data),
  }
}

function numericId(value: AssignmentEntityId, field: string) {
  const parsed = typeof value === 'number'
    ? value
    : /^\d+$/.test(String(value).trim())
      ? Number(String(value).trim())
      : NaN

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a numeric ID`)
  }

  return parsed
}

function numericIds(values: AssignmentEntityId[], field: string) {
  const ids = values.map((value, index) => numericId(value, `${field}.${index}`))
  if (ids.length === 0) throw new Error(`${field} must include at least one ID`)
  return ids
}

export const assignmentService = {
  async assignHrToCompany(
    hrIds: AssignmentEntityId[],
    companyId: AssignmentEntityId,
    token?: string
  ): Promise<ApiResponse<AssignResult>> {
    requireLoadedPermission('assign-hr-to-company')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')
    const payload: AssignHrToCompanyPayload = {
      company_id: numericId(companyId, 'company_id'),
      hr_ids: numericIds(hrIds, 'hr_ids'),
    }
    return postAssignment(
      'assign-hr-to-company',
      payload,
      authToken
    )
  },

  async removeHrFromCompany(
    hrIds: AssignmentEntityId[],
    companyId: AssignmentEntityId,
    token?: string
  ): Promise<ApiResponse<AssignResult>> {
    requireLoadedPermission('remove-hr-from-company')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')
    const payload: AssignHrToCompanyPayload = {
      company_id: numericId(companyId, 'company_id'),
      hr_ids: numericIds(hrIds, 'hr_ids'),
    }
    return postAssignment(
      'remove-hr-from-company',
      payload,
      authToken
    )
  },

  async assignEmployeesToBranch(
    employeeIds: AssignmentEntityId[],
    branchId: AssignmentEntityId,
    token?: string
  ): Promise<ApiResponse<AssignResult>> {
    requireLoadedPermission('assign-employees-to-branch')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')
    const payload: AssignEmployeesToBranchPayload = {
      branch_id: numericId(branchId, 'branch_id'),
      employee_ids: numericIds(employeeIds, 'employee_ids'),
    }
    return postAssignment('assign-employee-to-branch', payload, authToken)
  },

  async removeEmployeesFromBranch(
    employeeIds: AssignmentEntityId[],
    branchId: AssignmentEntityId,
    token?: string
  ): Promise<ApiResponse<AssignResult>> {
    requireLoadedPermission('remove-employees-from-branch')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')
    const payload: AssignEmployeesToBranchPayload = {
      branch_id: numericId(branchId, 'branch_id'),
      employee_ids: numericIds(employeeIds, 'employee_ids'),
    }
    return postAssignment(
      'remove-employee-from-branch',
      payload,
      authToken
    )
  },

  async assignEmployeesToDepartment(
    employeeIds: AssignmentEntityId[],
    departmentId: AssignmentEntityId,
    token?: string
  ): Promise<ApiResponse<AssignResult>> {
    requireLoadedPermission('assign-employees-to-department')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')
    const payload: AssignEmployeesToDepartmentPayload = {
      department_id: numericId(departmentId, 'department_id'),
      employee_ids: numericIds(employeeIds, 'employee_ids'),
    }
    return postAssignment('assign-employee-to-department', payload, authToken)
  },

  async removeEmployeesFromDepartment(
    employeeIds: AssignmentEntityId[],
    departmentId: AssignmentEntityId,
    token?: string
  ): Promise<ApiResponse<AssignResult>> {
    requireLoadedPermission('remove-employees-from-department')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')
    const payload: AssignEmployeesToDepartmentPayload = {
      department_id: numericId(departmentId, 'department_id'),
      employee_ids: numericIds(employeeIds, 'employee_ids'),
    }
    return postAssignment(
      'remove-employee-from-department',
      payload,
      authToken
    )
  },
  async unassignEmployeeFromAll(
    payload: {
      employee_id: AssignmentEntityId
      branch_ids: AssignmentEntityId[]
      department_ids: AssignmentEntityId[]
    },
    token?: string
  ): Promise<ApiResponse<AssignResult>> {
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const body = {
      employee_id: numericId(payload.employee_id, 'employee_id'),
      branch_ids: payload.branch_ids.map((id, i) => numericId(id, `branch_ids.${i}`)),
      department_ids: payload.department_ids.map((id, i) => numericId(id, `department_ids.${i}`)),
    }

    return postAssignment('assignments/remove', body, authToken)
  },

  async assignManagersToBranch(
    _managerIds: AssignmentEntityId[],
    _branchId: AssignmentEntityId,
    _token?: string
  ): Promise<ApiResponse<AssignResult>> {
    throw createApiError(
      'Manager-to-branch assignment is unavailable because the Backend route is not implemented.',
      501
    )
  },

  async removeManagersFromBranch(
    _managerIds: AssignmentEntityId[],
    _branchId: AssignmentEntityId,
    _token?: string
  ): Promise<ApiResponse<AssignResult>> {
    throw createApiError(
      'Manager-from-branch removal is unavailable because the Backend route is not implemented.',
      501
    )
  },

  async assignManagersToDepartment(
    _managerIds: AssignmentEntityId[],
    _departmentId: AssignmentEntityId,
    _token?: string
  ): Promise<ApiResponse<AssignResult>> {
    throw createApiError(
      'Manager-to-department assignment is unavailable because the Backend action is not implemented.',
      501
    )
  },

  async removeManagersFromDepartment(
    _managerIds: AssignmentEntityId[],
    _departmentId: AssignmentEntityId,
    _token?: string
  ): Promise<ApiResponse<AssignResult>> {
    throw createApiError(
      'Manager-from-department removal is unavailable because the Backend action is not implemented.',
      501
    )
  }
}

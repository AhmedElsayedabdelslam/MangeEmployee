/**
 * Employee Re-assignment API Service
 * Handles all API calls for employee assignment management
 */

import type {
  EmployeeWithAssignments,
  Branch,
  Department,
  ReassignEmployeePayload,
  BulkReassignPayload,
  UnassignEmployeePayload,
  PaginatedResponse,
  ApiResponse,
  TransferScreenFilters,
  AssignmentHistoryEntry,
  CreateReassignEmployeePayload,
  ReassignEmployee,
  ReassignEmployeeListResponse,
  ReassignEmployeeResponse,
  ReassignEmployeeStatus,
  UpdateReassignEmployeePayload,
} from '~/types/reassignEmployee.types'
import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'

type FetchOptions = NonNullable<Parameters<typeof $fetch>[1]>

function getBaseUrl() {
  const config = useRuntimeConfig()
  const configured = String(config.public.apiUrl || '/api').replace(/\/$/, '')
  return configured.endsWith('/v1') ? configured : `${configured}/v1`
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

function requestHeaders() {
  const token = getAuthToken()
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function resolveUrl(path: string): string {
  const config = useRuntimeConfig()
  const base = config.public.apiUrl || '/api'
  if (base.startsWith('http')) return `${base}${path}`
  if (typeof window !== 'undefined') return `${base}${path}`
  return `http://localhost:3000${base}${path}`
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }
}

async function handleError(response: Response, fallback: string): Promise<never> {
  const err = await response.json().catch(() => ({}))

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      window.location.href = '/login'
    }
    throw createApiError('Session expired. Please log in again.', 401, err)
  }

  const msg =
    (err as { message?: string }).message ||
    ((err as { errors?: Record<string, string[]> }).errors &&
      Object.values((err as { errors?: Record<string, string[]> }).errors ?? {}).flat()[0]) ||
    fallback

  throw createApiError(msg, response.status, err)
}

function asNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asNullableNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function asString(value: unknown): string {
  return value == null ? '' : String(value)
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = asString(value).trim()
    if (text) return text
  }
  return ''
}

function nullableText(...values: unknown[]): string | null {
  const text = firstText(...values)
  return text || null
}

function normalizeStatus(value: unknown): ReassignEmployeeStatus {
  const status = asString(value).trim().toLowerCase().replace(/[\s-]+/g, '_')

  if (['approved', 'completed', 'complete', 'processed', 'done', 'success', 'succeeded', 'applied'].includes(status)) {
    return 'approved'
  }

  if (['rejected', 'failed', 'failure', 'error', 'errored', 'declined', 'cancelled', 'canceled'].includes(status)) {
    return 'rejected'
  }

  if (['pending', 'scheduled', 'queued', 'waiting', 'in_progress', 'processing'].includes(status)) {
    return 'pending'
  }

  return 'pending'
}

function normalizeNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const numbers = value.map((item) => Number(item)).filter(Number.isFinite)
  return numbers.length > 0 ? numbers : null
}

function normalizeRelation(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  return {
    id: asNumber(row.id),
    uuid: row.uuid != null ? asString(row.uuid) : undefined,
    name: row.name != null ? asString(row.name) : undefined,
    email: row.email != null ? asString(row.email) : undefined,
    employee_id: row.employee_id != null ? asString(row.employee_id) : undefined,
    code: row.code != null ? asString(row.code) : undefined,
    company_id: row.company_id as number | string | null | undefined,
  }
}

function normalizeReassignment(raw: unknown): ReassignEmployee {
  const row = (raw ?? {}) as Record<string, unknown>
  const employee = row.employee && typeof row.employee === 'object' ? row.employee as Record<string, unknown> : {}
  const branch = (row.branch ?? row.to_branch ?? row.new_branch) && typeof (row.branch ?? row.to_branch ?? row.new_branch) === 'object'
    ? (row.branch ?? row.to_branch ?? row.new_branch) as Record<string, unknown>
    : {}
  const department = (row.department ?? row.to_department ?? row.new_department) && typeof (row.department ?? row.to_department ?? row.new_department) === 'object'
    ? (row.department ?? row.to_department ?? row.new_department) as Record<string, unknown>
    : {}

  return {
    id: row.id != null ? asNumber(row.id) : undefined,
    uuid: asString(row.uuid ?? row.id),
    employee_id: asNumber(row.employee_id ?? employee.id),
    branch_id: asNullableNumber(row.branch_id ?? row.to_branch_id ?? row.new_branch_id ?? branch.id),
    department_id: asNullableNumber(row.department_id ?? row.to_department_id ?? row.new_department_id ?? department.id),
    reassign_date: nullableText(row.reassign_date, row.transfer_date, row.reassing_date, row.scheduled_date, row.assignment_date),
    description: nullableText(row.description, row.reason, row.notes, row.note, row.comment),
    status: normalizeStatus(row.status ?? row.transfer_status ?? row.reassign_status ?? row.state),
    unassigned_branch_ids: normalizeNumberArray(row.unassigned_branch_ids),
    unassigned_department_ids: normalizeNumberArray(row.unassigned_department_ids),
    processed_at: nullableText(row.processed_at, row.processedAt, row.completed_at, row.approved_at),
    created_by: row.created_by != null ? asString(row.created_by) : null,
    created_at: firstText(row.created_at, row.createdAt, row.created_date, row.created),
    updated_at: firstText(row.updated_at, row.updatedAt, row.updated_date, row.updated),
    employee: normalizeRelation(row.employee),
    branch: normalizeRelation(row.branch ?? row.to_branch ?? row.new_branch),
    department: normalizeRelation(row.department ?? row.to_department ?? row.new_department),
    creator: normalizeRelation(row.creator),
  }
}

function extractRows(json: Record<string, unknown>): unknown[] {
  if (Array.isArray(json.data)) return json.data
  const data = json.data
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown[] }).data)) {
    return (data as { data: unknown[] }).data
  }
  return []
}

function paginationSource(json: Record<string, unknown>) {
  const data = json.data
  const root = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {}
  const meta = json.meta && typeof json.meta === 'object' ? json.meta as Record<string, unknown> : {}
  const metaPagination = meta.pagination && typeof meta.pagination === 'object'
    ? meta.pagination as Record<string, unknown>
    : undefined
  return (json.pagination as Record<string, unknown> | undefined) ?? metaPagination ?? root
}

function normalizeListResponse(
  json: Record<string, unknown>,
  fallback: { page: number; perPage: number },
): ReassignEmployeeListResponse {
  const source = paginationSource(json)
  const total = asNumber(source?.total ?? extractRows(json).length)
  const perPage = asNumber(source?.per_page ?? fallback.perPage) || fallback.perPage
  const currentPage = asNumber(source?.current_page ?? fallback.page) || fallback.page
  const lastPage = asNumber(source?.last_page ?? source?.total_pages ?? Math.max(1, Math.ceil(total / perPage))) || 1

  return {
    success: Boolean(json.success ?? true),
    message: asString(json.message ?? ''),
    data: extractRows(json).map(normalizeReassignment),
    pagination: {
      total,
      per_page: perPage,
      current_page: currentPage,
      last_page: lastPage,
    },
    meta: json.meta as ReassignEmployeeListResponse['meta'],
  }
}

function normalizeSingleResponse(json: Record<string, unknown>): ReassignEmployeeResponse {
  return {
    success: Boolean(json.success ?? true),
    message: asString(json.message ?? ''),
    data: normalizeReassignment(json.data),
  }
}

export class ReassignEmployeeService {
  private request<T>(path: string, options: FetchOptions = {}) {
    return $fetch<T>(`${getBaseUrl()}${path}`, {
      ...options,
      headers: {
        ...requestHeaders(),
        ...(options.headers as Record<string, string> | undefined),
      },
    })
  }

  async getAll(
    page: number = 1,
    perPage: number = 10,
    token?: string,
    search?: string,
    orderBy?: string,
    order?: 'asc' | 'desc',
  ): Promise<ReassignEmployeeListResponse> {
    requireLoadedPermission('reassign-employee-list')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    })
    if (search?.trim()) params.set('search', search.trim())
    if (orderBy?.trim()) params.set('order_by', orderBy.trim())
    if (order) params.set('order', order)

    const response = await fetch(`${resolveUrl('/reassign-employees')}?${params.toString()}`, {
      method: 'GET',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to fetch employee reassignments')
    return normalizeListResponse(await response.json(), { page, perPage })
  }

  async getByUuid(uuid: string, token?: string): Promise<ReassignEmployeeResponse> {
    requireLoadedPermission('reassign-employee-show')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/reassign-employees/${uuid}`), {
      method: 'GET',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to fetch employee reassignment')
    return normalizeSingleResponse(await response.json())
  }

  async getByEmployeeId(employeeId: number | string, token?: string): Promise<ReassignEmployeeListResponse> {
    requireLoadedPermission('reassign-employee-show')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const params = new URLSearchParams({
      employee_id: String(employeeId),
      per_page: '100',
    })

    const response = await fetch(`${resolveUrl('/reassign-employees')}?${params.toString()}`, {
      method: 'GET',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to fetch employee reassignment history')

    const json = await response.json()
    const normalized = normalizeListResponse(json, { page: 1, perPage: 100 })
    normalized.data = normalized.data.filter(
      (assignment) => String(assignment.employee_id) === String(employeeId),
    )
    return normalized
  }

  async create(
    payload: CreateReassignEmployeePayload,
    token?: string,
  ): Promise<ReassignEmployeeResponse> {
    requireLoadedPermission('reassign-employee-create')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')
    const requestPayload: Record<string, unknown> = {
      employee_id: Number(payload.employee_id),
      reassign_date: payload.reassign_date ?? new Date().toISOString().slice(0, 10),
      description: payload.description ?? '',
      unassigned_branch_ids: payload.unassigned_branch_ids ?? null,
      unassigned_department_ids: payload.unassigned_department_ids ?? null,
    }

    if (payload.branch_id != null) requestPayload.branch_id = Number(payload.branch_id)
    if (payload.department_id != null) requestPayload.department_id = Number(payload.department_id)

    const response = await fetch(resolveUrl('/reassign-employees'), {
      method: 'POST',
      headers: headers(authToken),
      body: JSON.stringify(requestPayload),
    })

    if (!response.ok) await handleError(response, 'Failed to create employee reassignment')
    return normalizeSingleResponse(await response.json())
  }

  async updateByUuid(
    uuid: string,
    payload: UpdateReassignEmployeePayload,
    token?: string,
  ): Promise<ReassignEmployeeResponse> {
    requireLoadedPermission('reassign-employee-edit')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/reassign-employees/${uuid}`), {
      method: 'PUT',
      headers: headers(authToken),
      body: JSON.stringify(payload),
    })

    if (!response.ok) await handleError(response, 'Failed to update employee reassignment')
    return normalizeSingleResponse(await response.json())
  }

  async deleteByUuid(uuid: string, token?: string): Promise<ApiResponse<null>> {
    requireLoadedPermission('reassign-employee-delete')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/reassign-employees/${uuid}`), {
      method: 'DELETE',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to delete employee reassignment')
    return response.json()
  }

  /**
   * Get all employees with their assignments (paginated)
   * @param page - Page number
   * @param perPage - Items per page
   * @param filters - Filter criteria
   */
  async getEmployeesWithAssignments(
    page: number = 1,
    perPage: number = 20,
    filters?: Partial<TransferScreenFilters>
  ): Promise<PaginatedResponse<EmployeeWithAssignments>> {
    const query = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
      ...(filters?.branchId && { branch_id: filters.branchId }),
      ...(filters?.departmentId && { department_id: filters.departmentId }),
      ...(filters?.searchQuery && { search: filters.searchQuery }),
      ...(filters?.status && filters.status !== 'all' && { status: filters.status }),
    })

    try {
      const response = await this.request<ApiResponse<PaginatedResponse<EmployeeWithAssignments>>>(
        `/employees/assignments?${query.toString()}`
      )

      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch employees')
      }

      return response.data as PaginatedResponse<EmployeeWithAssignments>
    } catch (error) {
      console.error('Error fetching employees with assignments:', error)
      throw error
    }
  }

  /**
   * Get single employee with all assignments
   * @param employeeId - Employee UUID
   */
  async getEmployeeAssignments(employeeId: string): Promise<EmployeeWithAssignments> {
    try {
      const response = await this.request<ApiResponse<EmployeeWithAssignments>>(
        `/employees/${employeeId}/assignments`
      )

      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch employee assignments')
      }

      return response.data as EmployeeWithAssignments
    } catch (error) {
      console.error(`Error fetching assignments for employee ${employeeId}:`, error)
      throw error
    }
  }

  /**
   * Assign employee to branch and department
   * @param payload - Assignment payload
   */
  async assignEmployee(payload: ReassignEmployeePayload): Promise<EmployeeWithAssignments> {
    try {
      const response = await this.request<ApiResponse<EmployeeWithAssignments>>(
        '/employees/assign',
        {
          method: 'POST',
          body: {
            employee_id: payload.employeeId,
            branch_id: payload.branchId,
            department_id: payload.departmentId,
            status: payload.status,
          },
        }
      )

      if (!response.success) {
        throw new Error(response.message || 'Failed to assign employee')
      }

      return response.data as EmployeeWithAssignments
    } catch (error) {
      console.error('Error assigning employee:', error)
      throw error
    }
  }

  /**
   * Unassign employee from branch and department
   * @param payload - Unassignment payload
   */
  async unassignEmployee(payload: UnassignEmployeePayload): Promise<EmployeeWithAssignments> {
    try {
      const response = await this.request<ApiResponse<EmployeeWithAssignments>>(
        '/employees/unassign',
        {
          method: 'POST',
          body: {
            employee_id: payload.employeeId,
            branch_id: payload.branchId,
            department_id: payload.departmentId,
          },
        }
      )

      if (!response.success) {
        throw new Error(response.message || 'Failed to unassign employee')
      }

      return response.data as EmployeeWithAssignments
    } catch (error) {
      console.error('Error unassigning employee:', error)
      throw error
    }
  }

  /**
   * Bulk assign/unassign employees
   * @param payload - Bulk assignment payload
   */
  async bulkReassign(payload: BulkReassignPayload): Promise<ApiResponse<{ processed: number; failed: number }>> {
    try {
      const response = await this.request<ApiResponse<{ processed: number; failed: number }>>(
        '/employees/bulk-reassign',
        {
          method: 'POST',
          body: {
            assignments: payload.assignments.map((a) => ({
              employee_id: a.employeeId,
              branch_id: a.branchId,
              department_id: a.departmentId,
              status: a.status,
            })),
          },
        }
      )

      if (!response.success) {
        throw new Error(response.message || 'Bulk reassignment failed')
      }

      return response
    } catch (error) {
      console.error('Error in bulk reassignment:', error)
      throw error
    }
  }

  /**
   * Get all branches
   */
  async getBranches(): Promise<Branch[]> {
    try {
      const response = await this.request<ApiResponse<Branch[]>>('/branches')

      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch branches')
      }

      return response.data as Branch[]
    } catch (error) {
      console.error('Error fetching branches:', error)
      throw error
    }
  }

  /**
   * Get all departments
   * @param branchId - Optional: filter by branch
   */
  async getDepartments(branchId?: string): Promise<Department[]> {
    try {
      const query = branchId ? `?branch_id=${branchId}` : ''
      const response = await this.request<ApiResponse<Department[]>>(`/departments${query}`)

      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch departments')
      }

      return response.data as Department[]
    } catch (error) {
      console.error('Error fetching departments:', error)
      throw error
    }
  }

  /**
   * Get departments by branch
   * @param branchId - Branch UUID
   */
  async getDepartmentsByBranch(branchId: string): Promise<Department[]> {
    try {
      const response = await this.request<ApiResponse<Department[]>>(
        `/branches/${branchId}/departments`
      )

      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch branch departments')
      }

      return response.data as Department[]
    } catch (error) {
      console.error(`Error fetching departments for branch ${branchId}:`, error)
      throw error
    }
  }

  /**
   * Get assignment history for employee
   * @param employeeId - Employee UUID
   * @param limit - Number of records to fetch
   */
  async getAssignmentHistory(employeeId: string, limit: number = 50): Promise<AssignmentHistoryEntry[]> {
    try {
      const response = await this.request<ApiResponse<AssignmentHistoryEntry[]>>(
        `/employees/${employeeId}/assignment-history?limit=${limit}`
      )

      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch assignment history')
      }

      return response.data as AssignmentHistoryEntry[]
    } catch (error) {
      console.error(`Error fetching assignment history for employee ${employeeId}:`, error)
      throw error
    }
  }

  /**
   * Export employees with assignments to CSV
   * @param filters - Filter criteria
   */
  async exportEmployeesAssignments(filters?: Partial<TransferScreenFilters>): Promise<Blob> {
    try {
      const query = new URLSearchParams({
        ...(filters?.branchId && { branch_id: filters.branchId }),
        ...(filters?.departmentId && { department_id: filters.departmentId }),
        ...(filters?.searchQuery && { search: filters.searchQuery }),
        ...(filters?.status && filters.status !== 'all' && { status: filters.status }),
      })

      const response = await this.request<Blob>(
        `/employees/assignments/export?${query.toString()}`,
        {
          responseType: 'blob',
        }
      )

      return response
    } catch (error) {
      console.error('Error exporting employees assignments:', error)
      throw error
    }
  }

  /**
   * Validate assignment (check if assignment is possible)
   * @param payload - Assignment payload to validate
   */
  async validateAssignment(payload: ReassignEmployeePayload): Promise<{ valid: boolean; message: string }> {
    try {
      const response = await this.request<ApiResponse<{ valid: boolean; message: string }>>(
        '/employees/validate-assignment',
        {
          method: 'POST',
          body: {
            employee_id: payload.employeeId,
            branch_id: payload.branchId,
            department_id: payload.departmentId,
            status: payload.status,
          },
        }
      )

      if (!response.success) {
        throw new Error(response.message || 'Validation failed')
      }

      return response.data as { valid: boolean; message: string }
    } catch (error) {
      console.error('Error validating assignment:', error)
      throw error
    }
  }

  /**
   * Get assignment statistics
   */
  async getAssignmentStatistics(): Promise<{
    totalEmployees: number
    totalAssignments: number
    averageAssignmentsPerEmployee: number
    branchDistribution: Record<string, number>
    departmentDistribution: Record<string, number>
  }> {
    try {
      const response = await this.request<
        ApiResponse<{
          totalEmployees: number
          totalAssignments: number
          averageAssignmentsPerEmployee: number
          branchDistribution: Record<string, number>
          departmentDistribution: Record<string, number>
        }>
      >('/employees/assignments/statistics')

      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch statistics')
      }

      return response.data as {
        totalEmployees: number
        totalAssignments: number
        averageAssignmentsPerEmployee: number
        branchDistribution: Record<string, number>
        departmentDistribution: Record<string, number>
      }
    } catch (error) {
      console.error('Error fetching assignment statistics:', error)
      throw error
    }
  }
}

// Export singleton instance
export const reassignEmployeeService = new ReassignEmployeeService()

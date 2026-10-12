import type { ApiResponse, Department, CreateDepartmentPayload, UpdateDepartmentPayload } from '~/types/settings'
import { createApiError } from '~/utils/apiError'
import { normalizeEntityRow } from '~/utils/entityApiKey'
import { requireLoadedPermission } from '~/utils/permissionAccess'
import { normalizeCollectionResponse } from '~/utils/apiCollection'
import { debugSystemSettingsResponse } from '~/utils/systemSettingsDiagnostics'

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

function normalizeDepartmentRow(row: Record<string, unknown>): Department {
  const normalized = normalizeEntityRow(row)
  const branch = row.branch && typeof row.branch === 'object'
    ? row.branch as Record<string, unknown>
    : null
  const company = branch?.company && typeof branch.company === 'object'
    ? branch.company as Record<string, unknown>
    : null

  return {
    ...normalized,
    name: String(row.name ?? row.department_name ?? '').trim(),
    branch_id: row.branch_id != null
      ? String(row.branch_id)
      : branch?.id != null
        ? String(branch.id)
        : '',
    branch_name: String(row.branch_name ?? branch?.name ?? '').trim() || undefined,
    company_name: String(
      row.company_name ??
      branch?.company_name ??
      company?.name ??
      ''
    ).trim() || undefined,
  } as Department
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
    err.message ||
    (err.errors && Object.values(err.errors as Record<string, string[]>).flat()[0]) ||
    fallback
  throw createApiError(msg, response.status, err)
}

export const departmentService = {
  async getAll(page: number = 1, perPage: number = 10, token: string, search?: string): Promise<ApiResponse<Department[]>> {
    requireLoadedPermission('department-list')
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
    if (search?.trim()) params.set('search', search.trim())
    const url = `${resolveUrl('/departments')}?${params}`
    const response = await fetch(url, {
      method: 'GET',
      headers: headers(token)
    })
    if (!response.ok) await handleError(response, 'Failed to fetch departments')
    const json = await response.json()
    debugSystemSettingsResponse('Departments', {
      url,
      status: response.status,
      payload: json,
    })
    return normalizeCollectionResponse(json, {
      page,
      perPage,
      normalizeRow: normalizeDepartmentRow,
    })
  },

  async getById(id: string, token: string): Promise<ApiResponse<Department>> {
    requireLoadedPermission('department-show')
    const response = await fetch(resolveUrl(`/departments/${id}`), {
      method: 'GET',
      headers: headers(token)
    })
    if (!response.ok) await handleError(response, 'Failed to fetch department')
    return response.json()
  },

  async getByBranch(branchId: string | number, token: string): Promise<ApiResponse<Department[]>> {
    requireLoadedPermission('department-list')
    const response = await fetch(resolveUrl(`/get-departments-by-branch/${encodeURIComponent(String(branchId))}`), {
      method: 'GET',
      headers: headers(token)
    })
    if (!response.ok) await handleError(response, 'Failed to fetch branch departments')
    const json = await response.json()
    const rows = Array.isArray(json) ? json : Array.isArray(json.data) ? json.data : []
    const data = rows.map((row: Record<string, unknown>) => {
      const normalized = normalizeEntityRow(row)
      return {
        ...normalized,
        name: String(row.name ?? row.department_name ?? normalized.name ?? '').trim(),
      }
    }) as Department[]
    return Array.isArray(json)
      ? {
          success: true,
          message: 'Departments fetched successfully',
          data,
        }
      : {
          ...json,
          data,
        }
  },

  async create(payload: CreateDepartmentPayload, token: string): Promise<ApiResponse<Department>> {
    requireLoadedPermission('department-create')
    const response = await fetch(resolveUrl('/departments'), {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify(payload)
    })
    if (!response.ok) await handleError(response, 'Failed to create department')
    return response.json()
  },

  async update(id: string, payload: UpdateDepartmentPayload, token: string): Promise<ApiResponse<Department>> {
    requireLoadedPermission('department-edit')
    const response = await fetch(resolveUrl(`/departments/${id}`), {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify(payload)
    })
    if (!response.ok) await handleError(response, 'Failed to update department')
    return response.json()
  },

  async delete(id: string, token: string): Promise<ApiResponse<unknown>> {
    requireLoadedPermission('department-delete')
    const response = await fetch(resolveUrl(`/departments/${id}`), {
      method: 'DELETE',
      headers: headers(token)
    })
    if (!response.ok) await handleError(response, 'Failed to delete department')
    return response.json()
  }
}

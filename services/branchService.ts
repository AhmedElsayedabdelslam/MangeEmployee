import type { ApiResponse, Branch, CreateBranchPayload, UpdateBranchPayload } from '~/types/settings'
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

function normalizeBranchRow(row: Record<string, unknown>): Branch {
  const normalized = normalizeEntityRow(row)
  const company = row.company && typeof row.company === 'object'
    ? row.company as Record<string, unknown>
    : null

  return {
    ...normalized,
    name: String(row.name ?? row.branch_name ?? '').trim(),
    company_id: row.company_id != null
      ? String(row.company_id)
      : company?.id != null
        ? String(company.id)
        : undefined,
    company_name: String(row.company_name ?? company?.name ?? '').trim() || undefined,
  } as Branch
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

export const branchService = {
  async getAll(page: number = 1, perPage: number = 10, token: string, search?: string): Promise<ApiResponse<Branch[]>> {
    requireLoadedPermission('branch-list')
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
    if (search?.trim()) params.set('search', search.trim())
    const url = `${resolveUrl('/branches')}?${params}`
    const response = await fetch(url, {
      method: 'GET',
      headers: headers(token)
    })
    if (!response.ok) await handleError(response, 'Failed to fetch branches')
    const json = await response.json()
    debugSystemSettingsResponse('Branches', {
      url,
      status: response.status,
      payload: json,
    })
    return normalizeCollectionResponse(json, {
      page,
      perPage,
      normalizeRow: normalizeBranchRow,
    })
  },

  async getById(id: string, token: string): Promise<ApiResponse<Branch>> {
    requireLoadedPermission('branch-show')
    const response = await fetch(resolveUrl(`/branches/${id}`), {
      method: 'GET',
      headers: headers(token)
    })
    if (!response.ok) await handleError(response, 'Failed to fetch branch')
    return response.json()
  },

  async create(payload: CreateBranchPayload, token: string): Promise<ApiResponse<Branch>> {
    requireLoadedPermission('branch-create')
    const response = await fetch(resolveUrl('/branches'), {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify(payload)
    })
    if (!response.ok) await handleError(response, 'Failed to create branch')
    return response.json()
  },

  async update(id: string, payload: UpdateBranchPayload, token: string): Promise<ApiResponse<Branch>> {
    requireLoadedPermission('branch-edit')
    const response = await fetch(resolveUrl(`/branches/${id}`), {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify(payload)
    })
    if (!response.ok) await handleError(response, 'Failed to update branch')
    return response.json()
  },

  async delete(id: string, token: string): Promise<ApiResponse<unknown>> {
    requireLoadedPermission('branch-delete')
    const response = await fetch(resolveUrl(`/branches/${id}`), {
      method: 'DELETE',
      headers: headers(token)
    })
    if (!response.ok) await handleError(response, 'Failed to delete branch')
    return response.json()
  }
}

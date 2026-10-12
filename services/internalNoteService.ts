import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'

export interface ApiInternalNote {
  id: string
  body: string
  uuid :string
  employee_id: number | string
  employee_name?: string
  created_by: string
  edited_by: string | null
  created_at: string
  updated_at: string
  creator?: { id: string; name: string; email?: string }
  editor?: { id: string; name: string; email?: string } | null
  employee?: { id: string; name: string; email?: string }
}

export interface CreateInternalNotePayload {
  body: string
  employee_id: number
}

export interface UpdateInternalNotePayload {
  body: string
  employee_id: number
}

export interface PaginatedResponse<T> {
  success: boolean
  message: string
  data: T
  meta?: {
    pagination: {
      total: number
      per_page: number
      current_page: number
      last_page: number
      next_page_url: string | null
      prev_page_url: string | null
      from: number
      to: number
    }
  }
}

function resolveUrl(path: string): string {
  const config = useRuntimeConfig()
  const base = config.public.apiUrl || '/api'
  if (base.startsWith('http')) return `${base}${path}`
  if (typeof window !== 'undefined') return `${base}${path}`
  return `http://127.0.0.1:8000${base}${path}`
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
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
    err.message ||
    (err.errors && Object.values(err.errors as Record<string, string[]>).flat()[0]) ||
    fallback
  throw createApiError(msg, response.status, err)
}

export const internalNoteService = {
  async getAll(page: number = 1, token: string) {
    requireLoadedPermission('internal-note-list')
    const params = new URLSearchParams({ page: String(page) })
    const response = await fetch(`${resolveUrl('/internal-notes')}?${params.toString()}`, {
      method: 'GET',
      headers: headers(token)
    })
    if (!response.ok) await handleError(response, 'Failed to fetch internal notes')
    return response.json() as Promise<PaginatedResponse<ApiInternalNote[]>>
  },

  async getByEmployeeId(employeeId: number | string, token: string) {
    requireLoadedPermission('internal-note-list')
    const params = new URLSearchParams({ employee_id: String(employeeId) })
    const response = await fetch(`${resolveUrl('/internal-notes')}?${params.toString()}`, {
      method: 'GET',
      headers: headers(token)
    })
    if (!response.ok) await handleError(response, 'Failed to fetch employee notes')
    return response.json() as Promise<PaginatedResponse<ApiInternalNote[]>>
  },

  async getById(id: number | string, token: string) {
    requireLoadedPermission('internal-note-show')
    const response = await fetch(resolveUrl(`/internal-notes/${id}`), {
      method: 'GET',
      headers: headers(token)
    })
    if (!response.ok) await handleError(response, 'Failed to fetch internal note')
    return response.json() as Promise<PaginatedResponse<ApiInternalNote>>
  },

  async create(payload: CreateInternalNotePayload, token: string) {
    requireLoadedPermission('internal-note-create')
    const response = await fetch(resolveUrl('/internal-notes'), {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify(payload)
    })
    if (!response.ok) await handleError(response, 'Failed to create internal note')
    return response.json() as Promise<PaginatedResponse<ApiInternalNote>>
  },

  async update(id: number | string, payload: UpdateInternalNotePayload, token: string) {
    requireLoadedPermission('internal-note-edit')
    const response = await fetch(resolveUrl(`/internal-notes/${id}`), {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify(payload)
    })
    if (!response.ok) await handleError(response, 'Failed to update internal note')
    return response.json() as Promise<PaginatedResponse<ApiInternalNote>>
  },

  async delete(id: number | string, token: string) {
    requireLoadedPermission('internal-note-delete')
    const response = await fetch(resolveUrl(`/internal-notes/${id}`), {
      method: 'DELETE',
      headers: headers(token)
    })
    if (!response.ok) await handleError(response, 'Failed to delete internal note')
    return response.json() as Promise<PaginatedResponse<unknown>>
  }
}

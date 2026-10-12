import type { ApiResponse } from '~/types/api'
import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'

export interface Payee {
  id: number
  uuid?: string
  name: string
  payee_name: string
  contact_number: string
  created_by?: number
  created_at?: string
  updated_at?: string
}

export interface CreatePayeePayload {
  name: string
  contact_number?: string
}

export interface UpdatePayeePayload {
  name?: string
  contact_number?: string
}

export interface PayeesPagination {
  current_page: number
  per_page: number
  total: number
  last_page: number
  total_pages?: number
}

export interface PayeesListResponse {
  success: boolean
  message: string
  data: Payee[]
  pagination?: PayeesPagination
  meta?: ApiResponse<Payee[]>['meta']
  status_code?: number
}

function resolveUrl(path: string): string {
  const config = useRuntimeConfig()
  const base = config.public.apiUrl || 'http://127.0.0.1:8001/api'
  return `${base}${path}`
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }
}

function normalizePayee(raw: unknown): Payee {
  const entry = (raw ?? {}) as Record<string, unknown>
  const payeeName = String(entry.payee_name ?? entry.name ?? '')

  return {
    id: Number(entry.id ?? 0),
    uuid: entry.uuid != null ? String(entry.uuid) : undefined,
    name: payeeName,
    payee_name: payeeName,
    contact_number: String(entry.contact_number ?? ''),
    created_by: entry.created_by != null ? Number(entry.created_by) : undefined,
    created_at: entry.created_at != null ? String(entry.created_at) : undefined,
    updated_at: entry.updated_at != null ? String(entry.updated_at) : undefined,
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

export const payeeService = {
  async getAllPayees(
    page = 1,
    perPage = 10,
    search = '',
    orderBy = 'id',
    order: 'asc' | 'desc' = 'desc',
    token?: string,
  ): Promise<PayeesListResponse> {
    requireLoadedPermission('payee-list')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      order_by: orderBy,
      order,
    })
    if (search.trim()) params.set('search', search.trim())

    const response = await fetch(`${resolveUrl('/payees')}?${params.toString()}`, {
      method: 'GET',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to fetch payees')

    const json = await response.json()
    json.data = Array.isArray(json.data) ? json.data.map(normalizePayee) : []
    return json
  },

  async getPayeeById(id: number | string, token?: string): Promise<ApiResponse<Payee>> {
    requireLoadedPermission('payee-show')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/payees/${id}`), {
      method: 'GET',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to fetch payee')
    const json = await response.json()
    json.data = normalizePayee(json.data)
    return json
  },

  async createPayee(
    data: CreatePayeePayload,
    token?: string,
  ): Promise<ApiResponse<Payee>> {
    requireLoadedPermission('payee-create')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl('/payees'), {
      method: 'POST',
      headers: headers(authToken),
      body: JSON.stringify(data),
    })

    if (!response.ok) await handleError(response, 'Failed to create payee')
    const json = await response.json()
    json.data = normalizePayee(json.data)
    return json
  },

  async updatePayee(
    id: number | string,
    data: UpdatePayeePayload,
    token?: string,
  ): Promise<ApiResponse<Payee>> {
    requireLoadedPermission('payee-edit')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/payees/${id}`), {
      method: 'PUT',
      headers: headers(authToken),
      body: JSON.stringify(data),
    })

    if (!response.ok) await handleError(response, 'Failed to update payee')
    const json = await response.json()
    json.data = normalizePayee(json.data)
    return json
  },

  async deletePayee(id: number | string, token?: string): Promise<ApiResponse<null>> {
    requireLoadedPermission('payee-delete')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/payees/${id}`), {
      method: 'DELETE',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to delete payee')
    return response.json()
  },
}

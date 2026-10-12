import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'
import type {
  CreatePayerPayload,
  Payer,
  PayerResponse,
  PayersListResponse,
  UpdatePayerPayload,
} from '~/types/payer'

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

function normalizePayer(raw: unknown): Payer {
  const entry = (raw ?? {}) as Record<string, unknown>
  const payerName = String(entry.payer_name ?? entry.name ?? '')

  return {
    id: Number(entry.id ?? 0),
    uuid: entry.uuid != null ? String(entry.uuid) : undefined,
    name: payerName,
    payer_name: payerName,
    contact_number: String(entry.contact_number ?? ''),
    is_active: entry.is_active as number | boolean | undefined,
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

export const payerService = {
  async getAllPayers(
    page = 1,
    perPage = 10,
    search = '',
    token?: string,
  ): Promise<PayersListResponse> {
    requireLoadedPermission('payer-list')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    })
    if (search.trim()) params.set('search', search.trim())

    const response = await fetch(`${resolveUrl('/payers')}?${params.toString()}`, {
      method: 'GET',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to fetch payers')

    const json = await response.json()
    json.data = Array.isArray(json.data) ? json.data.map(normalizePayer) : []
    return json
  },

  async getPayerById(id: number | string, token?: string): Promise<PayerResponse> {
    requireLoadedPermission('payer-show')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/payers/${id}`), {
      method: 'GET',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to fetch payer')
    const json = await response.json()
    json.data = normalizePayer(json.data)
    return json
  },

  async createPayer(payload: CreatePayerPayload, token?: string): Promise<PayerResponse> {
    requireLoadedPermission('payer-create')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl('/payers'), {
      method: 'POST',
      headers: headers(authToken),
      body: JSON.stringify(payload),
    })

    if (!response.ok) await handleError(response, 'Failed to create payer')
    const json = await response.json()
    json.data = normalizePayer(json.data)
    return json
  },

  async updatePayer(id: number | string, payload: UpdatePayerPayload, token?: string): Promise<PayerResponse> {
    requireLoadedPermission('payer-edit')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/payers/${id}`), {
      method: 'PUT',
      headers: headers(authToken),
      body: JSON.stringify(payload),
    })

    if (!response.ok) await handleError(response, 'Failed to update payer')
    const json = await response.json()
    json.data = normalizePayer(json.data)
    return json
  },

  async deletePayer(id: number | string, token?: string): Promise<{ success: boolean; message: string; data: null }> {
    requireLoadedPermission('payer-delete')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/payers/${id}`), {
      method: 'DELETE',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to delete payer')
    return response.json()
  },
}

import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'
import type {
  AccountListResponse,
  CreateAccountListPayload,
  UpdateAccountListPayload,
} from '~/types/accountList'

type AccountListKey = number | string

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

export const accountListService = {
  async getAll(
    page = 1,
    perPage = 10,
    search = '',
    token?: string,
  ): Promise<AccountListResponse> {
    requireLoadedPermission('accountlist-list')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    })

    if (search.trim()) params.set('search', search.trim())

    const response = await fetch(`${resolveUrl('/account-lists')}?${params.toString()}`, {
      method: 'GET',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to fetch accounts')
    return response.json()
  },

  async create(
    payload: CreateAccountListPayload,
    token?: string,
  ): Promise<AccountListResponse> {
    requireLoadedPermission('accountlist-create')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl('/account-lists'), {
      method: 'POST',
      headers: headers(authToken),
      body: JSON.stringify(payload),
    })

    if (!response.ok) await handleError(response, 'Failed to create account')
    return response.json()
  },

  async getById(id: AccountListKey, token?: string): Promise<AccountListResponse> {
    requireLoadedPermission('accountlist-show')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/account-lists/${id}`), {
      method: 'GET',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to fetch account')
    return response.json()
  },

  async update(
    id: AccountListKey,
    payload: UpdateAccountListPayload,
    token?: string,
  ): Promise<AccountListResponse> {
    requireLoadedPermission('accountlist-edit')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/account-lists/${id}`), {
      method: 'PUT',
      headers: headers(authToken),
      body: JSON.stringify(payload),
    })

    if (!response.ok) await handleError(response, 'Failed to update account')
    return response.json()
  },

  async delete(id: AccountListKey, token?: string): Promise<AccountListResponse> {
    requireLoadedPermission('accountlist-delete')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/account-lists/${id}`), {
      method: 'DELETE',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to delete account')
    return response.json()
  },

  async getBalance(id: AccountListKey, token?: string): Promise<AccountListResponse> {
    requireLoadedPermission('accountlist-list')
    void id
    void token
    throw createApiError(
      'Current account balance is unavailable.',
      503,
      { blockedBy: 'backend-permission-missing' },
    )
  },
}

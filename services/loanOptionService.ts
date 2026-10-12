import type { ApiResponse, LoanOption } from '~/types/settings'
import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'

interface NamePayload {
  name: string
}

function normalizeOption<T extends { id: string | number }>(item: T): T & { id: string } {
  return { ...item, id: String(item.id) }
}

function resolveUrl(path: string): string {
  const config = useRuntimeConfig()
  const base = config.public.apiUrl || '/api'
  if (base.startsWith('http')) return `${base}${path}`
  if (typeof window !== 'undefined') return `${base}${path}`
  return `http://localhost:3000${base}${path}`
}

function headers(token?: string) {
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }

  if (token) baseHeaders.Authorization = `Bearer ${token}`
  return baseHeaders
}

async function toApiError(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => ({}))
  const payloadMessage =
    typeof (payload as { message?: unknown })?.message === 'string'
      ? (payload as { message: string }).message
      : ''
  const firstValidationMessage = Object.values(
    (payload as { errors?: Record<string, string[]> }).errors ?? {}
  ).flat()[0]
  const message = payloadMessage || firstValidationMessage || fallback

  throw createApiError(message, response.status, payload)
}

const handleApiError = (error: unknown, moduleName: string): never => {
  const status = typeof (error as { status?: unknown })?.status === 'number'
    ? (error as { status: number }).status
    : null

  if (status === 404) {
    throw createApiError(
      `The ${moduleName} API endpoint is not yet available on the backend. Please contact the backend team.`,
      404,
      error
    )
  }

  if (status === 403) {
    throw createApiError(
      `Permission denied: Your account needs the "${moduleName.toLowerCase().replace(/\s+/g, '-')}-*" permissions.`,
      403,
      error
    )
  }

  if (error instanceof Error) throw error
  throw createApiError(`Failed to process ${moduleName} request.`, 500, error)
}

export const loanOptionService = {
  async getAll(
    page: number = 1,
    perPage: number = 10,
    token: string,
    search?: string
  ): Promise<ApiResponse<LoanOption[]>> {
    requireLoadedPermission('loan-option-list')
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString()
      })
      if (search) params.append('search', search)

      const response = await fetch(`${resolveUrl('/loan-options')}?${params.toString()}`, {
        method: 'GET',
        headers: headers(token)
      })

      if (!response.ok) await toApiError(response, 'Failed to fetch loan options')

      const json = await response.json()
      if (json.data === null || json.data === undefined) json.data = []
      else if (Array.isArray(json.data)) json.data = json.data.map(normalizeOption)
      return json
    } catch (error) {
      return handleApiError(error, 'Loan Option')
    }
  },

  async create(data: NamePayload, token: string): Promise<ApiResponse<LoanOption>> {
    requireLoadedPermission('loan-option-create')
    try {
      const response = await fetch(resolveUrl('/loan-options'), {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(data)
      })

      if (!response.ok) await toApiError(response, 'Failed to create loan option')
      const json = await response.json()
      if (json.data?.id != null) json.data = normalizeOption(json.data)
      return json
    } catch (error) {
      return handleApiError(error, 'Loan Option')
    }
  },

  async update(id: string, data: NamePayload, token: string): Promise<ApiResponse<LoanOption>> {
    requireLoadedPermission('loan-option-edit')
    try {
      const response = await fetch(resolveUrl(`/loan-options/${id}`), {
        method: 'PUT',
        headers: headers(token),
        body: JSON.stringify(data)
      })

      if (!response.ok) await toApiError(response, 'Failed to update loan option')
      const json = await response.json()
      if (json.data?.id != null) json.data = normalizeOption(json.data)
      return json
    } catch (error) {
      return handleApiError(error, 'Loan Option')
    }
  },

  async delete(id: string, token: string): Promise<ApiResponse<unknown>> {
    requireLoadedPermission('loan-option-delete')
    try {
      const response = await fetch(resolveUrl(`/loan-options/${id}`), {
        method: 'DELETE',
        headers: headers(token)
      })

      if (!response.ok) await toApiError(response, 'Failed to delete loan option')
      return response.json()
    } catch (error) {
      return handleApiError(error, 'Loan Option')
    }
  }
}

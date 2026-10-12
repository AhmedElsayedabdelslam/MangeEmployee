import type { ApiResponse, PayslipType } from '~/types/settings'
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
      `Your account does not have access to this ${moduleName.toLowerCase()} action.`,
      403,
      error
    )
  }

  if (error instanceof Error) throw error
  throw createApiError(`Failed to process ${moduleName} request.`, 500, error)
}

export const payslipTypeService = {
  async getAll(
    page: number = 1,
    perPage: number = 10,
    token: string,
    search?: string
  ): Promise<ApiResponse<PayslipType[]>> {
    requireLoadedPermission('payslip-type-list')
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString()
      })
      if (search) params.append('search', search)

      const response = await fetch(`${resolveUrl('/payslip-types')}?${params.toString()}`, {
        method: 'GET',
        headers: headers(token)
      })

      if (!response.ok) await toApiError(response, 'Failed to fetch payslip types')

      const json = await response.json()
      if (json.data === null || json.data === undefined) json.data = []
      else if (Array.isArray(json.data)) json.data = json.data.map(normalizeOption)
      return json
    } catch (error) {
      return handleApiError(error, 'Payslip Type')
    }
  },

  async create(data: NamePayload, token: string): Promise<ApiResponse<PayslipType>> {
    requireLoadedPermission('payslip-type-create')
    try {
      const response = await fetch(resolveUrl('/payslip-types'), {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(data)
      })

      if (!response.ok) await toApiError(response, 'Failed to create payslip type')
      const json = await response.json()
      if (json.data?.id != null) json.data = normalizeOption(json.data)
      return json
    } catch (error) {
      return handleApiError(error, 'Payslip Type')
    }
  },

  async update(id: string, data: NamePayload, token: string): Promise<ApiResponse<PayslipType>> {
    requireLoadedPermission('payslip-type-edit')
    try {
      const response = await fetch(resolveUrl(`/payslip-types/${id}`), {
        method: 'PUT',
        headers: headers(token),
        body: JSON.stringify(data)
      })

      if (!response.ok) await toApiError(response, 'Failed to update payslip type')
      const json = await response.json()
      if (json.data?.id != null) json.data = normalizeOption(json.data)
      return json
    } catch (error) {
      return handleApiError(error, 'Payslip Type')
    }
  },

  async delete(id: string, token: string): Promise<ApiResponse<unknown>> {
    requireLoadedPermission('payslip-type-delete')
    try {
      const response = await fetch(resolveUrl(`/payslip-types/${id}`), {
        method: 'DELETE',
        headers: headers(token)
      })

      if (!response.ok) await toApiError(response, 'Failed to delete payslip type')
      return response.json()
    } catch (error) {
      return handleApiError(error, 'Payslip Type')
    }
  }
}

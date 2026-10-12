import type { ApiResponse } from '~/types/api'
import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'

export interface SalaryAddition {
  id: number
  uuid?: string
  name: string
  amount: string
  salary_id: number
}

export interface CreateSalaryAdditionPayload {
  name: string
  amount: string | number
  salary_id: number
}

export interface UpdateSalaryAdditionPayload {
  name?: string
  amount?: string | number
}

function getBaseUrl() {
  const config = useRuntimeConfig()
  return config.public.apiUrl || 'http://127.0.0.1:8000/api'
}

export const salaryAdditionService = {
  async getAll(token: string): Promise<ApiResponse<SalaryAddition[]>> {
    requireLoadedPermission('salary-addition-list')
    const response = await fetch(`${getBaseUrl()}/salary-additions`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to fetch salary additions', response.status, err)
    }
    return response.json()
  },

  async getById(uuid: string, token: string): Promise<ApiResponse<SalaryAddition>> {
    requireLoadedPermission('salary-addition-show')
    const response = await fetch(`${getBaseUrl()}/salary-additions/${encodeURIComponent(uuid)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to fetch salary addition', response.status, err)
    }
    return response.json()
  },

  async getBySalaryId(salaryId: number, token: string): Promise<ApiResponse<SalaryAddition[]>> {
    requireLoadedPermission('salary-addition-list')
    const response = await fetch(`${getBaseUrl()}/salary-additions?salary_id=${salaryId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to fetch salary additions', response.status, err)
    }
    return response.json()
  },

  async create(payload: CreateSalaryAdditionPayload, token: string): Promise<ApiResponse<SalaryAddition>> {
    requireLoadedPermission('salary-addition-create')
    const apiPayload = {
      name: payload.name,
      amount: typeof payload.amount === 'number' ? payload.amount.toFixed(2) : payload.amount,
      salary_id: payload.salary_id
    }
    const response = await fetch(`${getBaseUrl()}/salary-additions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(apiPayload)
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to create salary addition', response.status, err)
    }
    return response.json()
  },

  async update(uuid: string, payload: UpdateSalaryAdditionPayload, token: string): Promise<ApiResponse<SalaryAddition>> {
    requireLoadedPermission('salary-addition-edit')
    const apiPayload: any = {}
    if (payload.name !== undefined) apiPayload.name = payload.name
    if (payload.amount !== undefined) {
      apiPayload.amount = typeof payload.amount === 'number' ? payload.amount.toFixed(2) : payload.amount
    }
    const response = await fetch(`${getBaseUrl()}/salary-additions/${encodeURIComponent(uuid)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(apiPayload)
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to update salary addition', response.status, err)
    }
    return response.json()
  },

  async delete(uuid: string, token: string): Promise<ApiResponse<unknown>> {
    requireLoadedPermission('salary-addition-delete')
    const response = await fetch(`${getBaseUrl()}/salary-additions/${encodeURIComponent(uuid)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to delete salary addition', response.status, err)
    }
    return response.json()
  }
}

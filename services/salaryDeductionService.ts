import type { ApiResponse } from '~/types/api'
import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'

export interface SalaryDeduction {
  id: number
  uuid: string
  name: string
  amount: string
  salary_id: number
}

export interface CreateSalaryDeductionPayload {
  name: string
  amount: string | number
  salary_id: number
}

export interface UpdateSalaryDeductionPayload {
  name?: string
  amount?: string | number
}

function getBaseUrl() {
  const config = useRuntimeConfig()
  return config.public.apiUrl || 'http://127.0.0.1:8000/api'
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  }
}

export const salaryDeductionService = {
  async getAll(
    page: number = 1,
    perPage: number = 10,
    token: string,
    orderBy: string = 'id',
    order: 'asc' | 'desc' = 'desc'
  ): Promise<ApiResponse<SalaryDeduction[]>> {
    requireLoadedPermission('salary-deduction-list')
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
      order_by: orderBy,
      order
    })
    const response = await fetch(`${getBaseUrl()}/salary-deductions?${params}`, {
      method: 'GET',
      headers: headers(token)
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to fetch salary deductions', response.status, err)
    }
    return response.json()
  },

  async getByUuid(uuid: string, token: string): Promise<ApiResponse<SalaryDeduction>> {
    requireLoadedPermission('salary-deduction-show')
    const response = await fetch(`${getBaseUrl()}/salary-deductions/${encodeURIComponent(uuid)}`, {
      method: 'GET',
      headers: headers(token)
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to fetch salary deduction', response.status, err)
    }
    return response.json()
  },

  async getBySalaryId(salaryId: number, token: string): Promise<ApiResponse<SalaryDeduction[]>> {
    requireLoadedPermission('salary-deduction-list')
    const params = new URLSearchParams({
      salary_id: salaryId.toString(),
      per_page: '1000',
      order_by: 'id',
      order: 'desc'
    })
    const response = await fetch(`${getBaseUrl()}/salary-deductions?${params}`, {
      method: 'GET',
      headers: headers(token)
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to fetch salary deductions', response.status, err)
    }
    return response.json()
  },

  async create(payload: CreateSalaryDeductionPayload, token: string): Promise<ApiResponse<SalaryDeduction>> {
    requireLoadedPermission('salary-deduction-create')
    const apiPayload = {
      name: payload.name,
      amount: typeof payload.amount === 'number' ? payload.amount.toFixed(2) : payload.amount,
      salary_id: payload.salary_id
    }
    const response = await fetch(`${getBaseUrl()}/salary-deductions`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify(apiPayload)
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to create salary deduction', response.status, err)
    }
    return response.json()
  },

  async updateByUuid(uuid: string, payload: UpdateSalaryDeductionPayload, token: string): Promise<ApiResponse<SalaryDeduction>> {
    requireLoadedPermission('salary-deduction-edit')
    const apiPayload: UpdateSalaryDeductionPayload = {}
    if (payload.name !== undefined) apiPayload.name = payload.name
    if (payload.amount !== undefined) {
      apiPayload.amount = typeof payload.amount === 'number' ? payload.amount.toFixed(2) : payload.amount
    }
    const response = await fetch(`${getBaseUrl()}/salary-deductions/${encodeURIComponent(uuid)}`, {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify(apiPayload)
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to update salary deduction', response.status, err)
    }
    return response.json()
  },

  async deleteByUuid(uuid: string, token: string): Promise<ApiResponse<unknown>> {
    requireLoadedPermission('salary-deduction-delete')
    const response = await fetch(`${getBaseUrl()}/salary-deductions/${encodeURIComponent(uuid)}`, {
      method: 'DELETE',
      headers: headers(token)
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to delete salary deduction', response.status, err)
    }
    return response.json()
  }
}

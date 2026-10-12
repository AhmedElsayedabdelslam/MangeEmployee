import type { ApiResponse } from '~/types/api'
import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'
import type {
  SaturationDeduction,
  SaturationDeductionPayload,
  UpdateSaturationDeductionPayload
} from '~/types/saturationDeduction'
import { normalizeSaturationDeductionType } from '~/types/saturationDeduction'

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

export function normalizeSaturationDeductionList(data: unknown): SaturationDeduction[] {
  if (Array.isArray(data)) return data as SaturationDeduction[]

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>

    if (Array.isArray(record.data)) {
      return normalizeSaturationDeductionList(record.data)
    }

    if (record.data && typeof record.data === 'object') {
      const inner = record.data as Record<string, unknown>
      if (Array.isArray(inner.data)) return inner.data as SaturationDeduction[]
    }

    if ('id' in record && ('employee_id' in record || 'title' in record)) {
      return [data as SaturationDeduction]
    }
  }

  return []
}

export function extractSaturationDeductionResponse(raw: unknown): SaturationDeduction[] {
  if (!raw || typeof raw !== 'object') return []
  const record = raw as Record<string, unknown>
  return normalizeSaturationDeductionList(record.data ?? raw)
}

function validateAmountPair(amount: number, monthlyDeduction: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be greater than 0')
  }
  if (!Number.isFinite(monthlyDeduction) || monthlyDeduction <= 0) {
    throw new Error('Monthly deduction must be greater than 0')
  }
  if (monthlyDeduction > amount) {
    throw new Error('Monthly deduction cannot exceed total amount')
  }
}

export function validateSaturationDeductionCreatePayload(payload: SaturationDeductionPayload) {
  if (!payload.title?.trim()) throw new Error('Title is required')
  if (!payload.salary_id) throw new Error('Salary is required')
  if (!payload.employee_id) throw new Error('Employee is required')
  if (!payload.deduction_option_id) throw new Error('Deduction option is required')
  if (!payload.start_date) throw new Error('Start date is required')
  if (!payload.type) throw new Error('Type is required')

  const normalizedType = normalizeSaturationDeductionType(payload.type)
  validateAmountPair(Number(payload.amount), Number(payload.monthly_deduction))

  if (normalizedType === 'regularly' && Number(payload.monthly_deduction) > Number(payload.amount)) {
    throw new Error('Monthly deduction cannot exceed total amount')
  }
}

export function validateSaturationDeductionUpdatePayload(payload: UpdateSaturationDeductionPayload) {
  if (!payload.type) throw new Error('Type is required')

  if (payload.amount != null || payload.monthly_deduction != null) {
    const amount = Number(payload.amount ?? 0)
    const monthlyDeduction = Number(payload.monthly_deduction ?? 0)
    validateAmountPair(amount, monthlyDeduction)
  }
}

export const saturationDeductionService = {
  async getAll(
    token: string,
    page: number = 1,
    perPage: number = 10
  ): Promise<ApiResponse<SaturationDeduction[]>> {
    requireLoadedPermission('saturation-deduction-list')
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage)
    })

    const response = await fetch(`${getBaseUrl()}/saturation-deductions?${params}`, {
      method: 'GET',
      headers: headers(token)
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(
        (err as { message?: string }).message || 'Failed to fetch saturation deductions',
        response.status,
        err
      )
    }

    const json = await response.json()
    json.data = normalizeSaturationDeductionList(json.data)
    return json
  },

  async getBySalary(
    salaryId: string | number,
    token: string
  ): Promise<ApiResponse<SaturationDeduction[]>> {
    requireLoadedPermission('saturation-deduction-list')
    const params = new URLSearchParams({
      salary_id: String(salaryId),
      page: '1',
      per_page: '1000'
    })

    const response = await fetch(
      `${getBaseUrl()}/saturation-deductions?${params}`,
      {
        method: 'GET',
        headers: headers(token)
      }
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(
        (err as { message?: string }).message || 'Failed to fetch salary deductions',
        response.status,
        err
      )
    }

    const json = await response.json()
    json.data = normalizeSaturationDeductionList(json.data)
    return json
  },

  /** @deprecated Use getBySalary — employee_id returns deductions across all salaries for that employee. */
  async getByEmployee(
    employeeId: string | number,
    token: string
  ): Promise<ApiResponse<SaturationDeduction[]>> {
    requireLoadedPermission('saturation-deduction-list')
    const params = new URLSearchParams({
      employee_id: String(employeeId),
      page: '1',
      per_page: '1000'
    })

    const response = await fetch(
      `${getBaseUrl()}/saturation-deductions?${params}`,
      {
        method: 'GET',
        headers: headers(token)
      }
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(
        (err as { message?: string }).message || 'Failed to fetch employee deductions',
        response.status,
        err
      )
    }

    const json = await response.json()
    json.data = normalizeSaturationDeductionList(json.data)
    return json
  },

  async getById(
    id: string | number,
    token: string
  ): Promise<ApiResponse<SaturationDeduction>> {
    requireLoadedPermission('saturation-deduction-show')
    const response = await fetch(`${getBaseUrl()}/saturation-deductions/${encodeURIComponent(String(id))}`, {
      method: 'GET',
      headers: headers(token)
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(
        (err as { message?: string }).message || 'Failed to fetch deduction',
        response.status,
        err
      )
    }

    return response.json()
  },

  async create(
    payload: SaturationDeductionPayload,
    token: string
  ): Promise<ApiResponse<SaturationDeduction>> {
    requireLoadedPermission('saturation-deduction-create')
    validateSaturationDeductionCreatePayload(payload)

    const response = await fetch(`${getBaseUrl()}/saturation-deductions`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        ...payload,
        title: payload.title.trim(),
        type: normalizeSaturationDeductionType(payload.type)
      })
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(
        (err as { message?: string }).message || 'Failed to create deduction',
        response.status,
        err
      )
    }

    return response.json()
  },

  async update(
    id: string | number,
    payload: UpdateSaturationDeductionPayload,
    token: string
  ): Promise<ApiResponse<SaturationDeduction>> {
    requireLoadedPermission('saturation-deduction-edit')
    validateSaturationDeductionUpdatePayload(payload)

    const response = await fetch(`${getBaseUrl()}/saturation-deductions/${encodeURIComponent(String(id))}`, {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify({
        ...payload,
        ...(payload.title != null ? { title: payload.title.trim() } : {}),
        type: normalizeSaturationDeductionType(payload.type)
      })
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(
        (err as { message?: string }).message || 'Failed to update deduction',
        response.status,
        err
      )
    }

    return response.json()
  },

  async delete(
    id: string | number,
    token: string
  ): Promise<ApiResponse<unknown>> {
    requireLoadedPermission('saturation-deduction-delete')
    const response = await fetch(`${getBaseUrl()}/saturation-deductions/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
      headers: headers(token)
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(
        (err as { message?: string }).message || 'Failed to delete deduction',
        response.status,
        err
      )
    }

    return response.json()
  },

  filterByEmployee(
    deductions: SaturationDeduction[],
    employeeId: string | number
  ): SaturationDeduction[] {
    return deductions.filter(d => String(d.employee_id) === String(employeeId))
  },

  filterBySalary(
    deductions: SaturationDeduction[],
    salaryId: string | number
  ): SaturationDeduction[] {
    const target = String(salaryId).trim()
    if (!target) return deductions
    return deductions.filter((deduction) => {
      const value = deduction.salary_id
      if (value == null || String(value).trim() === '') return false
      return String(value) === target || Number(value) === Number(salaryId)
    })
  }
}

export type { SaturationDeduction, SaturationDeductionPayload, UpdateSaturationDeductionPayload }

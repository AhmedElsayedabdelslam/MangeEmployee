import type { ApiResponse } from '~/types/api'
import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'

export type LoanStatus = 'active' | 'completed' | 'failed' | 'cancelled'

export interface LoanHistoryItem {
  salary_id: number
  dedcution_amount: number
  deducted_at: string
}

export interface Loan {
  id: number
  uuid: string
  title: string
  employee_id: number
  employee_name: string
  employee_uuid: string
  employee_code?: string
  salary_id?: number
  loan_option_id: number
  loan_option_name?: string
  amount: number
  monthly_deduction: number
  salary_deduction?: number
  remaining_amount: number
  start_date: string
  end_date?: string
  reason?: string
  status: LoanStatus
  created_by: number
  loan_history?: LoanHistoryItem[]
  type?: 'one_time' | 'regularly'
}
export interface CreateLoanPayload {
  title: string
  amount: number
  monthly_deduction: number
  employee_id: number
  loan_option_id: number
  start_date: string
  reason?: string
  type?: 'one_time' | 'regularly'
}

export interface UpdateLoanPayload {
  title?: string
  amount?: number
  monthly_deduction?: number
  employee_id?: number
  salary_id?: number
  loan_option_id?: number
  start_date?: string
  reason?: string
  type?: 'one_time' | 'regularly'
}

const LOAN_STATUSES: LoanStatus[] = ['active', 'completed', 'failed', 'cancelled']

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

async function toApiError(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => ({}))
  const payloadMessage =
    typeof (payload as { message?: unknown })?.message === 'string'
      ? (payload as { message: string }).message
      : ''
  const firstValidationMessage = Object.values(
    (payload as { errors?: Record<string, string[]> }).errors ?? {}
  ).flat()[0]

  throw createApiError(payloadMessage || firstValidationMessage || fallback, response.status, payload)
}

function money(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00'
}

function numberOrZero(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeStatus(value: unknown): LoanStatus {
  return LOAN_STATUSES.includes(value as LoanStatus) ? value as LoanStatus : 'active'
}

function normalizeLoan(raw: Loan): Loan {
  return {
    ...raw,
    id: numberOrZero(raw.id),
    employee_id: numberOrZero(raw.employee_id),
    employee_code: raw.employee_code ? String(raw.employee_code) : undefined,
    salary_id: numberOrZero(raw.salary_id),
    loan_option_id: numberOrZero(raw.loan_option_id),
    amount: numberOrZero(raw.amount),
    monthly_deduction: numberOrZero(raw.monthly_deduction),
    salary_deduction: numberOrZero(raw.salary_deduction ?? raw.monthly_deduction),
    remaining_amount: numberOrZero(raw.remaining_amount || raw.amount),
    status: normalizeStatus(raw.status),
    type: normalizeLoanType(raw.type)
  }
}

export function normalizeLoanList(data: unknown): Loan[] {
  if (Array.isArray(data)) return data.map((row) => normalizeLoan(row as Loan))

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (Array.isArray(record.data)) return normalizeLoanList(record.data)

    if (record.data && typeof record.data === 'object') {
      const inner = record.data as Record<string, unknown>
      if (Array.isArray(inner.data)) return inner.data.map((row) => normalizeLoan(row as Loan))
    }

    if ('id' in record && ('employee_id' in record || 'title' in record)) {
      return [normalizeLoan(data as Loan)]
    }
  }

  return []
}

export function extractLoanResponse(raw: unknown): Loan[] {
  if (!raw || typeof raw !== 'object') return []
  const record = raw as Record<string, unknown>
  return normalizeLoanList(record.data ?? raw)
}

function normalizeLoanType(value: unknown): 'one_time' | 'regularly' | undefined {
  if (value === 'one_time' || value === 'regularly') return value
  return undefined
}
function buildLoanListParams(
  page: number,
  perPage: number,
  orderBy: string,
  order: 'asc' | 'desc',
  search?: string,
  filters?: { salary_id?: string | number; employee_id?: string | number ; is_inside_salary?: boolean  },
  is_inside_salary?: boolean 
) {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    order_by: orderBy,
    order
  })
  if (search?.trim()) params.set('search', search.trim())
  if (filters?.salary_id != null && String(filters.salary_id).trim() !== '') {
    params.set('salary_id', String(filters.salary_id))
  }
  if (filters?.employee_id != null && String(filters.employee_id).trim() !== '') {
    params.set('employee_id', String(filters.employee_id))
  }
  if (filters?.is_inside_salary !== undefined) {
    params.set('is_inside_salary', String(filters.is_inside_salary))
  }
  return params
}

async function fetchLoanList(
  token: string,
  page: number,
  perPage: number,
  orderBy: string,
  order: 'asc' | 'desc',
  search?: string,
  filters?: { salary_id?: string | number; employee_id?: string | number ; is_inside_salary?: boolean  },
): Promise<ApiResponse<Loan[]>> {
  requireLoadedPermission('loan-list')

  const params = buildLoanListParams(page, perPage, orderBy, order, search, filters)
  const response = await fetch(`${getBaseUrl()}/loans?${params}`, {
    method: 'GET',
    headers: headers(token)
  })
  if (!response.ok) await toApiError(response, 'Failed to fetch loans')
  const json = await response.json()
  json.data = normalizeLoanList(json.data)
  return json
}

export const loanService = {
  async getAll(
    page: number = 1,
    perPage: number = 10,
    token: string,
    search?: string,
    orderBy: string = 'id',
    order: 'asc' | 'desc' = 'desc'
  ): Promise<ApiResponse<Loan[]>> {
    return fetchLoanList(token, page, perPage, orderBy, order, search)
  },

  async getBySalary(
    salaryId: string | number,
    token: string,
    page: number = 1,
    perPage: number = 1000,
    orderBy: string = 'id',
    order: 'asc' | 'desc' = 'desc',
    isInsideSalary: boolean = false 
  ): Promise<ApiResponse<Loan[]>> {
    return fetchLoanList(token, page, perPage, orderBy, order, undefined, { salary_id: salaryId , is_inside_salary: isInsideSalary  })
  },

  /** @deprecated Prefer getBySalary — employee_id returns loans across all salaries for that employee. */
  async getByEmployee(
    employeeId: string | number,
    token: string,
    page: number = 1,
    perPage: number = 1000,
    orderBy: string = 'id',
    order: 'asc' | 'desc' = 'desc',
    isInsideSalary?: boolean 
  ): Promise<ApiResponse<Loan[]>> {
    return fetchLoanList(token, page, perPage, orderBy, order, undefined, { employee_id: employeeId, is_inside_salary: isInsideSalary })
  },

  filterBySalary(loans: Loan[], salaryId: string | number): Loan[] {
    const target = String(salaryId).trim()
    if (!target) return loans
    return loans.filter((loan) => {
      const value = loan.salary_id
      if (value == null || String(value).trim() === '' || Number(value) <= 0) return false
      return String(value) === target || Number(value) === Number(salaryId)
    })
  },

  scopeForSalary(loans: Loan[], salaryId: string | number, trustServerScope = false): Loan[] {
    const bySalary = this.filterBySalary(loans, salaryId)
    if (bySalary.length > 0) return bySalary
    if (trustServerScope && loans.length > 0) return loans
    return []
  },

  async listForSalary(
    salaryId: string | number,
    token: string,
    page: number = 1,
    perPage: number = 1000,
    orderBy: string = 'id',
    order: 'asc' | 'desc' = 'desc'
  ): Promise<Loan[]> {
    const bySalaryResponse = await this.getBySalary(salaryId, token, page, perPage, orderBy, order)
    return this.scopeForSalary(extractLoanResponse(bySalaryResponse), salaryId, true)
  },

  async getByUuid(uuid: string, token: string): Promise<ApiResponse<Loan>> {
    requireLoadedPermission('loan-show')

    const response = await fetch(`${getBaseUrl()}/loans/${encodeURIComponent(uuid)}`, {
      method: 'GET',
      headers: headers(token)
    })
    if (!response.ok) await toApiError(response, 'Failed to fetch loan')
    const json = await response.json()
    if (json.data) json.data = normalizeLoan(json.data)
    return json
  },

  async create(payload: CreateLoanPayload, token: string): Promise<ApiResponse<Loan>> {
    requireLoadedPermission('loan-create')

    const body = {
      title: payload.title,
      amount: money(payload.amount),
      monthly_deduction: money(payload.monthly_deduction),
      employee_id: payload.employee_id,
      loan_option_id: payload.loan_option_id,
      start_date: payload.start_date,
      reason: payload.reason || null,
      type: payload.type 
    }

    const response = await fetch(`${getBaseUrl()}/loans`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify(body)
    })
    if (!response.ok) await toApiError(response, 'Failed to create loan')
    const json = await response.json()
    if (json.data) json.data = normalizeLoan(json.data)
    return json
  },

  async updateByUuid(uuid: string, payload: UpdateLoanPayload, token: string): Promise<ApiResponse<Loan>> {
    requireLoadedPermission('loan-edit')

    const body: Record<string, unknown> = {}
    if (payload.title !== undefined) body.title = payload.title
    if (payload.amount !== undefined) body.amount = money(payload.amount)
    if (payload.monthly_deduction !== undefined) body.monthly_deduction = money(payload.monthly_deduction)
    if (payload.employee_id !== undefined) body.employee_id = payload.employee_id
    if (payload.salary_id !== undefined) body.salary_id = payload.salary_id
    if (payload.loan_option_id !== undefined) body.loan_option_id = payload.loan_option_id
    if (payload.start_date !== undefined) body.start_date = payload.start_date
    if (payload.reason !== undefined) body.reason = payload.reason || null
    if (payload.type !== undefined) body.type = payload.type || null 

    const response = await fetch(`${getBaseUrl()}/loans/${encodeURIComponent(uuid)}`, {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify(body)
    })
    if (!response.ok) await toApiError(response, 'Failed to update loan')
    const json = await response.json()
    if (json.data) json.data = normalizeLoan(json.data)
    return json
  },

  async deleteByUuid(uuid: string, token: string): Promise<ApiResponse<unknown>> {
    requireLoadedPermission('loan-delete')

    const response = await fetch(`${getBaseUrl()}/loans/${encodeURIComponent(uuid)}`, {
      method: 'DELETE',
      headers: headers(token)
    })
    if (!response.ok) await toApiError(response, 'Failed to delete loan')
    return response.json()
  },
  async setCompelete (uuid :string ,token :string) :Promise<ApiResponse<unknown>> {
    const response =await fetch(`${getBaseUrl()}/loans/change-status/${encodeURIComponent(uuid)}`,{
      method :'POST',
      headers :headers(token)
    })
    if (!response.ok) await toApiError(response, 'Failed to compelete loan')
    return response.json()

  }
}

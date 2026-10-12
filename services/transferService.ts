import type { ApiResponse } from '~/types/api'
import type {
  CreateTransferPayload,
  Transfer,
  TransferListResponse,
  TransferResponse,
  TransferStatus,
  UpdateTransferPayload,
} from '~/types/transfer'
import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'

function resolveUrl(path: string): string {
  const config = useRuntimeConfig()
  const base = config.public.apiUrl || '/api'
  if (base.startsWith('http')) return `${base}${path}`
  if (typeof window !== 'undefined') return `${base}${path}`
  return `http://localhost:3000${base}${path}`
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

function hasText(value: unknown): boolean {
  return value != null && String(value).trim() !== ''
}

function statusKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeStatus(value: unknown, row: Record<string, any>): TransferStatus {
  const status = statusKey(value)

  if (['cancel', 'cancelled', 'canceled'].includes(status)) {
    return 'cancel'
  }

  if (['completed', 'complete', 'processed', 'done', 'success', 'succeeded', 'approved', 'applied'].includes(status)) {
    return 'completed'
  }

  if (['failed', 'failure', 'error', 'errored', 'rejected', 'declined'].includes(status)) {
    return 'failed'
  }

  if (['pending', 'scheduled', 'queued', 'waiting', 'in_progress', 'processing'].includes(status)) {
    return 'pending'
  }
  if (hasText(row.failed_at) || hasText(row.rejected_at)) return 'failed'
  if (hasText(row.processed_at) || hasText(row.completed_at) || hasText(row.approved_at)) return 'completed'

  return 'pending'
}

function normalizeId(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function firstId(...values: unknown[]): number {
  for (const value of values) {
    const id = normalizeId(value)
    if (id > 0) return id
  }
  return 0
}

function asString(value: unknown): string {
  return value == null ? '' : String(value)
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (hasText(value)) return String(value).trim()
  }
  return ''
}

function normalizeDateText(...values: unknown[]): string | null {
  const value = firstText(...values)
  return value || null
}

function normalizeTransfer(raw: unknown): Transfer {
  const row = (raw ?? {}) as Record<string, any>
  const employee = asRecord(row.employee ?? row.employee_data ?? row.employee_details ?? row.user)
  const branch = asRecord(row.branch ?? row.to_branch ?? row.new_branch)
  const department = asRecord(row.department ?? row.to_department ?? row.new_department)
  const creator = asRecord(row.creator ?? row.created_by_user ?? row.created_by)
  const employeeFallbackName = [
    employee.first_name ?? row.employee_first_name,
    employee.last_name ?? row.employee_last_name,
  ].filter(Boolean).join(' ').trim()

  return {
    id: normalizeId(row.id),
    uuid: String(row.uuid ?? row.id ?? ''),
    employee_id: firstId(row.employee_id, employee.id),
    employee_name: firstText(
      row.employee_name,
      row.employee_full_name,
      employee.name,
      employee.employee_name,
      employee.full_name,
      employeeFallbackName,
    ),
    employee_email: firstText(row.employee_email, row.email, row.employee_email_address, employee.email, employee.work_email),
    employee_code: firstText(
      row.employee_code,
      row.employee_code_id,
      row.employee_number,
      row.code,
      employee.employee_code,
      employee.employee_id,
      employee.code,
    ),
    employee_uuid: asString(row.employee_uuid ?? employee.uuid),
    branch_id: firstId(row.branch_id, branch.id),
    branch_name: firstText(row.branch_name, row.to_branch_name, branch.name),
    department_id: firstId(row.department_id, department.id),
    department_name: firstText(row.department_name, row.to_department_name, department.name),
    reassign_date: firstText(row.reassign_date, row.transfer_date, row.reassing_date, row.scheduled_date),
    description: firstText(row.description, row.reason, row.notes),
    status: normalizeStatus(row.status ?? row.transfer_status ?? row.reassign_status ?? row.state, row),
    processed_at: normalizeDateText(row.processed_at, row.completed_at, row.approved_at),
    created_by: firstText(row.created_by_name, row.creator_name, creator.name, creator.email, typeof row.created_by === 'object' ? '' : row.created_by),
    created_at: firstText(row.created_at, row.createdAt, row.created_date, row.created),
    updated_at: firstText(row.updated_at, row.updatedAt, row.updated_date, row.updated),
  }
}

function extractTransferRows(json: Record<string, any>): unknown[] {
  if (Array.isArray(json.data)) return json.data
  if (Array.isArray(json.data?.data)) return json.data.data
  if (Array.isArray(json.reassignments)) return json.reassignments
  return []
}

function extractTransferItem(json: Record<string, any>): unknown {
  if (json.data?.data && !Array.isArray(json.data.data)) return json.data.data
  if (json.data?.transfer) return json.data.transfer
  if (json.data?.reassignment) return json.data.reassignment
  return json.data
}

function createTransferRequestPayload(payload: CreateTransferPayload): Record<string, number | string | number[] | null> {
  const reassignDate = payload.reassign_date.trim()
  const description = payload.description.trim()

  return {
    employee_id: Number(payload.employee_id),
    branch_id: Number(payload.branch_id),
    department_id: Number(payload.department_id),
    reassign_date: reassignDate,
    description,
    unassigned_branch_ids: payload.unassigned_branch_ids ?? null,
    unassigned_department_ids: payload.unassigned_department_ids ?? null,
  }
}

export const transferService = {
  async getTransfers(
    page = 1,
    perPage = 10,
    search = '',
    token?: string,
  ): Promise<TransferListResponse> {
    requireLoadedPermission('reassign-employee-list')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    })

    if (search.trim()) params.set('search', search.trim())

    const response = await fetch(`${resolveUrl('/reassign-employees')}?${params.toString()}`, {
      method: 'GET',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to fetch transfers')

    const json = await response.json()
    json.data = extractTransferRows(json).map(normalizeTransfer)
    return json
  },

  async getTransfer(uuid: string, token?: string): Promise<TransferResponse> {
    requireLoadedPermission('reassign-employee-show')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/reassign-employees/${uuid}`), {
      method: 'GET',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to fetch transfer')

    const json = await response.json()
    json.data = normalizeTransfer(extractTransferItem(json))
    return json
  },

  async createTransfer(payload: CreateTransferPayload, token?: string): Promise<TransferResponse> {
    requireLoadedPermission('reassign-employee-create')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const requestPayload = createTransferRequestPayload(payload)

    if (import.meta.dev) {
      console.debug('[Transfer Create] POST /reassign-employees payload:', requestPayload)
    }

    const response = await fetch(resolveUrl('/reassign-employees'), {
      method: 'POST',
      headers: headers(authToken),
      body: JSON.stringify(requestPayload),
    })

    if (!response.ok) await handleError(response, 'Failed to create transfer')

    const json = await response.json()
    json.data = normalizeTransfer(extractTransferItem(json))
    return json
  },
  async cancelTransfer(
  uuid: string,
  token?: string,
): Promise<TransferResponse> {
  requireLoadedPermission('reassign-employee-cancel')

  const authToken = token || getAuthToken()

  if (!authToken) {
    throw new Error('Authentication required')
  }

  const response = await fetch(
    resolveUrl(`/cancel-transfer-employee/${uuid}`),
    {
      method: 'GET',
      headers: headers(authToken),
    },
  )

  if (!response.ok) {
    await handleError(response, 'Failed to cancel transfer')
  }

  const json = await response.json()
  json.data = normalizeTransfer(extractTransferItem(json))

  return json
},

  async updateTransfer(
    uuid: string,
    payload: UpdateTransferPayload,
    token?: string,
  ): Promise<TransferResponse> {
    requireLoadedPermission('reassign-employee-edit')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/reassign-employees/${uuid}`), {
      method: 'PUT',
      headers: headers(authToken),
      body: JSON.stringify(payload),
    })

    if (!response.ok) await handleError(response, 'Failed to update transfer')

    const json = await response.json()
    json.data = normalizeTransfer(extractTransferItem(json))
    return json
  },

  async deleteTransfer(uuid: string, token?: string): Promise<ApiResponse<null>> {
    requireLoadedPermission('reassign-employee-delete')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/reassign-employees/${uuid}`), {
      method: 'DELETE',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to delete transfer')
    return response.json()
  },
}

import type { ApiResponse } from '~/types/api'
import { createApiError } from '~/utils/apiError'
import { normalizeEntityRow } from '~/utils/entityApiKey'
import { cacheLeaveTypeUuid, getCachedLeaveTypeUuid } from '~/utils/entityUuidCache'
import { requireLoadedPermission } from '~/utils/permissionAccess'

export interface LeaveType {
  id: string
  uuid?: string
  title: string
  days: number
  requires_hr_approval: boolean
  is_active: boolean
  created_by: string | null
}

export interface CreateLeaveTypePayload {
  title: string
  days: number
  requires_hr_approval: boolean
  is_active?: boolean
}

export type UpdateLeaveTypePayload = CreateLeaveTypePayload

function hydrateLeaveTypeRow(row: LeaveType): LeaveType {
  const uuid = row.uuid != null && String(row.uuid).trim() !== '' ? String(row.uuid) : getCachedLeaveTypeUuid(row.id)
  const out: LeaveType = uuid ? { ...row, uuid } : { ...row }
  if (out.uuid) cacheLeaveTypeUuid(out.id, out.uuid)
  return out
}

function rememberLeaveTypeFromPayload(data: unknown): void {
  if (!data || typeof data !== 'object') return
  const d = data as { id?: unknown; uuid?: unknown }
  if (d.id != null && d.uuid != null && String(d.uuid).trim() !== '') {
    cacheLeaveTypeUuid(String(d.id), String(d.uuid))
  }
}

/** Laravel may return a plain array or paginator `{ data: [...] }` under `data`. */
function extractLeaveTypeRows(json: Record<string, unknown>): unknown[] {
  const root = json.data
  if (Array.isArray(root)) return root
  if (root && typeof root === 'object' && Array.isArray((root as { data?: unknown[] }).data)) {
    return (root as { data: unknown[] }).data
  }
  return []
}

function getBaseUrl() {
  const config = useRuntimeConfig()
  return config.public.apiUrl || 'http://127.0.0.1:8000/api'
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

export const leaveTypeService = {
  async getAll(token?: string): Promise<ApiResponse<LeaveType[]>> {
    requireLoadedPermission('leave-type-list')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/leave-types`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to fetch leave types', response.status, err)
    }
    const json = (await response.json()) as Record<string, unknown> & ApiResponse<LeaveType[]>
    const rows = extractLeaveTypeRows(json)
    json.data = rows.map((type: Record<string, unknown>) =>
      hydrateLeaveTypeRow(normalizeEntityRow(type) as LeaveType)
    ) as LeaveType[]
    return json
  },

  async getById(id: string, token?: string): Promise<ApiResponse<LeaveType>> {
    requireLoadedPermission('leave-type-show')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/leave-types/${id}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to fetch leave type', response.status, err)
    }
    const json = await response.json()
    if (json.data && typeof json.data === 'object') {
      const d = hydrateLeaveTypeRow(normalizeEntityRow(json.data as Record<string, unknown>) as LeaveType)
      json.data = d
      rememberLeaveTypeFromPayload(d)
    }
    return json
  },

  async getActive(token?: string): Promise<ApiResponse<LeaveType[]>> {
    const result = await this.getAll(token)
    const list = Array.isArray(result.data) ? result.data : []
    return {
      ...result,
      data: list.filter(type => type.is_active)
    }
  },

  async create(payload: CreateLeaveTypePayload, token?: string): Promise<ApiResponse<LeaveType>> {
    requireLoadedPermission('leave-type-create')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/leave-types`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to create leave type', response.status, err)
    }
    const json = await response.json()
    if (json.data && typeof json.data === 'object') {
      const d = hydrateLeaveTypeRow(normalizeEntityRow(json.data as Record<string, unknown>) as LeaveType)
      json.data = d
      rememberLeaveTypeFromPayload(d)
    }
    return json
  },

  async update(id: string, payload: UpdateLeaveTypePayload, token?: string): Promise<ApiResponse<LeaveType>> {
    requireLoadedPermission('leave-type-edit')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/leave-types/${id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to update leave type', response.status, err)
    }
    const json = await response.json()
    if (json.data && typeof json.data === 'object') {
      const d = hydrateLeaveTypeRow(normalizeEntityRow(json.data as Record<string, unknown>) as LeaveType)
      json.data = d
      rememberLeaveTypeFromPayload(d)
    }
    return json
  },

  async delete(id: string, token?: string): Promise<ApiResponse<unknown>> {
    requireLoadedPermission('leave-type-delete')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/leave-types/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to delete leave type', response.status, err)
    }
    return response.json()
  },

  async toggleActive(id: string, isActive: boolean, token?: string): Promise<ApiResponse<LeaveType>> {
    const result = await this.getById(id, token)
    return this.update(id, {
      ...result.data,
      is_active: isActive
    }, token)
  }
}

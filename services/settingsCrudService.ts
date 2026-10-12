import type { ApiResponse } from '~/types/settings'
import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'

export interface NameOnlyPayload {
  name: string
}

interface SettingsCrudLabels {
  plural: string
  singular: string
}

interface SettingsCrudPermissions {
  list: string
  show: string
  create: string
  edit: string
  delete: string
}

function resolveUrl(path: string): string {
  const config = useRuntimeConfig()
  const base = config.public.apiUrl || '/api'
  if (base.startsWith('http')) return `${base}${path}`
  if (typeof window !== 'undefined') return `${base}${path}`
  return `http://localhost:3000${base}${path}`
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
    err.message ||
    (err.errors && Object.values(err.errors as Record<string, string[]>).flat()[0]) ||
    fallback
  throw createApiError(msg, response.status, err)
}

function normalizeListResponse<T>(json: ApiResponse<T[]> | any): ApiResponse<T[]> {
  if (json.data === null || json.data === undefined) {
    json.data = []
    return json
  }

  if (Array.isArray(json.data)) {
    json.data = json.data.map((item: T & { id?: unknown; uuid?: unknown }) => {
      const row = { ...item, id: String(item.id ?? '') } as T & { id: string; uuid?: string }
      if (item.uuid != null && String(item.uuid).trim() !== '') row.uuid = String(item.uuid)
      return row
    })
    return json
  }

  const nestedData = json.data?.data
  if (Array.isArray(nestedData)) {
    const nestedMeta = json.data?.meta
    const nestedPagination = json.data?.pagination
    json.data = nestedData.map((item: T & { id?: unknown; uuid?: unknown }) => {
      const row = { ...item, id: String(item.id ?? '') } as T & { id: string; uuid?: string }
      if (item.uuid != null && String(item.uuid).trim() !== '') row.uuid = String(item.uuid)
      return row
    })
    if (!json.meta && nestedMeta) json.meta = nestedMeta
    if (!json.meta && nestedPagination) json.meta = { pagination: nestedPagination }
    return json
  }

  json.data = []
  return json
}

function normalizeItemResponse<T>(json: ApiResponse<T> | any): ApiResponse<T> {
  if (json.data?.data && typeof json.data.data === 'object' && !Array.isArray(json.data.data)) {
    json.data = json.data.data
  }
  if (json.data?.id != null) json.data.id = String(json.data.id)
  const d = json.data as { uuid?: unknown }
  if (d?.uuid != null && String(d.uuid).trim() !== '') (json.data as { uuid: string }).uuid = String(d.uuid)
  return json
}

export function createNameOnlySettingsService<
  T extends { id: string; name: string; uuid?: string },
  CreatePayload extends NameOnlyPayload,
  UpdatePayload extends NameOnlyPayload
>(
  path: string,
  labels: SettingsCrudLabels,
  permissions?: SettingsCrudPermissions
) {
  return {
    async getAll(
      page: number = 1,
      perPage: number = 10,
      token: string,
      search?: string
    ): Promise<ApiResponse<T[]>> {
      if (permissions) requireLoadedPermission(permissions.list)
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
      if (search?.trim()) params.set('search', search.trim())

      const response = await fetch(`${resolveUrl(path)}?${params.toString()}`, {
        method: 'GET',
        headers: headers(token)
      })
      if (!response.ok) await handleError(response, `Failed to fetch ${labels.plural}`)

      const json = await response.json()
      return normalizeListResponse<T>(json)
    },

    async getById(id: string, token: string): Promise<ApiResponse<T>> {
      if (permissions) requireLoadedPermission(permissions.show)
      const response = await fetch(resolveUrl(`${path}/${id}`), {
        method: 'GET',
        headers: headers(token)
      })
      if (!response.ok) await handleError(response, `Failed to fetch ${labels.singular}`)
      return normalizeItemResponse<T>(await response.json())
    },

    async create(payload: CreatePayload, token: string): Promise<ApiResponse<T>> {
      if (permissions) requireLoadedPermission(permissions.create)
      const response = await fetch(resolveUrl(path), {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(payload)
      })
      if (!response.ok) await handleError(response, `Failed to create ${labels.singular}`)
      return normalizeItemResponse<T>(await response.json())
    },

    async update(id: string, payload: UpdatePayload, token: string): Promise<ApiResponse<T>> {
      if (permissions) requireLoadedPermission(permissions.edit)
      const response = await fetch(resolveUrl(`${path}/${id}`), {
        method: 'PUT',
        headers: headers(token),
        body: JSON.stringify(payload)
      })
      if (!response.ok) await handleError(response, `Failed to update ${labels.singular}`)
      return normalizeItemResponse<T>(await response.json())
    },

    async delete(id: string, token: string): Promise<ApiResponse<unknown>> {
      if (permissions) requireLoadedPermission(permissions.delete)
      const response = await fetch(resolveUrl(`${path}/${id}`), {
        method: 'DELETE',
        headers: headers(token)
      })
      if (!response.ok) await handleError(response, `Failed to delete ${labels.singular}`)
      return response.json()
    }
  }
}

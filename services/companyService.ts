import type { ApiResponse, Company, CreateCompanyPayload, UpdateCompanyPayload } from '~/types/settings'
import { createApiError } from '~/utils/apiError'
import { normalizeEntityRow } from '~/utils/entityApiKey'
import { cacheCompanyUuid, getCachedCompanyUuid } from '~/utils/entityUuidCache'
import { requireLoadedPermission } from '~/utils/permissionAccess'
import { normalizeCollectionResponse } from '~/utils/apiCollection'
import { debugSystemSettingsResponse } from '~/utils/systemSettingsDiagnostics'

function hydrateCompanyRow(row: Company): Company {
  const uuid = row.uuid != null && String(row.uuid).trim() !== '' ? String(row.uuid) : getCachedCompanyUuid(row.id)
  const out = uuid ? { ...row, uuid } : row
  if (out.uuid) cacheCompanyUuid(out.id, out.uuid)
  return out
}

function normalizeCompanyRow(row: Record<string, unknown>): Company {
  const normalized = normalizeEntityRow(row)
  const companyName = String(row.company_name ?? row.name ?? '').trim()
  const companyEmail = String(row.company_email ?? row.email ?? '').trim()
  return hydrateCompanyRow({
    ...normalized,
    name: companyName,
    email: companyEmail,
    company_name: companyName,
    company_email: companyEmail,
    first_name: String(row.first_name ?? '').trim() || undefined,
    last_name: String(row.last_name ?? '').trim() || undefined,
    user_name: String(row.user_name ?? row.name ?? '').trim() || undefined,
    phone: String(row.phone ?? '').trim() || undefined,
    user_email: String(row.user_email ?? row.email ?? '').trim() || undefined,
    birth_date: String(row.birth_date ?? '').trim() || undefined,
    gender: String(row.gender ?? '').trim() || undefined,
    address: String(row.address ?? '').trim() || undefined,
    time_zone: String(row.time_zone ?? '').trim() || undefined,
  } as Company)
}

function rememberCompanyFromPayload(data: unknown): void {
  if (!data || typeof data !== 'object') return
  const d = data as { id?: unknown; uuid?: unknown }
  if (d.id != null && d.uuid != null && String(d.uuid).trim() !== '') {
    cacheCompanyUuid(String(d.id), String(d.uuid))
  }
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

export const companyService = {
  async getAll(
    page: number = 1,
    perPage: number = 10,
    token: string,
    search?: string
  ): Promise<ApiResponse<Company[]>> {
    requireLoadedPermission('company-list')
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
    if (search?.trim()) params.set('search', search.trim())

    const url = `${resolveUrl('/companies')}?${params}`
    const response = await fetch(url, {
      method: 'GET',
      headers: headers(token)
    })
    if (!response.ok) await handleError(response, 'Failed to fetch companies')

    const json = await response.json()
    debugSystemSettingsResponse('Companies', {
      url,
      status: response.status,
      payload: json,
    })
    return normalizeCollectionResponse(json, {
      page,
      perPage,
      normalizeRow: normalizeCompanyRow,
    })
  },

  async getById(id: string, token: string): Promise<ApiResponse<Company>> {
    requireLoadedPermission('company-show')
    const response = await fetch(resolveUrl(`/companies/${id}`), {
      method: 'GET',
      headers: headers(token)
    })
    if (!response.ok) await handleError(response, 'Failed to fetch company')
    const json = (await response.json()) as ApiResponse<Company>
    const raw = json.data as unknown
    if (raw && typeof raw === 'object') {
      json.data = normalizeCompanyRow(raw as Record<string, unknown>)
      rememberCompanyFromPayload(json.data)
    }
    return json
  },

  async create(payload: CreateCompanyPayload, token: string): Promise<ApiResponse<Company>> {
    requireLoadedPermission('company-create')
    const response = await fetch(resolveUrl('/companies'), {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify(payload)
    })
    if (!response.ok) await handleError(response, 'Failed to create company')
    const json = (await response.json()) as ApiResponse<Company>
    const raw = json.data as unknown
    if (raw && typeof raw === 'object') {
      const d = normalizeEntityRow(raw as Record<string, unknown>) as Company
      json.data = hydrateCompanyRow(d)
      rememberCompanyFromPayload(json.data)
    }
    return json
  },

  async update(id: string, payload: UpdateCompanyPayload, token: string): Promise<ApiResponse<Company>> {
    requireLoadedPermission('company-edit')
    const response = await fetch(resolveUrl(`/companies/${id}`), {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify(payload)
    })
    if (!response.ok) await handleError(response, 'Failed to update company')
    const json = (await response.json()) as ApiResponse<Company>
    const raw = json.data as unknown
    if (raw && typeof raw === 'object') {
      const d = normalizeEntityRow(raw as Record<string, unknown>) as Company
      json.data = hydrateCompanyRow(d)
      rememberCompanyFromPayload(json.data)
    }
    return json
  },

  async delete(id: string, token: string): Promise<ApiResponse<unknown>> {
    requireLoadedPermission('company-delete')
    const response = await fetch(resolveUrl(`/companies/${id}`), {
      method: 'DELETE',
      headers: headers(token)
    })
    if (!response.ok) await handleError(response, 'Failed to delete company')
    return response.json()
  }
}

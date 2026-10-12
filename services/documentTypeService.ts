import type { ApiResponse } from '~/types/api'
import type { DocumentType, DocumentTypePayload } from '~/types/documentType'
import { createApiError } from '~/utils/apiError'
import { normalizeEntityRow } from '~/utils/entityApiKey'
import { cacheDocumentTypeUuid, getCachedDocumentTypeUuid } from '~/utils/entityUuidCache'
import { requireLoadedPermission } from '~/utils/permissionAccess'
import { extractCollection, extractPagination } from '~/utils/apiCollection'

const DOCUMENT_TYPE_PAGE_SIZE = 100
const MAX_DOCUMENT_TYPE_PAGES = 50

function hydrateDocumentTypeRow(row: DocumentType): DocumentType {
  const uuid = row.uuid != null && String(row.uuid).trim() !== '' ? String(row.uuid) : getCachedDocumentTypeUuid(row.id)
  const out: DocumentType = uuid ? { ...row, uuid } : { ...row }
  if (out.uuid) cacheDocumentTypeUuid(out.id, out.uuid)
  return out
}

function rememberDocumentTypeFromPayload(data: unknown): void {
  if (!data || typeof data !== 'object') return
  const d = data as { id?: unknown; uuid?: unknown }
  if (d.id != null && d.uuid != null && String(d.uuid).trim() !== '') {
    cacheDocumentTypeUuid(String(d.id), String(d.uuid))
  }
}

function getApiBaseUrl() {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiUrl
  if (typeof apiUrl === 'string' && apiUrl.trim()) {
    if (apiUrl.startsWith('http://') || apiUrl.startsWith('https://')) {
      return apiUrl
    }
    if (apiUrl.startsWith('/')) {
      return 'http://127.0.0.1:8000/api'
    }
  }
  return 'http://127.0.0.1:8000/api'
}

async function fetchDocumentTypePage(
  token: string,
  page: number,
  search? :string
): Promise<Record<string, any>> {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(DOCUMENT_TYPE_PAGE_SIZE)
  })
 if (search && search.trim()) {
    params.append('search', search.trim())
  }
  const response = await fetch(`${getApiBaseUrl()}/document-types?${params}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw createApiError(err.message || 'Failed to fetch document types', response.status, err)
  }

  return response.json()
}

function normalizeDocumentTypeRows(payload: unknown): DocumentType[] {
  return extractCollection<Record<string, unknown>>(payload).map(type =>
    hydrateDocumentTypeRow(normalizeEntityRow(type) as DocumentType)
  )
}

export const documentTypeService = {
  async getAll(
  token: string,
  search?: string
): Promise<ApiResponse<DocumentType[]>> {
  requireLoadedPermission('document-type-list')
  const firstPayload = await fetchDocumentTypePage(token, 1, search ?? '')
  const firstRows = normalizeDocumentTypeRows(firstPayload)
  const pagination = extractPagination(
    firstPayload,
    firstRows.length,
    1,
    DOCUMENT_TYPE_PAGE_SIZE
  )
  if (
    !Number.isInteger(pagination.lastPage) ||
    pagination.lastPage < 1 ||
    pagination.lastPage > MAX_DOCUMENT_TYPE_PAGES
  ) {
    throw createApiError(
      `Document type catalogue exceeds the ${MAX_DOCUMENT_TYPE_PAGES}-page safety limit.`,
      422,
      { pagination }
    )
  }

  const remainingPayloads = pagination.lastPage > 1
    ? await Promise.all(
      Array.from(
        { length: pagination.lastPage - 1 },
        (_, index) => fetchDocumentTypePage(token, index + 2, search)
      )
    )
    : []
  const rows = [
    ...firstRows,
    ...remainingPayloads.flatMap(normalizeDocumentTypeRows)
  ]
    const deduplicated = Array.from(
      new Map(
        rows.map(row => [
          String(row.uuid ?? row.id ?? row.name).trim(),
          row
        ])
      ).values()
    )

    return {
      ...firstPayload,
      success: firstPayload.success !== false,
      message: typeof firstPayload.message === 'string' ? firstPayload.message : '',
      status_code: Number(firstPayload.status_code) || 200,
      data: deduplicated,
      meta: {
        pagination: {
          total: pagination.total,
          count: deduplicated.length,
          per_page: DOCUMENT_TYPE_PAGE_SIZE,
          current_page: 1,
          last_page: pagination.lastPage,
          total_pages: pagination.lastPage,
          next_page_url: null,
          prev_page_url: null,
          from: deduplicated.length ? 1 : 0,
          to: deduplicated.length
        }
      }
    }
  },

  async getById(id: string, token: string): Promise<ApiResponse<DocumentType>> {
    requireLoadedPermission('document-type-show')
    const response = await fetch(`${getApiBaseUrl()}/document-types/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to fetch document type', response.status, err)
    }

    const json = await response.json()
    if (json.data && typeof json.data === 'object') {
      const d = hydrateDocumentTypeRow(normalizeEntityRow(json.data as Record<string, unknown>) as DocumentType)
      json.data = d
      rememberDocumentTypeFromPayload(d)
    }
    return json
  },

  async create(payload: DocumentTypePayload, token: string): Promise<ApiResponse<DocumentType>> {
    requireLoadedPermission('document-type-create')
    const response = await fetch(`${getApiBaseUrl()}/document-types`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to create document type', response.status, err)
    }

    const json = await response.json()
    if (json.data && typeof json.data === 'object') {
      const d = hydrateDocumentTypeRow(normalizeEntityRow(json.data as Record<string, unknown>) as DocumentType)
      json.data = d
      rememberDocumentTypeFromPayload(d)
    }
    return json
  },

  async update(id: string, payload: DocumentTypePayload, token: string): Promise<ApiResponse<DocumentType>> {
    requireLoadedPermission('document-type-edit')
    const response = await fetch(`${getApiBaseUrl()}/document-types/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to update document type', response.status, err)
    }

    const json = await response.json()
    if (json.data && typeof json.data === 'object') {
      const d = hydrateDocumentTypeRow(normalizeEntityRow(json.data as Record<string, unknown>) as DocumentType)
      json.data = d
      rememberDocumentTypeFromPayload(d)
    }
    return json
  },

  async delete(id: string, token: string): Promise<ApiResponse<string>> {
    requireLoadedPermission('document-type-delete')
    const response = await fetch(`${getApiBaseUrl()}/document-types/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to delete document type', response.status, err)
    }

    return response.json()
  }
}

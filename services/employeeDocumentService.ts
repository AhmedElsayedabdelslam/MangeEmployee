import type { ApiResponse } from '~/types/api'
import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'
import { extractCollection, extractPagination } from '~/utils/apiCollection'

const EMPLOYEE_DOCUMENT_PAGE_SIZE = 100
const MAX_EMPLOYEE_DOCUMENT_PAGES = 50

export interface EmployeeDocument {
  id: string
  uuid: string
  employee_id: string
  document_type_id: string
  document_path: string
  created_by?: string
  uploadedBy?: string
  created_at?: string
  updated_at?: string
  employee?: { id: string; name: string; employee_id?: string; employee_code?: string; code?: string }
  document_type?: { id: string; title: string }
}

export interface CreateDocumentPayload {
  employee_id: string
  document_type_id: string
  document: File
}

export interface UpdateDocumentPayload {
  employee_id?: string
  document_type_id?: string
  document?: File
}

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png'
]
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png']
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

function firstNonEmptyText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value == null) continue
    const text = String(value).trim()
    if (text) return text
  }
  return undefined
}

function getBaseUrl() {
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

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

export function resolveDocumentRecordUuid(doc: Pick<EmployeeDocument, 'id' | 'uuid'>): string {
  const id = String(doc.id ?? '').trim()
  const uuid = String(doc.uuid ?? '').trim()

  // REST routes use the employee-document record UUID (same as GET /employee-documents/{uuid}).
  if (isUuid(id) && isUuid(uuid) && id !== uuid) return id
  if (isUuid(id)) return id
  if (isUuid(uuid)) return uuid
  return id || uuid
}

function normalizeDocument(doc: any): EmployeeDocument {
  const documentType =
    typeof doc?.document_type === 'string'
      ? { id: String(doc?.document_type_id ?? ''), title: doc.document_type }
      : doc?.document_type
        ? { ...doc.document_type, id: String(doc.document_type.id ?? '') }
        : undefined

  const rawId = String(doc?.id ?? '')
  const rawUuid = String(doc?.uuid ?? doc?.employee_document_uuid ?? '')
  const recordUuid = resolveDocumentRecordUuid({ id: rawId, uuid: rawUuid })

  return {
    id: recordUuid || rawId,
    uuid: recordUuid || rawUuid,
    employee_id: String(doc?.employee_id ?? doc?.employee?.id ?? ''),
    document_type_id: String(doc?.document_type_id ?? doc?.document_type?.id ?? ''),
    document_path: String(doc?.document_path ?? doc?.path ?? ''),
    created_by: firstNonEmptyText(doc?.created_by, doc?.uploaded_by, doc?.uploadedBy, doc?.createdBy),
    uploadedBy: firstNonEmptyText(doc?.uploadedBy),
    created_at: doc?.created_at,
    updated_at: doc?.updated_at,
    employee: doc?.employee
      ? {
          id: String(doc.employee.id ?? ''),
          name: String(doc.employee.name ?? ''),
          employee_id: doc.employee.employee_id != null ? String(doc.employee.employee_id) : undefined,
          employee_code: doc.employee.employee_code != null ? String(doc.employee.employee_code) : undefined,
          code: doc.employee.code != null ? String(doc.employee.code) : undefined,
        }
      : doc?.employee_name
        ? { id: String(doc?.employee_id ?? ''), name: String(doc.employee_name) }
        : undefined,
    document_type: documentType
  }
}

function extractDocuments(payload: any): EmployeeDocument[] {
  return extractCollection<Record<string, unknown>>(payload).map(normalizeDocument)
}

function extractDocument(payload: any): EmployeeDocument {
  return normalizeDocument(payload?.data?.data ?? payload?.data ?? payload)
}

async function fetchEmployeeDocumentPage(
  authToken: string,
  page: number,
  employeeId?: string | number
): Promise<Record<string, any>> {
  const url = new URL(`${getBaseUrl()}/employee-documents`)
  url.searchParams.set('page', String(page))
  url.searchParams.set('per_page', String(EMPLOYEE_DOCUMENT_PAGE_SIZE))
  if (employeeId != null && String(employeeId).trim() !== '') {
    url.searchParams.set('employee_id', String(employeeId))
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/json'
    }
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw createApiError(err.message || 'Failed to fetch employee documents', response.status, err)
  }
  return response.json()
}

function resolveDocumentKey(doc: EmployeeDocument): string {
  return resolveDocumentRecordUuid(doc)
}

function resolveFilename(response: Response, fallbackName: string) {
  const disposition = response.headers.get('content-disposition') || ''
  const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/)
  if (!match?.[1]) return fallbackName
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

export const employeeDocumentService = {
  async getAll(token?: string, employeeId?: string | number): Promise<ApiResponse<EmployeeDocument[]>> {
    requireLoadedPermission('employee-document-list')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const firstPayload = await fetchEmployeeDocumentPage(authToken, 1, employeeId)
    const firstRows = extractDocuments(firstPayload)
    const pagination = extractPagination(
      firstPayload,
      firstRows.length,
      1,
      EMPLOYEE_DOCUMENT_PAGE_SIZE
    )
    if (
      !Number.isInteger(pagination.lastPage) ||
      pagination.lastPage < 1 ||
      pagination.lastPage > MAX_EMPLOYEE_DOCUMENT_PAGES
    ) {
      throw createApiError(
        `Employee documents exceed the ${MAX_EMPLOYEE_DOCUMENT_PAGES}-page safety limit.`,
        422,
        { pagination }
      )
    }

    const remainingPayloads = pagination.lastPage > 1
      ? await Promise.all(
        Array.from(
          { length: pagination.lastPage - 1 },
          (_, index) => fetchEmployeeDocumentPage(authToken, index + 2, employeeId)
        )
      )
      : []
    const rows = [
      ...firstRows,
      ...remainingPayloads.flatMap(extractDocuments)
    ]
    const deduplicated = Array.from(
      new Map(
        rows.map(document => [
          resolveDocumentRecordUuid(document),
          document
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
          per_page: EMPLOYEE_DOCUMENT_PAGE_SIZE,
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

  /**
   * Get all documents for the current employee (self-service endpoint).
   * Backend filters by authenticated user automatically.
   */
  async getMyDocuments(
    token: string,
    employeeId?: string | number | null
  ): Promise<ApiResponse<EmployeeDocument[]>> {
    requireLoadedPermission('employee-document-list')
    if (!token) throw new Error('Authentication required')
    return this.getAll(token, employeeId ?? undefined)
  },

  /**
   * Upload a document for the current employee (self-service endpoint).
   * Backend requires both employee_id (numeric) and document_type_id.
   */
  async uploadMyDocument(
    payload: { employee_id: string | number; document_type_id: string; document: File },
    token: string
  ): Promise<ApiResponse<EmployeeDocument>> {
    requireLoadedPermission('employee-document-create')
    if (!token) throw new Error('Authentication required')

    const formData = new FormData()
    formData.append('employee_id', String(payload.employee_id))
    formData.append('document_type_id', String(payload.document_type_id))
    formData.append('document', payload.document)

    const response = await fetch(`${getBaseUrl()}/employee-documents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      body: formData
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError((err as { message?: string }).message || 'Failed to upload document', response.status, err)
    }
    const json = await response.json()
    return {
      ...json,
      data: extractDocument(json)
    }
  },

  /**
   * Download a document by UUID via GET /download-document/{uuid}.
   * Returns the raw blob so the caller can trigger the file save.
   */
  async downloadByUuid(uuidOrDoc: string | EmployeeDocument, token?: string): Promise<Blob> {
    requireLoadedPermission('employee-document-show')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const uuid = typeof uuidOrDoc === 'string'
      ? uuidOrDoc.trim()
      : resolveDocumentRecordUuid(uuidOrDoc)
    if (!uuid) throw new Error('Document UUID is required')

    const response = await fetch(`${getBaseUrl()}/download-document/${encodeURIComponent(uuid)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/octet-stream, application/pdf, image/*, application/json'
      }
    })
    if (!response.ok) {
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const err = await response.json().catch(() => ({}))
        throw createApiError((err as { message?: string }).message || 'Failed to download document', response.status, err)
      }
      const err = await response.text().catch(() => '')
      throw createApiError(err || 'Failed to download document', response.status, { uuid })
    }
    return response.blob()
  },

  async create(payload: CreateDocumentPayload, token?: string): Promise<ApiResponse<EmployeeDocument>> {
    requireLoadedPermission('employee-document-create')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const formData = new FormData()
    formData.append('employee_id', String(payload.employee_id))
    formData.append('document_type_id', String(payload.document_type_id))
    formData.append('document', payload.document)

    const response = await fetch(`${getBaseUrl()}/employee-documents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json'
      },
      body: formData
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to upload employee document', response.status, err)
    }
    const json = await response.json()
    return {
      ...json,
      data: extractDocument(json)
    }
  },

  async getByUuid(uuid: string, token?: string): Promise<ApiResponse<EmployeeDocument>> {
    requireLoadedPermission('employee-document-show')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/employee-documents/${encodeURIComponent(uuid)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to fetch employee document', response.status, err)
    }
    const json = await response.json()
    return {
      ...json,
      data: extractDocument(json)
    }
  },

  async getById(id: string, token?: string): Promise<ApiResponse<EmployeeDocument>> {
    console.warn('employeeDocumentService.getById is deprecated, use getByUuid instead')
    return this.getByUuid(id, token)
  },

  async updateByUuid(uuid: string, payload: UpdateDocumentPayload, token?: string): Promise<ApiResponse<EmployeeDocument>> {
    requireLoadedPermission('employee-document-edit')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const formData = new FormData()
    if (payload.employee_id !== undefined) formData.append('employee_id', String(payload.employee_id))
    if (payload.document_type_id !== undefined) formData.append('document_type_id', String(payload.document_type_id))
    if (payload.document) formData.append('document', payload.document)

    const response = await fetch(`${getBaseUrl()}/employee-documents/${encodeURIComponent(uuid)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json'
      },
      body: formData
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to update employee document', response.status, err)
    }
    const json = await response.json()
    return {
      ...json,
      data: extractDocument(json)
    }
  },

  async update(id: string, payload: UpdateDocumentPayload, token?: string): Promise<ApiResponse<EmployeeDocument>> {
    console.warn('employeeDocumentService.update is deprecated, use updateByUuid instead')
    return this.updateByUuid(id, payload, token)
  },

  async deleteByUuid(uuid: string, token?: string): Promise<ApiResponse<unknown>> {
    requireLoadedPermission('employee-document-delete')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/employee-documents/${encodeURIComponent(uuid)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to delete employee document', response.status, err)
    }
    return response.json()
  },

  async delete(id: string, token?: string): Promise<ApiResponse<unknown>> {
    console.warn('employeeDocumentService.delete is deprecated, use deleteByUuid instead')
    return this.deleteByUuid(id, token)
  },

  filterByEmployee(docs: EmployeeDocument[], employeeId: string): EmployeeDocument[] {
    const target = String(employeeId).trim()
    if (!target) return []
    return docs.filter(d =>
      String(d.employee_id ?? '').trim() === target ||
      String(d.employee?.id ?? '').trim() === target
    )
  },

  filterByType(docs: EmployeeDocument[], typeId: string): EmployeeDocument[] {
    return docs.filter(d => String(d.document_type_id) === String(typeId))
  },

  async download(doc: EmployeeDocument, token?: string): Promise<void> {
    requireLoadedPermission('employee-document-show')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const recordUuid = resolveDocumentRecordUuid(doc)
    const filename = doc.document_path.split('/').pop() || `document-${recordUuid || doc.id}`

    const saveBlob = (blob: Blob, response?: Response) => {
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = response ? resolveFilename(response, filename) : filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(objectUrl), 100)
    }

    const documentKey = recordUuid || resolveDocumentKey(doc)
    if (!documentKey) throw new Error('Document UUID is unavailable')

    const url = `${getBaseUrl()}/download-document/${encodeURIComponent(documentKey)}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/octet-stream, application/pdf, image/*, application/json'
      }
    })
    if (!response.ok) {
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const err = await response.json().catch(() => ({}))
        throw createApiError((err as { message?: string }).message || 'Failed to download document', response.status, err)
      }

      const err = await response.text().catch(() => '')
      throw createApiError(err || 'Failed to download document', response.status, { url, contentType })
    }

    saveBlob(await response.blob(), response)
  },

  async bulkCreate(payloads: CreateDocumentPayload[], token?: string): Promise<EmployeeDocument[]> {
    const results: EmployeeDocument[] = []
    for (const payload of payloads) {
      const result = await this.create(payload, token)
      results.push(result.data)
    }
    return results
  },

  async bulkDeleteByUuids(uuids: string[], token?: string): Promise<void> {
    await Promise.all(uuids.map(uuid => this.deleteByUuid(uuid, token)))
  },

  async bulkDelete(ids: string[], token?: string): Promise<void> {
    console.warn('employeeDocumentService.bulkDelete is deprecated, use bulkDeleteByUuids instead')
    await this.bulkDeleteByUuids(ids, token)
  },

  validateFile(file: File): { valid: boolean; error?: string } {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return { valid: false, error: `File size exceeds the 5 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)` }
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const mimeOk = ALLOWED_TYPES.includes(file.type)
    const extOk = ALLOWED_EXTENSIONS.includes(ext)

    if (!mimeOk && !extOk) {
      return { valid: false, error: `File type not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` }
    }

    return { valid: true }
  },

  getStats(docs: EmployeeDocument[]) {
    return {
      total: docs.length,
      byType: docs.reduce<Record<string, number>>((acc, d) => {
        acc[d.document_type_id] = (acc[d.document_type_id] || 0) + 1
        return acc
      }, {})
    }
  }
}

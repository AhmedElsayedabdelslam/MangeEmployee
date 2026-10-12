import { defineStore } from 'pinia'
import {
  employeeDocumentService,
  resolveDocumentRecordUuid,
  type EmployeeDocument
} from '~/services/employeeDocumentService'
import { useAuthStore } from '~/stores/auth'
import type { ApiError } from '~/utils/apiError'
import { usePermissions } from '~/composables/usePermissions'
import { isPermissionError } from '~/utils/permissionErrors'


function isEmployeeUser(): boolean {
  const authStore = useAuthStore()
  return authStore.user?.type === 'Employee'
}

function firstNonEmptyText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value == null) continue
    const text = String(value).trim()
    if (text) return text
  }
  return undefined
}

function normalizeDocument(doc: any, fallback?: Partial<EmployeeDocument>): EmployeeDocument {
  const documentType =
    typeof doc?.document_type === 'string'
      ? { id: String(doc?.document_type_id ?? fallback?.document_type_id ?? ''), title: doc.document_type }
      : doc?.document_type
        ? { ...doc.document_type, id: String(doc.document_type.id ?? '') }
        : fallback?.document_type

  return {
    id: String(doc?.id ?? fallback?.id ?? ''),
    uuid: String(doc?.uuid ?? fallback?.uuid ?? ''),
    employee_id: String(doc?.employee_id ?? doc?.employee?.id ?? fallback?.employee_id ?? ''),
    document_type_id: String(doc?.document_type_id ?? doc?.document_type?.id ?? fallback?.document_type_id ?? ''),
    document_path: doc?.document_path ?? doc?.path ?? fallback?.document_path ?? '',
    created_by: firstNonEmptyText(
      doc?.created_by,
      doc?.uploaded_by,
      doc?.uploadedBy,
      doc?.createdBy,
      fallback?.created_by,
      fallback?.uploadedBy
    ),
    uploadedBy: firstNonEmptyText(doc?.uploadedBy, fallback?.uploadedBy),
    created_at: doc?.created_at ?? fallback?.created_at,
    updated_at: doc?.updated_at ?? fallback?.updated_at,
    employee: doc?.employee
      ? {
          id: String(doc.employee.id ?? ''),
          name: String(doc.employee.name ?? ''),
          employee_id: doc.employee.employee_id != null ? String(doc.employee.employee_id) : undefined,
          employee_code: doc.employee.employee_code != null ? String(doc.employee.employee_code) : undefined,
          code: doc.employee.code != null ? String(doc.employee.code) : undefined,
        }
      : fallback?.employee,
    document_type: documentType
  }
}

function extractDocuments(payload: any): EmployeeDocument[] {
  const candidates = [
    payload?.data,
    payload?.data?.data,
    payload
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(doc => normalizeDocument(doc))
    }
  }

  return []
}

function extractDocument(payload: any, fallback?: Partial<EmployeeDocument>): EmployeeDocument {
  return normalizeDocument(payload?.data?.data ?? payload?.data ?? payload, fallback)
}

export const useEmployeeDocumentsStore = defineStore('employeeDocuments', {
  state: () => ({
    documentsByEmployeeId: {} as Record<string, EmployeeDocument[]>,
    loading: false,
    error: null as string | null
  }),

  getters: {
    getDocumentsByEmployeeId: state => (employeeId: string) => state.documentsByEmployeeId[employeeId] || [],
    getDocumentsByType: state => (employeeId: string, typeId: string) => {
      const docs = state.documentsByEmployeeId[employeeId] || []
      return docs.filter(doc => String(doc.document_type_id) === String(typeId))
    }
  },

  actions: {
    async fetchDocumentsByEmployeeId(
      employeeId: string,
      numericEmployeeId?: string | number | null
    ) {
      const { hasPermission } = usePermissions()
      if (!hasPermission('employee-document-list')) {
        this.documentsByEmployeeId[employeeId] = []
        this.error = null
        this.loading = false
        return
      }

      this.loading = true
      this.error = null

      try {
        const authStore = useAuthStore()
        const ownProfile = isEmployeeUser()

        if (ownProfile) {
            const ownEmployeeId =
              numericEmployeeId ??
              (authStore.user as any)?.employee?.id ??
              (authStore.user as any)?.employee_id ??
              employeeId;

            const response = await employeeDocumentService.getMyDocuments(
              authStore.token ?? '',
              ownEmployeeId
            )
            this.documentsByEmployeeId[employeeId] = extractDocuments(response)
        }
         else {
          const numericId = numericEmployeeId != null && String(numericEmployeeId).trim() !== ''
            ? String(numericEmployeeId).trim()
            : /^\d+$/.test(String(employeeId).trim())
              ? String(employeeId).trim()
              : ''
          const response = await employeeDocumentService.getAll(
            authStore.token ?? '',
            numericId || undefined
          )
          const allDocs = extractDocuments(response)
          this.documentsByEmployeeId[employeeId] = numericId
            ? allDocs
            : employeeDocumentService.filterByEmployee(allDocs, employeeId)
        }
      } catch (err) {
        if (isPermissionError(err)) {
          this.documentsByEmployeeId[employeeId] = []
          this.error = null
          return
        }

        const apiErr = err as ApiError
        this.error = apiErr.message || 'Failed to fetch documents'
        throw err
      } finally {
        this.loading = false
      }
    },

    async uploadDocument(
      employeeId: string,
      documentTypeId: string,
      file: File,
      numericEmployeeId?: string | number | null
    ) {
      this.error = null

      try {
        const { hasPermission } = usePermissions()
        if (!hasPermission('employee-document-create')) {
          throw new Error('You do not have permission to upload employee documents')
        }

        const validation = employeeDocumentService.validateFile(file)
        if (!validation.valid) {
          throw new Error(validation.error || 'Invalid file')
        }

        const authStore = useAuthStore()
        const ownProfile = isEmployeeUser()

        const resolvedEmployeeId = ownProfile
          ? String(
              (authStore.user as any)?.employee?.id ??
              (authStore.user as any)?.employee_id ??
              employeeId
            )
          : numericEmployeeId != null && String(numericEmployeeId).trim() !== ''
            ? String(numericEmployeeId).trim()
            : /^\d+$/.test(String(employeeId).trim())
              ? String(employeeId).trim()
              : employeeId

        const response = ownProfile
          ? await employeeDocumentService.uploadMyDocument(
              {
                employee_id: resolvedEmployeeId,
                document_type_id: documentTypeId,
                document: file
              },
              authStore.token ?? ''
            )
          : await employeeDocumentService.create(
              {
                employee_id: resolvedEmployeeId,
                document_type_id: documentTypeId,
                document: file
              },
              authStore.token ?? ''
            )

        const document = extractDocument(response, {
          employee_id: employeeId,
          document_type_id: documentTypeId,
          created_at: new Date().toISOString()
        })
        if (hasPermission('employee-document-list')) {
          await this.fetchDocumentsByEmployeeId(employeeId, resolvedEmployeeId)
        }
        return document
      } catch (err) {
        const apiErr = err as ApiError
        this.error = apiErr.message || 'Failed to upload document'
        throw err
      }
    },

    async deleteDocument(documentUuid: string, employeeId: string) {
      this.error = null

      try {
        const { hasPermission } = usePermissions()
        if (!hasPermission('employee-document-delete')) {
          throw new Error('You do not have permission to delete employee documents')
        }

        const authStore = useAuthStore()
        await employeeDocumentService.deleteByUuid(documentUuid, authStore.token ?? '')
        if (this.documentsByEmployeeId[employeeId]) {
          this.documentsByEmployeeId[employeeId] = this.documentsByEmployeeId[employeeId].filter(
            doc => resolveDocumentRecordUuid(doc) !== String(documentUuid)
          )
        }
      } catch (err) {
        const apiErr = err as ApiError
        this.error = apiErr.message || 'Failed to delete document'
        throw err
      }
    },

    clearEmployeeDocuments(employeeId: string) {
      delete this.documentsByEmployeeId[employeeId]
    }
  }
})

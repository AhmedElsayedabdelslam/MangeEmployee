import { defineStore } from 'pinia'
import { documentTypeService } from '~/services/documentTypeService'
import { useAuthStore } from '~/stores/auth'
import type { DocumentType, DocumentTypePayload } from '~/types/documentType'
import { entityApiKey, entityKeyMatches } from '~/utils/entityApiKey'
import { hasLoadedPermission, requireLoadedPermission } from '~/utils/permissionAccess'

function normalizeDocumentType(type: DocumentType): DocumentType {
  const row: DocumentType = {
    ...type,
    id: String(type.id),
    is_required: type.is_required === 1 ? 1 : 0
  }
  if (type.uuid != null && String(type.uuid).trim() !== '') row.uuid = String(type.uuid)
  return row
}

function requireAuthToken(): string {
  const authStore = useAuthStore()
  if (!authStore.token) throw new Error('Not authenticated')
  return authStore.token
}

export const useDocumentTypeStore = defineStore('documentTypes', {
  state: () => ({
    documentTypes: [] as DocumentType[],
    loading: false,
    error: null as string | null
  }),

  getters: {
    requiredDocuments: (state) => state.documentTypes.filter((d) => d.is_required === 1),
    optionalDocuments: (state) => state.documentTypes.filter((d) => d.is_required === 0),
    documentStats: (state) => {
      const required = state.documentTypes.filter((d) => d.is_required === 1).length
      const optional = state.documentTypes.filter((d) => d.is_required === 0).length
      return { required, optional, total: state.documentTypes.length }
    }
  },

  actions: {
    async fetchDocumentTypes(params?: { search?: string }) {
      requireLoadedPermission('document-type-list')
      const authStore = useAuthStore()
      const token = requireAuthToken()
      const accountId = String(authStore.user?.id ?? '')
      this.loading = true
      this.error = null

      try {
        const response = await documentTypeService.getAll(token,params?.search)
        if (
          authStore.token !== token ||
          String(authStore.user?.id ?? '') !== accountId ||
          !hasLoadedPermission('document-type-list')
        ) {
          return
        }
        if (!response.success) throw new Error(response.message || 'Failed to fetch document types')
        this.documentTypes = Array.isArray(response.data)
          ? response.data.map(normalizeDocumentType)
          : []
      } catch (err: unknown) {
        if (
          authStore.token !== token ||
          String(authStore.user?.id ?? '') !== accountId ||
          !hasLoadedPermission('document-type-list')
        ) {
          return
        }
        this.error = err instanceof Error ? err.message : 'Failed to fetch document types'
        throw err
      } finally {
        this.loading = false
      }
    },

    async fetchDocumentTypeById(id: string) {
      requireLoadedPermission('document-type-show')
      this.loading = true
      this.error = null

      try {
        const response = await documentTypeService.getById(String(id), requireAuthToken())
        if (!response.success) throw new Error(response.message || 'Failed to fetch document type')
        return normalizeDocumentType(response.data)
      } catch (err: unknown) {
        this.error = err instanceof Error ? err.message : 'Failed to fetch document type'
        throw err
      } finally {
        this.loading = false
      }
    },

    async createDocumentType(name: string, isRequired: boolean = false): Promise<DocumentType> {
      requireLoadedPermission('document-type-create')
      this.loading = true
      this.error = null

      try {
        const payload: DocumentTypePayload = {
          name,
          is_required: isRequired ? 1 : 0
        }
        const response = await documentTypeService.create(payload, requireAuthToken())
        if (!response.success) throw new Error(response.message || 'Failed to create document type')
        const created = normalizeDocumentType(response.data)
        this.documentTypes.unshift(created)
        return created
      } catch (err: unknown) {
        this.error = err instanceof Error ? err.message : 'Failed to create document type'
        throw err
      } finally {
        this.loading = false
      }
    },

    async updateDocumentType(id: string, name: string, isRequired: boolean): Promise<DocumentType> {
      requireLoadedPermission('document-type-edit')
      this.loading = true
      this.error = null

      try {
        const payload: DocumentTypePayload = {
          name,
          is_required: isRequired ? 1 : 0
        }
        const response = await documentTypeService.update(String(id), payload, requireAuthToken())
        if (!response.success) throw new Error(response.message || 'Failed to update document type')
        const updated = normalizeDocumentType(response.data)
        const index = this.documentTypes.findIndex((d) => entityKeyMatches(d, id))
        if (index !== -1) this.documentTypes.splice(index, 1, updated)
        else this.documentTypes.unshift(updated)
        return updated
      } catch (err: unknown) {
        this.error = err instanceof Error ? err.message : 'Failed to update document type'
        throw err
      } finally {
        this.loading = false
      }
    },

    async toggleRequired(id: string): Promise<void> {
      const doc = this.documentTypes.find((d) => entityKeyMatches(d, id))
      if (!doc) throw new Error('Document type not found')

      await this.updateDocumentType(entityApiKey(doc), doc.name, doc.is_required !== 1)
    },

    async deleteDocumentType(id: string): Promise<void> {
      requireLoadedPermission('document-type-delete')
      this.loading = true
      this.error = null

      try {
        const response = await documentTypeService.delete(String(id), requireAuthToken())
        if (!response.success) throw new Error(response.message || 'Failed to delete document type')
        this.documentTypes = this.documentTypes.filter((d) => !entityKeyMatches(d, id))
      } catch (err: unknown) {
        this.error = err instanceof Error ? err.message : 'Failed to delete document type'
        throw err
      } finally {
        this.loading = false
      }
    }
  }
})

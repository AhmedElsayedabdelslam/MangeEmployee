import { defineStore } from 'pinia'
import { documentTypeService } from '~/services/documentTypeService'
import { useAuthStore } from '~/stores/auth'
import { hasLoadedPermission, requireLoadedPermission } from '~/utils/permissionAccess'

export interface ApiDocumentType {
  id: string
  title?: string
  name?: string
  is_required?: 0 | 1
}

function normalizeDocumentType(type: ApiDocumentType): ApiDocumentType {
  return {
    ...type,
    id: String(type.id),
    title: type.title ?? type.name ?? ''
  }
}

function extractDocumentTypes(payload: any): ApiDocumentType[] {
  const candidates = [
    payload?.data,
    payload?.data?.data,
    payload
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeDocumentType)
    }
  }

  return []
}

export const useDocumentTypesStore = defineStore('documentTypesApi', {
  state: () => ({
    types: [] as ApiDocumentType[],
    loading: false,
    error: null as string | null
  }),

  getters: {
    getTypeById: state => (id: string) => state.types.find(type => String(type.id) === String(id)),
    getTypeByTitle: state => (title: string) =>
      state.types.find(type => (type.title ?? type.name ?? '').toLowerCase() === title.toLowerCase())
  },

  actions: {
    async fetchDocumentTypes(force = false) {
      requireLoadedPermission('document-type-list')
      if (!force && this.types.length > 0) return

      const authStore = useAuthStore()
      if (!authStore.token) throw new Error('Authentication required')
      const token = authStore.token
      const accountId = String(authStore.user?.id ?? '')

      this.loading = true
      this.error = null

      try {
        const response = await documentTypeService.getAll(token)
        if (
          authStore.token !== token ||
          String(authStore.user?.id ?? '') !== accountId ||
          !hasLoadedPermission('document-type-list')
        ) {
          return
        }
        const extracted = extractDocumentTypes(response)
        this.types = extracted.length > 0
          ? extracted
          : Array.isArray(response.data)
            ? response.data.map(normalizeDocumentType)
            : []
      } catch (err: any) {
        if (
          authStore.token !== token ||
          String(authStore.user?.id ?? '') !== accountId ||
          !hasLoadedPermission('document-type-list')
        ) {
          return
        }
        this.error = err.message || 'Failed to fetch document types'
        throw err
      } finally {
        this.loading = false
      }
    }
  }
})

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  internalNoteService,
  type ApiInternalNote,
  type CreateInternalNotePayload,
  type UpdateInternalNotePayload
} from '~/services/internalNoteService'
import { useAuthStore } from '~/stores/auth'
import { requireLoadedPermission } from '~/utils/permissionAccess'

function normalizeNote(raw: any): ApiInternalNote {
  const note = (raw || {}) as ApiInternalNote
  const createdByName =
    note.creator?.name ||
    (typeof note.created_by === 'string' ? note.created_by : undefined)

  const editedByName =
    note.editor?.name ||
    (typeof note.edited_by === 'string' ? note.edited_by : undefined)

  return {
    ...note,
    creator: createdByName
      ? { id: note.creator?.id ?? '', name: createdByName, email: note.creator?.email }
      : note.creator,
    editor: editedByName
      ? { id: note.editor?.id ?? '', name: editedByName, email: note.editor?.email }
      : note.editor
  }
}

function extractNotesArray(response: any): ApiInternalNote[] {
  if (Array.isArray(response?.data)) return response.data.map(normalizeNote)
  if (Array.isArray(response?.data?.data)) return response.data.data.map(normalizeNote)
  if (Array.isArray(response?.data?.data?.data)) return response.data.data.data.map(normalizeNote)
  return []
}

function extractNote(response: any): ApiInternalNote {
  return normalizeNote(
    response?.data ??
    response?.data?.data ??
    response
  )
}

function extractMeta(response: any) {
  return response?.meta || response?.data?.meta
}

export const useInternalNoteStore = defineStore('internalNote', () => {
  const internalNotes = ref<ApiInternalNote[]>([])
  const notesByEmployeeId = ref<Record<string, ApiInternalNote[]>>({})
  const currentNote = ref<ApiInternalNote | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref({
    total: 0,
    per_page: 15,
    current_page: 1,
    last_page: 1
  })

  const totalNotes = computed(() => internalNotes.value.length)

  const requireToken = () => {
    const auth = useAuthStore()
    if (!auth.token) throw new Error('Not authenticated')
    return auth.token
  }

  const employeeNoteKey = (employeeId: number | string) => String(employeeId)

  const fetchAllNotes = async (page = 1) => {
    requireLoadedPermission('internal-note-list')
    loading.value = true
    error.value = null
    try {
      const token = requireToken()
      const response = await internalNoteService.getAll(page, token)
      internalNotes.value = extractNotesArray(response)
      const meta = extractMeta(response)
      if (meta?.pagination) pagination.value = meta.pagination
    } catch (err: any) {
      error.value = err?.message || 'Failed to fetch internal notes'
      console.error('Error fetching internal notes:', err)
    } finally {
      loading.value = false
    }
  }

  const fetchNotesByEmployee = async (employeeId: number | string) => {
    requireLoadedPermission('internal-note-list')
    loading.value = true
    error.value = null
    try {
      const token = requireToken()
      const response = await internalNoteService.getByEmployeeId(employeeId, token)
      const data = extractNotesArray(response)
      // Guard against backends that ignore the employee_id filter and return all notes
      const filtered = data.filter(n => String(n.employee_id) === String(employeeId))
      notesByEmployeeId.value[employeeNoteKey(employeeId)] = filtered
      return filtered
    } catch (err: any) {
      error.value = err?.message || 'Failed to fetch notes for employee'
      console.error('Error fetching employee notes:', err)
    } finally {
      loading.value = false
    }
  }

  const fetchNoteById = async (id: string) => {
    requireLoadedPermission('internal-note-show')
    loading.value = true
    error.value = null
    try {
      const token = requireToken()
      const response = await internalNoteService.getById(id, token)
      currentNote.value = extractNote(response)
    } catch (err: any) {
      error.value = err?.message || 'Failed to fetch note'
      console.error('Error fetching note:', err)
    } finally {
      loading.value = false
    }
  }

  const createNote = async (payload: CreateInternalNotePayload) => {
    requireLoadedPermission('internal-note-create')
    loading.value = true
    error.value = null
    try {
      const token = requireToken()
      const response = await internalNoteService.create(payload, token)
      const note = extractNote(response)
      internalNotes.value.unshift(note)
      if (payload.employee_id) {
        const employeeId = employeeNoteKey(payload.employee_id)
        if (!notesByEmployeeId.value[employeeId]) notesByEmployeeId.value[employeeId] = []
        notesByEmployeeId.value[employeeId].unshift(note)
      }
      return note
    } catch (err: any) {
      error.value = err?.message || 'Failed to create note'
      console.error('Error creating note:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  const updateNote = async (id: number | string, payload: UpdateInternalNotePayload) => {
    requireLoadedPermission('internal-note-edit')
    loading.value = true
    error.value = null
    try {
      const token = requireToken()
      const response = await internalNoteService.update(id, payload, token)
      const note = extractNote(response)

      const idx = internalNotes.value.findIndex(n => String(n.id) === String(id))
      if (idx !== -1) internalNotes.value[idx] = note

      const empId = employeeNoteKey(note.employee_id)
      const list = notesByEmployeeId.value[empId]
      if (list) {
        const empIdx = list.findIndex(n => String(n.id) === String(id))
        if (empIdx !== -1) list[empIdx] = note
      }

      return note
    } catch (err: any) {
      error.value = err?.message || 'Failed to update note'
      console.error('Error updating note:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  const deleteNote = async (id: number | string) => {
    requireLoadedPermission('internal-note-delete')
    loading.value = true
    error.value = null
    try {
      const token = requireToken()
      await internalNoteService.delete(id, token)
      internalNotes.value = internalNotes.value.filter(n => String(n.id) !== String(id))
      Object.keys(notesByEmployeeId.value).forEach(key => {
        notesByEmployeeId.value[key] = (notesByEmployeeId.value[key] || []).filter(
          n => String(n.id) !== String(id),
        )
      })
    } catch (err: any) {
      error.value = err?.message || 'Failed to delete note'
      console.error('Error deleting note:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    internalNotes,
    notesByEmployeeId,
    currentNote,
    loading,
    error,
    pagination,
    totalNotes,
    fetchAllNotes,
    fetchNotesByEmployee,
    fetchNoteById,
    createNote,
    updateNote,
    deleteNote
  }
})

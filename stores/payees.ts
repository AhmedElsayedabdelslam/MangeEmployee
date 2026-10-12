import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { payeeService, type CreatePayeePayload, type Payee, type UpdatePayeePayload } from '~/services/payeeService'
import { useAuthStore } from '~/stores/auth'
import type { ApiError } from '~/utils/apiError'

interface PaginationState {
  current_page: number
  per_page: number
  total: number
  last_page: number
}

const defaultPagination = (): PaginationState => ({
  current_page: 1,
  per_page: 10,
  total: 0,
  last_page: 1,
})

type PayeeKey = number | string

function payeeMatches(payee: Payee, key: PayeeKey): boolean {
  return String(payee.uuid ?? payee.id) === String(key) || String(payee.id) === String(key)
}

export const usePayeesStore = defineStore('payees', () => {
  const payees = ref<Payee[]>([])
  const currentPayee = ref<Payee | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref<PaginationState>(defaultPagination())

  const payeeCount = computed(() => pagination.value.total)
  const hasPayees = computed(() => payees.value.length > 0)
  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== null)

  async function fetchPayees(page = 1, perPage = pagination.value.per_page, search = '') {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await payeeService.getAllPayees(
        page,
        perPage,
        search,
        'id',
        'desc',
        authStore.token ?? undefined,
      )

      payees.value = response.data || []

      const paginationData = response.pagination || response.meta?.pagination
      pagination.value = paginationData
        ? {
            current_page: paginationData.current_page,
            per_page: paginationData.per_page,
            total: paginationData.total,
            last_page: paginationData.last_page || paginationData.total_pages || 1,
          }
        : {
            current_page: page,
            per_page: perPage,
            total: payees.value.length,
            last_page: 1,
          }
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to fetch payees'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchPayeeById(id: PayeeKey) {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await payeeService.getPayeeById(id, authStore.token ?? undefined)
      currentPayee.value = response.data
      return response.data
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to fetch payee'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createPayee(payload: CreatePayeePayload) {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await payeeService.createPayee(payload, authStore.token ?? undefined)
      return response.data
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to create payee'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function updatePayee(id: PayeeKey, payload: UpdatePayeePayload) {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await payeeService.updatePayee(id, payload, authStore.token ?? undefined)

      const index = payees.value.findIndex((payee) => payeeMatches(payee, id))
      if (index !== -1) payees.value[index] = response.data
      if (currentPayee.value && payeeMatches(currentPayee.value, id)) currentPayee.value = response.data

      return response.data
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to update payee'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function deletePayee(id: PayeeKey) {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      await payeeService.deletePayee(id, authStore.token ?? undefined)
      payees.value = payees.value.filter((payee) => !payeeMatches(payee, id))
      if (pagination.value.total > 0) pagination.value.total -= 1
      if (currentPayee.value && payeeMatches(currentPayee.value, id)) currentPayee.value = null
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to delete payee'
      throw err
    } finally {
      loading.value = false
    }
  }

  function clearError() {
    error.value = null
  }

  function resetCurrentPayee() {
    currentPayee.value = null
  }

  return {
    payees,
    currentPayee,
    loading,
    error,
    pagination,
    payeeCount,
    hasPayees,
    isLoading,
    hasError,
    fetchPayees,
    fetchPayeeById,
    createPayee,
    updatePayee,
    deletePayee,
    clearError,
    resetCurrentPayee,
  }
})

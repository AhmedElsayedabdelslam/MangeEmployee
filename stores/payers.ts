import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { payerService } from '~/services/payerService'
import { useAuthStore } from '~/stores/auth'
import type { CreatePayerPayload, Payer, UpdatePayerPayload } from '~/types/payer'
import type { ApiError } from '~/utils/apiError'

interface PaginationState {
  current_page: number
  per_page: number
  total: number
  count: number
  total_pages: number
}

const defaultPagination = (): PaginationState => ({
  current_page: 1,
  per_page: 10,
  total: 0,
  count: 0,
  total_pages: 1,
})

type PayerKey = number | string

function payerMatches(payer: Payer, key: PayerKey): boolean {
  return String(payer.uuid ?? payer.id) === String(key) || String(payer.id) === String(key)
}

export const usePayersStore = defineStore('payers', () => {
  const payers = ref<Payer[]>([])
  const currentPayer = ref<Payer | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref<PaginationState>(defaultPagination())

  const payerCount = computed(() => pagination.value.total)
  const hasPayers = computed(() => payers.value.length > 0)
  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== null)

  async function fetchPayers(page = 1, perPage = pagination.value.per_page, search = '') {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await payerService.getAllPayers(
        page,
        perPage,
        search,
        authStore.token ?? undefined,
      )

      payers.value = response.data || []

      const paginationData = response.meta?.pagination
      pagination.value = paginationData
        ? {
            current_page: paginationData.current_page,
            per_page: paginationData.per_page,
            total: paginationData.total,
            count: paginationData.count ?? payers.value.length,
            total_pages: paginationData.total_pages || paginationData.last_page || 1,
          }
        : {
            current_page: page,
            per_page: perPage,
            total: payers.value.length,
            count: payers.value.length,
            total_pages: 1,
          }
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to fetch payers'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchPayerById(id: PayerKey) {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await payerService.getPayerById(id, authStore.token ?? undefined)
      currentPayer.value = response.data
      return response.data
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to fetch payer'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createPayer(payload: CreatePayerPayload) {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await payerService.createPayer(payload, authStore.token ?? undefined)
      return response.data
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to create payer'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function updatePayer(id: PayerKey, payload: UpdatePayerPayload) {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await payerService.updatePayer(id, payload, authStore.token ?? undefined)

      const index = payers.value.findIndex((payer) => payerMatches(payer, id))
      if (index !== -1) payers.value[index] = response.data
      if (currentPayer.value && payerMatches(currentPayer.value, id)) currentPayer.value = response.data

      return response.data
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to update payer'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function deletePayer(id: PayerKey) {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      await payerService.deletePayer(id, authStore.token ?? undefined)
      payers.value = payers.value.filter((payer) => !payerMatches(payer, id))
      if (pagination.value.total > 0) pagination.value.total -= 1
      if (pagination.value.count > 0) pagination.value.count -= 1
      if (currentPayer.value && payerMatches(currentPayer.value, id)) currentPayer.value = null
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to delete payer'
      throw err
    } finally {
      loading.value = false
    }
  }

  function clearError() {
    error.value = null
  }

  function resetCurrentPayer() {
    currentPayer.value = null
  }

  return {
    payers,
    currentPayer,
    loading,
    error,
    pagination,
    payerCount,
    hasPayers,
    isLoading,
    hasError,
    fetchPayers,
    fetchPayerById,
    createPayer,
    updatePayer,
    deletePayer,
    clearError,
    resetCurrentPayer,
  }
})

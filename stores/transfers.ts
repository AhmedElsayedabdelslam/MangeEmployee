import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { transferService } from '~/services/transferService'
import { useAuthStore } from '~/stores/auth'
import type {
  CreateTransferPayload,
  Transfer,
  TransferPagination,
  TransferStatus,
  UpdateTransferPayload,
} from '~/types/transfer'
import type { ApiError } from '~/utils/apiError'

const defaultPagination = (): TransferPagination => ({
  total: 0,
  per_page: 10,
  current_page: 1,
  last_page: 1,
})

export const useTransfersStore = defineStore('transfers', () => {
  const transfers = ref<Transfer[]>([])
  const currentTransfer = ref<Transfer | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref<TransferPagination>(defaultPagination())
  const searchQuery = ref('')
  const statusFilter = ref<TransferStatus | null>(null)

  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== null)
  const totalTransfers = computed(() => pagination.value.total)
  const pendingCount = computed(() => transfers.value.filter((transfer) => transfer.status === 'pending').length)
  const completedCount = computed(() => transfers.value.filter((transfer) => transfer.status === 'completed').length)
  const failedCount = computed(() => transfers.value.filter((transfer) => transfer.status === 'failed').length)
  const cancelledCount = computed(() =>
    transfers.value.filter((transfer) => transfer.status === 'cancel').length
  )
  const filteredTransfers = computed(() => {
    if (!statusFilter.value) return transfers.value
    return transfers.value.filter((transfer) => transfer.status === statusFilter.value)
  })

  function normalizePagination(
    page: number,
    perPage: number,
    responsePagination?: Partial<TransferPagination> & { total_pages?: number },
  ): TransferPagination {
    return {
      total: Number(responsePagination?.total ?? transfers.value.length) || 0,
      per_page: Number(responsePagination?.per_page ?? perPage) || perPage,
      current_page: Number(responsePagination?.current_page ?? page) || page,
      last_page: Number(responsePagination?.last_page ?? responsePagination?.total_pages ?? 1) || 1,
    }
  }

  async function fetchTransfers(page = 1, perPage = pagination.value.per_page, search = searchQuery.value) {
    loading.value = true
    error.value = null
    searchQuery.value = search

    try {
      const authStore = useAuthStore()
      const response = await transferService.getTransfers(
        page,
        perPage,
        search,
        authStore.token ?? undefined,
      )

      transfers.value = response.data || []
      pagination.value = normalizePagination(
        page,
        perPage,
        response.pagination || response.meta?.pagination,
      )
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to fetch transfers'
      transfers.value = []
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchTransfer(uuid: string) {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await transferService.getTransfer(uuid, authStore.token ?? undefined)
      currentTransfer.value = response.data
      return response.data
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to fetch transfer'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createTransfer(payload: CreateTransferPayload) {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await transferService.createTransfer(payload, authStore.token ?? undefined)
      transfers.value.unshift(response.data)
      pagination.value.total += 1
      return response.data
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to create transfer'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function updateTransfer(uuid: string, payload: UpdateTransferPayload) {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await transferService.updateTransfer(
        uuid,
        payload,
        authStore.token ?? undefined,
      )

      const index = transfers.value.findIndex((transfer) => transfer.uuid === uuid)
      if (index !== -1) transfers.value[index] = response.data
      if (currentTransfer.value?.uuid === uuid) currentTransfer.value = response.data

      return response.data
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to update transfer'
      throw err
    } finally {
      loading.value = false
    }
  }
  async function cancelTransfer(uuid: string) {
  loading.value = true
  error.value = null

  try {
    const authStore = useAuthStore()

    const response = await transferService.cancelTransfer(
      uuid,
      authStore.token ?? undefined,
    )

    const index = transfers.value.findIndex(
      (transfer) => transfer.uuid === uuid,
    )

    if (index !== -1) {
      transfers.value[index] = response.data
    }

    if (currentTransfer.value?.uuid === uuid) {
      currentTransfer.value = response.data
    }

    return response.data
  } catch (err) {
    const apiErr = err as ApiError
    error.value = apiErr.message || 'Failed to cancel transfer'
    throw err
  } finally {
    loading.value = false
  }
}

  async function deleteTransfer(uuid: string) {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      await transferService.deleteTransfer(uuid, authStore.token ?? undefined)
      transfers.value = transfers.value.filter((transfer) => transfer.uuid !== uuid)
      if (pagination.value.total > 0) pagination.value.total -= 1
      if (currentTransfer.value?.uuid === uuid) currentTransfer.value = null
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to delete transfer'
      throw err
    } finally {
      loading.value = false
    }
  }

  function filterByStatus(status: TransferStatus | null) {
    statusFilter.value = status
  }

  function clearError() {
    error.value = null
  }

  function resetCurrentTransfer() {
    currentTransfer.value = null
  }

  return {
    transfers,
    currentTransfer,
    loading,
    error,
    pagination,
    searchQuery,
    statusFilter,
    isLoading,
    hasError,
    totalTransfers,
    pendingCount,
    completedCount,
    failedCount,
    cancelledCount,
    filteredTransfers,
    fetchTransfers,
    fetchTransfer,
    createTransfer,
    updateTransfer,
    deleteTransfer,
    cancelTransfer,
    filterByStatus,
    clearError,
    resetCurrentTransfer,
  }
})

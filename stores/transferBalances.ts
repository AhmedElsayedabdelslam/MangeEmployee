import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { transferBalanceService, type TransferBalance } from '~/services/transferBalanceService'
import { useAuthStore } from '~/stores/auth'
import type {
  AccountListItem,
  CreateTransferBalancePayload,
  PaymentTypeListItem,
  UpdateTransferBalancePayload,
} from '~/types/transferBalance'
import type { ApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'

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

export const useTransferBalancesStore = defineStore('transferBalances', () => {
  const transferBalances = ref<TransferBalance[]>([])
  const currentTransferBalance = ref<TransferBalance | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref<PaginationState>(defaultPagination())
  const accounts = ref<AccountListItem[]>([])
  const paymentTypes = ref<PaymentTypeListItem[]>([])

  const transferBalanceCount = computed(() => pagination.value.total)
  const hasTransferBalances = computed(() => transferBalances.value.length > 0)
  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== null)

  async function fetchTransferBalances(page = 1, perPage = pagination.value.per_page, search = '') {
    requireLoadedPermission('transfer-balance-list')
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await transferBalanceService.getAllTransferBalances(
        page,
        perPage,
        search,
        'id',
        'desc',
        authStore.token ?? undefined,
      )

      transferBalances.value = response.data || []

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
            total: transferBalances.value.length,
            last_page: 1,
          }
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to fetch transfer balances'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchTransferBalanceById(uuid: string) {
    requireLoadedPermission('transfer-balance-show')
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await transferBalanceService.getTransferBalanceById(
        uuid,
        authStore.token ?? undefined,
      )
      currentTransferBalance.value = response.data
      return response.data
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to fetch transfer balance'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createTransferBalance(payload: CreateTransferBalancePayload) {
    requireLoadedPermission('transfer-balance-create')
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await transferBalanceService.createTransferBalance(
        payload,
        authStore.token ?? undefined,
      )
      return response.data
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to create transfer balance'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function updateTransferBalance(uuid: string, payload: UpdateTransferBalancePayload) {
    requireLoadedPermission('transfer-balance-edit')
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await transferBalanceService.updateTransferBalance(
        uuid,
        payload,
        authStore.token ?? undefined,
      )

      const index = transferBalances.value.findIndex((tb) => tb.uuid === uuid)
      if (index !== -1) transferBalances.value[index] = response.data
      if (currentTransferBalance.value?.uuid === uuid) currentTransferBalance.value = response.data

      return response.data
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to update transfer balance'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function deleteTransferBalance(uuid: string) {
    requireLoadedPermission('transfer-balance-delete')
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      await transferBalanceService.deleteTransferBalance(uuid, authStore.token ?? undefined)
      transferBalances.value = transferBalances.value.filter((tb) => tb.uuid !== uuid)
      if (pagination.value.total > 0) pagination.value.total -= 1
      if (currentTransferBalance.value?.uuid === uuid) currentTransferBalance.value = null
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to delete transfer balance'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchAccounts() {
    requireLoadedPermission('accountlist-list')
    try {
      const authStore = useAuthStore()
      const response = await transferBalanceService.getAccountList(authStore.token ?? undefined)
      accounts.value = response.data || []
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to fetch accounts'
      accounts.value = []
      throw err
    }
  }
  async function cancelTransferBalance(uuid: string) {
  requireLoadedPermission('transfer-balance-cancel')
  loading.value = true
  error.value = null

  try {
    const authStore = useAuthStore()

    const response = await transferBalanceService.cancelTransferBalance(
      uuid,
      authStore.token ?? undefined,
    )

    const index = transferBalances.value.findIndex((tb) => tb.uuid === uuid)

    if (index !== -1) {
      transferBalances.value[index] = response.data
    }

    if (currentTransferBalance.value?.uuid === uuid) {
      currentTransferBalance.value = response.data
    }

    return response.data
  } catch (err) {
    const apiErr = err as ApiError
    error.value = apiErr.message || 'Failed to cancel transfer balance'
    throw err
  } finally {
    loading.value = false
  }
}

  async function fetchPaymentTypes() {
    requireLoadedPermission('payment-type-list')
    try {
      const authStore = useAuthStore()
      const response = await transferBalanceService.getPaymentTypeList(authStore.token ?? undefined)
      paymentTypes.value = response.data || []
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to fetch payment types'
      paymentTypes.value = []
      throw err
    }
  }

  function clearError() {
    error.value = null
  }

  function resetCurrentTransferBalance() {
    currentTransferBalance.value = null
  }

  return {
    transferBalances,
    currentTransferBalance,
    loading,
    error,
    pagination,
    accounts,
    paymentTypes,
    transferBalanceCount,
    hasTransferBalances,
    isLoading,
    hasError,
    fetchTransferBalances,
    fetchTransferBalanceById,
    createTransferBalance,
    updateTransferBalance,
    cancelTransferBalance,
    deleteTransferBalance,
    fetchAccounts,
    fetchPaymentTypes,
    clearError,
    resetCurrentTransferBalance,
  }
})

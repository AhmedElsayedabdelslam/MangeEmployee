import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { accountListService } from '~/services/accountListService'
import { useAuthStore } from '~/stores/auth'
import type {
  AccountBalance,
  AccountList,
  AccountListPagination,
  CreateAccountListPayload,
  UpdateAccountListPayload,
} from '~/types/accountList'
import type { ApiError } from '~/utils/apiError'

function toNumber(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.replace(/,/g, ''))
        : Number(value)

  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeAccount(raw: unknown): AccountList {
  const entry = (raw ?? {}) as Record<string, unknown>
  return {
    id: Number(entry.id ?? 0),
    uuid: entry.uuid != null ? String(entry.uuid) : undefined,
    account_name: String(entry.account_name ?? ''),
    account_number: String(entry.account_number ?? ''),
    initial_balance: toNumber(entry.initial_balance),
    current_balance: entry.current_balance != null ? toNumber(entry.current_balance) : undefined,
    branch_code: String(entry.branch_code ?? ''),
    bank_branch: String(entry.bank_branch ?? ''),
    created_at: entry.created_at ? String(entry.created_at) : undefined,
    updated_at: entry.updated_at ? String(entry.updated_at) : undefined,
  }
}

function normalizeBalance(raw: unknown): AccountBalance {
  const entry = (raw ?? {}) as Record<string, unknown>
  return {
    id: Number(entry.id ?? 0),
    uuid: entry.uuid != null ? String(entry.uuid) : undefined,
    account_name: String(entry.account_name ?? ''),
    account_number: String(entry.account_number ?? ''),
    current_balance: toNumber(entry.current_balance),
    initial_balance: toNumber(entry.initial_balance),
    branch_code: entry.branch_code != null ? String(entry.branch_code) : undefined,
    bank_branch: entry.bank_branch != null ? String(entry.bank_branch) : undefined,
  }
}

function defaultPagination(): AccountListPagination {
  return {
    total: 0,
    count: 0,
    perPage: 10,
    currentPage: 1,
    totalPages: 1,
  }
}

type AccountListKey = number | string

function accountKey(account: AccountList | AccountBalance): AccountListKey {
  return account.uuid || account.id
}

function accountMatches(account: AccountList | AccountBalance, key: AccountListKey): boolean {
  return String(account.uuid ?? account.id) === String(key) || String(account.id) === String(key)
}

function accountToBalance(account: AccountList, currentBalance = account.current_balance ?? account.initial_balance): AccountBalance {
  return {
    id: account.id,
    uuid: account.uuid,
    account_name: account.account_name,
    account_number: account.account_number,
    current_balance: currentBalance,
    initial_balance: account.initial_balance,
    branch_code: account.branch_code,
    bank_branch: account.bank_branch,
  }
}

export const useAccountListsStore = defineStore('accountLists', () => {
  const accounts = ref<AccountList[]>([])
  const currentAccount = ref<AccountList | null>(null)
  const accountBalances = ref<AccountBalance[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref<AccountListPagination>(defaultPagination())
  const filters = ref({ search: '' })

  const accountCount = computed(() => pagination.value.total)
  const hasAccounts = computed(() => accounts.value.length > 0)

  async function fetchAccounts(page = 1, perPage = pagination.value.perPage, search = filters.value.search) {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await accountListService.getAll(page, perPage, search, authStore.token ?? undefined)
      const raw = response.data as unknown
      const data: unknown[] = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as Record<string, unknown>)?.data)
          ? (raw as Record<string, unknown>).data as unknown[]
          : raw
            ? [raw]
            : []

      accounts.value = data.map(normalizeAccount)

      const paginationData = response.pagination || response.meta?.pagination
      pagination.value = paginationData
        ? {
            total: Number(paginationData.total ?? accounts.value.length),
            count: Number(paginationData.count ?? accounts.value.length),
            perPage: Number(paginationData.per_page ?? perPage),
            currentPage: Number(paginationData.current_page ?? page),
            totalPages: Number(paginationData.total_pages ?? paginationData.last_page ?? 1),
          }
        : {
            total: accounts.value.length,
            count: accounts.value.length,
            perPage,
            currentPage: page,
            totalPages: 1,
          }
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to fetch accounts'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchAccountById(id: AccountListKey): Promise<AccountList> {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await accountListService.getById(id, authStore.token ?? undefined)
      const account = normalizeAccount(Array.isArray(response.data) ? response.data[0] : response.data)
      currentAccount.value = account

      const index = accounts.value.findIndex((entry) => accountMatches(entry, id))
      if (index === -1) accounts.value.unshift(account)
      else accounts.value[index] = account

      return account
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to fetch account'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createAccount(payload: CreateAccountListPayload): Promise<AccountList> {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await accountListService.create(payload, authStore.token ?? undefined)
      const account = normalizeAccount(Array.isArray(response.data) ? response.data[0] : response.data)
      accounts.value.unshift(account)
      pagination.value.total += 1
      pagination.value.count = accounts.value.length
      return account
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to create account'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function updateAccount(id: AccountListKey, payload: UpdateAccountListPayload): Promise<AccountList> {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const response = await accountListService.update(id, payload, authStore.token ?? undefined)
      const account = normalizeAccount(Array.isArray(response.data) ? response.data[0] : response.data)
      currentAccount.value = account

      const index = accounts.value.findIndex((entry) => accountMatches(entry, id))
      if (index !== -1) accounts.value[index] = account

      return account
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to update account'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function deleteAccount(id: AccountListKey): Promise<void> {
    loading.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      await accountListService.delete(id, authStore.token ?? undefined)
      accounts.value = accounts.value.filter((entry) => !accountMatches(entry, id))
      if (currentAccount.value && accountMatches(currentAccount.value, id)) currentAccount.value = null
      pagination.value.total = Math.max(0, pagination.value.total - 1)
      pagination.value.count = accounts.value.length
    } catch (err) {
      const apiErr = err as ApiError
      error.value = apiErr.message || 'Failed to delete account'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function getAccountBalance(id: AccountListKey, trackError = true): Promise<AccountBalance> {
    try {
      const authStore = useAuthStore()
      const response = await accountListService.getBalance(id, authStore.token ?? undefined)
      const raw = Array.isArray(response.data) ? response.data[0] : response.data
      if (!raw) throw new Error('No account balance returned')
      return normalizeBalance(raw)
    } catch (err) {
      const apiErr = err as ApiError
      if (trackError) error.value = apiErr.message || 'Failed to fetch account balance'
      throw err
    }
  }

  async function fetchAccountBalances(
    page = 1,
    perPage = pagination.value.perPage,
    search = filters.value.search,
  ): Promise<AccountBalance[]> {
    accountBalances.value = []
    await fetchAccounts(page, perPage, search)

    const rows = await Promise.all(
      accounts.value.map(async (account) => {
        if (typeof account.current_balance === 'number') {
          return accountToBalance(account, account.current_balance)
        }

        try {
          const balance = await getAccountBalance(accountKey(account), false)
          return {
            id: account.id,
            uuid: account.uuid,
            account_name: balance.account_name || account.account_name,
            account_number: balance.account_number || account.account_number,
            current_balance: balance.current_balance,
            initial_balance: balance.initial_balance || account.initial_balance,
            branch_code: balance.branch_code || account.branch_code,
            bank_branch: balance.bank_branch || account.bank_branch,
          }
        } catch {
          return accountToBalance(account)
        }
      }),
    )

    accountBalances.value = rows
    return rows
  }

  function setSearch(search: string) {
    filters.value.search = search
    pagination.value.currentPage = 1
  }

  function clearError() {
    error.value = null
  }

  return {
    accounts,
    accountBalances,
    currentAccount,
    loading,
    error,
    pagination,
    filters,
    accountCount,
    hasAccounts,
    fetchAccounts,
    fetchAccountById,
    createAccount,
    updateAccount,
    deleteAccount,
    getAccountBalance,
    fetchAccountBalances,
    setSearch,
    clearError,
  }
})

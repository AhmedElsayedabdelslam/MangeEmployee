import type { ApiResponse } from '~/types/api'
import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'
import type {
  AccountListItem,
  CreateTransferBalancePayload,
  PaymentTypeListItem,
  TransferBalance,
  TransferBalanceListResponse,
  TransferBalanceResponse,
  UpdateTransferBalancePayload,
} from '~/types/transferBalance'

export type { TransferBalance }

function resolveUrl(path: string): string {
  const config = useRuntimeConfig()
  const base = config.public.apiUrl || 'http://127.0.0.1:8001/api'
  return `${base}${path}`
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }
}

function toNumber(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.replace(/,/g, ''))
        : Number(value)

  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeAccount(raw: unknown): AccountListItem {
  const entry = (raw ?? {}) as Record<string, unknown>

  return {
    id: toNumber(entry.id),
    account_name: String(entry.account_name ?? ''),
    account_number: String(entry.account_number ?? ''),
    initial_balance: toNumber(entry.initial_balance),
    current_balance: entry.current_balance != null ? toNumber(entry.current_balance) : undefined,
    branch_code: String(entry.branch_code ?? ''),
    bank_branch: String(entry.bank_branch ?? ''),
  }
}

function normalizePaymentType(raw: unknown): PaymentTypeListItem {
  const entry = (raw ?? {}) as Record<string, unknown>

  return {
    id: toNumber(entry.id),
    name: String(entry.name ?? ''),
  }
}

function normalizeListData(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw

  const entry = (raw ?? {}) as Record<string, unknown>
  if (Array.isArray(entry.data)) return entry.data

  return []
}

function toApiPayload(data: CreateTransferBalancePayload | UpdateTransferBalancePayload) {
  const transferDate = data.transfer_date?.trim()

  return {
    from_account_id: data.from_account_id,
    to_account_id: data.to_account_id,
    payment_type_id: data.payment_type_id,
    referal_id: data.referal_id != null ? String(data.referal_id) : undefined,
    date: transferDate,
    transfer_date: transferDate,
    amount: data.amount,
    description: data.description?.trim() || undefined,
  }
}

async function handleError(response: Response, fallback: string): Promise<never> {
  const err = await response.json().catch(() => ({}))
  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      window.location.href = '/login'
    }
    throw createApiError('Session expired. Please log in again.', 401, err)
  }

  const msg =
    (err as { message?: string }).message ||
    ((err as { errors?: Record<string, string[]> }).errors &&
      Object.values((err as { errors?: Record<string, string[]> }).errors ?? {}).flat()[0]) ||
    fallback

  throw createApiError(msg, response.status, err)
}

function normalizeTransferBalance(raw: any): TransferBalance {
  const safeRaw = raw ?? {}

  return {
    id: Number.isFinite(safeRaw.id) ? safeRaw.id : Number.parseInt(String(safeRaw.id ?? 0), 10) || 0,
    uuid: String(safeRaw.uuid ?? safeRaw.id ?? ''),
    from_account_id: toNumber(safeRaw.from_account_id ?? safeRaw.from_account?.id),
    from_account_name: String(
      safeRaw.from_account_name ?? safeRaw.from_account?.account_name ?? '',
    ),
    to_account_id: toNumber(safeRaw.to_account_id ?? safeRaw.to_account?.id),
    to_account_name: String(
      safeRaw.to_account_name ?? safeRaw.to_account?.account_name ?? '',
    ),
    payment_type_id: toNumber(safeRaw.payment_type_id ?? safeRaw.payment_type?.id) || undefined,
    payment_type_name: String(safeRaw.payment_type_name ?? safeRaw.payment_type?.name ?? ''),
    referal_id:
      safeRaw.referal_id != null || safeRaw.referral_id != null
        ? String(safeRaw.referal_id ?? safeRaw.referral_id)
        : undefined,
    transfer_date: String(safeRaw.transfer_date ?? safeRaw.date ?? ''),
    amount: Number(safeRaw.amount ?? 0) || 0,
    description:
      safeRaw.description != null && String(safeRaw.description).trim() !== ''
        ? String(safeRaw.description)
        : undefined,
    created_by:
      safeRaw.created_by != null && String(safeRaw.created_by).trim() !== ''
        ? String(safeRaw.created_by)
        : undefined,
    processed_at:
      safeRaw.processed_at != null && String(safeRaw.processed_at).trim() !== ''
        ? String(safeRaw.processed_at)
        : undefined,
    status:
      safeRaw.status != null && String(safeRaw.status).trim() !== ''
        ? String(safeRaw.status)
        : undefined,
    created_at:
      safeRaw.created_at != null && String(safeRaw.created_at).trim() !== ''
        ? String(safeRaw.created_at)
        : undefined,
    updated_at:
      safeRaw.updated_at != null && String(safeRaw.updated_at).trim() !== ''
        ? String(safeRaw.updated_at)
        : undefined,
  }
}

export const transferBalanceService = {
  async getAllTransferBalances(
    page = 1,
    perPage = 10,
    search = '',
    orderBy = 'id',
    order: 'asc' | 'desc' = 'desc',
    token?: string,
  ): Promise<TransferBalanceListResponse> {
    requireLoadedPermission('transfer-balance-list')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      order_by: orderBy,
      order,
    })
    if (search.trim()) params.set('search', search.trim())

    const response = await fetch(`${resolveUrl('/transfer-balances')}?${params.toString()}`, {
      method: 'GET',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to fetch transfer balances')

    const json = await response.json()
    if (Array.isArray(json.data)) {
      json.data = json.data.map(normalizeTransferBalance)
    } else {
      json.data = []
    }
    return json
  },

  async getTransferBalanceById(uuid: string, token?: string): Promise<TransferBalanceResponse> {
    requireLoadedPermission('transfer-balance-show')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/transfer-balances/${uuid}`), {
      method: 'GET',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to fetch transfer balance')
    const json = await response.json()
    json.data = normalizeTransferBalance(json.data)
    return json
  },

  async createTransferBalance(
    data: CreateTransferBalancePayload,
    token?: string,
  ): Promise<TransferBalanceResponse> {
    requireLoadedPermission('transfer-balance-create')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl('/transfer-balances'), {
      method: 'POST',
      headers: headers(authToken),
      body: JSON.stringify(toApiPayload(data)),
    })

    if (!response.ok) await handleError(response, 'Failed to create transfer balance')
    const json = await response.json()
    json.data = normalizeTransferBalance(json.data)
    return json
  },
  async cancelTransferBalance(
      uuid: string,
      token?: string,
    ): Promise<TransferBalanceResponse> {
      requireLoadedPermission('transfer-balance-cancel')

      const authToken = token || getAuthToken()
      console.log(authToken)

      if (!authToken) {
        throw new Error('Authentication required')
      }

      const response = await fetch(
        resolveUrl(`/cancel-transfer-balance/${uuid}`),
        {
          method: 'GET',
          headers: headers(authToken),
        },
      )

      if (!response.ok) {
        await handleError(response, 'Failed to cancel transfer balance')
      }

      const json = await response.json()
      json.data = normalizeTransferBalance(json.data)

      return json
    },

  async updateTransferBalance(
    uuid: string,
    data: UpdateTransferBalancePayload,
    token?: string,
  ): Promise<TransferBalanceResponse> {
    requireLoadedPermission('transfer-balance-edit')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/transfer-balances/${uuid}`), {
      method: 'PUT',
      headers: headers(authToken),
      body: JSON.stringify(toApiPayload(data)),
    })

    if (!response.ok) await handleError(response, 'Failed to update transfer balance')
    const json = await response.json()
    json.data = normalizeTransferBalance(json.data)
    return json
  },

  async deleteTransferBalance(uuid: string, token?: string): Promise<ApiResponse<null>> {
    requireLoadedPermission('transfer-balance-delete')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(resolveUrl(`/transfer-balances/${uuid}`), {
      method: 'DELETE',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to delete transfer balance')
    return response.json()
  },

  async getAccountList(token?: string): Promise<{ success: boolean; data: AccountListItem[] }> {
    requireLoadedPermission('accountlist-list')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const params = new URLSearchParams({ per_page: '1000' })
    const response = await fetch(`${resolveUrl('/account-lists')}?${params.toString()}`, {
      method: 'GET',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to fetch account list')

    const json = await response.json()
    const raw = Array.isArray(json) ? json : normalizeListData(json.data)
    return {
      success: true,
      data: Array.isArray(raw) ? raw.map(normalizeAccount) : [],
    }
  },

  async getPaymentTypeList(token?: string): Promise<{ success: boolean; data: PaymentTypeListItem[] }> {
    requireLoadedPermission('payment-type-list')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const params = new URLSearchParams({ per_page: '1000' })
    const response = await fetch(`${resolveUrl('/payment-types')}?${params.toString()}`, {
      method: 'GET',
      headers: headers(authToken),
    })

    if (!response.ok) await handleError(response, 'Failed to fetch payment type list')

    const json = await response.json()
    const raw = Array.isArray(json) ? json : normalizeListData(json.data)
    return {
      success: true,
      data: Array.isArray(raw) ? raw.map(normalizePaymentType) : [],
    }
  },
}

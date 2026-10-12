import { useAuthStore } from '~/stores/auth'
import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'

export interface BackendNotificationPayload {
  id?: string | number
  type?: string
  title?: string
  message?: string
  body?: string
  event_type?: string
  manager_name?: string
  /** Laravel database-notification nested fields (standard Laravel shape). */
  data?: Record<string, unknown> | string | null
  /** Custom REST API nested fields used by this backend (meta_data key). */
  meta_data?: Record<string, unknown> | string | null
  read?: boolean | number | string
  read_at?: string | null
  created_at?: string
  updated_at?: string
  leave_id?: string | number
  employee_name?: string
  link?: string
  url?: string
  [key: string]: unknown
}

function getBaseUrl() {
  const config = useRuntimeConfig()
  return String(config.public.apiUrl || 'http://127.0.0.1:8000/api').replace(/\/$/, '')
}

function getAuthToken(): string {
  const authStore = useAuthStore()

  if (!authStore.token && process.client) {
    authStore.init()
  }

  if (!authStore.token) {
    throw createApiError('Authentication required', 401)
  }

  return authStore.token
}

async function parseResponse(response: Response) {
  if (response.status === 204) return null

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return null

  return response.json()
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })

  const payload = await parseResponse(response)

  if (!response.ok) {
    const message = payload?.message || response.statusText || 'Notification request failed'
    throw createApiError(message, response.status, payload)
  }

  return payload as T
}

export const notificationService = {
  getNotifications() {
    requireLoadedPermission('notification-list')
    return request<unknown>('/notifications', {
      method: 'GET'
    })
  },

  markAsRead(id: string) {
    requireLoadedPermission('notification-mark-as-read')
    return request<unknown>(`/notifications/${encodeURIComponent(id)}/read`, {
      method: 'GET'
    })
  },

  markAllAsRead() {
    requireLoadedPermission('notification-mark-all-as-read')
    return request<unknown>('/notifications/read-all', {
      method: 'GET'
    })
  },

  deleteNotification(id: string) {
    requireLoadedPermission('notification-delete')
    return request<unknown>(`/notifications/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })
  }
}

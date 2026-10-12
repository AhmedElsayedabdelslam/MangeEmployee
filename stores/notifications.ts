import { defineStore } from 'pinia'
import { useNotification } from '~/composables/useNotification'
import { useDebug } from '~/composables/useDebug'
import { notificationService, type BackendNotificationPayload } from '~/services/notificationService'
import { useAuthStore } from '~/stores/auth'
import { hasLoadedPermission } from '~/utils/permissionAccess'

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error'

export type KnownNotificationType =
  | 'LeaveCreatedNotification'
  | 'PayrollProcessed'
  | 'SLAWarning'
  | 'DocumentUploaded'
  | 'MeetingReminder'
  | 'ExpenseReview'
  | 'SyncFailed'

export type NotificationType = KnownNotificationType | (string & {})

export interface AppNotification {
  id: string
  type: NotificationType
  /** Short class name extracted from the fully-qualified PHP type, e.g. "LeaveCreatedNotification" */
  shortType: string
  leave_id?: string | number
  employee_name?: string
  /** Resolved human-readable title ("New Leave Request"). Never falls back to the class name. */
  title: string
  /** Resolved body text (the full human-readable sentence). */
  message: string
  /** Alias of message; kept for template fallback chains. */
  body: string
  /** Resolved event category, e.g. "leave". */
  event_type?: string
  /** Who triggered the action (e.g. "BranchManager usa"). Shown in the metadata row. */
  manager_name?: string
  read: boolean
  created_at: string
  read_at: string | null
  /** In-app navigation target; derived from leave_id when available */
  link?: string
  data: Record<string, unknown>
}

interface NotificationDisplay {
  severity: NotificationSeverity
  icon: string
  iconClass: string
}

const defaultDisplay: NotificationDisplay = {
  severity: 'info',
  icon: 'i-lucide-bell',
  iconClass: 'bg-[#9777FA]/10 text-[#9777FA]'
}

const notificationDisplayMap: Record<KnownNotificationType, NotificationDisplay> = {
  LeaveCreatedNotification: {
    severity: 'info',
    icon: 'i-lucide-calendar-check',
    iconClass: 'bg-[#9777FA]/10 text-[#9777FA]'
  },
  PayrollProcessed: {
    severity: 'success',
    icon: 'i-lucide-check-circle',
    iconClass: 'bg-emerald-100 text-emerald-600'
  },
  SLAWarning: {
    severity: 'warning',
    icon: 'i-lucide-alert-circle',
    iconClass: 'bg-amber-100 text-amber-600'
  },
  DocumentUploaded: {
    severity: 'success',
    icon: 'i-lucide-file-check',
    iconClass: 'bg-emerald-100 text-emerald-600'
  },
  MeetingReminder: {
    severity: 'info',
    icon: 'i-lucide-calendar-clock',
    iconClass: 'bg-[#9777FA]/10 text-[#9777FA]'
  },
  ExpenseReview: {
    severity: 'warning',
    icon: 'i-lucide-alert-circle',
    iconClass: 'bg-amber-100 text-amber-600'
  },
  SyncFailed: {
    severity: 'error',
    icon: 'i-lucide-x-circle',
    iconClass: 'bg-red-100 text-red-600'
  }
}

function isKnownType(type: string): type is KnownNotificationType {
  return Object.prototype.hasOwnProperty.call(notificationDisplayMap, type)
}

export function getNotificationDisplay(type: string): NotificationDisplay {
  return isKnownType(type) ? notificationDisplayMap[type] : defaultDisplay
}

/**
 * Extract the short PHP class name from a fully-qualified type string.
 * "App\\Notifications\\LeaveCreatedNotification" → "LeaveCreatedNotification"
 */
export function extractShortType(type: unknown): string {
  if (typeof type !== 'string' || !type.trim()) return 'Notification'
  return type.trim().split('\\').pop() || type.trim()
}

/**
 * Convert backend date strings like "2026-06-21 11:57" (space separator) to
 * ISO-8601 "2026-06-21T11:57:00" so `new Date()` parses them across all
 * browsers (Safari rejects the space format).
 */
export function normalizeCreatedAt(value: string): string {
  if (!value) return value
  if (value.includes('T') || value.includes('Z')) return value
  return value.replace(' ', 'T')
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

type NotificationAuthSnapshot = {
  token: string
  userId: string
}

function getNotificationAuthSnapshot(): NotificationAuthSnapshot | null {
  const authStore = useAuthStore()
  if (!authStore.token || authStore.user?.id == null) return null

  return {
    token: authStore.token,
    userId: String(authStore.user.id),
  }
}

function isCurrentNotificationIdentity(snapshot: NotificationAuthSnapshot): boolean {
  const authStore = useAuthStore()
  return authStore.token === snapshot.token &&
    String(authStore.user?.id ?? '') === snapshot.userId
}

/**
 * Safely parse the `data` field that can arrive as a JSON string or a plain
 * object (REST API wraps notification fields inside a nested `data` object).
 */
function parseNotificationData(data: unknown): Record<string, unknown> {
  if (!data) return {}

  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    }
    catch {
      return {}
    }
  }

  if (typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }

  return {}
}

/**
 * Return the first non-empty string / number value from the provided list.
 * Useful when the same field can exist at the top level (WebSocket) or
 * nested inside `data` (REST API).
 */
function getFirstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return ''
}

/** Return the first defined, non-null, non-empty value. */
function getFirstValue<T = unknown>(...values: unknown[]): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value as T
  }
  return undefined
}

function buildLink(
  shortType: string,
  payload: BackendNotificationPayload,
  nestedData: Record<string, unknown> = {}
): string | undefined {
  const raw = (key: string) => payload[key] ?? nestedData[key]

  const employeeId = raw('employee_id') != null ? String(raw('employee_id')) : undefined
  const ticketId   = raw('ticket_id')   != null ? String(raw('ticket_id'))   : undefined
  const loanUuid   = raw('loan_uuid')   != null ? String(raw('loan_uuid'))   : undefined

  switch (shortType) {
    case 'LeaveCreatedNotification':
      return '/timesheet/leave'

    case 'PayrollProcessed':
      return '/payroll/payslip'

    case 'DocumentUploaded':
      return employeeId ? `/employees/${employeeId}/documents` : '/employees'

    case 'MeetingReminder':
      return '/meeting'

    case 'ExpenseReview':
      return '/finance/account-list'

    default:
      if (ticketId)   return `/tickets/${ticketId}`
      if (loanUuid)   return `/payroll/loans/${loanUuid}`
      if (employeeId) return `/employees/${employeeId}`
      return undefined
  }
}

/**
 * Human-readable default titles keyed by the short PHP class name.
 * Used when the backend does not supply a title (e.g. meta_data.title is null).
 */
const defaultTitleByType: Record<string, string> = {
  LeaveCreatedNotification: 'New Leave Request',
  PayrollProcessed:         'Payroll Processed',
  DocumentUploaded:         'Document Uploaded',
  MeetingReminder:          'Meeting Reminder',
  ExpenseReview:            'Expense Review',
  SyncFailed:               'Sync Failed',
  SLAWarning:               'SLA Warning',
}

/**
 * Map a raw backend payload to an AppNotification.
 *
 * Three source shapes are handled transparently:
 *
 *  WebSocket (BroadcastNotificationCreated):
 *    { title, body, leave_id, manager_name, event_type, id, type }
 *
 *  REST API – standard Laravel shape:
 *    { id, type, read_at, created_at, data: { title, body, … } }
 *
 *  REST API – this backend's custom shape:
 *    { id, type, read_at, created_at, meta_data: { title, body, leave_id, manager_name, employee_name, … } }
 */
export function mapBackendNotification(payload: BackendNotificationPayload): AppNotification {
  const id = String(payload.id ?? `notification-${Date.now()}`)
  const shortType = extractShortType(payload.type)

  // Merge both nested containers so we never miss a field regardless of which key the backend uses.
  const nestedData: Record<string, unknown> = {
    ...parseNotificationData(payload.data),
    ...parseNotificationData(payload.meta_data),
  }

  // ── Field resolution ──────────────────────────────────────────────────────

  const managerName = getFirstString(
    payload.manager_name,
    nestedData.manager_name,
  ) || undefined

  const employeeName = getFirstString(
    payload.employee_name,
    nestedData.employee_name,
  ) || undefined

  const leaveId = getFirstValue<string | number>(
    payload.leave_id,
    nestedData.leave_id,
  )

  const eventType = getFirstString(
    payload.event_type,
    nestedData.event_type,
  ) 

  // Title: top-level → nested → type-aware default → short class name.
  const title = getFirstString(
    payload.title,
    nestedData.title,
  ) || defaultTitleByType[shortType] || shortType

  // Message: prefer explicit keys; build a sentence as last resort.
  const message = getFirstString(
    payload.message,
    payload.body,
    nestedData.message,
    nestedData.body,
  ) || (
    managerName && employeeName && leaveId
      ? `${managerName} Create new leave for employee ${employeeName} (#${leaveId}).`
      : ''
  )

  // ── Dates ─────────────────────────────────────────────────────────────────

  const rawCreatedAt =
    typeof payload.created_at === 'string' && payload.created_at
      ? payload.created_at
      : new Date().toISOString()
  const createdAt = normalizeCreatedAt(rawCreatedAt)

  const rawReadAt =
    typeof payload.read_at === 'string' && payload.read_at ? payload.read_at : null
  const readAt = rawReadAt ? normalizeCreatedAt(rawReadAt) : null
  const read = Boolean(readAt)

  const link = buildLink(shortType, payload, nestedData)

  const mapped: AppNotification = {
    id,
    type:          shortType as NotificationType,
    shortType,
    leave_id:      leaveId,
    employee_name: employeeName,
    manager_name:  managerName,
    event_type:    eventType,
    title,
    message,
    body:          message,
    read,
    created_at:    createdAt,
    read_at:       readAt,
    link,
    data: {
      ...nestedData,
      title,
      body:         message,
      message,
      leave_id:     leaveId,
      manager_name: managerName,
      employee_name: employeeName,
      event_type:   eventType,
    },
  }

  const debug = useDebug()
  if (debug.isDebugMode.value) {
    debug.log('Mapped backend notification', {
      rawPayload: payload,
      nestedData,
      mapped: {
        title: mapped.title,
        message: mapped.message,
        manager_name: mapped.manager_name,
        employee_name: mapped.employee_name,
        event_type: mapped.event_type,
        leave_id: mapped.leave_id
      }
    })
  }

  return mapped
}

function extractNotificationRows(response: unknown): BackendNotificationPayload[] {
  if (Array.isArray(response)) return response as BackendNotificationPayload[]
  if (!response || typeof response !== 'object') return []

  const raw = response as Record<string, unknown>
  const data = raw.data as unknown

  if (Array.isArray(raw.notifications)) return raw.notifications as BackendNotificationPayload[]
  if (Array.isArray(data)) return data as BackendNotificationPayload[]
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>
    if (Array.isArray(d.data)) return d.data as BackendNotificationPayload[]
    if (Array.isArray(d.notifications)) return d.notifications as BackendNotificationPayload[]
  }

  return []
}

function sortByNewest(notifications: AppNotification[]): AppNotification[] {
  return [...notifications].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))
}

export const useNotificationStore = defineStore('notifications', {
  state: () => ({
    notifications: [] as AppNotification[],
    isLoading: false,
    hasLoaded: false,
    error: null as string | null,
    readingIds: {} as Record<string, boolean>,
    deletingIds: {} as Record<string, boolean>,
    markAllLoading: false,
    requestGeneration: 0,
  }),

  getters: {
    sortedNotifications: (state): AppNotification[] => sortByNewest(state.notifications),

    recentNotifications(): AppNotification[] {
      return this.sortedNotifications.slice(0, 5)
    },

    unreadCount: (state): number => state.notifications.filter(n => !n.read).length,
    readCount:   (state): number => state.notifications.filter(n => n.read).length,
    totalCount:  (state): number => state.notifications.length,

    unreadNotifications(): AppNotification[] {
      return this.sortedNotifications.filter(n => !n.read)
    },

    readNotifications(): AppNotification[] {
      return this.sortedNotifications.filter(n => n.read)
    }
  },

  actions: {
    resetNotifications() {
      this.requestGeneration += 1
      this.notifications = []
      this.isLoading = false
      this.hasLoaded = false
      this.error = null
      this.readingIds = {}
      this.deletingIds = {}
      this.markAllLoading = false
    },

    async fetchNotifications(force = false) {
      if (!hasLoadedPermission('notification-list')) {
        this.resetNotifications()
        return
      }
      if (this.isLoading || (this.hasLoaded && !force)) return

      const authSnapshot = getNotificationAuthSnapshot()
      if (!authSnapshot) {
        this.resetNotifications()
        return
      }

      const debug = useDebug()
      const requestGeneration = this.requestGeneration

      this.isLoading = true
      this.error = null
      debug.log('Fetching notifications', { force })

      try {
        const response = await notificationService.getNotifications()
        if (
          requestGeneration !== this.requestGeneration ||
          !isCurrentNotificationIdentity(authSnapshot) ||
          !hasLoadedPermission('notification-list')
        ) {
          if (
            requestGeneration === this.requestGeneration &&
            !hasLoadedPermission('notification-list')
          ) {
            this.resetNotifications()
          }
          return
        }

        this.notifications = sortByNewest(
          extractNotificationRows(response).map(row => mapBackendNotification(row))
        )
        this.hasLoaded = true
        debug.info('Notifications fetched', { count: this.notifications.length })
      } catch (error) {
        if (
          requestGeneration !== this.requestGeneration ||
          !isCurrentNotificationIdentity(authSnapshot) ||
          !hasLoadedPermission('notification-list')
        ) {
          return
        }

        this.error = getErrorMessage(error, 'Failed to load notifications.')
        debug.error('Failed to fetch notifications', error)
        useNotification().error('Failed to load notifications', this.error)
      } finally {
        if (requestGeneration === this.requestGeneration) {
          this.isLoading = false
        }
      }
    },

    addNotification(notification: AppNotification, showToast = true) {
      if (!hasLoadedPermission('notification-list')) {
        this.resetNotifications()
        return
      }

      const debug = useDebug()
      const idx = this.notifications.findIndex(n => n.id === notification.id)
      if (idx >= 0) {
        this.notifications.splice(idx, 1, notification)
        debug.log('Notification replaced in store', {
          id: notification.id,
          title: notification.title
        })
      } else {
        this.notifications.unshift(notification)
        debug.log('Notification added to store', {
          id: notification.id,
          title: notification.title,
          showToast
        })
      }
      this.notifications = sortByNewest(this.notifications)

      if (showToast) {
        const display = getNotificationDisplay(notification.shortType)
        useNotification()[display.severity](notification.title, notification.message)
      }
    },

    addNotificationFromBackend(payload: BackendNotificationPayload, showToast = true) {
      if (!hasLoadedPermission('notification-list')) {
        this.resetNotifications()
        return
      }

      this.addNotification(mapBackendNotification(payload), showToast)
    },

    async markAsRead(id: string) {
      if (!hasLoadedPermission('notification-mark-as-read')) return

      const notification = this.notifications.find(n => n.id === id)
      if (!notification || notification.read || this.readingIds[id]) return

      const authSnapshot = getNotificationAuthSnapshot()
      if (!authSnapshot) return

      const debug = useDebug()
      const requestGeneration = this.requestGeneration

      this.readingIds[id] = true
      this.error = null
      debug.log('Marking notification as read', { id })

      try {
        await notificationService.markAsRead(id)
        if (
          requestGeneration !== this.requestGeneration ||
          !isCurrentNotificationIdentity(authSnapshot) ||
          !hasLoadedPermission('notification-mark-as-read')
        ) {
          return
        }

        notification.read = true
        notification.read_at = notification.read_at ?? new Date().toISOString()
        this.notifications = [...this.notifications]
        debug.info('Notification marked as read', { id })
      } catch (error) {
        if (
          requestGeneration !== this.requestGeneration ||
          !isCurrentNotificationIdentity(authSnapshot) ||
          !hasLoadedPermission('notification-mark-as-read')
        ) {
          return
        }

        this.error = getErrorMessage(error, 'Failed to mark notification as read.')
        debug.error('Failed to mark notification as read', { id, error })
        useNotification().error('Failed to mark notification as read', this.error)
      } finally {
        if (requestGeneration === this.requestGeneration) {
          delete this.readingIds[id]
        }
      }
    },

    async markAllAsRead() {
      if (!hasLoadedPermission('notification-mark-all-as-read')) return
      if (this.unreadCount === 0 || this.markAllLoading) return

      const authSnapshot = getNotificationAuthSnapshot()
      if (!authSnapshot) return

      const debug = useDebug()
      const requestGeneration = this.requestGeneration

      this.markAllLoading = true
      this.error = null
      debug.log('Marking all notifications as read', { unreadCount: this.unreadCount })

      try {
        await notificationService.markAllAsRead()
        if (
          requestGeneration !== this.requestGeneration ||
          !isCurrentNotificationIdentity(authSnapshot) ||
          !hasLoadedPermission('notification-mark-all-as-read')
        ) {
          return
        }

        const readAt = new Date().toISOString()
        this.notifications = this.notifications.map(n => ({
          ...n,
          read: true,
          read_at: n.read_at ?? readAt
        }))
        debug.info('All notifications marked as read')
      } catch (error) {
        if (
          requestGeneration !== this.requestGeneration ||
          !isCurrentNotificationIdentity(authSnapshot) ||
          !hasLoadedPermission('notification-mark-all-as-read')
        ) {
          return
        }

        this.error = getErrorMessage(error, 'Failed to mark all notifications as read.')
        debug.error('Failed to mark all notifications as read', error)
        useNotification().error('Failed to mark all notifications as read', this.error)
      } finally {
        if (requestGeneration === this.requestGeneration) {
          this.markAllLoading = false
        }
      }
    },

    async deleteNotification(id: string) {
      if (!hasLoadedPermission('notification-delete')) return
      if (this.deletingIds[id]) return

      const authSnapshot = getNotificationAuthSnapshot()
      if (!authSnapshot) return

      const debug = useDebug()
      const requestGeneration = this.requestGeneration

      this.deletingIds[id] = true
      this.error = null
      debug.log('Deleting notification', { id })

      try {
        await notificationService.deleteNotification(id)
        if (
          requestGeneration !== this.requestGeneration ||
          !isCurrentNotificationIdentity(authSnapshot) ||
          !hasLoadedPermission('notification-delete')
        ) {
          return
        }

        this.notifications = this.notifications.filter(n => n.id !== id)
        debug.info('Notification deleted', { id })
      } catch (error) {
        if (
          requestGeneration !== this.requestGeneration ||
          !isCurrentNotificationIdentity(authSnapshot) ||
          !hasLoadedPermission('notification-delete')
        ) {
          return
        }

        this.error = getErrorMessage(error, 'Failed to delete notification.')
        debug.error('Failed to delete notification', { id, error })
        useNotification().error('Failed to delete notification', this.error)
      } finally {
        if (requestGeneration === this.requestGeneration) {
          delete this.deletingIds[id]
        }
      }
    },

  }

})

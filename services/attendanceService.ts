import { createApiError } from '~/utils/apiError'
import {
  hasLoadedPermission,
  requireLoadedPermission
} from '~/utils/permissionAccess'

export type AttendanceApiResponse = unknown

export interface AttendanceSessionParams {
  employee_id?: number | string
  page?: number
  per_page?: number
}

function getBaseUrl(): string {
  const config = useRuntimeConfig()
  return String(config.public.apiUrl || 'http://127.0.0.1:8000/api').replace(/\/$/, '')
}

function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

function firstErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null

  const record = payload as Record<string, unknown>
  for (const key of ['message', 'error']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  const errors = record.errors
  if (errors && typeof errors === 'object') {
    for (const value of Object.values(errors as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (Array.isArray(value)) {
        const first = value.find((entry) => typeof entry === 'string' && entry.trim())
        if (typeof first === 'string') return first.trim()
      }
    }
  }

  return firstErrorMessage(record.data)
}

function requireAttendanceStatusPermission(): void {
  if (
    hasLoadedPermission('create-attendance-session') ||
    hasLoadedPermission('create-attendance-break')
  ) return

  throw createApiError(
    'You do not have permission to use attendance actions.',
    403,
    {
      permissions: ['create-attendance-session', 'create-attendance-break'],
      permissionMode: 'any',
      blockedBy: 'frontend-permission-guard'
    }
  )
}

async function request(
  endpoint: string,
  params: Record<string, number | string | undefined> | AttendanceSessionParams,
  fallbackMessage: string,
  token?: string
): Promise<AttendanceApiResponse> {
  const authToken = token?.trim() || getStoredAuthToken()
  if (!authToken) throw createApiError('Authentication required.', 401)

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    query.set(key, String(value))
  }

  const queryString = query.toString()
  const response = await fetch(`${getBaseUrl()}${endpoint}${queryString ? `?${queryString}` : ''}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  })

  const payload = await response.json().catch(() => ({}))
  const payloadRecord = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : null
  if (!response.ok || payloadRecord?.success === false) {
    const payloadStatus = Number(payloadRecord?.status_code)
    const status = Number.isInteger(payloadStatus) && payloadStatus >= 400
      ? payloadStatus
      : response.ok ? 422 : response.status
    throw createApiError(firstErrorMessage(payload) || fallbackMessage, status, payload)
  }

  return payload
}

export const attendanceService = {
  getSessionStatus(employeeId: number | string, token?: string) {
    // The Backend status dependency is auth-only; the Frontend only calls it
    // for users who can perform at least one attendance lifecycle action.
    requireAttendanceStatusPermission()
    return request(
      `/session-status/${encodeURIComponent(String(employeeId))}`,
      {},
      'Cannot load attendance session status.',
      token
    )
  },

  getAttendanceSessions(params: AttendanceSessionParams = {}, token?: string) {
    requireLoadedPermission('list-attendance-sessions')
    return request(
      '/attendance-sessions',
      params,
      'Failed to load attendance sessions.',
      token
    )
  },

  getBreakSessions(attendanceSessionId: number | string, token?: string) {
    requireLoadedPermission('list-attendance-breaks')
    return request(
      '/break-sessions',
      { attendance_session_id: attendanceSessionId },
      'Failed to load break sessions.',
      token
    )
  },

  checkIn(employeeId: number | string, token?: string) {
    requireLoadedPermission('create-attendance-session')
    return request('/check-in', { employee_id: employeeId }, 'Failed to check in.', token)
  },

  checkOut(employeeId: number | string, token?: string) {
    requireLoadedPermission('create-attendance-session')
    return request('/check-out', { employee_id: employeeId }, 'Failed to check out.', token)
  },

  startBreak(attendanceSessionId: number | string, token?: string) {
    requireLoadedPermission('create-attendance-break')
    return request(
      '/start-break',
      { attendance_session_id: attendanceSessionId },
      'Failed to start break.',
      token
    )
  },

  endBreak(attendanceSessionId: number | string, token?: string) {
    requireLoadedPermission('create-attendance-break')
    return request(
      '/end-break',
      { attendance_session_id: attendanceSessionId },
      'Failed to end break.',
      token
    )
  }
}

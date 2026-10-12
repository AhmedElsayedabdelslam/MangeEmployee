import type {
  ApproveAttendanceCorrectionPayload,
  CreateAttendanceCorrectionPayload,
  RejectAttendanceCorrectionPayload
} from '~/types/attendanceCorrection'
import { attendanceService } from '~/services/attendanceService'
import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'

type CorrectionApiMethod = 'GET' | 'POST'

function getBaseUrl(): string {
  const config = useRuntimeConfig()
  return String(config.public.apiUrl || 'http://127.0.0.1:8000/api').replace(/\/$/, '')
}

function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

function backendMessage(payload: unknown): string | null {
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
        const first = value.find(entry => typeof entry === 'string' && entry.trim())
        if (typeof first === 'string') return first.trim()
      }
    }
  }

  return backendMessage(record.data)
}

async function request(
  endpoint: string,
  method: CorrectionApiMethod,
  options: {
    params?: Record<string, unknown>
    payload?: unknown
    token?: string
    fallbackMessage: string
  }
): Promise<unknown> {
  const authToken = options.token?.trim() || getStoredAuthToken()
  if (!authToken) throw createApiError('Authentication required.', 401)

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value === undefined || value === null || String(value).trim() === '') continue
    query.set(key, String(value))
  }

  const queryString = query.toString()
  const response = await fetch(
    `${getBaseUrl()}${endpoint}${queryString ? `?${queryString}` : ''}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      ...(method === 'POST' ? { body: JSON.stringify(options.payload ?? {}) } : {})
    }
  )

  const payload = await response.json().catch(() => ({}))
  const payloadRecord = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : null
  if (!response.ok || payloadRecord?.success === false) {
    const payloadStatus = Number(payloadRecord?.status_code)
    const status = Number.isInteger(payloadStatus) && payloadStatus >= 400
      ? payloadStatus
      : response.ok ? 422 : response.status
    throw createApiError(backendMessage(payload) || options.fallbackMessage, status, payload)
  }

  return payload
}

export const attendanceCorrectionService = {
  listCorrections(params: Record<string, unknown> = {}, token?: string) {
    requireLoadedPermission('list-attendance-correction-request')
    return request('/attendance-corrections', 'GET', {
      params,
      token,
      fallbackMessage: 'Cannot load attendance correction requests.'
    })
  },

  showCorrection(uuid: string, token?: string) {
    requireLoadedPermission('show-attendance-correction-request')
    return request(`/attendance-correction/${encodeURIComponent(uuid)}`, 'GET', {
      token,
      fallbackMessage: 'Cannot load attendance correction details.'
    })
  },

  createCorrection(payload: CreateAttendanceCorrectionPayload, token?: string) {
    requireLoadedPermission('create-attendance-correction-request')
    return request('/create-attendance-correction', 'POST', {
      payload: {
        attendance_session_id: payload.attendance_session_id,
        check_in_at: payload.check_in_at,
        check_out_at: payload.check_out_at,
        breaks: payload.breaks.map(breakItem => ({
          id: breakItem.id,
          start_at: breakItem.start_at,
          end_at: breakItem.end_at
        })),
        reason: payload.reason.trim()
      },
      token,
      fallbackMessage: 'Failed to submit correction request.'
    })
  },

  rejectCorrection(payload: RejectAttendanceCorrectionPayload, token?: string) {
    requireLoadedPermission('reject-correction-request')
    const rejectionReason = (payload.rejection_reason ?? '').trim()

    // Backend transport assumptions stay here. The current frontend contract uses a JSON body
    // and the preferred rejection_reason field until the collection confirms otherwise.
    return request('/reject-attendance-correction', 'POST', {
      payload: {
        attendance_correction_id: payload.attendance_correction_id,
        rejection_reason: rejectionReason
      },
      token,
      fallbackMessage: 'Failed to reject correction request.'
    })
  },

  approveCorrection(payload: ApproveAttendanceCorrectionPayload, token?: string) {
    requireLoadedPermission('approve-correction-request')
    return request('/approve-attendance-correction', 'POST', {
      payload: {
        attendance_correction_id: payload.attendance_correction_id,
        review_note: payload.review_note ?? null
      },
      token,
      fallbackMessage: 'Failed to approve correction request.'
    })
  },

  getBreakSessions(attendanceSessionId: number | string, token?: string) {
    requireLoadedPermission('list-attendance-breaks')
    // Reuse the already-integrated attendance endpoint instead of duplicating its transport.
    return attendanceService.getBreakSessions(attendanceSessionId, token)
  }
}

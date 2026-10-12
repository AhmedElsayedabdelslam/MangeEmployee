import type { ApiResponse } from '~/types/api'
import { createApiError } from '~/utils/apiError'
import { requireLoadedPermission } from '~/utils/permissionAccess'

export type ScopeType = 'Company' | 'Department' | 'Employee'

export interface WorkingDay {
  id: number
  uuid: string
  scope_type: string
  scope_id: number
  day_of_week: number
  is_working: boolean
  // Per-day schedule fields (from em_working_days). All nullable/optional so old
  // records (which only carried day_of_week/is_working) keep normalizing cleanly.
  start_time?: string | null        // "HH:mm"
  end_time?: string | null          // "HH:mm"
  break_start_time?: string | null  // "HH:mm"
  break_end_time?: string | null    // "HH:mm"
  grace_period?: number | null      // minutes
  allow_overtime?: boolean | null
  pto_days?: number | null
  expires_at?: string | null
}

export interface WorkingDaysScopeEmployeeData {
  pto_days: number | null
  expires_at: string | null
}

export interface WorkingDaysScopeResponse {
  scope_id: number | null
  scope_type: ScopeType | string | null
  working_days: WorkingDay[]
  employee: WorkingDaysScopeEmployeeData | null
}

export interface WorkingDayScheduleInput {
  day: number
  start_time: string
  end_time: string
  grace_period: number
  break_duration: number | null
  allow_overtime: boolean
}

export interface WorkingDaySchedulePayload {
  day: number
  start_time: string
  end_time: string
  break_start_time: string | null
  break_end_time: string | null
  grace_period: number | null
  allow_overtime: boolean
}

export interface UpsertWorkingDaysPayload {
  scope_id: number
  scope_type: ScopeType
  working_days: WorkingDaySchedulePayload[]
  is_working: boolean
  pto_days?: number | null
  expires_at?: string | null
}

export interface WorkingDaysListParams {
  page?: number
  per_page?: number
  scope_type: ScopeType
}

export interface CreateWorkingDayPayload {
  scope_type: ScopeType
  scope_id: number
  day_of_week: number
  is_working: boolean | 0 | 1
  pto_days?: number | null
  expires_at?: string | null
}

export type UpdateWorkingDayPayload = Partial<CreateWorkingDayPayload>

export const DAY_NAME = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday'
} as const

export type DayNumber = keyof typeof DAY_NAME

const DAY_NAME_AR: Record<DayNumber, string> = {
  1: 'الاثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
  7: 'الأحد'
}

function getBaseUrl() {
  const config = useRuntimeConfig()
  return config.public.apiUrl || 'http://127.0.0.1:8000/api'
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function numericId(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/** Normalize a backend time ("HH:mm:ss" | "HH:mm" | Date-ish) to "HH:mm"; null if unparseable. */
export function normalizeTimeForInput(value: unknown): string {
  if (value == null) return ''
  const str = String(value).trim()
  if (!str) return ''
  const match = str.match(/(\d{1,2}):(\d{2})/)
  if (!match) return ''
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

function toHHmm(value: unknown): string | null {
  return normalizeTimeForInput(value) || null
}

function normalizeBoolean(value: unknown): boolean | null {
  if (value == null || value === '') return null
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  return null
}

function normalizeGracePeriod(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

/** "HH:mm" → minutes since midnight; null if unparseable. */
function hhmmToMinutes(value?: string | null): number | null {
  const hhmm = toHHmm(value)
  if (!hhmm) return null
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

/**
 * Convert a break window (start, end as "HH:mm") into a duration in minutes.
 * Returns null when the window is missing/invalid (i.e. "no break").
 */
export function breakWindowToDuration(start?: string | null, end?: string | null): number | null {
  const s = hhmmToMinutes(start)
  const e = hhmmToMinutes(end)
  if (s == null || e == null) return null
  const diff = e - s
  return diff > 0 ? diff : null
}

function normalizeWorkingDay(
  row: WorkingDay & Record<string, unknown>,
  parentScopeType?: ScopeType | string | null,
  parentScopeId?: number | null
): WorkingDay {
  const rawIsWorking = row.is_working as unknown
  const rawScope = row.scope && typeof row.scope === 'object' ? row.scope as Record<string, unknown> : null
  const rawScopeId = row.scope_id ?? rawScope?.id ?? parentScopeId ?? row.department_id ?? row.employee_id ?? row.company_id
  const dayNumber = normalizeDayNumber(row)  // accepts `day` or `day_of_week` (see normalizeDayNumber candidates)
  return {
    ...row,
    id: Number(row.id),
    uuid: String(row.uuid ?? row.id),
    scope_id: Number(rawScopeId),
    scope_type: normalizeScopeType(row.scope_type ?? rawScope?.type ?? parentScopeType),
    day_of_week: dayNumber,
    is_working: rawIsWorking === true || rawIsWorking === 1 || String(rawIsWorking).toLowerCase() === 'true',
    // Per-day schedule fields (times coerced to "HH:mm", grace→number, overtime→boolean).
    start_time: toHHmm(row.start_time),
    end_time: toHHmm(row.end_time),
    break_start_time: toHHmm(row.break_start_time),
    break_end_time: toHHmm(row.break_end_time),
    grace_period: normalizeGracePeriod(row.grace_period),
    allow_overtime: normalizeBoolean(row.allow_overtime),
    pto_days: row.pto_days == null ? null : Number(row.pto_days),
    expires_at: row.expires_at ?? null
  }
}

function serializeWorkingDayPayload<T extends Record<string, unknown>>(payload: T): T {
  if (!Object.prototype.hasOwnProperty.call(payload, 'is_working')) return payload
  const raw = payload.is_working
  return {
    ...payload,
    is_working: raw === true || raw === 1 || String(raw).toLowerCase() === 'true' ? 1 : 0
  }
}

function normalizeDayNumber(row: Record<string, unknown>): number {
  const rawDayObject = row.day_of_week && typeof row.day_of_week === 'object'
    ? row.day_of_week as Record<string, unknown>
    : null
  const candidates = [
    row.day_of_week_raw,  // explicit numeric field returned by this API
    row.day_of_week,
    rawDayObject?.id,
    rawDayObject?.value,
    rawDayObject?.number,
    rawDayObject?.name,
    row.day,
    row.day_number,
    row.day_name,
    row.dayName,
    row.name
  ]

  for (const value of candidates) {
    if (value == null || String(value).trim() === '') continue

    const numeric = Number(value)
    if (Number.isInteger(numeric)) {
      if (numeric === 0) return 7
      if (DAY_NAME[numeric as DayNumber]) return numeric
    }

    const named = dayNameToNumber(String(value ?? ''))
    if (named != null) return named
  }

  return 0
}

function normalizeScopeType(value: unknown): string {
  const normalized = String(value ?? '').toLowerCase()
  if (normalized.includes('company')) return 'Company'
  if (normalized.includes('department')) return 'Department'
  if (normalized.includes('employee')) return 'Employee'
  return String(value ?? '')
}

function normalizeEmployeePto(value: unknown): WorkingDaysScopeEmployeeData | null {
  const raw = asRecord(value)
  if (!raw) return null
  const ptoDays = raw.pto_days == null || raw.pto_days === '' ? null : Number(raw.pto_days)
  return {
    pto_days: Number.isFinite(ptoDays) ? ptoDays : null,
    expires_at: typeof raw.expires_at === 'string' && raw.expires_at.trim() ? raw.expires_at : null
  }
}

function unwrapWorkingDaysScopeResponse(
  response: unknown,
  fallbackScopeType?: ScopeType,
  fallbackScopeId?: number
): WorkingDaysScopeResponse {
  const wrapper = asRecord(response)
  const data = wrapper && Object.prototype.hasOwnProperty.call(wrapper, 'data')
    ? wrapper.data
    : response

  if (Array.isArray(data)) {
    const workingDays = data.map((row) =>
      normalizeWorkingDay(row as WorkingDay & Record<string, unknown>, fallbackScopeType, fallbackScopeId ?? null)
    )
    return {
      scope_id: fallbackScopeId ?? workingDays[0]?.scope_id ?? null,
      scope_type: fallbackScopeType ?? workingDays[0]?.scope_type ?? null,
      working_days: workingDays,
      employee: null
    }
  }

  const raw = asRecord(data)
  if (!raw) {
    return {
      scope_id: fallbackScopeId ?? null,
      scope_type: fallbackScopeType ?? null,
      working_days: [],
      employee: null
    }
  }

  const scopeId = numericId(raw.scope_id) ?? fallbackScopeId ?? null
  const normalizedScopeType = normalizeScopeType(raw.scope_type ?? fallbackScopeType)
  const scopeType = normalizedScopeType || fallbackScopeType || null
  const rawWorkingDays = Array.isArray(raw.working_days)
    ? raw.working_days
    : Array.isArray(raw.data)
      ? raw.data
      : Array.isArray(raw.records)
        ? raw.records
        : []

  return {
    scope_id: scopeId,
    scope_type: scopeType,
    working_days: rawWorkingDays.map((row) =>
      normalizeWorkingDay(row as WorkingDay & Record<string, unknown>, scopeType, scopeId)
    ),
    employee: normalizeEmployeePto(raw.employee)
  }
}

function scopeMatches(record: WorkingDay, scopeType: ScopeType, scopeId?: number) {
  const typeMatches = normalizeScopeType(record.scope_type) === scopeType
  const idMatches = scopeId == null || Number(record.scope_id) === Number(scopeId)
  return typeMatches && idMatches
}

export function dayNameToNumber(dayName: string): number | null {
  const normalizedDayName = dayName.trim().toLowerCase()
  const entry = Object.entries(DAY_NAME).find(([, name]) => name.toLowerCase() === normalizedDayName)
  return entry ? Number(entry[0]) : null
}

export function formatWorkingDayError(err: unknown, selectedDayNumbers: number[] = [], scopeLabel = 'this scope'): string {
  const apiError = err as { errors?: Record<string, string[]>; message?: string }
  const fieldLabels: Record<string, string> = {
    start_time: 'Start time',
    end_time: 'End time',
    break_start_time: 'Break start time',
    break_end_time: 'Break end time',
    grace_period: 'Grace period',
    allow_overtime: 'Allow overtime',
    day: 'Day'
  }
  const workingDayMessages = Object.entries(apiError.errors ?? {})
    .map(([key, messages]) => {
      const match = key.match(/^working_days\.(\d+)\.([^.]+)$/)
      if (!match) return null
      const index = Number(match[1])
      const field = match[2] ?? ''
      const dayNumber = selectedDayNumbers[index]
      const dayLabel = dayNumber && DAY_NAME[dayNumber as DayNumber] ? DAY_NAME[dayNumber as DayNumber] : `Day ${index + 1}`
      const rawMessage = messages?.[0] || `${fieldLabels[field] ?? field} is invalid.`
      const readableMessage = rawMessage
        .replace(/^the working[_ ]days\.\d+\.[\w_]+ field/i, `${fieldLabels[field] ?? field} field`)
        .replace(/^the working[_ ]days\.\d+\.[\w_]+/i, fieldLabels[field] ?? field)
        .replace(/^the /i, '')
      return `${dayLabel}: ${readableMessage}`
    })
    .filter((message): message is string => Boolean(message))

  if (workingDayMessages.length > 0) {
    return workingDayMessages.join(' ')
  }

  const failedDays = Object.keys(apiError.errors ?? {})
    .map((key) => {
      const match = key.match(/^day_of_week\.(\d+)$/)
      if (!match) return null
      const backendValue = Number(match[1])
      const selectedDay = selectedDayNumbers[backendValue]
      const dayNumber = selectedDay && DAY_NAME[selectedDay as DayNumber] ? selectedDay : backendValue
      return DAY_NAME[dayNumber as DayNumber] ?? null
    })
    .filter((day): day is string => Boolean(day))

  if (failedDays.length > 0) {
    const uniqueDays = Array.from(new Set(failedDays))
    return `The following days are already configured for ${scopeLabel}: ${uniqueDays.join(', ')}.`
  }

  return apiError.message || 'Failed to update working days'
}

function normalizeWorkingDayList(data: unknown): WorkingDay[] {
  if (Array.isArray(data)) return data.map((row) => normalizeWorkingDay(row as WorkingDay & Record<string, unknown>))
  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray((data as { data?: { working_days?: unknown[] } }).data?.working_days)) {
    return unwrapWorkingDaysScopeResponse(data).working_days
  }
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown[] }).data)) {
    return ((data as { data: unknown[] }).data).map((row) => normalizeWorkingDay(row as WorkingDay & Record<string, unknown>))
  }
  if (data && typeof data === 'object' && Array.isArray((data as { working_days?: unknown[] }).working_days)) {
    return unwrapWorkingDaysScopeResponse(data).working_days
  }
  if (data && typeof data === 'object' && Array.isArray((data as { records?: unknown[] }).records)) {
    return ((data as { records: unknown[] }).records).map((row) => normalizeWorkingDay(row as WorkingDay & Record<string, unknown>))
  }
  if (data && typeof data === 'object') {
    return [normalizeWorkingDay(data as WorkingDay & Record<string, unknown>)]
  }
  return []
}

const FETCH_PER_PAGE = 100

async function fetchWorkingDayPages(scopeType: ScopeType | undefined, scopeId: number | undefined, token?: string): Promise<WorkingDay[]> {
  const all: WorkingDay[] = []
  let page = 1
  const maxPages = 50
  while (page <= maxPages) {
    const result = await workingDayService.getAll(scopeType, scopeId, page, token, FETCH_PER_PAGE)
    const data = normalizeWorkingDayList(result.data).map((record) => ({
      ...record,
      scope_type: record.scope_type || scopeType || ''
    }))
    all.push(...data)

    // Try to read pagination metadata from all possible locations:
    //   result.meta.pagination  (standard wrapper format)
    //   result.meta             (flat meta format)
    //   result.data             (Laravel paginator object returned directly as data)
    const dataMeta = (!Array.isArray(result.data) && result.data && typeof result.data === 'object')
      ? result.data as Record<string, unknown>
      : null
    const paginationObj = (result as any).meta?.pagination
    const flatMeta     = (result as any).meta
    const currentPage  = Number(paginationObj?.current_page ?? flatMeta?.current_page ?? dataMeta?.current_page ?? page)
    const lastPage     = Number(
      paginationObj?.last_page ??
      paginationObj?.total_pages ??
      flatMeta?.last_page ??
      flatMeta?.total_pages ??
      dataMeta?.last_page ??
      dataMeta?.total_pages ??
      0
    )
    const totalRecords = Number(paginationObj?.total ?? flatMeta?.total ?? dataMeta?.total ?? 0)

    // No records on this page → definitely done
    if (data.length === 0) break

    if (lastPage > 0 && currentPage >= lastPage) break
    if (lastPage > 0) {
      page++
      continue
    }
    if (totalRecords > 0 && all.length >= totalRecords) break

    // No pagination metadata available: fall back to the requested page size.
    if (data.length < FETCH_PER_PAGE) break
    page++
  }
  return all
}

export const workingDayService = {
  async getAll(scopeType?: ScopeType, scopeId?: number, page: number = 1, token?: string, perPage?: number): Promise<ApiResponse<WorkingDay[]>> {
    requireLoadedPermission('working-days-list')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const params = new URLSearchParams({ page: String(page) })
    if (perPage) params.set('per_page', String(perPage))
    if (scopeType) params.set('scope_type', scopeType)
    if (scopeId != null) params.set('scope_id', String(scopeId))

    const response = await fetch(`${getBaseUrl()}/working-days?${params}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to fetch working days', response.status, err)
    }
    const json = await response.json()
    if (Array.isArray(json.data)) json.data = normalizeWorkingDayList(json.data)
    return json
  },

  async getWorkingDaysByScope(scopeType: ScopeType, scopeId: number, token?: string): Promise<WorkingDaysScopeResponse> {
    requireLoadedPermission('working-days-show')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/working-days/${scopeType}/${scopeId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to fetch working days', response.status, err)
    }
    const json = await response.json()
    return unwrapWorkingDaysScopeResponse(json, scopeType, scopeId)
  },

  async getWorkingDaysList(params: WorkingDaysListParams, token?: string): Promise<WorkingDay[]> {
    const result = await this.getAll(
      params.scope_type,
      undefined,
      params.page ?? 1,
      token,
      params.per_page ?? FETCH_PER_PAGE
    )
    return normalizeWorkingDayList(result.data).filter((record) => scopeMatches(record, params.scope_type))
  },

  async getByUuid(uuid: string, token?: string): Promise<ApiResponse<WorkingDay>> {
    requireLoadedPermission('working-days-show')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/working-days/${uuid}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to fetch working day', response.status, err)
    }
    const json = await response.json()
    if (json.data) json.data = normalizeWorkingDay(json.data)
    return json
  },

  async create(payload: CreateWorkingDayPayload, token?: string): Promise<ApiResponse<WorkingDay>> {
    requireLoadedPermission('working-days-edit')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/working-days`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(serializeWorkingDayPayload(payload as unknown as Record<string, unknown>))
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to create working day', response.status, err)
    }
    const json = await response.json()
    if (json.data) json.data = normalizeWorkingDay(json.data)
    return json
  },

  async updateByUuid(uuid: string, payload: UpdateWorkingDayPayload, token?: string): Promise<ApiResponse<WorkingDay>> {
    requireLoadedPermission('working-days-delete')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/working-days/${uuid}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(serializeWorkingDayPayload(payload as unknown as Record<string, unknown>))
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to update working day', response.status, err)
    }
    const json = await response.json()
    if (json.data) json.data = normalizeWorkingDay(json.data)
    return json
  },

  async deleteByUuid(uuid: string, token?: string): Promise<ApiResponse<unknown>> {
    requireLoadedPermission('working-days-delete')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/working-days/${uuid}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to delete working day', response.status, err)
    }
    return response.json().catch(() => ({}))
  },

  async getByScopeType(scopeType: ScopeType, token?: string): Promise<WorkingDay[]> {
    return this.getAllByScopeType(scopeType, token)
  },

  async getAllByScopeType(scopeType: ScopeType, token?: string): Promise<WorkingDay[]> {
    const scoped = await fetchWorkingDayPages(scopeType, undefined, token)
    if (scoped.length > 0) return scoped.filter((record) => scopeMatches(record, scopeType))
    const all = await fetchWorkingDayPages(undefined, undefined, token)
    return all.filter((record) => scopeMatches(record, scopeType))
  },

  async getByScopeId(scopeType: ScopeType, scopeId: number, token?: string): Promise<WorkingDay[]> {
    try {
      const scoped = await this.getWorkingDaysByScope(scopeType, scopeId, token)
      if (scoped.working_days.length > 0) return scoped.working_days
    } catch (err: any) {
      if (err?.status && err.status !== 404) throw err
    }

    const scoped = await fetchWorkingDayPages(scopeType, scopeId, token)
    const scopedMatches = scoped.filter((record) => scopeMatches(record, scopeType, scopeId))
    if (scopedMatches.length > 0) return scopedMatches
    const all = await fetchWorkingDayPages(undefined, undefined, token)
    return all.filter((record) => scopeMatches(record, scopeType, scopeId))
  },

  async setWeekSchedule(
    scopeType: ScopeType,
    scopeId: number,
    workingDayNumbers: number[],
    token?: string
  ): Promise<WorkingDay[]> {
    return this.syncWorkingDayNumbers(scopeType, scopeId, workingDayNumbers, undefined, token)
  },

  /**
   * LEGACY bulk sync — POST /working-days with `day_of_week` as an array of day numbers.
   * Still used by Company & Department pages (which don't (yet) manage per-day hours).
   * For employee schedules with hours, use `upsertWorkingDaysWithHours`.
   */
  async syncWorkingDayNumbers(
    scopeType: ScopeType,
    scopeId: number,
    workingDayNumbers: number[],
    options?: { is_working?: boolean | 0 | 1; pto_days?: number | null; expires_at?: string | null },
    token?: string
  ): Promise<WorkingDay[]> {
    requireLoadedPermission('working-days-edit')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const body: Record<string, unknown> = {
      scope_type: scopeType,
      scope_id: scopeId,
      day_of_week: workingDayNumbers,
      is_working: options?.is_working ?? 1
    }
    if (options?.pto_days != null) body.pto_days = options.pto_days
    if (options?.expires_at != null) body.expires_at = options.expires_at

    const response = await fetch(`${getBaseUrl()}/working-days`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(serializeWorkingDayPayload(body))
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to sync working days', response.status, err)
    }
    const result = await response.json()
    const data = result.data
    return normalizeWorkingDayList(data)
  },

  /**
   * Legacy per-day sync retained for older callers that still send `break_duration`.
   * Employee working-hours edits use `upsertWorkingDaysWithHours`.
   */
  async syncWorkingDays(
    scopeType: ScopeType,
    scopeId: number,
    days: WorkingDayScheduleInput[],
    options?: { pto?: { pto_days?: number | null; expires_at?: string | null } | null },
    token?: string
  ): Promise<WorkingDay[]> {
    requireLoadedPermission('working-days-edit')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const working_days = days.map((d) => ({
      day: d.day,
      start_time: d.start_time,
      end_time: d.end_time,
      grace_period: d.grace_period,
      allow_overtime: d.allow_overtime,
      break_duration: d.break_duration
    }))

    const body: Record<string, unknown> = {
      scope_type: scopeType,
      scope_id: scopeId,
      working_days
    }

    if (options?.pto) {
      if (options.pto.pto_days != null) body.pto_days = options.pto.pto_days
      if (options.pto.expires_at != null) body.expires_at = options.pto.expires_at
    }

    const response = await fetch(`${getBaseUrl()}/working-days`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to sync working days', response.status, err)
    }
    const result = await response.json()
    return normalizeWorkingDayList(result.data)
  },

  async upsertWorkingDaysWithHours(
    payload: UpsertWorkingDaysPayload,
    token?: string
  ): Promise<WorkingDaysScopeResponse> {
    requireLoadedPermission('working-days-edit')
    const authToken = token || getAuthToken()
    if (!authToken) throw new Error('Authentication required')

    const response = await fetch(`${getBaseUrl()}/working-days`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw createApiError(err.message || 'Failed to update working days', response.status, err)
    }
    const result = await response.json()
    return unwrapWorkingDaysScopeResponse(result, payload.scope_type, payload.scope_id)
  },

  isDayWorking(dayNumber: number, records: WorkingDay[]): boolean {
    const match = records.find(r => r.day_of_week === dayNumber)
    return match ? match.is_working : false
  },

  getPTOData(records: WorkingDay[]): { pto_days: number | null; expires_at: string | null } {
    const first = records.find(r => r.pto_days != null)
    return {
      pto_days: first?.pto_days ?? null,
      expires_at: first?.expires_at ?? null
    }
  },

  toDayNameEn(day: number): string {
    return DAY_NAME[day as DayNumber] ?? ''
  },

  toDayNameAr(day: number): string {
    return DAY_NAME_AR[day as DayNumber] ?? ''
  }
}

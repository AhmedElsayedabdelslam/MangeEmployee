import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useLeaveStore } from '~/stores/leaves'
import { useAuthStore } from '~/stores/auth'
import { employeeService } from '~/services/employeeService'
import { leaveTypeService } from '~/services/leaveTypeService'
import type { Leave } from '~/types/leave'
import { hasLoadedPermission } from '~/utils/permissionAccess'

export type ReportType = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface EmployeeLeaveGroup {
  key: string
  employeeName: string
  employeeUuid: string
  approved: Leave[]
  rejected: Leave[]
  pending: Leave[]
}

export interface LeaveAnalytic {
  leaveTypeId: string
  leaveTypeTitle: string
  leaveType: string
  count: number
  totalDays: number
}

/** Parse dd-mm-yyyy or ISO yyyy-mm-dd into a Date */
function parseDateStr(s: string): Date | null {
  if (!s) return null
  const dmy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
    return isNaN(d.getTime()) ? null : d
  }
  const iso = new Date(s.split('T')[0]!)
  return isNaN(iso.getTime()) ? null : iso
}

function getDateRange(type: ReportType, year: number): [Date, Date] {
  const now = new Date()
  if (type === 'daily') {
    return [
      new Date(year, now.getMonth(), now.getDate(), 0, 0, 0, 0),
      new Date(year, now.getMonth(), now.getDate(), 23, 59, 59, 999)
    ]
  }
  if (type === 'weekly') {
    const dow = now.getDay()
    const diff = dow === 0 ? -6 : 1 - dow
    const mon = new Date(year, now.getMonth(), now.getDate() + diff)
    mon.setHours(0, 0, 0, 0)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    sun.setHours(23, 59, 59, 999)
    return [mon, sun]
  }
  if (type === 'monthly') {
    return [
      new Date(year, now.getMonth(), 1, 0, 0, 0, 0),
      new Date(year, now.getMonth() + 1, 0, 23, 59, 59, 999)
    ]
  }
  return [
    new Date(year, 0, 1, 0, 0, 0, 0),
    new Date(year, 11, 31, 23, 59, 59, 999)
  ]
}

export const useLeaveReportStore = defineStore('leaveReport', () => {
  const leaveStore = useLeaveStore()
  const authStore = useAuthStore()

  const loading = ref(false)
  const error = ref<string | null>(null)

  const reportType = ref<ReportType>('yearly')
  const selectedYear = ref(new Date().getFullYear())
  const selectedBranchId = ref<string | null>(null)
  const selectedDepartmentId = ref<string | null>(null)

  /** id (string) → employee name */
  const employeeMap = ref(new Map<string, string>())
  const employeeOrgMap = ref(new Map<string, { branchIds: string[]; departmentIds: string[] }>())
  /** id (string) → leave type title */
  const leaveTypeMap = ref(new Map<string, string>())
  /** id (string) → leave type annual days (used as fallback when no employee-specific balance) */
  const leaveTypeDaysMap = ref(new Map<string, number>())

  /** Resolve employee name: prefer lookup map, fall back to what the API mapping already provided */
  function resolveEmployeeName(leave: Leave): string {
    const byId = employeeMap.value.get(String(leave.employeeId))
    if (byId) return byId
    // If the stored name is a fallback placeholder, try to derive a better one
    if (leave.employee && !leave.employee.startsWith('Employee #')) return leave.employee
    return leave.employee || `Employee #${leave.employeeId}`
  }

  /** Resolve leave type title: prefer lookup map, fall back to what the API mapping provided */
  function resolveLeaveTypeName(leave: Leave): string {
    return leave.leaveTypeTitle || leave.leaveType || `Leave Type #${leave.leaveTypeId}`
  }
 const filteredLeaves = computed<Leave[]>(() => {
  const [start, end] = getDateRange(reportType.value, selectedYear.value)
  const branchFilter = selectedBranchId.value
  const departmentFilter = selectedDepartmentId.value

  return leaveStore.leaves.filter(leave => {
    const d = parseDateStr(leave.startDate)
    if (!d || d < start || d > end) return false

   if (branchFilter || departmentFilter) {
      const org = employeeOrgMap.value.get(String(leave.employeeId))
      if (!org) return false
      if (branchFilter && !org.branchIds.includes(String(branchFilter))) return false
      if (departmentFilter && !org.departmentIds.includes(String(departmentFilter))) return false
    }

    return true
  })
})

  const approvedLeaves = computed(() => filteredLeaves.value.filter(l => l.status === 'Approved'))
  const rejectedLeaves = computed(() => filteredLeaves.value.filter(l => l.status === 'Rejected'))
  const pendingLeaves  = computed(() => filteredLeaves.value.filter(l => l.status === 'Pending'))

  // const groupedByEmployee = computed<EmployeeLeaveGroup[]>(() => {
  //   const map = new Map<string, EmployeeLeaveGroup>()
  //   for (const leave of filteredLeaves.value) {
  //     const key = leave.employeeId || leave.id
  //     if (!map.has(key)) {
  //       map.set(key, {
  //         key,
  //         employeeName: resolveEmployeeName(leave),
  //         approved: [],
  //         rejected: [],
  //         pending: []
  //       })
  //     }
  //     const g = map.get(key)!
  //     if (leave.status === 'Approved') g.approved.push(leave)
  //     else if (leave.status === 'Rejected') g.rejected.push(leave)
  //     else if (leave.status === 'Pending') g.pending.push(leave)
  //   }
  //   return Array.from(map.values()).sort((a, b) =>
  //     a.employeeName.localeCompare(b.employeeName)
  //   )
  // })
const groupedByEmployee = computed<EmployeeLeaveGroup[]>(() => {
  const map = new Map<string, EmployeeLeaveGroup>()

  for (const leave of filteredLeaves.value) {
    const employeeId = String(leave.employeeId)
    const employeeUuid = String(leave.employeeUuid)

    const key = employeeId || String(leave.id)

    if (!map.has(key)) {
      map.set(key, {
        key,
        employeeUuid: employeeUuid,
        employeeName: resolveEmployeeName(leave),
        approved: [],
        rejected: [],
        pending: [],
      })
    }

    const g = map.get(key)!

    if (leave.status === 'Approved') {
      g.approved.push(leave)
    } else if (leave.status === 'Rejected') {
      g.rejected.push(leave)
    } else if (leave.status === 'Pending') {
      g.pending.push(leave)
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName)
  )
})

  /** Group by leave type ID so duplicate types merge correctly, resolve the title via map */
  function buildAnalytics(leaves: Leave[]): LeaveAnalytic[] {
    const map = new Map<string, LeaveAnalytic>()
    for (const l of leaves) {
      const typeId = String(l.leaveTypeId)
      const resolvedType = resolveLeaveTypeName(l)
      if (!map.has(typeId)) {
        map.set(typeId, { 
          leaveTypeId: typeId, 
          leaveTypeTitle: resolvedType,
          leaveType: resolvedType, 
          count: 0, 
          totalDays: 0 
        })
      }
      const entry = map.get(typeId)!
      entry.count++
      entry.totalDays += l.totalDays ?? 0
    }
    return Array.from(map.values())
  }

  async function loadLookupMaps(token: string) {
    const requests: Promise<void>[] = []
    if (hasLoadedPermission('employee-list')) {
      requests.push(employeeService.getAll(token, 1, 500).then(res => {
        const data = Array.isArray(res.data) ? res.data : []
        const map = new Map<string, string>()
        const orgMap = new Map<string, { branchIds: string[]; departmentIds: string[] }>()
        data.forEach(e => {
          const id = String(e.id)
          map.set(id, e.name)

          const anyE = e as any
          const branchIds = Array.isArray(anyE.branches)
            ? anyE.branches
                .map((b: any) => String(b?.id ?? ''))
                .filter((v: string) => v !== '')
            : []
          const departmentIds = Array.isArray(anyE.departments)
            ? anyE.departments
                .map((d: any) => String(d?.id ?? ''))
                .filter((v: string) => v !== '')
            : []

          orgMap.set(id, { branchIds, departmentIds })
        })
        employeeMap.value = map
        employeeOrgMap.value = orgMap
      }))
    }
    if (hasLoadedPermission('leave-type-list')) {
      requests.push(leaveTypeService.getAll(token).then(res => {
        const data = Array.isArray(res.data) ? res.data : []
        const titleMap = new Map<string, string>()
        const daysMap  = new Map<string, number>()
        data.forEach(lt => {
          titleMap.set(String(lt.id), lt.title)
          if (lt.days != null) daysMap.set(String(lt.id), lt.days)
        })
        leaveTypeMap.value  = titleMap
        leaveTypeDaysMap.value = daysMap
      }))
    }
    await Promise.allSettled(requests)
  }

  async function fetchLeaves() {
    loading.value = true
    error.value = null
    const token = authStore.token
    try {
      await Promise.all([
        leaveStore.fetchLeaves(),
        token ? loadLookupMaps(token) : Promise.resolve()
      ])
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to load leave data'
    } finally {
      loading.value = false
    }
  }

  const isBusy = computed(() => loading.value || leaveStore.loading)

  return {
    loading: isBusy,
    error,
    reportType,
    selectedYear,
    selectedBranchId,
    selectedDepartmentId,
    filteredLeaves,
    approvedLeaves,
    rejectedLeaves,
    pendingLeaves,
    groupedByEmployee,
    buildAnalytics,
    resolveEmployeeName,
    resolveLeaveTypeName,
    leaveTypeDaysMap,
    fetchLeaves
  }
})

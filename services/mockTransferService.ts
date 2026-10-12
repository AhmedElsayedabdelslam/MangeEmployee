export interface Transfer {
  id: number
  employee_id: number
  employee_name: string
  branch_id: number
  branch_name: string
  department_id: number
  department_name: string
  transfer_date: string
  description: string
}

export interface TransferOption {
  id: number
  name: string
}

export interface TransferListResponse {
  success: true
  data: Transfer[]
  meta: {
    pagination: {
      total: number
      count: number
      per_page: number
      current_page: number
      total_pages: number
      last_page: number
      from: number
      to: number
      next_page_url: string | null
      prev_page_url: string | null
    }
  }
}

export interface TransferMutationResponse {
  success: true
  data: Transfer
}

export const mockTransferBranches: TransferOption[] = [
  { id: 1, name: 'test i branch' },
  { id: 2, name: 'Main Office' },
  { id: 3, name: 'Branch A' },
  { id: 4, name: 'Branch B' },
]

export const mockTransferDepartments: TransferOption[] = [
  { id: 1, name: 'test department' },
  { id: 2, name: 'HR' },
  { id: 3, name: 'IT' },
  { id: 4, name: 'Operations' },
]

export const mockTransferEmployees: TransferOption[] = [
  { id: 101, name: 'emp from mgr' },
  { id: 102, name: 'Akram Demian Nassief Demian' },
  { id: 103, name: 'Andrew Shenouda' },
  { id: 104, name: 'Peter Izaq Samaan' },
]

const mockTransfers: Transfer[] = [
  {
    id: 1,
    employee_id: 101,
    employee_name: 'emp from mgr',
    branch_id: 1,
    branch_name: 'test i branch',
    department_id: 1,
    department_name: 'test department',
    transfer_date: '2024-11-30',
    description: 'test',
  },
  {
    id: 2,
    employee_id: 102,
    employee_name: 'Akram Demian Nassief Demian',
    branch_id: 2,
    branch_name: 'Main Office',
    department_id: 3,
    department_name: 'IT',
    transfer_date: '2026-04-20',
    description: 'Relocation to main office',
  },
  {
    id: 3,
    employee_id: 103,
    employee_name: 'Andrew Shenouda',
    branch_id: 1,
    branch_name: 'test i branch',
    department_id: 2,
    department_name: 'HR',
    transfer_date: '2026-05-01',
    description: 'Department change',
  },
]

const BASE_DELAY_MS = 450
const DELAY_VARIANCE_MS = 350

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function simulateNetworkLatency(): Promise<void> {
  const jitter = Math.floor(Math.random() * DELAY_VARIANCE_MS)
  await delay(BASE_DELAY_MS + jitter)
}

function sanitize(value: string | null | undefined): string {
  return (value ?? '').trim()
}

function normalizePage(value: number): number {
  const parsed = Number.isFinite(value) ? Math.floor(value) : 1
  return Math.max(1, parsed)
}

function normalizePerPage(value: number): number {
  const parsed = Number.isFinite(value) ? Math.floor(value) : 10
  return Math.max(1, Math.min(100, parsed))
}

function findBranchName(branchId: number | undefined): string {
  if (typeof branchId !== 'number') return 'Unknown Branch'
  return mockTransferBranches.find((branch) => branch.id === branchId)?.name || 'Unknown Branch'
}

function findDepartmentName(departmentId: number | undefined): string {
  if (typeof departmentId !== 'number') return 'Unknown Department'
  return (
    mockTransferDepartments.find((department) => department.id === departmentId)?.name ||
    'Unknown Department'
  )
}

function findEmployeeName(employeeId: number | undefined): string {
  if (typeof employeeId !== 'number') return 'Unknown Employee'
  return (
    mockTransferEmployees.find((employee) => employee.id === employeeId)?.name ||
    `Employee #${employeeId}`
  )
}

function ensureRequiredFields(data: Partial<Transfer>) {
  if (!data.branch_id) throw new Error('Branch is required.')
  if (!data.department_id) throw new Error('Department is required.')
  if (!data.employee_id) throw new Error('Employee is required.')
  if (!sanitize(data.transfer_date)) throw new Error('Transfer date is required.')
}

export const mockTransferService = {
  async getAll(page = 1, perPage = 10, search = ''): Promise<TransferListResponse> {
    await simulateNetworkLatency()

    const normalizedPage = normalizePage(page)
    const normalizedPerPage = normalizePerPage(perPage)
    const query = sanitize(search).toLowerCase()

    let filtered = [...mockTransfers]
    if (query) {
      filtered = filtered.filter((transfer) =>
        [
          transfer.employee_name,
          transfer.branch_name,
          transfer.department_name,
          transfer.transfer_date,
          transfer.description,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query),
      )
    }

    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / normalizedPerPage))
    const currentPage = Math.min(normalizedPage, totalPages)
    const start = (currentPage - 1) * normalizedPerPage
    const data = filtered.slice(start, start + normalizedPerPage)

    return {
      success: true,
      data,
      meta: {
        pagination: {
          total,
          count: data.length,
          per_page: normalizedPerPage,
          current_page: currentPage,
          total_pages: totalPages,
          last_page: totalPages,
          from: total === 0 ? 0 : start + 1,
          to: total === 0 ? 0 : start + data.length,
          next_page_url: currentPage < totalPages ? 'mock://transfer/next' : null,
          prev_page_url: currentPage > 1 ? 'mock://transfer/prev' : null,
        },
      },
    }
  },

  async create(data: Partial<Transfer>): Promise<TransferMutationResponse> {
    await simulateNetworkLatency()
    ensureRequiredFields(data)

    const nextId = Math.max(0, ...mockTransfers.map((transfer) => transfer.id)) + 1

    const newTransfer: Transfer = {
      id: nextId,
      employee_id: Number(data.employee_id),
      employee_name: findEmployeeName(data.employee_id),
      branch_id: Number(data.branch_id),
      branch_name: findBranchName(data.branch_id),
      department_id: Number(data.department_id),
      department_name: findDepartmentName(data.department_id),
      transfer_date: sanitize(data.transfer_date),
      description: sanitize(data.description),
    }

    mockTransfers.unshift(newTransfer)

    return { success: true, data: newTransfer }
  },

  async update(id: number, data: Partial<Transfer>): Promise<TransferMutationResponse> {
    await simulateNetworkLatency()

    const index = mockTransfers.findIndex((transfer) => transfer.id === id)
    if (index === -1) throw new Error('Transfer not found.')

    const current = mockTransfers[index]
    const nextEmployeeId = data.employee_id ?? current.employee_id
    const nextBranchId = data.branch_id ?? current.branch_id
    const nextDepartmentId = data.department_id ?? current.department_id
    const nextTransferDate = sanitize(data.transfer_date ?? current.transfer_date)

    if (!nextEmployeeId || !nextBranchId || !nextDepartmentId || !nextTransferDate) {
      throw new Error('Branch, department, employee, and transfer date are required.')
    }

    const updated: Transfer = {
      ...current,
      ...data,
      employee_id: Number(nextEmployeeId),
      employee_name: findEmployeeName(nextEmployeeId),
      branch_id: Number(nextBranchId),
      branch_name: findBranchName(nextBranchId),
      department_id: Number(nextDepartmentId),
      department_name: findDepartmentName(nextDepartmentId),
      transfer_date: nextTransferDate,
      description: sanitize(data.description ?? current.description),
    }

    mockTransfers[index] = updated
    return { success: true, data: updated }
  },

  async delete(id: number): Promise<{ success: true }> {
    await simulateNetworkLatency()

    const index = mockTransfers.findIndex((transfer) => transfer.id === id)
    if (index === -1) throw new Error('Transfer not found.')

    mockTransfers.splice(index, 1)
    return { success: true }
  },
}


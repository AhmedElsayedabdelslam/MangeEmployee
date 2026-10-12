export interface User {
  id: number
  name: string
  email: string
  role: string
  branch: string
  department: string
  status: 'Active' | 'Inactive'
  avatar?: string
}

export interface CreateUserPayload {
  name: string
  email: string
  role: string
  branch: string
  department: string
  password?: string
  loginEnabled?: boolean
  status?: User['status']
  avatar?: string
}

interface UserPaginationMeta {
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

export interface GetAllUsersResponse {
  success: true
  data: User[]
  meta: {
    pagination: UserPaginationMeta
  }
}

export interface CreateUserResponse {
  success: true
  data: User
}

const mockUsers: User[] = [
  { id: 1, name: 'Andrew Shenouda', email: 'Andrew@Yacoubmd.com', role: 'Hr', branch: 'Main Office', department: 'Human Resources', status: 'Active' },
  { id: 2, name: 'Peter Izaq Samaan', email: 'peter_izaq@yacoubmd.com', role: 'Department manager', branch: 'Contracting Team', department: 'Training', status: 'Active' },
  { id: 3, name: 'Sherry Rauf Azmy Khalil', email: 'sherry_raouf@yacoubmd.com', role: 'Department manager', branch: 'Main Office', department: 'Operations', status: 'Active' },
  { id: 4, name: 'marinabevnoty gergis', email: 'marinabevnoty95@gmail.com', role: 'Hr', branch: 'Main Office', department: 'Human Resources', status: 'Inactive' },
  { id: 5, name: 'Sunshine torre', email: 'sunshine_torre@yacoubmd.com', role: 'Hr', branch: 'Branch A', department: 'Human Resources', status: 'Active' },
  { id: 6, name: 'Grace Alday', email: 'grace@yacoubmd.com', role: 'Hr', branch: 'Branch B', department: 'Human Resources', status: 'Active' },
  { id: 7, name: 'John Makary', email: 'john-makary@yacoubmd.com', role: 'Department manager', branch: 'Main Office', department: 'IT', status: 'Active' },
  { id: 8, name: 'ABANOUB GAD ELRAB', email: 'abanoubg@yacoubmd.com', role: 'Department manager', branch: 'Branch A', department: 'Sales', status: 'Active' },
]

const BASE_DELAY_MS = 500
const DELAY_VARIANCE_MS = 300

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const randomDelay = async () => {
  const jitter = Math.floor(Math.random() * DELAY_VARIANCE_MS)
  await sleep(BASE_DELAY_MS + jitter)
}

const sanitize = (value: string) => value.trim()

const normalizePage = (page: number) => Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1)
const normalizePerPage = (perPage: number) => {
  const safe = Number.isFinite(perPage) ? Math.floor(perPage) : 10
  return Math.max(1, Math.min(100, safe))
}

export const mockUserRoleOptions = Array.from(new Set(mockUsers.map((user) => user.role)))
export const mockUserBranchOptions = Array.from(new Set(mockUsers.map((user) => user.branch)))
export const mockUserDepartmentOptions = Array.from(new Set(mockUsers.map((user) => user.department)))

export const mockUserService = {
  async getAll(page = 1, perPage = 10, search = ''): Promise<GetAllUsersResponse> {
    await randomDelay()

    const normalizedPage = normalizePage(page)
    const normalizedPerPage = normalizePerPage(perPage)
    const query = sanitize(search).toLowerCase()

    let filtered = [...mockUsers]
    if (query) {
      filtered = filtered.filter((user) =>
        [user.name, user.email, user.role, user.branch, user.department]
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

    const from = total === 0 ? 0 : start + 1
    const to = total === 0 ? 0 : start + data.length

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
          from,
          to,
          next_page_url: currentPage < totalPages ? 'mock://users/next' : null,
          prev_page_url: currentPage > 1 ? 'mock://users/prev' : null,
        },
      },
    }
  },

  async create(data: CreateUserPayload): Promise<CreateUserResponse> {
    await randomDelay()

    const status: User['status'] = data.status || (data.loginEnabled === false ? 'Inactive' : 'Active')
    const nextId = Math.max(0, ...mockUsers.map((user) => user.id)) + 1
    const created: User = {
      id: nextId,
      name: sanitize(data.name),
      email: sanitize(data.email),
      role: sanitize(data.role),
      branch: sanitize(data.branch),
      department: sanitize(data.department),
      status,
      avatar: data.avatar,
    }

    mockUsers.unshift(created)

    return {
      success: true,
      data: created,
    }
  },
}


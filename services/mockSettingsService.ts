import type { ApiResponse } from '~/types/api'

export interface MockEntity {
  id: number
  name: string
  created_at?: string
  updated_at?: string
}

export type MockSettingsEntityKey =
  | 'goalType'
  | 'trainingType'
  | 'awardType'
  | 'terminationType'
  | 'jobCategory'
  | 'expenseType'
  | 'incomeType'
  | 'paymentType'
  | 'contractType'

const nowIso = () => new Date().toISOString()

const mockDatabase: Record<MockSettingsEntityKey, MockEntity[]> = {
  goalType: [
    { id: 1, name: 'Performance', created_at: nowIso() },
    { id: 2, name: 'Development', created_at: nowIso() },
    { id: 3, name: 'Project', created_at: nowIso() },
    { id: 4, name: 'Quality', created_at: nowIso() },
    { id: 5, name: 'Innovation', created_at: nowIso() },
    { id: 6, name: 'Leadership', created_at: nowIso() }
  ],
  trainingType: [
    { id: 1, name: 'Technical Skills', created_at: nowIso() },
    { id: 2, name: 'Soft Skills', created_at: nowIso() },
    { id: 3, name: 'Compliance', created_at: nowIso() },
    { id: 4, name: 'Onboarding', created_at: nowIso() },
    { id: 5, name: 'Safety', created_at: nowIso() },
    { id: 6, name: 'Management', created_at: nowIso() }
  ],
  awardType: [
    { id: 1, name: 'Employee of the Month', created_at: nowIso() },
    { id: 2, name: 'Outstanding Performance', created_at: nowIso() },
    { id: 3, name: 'Team Excellence', created_at: nowIso() },
    { id: 4, name: 'Innovation Champion', created_at: nowIso() }
  ],
  terminationType: [
    { id: 1, name: 'Resignation', created_at: nowIso() },
    { id: 2, name: 'Dismissal', created_at: nowIso() },
    { id: 3, name: 'Retirement', created_at: nowIso() },
    { id: 4, name: 'Contract End', created_at: nowIso() },
    { id: 5, name: 'Layoff', created_at: nowIso() },
    { id: 6, name: 'Mutual Separation', created_at: nowIso() }
  ],
  jobCategory: [
    { id: 1, name: 'Engineering', created_at: nowIso() },
    { id: 2, name: 'Sales', created_at: nowIso() },
    { id: 3, name: 'Marketing', created_at: nowIso() },
    { id: 4, name: 'Finance', created_at: nowIso() },
    { id: 5, name: 'Operations', created_at: nowIso() },
    { id: 6, name: 'Human Resources', created_at: nowIso() }
  ],
  expenseType: [
    { id: 1, name: 'Travel', created_at: nowIso() },
    { id: 2, name: 'Equipment', created_at: nowIso() },
    { id: 3, name: 'Meals', created_at: nowIso() },
    { id: 4, name: 'Training', created_at: nowIso() },
    { id: 5, name: 'Software', created_at: nowIso() },
    { id: 6, name: 'Utilities', created_at: nowIso() }
  ],
  incomeType: [
    { id: 1, name: 'Salary', created_at: nowIso() },
    { id: 2, name: 'Bonus', created_at: nowIso() },
    { id: 3, name: 'Commission', created_at: nowIso() },
    { id: 4, name: 'Overtime', created_at: nowIso() },
    { id: 5, name: 'Allowance', created_at: nowIso() },
    { id: 6, name: 'Incentive', created_at: nowIso() }
  ],
  paymentType: [
    { id: 1, name: 'Bank Transfer', created_at: nowIso() },
    { id: 2, name: 'Cash', created_at: nowIso() },
    { id: 3, name: 'Cheque', created_at: nowIso() },
    { id: 4, name: 'Mobile Wallet', created_at: nowIso() },
    { id: 5, name: 'Direct Deposit', created_at: nowIso() },
    { id: 6, name: 'Wire Transfer', created_at: nowIso() }
  ],
  contractType: [
    { id: 1, name: 'Full-time', created_at: nowIso() },
    { id: 2, name: 'Part-time', created_at: nowIso() },
    { id: 3, name: 'Freelance', created_at: nowIso() },
    { id: 4, name: 'Temporary', created_at: nowIso() },
    { id: 5, name: 'Internship', created_at: nowIso() },
    { id: 6, name: 'Consultant', created_at: nowIso() }
  ]
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const createMockService = (entityKey: MockSettingsEntityKey) => {
  return {
    async getAll(page = 1, perPage = 10, _token: string, search?: string): Promise<ApiResponse<MockEntity[]>> {
      await delay(500)

      const normalizedPage = Math.max(1, Number(page) || 1)
      const normalizedPerPage = Math.max(1, Number(perPage) || 10)
      let data = [...mockDatabase[entityKey]]

      if (search?.trim()) {
        const query = search.trim().toLowerCase()
        data = data.filter(item => item.name.toLowerCase().includes(query))
      }

      const total = data.length
      const lastPage = Math.max(1, Math.ceil(total / normalizedPerPage))
      const clampedPage = Math.min(normalizedPage, lastPage)
      const start = (clampedPage - 1) * normalizedPerPage
      const paginatedData = data.slice(start, start + normalizedPerPage)

      return {
        success: true,
        message: `${entityKey} fetched successfully`,
        status_code: 200,
        data: paginatedData,
        meta: {
          pagination: {
            total,
            per_page: normalizedPerPage,
            current_page: clampedPage,
            last_page: lastPage,
            next_page_url: clampedPage < lastPage ? 'mock' : null,
            prev_page_url: clampedPage > 1 ? 'mock' : null,
            from: total === 0 ? 0 : start + 1,
            to: start + paginatedData.length
          }
        }
      }
    },

    async create(data: { name: string }, _token: string): Promise<ApiResponse<MockEntity>> {
      await delay(500)

      const list = mockDatabase[entityKey]
      const newId = Math.max(0, ...list.map(item => item.id)) + 1
      const createdAt = nowIso()
      const newItem: MockEntity = { id: newId, name: data.name, created_at: createdAt, updated_at: createdAt }
      list.push(newItem)

      return {
        success: true,
        message: 'Created successfully',
        status_code: 201,
        data: newItem
      }
    },

    async update(id: number, data: { name: string }, _token: string): Promise<ApiResponse<MockEntity>> {
      await delay(500)

      const list = mockDatabase[entityKey]
      const index = list.findIndex(item => item.id === id)
      if (index === -1) throw new Error('Not found')

      const updatedItem: MockEntity = {
        ...list[index],
        name: data.name,
        updated_at: nowIso()
      }
      list[index] = updatedItem

      return {
        success: true,
        message: 'Updated successfully',
        status_code: 200,
        data: updatedItem
      }
    },

    async delete(id: number, _token: string): Promise<ApiResponse<null>> {
      await delay(500)

      const list = mockDatabase[entityKey]
      const index = list.findIndex(item => item.id === id)
      if (index === -1) throw new Error('Not found')
      list.splice(index, 1)

      return {
        success: true,
        message: 'Deleted successfully',
        status_code: 200,
        data: null
      }
    }
  }
}

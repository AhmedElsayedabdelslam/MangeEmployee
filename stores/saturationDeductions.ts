import { defineStore } from 'pinia'
import { saturationDeductionService } from '~/services/saturationDeductionService'
import type {
  SaturationDeduction,
  SaturationDeductionPayload,
  UpdateSaturationDeductionPayload
} from '~/types/saturationDeduction'
import { useAuthStore } from '~/stores/auth'

interface SaturationDeductionsState {
  deductions: SaturationDeduction[]
  loading: boolean
  error: string | null
}

export const useSaturationDeductionsStore = defineStore('saturationDeductions', {
  state: (): SaturationDeductionsState => ({
    deductions: [],
    loading: false,
    error: null
  }),

  getters: {
    getByEmployee: (state) => (employeeId: string | number) => {
      return state.deductions.filter(d => String(d.employee_id) === String(employeeId))
    },
    getBySalary: (state) => (salaryId: string | number) => {
      return state.deductions.filter(d => Number(d.salary_id) === Number(salaryId))
    }
  },

  actions: {
    async fetchAll() {
      const authStore = useAuthStore()
      if (!authStore.token) return

      this.loading = true
      this.error = null

      try {
        const response = await saturationDeductionService.getAll(authStore.token)
        if (response.success && Array.isArray(response.data)) {
          this.deductions = response.data
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to fetch deductions'
        throw err
      } finally {
        this.loading = false
      }
    },

    async fetchBySalary(salaryId: string | number): Promise<SaturationDeduction[]> {
      const authStore = useAuthStore()
      if (!authStore.token) return []

      this.loading = true
      this.error = null

      try {
        const response = await saturationDeductionService.getBySalary(
          salaryId,
          authStore.token
        )
        if (response.success && Array.isArray(response.data)) {
          const filtered = saturationDeductionService.filterBySalary(response.data, salaryId)

          const others = this.deductions.filter(
            d => Number(d.salary_id) !== Number(salaryId)
          )
          this.deductions = [...others, ...filtered]

          return filtered
        }
        return []
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to fetch deductions'
        throw err
      } finally {
        this.loading = false
      }
    },

    async create(payload: SaturationDeductionPayload): Promise<SaturationDeduction | undefined> {
      const authStore = useAuthStore()
      if (!authStore.token) throw new Error('Not authenticated')

      this.loading = true
      this.error = null

      try {
        const response = await saturationDeductionService.create(payload, authStore.token)
        if (response.success && response.data) {
          this.deductions.push(response.data)
          return response.data
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to create deduction'
        throw err
      } finally {
        this.loading = false
      }
    },

    async update(
      id: string | number,
      payload: UpdateSaturationDeductionPayload
    ): Promise<SaturationDeduction | undefined> {
      const authStore = useAuthStore()
      if (!authStore.token) throw new Error('Not authenticated')

      this.loading = true
      this.error = null

      try {
        const response = await saturationDeductionService.update(id, payload, authStore.token)
        if (response.success && response.data) {
          const index = this.deductions.findIndex(
            d => String(d.id) === String(id) || String(d.uuid) === String(id)
          )
          if (index >= 0) {
            this.deductions[index] = response.data
          }
          return response.data
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to update deduction'
        throw err
      } finally {
        this.loading = false
      }
    },

    async delete(id: string | number) {
      const authStore = useAuthStore()
      if (!authStore.token) throw new Error('Not authenticated')

      this.loading = true
      this.error = null

      try {
        await saturationDeductionService.delete(id, authStore.token)
        this.deductions = this.deductions.filter(
          d => String(d.id) !== String(id) && String(d.uuid) !== String(id)
        )
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to delete deduction'
        throw err
      } finally {
        this.loading = false
      }
    }
  }
})

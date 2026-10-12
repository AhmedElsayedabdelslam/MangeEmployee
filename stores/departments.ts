import { defineStore } from 'pinia'
import type { Department } from '~/types/department'
import { useBranchStore } from './branches'

const STORAGE_KEY = 'hr-portal-departments'

function loadDepartmentsFromStorage(): Department[] {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
    } catch (error) {
      // Error loading from localStorage
    }
  }
  return []
}

function saveDepartmentsToStorage(departments: Department[]) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(departments))
    } catch (error) {
      // Error saving to localStorage
    }
  }
}

export const useDepartmentStore = defineStore('departments', {
  state: () => {
    const storedDepartments = loadDepartmentsFromStorage()
    const departments = storedDepartments.length > 0 ? storedDepartments : []
    
    return {
      departments: departments as Department[],
      loading: false,
      error: null as string | null
    }
  },

  getters: {
    departmentsWithBranchNames: (state) => {
      const branchStore = useBranchStore()
      return state.departments.map(dept => ({
        ...dept,
        branchName: branchStore.branches.find(b => b.id === dept.branchId)?.name || 'Unknown'
      }))
    }
  },

  actions: {
    initializeSampleData() {
      const sampleDepartments: Department[] = [
        {
          id: 'DEPT001',
          name: 'Human Resources',
          branchId: 'BRANCH001',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z'
        },
        {
          id: 'DEPT002',
          name: 'IT Department',
          branchId: 'BRANCH001',
          createdAt: '2025-01-02T00:00:00Z',
          updatedAt: '2025-01-02T00:00:00Z'
        }
      ]
      this.departments = sampleDepartments
      saveDepartmentsToStorage(sampleDepartments)
    },

    async createDepartment(name: string, branchId: string): Promise<Department> {
      this.loading = true
      try {
        const newDepartment: Department = {
          id: `DEPT${Date.now()}`,
          name,
          branchId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        this.departments.push(newDepartment)
        saveDepartmentsToStorage(this.departments)
        return newDepartment
      } catch (err) {
        this.error = 'Failed to create department'
        throw err
      } finally {
        this.loading = false
      }
    },

    async updateDepartment(id: string, name: string, branchId: string): Promise<Department> {
      this.loading = true
      try {
        const index = this.departments.findIndex(d => d.id === id)
        if (index === -1) throw new Error('Department not found')

        const updatedDepartment = {
          ...this.departments[index],
          name,
          branchId,
          updatedAt: new Date().toISOString()
        }

        this.departments.splice(index, 1, updatedDepartment)
        saveDepartmentsToStorage(this.departments)
        return updatedDepartment
      } catch (err) {
        this.error = 'Failed to update department'
        throw err
      } finally {
        this.loading = false
      }
    },

    async deleteDepartment(id: string): Promise<void> {
      this.loading = true
      try {
        const index = this.departments.findIndex(d => d.id === id)
        if (index === -1) throw new Error('Department not found')

        this.departments.splice(index, 1)
        saveDepartmentsToStorage(this.departments)
      } catch (err) {
        this.error = 'Failed to delete department'
        throw err
      } finally {
        this.loading = false
      }
    }
  }
})

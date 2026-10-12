import { defineStore } from 'pinia'

export interface DepartmentWorkingDays {
  id: string
  branch: string
  department: string
  workingDays: string[]
}

const STORAGE_KEY = 'department_working_days'

function getUseMockAuth(): boolean {
  try {
    const config = useRuntimeConfig()
    return String(config.public.useMockAuth || 'false') === 'true'
  } catch {
    return false
  }
}

export const useDepsWorkingDaysStore = defineStore('depsWorkingDays', {
  state: () => ({
    departments: [] as DepartmentWorkingDays[],
    isLoading: false
  }),

  getters: {
    filteredDepartments: (state) => (searchQuery: string) => {
      if (!searchQuery) return state.departments
      const query = searchQuery.toLowerCase()
      return state.departments.filter(dept =>
        dept.branch.toLowerCase().includes(query) ||
        dept.department.toLowerCase().includes(query)
      )
    }
  },

  actions: {
    // Initialize with sample data
    initializeSampleData() {
      const sampleData: DepartmentWorkingDays[] = [
        {
          id: '1',
          branch: 'Contracting Team',
          department: 'Human Resources',
          workingDays: []
        },
        {
          id: '2',
          branch: 'Contracting Team',
          department: 'Admin and Logistics',
          workingDays: []
        },
        {
          id: '3',
          branch: 'Contracting Team',
          department: 'Training',
          workingDays: []
        },
        {
          id: '4',
          branch: 'Contracting Team',
          department: 'Credentialing',
          workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
        },
        {
          id: '5',
          branch: 'others',
          department: 'Medical Record',
          workingDays: []
        },
        {
          id: '6',
          branch: 'others',
          department: 'Grievance',
          workingDays: []
        },
        {
          id: '7',
          branch: 'others',
          department: 'Subpoena',
          workingDays: []
        },
        {
          id: '8',
          branch: 'Patient Support Center',
          department: 'Insurance Audit',
          workingDays: []
        },
        {
          id: '9',
          branch: 'Patient Support Center',
          department: 'Mail/ Fax/Email/Form',
          workingDays: []
        },
        {
          id: '10',
          branch: 'Provider Support Center',
          department: 'Transcribers1',
          workingDays: []
        }
      ]

      this.departments = sampleData
      this.saveToLocalStorage()
    },

    // Load from localStorage
    loadFromLocalStorage() {
      if (typeof window === 'undefined') return
      
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.departments = parsed
            return
          }
        }
        if (getUseMockAuth()) this.initializeSampleData()
      } catch {
        if (getUseMockAuth()) this.initializeSampleData()
      }
    },

    // Save to localStorage
    saveToLocalStorage() {
      if (typeof window === 'undefined') return
      
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.departments))
      } catch (error) {
        // Error saving to localStorage
      }
    },

    // Update department working days
    updateDepartment(id: string, workingDays: string[]) {
      const dept = this.departments.find(d => d.id === id)
      if (dept) {
        dept.workingDays = workingDays
        this.saveToLocalStorage()
        return dept
      }
      throw new Error(`Department with id ${id} not found`)
    },

    // Get department by ID
    getDepartmentById(id: string) {
      return this.departments.find(d => d.id === id)
    },

    // Create new department (if needed)
    createDepartment(department: Omit<DepartmentWorkingDays, 'id'>) {
      const newId = String(Date.now())
      const newDept: DepartmentWorkingDays = {
        id: newId,
        ...department
      }
      this.departments.push(newDept)
      this.saveToLocalStorage()
      return newDept
    },

    // Delete department (if needed)
    deleteDepartment(id: string) {
      const index = this.departments.findIndex(d => d.id === id)
      if (index > -1) {
        this.departments.splice(index, 1)
        this.saveToLocalStorage()
        return true
      }
      return false
    }
  }
})

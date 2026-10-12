import { defineStore } from 'pinia'

export interface EmployeeWorkingDays {
  id: string
  employeeId: string
  name: string
  branch: string
  department: string
  team: string
  designation: string
  workingDays: string[]
  allowedLeaveTypes: string[]
  customPTO: {
    enabled: boolean
    amount: number | null
    expiryDate: string | null // 'YYYY-MM-DD'
  }
}

const STORAGE_KEY = 'employee_working_days'

function getUseMockAuth(): boolean {
  try {
    const config = useRuntimeConfig()
    return String(config.public.useMockAuth || 'false') === 'true'
  } catch {
    return false
  }
}

export const useEmpsWorkingDaysStore = defineStore('empsWorkingDays', {
  state: () => ({
    employees: [] as EmployeeWorkingDays[],
    isLoading: false
  }),

  getters: {
    filteredEmployees: (state) => (searchQuery: string) => {
      if (!searchQuery) return state.employees
      const query = searchQuery.toLowerCase()
      return state.employees.filter(emp =>
        emp.name.toLowerCase().includes(query) ||
        emp.employeeId.toLowerCase().includes(query) ||
        emp.department.toLowerCase().includes(query) ||
        emp.branch.toLowerCase().includes(query)
      )
    }
  },

  actions: {
    // Initialize with sample data
    initializeSampleData() {
      const sampleData: EmployeeWorkingDays[] = [
        {
          id: '1',
          employeeId: 'EMP0000001',
          name: 'Sarah Johnson',
          branch: 'New York',
          department: 'Neurology',
          team: 'Clinical Research',
          designation: 'Senior Neurologist',
          workingDays: [],
          allowedLeaveTypes: [],
          customPTO: { enabled: false, amount: null, expiryDate: null }
        },
        {
          id: '2',
          employeeId: 'EMP0000002',
          name: 'Michael Chen',
          branch: 'San Francisco',
          department: 'Research',
          team: 'Data Science',
          designation: 'Research Scientist',
          workingDays: [],
          allowedLeaveTypes: [],
          customPTO: { enabled: false, amount: null, expiryDate: null }
        },
        {
          id: '3',
          employeeId: 'EMP0000003',
          name: 'Emily Rodriguez',
          branch: 'Boston',
          department: 'Patient Care',
          team: 'Therapy',
          designation: 'Clinical Psychologist',
          workingDays: [],
          allowedLeaveTypes: [],
          customPTO: { enabled: false, amount: null, expiryDate: null }
        },
        {
          id: '4',
          employeeId: 'EMP0000004',
          name: 'David Thompson',
          branch: 'New York',
          department: 'Administration',
          team: 'HR',
          designation: 'HR Manager',
          workingDays: [],
          allowedLeaveTypes: [],
          customPTO: { enabled: false, amount: null, expiryDate: null }
        },
        {
          id: '5',
          employeeId: 'EMP0000005',
          name: 'Jessica Martinez',
          branch: 'Los Angeles',
          department: 'Neurology',
          team: 'Diagnostics',
          designation: 'Neurologist',
          workingDays: [],
          allowedLeaveTypes: [],
          customPTO: { enabled: false, amount: null, expiryDate: null }
        },
        {
          id: '6',
          employeeId: 'EMP0000006',
          name: 'Robert Wilson',
          branch: 'Chicago',
          department: 'Finance',
          team: 'Accounting',
          designation: 'Financial Analyst',
          workingDays: [],
          allowedLeaveTypes: [],
          customPTO: { enabled: false, amount: null, expiryDate: null }
        },
        {
          id: '7',
          employeeId: 'EMP0000007',
          name: 'Amanda Lee',
          branch: 'New York',
          department: 'Research',
          team: 'Clinical Trials',
          designation: 'Research Coordinator',
          workingDays: [],
          allowedLeaveTypes: [],
          customPTO: { enabled: false, amount: null, expiryDate: null }
        },
        {
          id: '8',
          employeeId: 'EMP0000008',
          name: 'James Brown',
          branch: 'San Francisco',
          department: 'IT',
          team: 'Development',
          designation: 'Software Engineer',
          workingDays: [],
          allowedLeaveTypes: [],
          customPTO: { enabled: false, amount: null, expiryDate: null }
        },
        {
          id: '9',
          employeeId: 'EMP0000009',
          name: 'Jennifer Davis',
          branch: 'Boston',
          department: 'Patient Care',
          team: 'Nursing',
          designation: 'Head Nurse',
          workingDays: [],
          allowedLeaveTypes: [],
          customPTO: { enabled: false, amount: null, expiryDate: null }
        },
        {
          id: '10',
          employeeId: 'EMP0000010',
          name: 'Christopher Garcia',
          branch: 'Los Angeles',
          department: 'Administration',
          team: 'Operations',
          designation: 'Operations Manager',
          workingDays: [],
          allowedLeaveTypes: [],
          customPTO: { enabled: false, amount: null, expiryDate: null }
        }
      ]

      this.employees = sampleData
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
            this.employees = parsed
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.employees))
      } catch (error) {
        // Error saving to localStorage
      }
    },

    // Update employee working days
    updateEmployee(id: string, data: Partial<EmployeeWorkingDays>) {
      const emp = this.employees.find(e => e.id === id)
      if (emp) {
        Object.assign(emp, data)
        this.saveToLocalStorage()
        return emp
      }
      throw new Error(`Employee with id ${id} not found`)
    },

    // Get employee by ID
    getEmployeeById(id: string) {
      return this.employees.find(e => e.id === id)
    },

    // Create new employee (if needed)
    createEmployee(employee: Omit<EmployeeWorkingDays, 'id'>) {
      const newId = String(Date.now())
      const newEmp: EmployeeWorkingDays = {
        id: newId,
        ...employee
      }
      this.employees.push(newEmp)
      this.saveToLocalStorage()
      return newEmp
    },

    // Delete employee (if needed)
    deleteEmployee(id: string) {
      const index = this.employees.findIndex(e => e.id === id)
      if (index > -1) {
        this.employees.splice(index, 1)
        this.saveToLocalStorage()
        return true
      }
      return false
    }
  }
})

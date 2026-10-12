/**
 * Employee Re-assignment Pinia Store
 * Manages state for employee assignment management
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { reassignEmployeeService } from '~/services/reassignEmployeeService'
import type {
  EmployeeWithAssignments,
  Branch,
  Department,
  TransferScreenFilters,
  PaginationMeta,
  ReassignEmployeePayload,
  UnassignEmployeePayload,
} from '~/types/reassignEmployee.types'
import { DEMO_EMPLOYEES, DEMO_BRANCHES, DEMO_DEPARTMENTS } from '~/data/reassignEmployeeDemo'

export const useReassignEmployeeStore = defineStore('reassignEmployee', () => {
  // State
  const employees = ref<EmployeeWithAssignments[]>(DEMO_EMPLOYEES)
  const branches = ref<Branch[]>(DEMO_BRANCHES)
  const departments = ref<Department[]>(DEMO_DEPARTMENTS)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedEmployee = ref<EmployeeWithAssignments | null>(null)
  const useDemoData = ref(true) // Toggle between demo and real API

  const filters = ref<TransferScreenFilters>({
    branchId: null,
    departmentId: null,
    searchQuery: '',
    status: 'all',
  })

  const pagination = ref<PaginationMeta>({
    currentPage: 1,
    perPage: 20,
    total: DEMO_EMPLOYEES.length,
    lastPage: Math.ceil(DEMO_EMPLOYEES.length / 20),
  })

  // Computed
  const filteredEmployees = computed(() => {
    let result = [...employees.value]

    // Filter by branch
    if (filters.value.branchId) {
      result = result.filter((emp) =>
        emp.branches.some((b) => b.id === filters.value.branchId)
      )
    }

    // Filter by department
    if (filters.value.departmentId) {
      result = result.filter((emp) =>
        emp.departments.some((d) => d.id === filters.value.departmentId)
      )
    }

    // Filter by search query
    if (filters.value.searchQuery) {
      const query = filters.value.searchQuery.toLowerCase()
      result = result.filter(
        (emp) =>
          emp.firstName.toLowerCase().includes(query) ||
          emp.lastName.toLowerCase().includes(query) ||
          emp.email.toLowerCase().includes(query) ||
          emp.employeeCode.toLowerCase().includes(query)
      )
    }

    // Filter by status
    if (filters.value.status !== 'all') {
      result = result.filter((emp) => emp.status === filters.value.status)
    }

    return result
  })

  const paginatedEmployees = computed(() => {
    const start = (pagination.value.currentPage - 1) * pagination.value.perPage
    const end = start + pagination.value.perPage
    return filteredEmployees.value.slice(start, end)
  })

  const totalPages = computed(() => {
    return Math.ceil(filteredEmployees.value.length / pagination.value.perPage)
  })

  const hasNextPage = computed(() => {
    return pagination.value.currentPage < totalPages.value
  })

  const hasPreviousPage = computed(() => {
    return pagination.value.currentPage > 1
  })

  const activeBranches = computed(() => {
    return branches.value.filter((b) => b.status === 'active')
  })

  const activeDepartments = computed(() => {
    if (!filters.value.branchId) {
      return departments.value.filter((d) => d.status === 'active')
    }
    return departments.value.filter(
      (d) => d.status === 'active' && d.branchId === filters.value.branchId
    )
  })

  // Actions
  const fetchEmployees = async (page: number = 1) => {
    loading.value = true
    error.value = null

    try {
      if (useDemoData.value) {
        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 500))
        pagination.value.currentPage = page
        pagination.value.total = filteredEmployees.value.length
        pagination.value.lastPage = totalPages.value
      } else {
        const response = await reassignEmployeeService.getEmployeesWithAssignments(
          page,
          pagination.value.perPage,
          filters.value
        )
        employees.value = response.data
        pagination.value = response.meta
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch employees'
      console.error('Error fetching employees:', err)
    } finally {
      loading.value = false
    }
  }

  const fetchBranches = async () => {
    loading.value = true
    error.value = null

    try {
      if (!useDemoData.value) {
        branches.value = await reassignEmployeeService.getBranches()
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch branches'
      console.error('Error fetching branches:', err)
    } finally {
      loading.value = false
    }
  }

  const fetchDepartments = async (branchId?: string) => {
    loading.value = true
    error.value = null

    try {
      if (!useDemoData.value) {
        if (branchId) {
          departments.value = await reassignEmployeeService.getDepartmentsByBranch(branchId)
        } else {
          departments.value = await reassignEmployeeService.getDepartments()
        }
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch departments'
      console.error('Error fetching departments:', err)
    } finally {
      loading.value = false
    }
  }

  const fetchEmployeeAssignments = async (employeeId: string) => {
    loading.value = true
    error.value = null

    try {
      if (useDemoData.value) {
        await new Promise((resolve) => setTimeout(resolve, 300))
        selectedEmployee.value = employees.value.find((e) => e.id === employeeId) || null
      } else {
        selectedEmployee.value = await reassignEmployeeService.getEmployeeAssignments(employeeId)
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch employee assignments'
      console.error('Error fetching employee assignments:', err)
    } finally {
      loading.value = false
    }
  }

  const assignEmployee = async (payload: ReassignEmployeePayload) => {
    loading.value = true
    error.value = null

    try {
      if (useDemoData.value) {
        // Simulate demo assignment
        await new Promise((resolve) => setTimeout(resolve, 500))
        const employee = employees.value.find((e) => e.id === payload.employeeId)
        if (employee) {
          const branch = branches.value.find((b) => b.id === payload.branchId)
          const department = departments.value.find((d) => d.id === payload.departmentId)

          if (branch && department) {
            // Add new assignment
            const newAssignment = {
              id: `assign_${Date.now()}`,
              employeeId: payload.employeeId,
              branchId: payload.branchId,
              departmentId: payload.departmentId,
              status: 'assigned' as const,
              assignedAt: new Date().toISOString(),
              unassignedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }

            // Check if assignment already exists
            const existingIndex = employee.assignments.findIndex(
              (a) =>
                a.branchId === payload.branchId &&
                a.departmentId === payload.departmentId &&
                a.status === 'assigned'
            )

            if (existingIndex === -1) {
              employee.assignments.push(newAssignment)
              employee.assignmentCount = employee.assignments.filter((a) => a.status === 'assigned').length

              // Update branches and departments
              if (!employee.branches.find((b) => b.id === branch.id)) {
                employee.branches.push(branch)
              }
              if (!employee.departments.find((d) => d.id === department.id)) {
                employee.departments.push(department)
              }
            }
          }
        }
      } else {
        const result = await reassignEmployeeService.assignEmployee(payload)
        const index = employees.value.findIndex((e) => e.id === payload.employeeId)
        if (index !== -1) {
          employees.value[index] = result
        }
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to assign employee'
      console.error('Error assigning employee:', err)
    } finally {
      loading.value = false
    }
  }

  const unassignEmployee = async (payload: UnassignEmployeePayload) => {
    loading.value = true
    error.value = null

    try {
      if (useDemoData.value) {
        // Simulate demo unassignment
        await new Promise((resolve) => setTimeout(resolve, 500))
        const employee = employees.value.find((e) => e.id === payload.employeeId)
        if (employee) {
          // Mark assignment as unassigned
          const assignment = employee.assignments.find(
            (a) =>
              a.branchId === payload.branchId &&
              a.departmentId === payload.departmentId &&
              a.status === 'assigned'
          )

          if (assignment) {
            assignment.status = 'un_assigned'
            assignment.unassignedAt = new Date().toISOString()
            assignment.updatedAt = new Date().toISOString()
          }

          // Update counts
          employee.assignmentCount = employee.assignments.filter((a) => a.status === 'assigned').length

          // Remove from branches/departments if no other active assignments
          employee.branches = employee.branches.filter((branch) =>
            employee.assignments.some(
              (a) => a.branchId === branch.id && a.status === 'assigned'
            )
          )
          employee.departments = employee.departments.filter((dept) =>
            employee.assignments.some(
              (a) => a.departmentId === dept.id && a.status === 'assigned'
            )
          )
        }
      } else {
        const result = await reassignEmployeeService.unassignEmployee(payload)
        const index = employees.value.findIndex((e) => e.id === payload.employeeId)
        if (index !== -1) {
          employees.value[index] = result
        }
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to unassign employee'
      console.error('Error unassigning employee:', err)
    } finally {
      loading.value = false
    }
  }

  const setFilter = (key: keyof TransferScreenFilters, value: any) => {
    filters.value[key] = value
    pagination.value.currentPage = 1 // Reset to first page on filter change
  }

  const clearFilters = () => {
    filters.value = {
      branchId: null,
      departmentId: null,
      searchQuery: '',
      status: 'all',
    }
    pagination.value.currentPage = 1
  }

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages.value) {
      pagination.value.currentPage = page
    }
  }

  const nextPage = () => {
    if (hasNextPage.value) {
      pagination.value.currentPage++
    }
  }

  const previousPage = () => {
    if (hasPreviousPage.value) {
      pagination.value.currentPage--
    }
  }

  const toggleDemoMode = (enabled: boolean) => {
    useDemoData.value = enabled
    if (enabled) {
      employees.value = DEMO_EMPLOYEES
      branches.value = DEMO_BRANCHES
      departments.value = DEMO_DEPARTMENTS
    }
  }

  return {
    // State
    employees,
    branches,
    departments,
    loading,
    error,
    selectedEmployee,
    filters,
    pagination,
    useDemoData,

    // Computed
    filteredEmployees,
    paginatedEmployees,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    activeBranches,
    activeDepartments,

    // Actions
    fetchEmployees,
    fetchBranches,
    fetchDepartments,
    fetchEmployeeAssignments,
    assignEmployee,
    unassignEmployee,
    setFilter,
    clearFilters,
    goToPage,
    nextPage,
    previousPage,
    toggleDemoMode,
  }
})

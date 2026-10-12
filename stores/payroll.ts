import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { salaryService, type Salary } from '~/services/salaryService'
import type { SalaryAddition } from '~/services/salaryAdditionService'
import type { SalaryDeduction } from '~/services/salaryDeductionService'
import type { Payslip } from '~/services/payslipService'
import { useAuthStore } from '~/stores/auth'
import { usePermissions } from '~/composables/usePermissions'
import type { PayrollAccount, PayrollCompany, PayrollEmployee, PayslipType } from '~/types/payroll'

export const usePayrollStore = defineStore('payroll', () => {
  const currentSalary = ref<Salary | null>(null)
  const salaries = ref<Salary[]>([])
  const additions = ref<SalaryAddition[]>([])
  const deductions = ref<SalaryDeduction[]>([])
  const payslips = ref<Payslip[]>([])
  const companies = ref<PayrollCompany[]>([])
  const employees = ref<PayrollEmployee[]>([])
  const payslipTypes = ref<PayslipType[]>([])
  const accounts = ref<PayrollAccount[]>([])

  const loadingSalary = ref(false)
  const loadingReferences = ref(false)
  const savingSalary = ref(false)
  const loadingAdditions = ref(false)
  const loadingDeductions = ref(false)
  const loadingPayslips = ref(false)
  const loadingCompanies = ref(false)
  const errorCompanies = ref<string | null>(null)
  const companiesLoaded = ref(false)

  const errorSalary = ref<string | null>(null)
  const errorReferences = ref<string | null>(null)
  const errorAdditions = ref<string | null>(null)
  const errorDeductions = ref<string | null>(null)
  const errorPayslips = ref<string | null>(null)
  const referencesLoaded = ref(false)

  const totalAdditions = computed(() => {
    return additions.value.reduce((sum, item) => sum + parseFloat(String(item.amount || '0')), 0)
  })

  const totalDeductions = computed(() => {
    return deductions.value.reduce((sum, item) => sum + parseFloat(String(item.amount || '0')), 0)
  })

  const netSalary = computed(() => {
    if (!currentSalary.value) return 0
    const base = parseFloat(String(currentSalary.value.base_salary || '0'))
    return base + totalAdditions.value - totalDeductions.value
  })
  function setSalary(salary: Salary | null) {
    currentSalary.value = salary
  }

  function setSalaries(data: Salary[]) {
    salaries.value = data
  }

  function setAdditions(data: SalaryAddition[]) {
    additions.value = data
  }

  function setDeductions(data: SalaryDeduction[]) {
    deductions.value = data
  }

  function setPayslips(data: Payslip[]) {
    payslips.value = data
  }

  async function fetchReferences(force = false) {
    if (referencesLoaded.value && !force) return {
      companies: companies.value,
      employees: employees.value,
      payslipTypes: payslipTypes.value,
      accounts: accounts.value,
    }

    loadingReferences.value = true
    errorReferences.value = null

    try {
      const authStore = useAuthStore()
      if (!authStore.token) throw new Error('No auth token')

      const { hasPermission } = usePermissions()
      const [companyRows, employeeRows, typeRows, accountRows] = await Promise.all([
        hasPermission('company-list')
          ? salaryService.getAllCompanies(authStore.token).catch(() => [])
          : Promise.resolve([]),
        hasPermission('employee-list')
          ? salaryService.getAllEmployees(authStore.token).catch(() => [])
          : Promise.resolve([]),
        hasPermission('payslip-type-list')
          ? salaryService.getAllPayslipTypes(authStore.token).catch(() => [])
          : Promise.resolve([]),
        hasPermission('accountlist-list')
          ? salaryService.getAllAccounts(authStore.token).catch(() => [])
          : Promise.resolve([]),
      ])

      companies.value = companyRows
      employees.value = employeeRows
      payslipTypes.value = typeRows
      accounts.value = accountRows
      referencesLoaded.value = true

      return {
        companies: companies.value,
        employees: employees.value,
        payslipTypes: payslipTypes.value,
        accounts: accounts.value,
      }
    } catch (err) {
      errorReferences.value = err instanceof Error ? err.message : 'Failed to load payroll reference data'
      throw err
    } finally {
      loadingReferences.value = false
    }
  }
  async function fetchCompanies(force = false) {
    if (companiesLoaded.value && !force) {
      return companies.value
    }

    loadingCompanies.value = true
    errorCompanies.value = null

    try {
      const authStore = useAuthStore()

      if (!authStore.token) {
        throw new Error('No auth token')
      }

      const { hasPermission } = usePermissions()

      if (!hasPermission('company-list')) {
        companies.value = []
        companiesLoaded.value = true
        return []
      }

      companies.value = await salaryService.getTicketCompanies(
        authStore.token
      )

      companiesLoaded.value = true

      return companies.value
    } catch (err) {
      errorCompanies.value =
        err instanceof Error
          ? err.message
          : 'Failed to load companies'

      throw err
    } finally {
      loadingCompanies.value = false
    }
  }

  function addAddition(addition: SalaryAddition) {
    additions.value.push(addition)
  }

  function removeAddition(id: number) {
    additions.value = additions.value.filter((a) => a.id !== id)
  }

  function addDeduction(deduction: SalaryDeduction) {
    deductions.value.push(deduction)
  }

  function removeDeduction(uuid: string) {
    deductions.value = deductions.value.filter((d) => d.uuid !== uuid)
  }

  function clearAll() {
    currentSalary.value = null
    salaries.value = []
    additions.value = []
    deductions.value = []
    payslips.value = []
    companies.value = []
    employees.value = []
    payslipTypes.value = []
    accounts.value = []
    referencesLoaded.value = false
    companiesLoaded.value = false
    errorCompanies.value = null
    errorSalary.value = null
    errorReferences.value = null
    errorAdditions.value = null
    errorDeductions.value = null
    errorPayslips.value = null
  }

  return {
    currentSalary,
    salaries,
    additions,
    deductions,
    payslips,
    companies,
    employees,
    payslipTypes,
    accounts,
    loadingSalary,
    loadingReferences,
    savingSalary,
    loadingAdditions,
    loadingDeductions,
    loadingPayslips,
    errorSalary,
    errorReferences,
    errorAdditions,
    errorDeductions,
    errorPayslips,
    totalAdditions,
    totalDeductions,
    netSalary,
    referencesLoaded,
    setSalary,
    setSalaries,
    setAdditions,
    setDeductions,
    setPayslips,
    fetchReferences,
    fetchCompanies,
    addAddition,
    removeAddition,
    addDeduction,
    removeDeduction,
    clearAll
  }
})

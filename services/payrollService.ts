// Payroll Service
// API service layer for payroll operations with LocalStorage fallback

import { otherPaymentService } from '~/services/otherPaymentService'
import { requireLoadedPermission } from '~/utils/permissionAccess'
import type {
  EmployeeSalary,
  Allowance,
  Commission,
  Loan,
  Deduction,
  OtherPayment,
  Overtime
} from '~/types/payroll'

// ============================================
// LOCALSTORAGE HELPERS (For Testing)
// ============================================

const getFromLocalStorage = <T>(key: string): T | null => {
  if (typeof window === 'undefined') return null
  const data = localStorage.getItem(key)
  return data ? JSON.parse(data) : null
}

const saveToLocalStorage = <T>(key: string, data: T): void => {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(data))
}

// ============================================
// EMPLOYEE SALARY (Base Salary)
// ============================================

export const payrollService = {

  async getEmployeeSalary(employeeId: string): Promise<EmployeeSalary | null> {
    return getFromLocalStorage<EmployeeSalary>(`employee_${employeeId}_salary`)
  },

  async setEmployeeSalary(employeeId: string, data: Partial<EmployeeSalary>): Promise<EmployeeSalary> {
    const existing = await this.getEmployeeSalary(employeeId)
    const salary: EmployeeSalary = {
      id: existing?.id || `SAL_${Date.now()}`,
      employeeId,
      salary: data.salary ?? existing?.salary ?? 0,
      payslipType: data.payslipType ?? existing?.payslipType ?? '',
      accountType: data.accountType ?? existing?.accountType ?? '',
      company: data.company ?? existing?.company ?? '',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    saveToLocalStorage(`employee_${employeeId}_salary`, salary)
    return salary
  },

  // ============================================
  // ALLOWANCES
  // ============================================

  async getAllowances(employeeId: string): Promise<Allowance[]> {
    return getFromLocalStorage<Allowance[]>(`employee_${employeeId}_allowances`) || []
  },

  async createAllowance(employeeId: string, data: Partial<Allowance>): Promise<Allowance> {
    const allowances = await this.getAllowances(employeeId)
    const newAllowance: Allowance = {
      id: `ALW_${Date.now()}`,
      employeeId,
      employeeName: data.employeeName || '',
      allowanceOption: data.allowanceOption || '',
      title: data.title || '',
      type: data.type || 'Fixed',
      amount: data.amount || 0,
      createdAt: new Date().toISOString()
    }

    allowances.push(newAllowance)
    saveToLocalStorage(`employee_${employeeId}_allowances`, allowances)
    return newAllowance
  },

  async updateAllowance(employeeId: string, allowanceId: string, data: Partial<Allowance>): Promise<Allowance> {
    const allowances = await this.getAllowances(employeeId)
    const index = allowances.findIndex(a => a.id === allowanceId)
    if (index === -1) throw new Error('Allowance not found')

    allowances[index] = {
      ...allowances[index],
      ...data
    }

    saveToLocalStorage(`employee_${employeeId}_allowances`, allowances)
    return allowances[index]
  },

  async deleteAllowance(employeeId: string, allowanceId: string): Promise<void> {
    const allowances = await this.getAllowances(employeeId)
    const filtered = allowances.filter(a => a.id !== allowanceId)
    saveToLocalStorage(`employee_${employeeId}_allowances`, filtered)
  },

  // ============================================
  // COMMISSIONS
  // ============================================

  async getCommissions(employeeId: string): Promise<Commission[]> {
    return getFromLocalStorage<Commission[]>(`employee_${employeeId}_commissions`) || []
  },

  async createCommission(employeeId: string, data: Partial<Commission>): Promise<Commission> {
    const commissions = await this.getCommissions(employeeId)
    const newCommission: Commission = {
      id: `COM_${Date.now()}`,
      employeeId,
      employeeName: data.employeeName || '',
      title: data.title || '',
      type: data.type || 'Fixed',
      amount: data.amount || 0,
      createdAt: new Date().toISOString()
    }

    commissions.push(newCommission)
    saveToLocalStorage(`employee_${employeeId}_commissions`, commissions)
    return newCommission
  },

  async updateCommission(employeeId: string, commissionId: string, data: Partial<Commission>): Promise<Commission> {
    const commissions = await this.getCommissions(employeeId)
    const index = commissions.findIndex(c => c.id === commissionId)
    if (index === -1) throw new Error('Commission not found')

    commissions[index] = { ...commissions[index], ...data }
    saveToLocalStorage(`employee_${employeeId}_commissions`, commissions)
    return commissions[index]
  },

  async deleteCommission(employeeId: string, commissionId: string): Promise<void> {
    const commissions = await this.getCommissions(employeeId)
    const filtered = commissions.filter(c => c.id !== commissionId)
    saveToLocalStorage(`employee_${employeeId}_commissions`, filtered)
  },

  // ============================================
  // LOANS
  // ============================================

  async getLoans(employeeId: string): Promise<Loan[]> {
    requireLoadedPermission('loan-list')
    return getFromLocalStorage<Loan[]>(`employee_${employeeId}_loans`) || []
  },

  async createLoan(employeeId: string, data: Partial<Loan>): Promise<Loan> {
    requireLoadedPermission('loan-create')
    const loans = getFromLocalStorage<Loan[]>(`employee_${employeeId}_loans`) || []
    const id = Date.now()
    const newLoan: Loan = {
      id,
      uuid: data.uuid || `LOCAL_LOAN_${id}`,
      title: data.title || '',
      employee_id: data.employee_id || Number.parseInt(employeeId, 10) || 0,
      loan_option_id: data.loan_option_id || 0,
      loan_option_name: data.loan_option_name,
      amount: data.amount || 0,
      monthly_deduction: data.monthly_deduction || 0,
      remaining_amount: data.remaining_amount ?? data.amount ?? 0,
      start_date: data.start_date || new Date().toISOString().slice(0, 10),
      end_date: data.end_date,
      reason: data.reason,
      status: data.status || 'active',
      created_by: data.created_by || 0
    }

    loans.push(newLoan)
    saveToLocalStorage(`employee_${employeeId}_loans`, loans)
    return newLoan
  },

  async updateLoan(employeeId: string, loanId: string | number, data: Partial<Loan>): Promise<Loan> {
    requireLoadedPermission('loan-edit')
    const loans = getFromLocalStorage<Loan[]>(`employee_${employeeId}_loans`) || []
    const index = loans.findIndex(l => String(l.id) === String(loanId) || l.uuid === String(loanId))
    if (index === -1) throw new Error('Loan not found')

    loans[index] = { ...loans[index], ...data }
    saveToLocalStorage(`employee_${employeeId}_loans`, loans)
    return loans[index]
  },

  async deleteLoan(employeeId: string, loanId: string | number): Promise<void> {
    requireLoadedPermission('loan-delete')
    const loans = getFromLocalStorage<Loan[]>(`employee_${employeeId}_loans`) || []
    const filtered = loans.filter(l => String(l.id) !== String(loanId) && l.uuid !== String(loanId))
    saveToLocalStorage(`employee_${employeeId}_loans`, filtered)
  },

  // ============================================
  // DEDUCTIONS
  // ============================================

  async getDeductions(employeeId: string): Promise<Deduction[]> {
    return getFromLocalStorage<Deduction[]>(`employee_${employeeId}_deductions`) || []
  },

  async createDeduction(employeeId: string, data: Partial<Deduction>): Promise<Deduction> {
    const deductions = await this.getDeductions(employeeId)
    const newDeduction: Deduction = {
      id: `DED_${Date.now()}`,
      uuid: data.uuid || '',
      name: data.name || data.title || '',
      salary_id: data.salary_id || 0,
      employeeId,
      employeeName: data.employeeName || '',
      deductionOption: data.deductionOption || '',
      title: data.title || '',
      type: data.type || 'Fixed',
      amount: data.amount || 0,
      createdAt: new Date().toISOString()
    }

    deductions.push(newDeduction)
    saveToLocalStorage(`employee_${employeeId}_deductions`, deductions)
    return newDeduction
  },

  async updateDeduction(employeeId: string, deductionId: string, data: Partial<Deduction>): Promise<Deduction> {
    const deductions = await this.getDeductions(employeeId)
    const index = deductions.findIndex(d => d.id === deductionId)
    if (index === -1) throw new Error('Deduction not found')

    deductions[index] = { ...deductions[index], ...data }
    saveToLocalStorage(`employee_${employeeId}_deductions`, deductions)
    return deductions[index]
  },

  async deleteDeduction(employeeId: string, deductionId: string): Promise<void> {
    const deductions = await this.getDeductions(employeeId)
    const filtered = deductions.filter(d => d.id !== deductionId)
    saveToLocalStorage(`employee_${employeeId}_deductions`, filtered)
  },

  // ============================================
  // OTHER PAYMENTS (Using API)
  // ============================================

  async getOtherPayments(employeeId: string, token?: string): Promise<OtherPayment[]> {
    try {
      return await otherPaymentService.getByEmployeeId(employeeId, token)
    } catch (error) {
      console.error('Failed to fetch other payments from API:', error)
      return getFromLocalStorage<OtherPayment[]>(`employee_${employeeId}_other_payments`) || []
    }
  },

  async createOtherPayment(employeeId: string, data: Partial<OtherPayment>, token?: string): Promise<OtherPayment> {
    try {
      const numericId = parseInt(employeeId, 10) || 0
      return await otherPaymentService.create({
        title: data.title || '',
        amount: data.amount || 0,
        employee_id: numericId
      }, token)
    } catch (error) {
      console.error('Failed to create other payment via API:', error)
      const payments = getFromLocalStorage<OtherPayment[]>(`employee_${employeeId}_other_payments`) || []
      const newPayment: OtherPayment = {
        id: `PAY_${Date.now()}`,
        employeeId,
        employee: data.employee || '',
        title: data.title || '',
        type: data.type || 'Fixed',
        amount: data.amount || 0,
        createdAt: new Date().toISOString()
      }
      payments.push(newPayment)
      saveToLocalStorage(`employee_${employeeId}_other_payments`, payments)
      return newPayment
    }
  },

  async updateOtherPayment(employeeId: string, paymentId: string, data: Partial<OtherPayment>, token?: string): Promise<OtherPayment> {
    try {
      return await otherPaymentService.update(paymentId, {
        title: data.title,
        amount: data.amount,
        employee_id: employeeId
      }, token)
    } catch (error) {
      console.error('Failed to update other payment via API:', error)
      const payments = getFromLocalStorage<OtherPayment[]>(`employee_${employeeId}_other_payments`) || []
      const index = payments.findIndex(p => String(p.id) === String(paymentId))
      if (index === -1) throw new Error('Other payment not found')
      payments[index] = { ...payments[index], ...data }
      saveToLocalStorage(`employee_${employeeId}_other_payments`, payments)
      return payments[index]
    }
  },

  async deleteOtherPayment(employeeId: string, paymentId: string, token?: string): Promise<void> {
    try {
      await otherPaymentService.delete(paymentId, token)
    } catch (error) {
      console.error('Failed to delete other payment via API:', error)
      const payments = getFromLocalStorage<OtherPayment[]>(`employee_${employeeId}_other_payments`) || []
      const filtered = payments.filter(p => String(p.id) !== String(paymentId))
      saveToLocalStorage(`employee_${employeeId}_other_payments`, filtered)
    }
  },

  // ============================================
  // OVERTIME
  // ============================================

  async getOvertime(employeeId: string): Promise<Overtime[]> {
    return getFromLocalStorage<Overtime[]>(`employee_${employeeId}_overtime`) || []
  },

  async createOvertime(employeeId: string, data: Partial<Overtime>): Promise<Overtime> {
    const overtime = await this.getOvertime(employeeId)
    const newOvertime: Overtime = {
      id: `OT_${Date.now()}`,
      employeeId,
      employeeName: data.employeeName || '',
      overtimeTitle: data.overtimeTitle || '',
      numberOfDays: data.numberOfDays || 0,
      hours: data.hours || 0,
      rate: data.rate || 0,
      createdAt: new Date().toISOString()
    }

    overtime.push(newOvertime)
    saveToLocalStorage(`employee_${employeeId}_overtime`, overtime)
    return newOvertime
  },

  async updateOvertime(employeeId: string, overtimeId: string, data: Partial<Overtime>): Promise<Overtime> {
    const overtime = await this.getOvertime(employeeId)
    const index = overtime.findIndex(o => o.id === overtimeId)
    if (index === -1) throw new Error('Overtime not found')

    overtime[index] = { ...overtime[index], ...data }
    saveToLocalStorage(`employee_${employeeId}_overtime`, overtime)
    return overtime[index]
  },

  async deleteOvertime(employeeId: string, overtimeId: string): Promise<void> {
    const overtime = await this.getOvertime(employeeId)
    const filtered = overtime.filter(o => o.id !== overtimeId)
    saveToLocalStorage(`employee_${employeeId}_overtime`, filtered)
  }
}

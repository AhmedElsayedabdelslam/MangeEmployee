import { defineStore } from 'pinia'
import type { NavItem } from '~/types'
import { FEATURE_FLAGS } from '~/config/featureFlags'


const leaveManagementItem: NavItem = {
  id: 'leave-management',
  label: 'Leave Management',
  icon: 'i-lucide-calendar-x',
  path: '/leave-types',
  children: [
    { id: 'leave-types', label: 'Leave Types', icon: 'i-lucide-list', path: '/leave-types', permissions: ['leave-type-list'] },
    { id: 'employee-leave-types', label: 'Employee Leave Balance', icon: 'i-lucide-user-check', path: '/employee-leave-types', permissions: ['employee-leave-type-list'] },
    { id: 'leaves', label: 'Leave Requests', icon: 'i-lucide-calendar-off', path: '/leaves', permissions: ['leave-list', 'leave-create'], permissionMode: 'any' }
  ]
}

const otherNavigationItems: NavItem[] = [
  {
    id: 'finance',
    label: 'Finance',
    icon: 'i-lucide-wallet',
    path: '/finance/account-list',
    children: [
      { id: 'finance-account-list', label: 'Account List', icon: 'i-lucide-building-2', path: '/finance/account-list', permissions: ['accountlist-list'] },
      { id: 'finance-account-balance', label: 'Account Balance', icon: 'i-lucide-scale', path: '/finance/account-balance', permissions: ['accountlist-list'] },
      {
        id: 'finance-transfer-balance',
        label: 'Transfer Balance',
        icon: 'i-lucide-arrow-left-right',
        path: '/finance/transfer-balance',
        permissions: ['transfer-balance-list'],
      },
      { id: 'finance-payees', label: 'Payees', icon: 'i-lucide-user-plus', path: '/finance/payees', permissions: ['payee-list'] },
      { id: 'finance-payers', label: 'Payers', icon: 'i-lucide-banknote', path: '/finance/payers', permissions: ['payer-list'] }
    ]
  },
  {
    id: 'hr-admin',
    label: 'HR Admin Setup',
    icon: 'i-lucide-settings',
    path: '/hr-admin-setup/transfer',
    children: [
      {
        id: 'hr-admin-transfer',
        label: 'Employee Assignments',
        icon: 'i-lucide-arrow-left-right',
        path: '/hr-admin-setup/transfer',
        permissions: ['reassign-employee-list'],
      },
      {
        id: 'hr-admin-transfer-assignments',
        label: 'Manage Assignments',
        icon: 'i-lucide-network',
        path: '/hr-admin-setup/transfer-assignments',
        permissions: [
          'assign-employees-to-branch',
          'remove-employees-from-branch',
          'assign-employees-to-department',
          'remove-employees-from-department',
          'assign-hr-to-company',
          'remove-hr-from-company',
        ],
      },
    ],
  },
  { id: 'ticket', label: 'Ticket', icon: 'i-lucide-ticket', path: '/tickets', permissions: ['ticket-list'] },
  {
    id: 'system-setting',
    label: 'System Setting',
    icon: 'i-lucide-settings-2',
    path: '/settings/company',
    children: [
      { id: 'settings-company', label: 'Company', icon: 'i-lucide-building', path: '/settings/company', permissions: ['company-list'] },
      { id: 'settings-branch', label: 'Branches', icon: 'i-lucide-git-branch', path: '/settings/branch', permissions: ['branch-list'] },
      { id: 'settings-department', label: 'Departments', icon: 'i-lucide-building-2', path: '/settings/department', permissions: ['department-list'] },
      { id: 'settings-designation', label: 'Designation', icon: 'i-lucide-tag', path: '/settings/designation', permissions: ['designation-list'] },
      { id: 'settings-leave-type', label: 'Leave Types', icon: 'i-lucide-calendar-x', path: '/settings/leave-type', permissions: ['leave-type-list'] },
      { id: 'settings-document-type', label: 'Document Types', icon: 'i-lucide-file-type', path: '/settings/document-type', permissions: ['document-type-list'] },
      { id: 'settings-payslip-type', label: 'Payslip Types', icon: 'i-lucide-receipt', path: '/settings/payslip-type', permissions: ['payslip-type-list'] },
      { id: 'settings-goal-type', label: 'Goal Type', icon: 'i-lucide-target', path: '/settings/goal-type', permissions: ['goal-type-list'] },
      { id: 'settings-training-type', label: 'Training Type', icon: 'i-lucide-graduation-cap', path: '/settings/training-type', permissions: ['training-type-list'] },
      { id: 'settings-performance-type', label: 'Performance Type', icon: 'i-lucide-chart-no-axes-combined', path: '/settings/performance-type', permissions: ['performance-type-list'] },
      { id: 'settings-award-type', label: 'Award Type', icon: 'i-lucide-award', path: '/settings/award-type', permissions: ['award-type-list'] },
      { id: 'settings-termination-type', label: 'Termination Type', icon: 'i-lucide-user-minus', path: '/settings/termination-type', permissions: ['termination-type-list'] },
      { id: 'settings-expense-type', label: 'Expense Type', icon: 'i-lucide-receipt', path: '/settings/expense-type', permissions: ['expense-type-list'] },
      { id: 'settings-income-type', label: 'Income Type', icon: 'i-lucide-coins', path: '/settings/income-type', permissions: ['income-type-list'] },
      { id: 'settings-payment-type', label: 'Payment Type', icon: 'i-lucide-credit-card', path: '/settings/payment-type', permissions: ['payment-type-list'] },
      { id: 'settings-loan-option', label: 'Loan Option', icon: 'i-lucide-banknote', path: '/settings/loan-option', permissions: ['loan-option-list'] },
      { id: 'settings-allowance-option', label: 'Allowance Option', icon: 'i-lucide-circle-dollar-sign', path: '/settings/allowance-option', permissions: ['allowance-option-list'] },
      { id: 'settings-deduction-option', label: 'Deduction Option', icon: 'i-lucide-trending-down', path: '/settings/deduction-option', permissions: ['deduction-option-list'] },
      { id: 'settings-contract-type', label: 'Contract Type', icon: 'i-lucide-file-signature', path: '/settings/contract-type', permissions: ['contract-type-list'] },
    ]
  }
]


export function getNavigationItems(): NavItem[] {
  const items: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'i-lucide-layout-dashboard', path: '/dashboard' },
    {
      id: 'attendance',
      label: 'Attendance',
      icon: 'i-lucide-fingerprint',
      path: '/attendance',
      permissions: [
        'list-attendance-sessions',
        'create-attendance-session',
        'create-attendance-break',
        'list-attendance-correction-request'
      ],
      permissionMode: 'any'
    },
    ...(FEATURE_FLAGS.LEAVE_REPORT
      ? [{
          id: 'report',
          label: 'Report',
          icon: 'i-lucide-bar-chart-2',
          path: '/leave-report',
          children: [
            { id: 'leave-report', label: 'Leave', icon: 'i-lucide-calendar-off', path: '/leave-report', permissions: ['leave-list'] }
          ]
        }]
      : []),
    {
      id: 'staff',
      label: 'Staff',
      icon: 'i-lucide-users',
      path: '/staff/role',
      children: [
        { id: 'staff-roles', label: 'Roles', icon: 'i-lucide-shield-check', path: '/staff/role', permissions: ['role-list'] }
      ]
    },
    { id: 'employee', label: 'Employee', icon: 'i-lucide-user-circle', path: '/employees', permissions: ['employee-list', 'employee-show'], permissionMode: 'any' },
    {
      id: 'payroll',
      label: 'Payroll',
      icon: 'i-lucide-wallet',
      path: '/payroll/set-salary',
      children: [
        {
          id: 'payroll-set-salary',
          label: 'Set Salary',
          icon: 'i-lucide-dollar-sign',
          path: '/payroll/set-salary',
          permissions: ['salary-list']
        },
        { id: 'payroll-loans', label: 'Loans', icon: 'i-lucide-banknote', path: '/payroll/loans', permissions: ['loan-list'] },
        { id: 'payroll-payslip', label: 'Payslip', icon: 'i-lucide-file-text', path: '/payroll/payslip', permissions: ['list-payslip'] }
      ]
    },
    {
      id: 'timesheet',
      label: 'Timesheet',
      icon: 'i-lucide-clock',
      path: '/timesheet/leave',
      children: [
        { id: 'timesheet-leave', label: 'Manage Leave', icon: 'i-lucide-calendar-off', path: '/timesheet/leave', permissions: ['leave-create', 'leave-list'], permissionMode: 'any' },
        {
          id: 'timesheet-deps-working-days',
          label: 'Deps Working Days',
          icon: 'i-lucide-calendar-days',
          path: '/timesheet/deps-working-days',
          permissions: ['working-days-list', 'department-list'],
          permissionMode: 'all'
        },
        {
          id: 'timesheet-emps-working-days',
          label: 'Emps Working Days',
          icon: 'i-lucide-calendar-check',
          path: '/timesheet/emps-working-days',
          permissions: ['working-days-list', 'employee-list'],
          permissionMode: 'all'
        },
        {
          id: 'timesheet-company-working-days',
          label: 'Company Working Days',
          icon: 'i-lucide-building-2',
          path: '/timesheet/company-working-days',
          permissions: ['working-days-list', 'company-list'],
          permissionMode: 'all'
        }
      ]
    }
  ]

  if (FEATURE_FLAGS.LEAVE_MANAGEMENT) {
    const leaveChildren = leaveManagementItem.children?.filter(child => {
      if (child.id === 'leave-types') return FEATURE_FLAGS.LEAVE_TYPES
      if (child.id === 'employee-leave-types') return FEATURE_FLAGS.EMPLOYEE_LEAVE_TYPES
      if (child.id === 'leaves') return FEATURE_FLAGS.LEAVES
      return false
    }) || []

    if (leaveChildren.length > 0) {
      items.push({
        ...leaveManagementItem,
        children: leaveChildren
      })
    }
  }

  items.push(...otherNavigationItems)
  return items
}

export const useNavigationStore = defineStore('navigation', {
  state: () => ({
    activeItemId: 'employee',
    sidebarOpen: true,
    mobileSidebarOpen: false
  }),

  getters: {
    items: () => getNavigationItems(),
    
    activeItem: (state) => {
      return getNavigationItems().find(item => item.id === state.activeItemId)
    }
  },

  actions: {
    setActiveItem(id: string) {
      this.activeItemId = id
    },

    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen
    },

    toggleMobileSidebar() {
      this.mobileSidebarOpen = !this.mobileSidebarOpen
    },

    closeMobileSidebar() {
      this.mobileSidebarOpen = false
    }
  }
})

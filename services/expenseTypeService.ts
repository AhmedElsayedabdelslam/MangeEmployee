import type { CreateExpenseTypePayload, ExpenseType, UpdateExpenseTypePayload } from '~/types/settings'
import { createNameOnlySettingsService } from '~/services/settingsCrudService'

export type { ExpenseType, CreateExpenseTypePayload, UpdateExpenseTypePayload }

export const expenseTypeService = createNameOnlySettingsService<
  ExpenseType,
  CreateExpenseTypePayload,
  UpdateExpenseTypePayload
>('/expense-types', {
  plural: 'expense types',
  singular: 'expense type'
}, {
  list: 'expense-type-list',
  show: 'expense-type-show',
  create: 'expense-type-create',
  edit: 'expense-type-edit',
  delete: 'expense-type-delete'
})

import type { CreateIncomeTypePayload, IncomeType, UpdateIncomeTypePayload } from '~/types/settings'
import { createNameOnlySettingsService } from '~/services/settingsCrudService'

export type { IncomeType, CreateIncomeTypePayload, UpdateIncomeTypePayload }

export const incomeTypeService = createNameOnlySettingsService<
  IncomeType,
  CreateIncomeTypePayload,
  UpdateIncomeTypePayload
>('/income-types', {
  plural: 'income types',
  singular: 'income type'
}, {
  list: 'income-type-list',
  show: 'income-type-show',
  create: 'income-type-create',
  edit: 'income-type-edit',
  delete: 'income-type-delete'
})

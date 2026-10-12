import type { ContractType, CreateContractTypePayload, UpdateContractTypePayload } from '~/types/settings'
import { createNameOnlySettingsService } from '~/services/settingsCrudService'

export type { ContractType, CreateContractTypePayload, UpdateContractTypePayload }

export const contractTypeService = createNameOnlySettingsService<
  ContractType,
  CreateContractTypePayload,
  UpdateContractTypePayload
>('/contract-types', {
  plural: 'contract types',
  singular: 'contract type'
}, {
  list: 'contract-type-list',
  show: 'contract-type-show',
  create: 'contract-type-create',
  edit: 'contract-type-edit',
  delete: 'contract-type-delete'
})

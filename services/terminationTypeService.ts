import type { CreateTerminationTypePayload, TerminationType, UpdateTerminationTypePayload } from '~/types/settings'
import { createNameOnlySettingsService } from '~/services/settingsCrudService'

export type { TerminationType, CreateTerminationTypePayload, UpdateTerminationTypePayload }

export const terminationTypeService = createNameOnlySettingsService<
  TerminationType,
  CreateTerminationTypePayload,
  UpdateTerminationTypePayload
>('/termination-types', {
  plural: 'termination types',
  singular: 'termination type'
}, {
  list: 'termination-type-list',
  show: 'termination-type-show',
  create: 'termination-type-create',
  edit: 'termination-type-edit',
  delete: 'termination-type-delete'
})

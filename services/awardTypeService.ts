import type { AwardType, CreateAwardTypePayload, UpdateAwardTypePayload } from '~/types/settings'
import { createNameOnlySettingsService } from '~/services/settingsCrudService'

export type { AwardType, CreateAwardTypePayload, UpdateAwardTypePayload }

export const awardTypeService = createNameOnlySettingsService<
  AwardType,
  CreateAwardTypePayload,
  UpdateAwardTypePayload
>('/award-types', {
  plural: 'award types',
  singular: 'award type'
}, {
  list: 'award-type-list',
  show: 'award-type-show',
  create: 'award-type-create',
  edit: 'award-type-edit',
  delete: 'award-type-delete'
})

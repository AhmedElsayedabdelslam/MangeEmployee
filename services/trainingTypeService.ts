import type { CreateTrainingTypePayload, TrainingType, UpdateTrainingTypePayload } from '~/types/settings'
import { createNameOnlySettingsService } from '~/services/settingsCrudService'

export type { TrainingType, CreateTrainingTypePayload, UpdateTrainingTypePayload }

export const trainingTypeService = createNameOnlySettingsService<
  TrainingType,
  CreateTrainingTypePayload,
  UpdateTrainingTypePayload
>('/training-types', {
  plural: 'training types',
  singular: 'training type'
}, {
  list: 'training-type-list',
  show: 'training-type-show',
  create: 'training-type-create',
  edit: 'training-type-edit',
  delete: 'training-type-delete'
})

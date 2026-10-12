import type { CreateGoalTypePayload, GoalType, UpdateGoalTypePayload } from '~/types/settings'
import { createNameOnlySettingsService } from '~/services/settingsCrudService'

export type { GoalType, CreateGoalTypePayload, UpdateGoalTypePayload }

export const goalTypeService = createNameOnlySettingsService<
  GoalType,
  CreateGoalTypePayload,
  UpdateGoalTypePayload
>('/goal-types', {
  plural: 'goal types',
  singular: 'goal type'
}, {
  list: 'goal-type-list',
  show: 'goal-type-show',
  create: 'goal-type-create',
  edit: 'goal-type-edit',
  delete: 'goal-type-delete'
})

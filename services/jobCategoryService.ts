import type { CreateJobCategoryPayload, JobCategory, UpdateJobCategoryPayload } from '~/types/settings'
import { createNameOnlySettingsService } from '~/services/settingsCrudService'

export type { JobCategory, CreateJobCategoryPayload, UpdateJobCategoryPayload }

export const jobCategoryService = createNameOnlySettingsService<
  JobCategory,
  CreateJobCategoryPayload,
  UpdateJobCategoryPayload
>('/job-categories', {
  plural: 'job categories',
  singular: 'job category'
})

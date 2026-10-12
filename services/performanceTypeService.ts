import { createNameOnlySettingsService } from '~/services/settingsCrudService'

export interface PerformanceType {
  id: string
  uuid?: string
  name: string
  created_at?: string
  updated_at?: string
}

export interface PerformanceTypePayload {
  name: string
}

export const performanceTypeService = createNameOnlySettingsService<
  PerformanceType,
  PerformanceTypePayload,
  PerformanceTypePayload
>('/performance-types', {
  plural: 'performance types',
  singular: 'performance type'
}, {
  list: 'performance-type-list',
  show: 'performance-type-show',
  create: 'performance-type-create',
  edit: 'performance-type-edit',
  delete: 'performance-type-delete'
})

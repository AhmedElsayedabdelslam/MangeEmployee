import type { CreatePaymentTypePayload, PaymentType, UpdatePaymentTypePayload } from '~/types/settings'
import { createNameOnlySettingsService } from '~/services/settingsCrudService'

export type { PaymentType, CreatePaymentTypePayload, UpdatePaymentTypePayload }

export const paymentTypeService = createNameOnlySettingsService<
  PaymentType,
  CreatePaymentTypePayload,
  UpdatePaymentTypePayload
>('/payment-types', {
  plural: 'payment types',
  singular: 'payment type'
}, {
  list: 'payment-type-list',
  show: 'payment-type-show',
  create: 'payment-type-create',
  edit: 'payment-type-edit',
  delete: 'payment-type-delete'
})

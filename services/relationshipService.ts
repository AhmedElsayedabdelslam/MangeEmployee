import type { CreateRelationshipPayload, Relationship, UpdateRelationshipPayload } from '~/types/settings'
import { createNameOnlySettingsService } from '~/services/settingsCrudService'

export type { Relationship, CreateRelationshipPayload, UpdateRelationshipPayload }

export const relationshipService = createNameOnlySettingsService<
  Relationship,
  CreateRelationshipPayload,
  UpdateRelationshipPayload
>('/relationships', {
  plural: 'relationships',
  singular: 'relationship'
})

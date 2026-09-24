import { Type } from '@sinclair/typebox'

export const CampaignDocumentResponseSchema = Type.Object({
  id: Type.String(),
  campaignId: Type.String(),
  displayName: Type.String(),
  fileName: Type.String(),
  mimeType: Type.String(),
  fileSize: Type.Integer(),
  cloudinaryUrl: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

export const CampaignDocumentListResponseSchema = Type.Object({
  documents: Type.Array(CampaignDocumentResponseSchema),
})

export const CampaignDocumentErrorResponseSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
})
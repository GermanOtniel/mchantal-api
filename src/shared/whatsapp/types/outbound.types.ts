export type SendTextMessageInput = {
  toWaId: string
  text: string
  replyToProviderMessageId?: string
}

export type SendTextMessageResult = {
  providerMessageId: string
}

export type SendInteractiveButtonsInput = {
  toWaId: string
  body: string
  buttons: Array<{ id: string; title: string }>
}

export type SendInteractiveButtonsResult = {
  providerMessageId: string
}

export type WebhookSubscriptionQuery = {
  mode?: string
  verifyToken?: string
  challenge?: string
}

export type SendMediaMessageInput = {
  toWaId: string
  mediaType: 'image' | 'document'
  mediaId: string
  caption?: string
  fileName?: string
}

export type SendMediaMessageResult = {
  providerMessageId: string
}

export type UploadMediaInput = {
  mimeType: string
  buffer: Buffer
  fileName?: string
}

export type UploadMediaResult = {
  mediaId: string
}
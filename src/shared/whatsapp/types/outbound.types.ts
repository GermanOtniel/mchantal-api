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
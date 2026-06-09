export type SendTextMessageInput = {
  toWaId: string
  text: string
  replyToProviderMessageId?: string
}

export type SendTextMessageResult = {
  providerMessageId: string
}

export type WebhookSubscriptionQuery = {
  mode?: string
  verifyToken?: string
  challenge?: string
}

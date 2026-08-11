import type {
  SendInteractiveButtonsInput,
  SendInteractiveButtonsResult,
  SendTextMessageInput,
  SendTextMessageResult,
} from './types/outbound.types'

/**
 * Contrato minimo para ENVIAR mensajes. El motor depende solo de esto.
 * El provider completo (con parseo/verificacion de webhook) se define en el step 3.
 */
export interface WhatsAppSender {
  sendTextMessage(input: SendTextMessageInput): Promise<SendTextMessageResult>
  sendInteractiveButtons(
    input: SendInteractiveButtonsInput
  ): Promise<SendInteractiveButtonsResult>
}
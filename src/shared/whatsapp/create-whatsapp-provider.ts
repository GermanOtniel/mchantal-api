import type { WhatsAppEnv } from '../../config/env'
import type { WhatsAppProvider } from './whatsapp-provider.interface'
import { MetaWhatsAppProvider } from './meta/meta-whatsapp.provider'

export function createWhatsAppProvider(env: WhatsAppEnv): WhatsAppProvider {
  switch (env.provider) {
    case 'meta':
      return new MetaWhatsAppProvider(env)
    case 'dialog360':
      throw new Error(
        'WhatsApp provider "dialog360" is not implemented yet. Use WHATSAPP_PROVIDER=meta.'
      )
    default: {
      const _exhaustive: never = env.provider
      throw new Error(`Unknown WhatsApp provider: ${_exhaustive}`)
    }
  }
}

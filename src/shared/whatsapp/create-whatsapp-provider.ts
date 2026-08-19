import type { WhatsAppEnv } from './meta/meta-whatsapp.provider'
import type { WhatsAppProvider } from './whatsapp-provider.interface'
import { MetaWhatsAppProvider } from './meta/meta-whatsapp.provider'

/**
 * main sólo soporta el provider Meta. Seam para futuros providers.
 * `WhatsAppEnv` (en main) no incluye campo `provider` — es config Meta directa,
 * por eso aquí no hay switch sobre `env.provider` (a diferencia de develop).
 */
export function createWhatsAppProvider(env: WhatsAppEnv): WhatsAppProvider {
  return new MetaWhatsAppProvider(env)
}
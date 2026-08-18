import type { MigrationInterface, QueryRunner } from 'typeorm'

// Diccionario preset de los 32 estados de México con aliases (ciudades-proxy,
// abreviaturas, variantes). Se inserta como is_system=true, idempotente.
const ESTADOS = [
  { id: 'aguascalientes', label: 'Aguascalientes', aliases: ['aguascalientes', 'ags', 'aguas'] },
  { id: 'baja_california', label: 'Baja California', aliases: ['baja california', 'bc', 'tijuana', 'mexicali', 'tecate'] },
  { id: 'baja_california_sur', label: 'Baja California Sur', aliases: ['baja california sur', 'bcs', 'la paz', 'los cabos', 'cabo', 'loreto'] },
  { id: 'campeche', label: 'Campeche', aliases: ['campeche', 'cam'] },
  { id: 'chiapas', label: 'Chiapas', aliases: ['chiapas', 'tuxtla gutierrez', 'tuxtla', 'chis'] },
  { id: 'chihuahua', label: 'Chihuahua', aliases: ['chihuahua', 'chih', 'juarez', 'cd juarez'] },
  { id: 'cdmx', label: 'Ciudad de México', aliases: ['ciudad de mexico', 'cdmx', 'df', 'distrito federal', 'mexico city', 'caba'] },
  { id: 'coahuila', label: 'Coahuila', aliases: ['coahuila', 'saltillo', 'torreon', 'coah'] },
  { id: 'colima', label: 'Colima', aliases: ['colima', 'col'] },
  { id: 'durango', label: 'Durango', aliases: ['durango', 'dgo'] },
  { id: 'estado_mexico', label: 'Estado de México', aliases: ['estado de mexico', 'edomex', 'toluca', 'mexiquense', 'mexico estado'] },
  { id: 'guanajuato', label: 'Guanajuato', aliases: ['guanajuato', 'gto', 'leon', 'celaya', 'irapuato'] },
  { id: 'guerrero', label: 'Guerrero', aliases: ['guerrero', 'acapulco', 'chilpancingo', 'gro'] },
  { id: 'hidalgo', label: 'Hidalgo', aliases: ['hidalgo', 'pachuca', 'hgo'] },
  { id: 'jalisco', label: 'Jalisco', aliases: ['jalisco', 'guadalajara', 'gdl', 'jal', 'zapopan', 'tap'] },
  { id: 'michoacan', label: 'Michoacán', aliases: ['michoacan', 'morelia', 'mic', 'urtuapan'] },
  { id: 'morelos', label: 'Morelos', aliases: ['morelos', 'cuernavaca', 'mor'] },
  { id: 'nayarit', label: 'Nayarit', aliases: ['nayarit', 'nay', 'tepic'] },
  { id: 'nuevo_leon', label: 'Nuevo León', aliases: ['nuevo leon', 'monterrey', 'mty', 'nl', 'rey', 'san pedro'] },
  { id: 'oaxaca', label: 'Oaxaca', aliases: ['oaxaca', 'oax', 'huatulco', 'puerto escondido'] },
  { id: 'puebla', label: 'Puebla', aliases: ['puebla', 'pue'] },
  { id: 'queretaro', label: 'Querétaro', aliases: ['queretaro', 'qro'] },
  { id: 'quintana_roo', label: 'Quintana Roo', aliases: ['quintana roo', 'cancun', 'q roo', 'qr', 'playa del carmen', 'tulum'] },
  { id: 'san_luis_potosi', label: 'San Luis Potosí', aliases: ['san luis potosi', 'slp', 'san luis'] },
  { id: 'sinaloa', label: 'Sinaloa', aliases: ['sinaloa', 'culiacan', 'sin', 'mazatlan'] },
  { id: 'sonora', label: 'Sonora', aliases: ['sonora', 'hermosillo', 'son', 'ciudad obregon', 'guaymas'] },
  { id: 'tabasco', label: 'Tabasco', aliases: ['tabasco', 'villahermosa', 'tab'] },
  { id: 'tamaulipas', label: 'Tamaulipas', aliases: ['tamaulipas', 'tamps', 'victoria', 'tampico', 'matamoros', 'reynosa'] },
  { id: 'tlaxcala', label: 'Tlaxcala', aliases: ['tlaxcala', 'tlax'] },
  { id: 'veracruz', label: 'Veracruz', aliases: ['veracruz', 'ver', 'xalapa', 'jalapa', 'veracruz puerto'] },
  { id: 'yucatan', label: 'Yucatán', aliases: ['yucatan', 'merida', 'yuc'] },
  { id: 'zacatecas', label: 'Zacatecas', aliases: ['zacatecas', 'zac'] },
]

export const ESTADOS_DE_MEXICO = ESTADOS

export class MatcherDictionaryPresetsSeed1750200000000 implements MigrationInterface {
  name = 'MatcherDictionaryPresetsSeed1750200000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const json = JSON.stringify(ESTADOS).replace(/'/g, "''")
    await queryRunner.query(`
      INSERT INTO "matcher_dictionaries" ("slug", "name", "categories", "is_system")
      VALUES ('estados-de-mexico', 'Estados de México', '${json}'::jsonb, true)
      ON CONFLICT ("slug") DO NOTHING
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "matcher_dictionaries" WHERE "slug" = 'estados-de-mexico' AND "is_system" = true`)
  }
}
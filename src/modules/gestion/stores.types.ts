import { z } from 'zod'

export const StoreTypeSchema = z.enum(['PHYSICAL', 'ONLINE'])

/**
 * Champs bruts, sans valeur par défaut. Les défauts ne vivent que sur le schéma
 * de création : appliqués à un PATCH, ils réécriraient avec leur valeur par
 * défaut tout champ absent de la requête (`.partial()` de Zod conserve les
 * `.default()`), et une simple bascule de drapeau remettrait le type, l'ordre et
 * l'activation à zéro.
 */
const storeFields = {
  name: z.string().min(2).max(80),
  type: StoreTypeSchema,
  address: z.string().max(200),
  phone: z.string().max(40),
  /** Boutique recevant les commandes du site. Une seule à la fois. */
  isDefaultOnline: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0),
}

export const CreateStoreSchema = z.object({
  name: storeFields.name,
  type: storeFields.type.default('PHYSICAL'),
  address: storeFields.address.optional(),
  phone: storeFields.phone.optional(),
  isDefaultOnline: storeFields.isDefaultOnline.default(false),
  isActive: storeFields.isActive.default(true),
  sortOrder: storeFields.sortOrder.default(0),
})

export const UpdateStoreSchema = z.object(storeFields).partial()

export type CreateStoreInput = z.infer<typeof CreateStoreSchema>
export type UpdateStoreInput = z.infer<typeof UpdateStoreSchema>

import { z } from 'zod'

/**
 * Sans valeur par défaut : appliqués à un PATCH, les `.default()` de Zod
 * réécriraient les champs absents de la requête (`.partial()` les conserve).
 */
const shipmentFields = {
  /** Identifiant du lot, à la manière du suivi Excel : G1, G2… */
  code: z.string().min(1).max(20).trim().toUpperCase(),
  label: z.string().max(120),
  /** Boutique par défaut du lot ; chaque ligne peut la remplacer. */
  storeId: z.string().nullable(),
  shippingCost: z.number().min(0),
  orderedAt: z.iso.datetime(),
  notes: z.string().max(2000),
}

export const CreateShipmentSchema = z.object({
  /** Absent = code attribué automatiquement (G1, G2…). */
  code: shipmentFields.code.optional(),
  label: shipmentFields.label.optional(),
  storeId: shipmentFields.storeId.optional(),
  shippingCost: shipmentFields.shippingCost.default(0),
  orderedAt: shipmentFields.orderedAt.optional(),
  notes: shipmentFields.notes.optional(),
})

export const UpdateShipmentSchema = z.object(shipmentFields).partial()

const itemFields = {
  productId: z.string().min(1),
  /** Absente = la boutique par défaut du lot. */
  storeId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitCost: z.number().min(0),
  plannedPrice: z.number().min(0),
}

export const CreateShipmentItemSchema = z.object({
  productId: itemFields.productId,
  storeId: itemFields.storeId.optional(),
  quantity: itemFields.quantity,
  unitCost: itemFields.unitCost,
  plannedPrice: itemFields.plannedPrice.optional(),
})

export const UpdateShipmentItemSchema = z
  .object({
    storeId: itemFields.storeId,
    quantity: itemFields.quantity,
    unitCost: itemFields.unitCost,
    plannedPrice: itemFields.plannedPrice.nullable(),
  })
  .partial()

export const ShipmentQuerySchema = z.object({
  status: z.enum(['DRAFT', 'RECEIVED', 'CANCELLED']).optional(),
})

export type CreateShipmentInput = z.infer<typeof CreateShipmentSchema>
export type UpdateShipmentInput = z.infer<typeof UpdateShipmentSchema>
export type CreateShipmentItemInput = z.infer<typeof CreateShipmentItemSchema>
export type UpdateShipmentItemInput = z.infer<typeof UpdateShipmentItemSchema>
export type ShipmentQuery = z.infer<typeof ShipmentQuerySchema>

import { z } from 'zod'

/**
 * Sans valeur par défaut : appliqués à un PATCH, les `.default()` de Zod
 * réécriraient les champs absents de la requête (`.partial()` les conserve).
 */
const code = z.string().min(1).max(20).trim().toUpperCase()

// ─── Arrivages (la commande) ─────────────────────────────────────────────────

const shipmentFields = {
  /** Identifiant de l'arrivage : A1, A2… */
  code,
  label: z.string().max(120),
  /** Boutique par défaut du lot ; chaque ligne peut la remplacer. */
  storeId: z.string().nullable(),
  orderedAt: z.iso.datetime(),
  notes: z.string().max(2000),
}

export const CreateShipmentSchema = z.object({
  /** Absent = code attribué automatiquement (A1, A2…). */
  code: shipmentFields.code.optional(),
  label: shipmentFields.label.optional(),
  storeId: shipmentFields.storeId.optional(),
  orderedAt: shipmentFields.orderedAt.optional(),
  notes: shipmentFields.notes.optional(),
})

export const UpdateShipmentSchema = z.object(shipmentFields).partial()

const itemFields = {
  productId: z.string().min(1),
  /** Absente = la boutique par défaut du lot. */
  storeId: z.string().min(1),
  /** Quantité commandée. */
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
  status: z.enum(['DRAFT', 'PARTIAL', 'RECEIVED', 'CANCELLED']).optional(),
})

// ─── Groupes (les livraisons) ────────────────────────────────────────────────

/** Quantité livrée d'une ligne commandée. */
const groupLine = z.object({
  shipmentItemId: z.string().min(1),
  quantity: z.number().int().positive(),
})

const groupFields = {
  /** Identifiant du groupe, à la manière du suivi Excel : G1, G2… */
  code,
  label: z.string().max(120),
  shippingCost: z.number().min(0),
  /** Remplace l'ensemble des lignes livrées du groupe. */
  items: z.array(groupLine).min(1),
}

export const CreateShipmentGroupSchema = z.object({
  shipmentId: z.string().min(1),
  /** Absent = code attribué automatiquement (G1, G2…). */
  code: groupFields.code.optional(),
  label: groupFields.label.optional(),
  shippingCost: groupFields.shippingCost.default(0),
  items: groupFields.items,
})

export const UpdateShipmentGroupSchema = z.object(groupFields).partial()

export const ShipmentGroupQuerySchema = z.object({
  shipmentId: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'RECEIVED']).optional(),
})

export type CreateShipmentInput = z.infer<typeof CreateShipmentSchema>
export type UpdateShipmentInput = z.infer<typeof UpdateShipmentSchema>
export type CreateShipmentItemInput = z.infer<typeof CreateShipmentItemSchema>
export type UpdateShipmentItemInput = z.infer<typeof UpdateShipmentItemSchema>
export type ShipmentQuery = z.infer<typeof ShipmentQuerySchema>
export type CreateShipmentGroupInput = z.infer<typeof CreateShipmentGroupSchema>
export type UpdateShipmentGroupInput = z.infer<typeof UpdateShipmentGroupSchema>
export type ShipmentGroupQuery = z.infer<typeof ShipmentGroupQuerySchema>

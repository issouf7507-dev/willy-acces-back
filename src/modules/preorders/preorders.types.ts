import { z } from 'zod'

const STATUSES = ['NEW', 'CONFIRMED', 'DELIVERED', 'CANCELLED'] as const

/**
 * Le client ne choisit ni le prix ni le produit par leur libellé : il envoie des
 * `productId`, et le serveur relit le nom, le prix applicable et la date de
 * sortie en base. Sinon n'importe qui pourrait précommander à son propre tarif.
 */
export const CreatePreorderItemSchema = z.object({
  productId: z.string().min(1, 'Produit requis'),
  color: z.string().max(60).optional(),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
})

export const CreatePreorderSchema = z.object({
  name: z.string().min(2, 'Nom requis'),
  phone: z.string().min(6, 'Téléphone requis'),
  deliveryPlace: z.string().min(2, 'Lieu de livraison requis').max(191),
  items: z.array(CreatePreorderItemSchema).min(1, 'Au moins un produit').max(50),
})

export const UpdatePreorderSchema = z.object({
  status: z.enum(STATUSES).optional(),
  adminNote: z.string().max(2000).optional(),
})

export const PreorderQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(STATUSES).optional(),
})

export type CreatePreorderInput = z.infer<typeof CreatePreorderSchema>
export type UpdatePreorderInput = z.infer<typeof UpdatePreorderSchema>
export type PreorderQuery = z.infer<typeof PreorderQuerySchema>

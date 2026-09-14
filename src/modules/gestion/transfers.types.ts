import { z } from 'zod'

export const CreateTransferSchema = z
  .object({
    productId: z.string().min(1),
    fromStoreId: z.string().min(1),
    toStoreId: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().max(500).optional(),
  })
  .refine((t) => t.fromStoreId !== t.toStoreId, {
    message: 'La boutique de départ et celle d’arrivée doivent être différentes',
    path: ['toStoreId'],
  })

export const TransferQuerySchema = z.object({
  productId: z.string().optional(),
  storeId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
})

export type CreateTransferInput = z.infer<typeof CreateTransferSchema>
export type TransferQuery = z.infer<typeof TransferQuerySchema>

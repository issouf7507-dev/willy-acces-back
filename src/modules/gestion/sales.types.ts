import { z } from 'zod'

export const PaymentMethodSchema = z.enum([
  'CASH',
  'MOBILE_MONEY',
  'BANK_TRANSFER',
  'CARD',
  'OTHER',
])

export const SaleItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  /** Absent = prix applicable du catalogue (promo ou précommande incluse). */
  unitPrice: z.number().min(0).optional(),
  /** Remise sur la ligne entière, en FCFA — pas par unité. */
  discountAmount: z.number().min(0).default(0),
  discountReason: z.string().max(120).optional(),
})

export const CreateSaleSchema = z.object({
  storeId: z.string().min(1),
  /** Absent = la personne connectée. Un VENDEUR ne peut pas en désigner une autre. */
  sellerId: z.string().optional(),
  customerId: z.string().optional(),
  /** Client saisi au comptoir : retrouvé par téléphone, ou créé à la volée. */
  customer: z
    .object({ name: z.string().min(2).max(80), phone: z.string().min(6).max(30).optional() })
    .optional(),
  items: z.array(SaleItemSchema).min(1),
  paymentMethod: PaymentMethodSchema.default('CASH'),
  notes: z.string().max(2000).optional(),
  /** Vente saisie après coup : date réelle de l'encaissement. */
  soldAt: z.iso.datetime().optional(),
})

/** Encaissement d'une commande déjà passée sur le site. */
export const CashInSchema = z.object({
  /** Boutique qui fournit la marchandise. Imposée pour une vendeuse. */
  storeId: z.string().min(1),
  sellerId: z.string().optional(),
  paymentMethod: PaymentMethodSchema.default('CASH'),
})

export const SalesQuerySchema = z.object({
  storeId: z.string().optional(),
  sellerId: z.string().optional(),
  customerId: z.string().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  channel: z.enum(['ONLINE', 'IN_STORE']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

/** Bornes du rapport de recettes. Absentes = les 30 derniers jours. */
export const DailyReportQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})

export type CashInInput = z.infer<typeof CashInSchema>
export type CreateSaleInput = z.infer<typeof CreateSaleSchema>
export type SalesQuery = z.infer<typeof SalesQuerySchema>
export type DailyReportQuery = z.infer<typeof DailyReportQuerySchema>

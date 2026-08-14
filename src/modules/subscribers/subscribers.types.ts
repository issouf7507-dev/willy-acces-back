import { z } from 'zod'

export const CreateSubscriberSchema = z.object({
  firstName: z.string().min(2, 'Prénom requis').max(80),
  lastName: z.string().min(2, 'Nom requis').max(80),
  phone: z.string().min(8, 'Téléphone requis').max(20),
  // Facultatif : le canal principal reste le téléphone (WhatsApp/SMS).
  email: z.email('E-mail invalide').optional().or(z.literal('')),
})

export const SubscriberQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  /** Recherche libre sur nom, prénom, téléphone ou e-mail. */
  search: z.string().max(80).optional(),
})

export type CreateSubscriberInput = z.infer<typeof CreateSubscriberSchema>
export type SubscriberQuery = z.infer<typeof SubscriberQuerySchema>

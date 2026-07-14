import { z } from 'zod'

export const CreateQuoteSchema = z.object({
  name: z.string().min(2, 'Nom requis'),
  phone: z.string().min(6, 'Téléphone requis'),
  email: z.email().optional().or(z.literal('')),
  services: z.array(z.string().min(1)).min(1, 'Sélectionnez au moins une prestation'),
  occasion: z.string().optional(),
  eventDate: z.coerce.date().optional(),
  location: z.enum(['salon', 'domicile']).default('salon'),
  guests: z.coerce.number().int().min(1).default(1),
  budget: z.string().optional(),
  message: z.string().max(2000).optional(),
})

export const UpdateQuoteSchema = z.object({
  status: z.enum(['NEW', 'IN_REVIEW', 'QUOTED', 'ACCEPTED', 'DECLINED', 'CLOSED']).optional(),
  adminNote: z.string().max(2000).optional(),
})

export const QuoteQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['NEW', 'IN_REVIEW', 'QUOTED', 'ACCEPTED', 'DECLINED', 'CLOSED']).optional(),
})

export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>
export type UpdateQuoteInput = z.infer<typeof UpdateQuoteSchema>
export type QuoteQuery = z.infer<typeof QuoteQuerySchema>

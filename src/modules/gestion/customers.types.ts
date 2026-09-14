import { z } from 'zod'

/** Sans défaut : voir la note de `stores.types.ts` — un `.default()` conservé
 *  par `.partial()` réécrirait les champs absents d'un PATCH. */
const customerFields = {
  name: z.string().min(2).max(80),
  /** Identité du client de comptoir : le téléphone, comme pour les inscrits. */
  phone: z.string().min(6).max(30),
  email: z.email(),
  notes: z.string().max(2000),
  isActive: z.boolean(),
}

export const CreateCustomerSchema = z.object({
  name: customerFields.name,
  phone: customerFields.phone.optional(),
  email: customerFields.email.optional(),
  notes: customerFields.notes.optional(),
  isActive: customerFields.isActive.default(true),
})

export const UpdateCustomerSchema = z.object(customerFields).partial()

export const CustomerQuerySchema = z.object({
  search: z.string().optional(),
  includeInactive: z.coerce.boolean().default(false),
})

export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>
export type CustomerQuery = z.infer<typeof CustomerQuerySchema>

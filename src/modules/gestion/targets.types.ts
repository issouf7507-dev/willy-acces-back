import { z } from 'zod'

const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Mois attendu au format YYYY-MM')

export const UpsertTargetSchema = z.object({
  month: MonthSchema,
  storeId: z.string().min(1),
  amount: z.number().min(0),
})

export const TargetQuerySchema = z.object({
  month: MonthSchema.optional(),
})

export type UpsertTargetInput = z.infer<typeof UpsertTargetSchema>
export type TargetQuery = z.infer<typeof TargetQuerySchema>

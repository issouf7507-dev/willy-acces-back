import { z } from 'zod'

/** Sans défaut : un `.default()` conservé par `.partial()` réécrirait les
 *  champs absents d'un PATCH. Voir `stores.types.ts`. */
const expenseFields = {
  date: z.iso.date(),
  label: z.string().min(2).max(160),
  amount: z.number().min(0),
  storeId: z.string().nullable(),
  notes: z.string().max(2000).nullable(),
}

export const CreateExpenseSchema = z.object({
  date: expenseFields.date,
  label: expenseFields.label,
  amount: expenseFields.amount,
  storeId: expenseFields.storeId.optional(),
  notes: expenseFields.notes.optional(),
})

export const UpdateExpenseSchema = z.object(expenseFields).partial()

export const ExpenseQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Mois `YYYY-MM` : raccourci pour les bornes du mois entier. */
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  storeId: z.string().optional(),
})

const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Mois attendu au format YYYY-MM')

/** Les cinq charges obligatoires du mois, plus le taux de répartition. */
export const UpsertClosingSchema = z.object({
  rent: z.number().min(0).default(0),
  salaries: z.number().min(0).default(0),
  utilities: z.number().min(0).default(0),
  transportTaxes: z.number().min(0).default(0),
  other: z.number().min(0).default(0),
  /** Part affectée aux achats, entre 0 et 1. Le reste va à l'épargne. */
  purchaseRate: z.number().min(0).max(1).default(0.65),
  notes: z.string().max(2000).optional(),
})

export const ClosingParamSchema = z.object({ month: MonthSchema })

export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>
export type ExpenseQuery = z.infer<typeof ExpenseQuerySchema>
export type UpsertClosingInput = z.infer<typeof UpsertClosingSchema>

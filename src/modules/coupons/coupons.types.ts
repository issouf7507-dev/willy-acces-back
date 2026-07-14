import { z } from 'zod'

export const CreateCouponSchema = z.object({
  code: z.string().min(3).max(50).toUpperCase(),
  description: z.string().optional(),
  type: z.enum(['PERCENTAGE', 'FIXED']),
  value: z.number().positive(),
  minPurchase: z.number().positive().optional(),
  maxDiscount: z.number().positive().optional(),
  usageLimit: z.number().int().positive().optional(),
  perUserLimit: z.number().int().positive().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
  categoryIds: z.array(z.string()).optional(),
  productIds: z.array(z.string()).optional(),
})

export const UpdateCouponSchema = CreateCouponSchema.partial()

export type CreateCouponInput = z.infer<typeof CreateCouponSchema>

import { z } from 'zod'

export const OrderItemInputSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  quantity: z.number().int().positive(),
})

export const CreateOrderSchema = z.object({
  items: z.array(OrderItemInputSchema).min(1),
  addressId: z.string().optional(),
  couponCode: z.string().optional(),
  notes: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().optional(),
  customerPhone: z.string().optional(),
})

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
})

export const OrderQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']).optional(),
  userId: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>
export type OrderQuery = z.infer<typeof OrderQuerySchema>

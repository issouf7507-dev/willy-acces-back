import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { authenticate, requireRole } from '../../middlewares/auth.js'

const router = Router()

const MovementSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  quantity: z.number().int(),
  type: z.enum(['RESTOCK', 'SALE', 'ADJUSTMENT', 'RETURN', 'DAMAGE']),
  note: z.string().optional(),
  reference: z.string().optional(),
})

router.get(
  '/products/:productId',
  authenticate,
  requireRole('ADMIN', 'MANAGER', 'STAFF'),
  async (req, res, next) => {
    try {
      const movements = await prisma.inventory.findMany({
        where: { productId: String(req.params.productId) },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      res.json({ success: true, data: movements })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/',
  authenticate,
  requireRole('ADMIN', 'MANAGER', 'STAFF'),
  async (req, res, next) => {
    try {
      const input = MovementSchema.parse(req.body)

      const [movement] = await prisma.$transaction([
        prisma.inventory.create({ data: input }),
        prisma.product.update({
          where: { id: input.productId },
          data: { stock: { increment: input.quantity } },
        }),
      ])

      res.status(201).json({ success: true, data: movement })
    } catch (err) {
      next(err)
    }
  },
)

export default router

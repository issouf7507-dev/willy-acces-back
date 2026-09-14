import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { authenticate, requireRole } from '../../middlewares/auth.js'
import { resolveStoreScope } from '../../lib/store-scope.js'

const router = Router()

const MovementSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  /** Obligatoire : un mouvement sans boutique laisserait la répartition fausse. */
  storeId: z.string(),
  quantity: z.number().int(),
  type: z.enum(['RESTOCK', 'SALE', 'ADJUSTMENT', 'RETURN', 'DAMAGE', 'TRANSFER']),
  note: z.string().optional(),
  reference: z.string().optional(),
})

router.get(
  '/products/:productId',
  authenticate,
  requireRole('SUPER_ADMIN', 'ADMIN', 'VENDEUR'),
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
  requireRole('SUPER_ADMIN', 'ADMIN', 'VENDEUR'),
  async (req, res, next) => {
    try {
      const parsed = MovementSchema.parse(req.body)
      // Une vendeuse ne peut mouvementer que le stock de sa boutique.
      const storeId = (await resolveStoreScope(req.user!, parsed.storeId))!
      const input = { ...parsed, storeId }

      const [movement] = await prisma.$transaction([
        prisma.inventory.create({ data: input }),
        prisma.product.update({
          where: { id: input.productId },
          data: { stock: { increment: input.quantity } },
        }),
        prisma.storeStock.upsert({
          where: { productId_storeId: { productId: input.productId, storeId: input.storeId } },
          create: {
            productId: input.productId,
            storeId: input.storeId,
            quantity: input.quantity,
          },
          update: { quantity: { increment: input.quantity } },
        }),
      ])

      res.status(201).json({ success: true, data: movement })
    } catch (err) {
      next(err)
    }
  },
)

export default router

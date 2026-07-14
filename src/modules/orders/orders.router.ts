import { Router } from 'express'
import { CreateOrderSchema, UpdateOrderStatusSchema, OrderQuerySchema } from './orders.types.js'
import * as ordersService from './orders.service.js'
import { authenticate, requireRole } from '../../middlewares/auth.js'

const router = Router()

router.get('/', authenticate, async (req, res, next) => {
  try {
    const query = OrderQuerySchema.parse(req.query)
    const isAdmin = ['ADMIN', 'MANAGER', 'STAFF'].includes(req.user!.role)
    const result = await ordersService.listOrders(query, req.user!.userId, isAdmin)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const isAdmin = ['ADMIN', 'MANAGER', 'STAFF'].includes(req.user!.role)
    const order = await ordersService.getOrder(String(req.params.id), isAdmin ? undefined : req.user!.userId)
    res.json({ success: true, data: order })
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const input = CreateOrderSchema.parse(req.body)
    const userId = (req as any).user?.userId as string | undefined
    const order = await ordersService.createOrder(input, userId)
    res.status(201).json({ success: true, data: order })
  } catch (err) {
    next(err)
  }
})

router.patch(
  '/:id/status',
  authenticate,
  requireRole('ADMIN', 'MANAGER', 'STAFF'),
  async (req, res, next) => {
    try {
      const { status } = UpdateOrderStatusSchema.parse(req.body)
      const order = await ordersService.updateOrderStatus(String(req.params.id), status)
      res.json({ success: true, data: order })
    } catch (err) {
      next(err)
    }
  },
)

export default router

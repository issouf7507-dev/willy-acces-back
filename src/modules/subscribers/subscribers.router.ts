import { Router } from 'express'
import { CreateSubscriberSchema, SubscriberQuerySchema } from './subscribers.types.js'
import * as subscribersService from './subscribers.service.js'
import { authenticate, requireRole } from '../../middlewares/auth.js'
import { subscribeLimiter } from '../../middlewares/rateLimit.js'

const router = Router()

// Public — inscription depuis la boutique (notifications, promos, jeux)
router.post('/', subscribeLimiter, async (req, res, next) => {
  try {
    const input = CreateSubscriberSchema.parse(req.body)
    const subscriber = await subscribersService.createSubscriber(input)
    res.status(201).json({ success: true, data: subscriber })
  } catch (err) {
    next(err)
  }
})

// Admin — consultation des inscrits
router.get('/', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'VENDEUR'), async (req, res, next) => {
  try {
    const query = SubscriberQuerySchema.parse(req.query)
    const result = await subscribersService.listSubscribers(query)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'VENDEUR'), async (req, res, next) => {
  try {
    await subscribersService.deleteSubscriber(String(req.params.id))
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

export default router

import { Router } from 'express'
import {
  CreateReviewSchema,
  listProductReviews,
  createReview,
  approveReview,
  deleteReview,
  listPendingReviews,
} from './reviews.service.js'
import { authenticate, requireRole } from '../../middlewares/auth.js'

const router = Router()

router.get('/products/:productId', async (req, res, next) => {
  try {
    const reviews = await listProductReviews(String(req.params.productId))
    res.json({ success: true, data: reviews })
  } catch (err) {
    next(err)
  }
})

router.get('/pending', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const reviews = await listPendingReviews()
    res.json({ success: true, data: reviews })
  } catch (err) {
    next(err)
  }
})

router.post('/', authenticate, async (req, res, next) => {
  try {
    const input = CreateReviewSchema.parse(req.body)
    const review = await createReview(input, req.user!.userId)
    res.status(201).json({ success: true, data: review })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id/approve', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const review = await approveReview(String(req.params.id))
    res.json({ success: true, data: review })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const isAdmin = ['ADMIN', 'MANAGER'].includes(req.user!.role)
    await deleteReview(String(req.params.id), req.user!.userId, isAdmin)
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

export default router

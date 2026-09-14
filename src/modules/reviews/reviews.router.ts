import { Router } from 'express'
import { z } from 'zod'
import {
  CreateReviewSchema,
  CreatePublicReviewSchema,
  listProductReviews,
  createReview,
  createPublicReview,
  approveReview,
  deleteReview,
  listPendingReviews,
  listFeaturedReviews,
} from './reviews.service.js'
import { authenticate, requireRole } from '../../middlewares/auth.js'
import { reviewLimiter } from '../../middlewares/rateLimit.js'

const router = Router()

const FeaturedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).default(6),
})

// Témoignages de la vitrine — public, avis approuvés uniquement.
router.get('/featured', async (req, res, next) => {
  try {
    const { limit } = FeaturedQuerySchema.parse(req.query)
    const reviews = await listFeaturedReviews(limit)
    res.json({ success: true, data: reviews })
  } catch (err) {
    next(err)
  }
})

router.get('/products/:productId', async (req, res, next) => {
  try {
    const reviews = await listProductReviews(String(req.params.productId))
    res.json({ success: true, data: reviews })
  } catch (err) {
    next(err)
  }
})

// Dépôt d'un avis depuis la boutique, sans compte. Toujours en attente de
// modération : voir createPublicReview.
router.post('/public', reviewLimiter, async (req, res, next) => {
  try {
    const input = CreatePublicReviewSchema.parse(req.body)
    const review = await createPublicReview(input)
    res.status(201).json({ success: true, data: review })
  } catch (err) {
    next(err)
  }
})

router.get('/pending', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'VENDEUR'), async (req, res, next) => {
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

router.patch('/:id/approve', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'VENDEUR'), async (req, res, next) => {
  try {
    const review = await approveReview(String(req.params.id))
    res.json({ success: true, data: review })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'VENDEUR'].includes(req.user!.role)
    await deleteReview(String(req.params.id), req.user!.userId, isAdmin)
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

export default router

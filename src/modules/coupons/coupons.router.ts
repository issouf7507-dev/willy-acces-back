import { Router } from 'express'
import { CreateCouponSchema, UpdateCouponSchema } from './coupons.types.js'
import * as couponsService from './coupons.service.js'
import { authenticate, requireRole } from '../../middlewares/auth.js'

const router = Router()

router.get('/', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const coupons = await couponsService.listCoupons()
    res.json({ success: true, data: coupons })
  } catch (err) {
    next(err)
  }
})

router.post('/validate', async (req, res, next) => {
  try {
    const { code, subtotal } = req.body as { code: string; subtotal: number }
    const result = await couponsService.validateCoupon(code, subtotal)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const coupon = await couponsService.getCoupon(String(req.params.id))
    res.json({ success: true, data: coupon })
  } catch (err) {
    next(err)
  }
})

router.post('/', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const input = CreateCouponSchema.parse(req.body)
    const coupon = await couponsService.createCoupon(input)
    res.status(201).json({ success: true, data: coupon })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const input = UpdateCouponSchema.parse(req.body)
    const coupon = await couponsService.updateCoupon(String(req.params.id), input)
    res.json({ success: true, data: coupon })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await couponsService.deleteCoupon(String(req.params.id))
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

export default router

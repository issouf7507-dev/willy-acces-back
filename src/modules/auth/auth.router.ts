import { Router } from 'express'
import { RegisterSchema, LoginSchema } from './auth.types.js'
import * as authService from './auth.service.js'
import { authenticate } from '../../middlewares/auth.js'
import { authLimiter } from '../../middlewares/rateLimit.js'

const router = Router()

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const input = RegisterSchema.parse(req.body)
    const result = await authService.register(
      input,
      req.headers['user-agent'],
      req.ip,
    )
    res.status(201).json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const input = LoginSchema.parse(req.body)
    const result = await authService.login(input, req.headers['user-agent'], req.ip)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const token = req.headers.authorization!.slice(7)
    await authService.logout(token)
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user!.userId)
    res.json({ success: true, data: user })
  } catch (err) {
    next(err)
  }
})

export default router

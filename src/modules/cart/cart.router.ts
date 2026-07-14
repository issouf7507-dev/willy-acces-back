import { Router } from 'express'
import * as cartService from './cart.service.js'

const router = Router()

function getIdentifiers(req: any) {
  const userId = req.user?.userId as string | undefined
  const sessionId = req.headers['x-session-id'] as string | undefined
  return { userId, sessionId }
}

router.get('/', async (req, res, next) => {
  try {
    const { userId, sessionId } = getIdentifiers(req)
    const cart = await cartService.getCart(userId, sessionId)
    res.json({ success: true, data: cart })
  } catch (err) {
    next(err)
  }
})

router.post('/items', async (req, res, next) => {
  try {
    const { userId, sessionId } = getIdentifiers(req)
    const { productId, quantity = 1, variantId } = req.body
    const cart = await cartService.addToCart(productId, quantity, userId, sessionId, variantId)
    res.json({ success: true, data: cart })
  } catch (err) {
    next(err)
  }
})

router.patch('/items/:itemId', async (req, res, next) => {
  try {
    const { userId, sessionId } = getIdentifiers(req)
    const { quantity } = req.body
    const cart = await cartService.updateCartItem(req.params.itemId, quantity, userId, sessionId)
    res.json({ success: true, data: cart })
  } catch (err) {
    next(err)
  }
})

router.delete('/', async (req, res, next) => {
  try {
    const { userId, sessionId } = getIdentifiers(req)
    await cartService.clearCart(userId, sessionId)
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

export default router

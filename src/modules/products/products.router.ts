import { Router } from 'express'
import { CreateProductSchema, UpdateProductSchema, ProductQuerySchema } from './products.types.js'
import * as productsService from './products.service.js'
import { authenticate, requireRole } from '../../middlewares/auth.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const query = ProductQuerySchema.parse(req.query)
    const result = await productsService.listProducts(query)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

router.get('/featured', async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 8
    const products = await productsService.getFeatured(limit)
    res.json({ success: true, data: products })
  } catch (err) {
    next(err)
  }
})

router.get('/new-arrivals', async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 12
    const products = await productsService.getNewArrivals(limit)
    res.json({ success: true, data: products })
  } catch (err) {
    next(err)
  }
})

router.get('/preorders', async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 12
    const products = await productsService.getPreorders(limit)
    res.json({ success: true, data: products })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const product = await productsService.getProduct(String(req.params.id))
    res.json({ success: true, data: product })
  } catch (err) {
    next(err)
  }
})

router.post('/', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const input = CreateProductSchema.parse(req.body)
    const product = await productsService.createProduct(input)
    res.status(201).json({ success: true, data: product })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const input = UpdateProductSchema.parse(req.body)
    const product = await productsService.updateProduct(String(req.params.id), input)
    res.json({ success: true, data: product })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await productsService.deleteProduct(String(req.params.id))
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

router.post(
  '/:id/stock',
  authenticate,
  requireRole('ADMIN', 'MANAGER', 'STAFF'),
  async (req, res, next) => {
    try {
      const { quantity, note } = req.body as { quantity: number; note?: string }
      const result = await productsService.updateStock(String(req.params.id), quantity, note)
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
)

export default router

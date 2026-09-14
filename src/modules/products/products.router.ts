import { Router } from 'express'
import { CreateProductSchema, UpdateProductSchema, ProductQuerySchema } from './products.types.js'
import * as productsService from './products.service.js'
import { authenticate, requireRole } from '../../middlewares/auth.js'
import { resolveStoreScope } from '../../lib/store-scope.js'

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
    // `?preorder=true|false` sépare les deux vitrines de la page d'accueil ;
    // absent, la sélection reste mélangée.
    const preorder =
      req.query.preorder === undefined ? undefined : req.query.preorder === 'true'
    const products = await productsService.getFeatured(limit, preorder)
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

router.post('/', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'VENDEUR'), async (req, res, next) => {
  try {
    const parsed = CreateProductSchema.parse(req.body)
    // Le stock initial d'une vendeuse atterrit dans sa boutique, pas ailleurs.
    const stockStoreId = await resolveStoreScope(req.user!, parsed.stockStoreId)
    const product = await productsService.createProduct({ ...parsed, stockStoreId })
    res.status(201).json({ success: true, data: product })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'VENDEUR'), async (req, res, next) => {
  try {
    const parsed = UpdateProductSchema.parse(req.body)
    const stockStoreId = await resolveStoreScope(req.user!, parsed.stockStoreId)
    const product = await productsService.updateProduct(
      String(req.params.id),
      { ...parsed, stockStoreId },
      req.user?.userId,
    )
    res.json({ success: true, data: product })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authenticate, requireRole('SUPER_ADMIN', 'ADMIN', 'VENDEUR'), async (req, res, next) => {
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
  requireRole('SUPER_ADMIN', 'ADMIN', 'VENDEUR'),
  async (req, res, next) => {
    try {
      const { quantity, note, storeId } = req.body as {
        quantity: number
        note?: string
        storeId?: string
      }
      // Une vendeuse ne peut mouvementer que le stock de sa boutique.
      const scoped = await resolveStoreScope(req.user!, storeId)
      const result = await productsService.updateStock(
        String(req.params.id), quantity, note, scoped,
      )
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
)

export default router

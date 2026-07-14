import { Router } from 'express'
import { CreateCategorySchema, UpdateCategorySchema } from './categories.types.js'
import * as categoriesService from './categories.service.js'
import { authenticate, requireRole } from '../../middlewares/auth.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const includeInactive = req.query.all === 'true'
    const categories = await categoriesService.listCategories(includeInactive)
    res.json({ success: true, data: categories })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const category = await categoriesService.getCategory(String(req.params.id))
    res.json({ success: true, data: category })
  } catch (err) {
    next(err)
  }
})

router.post('/', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const input = CreateCategorySchema.parse(req.body)
    const category = await categoriesService.createCategory(input)
    res.status(201).json({ success: true, data: category })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const input = UpdateCategorySchema.parse(req.body)
    const category = await categoriesService.updateCategory(String(req.params.id), input)
    res.json({ success: true, data: category })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await categoriesService.deleteCategory(String(req.params.id))
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

export default router

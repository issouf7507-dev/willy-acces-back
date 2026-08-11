import { Router } from 'express'
import { CreatePreorderSchema, UpdatePreorderSchema, PreorderQuerySchema } from './preorders.types.js'
import * as preordersService from './preorders.service.js'
import { authenticate, requireRole } from '../../middlewares/auth.js'

const router = Router()

// Public — soumission du formulaire de précommande
router.post('/', async (req, res, next) => {
  try {
    const input = CreatePreorderSchema.parse(req.body)
    const request = await preordersService.createPreorder(input)
    res.status(201).json({ success: true, data: request })
  } catch (err) {
    next(err)
  }
})

// Admin — gestion des demandes
router.get('/', authenticate, requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res, next) => {
  try {
    const query = PreorderQuerySchema.parse(req.query)
    const result = await preordersService.listPreorders(query)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', authenticate, requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res, next) => {
  try {
    const request = await preordersService.getPreorder(String(req.params.id))
    res.json({ success: true, data: request })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const input = UpdatePreorderSchema.parse(req.body)
    const request = await preordersService.updatePreorder(String(req.params.id), input)
    res.json({ success: true, data: request })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await preordersService.deletePreorder(String(req.params.id))
    res.json({ success: true, data: null })
  } catch (err) {
    next(err)
  }
})

export default router
